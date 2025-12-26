/**
 * Base WebSocket Connection Class
 *
 * This module provides the base connection management for WebSocket clients,
 * including connection lifecycle, reconnection with exponential backoff,
 * and authentication handling.
 */

import { TypedEventEmitter, DebugLogger } from './events';
import {
  type ConnectionState,
  type WebSocketBaseConfig,
  type ConnectionEventData,
  type DisconnectionEventData,
  type ErrorEventData,
  type ReconnectionEventData,
  type WebSocketMessage,
  type ConnectionStatus,
  type ReconnectionStrategy,
  WEBSOCKET_DEFAULTS,
  WS_CLOSE_CODES,
  WebSocketConnectionError,
  WebSocketAuthenticationError,
  calculateReconnectDelay,
  DEFAULT_RECONNECTION_STRATEGY,
} from './types';

/** Base events shared by all WebSocket clients */
export interface BaseWebSocketEvents {
  connected: ConnectionEventData;
  disconnected: DisconnectionEventData;
  reconnecting: ReconnectionEventData;
  error: ErrorEventData;
  message: WebSocketMessage;
}

/** Internal configuration with defaults applied */
interface ResolvedConfig {
  apiKey: string;
  token: string;
  namespace: string;
  debug: boolean;
  reconnectInterval: number;
  maxReconnectAttempts: number;
  connectionTimeout: number;
}

/**
 * Base WebSocket connection manager
 * Handles connection lifecycle, reconnection, and authentication
 */
export abstract class BaseWebSocketConnection<
  TEvents extends BaseWebSocketEvents = BaseWebSocketEvents
> extends TypedEventEmitter<TEvents> {
  protected ws: WebSocket | null = null;
  protected config: ResolvedConfig;
  protected state: ConnectionState = 'DISCONNECTED';
  protected reconnectAttempts = 0;
  protected reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  protected connectionPromise: Promise<void> | null = null;
  protected connectedAt: Date | null = null;
  protected logger: DebugLogger;
  protected baseUrl: string;
  protected reconnectionStrategy: ReconnectionStrategy;

  constructor(config: WebSocketBaseConfig, baseUrl: string) {
    super();

    // Validate auth
    if (!config.apiKey && !config.token) {
      throw new Error('Either apiKey or token is required for WebSocket authentication');
    }

    if (!config.namespace) {
      throw new Error('namespace is required');
    }

    this.baseUrl = baseUrl;
    this.config = {
      apiKey: config.apiKey ?? '',
      token: config.token ?? '',
      namespace: config.namespace,
      debug: config.debug ?? false,
      reconnectInterval: config.reconnectInterval ?? WEBSOCKET_DEFAULTS.RECONNECT_INTERVAL_MS,
      maxReconnectAttempts: config.maxReconnectAttempts ?? WEBSOCKET_DEFAULTS.MAX_RECONNECT_ATTEMPTS,
      connectionTimeout: config.connectionTimeout ?? WEBSOCKET_DEFAULTS.CONNECTION_TIMEOUT_MS,
    };

    this.logger = new DebugLogger(this.constructor.name, this.config.debug);

    this.reconnectionStrategy = {
      ...DEFAULT_RECONNECTION_STRATEGY,
      baseInterval: this.config.reconnectInterval,
      maxAttempts: this.config.maxReconnectAttempts,
    };
  }

  /**
   * Build the WebSocket URL with authentication query parameters
   */
  protected buildUrl(): string {
    const url = new URL(this.baseUrl);

    if (this.config.token) {
      url.searchParams.set('token', this.config.token);
    } else if (this.config.apiKey) {
      url.searchParams.set('apiKey', this.config.apiKey);
    }

    return url.toString();
  }

  /**
   * Log a debug message if debug mode is enabled
   */
  protected debug(message: string, data?: unknown): void {
    this.logger.log(message, data);
  }

  /**
   * Connect to the WebSocket server
   */
  async connect(): Promise<void> {
    // Already connected
    if (this.state === 'CONNECTED' && this.ws?.readyState === WebSocket.OPEN) {
      this.debug('Already connected');
      return;
    }

    // Connection in progress
    if (this.connectionPromise) {
      this.debug('Connection already in progress');
      return this.connectionPromise;
    }

    this.connectionPromise = this.createConnection();

    try {
      await this.connectionPromise;
    } finally {
      this.connectionPromise = null;
    }
  }

  /**
   * Create a new WebSocket connection
   */
  private createConnection(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.state = 'CONNECTING';
      const url = this.buildUrl();

      this.debug(`Connecting to ${this.baseUrl}`);

      // Clean up existing connection
      this.cleanupWebSocket();

      // Create WebSocket
      // Note: In browser, use native WebSocket
      // In Node.js, the 'ws' package is needed (peer dependency)
      try {
        if (typeof WebSocket !== 'undefined') {
          this.ws = new WebSocket(url);
        } else {
          // Node.js environment - require ws package
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          const WebSocketNode = require('ws');
          this.ws = new WebSocketNode(url, {
            handshakeTimeout: this.config.connectionTimeout,
          }) as WebSocket;
        }
      } catch (error) {
        this.state = 'DISCONNECTED';
        reject(new WebSocketConnectionError('Failed to create WebSocket', error as Error));
        return;
      }

      // Connection timeout
      const timeout = setTimeout(() => {
        if (this.state === 'CONNECTING') {
          this.cleanupWebSocket();
          const error = new WebSocketConnectionError('Connection timeout');
          this.state = 'DISCONNECTED';
          reject(error);
        }
      }, this.config.connectionTimeout);

      // Handle open
      this.ws.onopen = () => {
        clearTimeout(timeout);
        this.state = 'CONNECTED';
        this.reconnectAttempts = 0;
        this.connectedAt = new Date();

        this.debug('Connected successfully');
        this.emit('connected' as keyof TEvents, { timestamp: this.connectedAt } as TEvents[keyof TEvents]);

        resolve();
      };

      // Handle messages
      this.ws.onmessage = (event: MessageEvent) => {
        try {
          const data = typeof event.data === 'string'
            ? JSON.parse(event.data)
            : event.data;

          this.debug('Message received:', data);
          this.handleMessage(data);
        } catch (error) {
          this.logger.error('Error parsing WebSocket message', error);
        }
      };

      // Handle errors
      this.ws.onerror = (event: Event) => {
        clearTimeout(timeout);

        // Check for authentication errors (usually indicated by immediate close after error)
        const error = new WebSocketConnectionError('WebSocket connection error');
        this.debug('Connection error', event);

        this.emit('error' as keyof TEvents, {
          error,
          timestamp: new Date()
        } as TEvents[keyof TEvents]);

        if (this.state === 'CONNECTING') {
          reject(error);
        }
      };

      // Handle close
      this.ws.onclose = (event: CloseEvent) => {
        clearTimeout(timeout);
        const wasConnected = this.state === 'CONNECTED';
        const wasConnecting = this.state === 'CONNECTING';

        this.state = 'DISCONNECTED';
        this.connectedAt = null;

        this.debug(`Connection closed. Code: ${event.code}, Reason: ${event.reason || 'No reason provided'}`);

        // Check for authentication failure
        if (event.code === 4001 || event.code === 4003 || event.code === 401 || event.code === 403) {
          const authError = new WebSocketAuthenticationError(
            event.reason || 'Authentication failed',
            event.code
          );
          this.emit('error' as keyof TEvents, {
            error: authError,
            timestamp: new Date()
          } as TEvents[keyof TEvents]);

          if (wasConnecting) {
            reject(authError);
            return;
          }
        }

        this.emit('disconnected' as keyof TEvents, {
          code: event.code,
          reason: event.reason || '',
          timestamp: new Date()
        } as TEvents[keyof TEvents]);

        // Attempt reconnection if was connected (not on initial connection failure or explicit disconnect)
        if (wasConnected && event.code !== WS_CLOSE_CODES.NORMAL_CLOSURE) {
          this.scheduleReconnect();
        }
      };
    });
  }

  /**
   * Clean up the WebSocket instance
   */
  private cleanupWebSocket(): void {
    if (this.ws) {
      // Remove handlers to prevent callbacks
      this.ws.onopen = null;
      this.ws.onclose = null;
      this.ws.onerror = null;
      this.ws.onmessage = null;

      try {
        if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
          this.ws.close();
        }
      } catch {
        // Ignore close errors
      }

      this.ws = null;
    }
  }

  /**
   * Handle incoming message - to be implemented by subclasses
   */
  protected abstract handleMessage(data: WebSocketMessage): void;

  /**
   * Schedule a reconnection attempt
   */
  protected scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.config.maxReconnectAttempts) {
      this.debug(`Max reconnection attempts (${this.config.maxReconnectAttempts}) reached`);
      this.emit('error' as keyof TEvents, {
        error: new WebSocketConnectionError(`Max reconnection attempts (${this.config.maxReconnectAttempts}) reached`),
        timestamp: new Date()
      } as TEvents[keyof TEvents]);
      return;
    }

    // Calculate delay using exponential backoff
    const delay = calculateReconnectDelay(this.reconnectAttempts, this.reconnectionStrategy);

    this.reconnectAttempts++;
    this.state = 'RECONNECTING';

    this.debug(`Scheduling reconnection in ${delay}ms (attempt ${this.reconnectAttempts})`);

    this.emit('reconnecting' as keyof TEvents, {
      attempt: this.reconnectAttempts,
      delay,
      timestamp: new Date()
    } as TEvents[keyof TEvents]);

    this.reconnectTimer = setTimeout(async () => {
      try {
        await this.connect();
        this.onReconnected();
      } catch (error) {
        this.debug('Reconnection failed', error);
        this.scheduleReconnect();
      }
    }, delay);
  }

  /**
   * Hook called after successful reconnection
   * Override in subclasses to re-subscribe etc.
   */
  protected onReconnected(): void {
    this.debug('Reconnected successfully');
    // Override in subclasses
  }

  /**
   * Send data over the WebSocket connection
   */
  protected send(data: unknown): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new WebSocketConnectionError('WebSocket is not connected');
    }

    const message = typeof data === 'string' ? data : JSON.stringify(data);
    this.debug('Sending:', data);
    this.ws.send(message);
  }

  /**
   * Get current connection status
   */
  getConnectionStatus(): ConnectionStatus {
    return {
      state: this.state,
      connectedAt: this.connectedAt ?? undefined,
      reconnectAttempts: this.reconnectAttempts,
    };
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.state === 'CONNECTED' && this.ws?.readyState === WebSocket.OPEN;
  }

  /**
   * Get the current connection state
   */
  getState(): ConnectionState {
    return this.state;
  }

  /**
   * Disconnect from the WebSocket server
   */
  async disconnect(): Promise<void> {
    // Clear reconnect timer
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    // No connection to close
    if (!this.ws) {
      this.state = 'DISCONNECTED';
      return;
    }

    // Already closing or closed
    if (this.ws.readyState === WebSocket.CLOSED || this.ws.readyState === WebSocket.CLOSING) {
      this.state = 'DISCONNECTED';
      this.ws = null;
      return;
    }

    return new Promise<void>((resolve) => {
      this.state = 'CLOSING';

      // Timeout for close to complete
      const closeTimeout = setTimeout(() => {
        this.cleanupWebSocket();
        this.state = 'DISCONNECTED';
        resolve();
      }, 3000);

      // Wait for close event
      const originalOnClose = this.ws!.onclose;
      this.ws!.onclose = (event: CloseEvent) => {
        clearTimeout(closeTimeout);
        if (originalOnClose) {
          (originalOnClose as (event: CloseEvent) => void).call(this.ws, event);
        }
        this.ws = null;
        this.state = 'DISCONNECTED';
        resolve();
      };

      // Initiate close
      try {
        this.ws!.close(WS_CLOSE_CODES.NORMAL_CLOSURE, 'Client disconnect');
      } catch {
        clearTimeout(closeTimeout);
        this.cleanupWebSocket();
        this.state = 'DISCONNECTED';
        resolve();
      }
    });
  }

  /**
   * Get the namespace from configuration
   */
  protected getNamespace(): string {
    return this.config.namespace;
  }
}
