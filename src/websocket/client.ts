/**
 * Unified WebSocket Client
 *
 * This module provides the RtlsWebSocketClient class that combines
 * both publisher and subscriber functionality in a single interface.
 */

import { RtlsWebSocketSubscriber } from './subscriber';
import { RtlsWebSocketPublisher } from './publisher';
import {
  type WebSocketClientConfig,
  type SubscriberEventMap,
  type SubscriptionResult,
  type PublishPositionData,
  type PublishResult,
  type BatchPublishResult,
  type UnifiedConnectionStatus,
  SubscriptionType,
} from './types';

/** Connect options for unified client */
export interface ConnectOptions {
  /** Only connect publisher */
  publisherOnly?: boolean;
  /** Only connect subscriber */
  subscriberOnly?: boolean;
}

/**
 * Unified WebSocket client combining publisher and subscriber functionality
 *
 * @example
 * ```typescript
 * const client = new RtlsWebSocketClient({
 *   apiKey: 'your-api-key',
 *   namespace: 'your-namespace',
 *   mapUuid: 'your-map-uuid',
 * });
 *
 * // Register event handlers
 * client.on('POSITIONS', (pos) => console.log(pos));
 *
 * // Connect both publisher and subscriber
 * await client.connect();
 *
 * // Subscribe to events
 * await client.subscribe([SubscriptionType.POSITIONS]);
 *
 * // Send positions
 * await client.sendPosition({
 *   macAddress: 'aabbccddeeff',
 *   latitude: 48.8566,
 *   longitude: 2.3522,
 * });
 *
 * await client.disconnect();
 * ```
 */
export class RtlsWebSocketClient {
  private subscriber: RtlsWebSocketSubscriber;
  private publisher: RtlsWebSocketPublisher | null = null;
  private subscriberConnected = false;
  private publisherConnected = false;
  private readonly _config: WebSocketClientConfig;

  constructor(config: WebSocketClientConfig) {
    if (!config.namespace) {
      throw new Error('namespace is required');
    }

    if (!config.apiKey && !config.token) {
      throw new Error('Either apiKey or token is required');
    }

    this._config = config;

    // Always create subscriber
    this.subscriber = new RtlsWebSocketSubscriber({
      apiKey: config.apiKey,
      token: config.token,
      namespace: config.namespace,
      subscriberUrl: config.subscriberUrl,
      mapUuid: config.mapUuid,
      debug: config.debug,
      reconnectInterval: config.reconnectInterval,
      maxReconnectAttempts: config.maxReconnectAttempts,
      connectionTimeout: config.connectionTimeout,
    });

    // Only create publisher if mapUuid is provided
    if (config.mapUuid) {
      this.publisher = new RtlsWebSocketPublisher({
        apiKey: config.apiKey,
        token: config.token,
        namespace: config.namespace,
        publisherUrl: config.publisherUrl,
        mapUuid: config.mapUuid,
        debug: config.debug,
        reconnectInterval: config.reconnectInterval,
        maxReconnectAttempts: config.maxReconnectAttempts,
        connectionTimeout: config.connectionTimeout,
      });
    }
  }

  /**
   * Connect to WebSocket server(s)
   *
   * @param options - Connection options
   * @param options.publisherOnly - Only connect the publisher
   * @param options.subscriberOnly - Only connect the subscriber
   *
   * @example
   * ```typescript
   * // Connect both
   * await client.connect();
   *
   * // Connect only subscriber
   * await client.connect({ subscriberOnly: true });
   *
   * // Connect only publisher
   * await client.connect({ publisherOnly: true });
   * ```
   */
  async connect(options: ConnectOptions = {}): Promise<void> {
    const promises: Promise<void>[] = [];

    // Connect subscriber unless publisherOnly
    if (!options.publisherOnly) {
      promises.push(
        this.subscriber.connect().then(() => {
          this.subscriberConnected = true;
        })
      );
    }

    // Connect publisher unless subscriberOnly
    if (!options.subscriberOnly && this.publisher) {
      promises.push(
        this.publisher.connect().then(() => {
          this.publisherConnected = true;
        })
      );
    }

    await Promise.all(promises);
  }

  /**
   * Subscribe to event types
   *
   * @param types - Array of subscription types
   * @returns Subscription result
   */
  async subscribe(types: SubscriptionType | SubscriptionType[]): Promise<SubscriptionResult> {
    return this.subscriber.subscribe(types);
  }

  /**
   * Unsubscribe from event types
   *
   * @param types - Array of subscription types to unsubscribe from
   */
  async unsubscribe(types: SubscriptionType | SubscriptionType[]): Promise<void> {
    return this.subscriber.unsubscribe(types);
  }

  /**
   * Get currently active subscriptions
   */
  getActiveSubscriptions(): SubscriptionType[] {
    return this.subscriber.getActiveSubscriptions();
  }

  /**
   * Register an event handler
   *
   * @param event - Event name
   * @param handler - Event handler function
   * @returns Unsubscribe function
   */
  on<K extends keyof SubscriberEventMap>(
    event: K,
    handler: (data: SubscriberEventMap[K]) => void
  ): () => void {
    return this.subscriber.on(event, handler);
  }

  /**
   * Register a one-time event handler
   *
   * @param event - Event name
   * @param handler - Event handler function
   * @returns Unsubscribe function
   */
  once<K extends keyof SubscriberEventMap>(
    event: K,
    handler: (data: SubscriberEventMap[K]) => void
  ): () => void {
    return this.subscriber.once(event, handler);
  }

  /**
   * Remove an event handler
   *
   * @param event - Event name
   * @param handler - Event handler function to remove
   */
  off<K extends keyof SubscriberEventMap>(
    event: K,
    handler: (data: SubscriberEventMap[K]) => void
  ): void {
    return this.subscriber.off(event, handler);
  }

  /**
   * Send a position update
   *
   * @param data - Position data to publish
   * @returns Publish result
   */
  async sendPosition(data: PublishPositionData): Promise<PublishResult> {
    if (!this.publisher) {
      return {
        success: false,
        error: 'Publisher not configured. Provide mapUuid in config.',
      };
    }
    return this.publisher.sendPosition(data);
  }

  /**
   * Send multiple position updates in a batch
   *
   * @param positions - Array of position data to publish
   * @returns Batch publish result
   */
  async sendBatch(positions: PublishPositionData[]): Promise<BatchPublishResult> {
    if (!this.publisher) {
      return {
        success: false,
        sent: 0,
        failed: positions.length,
        errors: ['Publisher not configured. Provide mapUuid in config.'],
      };
    }
    return this.publisher.sendBatch(positions);
  }

  /**
   * Get connection status for both publisher and subscriber
   */
  getConnectionStatus(): UnifiedConnectionStatus {
    return {
      subscriber: this.subscriber.getConnectionStatus(),
      publisher: this.publisher?.getConnectionStatus() ?? null,
    };
  }

  /**
   * Check if subscriber is connected
   */
  isSubscriberConnected(): boolean {
    return this.subscriber.isConnected();
  }

  /**
   * Check if publisher is connected
   */
  isPublisherConnected(): boolean {
    return this.publisher?.isConnected() ?? false;
  }

  /**
   * Check if both subscriber and publisher are connected
   * (or just subscriber if no publisher configured)
   */
  isConnected(): boolean {
    if (this.publisher) {
      return this.subscriber.isConnected() && this.publisher.isConnected();
    }
    return this.subscriber.isConnected();
  }

  /**
   * Disconnect from all WebSocket servers
   */
  async disconnect(): Promise<void> {
    const promises: Promise<void>[] = [];

    if (this.subscriberConnected || this.subscriber.isConnected()) {
      promises.push(
        this.subscriber.disconnect().then(() => {
          this.subscriberConnected = false;
        })
      );
    }

    if ((this.publisherConnected || this.publisher?.isConnected()) && this.publisher) {
      promises.push(
        this.publisher.disconnect().then(() => {
          this.publisherConnected = false;
        })
      );
    }

    await Promise.all(promises);
  }

  /**
   * Get the underlying subscriber instance
   * Useful for advanced configurations
   */
  getSubscriber(): RtlsWebSocketSubscriber {
    return this.subscriber;
  }

  /**
   * Get the underlying publisher instance
   * Returns null if publisher is not configured
   */
  getPublisher(): RtlsWebSocketPublisher | null {
    return this.publisher;
  }

  /**
   * Get the current configuration
   */
  getConfig(): WebSocketClientConfig {
    return { ...this._config };
  }

  /**
   * Get the configured namespace
   */
  getNamespace(): string {
    return this._config.namespace;
  }
}
