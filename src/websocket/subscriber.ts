/**
 * WebSocket Subscriber Client
 *
 * This module provides the RtlsWebSocketSubscriber class for receiving
 * real-time position updates, zone events, alerts, and asset changes.
 */

import { BaseWebSocketConnection } from './connection';
import {
  type WebSocketSubscriberConfig,
  type SubscriberEventMap,
  type WebSocketMessage,
  type SubscribeMessage,
  type SubscriptionResult,
  SubscriptionType,
  WEBSOCKET_URLS,
  WebSocketSubscriptionError,
  classifyMessage,
  isSubscriptionConfirmation,
} from './types';

/** Subscription type or array of types */
export type SubscriptionTypes = SubscriptionType | SubscriptionType[];

/**
 * WebSocket subscriber for receiving real-time RTLS data
 *
 * @example
 * ```typescript
 * const subscriber = new RtlsWebSocketSubscriber({
 *   apiKey: 'your-api-key',
 *   namespace: 'your-namespace',
 * });
 *
 * // Register handlers before connecting
 * subscriber.on('POSITIONS', (pos) => {
 *   console.log(`Tag ${pos.user_uuid} at ${pos.lat}, ${pos.lon}`);
 * });
 *
 * // Connect and subscribe
 * await subscriber.connect();
 * await subscriber.subscribe([SubscriptionType.POSITIONS]);
 *
 * // Later: disconnect
 * await subscriber.disconnect();
 * ```
 */
export class RtlsWebSocketSubscriber extends BaseWebSocketConnection<SubscriberEventMap> {
  private mapUuid?: string;
  private activeSubscriptions: SubscriptionType[] = [];
  private subscriptionPromise: Promise<SubscriptionResult> | null = null;
  private subscriptionResolver: ((result: SubscriptionResult) => void) | null = null;
  private subscriptionRejecter: ((error: Error) => void) | null = null;
  private subscriptionTimeout: ReturnType<typeof setTimeout> | null = null;
  private readonly subscriptionTimeoutMs = 10000;

  constructor(config: WebSocketSubscriberConfig) {
    super(config, config.subscriberUrl ?? WEBSOCKET_URLS.SUBSCRIBER);
    this.mapUuid = config.mapUuid;
  }

  /**
   * Subscribe to specific event types
   * Must be called after connect() to receive events.
   *
   * @param types - Single subscription type or array of types. If empty, subscribes to all.
   * @returns Promise resolving to subscription result
   *
   * @example
   * ```typescript
   * // Subscribe to single type
   * await subscriber.subscribe(SubscriptionType.POSITIONS);
   *
   * // Subscribe to multiple types
   * await subscriber.subscribe([
   *   SubscriptionType.POSITIONS,
   *   SubscriptionType.ALERTS
   * ]);
   *
   * // Subscribe to all types
   * await subscriber.subscribe([]);
   * ```
   */
  async subscribe(types: SubscriptionTypes = []): Promise<SubscriptionResult> {
    if (!this.isConnected()) {
      throw new WebSocketSubscriptionError('WebSocket not connected. Call connect() first.');
    }

    // Normalize to array
    const typesArray = Array.isArray(types) ? types : [types];

    // Validate types
    const validTypes = Object.values(SubscriptionType);
    const invalidTypes = typesArray.filter(t => !validTypes.includes(t));
    if (invalidTypes.length > 0) {
      throw new WebSocketSubscriptionError(
        `Invalid subscription type(s): ${invalidTypes.join(', ')}. Valid types: ${validTypes.join(', ')}`,
        invalidTypes as SubscriptionType[]
      );
    }

    // Build subscription message
    const message: SubscribeMessage = {
      type: 'SUBSCRIBE',
      app_namespace: this.getNamespace(),
    };

    if (this.mapUuid) {
      message.map_uuid = this.mapUuid;
    }

    if (typesArray.length > 0) {
      message.data_type_filter = typesArray;
    }

    this.debug('Sending SUBSCRIBE:', message);

    // Create promise for subscription confirmation
    this.subscriptionPromise = new Promise((resolve, reject) => {
      this.subscriptionResolver = resolve;
      this.subscriptionRejecter = reject;

      // Timeout after configured duration
      this.subscriptionTimeout = setTimeout(() => {
        const error = new WebSocketSubscriptionError(
          'Subscription confirmation timeout',
          typesArray
        );
        this.subscriptionRejecter?.(error);
        this.cleanupSubscriptionPromise();
      }, this.subscriptionTimeoutMs);
    });

    // Send subscription message
    this.send(message);

    // Store active subscriptions
    this.activeSubscriptions = typesArray.length > 0
      ? [...typesArray]
      : [...validTypes];

    return this.subscriptionPromise;
  }

  /**
   * Unsubscribe from specific event types
   *
   * @param types - Single type or array of types to unsubscribe from
   */
  async unsubscribe(types: SubscriptionTypes): Promise<void> {
    const typesArray = Array.isArray(types) ? types : [types];

    // Remove from active subscriptions
    this.activeSubscriptions = this.activeSubscriptions.filter(
      t => !typesArray.includes(t)
    );

    // Note: The RTLS API doesn't support selective unsubscription
    // To change subscriptions, you need to re-subscribe with new types
    this.debug('Updated active subscriptions:', this.activeSubscriptions);

    // If there are remaining subscriptions, re-subscribe
    if (this.activeSubscriptions.length > 0 && this.isConnected()) {
      await this.subscribe(this.activeSubscriptions);
    }
  }

  /**
   * Get currently active subscriptions
   */
  getActiveSubscriptions(): SubscriptionType[] {
    return [...this.activeSubscriptions];
  }

  /**
   * Handle incoming messages
   */
  protected handleMessage(data: WebSocketMessage): void {
    // Always emit generic message event
    this.emit('message', data);

    // Handle subscription confirmation
    if (isSubscriptionConfirmation(data)) {
      this.handleSubscriptionConfirmation(data);
      return;
    }

    // Classify and route message
    const messageType = classifyMessage(data);

    if (messageType !== 'UNKNOWN' && messageType !== 'CONFIRMATION') {
      // Emit type-specific event
      switch (messageType) {
        case SubscriptionType.POSITIONS:
          this.emit('POSITIONS', data as SubscriberEventMap['POSITIONS']);
          break;
        case SubscriptionType.ZONES_ENTRIES_EVENTS:
          this.emit('ZONES_ENTRIES_EVENTS', data as SubscriberEventMap['ZONES_ENTRIES_EVENTS']);
          break;
        case SubscriptionType.ZONE_STATS_EVENTS:
          this.emit('ZONE_STATS_EVENTS', data as SubscriberEventMap['ZONE_STATS_EVENTS']);
          break;
        case SubscriptionType.ALERTS:
          this.emit('ALERTS', data as SubscriberEventMap['ALERTS']);
          break;
        case SubscriptionType.ASSETS:
          this.emit('ASSETS', data as SubscriberEventMap['ASSETS']);
          break;
      }
    } else {
      this.debug('Received message with unknown type:', data);
    }
  }

  /**
   * Handle subscription confirmation message
   */
  private handleSubscriptionConfirmation(data: WebSocketMessage): void {
    if (!this.subscriptionResolver) {
      this.debug('Received subscription confirmation but no pending subscription');
      return;
    }

    this.debug('Subscription confirmed:', data);

    const msg = data as Record<string, unknown>;
    const result: SubscriptionResult = {
      success: true,
      types: (msg.types as SubscriptionType[]) ?? 'ALL',
    };

    this.subscriptionResolver(result);
    this.cleanupSubscriptionPromise();
  }

  /**
   * Clean up subscription promise state
   */
  private cleanupSubscriptionPromise(): void {
    if (this.subscriptionTimeout) {
      clearTimeout(this.subscriptionTimeout);
      this.subscriptionTimeout = null;
    }
    this.subscriptionResolver = null;
    this.subscriptionRejecter = null;
    this.subscriptionPromise = null;
  }

  /**
   * Re-subscribe after reconnection
   */
  protected override onReconnected(): void {
    super.onReconnected();

    if (this.activeSubscriptions.length > 0) {
      this.debug('Re-subscribing after reconnection');
      this.subscribe(this.activeSubscriptions).catch(error => {
        this.logger.error('Failed to re-subscribe after reconnection', error);
        this.emit('error', {
          error: error as Error,
          timestamp: new Date()
        });
      });
    }
  }

  /**
   * Override disconnect to clean up subscriptions
   */
  override async disconnect(): Promise<void> {
    this.cleanupSubscriptionPromise();
    await super.disconnect();
  }
}
