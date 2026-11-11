/**
 * Publisher: validates first, then connects, then sends one frame per position with only the
 * caller's fields, in a fixed key order.
 *
 * @module websocket/publisher
 */
import { ContextError } from '../errors';
import { isValidMac, normalizeMac } from '../utils/mac';
import { toEpochMs } from '../utils/time';
import { BaseWebSocketConnection } from './connection';
import {
  WEBSOCKET_URLS,
  type BatchPublishResult,
  type PublisherEventMap,
  type PublishResult,
  type WebSocketPublisherConfig,
  type WebSocketPublishPositionData,
} from './types';

/** Keys `extra` may not carry: the frame's own keys and the frame variants the SDK does not expose. */
const FORBIDDEN_EXTRA = new Set([
  'app_namespace',
  'user_uuid',
  'lat',
  'lon',
  'map_uuid',
  'timestamp',
  'user_name',
  'model',
  'color',
  'origin',
  'data',
  'patch_asset_data',
  'declared_location',
  'network_uuid',
  'action',
  'type',
  'event_type',
]);

function inRange(value: unknown, limit: number): boolean {
  return typeof value === 'number' && Number.isFinite(value) && value >= -limit && value <= limit;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function macOf(position: unknown): string {
  return String(isRecord(position) ? position.macAddress : position);
}

/**
 * Publisher of the broker's `ws/publisher` socket. There is no acknowledgement: `success: true` means the frame
 * was handed to the socket. For acknowledged delivery use `client.positions.publish()` (HTTP).
 *
 * @example
 * ```typescript
 * const publisher = new RtlsWebSocketPublisher({ apiKey, namespace, mapUuid });
 * const result = await publisher.sendPosition({ macAddress: 'aabbccddeeff', latitude: 48.85, longitude: 2.35 });
 * ```
 */
export class RtlsWebSocketPublisher extends BaseWebSocketConnection<PublisherEventMap> {
  private readonly mapUuid: string;

  constructor(config: WebSocketPublisherConfig) {
    super(config, config?.publisherUrl ?? WEBSOCKET_URLS.PUBLISHER, 'RtlsWebSocketPublisher');
    if (typeof config.mapUuid !== 'string' || config.mapUuid === '') {
      throw new ContextError('mapUuid', 'Pass { mapUuid } in the publisher config');
    }
    this.mapUuid = config.mapUuid;
  }

  /**
   * Validates, connects when needed, and sends one position. Never throws.
   */
  async sendPosition(data: WebSocketPublishPositionData): Promise<PublishResult> {
    const frame = this.buildFrame(data);
    if (typeof frame === 'string') return { success: false, error: frame };
    const connectError = await this.ensureConnected();
    if (connectError !== undefined) return { success: false, error: connectError };
    try {
      this.sendFrame(frame);
      return { success: true };
    } catch (error) {
      return { success: false, error: this.safeMessage(error) };
    }
  }

  /**
   * Validates every position, connects once when at least one is valid, and sends one frame per valid position
   * in input order. Never throws.
   */
  async sendBatch(positions: readonly WebSocketPublishPositionData[]): Promise<BatchPublishResult> {
    const errors: string[] = [];
    const frames: { mac: string; frame: Record<string, unknown> }[] = [];
    for (const position of positions) {
      const frame = this.buildFrame(position);
      if (typeof frame === 'string') errors.push(`${macOf(position)}: ${frame}`);
      else frames.push({ mac: macOf(position), frame });
    }
    if (frames.length > 0) {
      const connectError = await this.ensureConnected();
      if (connectError !== undefined) {
        return { success: false, sent: 0, failed: positions.length, errors: [connectError] };
      }
    }
    let sent = 0;
    for (const { mac, frame } of frames) {
      try {
        this.sendFrame(frame);
        sent += 1;
      } catch (error) {
        errors.push(`${mac}: ${this.safeMessage(error)}`);
      }
    }
    const failed = positions.length - sent;
    return failed === 0
      ? { success: true, sent, failed }
      : { success: false, sent, failed, errors };
  }

  /** The configured map. */
  getMapUuid(): string {
    return this.mapUuid;
  }

  private async ensureConnected(): Promise<string | undefined> {
    if (this.isConnected()) return undefined;
    try {
      await this.connect();
      return undefined;
    } catch (error) {
      return `Connection failed: ${this.safeMessage(error)}`;
    }
  }

  /**
   * The frame, keys in this order: `app_namespace, user_uuid, lat, lon, map_uuid, timestamp, [user_name], [model],
   * [color], [origin], [data], [...extra]`; or the reason the position is invalid.
   */
  private buildFrame(data: WebSocketPublishPositionData): Record<string, unknown> | string {
    if (!isRecord(data)) return 'Invalid position: expected an object';
    if (!isValidMac(data.macAddress))
      return `Invalid MAC address ${JSON.stringify(String(data.macAddress).slice(0, 40))}`;
    if (!inRange(data.latitude, 90))
      return 'Invalid latitude: expected a finite number in [-90, 90]';
    if (!inRange(data.longitude, 180))
      return 'Invalid longitude: expected a finite number in [-180, 180]';
    const mapUuid = data.mapUuid ?? this.mapUuid;
    if (typeof mapUuid !== 'string' || mapUuid === '')
      return 'Invalid mapUuid: expected a non-empty string';
    const appNamespace = data.appNamespace ?? this.namespace;
    if (typeof appNamespace !== 'string' || appNamespace === '') {
      return 'Invalid appNamespace: expected a non-empty string';
    }
    let timestamp: string;
    try {
      timestamp = new Date(
        data.timestamp === undefined ? Date.now() : toEpochMs(data.timestamp)
      ).toISOString();
    } catch {
      return 'Invalid timestamp: expected a Date, epoch milliseconds or a date string';
    }
    const extra = data.extra ?? {};
    if (!isRecord(extra)) return 'Invalid extra: expected an object';
    const forbidden = Object.keys(extra).filter((key) => FORBIDDEN_EXTRA.has(key));
    if (forbidden.length > 0) return `Invalid extra key(s): ${forbidden.join(', ')}`;
    const frame: Record<string, unknown> = {
      app_namespace: appNamespace,
      user_uuid: normalizeMac(data.macAddress),
      lat: data.latitude,
      lon: data.longitude,
      map_uuid: mapUuid,
      timestamp,
    };
    if (data.name !== undefined) frame.user_name = data.name;
    if (data.model !== undefined) frame.model = data.model;
    if (data.color !== undefined) frame.color = data.color;
    if (data.origin !== undefined) frame.origin = data.origin;
    if (data.data !== undefined) frame.data = data.data;
    return Object.assign(frame, extra);
  }
}
