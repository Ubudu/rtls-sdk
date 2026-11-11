/**
 * Unified WebSocket client: one subscriber and, when `mapUuid` is set, one publisher, with the
 * events of both on one emitter (publisher lifecycle as `publisher:<name>`).
 *
 * @module websocket/client
 */
import { TypedEventEmitter } from './events';
import { RtlsWebSocketPublisher } from './publisher';
import { RtlsWebSocketSubscriber } from './subscriber';
import type {
  BatchPublishResult,
  PublisherEventMap,
  PublishResult,
  SubscriberEventMap,
  SubscriptionRequest,
  SubscriptionResult,
  SubscriptionState,
  SubscriptionType,
  SubscriptionTypes,
  UnifiedConnectionStatus,
  UnifiedEventMap,
  WebSocketClientConfig,
  WebSocketConnectOptions,
  WebSocketPublishPositionData,
} from './types';

const NO_PUBLISHER = 'Publisher not configured. Provide mapUuid in config.';

/** Every subscriber event, forwarded under its own name (a Record keeps the list exhaustive). */
const SUBSCRIBER_EVENTS: Record<keyof SubscriberEventMap, true> = {
  connected: true,
  disconnected: true,
  reconnecting: true,
  reconnected: true,
  reconnect_failed: true,
  error: true,
  message: true,
  POSITIONS: true,
  ZONES_ENTRIES_EVENTS: true,
  ZONE_STATS_EVENTS: true,
  ALERTS: true,
  ASSETS: true,
  TAG_LOST: true,
  ALERT_RULES_CHANGED: true,
  ASSETS_LIBRARY_CHANGED: true,
  DATA_MODELS_CHANGED: true,
  SETTINGS_CHANGED: true,
  MAP_DATA_CHANGED: true,
  unknown: true,
};

/** Publisher lifecycle events, forwarded as `publisher:<name>`. */
const PUBLISHER_EVENTS = [
  'connected',
  'disconnected',
  'reconnecting',
  'reconnected',
  'reconnect_failed',
  'error',
] as const satisfies readonly (keyof PublisherEventMap)[];

/**
 * Subscriber and publisher behind one object.
 *
 * @example
 * ```typescript
 * const ws = new RtlsWebSocketClient({ apiKey, namespace, mapUuid });
 * ws.on('POSITIONS', (p) => console.log(p.user_uuid));
 * ws.on('publisher:error', ({ error }) => console.error(error.message));
 * await ws.connect();
 * await ws.subscribe('ALL');
 * ```
 */
export class RtlsWebSocketClient extends TypedEventEmitter<UnifiedEventMap> {
  private readonly config: WebSocketClientConfig;
  private readonly subscriber: RtlsWebSocketSubscriber;
  private readonly publisher: RtlsWebSocketPublisher | null;

  constructor(config: WebSocketClientConfig) {
    super();
    const { subscriberUrl, publisherUrl, mapUuid, subscriptionTimeoutMs, ...base } = config ?? {};
    this.subscriber = new RtlsWebSocketSubscriber({
      ...base,
      subscriberUrl,
      subscriptionTimeoutMs,
    });
    this.publisher = mapUuid
      ? new RtlsWebSocketPublisher({ ...base, publisherUrl, mapUuid })
      : null;
    this.config = { ...config };
    for (const event of Object.keys(SUBSCRIBER_EVENTS) as (keyof SubscriberEventMap)[]) {
      this.forward(event);
    }
    for (const event of PUBLISHER_EVENTS) this.forwardPublisher(event);
  }

  /** Connects the subscriber and the publisher (or only one of them). */
  async connect(options: WebSocketConnectOptions = {}): Promise<void> {
    const tasks: Promise<void>[] = [];
    if (!options.publisherOnly) tasks.push(this.subscriber.connect());
    if (!options.subscriberOnly && this.publisher !== null) tasks.push(this.publisher.connect());
    await Promise.all(tasks);
  }

  /** Disconnects both sockets. */
  async disconnect(): Promise<void> {
    await Promise.all([this.subscriber.disconnect(), this.publisher?.disconnect()]);
  }

  /** See `RtlsWebSocketSubscriber.subscribe`. */
  subscribe(request?: SubscriptionRequest): Promise<SubscriptionResult> {
    return this.subscriber.subscribe(request);
  }

  /** See `RtlsWebSocketSubscriber.unsubscribe`. */
  unsubscribe(types?: SubscriptionTypes): Promise<void> {
    return this.subscriber.unsubscribe(types);
  }

  /** See `RtlsWebSocketSubscriber.setTagFilter`. */
  setTagFilter(uuids: readonly string[] | null): Promise<void> {
    return this.subscriber.setTagFilter(uuids);
  }

  /** See `RtlsWebSocketSubscriber.getSubscription`. */
  getSubscription(): SubscriptionState | null {
    return this.subscriber.getSubscription();
  }

  /** See `RtlsWebSocketSubscriber.getActiveSubscriptions`. */
  getActiveSubscriptions(): SubscriptionType[] {
    return this.subscriber.getActiveSubscriptions();
  }

  /** Publishes one position; without a publisher returns a failure result. */
  async sendPosition(data: WebSocketPublishPositionData): Promise<PublishResult> {
    if (this.publisher === null) return { success: false, error: NO_PUBLISHER };
    return this.publisher.sendPosition(data);
  }

  /** Publishes positions; without a publisher returns a failure result. */
  async sendBatch(positions: readonly WebSocketPublishPositionData[]): Promise<BatchPublishResult> {
    if (this.publisher === null) {
      return { success: false, sent: 0, failed: positions.length, errors: [NO_PUBLISHER] };
    }
    return this.publisher.sendBatch(positions);
  }

  /** Status of both sockets. */
  getConnectionStatus(): UnifiedConnectionStatus {
    return {
      subscriber: this.subscriber.getConnectionStatus(),
      publisher: this.publisher?.getConnectionStatus() ?? null,
    };
  }

  /** `true` when the subscriber, and the publisher when configured, are connected. */
  isConnected(): boolean {
    return this.subscriber.isConnected() && (this.publisher?.isConnected() ?? true);
  }

  isSubscriberConnected(): boolean {
    return this.subscriber.isConnected();
  }

  isPublisherConnected(): boolean {
    return this.publisher?.isConnected() ?? false;
  }

  getSubscriber(): RtlsWebSocketSubscriber {
    return this.subscriber;
  }

  getPublisher(): RtlsWebSocketPublisher | null {
    return this.publisher;
  }

  /** A copy of the configuration. */
  getConfig(): WebSocketClientConfig {
    return { ...this.config };
  }

  getNamespace(): string {
    return this.config.namespace;
  }

  private forward<K extends keyof SubscriberEventMap>(event: K): void {
    this.subscriber.on(event, (data) => this.emit(event, data as UnifiedEventMap[K]));
  }

  private forwardPublisher<K extends (typeof PUBLISHER_EVENTS)[number]>(event: K): void {
    const name = `publisher:${event}` as const;
    this.publisher?.on(event, (data) => this.emit(name, data as UnifiedEventMap[typeof name]));
  }
}
