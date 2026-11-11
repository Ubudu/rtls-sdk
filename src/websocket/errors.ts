/**
 * WebSocket error classes. Every class extends the SDK's `StreamError` (→ `RtlsError`); `code` is the SDK
 * class code, `reason` the `StreamError` reason, `status` the HTTP status of a failed handshake (0 otherwise), and
 * `closeCode` / `closeReason` describe the close that caused the error, when there was one.
 *
 * @module websocket/errors
 */
import { StreamError, type StreamErrorReason } from '../errors';
import type { SubscriptionType } from './types';

/** Fields of a {@link WebSocketError}. */
export interface WebSocketErrorInit {
  /** Default `'network'`. */
  reason?: StreamErrorReason;
  /** HTTP status of the handshake; default 0. */
  status?: number;
  cause?: unknown;
  closeCode?: number;
  closeReason?: string;
  /** SDK class code; default `'WEBSOCKET_ERROR'`. */
  code?: string;
}

/** Base class of the WebSocket errors. */
export class WebSocketError extends StreamError {
  /** Close code of the close that caused the error. */
  declare readonly closeCode?: number;
  /** Close reason of the close that caused the error. */
  declare readonly closeReason?: string;

  constructor(message: string, init: WebSocketErrorInit = {}) {
    super(message, {
      reason: init.reason ?? 'network',
      status: init.status ?? 0,
      cause: init.cause,
      code: init.code ?? 'WEBSOCKET_ERROR',
    });
    this.name = 'WebSocketError';
    if (init.closeCode !== undefined) this.closeCode = init.closeCode;
    if (init.closeReason !== undefined) this.closeReason = init.closeReason;
  }
}

/** The connection could not be opened or was lost. `reason` is `'idle_timeout'` for a keepalive timeout. */
export class WebSocketConnectionError extends WebSocketError {
  constructor(message: string, cause?: unknown, status?: number) {
    super(message, {
      reason: message === 'Keepalive timeout' ? 'idle_timeout' : 'network',
      status,
      cause,
      code: 'WEBSOCKET_CONNECTION_ERROR',
    });
    this.name = 'WebSocketConnectionError';
  }
}

/** The credential is missing or was refused at the handshake (`status` 401/403; 0 for client-side checks). */
export class WebSocketAuthenticationError extends WebSocketError {
  constructor(message = 'WebSocket authentication failed', status?: number, cause?: unknown) {
    super(message, { reason: 'protocol', status, cause, code: 'WEBSOCKET_AUTHENTICATION_ERROR' });
    this.name = 'WebSocketAuthenticationError';
  }
}

/** A subscription operation failed (not connected, invalid input, timeout, close before confirmation). */
export class WebSocketSubscriptionError extends WebSocketError {
  /** The types of the failed request. */
  declare readonly subscriptionTypes?: SubscriptionType[] | 'ALL';

  constructor(message: string, subscriptionTypes?: SubscriptionType[] | 'ALL', cause?: unknown) {
    super(message, { reason: 'protocol', cause, code: 'WEBSOCKET_SUBSCRIPTION_ERROR' });
    this.name = 'WebSocketSubscriptionError';
    if (subscriptionTypes !== undefined) this.subscriptionTypes = subscriptionTypes;
  }
}

/** A frame could not be sent. */
export class WebSocketSendError extends WebSocketError {
  /** The frame that was not sent. */
  declare readonly payload?: unknown;

  constructor(message: string, payload?: unknown, cause?: unknown) {
    super(message, { reason: 'network', cause, code: 'WEBSOCKET_SEND_ERROR' });
    this.name = 'WebSocketSendError';
    if (payload !== undefined) this.payload = payload;
  }
}
