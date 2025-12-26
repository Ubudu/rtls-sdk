/**
 * WebSocket Publisher Client
 *
 * This module provides the RtlsWebSocketPublisher class for sending
 * position updates from external tracking sources to the RTLS platform.
 */

import { BaseWebSocketConnection } from './connection';
import {
  type WebSocketPublisherConfig,
  type PublisherEventMap,
  type WebSocketMessage,
  type PublishPositionData,
  type PublishResult,
  type BatchPublishResult,
  type DeviceInfo,
  WEBSOCKET_URLS,
  POSITION_ORIGIN,
  WebSocketSendError,
  normalizeMacAddress,
} from './types';

/**
 * WebSocket publisher for sending position data to RTLS
 *
 * @example
 * ```typescript
 * const publisher = new RtlsWebSocketPublisher({
 *   apiKey: 'your-api-key',
 *   namespace: 'your-namespace',
 *   mapUuid: 'your-map-uuid',
 * });
 *
 * await publisher.connect();
 *
 * const result = await publisher.sendPosition({
 *   macAddress: 'aabbccddeeff',
 *   latitude: 48.8566,
 *   longitude: 2.3522,
 *   name: 'Asset-123',
 * });
 *
 * console.log(result.success); // true
 *
 * await publisher.disconnect();
 * ```
 */
export class RtlsWebSocketPublisher extends BaseWebSocketConnection<PublisherEventMap> {
  private mapUuid: string;

  constructor(config: WebSocketPublisherConfig) {
    super(config, config.publisherUrl ?? WEBSOCKET_URLS.PUBLISHER);

    if (!config.mapUuid) {
      throw new Error('mapUuid is required for publisher');
    }

    this.mapUuid = config.mapUuid;
  }

  /**
   * Send a position update for a tag
   *
   * @param data - Position data to publish
   * @returns Result indicating success or failure
   *
   * @example
   * ```typescript
   * const result = await publisher.sendPosition({
   *   macAddress: 'AA:BB:CC:DD:EE:FF',
   *   latitude: 48.8566,
   *   longitude: 2.3522,
   *   name: 'Forklift-42',
   *   color: '#FF5500',
   *   data: { battery: 85 }
   * });
   * ```
   */
  async sendPosition(data: PublishPositionData): Promise<PublishResult> {
    if (!this.isConnected()) {
      // Auto-connect if not connected
      try {
        await this.connect();
      } catch (error) {
        return {
          success: false,
          error: `Connection failed: ${(error as Error).message}`,
        };
      }
    }

    try {
      const message = this.buildPositionMessage(data);
      this.send(message);
      return { success: true };
    } catch (error) {
      const sendError = error as Error;
      this.debug('Failed to send position:', sendError.message);
      return {
        success: false,
        error: sendError.message,
      };
    }
  }

  /**
   * Send multiple position updates in a batch
   *
   * @param positions - Array of position data to publish
   * @returns Batch result with success/failure counts
   *
   * @example
   * ```typescript
   * const result = await publisher.sendBatch([
   *   { macAddress: 'aabbccddeeff', latitude: 48.8566, longitude: 2.3522 },
   *   { macAddress: '112233445566', latitude: 48.8570, longitude: 2.3530 },
   * ]);
   *
   * console.log(`Sent: ${result.sent}, Failed: ${result.failed}`);
   * ```
   */
  async sendBatch(positions: PublishPositionData[]): Promise<BatchPublishResult> {
    if (!this.isConnected()) {
      try {
        await this.connect();
      } catch (error) {
        return {
          success: false,
          sent: 0,
          failed: positions.length,
          errors: [`Connection failed: ${(error as Error).message}`],
        };
      }
    }

    let sent = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const position of positions) {
      try {
        const message = this.buildPositionMessage(position);
        this.send(message);
        sent++;
      } catch (error) {
        failed++;
        errors.push(`${position.macAddress}: ${(error as Error).message}`);
      }
    }

    return {
      success: failed === 0,
      sent,
      failed,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  /**
   * Build a position message for the RTLS server
   */
  private buildPositionMessage(data: PublishPositionData): Record<string, unknown> {
    // Normalize MAC address to lowercase without separators
    let formattedMac: string;
    try {
      formattedMac = normalizeMacAddress(data.macAddress);
    } catch (error) {
      throw new WebSocketSendError(
        `Invalid MAC address: ${data.macAddress}`,
        data
      );
    }

    const deviceInfo: DeviceInfo = {
      model: 'GNSS',
      system_build_number: '1.0',
      system_name: 'UbuduRtlsSdk',
      system_version: '1.0',
    };

    return {
      app_namespace: data.appNamespace ?? this.getNamespace(),
      device_info: deviceInfo,
      data: data.data ?? {},
      lat: data.latitude,
      lon: data.longitude,
      map_uuid: data.mapUuid ?? this.mapUuid,
      model: data.model ?? 'GenericTag',
      origin: POSITION_ORIGIN.EXTERNAL_API,
      timestamp: new Date().toISOString(),
      user_name: data.name ?? data.macAddress,
      user_uuid: formattedMac,
      color: data.color ?? '#0088FF',
    };
  }

  /**
   * Handle incoming messages (acknowledgements, errors)
   */
  protected handleMessage(data: WebSocketMessage): void {
    this.emit('message', data);
    // Publisher typically doesn't receive many messages
    // but we log any we do receive
    this.debug('Received message:', data);
  }

  /**
   * Get the configured map UUID
   */
  getMapUuid(): string {
    return this.mapUuid;
  }
}
