# Appendix A: Reference TypeScript Definitions

The following type definitions are from the reference JS client (`lib/index.d.ts`) and should be used as the basis for our TypeScript implementation:

```typescript
/**
 * Configuration options for all WebSocket clients
 */
export interface UbuduWebsocketConfig {
  /** Application namespace (required) */
  appNamespace: string;
  /** Map UUID (required for publishing) */
  mapUuid?: string;
  /** WebSocket URL for the publisher */
  publisherUrl?: string;
  /** WebSocket URL for the subscriber */
  subscriberUrl?: string;
  /** Enable debug logging */
  debug?: boolean;
  /** Reconnection interval in milliseconds */
  reconnectInterval?: number;
}

/**
 * Options for the sendTagLocation method
 */
export interface SendTagLocationOptions {
  /** Model of the tag */
  model?: string;
  /** Any additional data to include */
  additionalData?: Record<string, any>;
  /** User-friendly name for the tag */
  name?: string;
  /** Hex color code for the tag */
  color?: string;
  /** Override default app namespace */
  appNamespace?: string;
  /** Override default map UUID */
  mapUuid?: string;
}

/**
 * Result object for API operations
 */
export interface ApiResult {
  /** Whether the operation was successful */
  success: boolean;
  /** Error message in case of failure */
  error?: string;
}

/**
 * Position data for a tag
 */
export interface TagPosition {
  /** Tag identifier (MAC address) */
  id: string;
  /** User-friendly name */
  user_name?: string;
  /** Model type */
  model?: string;
  /** Latitude coordinate */
  lat: number;
  /** Longitude coordinate */
  lng: number;
  /** Timestamp */
  timestamp?: number;
  /** Battery level */
  battery_level?: number;
  /** Altitude */
  altitude?: number;
  /** Color */
  color?: string;
  /** Any other properties */
  [key: string]: any;
}

/**
 * Connection options
 */
export interface ConnectionOptions {
  /** Connect only to the publisher */
  publisherOnly?: boolean;
  /** Connect only to the subscriber */
  subscriberOnly?: boolean;
}

/**
 * Connection status
 */
export type ConnectionStatus = 'CONNECTED' | 'CONNECTING' | 'CLOSING' | 'DISCONNECTED' | 'UNKNOWN';

/**
 * Connection status object for unified client
 */
export interface ConnectionStatusObject {
  /** Status of the publisher connection */
  publisher: ConnectionStatus;
  /** Status of the subscriber connection */
  subscriber: ConnectionStatus;
}
```
