/**
 * Subscriber: subscription state `{ types, uuids, active }`, one FIFO queue with one pending
 * confirmation, UNSUBSCRIBE → SUBSCRIBE for changes, replay after a reconnect, and a delivery guard.
 *
 * @module websocket/subscriber
 */
import { isValidMac, normalizeMac } from '../utils/mac';
import { BaseWebSocketConnection } from './connection';
import { WebSocketSubscriptionError } from './errors';
import { classifyMessage, type WebSocketMessage, type WebSocketMessageKind } from './messages';
import {
  SubscriptionType,
  WEBSOCKET_DEFAULTS,
  WEBSOCKET_URLS,
  type SubscribeMessage,
  type SubscriberEventMap,
  type SubscriptionRequest,
  type SubscriptionResult,
  type SubscriptionState,
  type SubscriptionTypes,
  type WebSocketSubscriberConfig,
  type WsConnectionEvents,
} from './types';

const ALL_TYPES: readonly SubscriptionType[] = Object.values(SubscriptionType);
const NOT_CONNECTED = 'WebSocket not connected. Call connect() first.';

type Types = SubscriptionType[] | 'ALL';

interface Pending {
  types: Types;
  settle: (error?: WebSocketSubscriptionError) => void;
}

function copy(types: Types): Types {
  return types === 'ALL' ? 'ALL' : [...types];
}

function isSubscriptionType(value: unknown): value is SubscriptionType {
  return (ALL_TYPES as readonly unknown[]).includes(value);
}

/** Validates and deduplicates a type list (input order); `[]` means all. */
function checkTypes(list: readonly unknown[]): Types {
  const invalid = list.filter((value) => !isSubscriptionType(value));
  if (invalid.length > 0) {
    throw new WebSocketSubscriptionError(
      `Invalid subscription type(s): ${invalid.map(String).join(', ')}. Valid types: ${ALL_TYPES.join(', ')}`
    );
  }
  return list.length === 0 ? 'ALL' : [...new Set(list as SubscriptionType[])];
}

/** Validates a tag filter: non-empty strings, MAC-shaped entries normalised, deduplicated; `[]` → `null`. */
function checkUuids(uuids: unknown): string[] | null {
  if (uuids === null) return null;
  if (!Array.isArray(uuids)) {
    throw new WebSocketSubscriptionError(
      'Invalid tag filter: expected an array of strings or null'
    );
  }
  const out = new Set<string>();
  for (const entry of uuids as unknown[]) {
    if (typeof entry !== 'string' || entry === '') {
      throw new WebSocketSubscriptionError(
        'Invalid tag filter entry: every entry must be a non-empty string'
      );
    }
    out.add(isValidMac(entry) ? normalizeMac(entry) : entry);
  }
  return out.size === 0 ? null : [...out];
}

/** `{ types, uuids? }` of a request; `uuids` undefined = keep the current filter. */
function parseRequest(request: unknown): { types: Types; uuids?: string[] | null } {
  if (request === 'ALL') return { types: 'ALL' };
  if (typeof request === 'string') return { types: checkTypes([request]) };
  if (Array.isArray(request)) return { types: checkTypes(request) };
  if (typeof request === 'object' && request !== null) {
    const { types, uuids } = request as { types?: unknown; uuids?: unknown };
    const list = Array.isArray(types) ? types : [types];
    const parsedTypes = types === undefined || types === 'ALL' ? 'ALL' : checkTypes(list);
    return uuids === undefined
      ? { types: parsedTypes }
      : { types: parsedTypes, uuids: checkUuids(uuids) };
  }
  throw new WebSocketSubscriptionError(
    'Invalid subscription request: expected "ALL", a type, a type list or { types, uuids }'
  );
}

/**
 * Subscriber of the broker's `ws/subscriber` socket.
 *
 * @example
 * ```typescript
 * const subscriber = new RtlsWebSocketSubscriber({ apiKey, namespace });
 * subscriber.on('POSITIONS', (p) => console.log(p.user_uuid, p.lat, p.lon));
 * await subscriber.connect();
 * await subscriber.subscribe([SubscriptionType.POSITIONS]);
 * ```
 */
export class RtlsWebSocketSubscriber extends BaseWebSocketConnection<SubscriberEventMap> {
  private readonly mapUuid: string | undefined;
  private readonly subscriptionTimeoutMs: number;
  private types: Types | null = null;
  private uuids: string[] | null = null;
  private active = false;
  /** The current socket holds a broker registration (a SUBSCRIBE was sent, no UNSUBSCRIBE since). */
  private registered = false;
  private pending: Pending | null = null;
  private queue: Promise<void> = Promise.resolve();

  constructor(config: WebSocketSubscriberConfig) {
    super(config, config?.subscriberUrl ?? WEBSOCKET_URLS.SUBSCRIBER, 'RtlsWebSocketSubscriber');
    this.mapUuid = config.mapUuid;
    this.subscriptionTimeoutMs =
      config.subscriptionTimeoutMs ?? WEBSOCKET_DEFAULTS.SUBSCRIPTION_TIMEOUT_MS;
    this.afterOpen = () => this.replay();
    this.frameHandler = (message) => this.route(message);
    this.socketGone = (cause) => this.forgetSocket(cause);
  }

  /**
   * Subscribes (`'ALL'` by default; `[]` is a deprecated alias of `'ALL'`). On a socket that already sent
   * SUBSCRIBE, the change is sent as UNSUBSCRIBE then SUBSCRIBE. Resolves on the broker's confirmation.
   *
   * @throws {WebSocketSubscriptionError} not connected, invalid input (nothing sent), timeout, close or
   * `disconnect()` before the confirmation, send failure
   */
  async subscribe(request: SubscriptionRequest = 'ALL'): Promise<SubscriptionResult> {
    const parsed = parseRequest(request);
    if (!this.isConnected()) throw new WebSocketSubscriptionError(NOT_CONNECTED, parsed.types);
    return this.enqueue(async () => {
      const uuids = parsed.uuids === undefined ? this.uuids : parsed.uuids;
      try {
        await this.register(parsed.types, uuids);
      } catch (error) {
        // A confirmation timeout leaves the SUBSCRIBE registered on the socket (the broker may hold it):
        // the requested state is stored, so a reconnect replays it.
        if (this.registered) this.store(parsed.types, uuids);
        throw error;
      }
      this.store(parsed.types, uuids);
      return {
        success: true,
        types: copy(parsed.types),
        uuids: uuids === null ? null : [...uuids],
      };
    });
  }

  /**
   * Without `types`: UNSUBSCRIBE (delivery stops, no replay). With `types`: the remaining types are
   * re-subscribed (UNSUBSCRIBE, SUBSCRIBE); none remaining → UNSUBSCRIBE only. From `'ALL'` the remainder is the
   * explicit list of the other filter values. Not connected: only the stored state changes (the next `connect()`
   * replays it while active).
   */
  async unsubscribe(types?: SubscriptionTypes): Promise<void> {
    const removed =
      types === undefined ? ALL_TYPES : checkTypes(Array.isArray(types) ? types : [types]);
    return this.enqueue(async () => {
      if (this.types === null) return;
      const current = this.types === 'ALL' ? ALL_TYPES : this.types;
      const remaining = removed === 'ALL' ? [] : current.filter((type) => !removed.includes(type));
      const live = this.active && this.isConnected();
      if (remaining.length > 0 && live) {
        await this.register(remaining, this.uuids);
      }
      if (remaining.length > 0) {
        this.types = remaining;
        return;
      }
      this.active = false;
      if (live && this.registered)
        this.sendOrFail({ type: 'UNSUBSCRIBE', app_namespace: this.namespace });
      this.registered = false;
    });
  }

  /**
   * Replaces the tag filter (positions only). Active: FILTER_MGT (`[]` clears); inactive: stored and sent with
   * the next SUBSCRIBE. MAC-shaped entries are normalised.
   *
   * @throws {WebSocketSubscriptionError} an entry that is not a non-empty string (nothing sent), send failure
   */
  async setTagFilter(uuids: readonly string[] | null): Promise<void> {
    const filter = checkUuids(uuids);
    return this.enqueue(async () => {
      this.uuids = filter;
      if (this.active && this.registered && this.isConnected()) {
        this.sendOrFail({ type: 'FILTER_MGT', app_namespace: this.namespace, uuids: filter ?? [] });
      }
    });
  }

  /** The stored subscription; `null` before the first `subscribe()`. */
  getSubscription(): SubscriptionState | null {
    if (this.types === null) return null;
    return {
      types: copy(this.types),
      uuids: this.uuids === null ? null : [...this.uuids],
      active: this.active,
    };
  }

  /** The filter values delivered now: under `'ALL'` the five values; inactive `[]`. */
  getActiveSubscriptions(): SubscriptionType[] {
    if (!this.active || this.types === null) return [];
    return this.types === 'ALL' ? [...ALL_TYPES] : [...this.types];
  }

  // ─── Internals ──────────────────────────────────────────────────────────────

  private store(types: Types, uuids: string[] | null): void {
    this.types = types;
    this.uuids = uuids;
    this.active = true;
  }

  private async enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const previous = this.queue;
    let release!: () => void;
    this.queue = new Promise<void>((resolve) => {
      release = resolve;
    });
    try {
      await previous;
      return await operation();
    } finally {
      release();
    }
  }

  /** Sends SUBSCRIBE (after UNSUBSCRIBE when registered) and waits for the matching confirmation. */
  private async register(types: Types, uuids: string[] | null): Promise<void> {
    if (!this.isConnected()) throw new WebSocketSubscriptionError(NOT_CONNECTED, copy(types));
    const frame: SubscribeMessage = { type: 'SUBSCRIBE', app_namespace: this.namespace };
    if (types !== 'ALL') frame.data_type_filter = [...types];
    if (uuids !== null) frame.uuids = [...uuids];
    try {
      if (this.registered) {
        this.sendFrame({ type: 'UNSUBSCRIBE', app_namespace: this.namespace });
        this.registered = false;
      }
      this.sendFrame({ ...frame });
    } catch (error) {
      throw new WebSocketSubscriptionError(
        `Subscription failed: ${this.safeMessage(error)}`,
        copy(types),
        error
      );
    }
    this.registered = true;
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending = null;
        reject(new WebSocketSubscriptionError('Subscription confirmation timeout', copy(types)));
      }, this.subscriptionTimeoutMs);
      this.pending = {
        types,
        settle: (error) => {
          clearTimeout(timer);
          this.pending = null;
          if (error === undefined) resolve();
          else reject(error);
        },
      };
    });
  }

  private sendOrFail(frame: Record<string, unknown>): void {
    try {
      this.sendFrame(frame);
    } catch (error) {
      throw new WebSocketSubscriptionError(
        `Subscription change failed: ${this.safeMessage(error)}`,
        undefined,
        error
      );
    }
  }

  /**
   * Replays the stored active subscription on every new socket (a reconnect, or a manual `connect()` after
   * `disconnect()`, a drop without reconnect or `reconnect_failed`); the connection is ready when it is confirmed.
   */
  private async replay(): Promise<void> {
    if (!this.active) return;
    await this.enqueue(async () => {
      if (this.active && this.types !== null) await this.register(this.types, this.uuids);
    });
  }

  private forgetSocket(cause: 'close' | 'disconnect'): void {
    this.registered = false;
    const message =
      cause === 'disconnect'
        ? 'Disconnected before confirmation'
        : 'Connection closed before confirmation';
    const pending = this.pending;
    if (pending !== null)
      pending.settle(new WebSocketSubscriptionError(message, copy(pending.types)));
  }

  private route(message: WebSocketMessage): void {
    const kind = classifyMessage(message);
    if (kind === 'CONFIRMATION') {
      if (message.app_namespace === this.namespace) this.pending?.settle();
      return;
    }
    if (!this.delivers(kind)) return;
    const mapUuid = (message as Record<string, unknown>).map_uuid;
    if (this.mapUuid !== undefined && typeof mapUuid === 'string' && mapUuid !== this.mapUuid)
      return;
    this.emitFrame(kind === 'UNKNOWN' ? 'unknown' : kind, message);
  }

  /**
   * Emits a routed frame on the event of its kind. `classifyMessage` chose the kind from the frame itself, so the
   * frame has that event's shape; TypeScript cannot correlate the two, the implementation signature states it.
   */
  private emitFrame(
    event: Exclude<keyof SubscriberEventMap, keyof WsConnectionEvents>,
    message: WebSocketMessage
  ): void;
  private emitFrame<K extends keyof SubscriberEventMap>(
    event: K,
    message: SubscriberEventMap[K]
  ): void {
    this.emit(event, message);
  }

  /** Typed events only for kinds the current state can deliver; `unknown` only under `'ALL'`. */
  private delivers(kind: WebSocketMessageKind): boolean {
    if (!this.active || this.types === null) return false;
    return this.types === 'ALL' || (this.types as readonly string[]).includes(kind);
  }
}
