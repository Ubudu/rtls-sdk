/**
 * Connection lifecycle shared by the subscriber and the publisher: credentials and providers,
 * query or header auth, implementation resolution, one settle path per attempt, handshake auth detection,
 * reconnection with full jitter, keepalive, the `afterOpen` hook, the optional `frameHandler`, and redacted logging.
 *
 * @module websocket/connection
 * @internal
 */
import { ContextError } from '../errors';
import {
  WebSocketAuthenticationError,
  WebSocketConnectionError,
  WebSocketError,
  WebSocketSendError,
} from './errors';
import { DebugLogger, TypedEventEmitter } from './events';
import type { WebSocketMessage } from './messages';
import {
  READY_STATE,
  decodeFrame,
  handshakeStatus,
  isWsLike,
  redactSecrets,
  redactUrl,
  resolveWebSocketImpl,
} from './runtime';
import {
  WEBSOCKET_DEFAULTS,
  WS_CLOSE_CODES,
  type ConnectionState,
  type ConnectionStatus,
  type WebSocketBaseConfig,
  type WebSocketConstructorLike,
  type WebSocketLike,
  type WsConnectionEvents,
  type WsCredential,
} from './types';

/** How long `disconnect()` waits for the close echo before it terminates the socket. */
const CLOSE_WAIT_MS = 3000;
const URL_PATTERN = /\b(?:wss?|https?):\/\/[^\s"'<>]+/g;

interface ReconnectPolicy {
  initialDelayMs: number;
  maxDelayMs: number;
  multiplier: number;
  jitter: 'full' | 'none';
  maxAttempts: number;
  retryInitialConnect: boolean;
}

interface Settings {
  apiKey: WsCredential | undefined;
  token: WsCredential | undefined;
  header: boolean;
  impl: WebSocketConstructorLike | undefined;
  connectionTimeout: number;
  keepAliveIntervalMs: number;
  pongTimeoutMs: number;
}

interface Waiter {
  promise: Promise<void>;
  settle: (error?: WebSocketError) => void;
}

interface CloseWaiter {
  socket: WebSocketLike;
  done: (code: number, reason: string) => void;
}

function waiter(): Waiter {
  let settle!: Waiter['settle'];
  const promise = new Promise<void>((resolve, reject) => {
    settle = (error) => (error === undefined ? resolve() : reject(error));
  });
  return { promise, settle };
}

/** `error` when it is a WebSocketError, else a WebSocketConnectionError with `message` and `error` as cause. */
function asWsError(error: unknown, message: string): WebSocketError {
  return error instanceof WebSocketError ? error : new WebSocketConnectionError(message, error);
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Base class of `RtlsWebSocketSubscriber` and `RtlsWebSocketPublisher`.
 */
export abstract class BaseWebSocketConnection<
  TEvents extends WsConnectionEvents,
> extends TypedEventEmitter<TEvents> {
  /** The namespace this socket is bound to. */
  protected readonly namespace: string;
  /** Redacting logger. */
  protected readonly logger: DebugLogger;
  /** Runs after every open; the connection is ready when it resolves (subscriber: replay). */
  protected afterOpen?: (isReconnect: boolean) => Promise<void>;
  /** Receives every parsed frame after the `message` event (subscriber: routing). */
  protected frameHandler?: (message: WebSocketMessage) => void;
  /** Called when the socket is gone: closed after open, or `disconnect()`. */
  protected socketGone?: (cause: 'close' | 'disconnect') => void;

  private readonly url: string;
  private readonly settings: Settings;
  private readonly policy: ReconnectPolicy | null;
  private readonly secrets = new Set<string>();
  private socket: WebSocketLike | null = null;
  private opened = false;
  private lastErrorEvent: unknown;
  private state: ConnectionState = 'DISCONNECTED';
  private attempts = 0;
  private attemptId = 0;
  private reconnectCycle = false;
  private pendingConnect: Waiter | null = null;
  private closing: Promise<void> | null = null;
  private closeWaiter: CloseWaiter | null = null;
  private connectTimer: ReturnType<typeof setTimeout> | undefined;
  private reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  private keepAliveTimer: ReturnType<typeof setInterval> | undefined;
  private pongTimer: ReturnType<typeof setTimeout> | undefined;
  private connectedAt: Date | undefined;
  private lastMessageAt: Date | undefined;
  private lastPongAt: Date | undefined;

  protected constructor(config: WebSocketBaseConfig, url: string, name: string) {
    super();
    if (typeof config?.namespace !== 'string' || config.namespace === '') {
      throw new ContextError('Namespace', 'Pass { namespace } in the WebSocket config');
    }
    if (!config.apiKey && !config.token) {
      throw new WebSocketAuthenticationError(
        'Either apiKey or token is required for WebSocket authentication',
        0
      );
    }
    this.namespace = config.namespace;
    this.url = url;
    for (const value of [config.apiKey, config.token]) {
      if (typeof value === 'string') this.secrets.add(value);
    }
    this.logger = new DebugLogger(name, config.debug === true, (text) => this.redact(text));
    this.settings = {
      apiKey: config.apiKey,
      token: config.token,
      header: config.authTransport === 'header',
      impl: config.WebSocket,
      connectionTimeout: config.connectionTimeout ?? WEBSOCKET_DEFAULTS.CONNECTION_TIMEOUT_MS,
      keepAliveIntervalMs: config.keepAliveIntervalMs ?? WEBSOCKET_DEFAULTS.KEEPALIVE_INTERVAL_MS,
      pongTimeoutMs: config.pongTimeoutMs ?? WEBSOCKET_DEFAULTS.PONG_TIMEOUT_MS,
    };
    const deprecated = ['reconnectInterval', 'maxReconnectAttempts'].filter(
      (key) => config[key as keyof WebSocketBaseConfig] !== undefined
    );
    if (deprecated.length > 0) {
      this.logger.warn(
        `Deprecated option(s) ${deprecated.join(', ')}: use reconnect.initialDelayMs / reconnect.maxAttempts`
      );
    }
    const reconnect = config.reconnect === false ? null : (config.reconnect ?? {});
    this.policy =
      reconnect === null
        ? null
        : {
            initialDelayMs:
              reconnect.initialDelayMs ??
              config.reconnectInterval ??
              WEBSOCKET_DEFAULTS.RECONNECT_INTERVAL_MS,
            maxDelayMs: reconnect.maxDelayMs ?? WEBSOCKET_DEFAULTS.MAX_RECONNECT_DELAY_MS,
            multiplier: reconnect.multiplier ?? 2,
            jitter: reconnect.jitter ?? 'full',
            maxAttempts:
              reconnect.maxAttempts ??
              config.maxReconnectAttempts ??
              WEBSOCKET_DEFAULTS.MAX_RECONNECT_ATTEMPTS,
            retryInitialConnect: reconnect.retryInitialConnect ?? false,
          };
  }

  /**
   * Opens the connection. Resolves when the socket is open (and, on a reconnect, the subscription replayed);
   * resolves at once while open; shares the pending attempt while connecting.
   *
   * @throws {WebSocketAuthenticationError} the handshake was refused (401/403) or the credential provider failed
   * @throws {WebSocketConnectionError} timeout, connection error, `disconnect()`, or retries exhausted
   */
  async connect(): Promise<void> {
    if (this.closing !== null) await this.closing;
    if (this.state === 'CONNECTED' && this.pendingConnect === null) return;
    this.pendingConnect ??= waiter();
    const pending = this.pendingConnect.promise;
    if (this.reconnectTimer !== undefined) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
      this.startAttempt();
    } else if (this.state === 'DISCONNECTED') {
      this.attempts = 0;
      this.reconnectCycle = false;
      this.startAttempt();
    }
    return pending;
  }

  /**
   * Closes the connection and stops reconnecting. An open socket is closed with 1000 and the close echo is
   * awaited for up to 3 s (then terminated); a pending `connect()` rejects.
   */
  async disconnect(): Promise<void> {
    if (this.closing !== null) return this.closing;
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = undefined;
    this.attemptId += 1;
    const socket = this.socket;
    const wasOpen = this.opened && socket?.readyState === READY_STATE.OPEN;
    this.teardown();
    this.reconnectCycle = false;
    this.attempts = 0;
    this.socketGone?.('disconnect');
    this.settleConnect(new WebSocketConnectionError('Connection aborted by disconnect()'));
    if (socket === null || !wasOpen) {
      if (socket !== null) this.closeQuietly(socket);
      this.state = 'DISCONNECTED';
      return;
    }
    this.state = 'CLOSING';
    this.closing = this.closeOpenSocket(socket);
    try {
      await this.closing;
    } finally {
      this.closing = null;
    }
  }

  /** `true` while the socket is open. */
  isConnected(): boolean {
    return this.state === 'CONNECTED' && this.socket?.readyState === READY_STATE.OPEN;
  }

  /** The connection state. */
  getState(): ConnectionState {
    return this.state;
  }

  /** A status snapshot. */
  getConnectionStatus(): ConnectionStatus {
    const status: ConnectionStatus = { state: this.state, reconnectAttempts: this.attempts };
    if (this.connectedAt !== undefined) status.connectedAt = this.connectedAt;
    if (this.lastMessageAt !== undefined) status.lastMessageAt = this.lastMessageAt;
    if (this.lastPongAt !== undefined) status.lastPongAt = this.lastPongAt;
    return status;
  }

  /**
   * Sends one JSON frame on the open socket.
   *
   * @throws {WebSocketSendError} not connected, or the socket refused the frame
   */
  protected sendFrame(frame: Record<string, unknown>): void {
    const socket = this.socket;
    const open = socket !== null && this.opened && socket.readyState === READY_STATE.OPEN;
    if (!open) throw new WebSocketSendError('WebSocket not connected', frame);
    try {
      socket.send(JSON.stringify(frame));
    } catch (error) {
      throw new WebSocketSendError(`Send failed: ${this.safeMessage(error)}`, frame, error);
    }
    this.logger.log(`Sent ${String(frame.type ?? 'frame')}`);
  }

  /** An error message without URLs or credentials. */
  protected safeMessage(error: unknown): string {
    return this.redact(messageOf(error)).replace(URL_PATTERN, '<url>');
  }

  private redact(text: string): string {
    return redactSecrets(text, [...this.secrets]);
  }

  /**
   * Emits a shared connection event. The subclasses' event maps extend `WsConnectionEvents` without narrowing its
   * payloads, which TypeScript cannot relate to a generic `TEvents[K]`; the implementation signature states it.
   */
  private emitEvent<K extends keyof WsConnectionEvents>(
    event: K,
    data: WsConnectionEvents[K]
  ): void;
  private emitEvent<K extends keyof TEvents>(event: K, data: TEvents[K]): void {
    this.emit(event, data);
  }

  private settleConnect(error?: WebSocketError): void {
    const pending = this.pendingConnect;
    this.pendingConnect = null;
    pending?.settle(error);
  }

  // ─── Attempts ───────────────────────────────────────────────────────────────

  private startAttempt(): void {
    const id = ++this.attemptId;
    this.state = this.reconnectCycle || this.attempts > 0 ? 'RECONNECTING' : 'CONNECTING';
    this.connectTimer = setTimeout(() => this.attemptTimedOut(id), this.settings.connectionTimeout);
    void this.open(id);
  }

  private async open(id: number): Promise<void> {
    let credential: { kind: 'token' | 'apiKey'; value: string };
    try {
      credential = await this.credential();
    } catch (error) {
      // A provider failure rejects the first connect(); in a reconnect cycle it is one failed attempt, so a
      // transient credential-service outage does not end reconnection (maxAttempts still applies).
      if (id === this.attemptId)
        this.attemptFailed(asWsError(error, 'Credential provider failed'), !this.reconnectCycle);
      return;
    }
    let socket: WebSocketLike;
    try {
      const impl = await resolveWebSocketImpl(this.settings.impl);
      if (id !== this.attemptId) return;
      if (this.settings.header && !isWsLike(impl)) {
        throw new WebSocketConnectionError(
          'authTransport "header" needs a ws-like WebSocket implementation (Node "ws"); use authTransport "query"'
        );
      }
      const url = new URL(this.url);
      this.logger.log(`Connecting to ${redactUrl(this.url)}`);
      if (this.settings.header && isWsLike(impl)) {
        const headers: Record<string, string> =
          credential.kind === 'token'
            ? { Authorization: `Bearer ${credential.value}` }
            : { 'X-API-Key': credential.value };
        socket = new impl(url.toString(), { headers });
      } else {
        url.searchParams.set(credential.kind, credential.value);
        socket = new impl(url.toString());
      }
    } catch (error) {
      if (id !== this.attemptId) return;
      this.attemptFailed(
        asWsError(error, `Failed to create WebSocket: ${this.safeMessage(error)}`),
        true
      );
      return;
    }
    this.socket = socket;
    this.opened = false;
    this.lastErrorEvent = undefined;
    socket.onopen = () => this.handleOpen(socket);
    socket.onerror = (event: unknown) => this.handleError(socket, event);
    socket.onclose = (event: { code: number; reason: string }) => this.handleClose(socket, event);
    socket.onmessage = (event: { data: unknown }) => this.handleFrame(socket, event.data);
  }

  private async credential(): Promise<{ kind: 'token' | 'apiKey'; value: string }> {
    const kind = this.settings.token ? 'token' : 'apiKey';
    const source = kind === 'token' ? this.settings.token : this.settings.apiKey;
    let value: unknown;
    try {
      value = typeof source === 'function' ? await source() : source;
      if (typeof value !== 'string' || value === '') throw new Error('no credential returned');
    } catch (error) {
      throw new WebSocketAuthenticationError(
        `Credential provider failed: ${this.safeMessage(error)}`,
        0,
        error
      );
    }
    this.secrets.add(value);
    return { kind, value };
  }

  private attemptTimedOut(id: number): void {
    if (id === this.attemptId)
      this.attemptFailed(new WebSocketConnectionError('Connection timeout'), false);
  }

  /** Every failure before open ends here: next attempt when retry is active, else reject `connect()`. */
  private attemptFailed(error: WebSocketError, terminal: boolean): void {
    const socket = this.socket;
    this.attemptId += 1;
    this.teardown();
    if (socket !== null) this.closeQuietly(socket);
    this.logger.log(`Connection attempt failed: ${error.message}`);
    this.emitEvent('error', { error, timestamp: new Date() });
    const policy = this.policy;
    if (!terminal && policy !== null && (this.reconnectCycle || policy.retryInitialConnect)) {
      this.scheduleReconnect(policy, error);
      return;
    }
    // A terminal failure (handshake 401/403) inside a reconnect cycle ends the cycle: reconnect_failed tells
    // listeners that reconnection stopped.
    const cycle = this.reconnectCycle;
    const attempts = this.attempts;
    this.state = 'DISCONNECTED';
    this.reconnectCycle = false;
    this.attempts = 0;
    if (cycle) this.emitEvent('reconnect_failed', { attempts, error, timestamp: new Date() });
    this.settleConnect(error);
  }

  private scheduleReconnect(policy: ReconnectPolicy, lastError: WebSocketError): void {
    if (this.attempts >= policy.maxAttempts) {
      const attempts = this.attempts;
      const error = new WebSocketConnectionError(
        `Max reconnection attempts (${attempts}) reached`,
        lastError
      );
      this.state = 'DISCONNECTED';
      this.reconnectCycle = false;
      this.attempts = 0;
      this.emitEvent('reconnect_failed', { attempts, error, timestamp: new Date() });
      this.settleConnect(error);
      return;
    }
    const ceiling = Math.min(
      policy.maxDelayMs,
      policy.initialDelayMs * policy.multiplier ** this.attempts
    );
    const delay = Math.floor(policy.jitter === 'full' ? Math.random() * ceiling : ceiling);
    this.attempts += 1;
    this.state = 'RECONNECTING';
    this.emitEvent('reconnecting', { attempt: this.attempts, delay, timestamp: new Date() });
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      this.startAttempt();
    }, delay);
  }

  // ─── Socket events ──────────────────────────────────────────────────────────

  private handleOpen(socket: WebSocketLike): void {
    if (socket !== this.socket) return;
    clearTimeout(this.connectTimer);
    this.connectTimer = undefined;
    this.opened = true;
    this.state = 'CONNECTED';
    this.connectedAt = new Date();
    const isReconnect = this.reconnectCycle;
    const attempt = this.attempts;
    this.logger.log('Connected');
    this.startKeepAlive(socket);
    this.emitEvent('connected', { timestamp: this.connectedAt });
    void this.finishOpen(socket, isReconnect, attempt);
  }

  private async finishOpen(
    socket: WebSocketLike,
    isReconnect: boolean,
    attempt: number
  ): Promise<void> {
    try {
      await this.afterOpen?.(isReconnect);
    } catch (error) {
      if (socket !== this.socket) return;
      this.emitEvent('error', {
        error: asWsError(error, this.safeMessage(error)),
        timestamp: new Date(),
      });
      this.forceDrop(socket, 'Subscription replay failed');
      return;
    }
    if (socket !== this.socket) return;
    this.attempts = 0;
    this.reconnectCycle = false;
    if (isReconnect) this.emitEvent('reconnected', { attempt, timestamp: new Date() });
    this.settleConnect();
  }

  private handleError(socket: WebSocketLike, event: unknown): void {
    if (socket === this.socket) this.lastErrorEvent = event;
    this.logger.log('WebSocket error event');
  }

  private handleClose(socket: WebSocketLike, event: { code: number; reason: string }): void {
    if (this.closeWaiter?.socket === socket) {
      this.closeWaiter.done(event.code, event.reason);
      return;
    }
    if (socket !== this.socket) return;
    if (!this.opened) {
      const status = handshakeStatus(this.lastErrorEvent);
      const refused = status === 401 || status === 403;
      const error = refused
        ? new WebSocketAuthenticationError(
            `WebSocket authentication failed (HTTP ${status})`,
            status
          )
        : new WebSocketConnectionError('WebSocket connection error', undefined, status);
      this.attemptFailed(error, refused);
      return;
    }
    this.teardown();
    this.dropped(event.code, event.reason);
  }

  private handleFrame(socket: WebSocketLike, data: unknown): void {
    if (socket !== this.socket) return;
    this.lastMessageAt = new Date();
    let message: WebSocketMessage;
    try {
      const parsed: unknown = JSON.parse(decodeFrame(data) ?? '');
      if (!isRecord(parsed)) throw new SyntaxError('not a JSON object');
      message = parsed;
    } catch (error) {
      this.logger.print('error', `Dropped a frame that is not a JSON object: ${messageOf(error)}`);
      return;
    }
    this.emitEvent('message', message);
    this.frameHandler?.(message);
  }

  /** A close after open that `disconnect()` did not start (any code, 1000 included). */
  private dropped(code: number, reason: string): void {
    const policy = this.policy;
    this.state = policy === null ? 'DISCONNECTED' : 'RECONNECTING';
    this.logger.log(`Connection closed (${code})`);
    this.socketGone?.('close');
    this.emitEvent('disconnected', {
      code,
      reason,
      timestamp: new Date(),
      // false when the reconnect policy is off or its attempts are already used up (reconnect_failed follows)
      willReconnect: policy !== null && this.attempts < policy.maxAttempts,
    });
    const error = new WebSocketConnectionError(`Connection closed (${code})`);
    if (policy === null) {
      this.settleConnect(error);
      return;
    }
    this.reconnectCycle = true;
    this.scheduleReconnect(policy, error);
  }

  /** Closes an open socket on the SDK's initiative (replay failure, keepalive timeout) and reconnects. */
  private forceDrop(socket: WebSocketLike, reason: string): void {
    this.teardown();
    this.closeQuietly(socket);
    this.dropped(WS_CLOSE_CODES.ABNORMAL_CLOSURE, reason);
  }

  private async closeOpenSocket(socket: WebSocketLike): Promise<void> {
    const { code, reason } = await new Promise<{ code: number; reason: string }>((resolve) => {
      const timer = setTimeout(() => {
        this.closeWaiter = null;
        socket.terminate?.();
        resolve({ code: WS_CLOSE_CODES.ABNORMAL_CLOSURE, reason: 'Close timeout' });
      }, CLOSE_WAIT_MS);
      this.closeWaiter = {
        socket,
        done: (closeCode, closeReason) => {
          clearTimeout(timer);
          this.closeWaiter = null;
          resolve({ code: closeCode, reason: closeReason });
        },
      };
      socket.close(WS_CLOSE_CODES.NORMAL_CLOSURE, 'Client disconnect');
    });
    this.state = 'DISCONNECTED';
    this.logger.log(`Disconnected (${code})`);
    this.emitEvent('disconnected', { code, reason, timestamp: new Date(), willReconnect: false });
  }

  /** Forgets the current socket and stops its timers (its handlers then ignore it). */
  private teardown(): void {
    this.socket = null;
    this.opened = false;
    this.connectedAt = undefined;
    clearTimeout(this.connectTimer);
    clearInterval(this.keepAliveTimer);
    clearTimeout(this.pongTimer);
    this.connectTimer = undefined;
    this.keepAliveTimer = undefined;
    this.pongTimer = undefined;
  }

  private closeQuietly(socket: WebSocketLike): void {
    if (socket.readyState === READY_STATE.CLOSED || socket.readyState === READY_STATE.CLOSING)
      return;
    if (typeof socket.terminate === 'function') socket.terminate();
    else socket.close();
  }

  // ─── Keepalive ──────────────────────────────────────────────────────────────

  private startKeepAlive(socket: WebSocketLike): void {
    const interval = this.settings.keepAliveIntervalMs;
    if (!(interval > 0) || typeof socket.ping !== 'function' || typeof socket.on !== 'function')
      return;
    socket.on('pong', () => this.handlePong(socket));
    this.keepAliveTimer = setInterval(() => this.sendPing(socket), interval);
  }

  private sendPing(socket: WebSocketLike): void {
    socket.ping?.();
    this.pongTimer ??= setTimeout(
      () => this.keepAliveTimedOut(socket),
      this.settings.pongTimeoutMs
    );
  }

  private handlePong(socket: WebSocketLike): void {
    if (socket !== this.socket) return;
    this.lastPongAt = new Date();
    clearTimeout(this.pongTimer);
    this.pongTimer = undefined;
  }

  private keepAliveTimedOut(socket: WebSocketLike): void {
    const error = new WebSocketConnectionError('Keepalive timeout');
    this.logger.log('Keepalive timeout');
    this.emitEvent('error', { error, timestamp: new Date() });
    this.forceDrop(socket, 'Keepalive timeout');
  }
}
