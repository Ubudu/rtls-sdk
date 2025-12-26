# Work Package #6: WebSocket Client Implementation

**Status**: NOT STARTED
**Priority**: HIGH
**Estimated Tasks**: 67
**Estimated Phases**: 12

---

## Executive Summary

Implement a TypeScript WebSocket client for real-time position streaming, zone events, and alerts. The client will integrate with the existing SDK architecture, support API key authentication via query parameters, and provide a type-safe event-driven API.

### Key Features
- **Subscriber Client**: Real-time data streaming (positions, zones, alerts, assets)
- **Publisher Client**: Position publishing for external tracking sources
- **Unified Client**: Combined publisher/subscriber interface
- **Full TypeScript Support**: Complete type definitions for all events and messages
- **Automatic Reconnection**: Configurable exponential backoff
- **Context Integration**: Works with SDK's namespace/venue/map context system

### Reference Implementation
- **Authentication Spec**: `/Users/fkruta/CLionProjects/ubudu_rtls_latest/rtls-api/docs/work-packages/WEBSOCKET_AUTHENTICATION.md`
- **Reference JS Client**: `/Users/fkruta/CLionProjects/ubudu-rtls-websocket-api-client`

---

## Business Context

### Asset Association Concept

In the Ubudu RTLS system, assets represent a crucial link between physical tags (identified by MAC addresses) and logical entities in your business context.

**The Ubudu RTLS platform operates on a foundational concept:**
- Physical tags with unique MAC addresses are deployed in your environment
- These tags are paired with logical assets that represent business objects (work orders, equipment, products, etc.)
- The association data travels with position updates and other events
- This enables business-context awareness in your location tracking

This pairing mechanism transforms raw location data into meaningful business intelligence. Instead of simply tracking "where is tag aabbccddeeff?", applications can answer questions like "where is Work Order #12345?" or "where is Production Unit ABC?".

### Data Flow Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ 1. PHYSICAL LAYER                                                           │
│    Physical Tag (MAC: aabbccddeeff) → Broadcasts location → Position Data   │
└─────────────────────────────────────────────────────────────────────────────┘
                                    ↓
┌─────────────────────────────────────────────────────────────────────────────┐
│ 2. PAIRING APPLICATION                                                       │
│    Tag Pairing App → Creates/manages → Tag-Asset Association                │
│    Data Model (Products, Equipment) → Defines structure → Association       │
└─────────────────────────────────────────────────────────────────────────────┘
                                    ↓
┌─────────────────────────────────────────────────────────────────────────────┐
│ 3. RTLS DATA PROCESSING                                                      │
│    Position Data + Asset Information → Enriched Data Stream                 │
│    Tag-Asset Association → Enriches → Business Context                      │
└─────────────────────────────────────────────────────────────────────────────┘
                                    ↓
┌─────────────────────────────────────────────────────────────────────────────┐
│ 4. WEBSOCKET DISTRIBUTION (this implementation)                              │
│    Enriched Data Stream → WebSocket Server → Client Subscriptions           │
│    - POSITIONS: Real-time location updates                                  │
│    - ZONES_ENTRIES_EVENTS: Geofence triggers                                │
│    - ZONE_STATS_EVENTS: Occupancy analytics                                 │
│    - ALERTS: Business rule notifications                                    │
│    - ASSETS: Asset CRUD events                                              │
└─────────────────────────────────────────────────────────────────────────────┘
                                    ↓
┌─────────────────────────────────────────────────────────────────────────────┐
│ 5. APPLICATIONS                                                              │
│    Enriched Data Stream → Powers → Visualizations & Dashboards              │
│    Enriched Data Stream → Enables → Business Analytics                      │
│    Enriched Data Stream → Triggers → Custom Alerts                          │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Alert System Overview

The system includes a rule-based alerting engine that monitors events and generates notifications:

1. **Event Detection**: The system monitors position data, zone entries/exits, and other events
2. **Rule Evaluation**: Incoming events are evaluated against predefined rules
3. **Action Execution**: When a rule matches, the system executes one or more actions
4. **Alert Distribution**: Notifications are distributed to subscribers via the WebSocket connection

**Common Alert Scenarios:**
- **Zone-Based**: Entry into restricted zones, exit from monitored zones, excessive time spent
- **Asset Status**: Low battery, connectivity loss, device malfunction
- **Business Logic**: Process violations, SLA breaches, inventory thresholds
- **System Health**: Tag density warnings, coverage gaps, infrastructure issues

---

## Decision Record (ADR)

### ADR-001: Query Parameter Authentication

**Decision**: Use query parameters (`?apiKey=` or `?token=`) for WebSocket authentication instead of headers.

**Rationale**:
- Browser WebSocket API does not support custom headers during handshake
- Query parameters work uniformly across all WebSocket clients (browser, Node.js, mobile)
- Server already implements this pattern

**Implementation**: Build URL with `URLSearchParams` in `buildUrl()` method.

### ADR-002: Separate Subscriber/Publisher Classes + Unified Client

**Decision**: Implement three separate classes: `RtlsWebSocketSubscriber`, `RtlsWebSocketPublisher`, and `RtlsWebSocketClient` (unified).

**Rationale**:
- Some applications only need to receive data (subscriber-only is lighter)
- Some applications only need to publish (no subscriber overhead)
- Unified client provides convenience for full-featured apps
- Matches reference JavaScript implementation pattern
- Allows connecting to only one WebSocket if desired (`{ publisherOnly: true }` or `{ subscriberOnly: true }`)

### ADR-003: Exponential Backoff Reconnection

**Decision**: Use exponential backoff with 5s base, 2x multiplier, 30s max.

**Rationale**:
- Prevents server overload during outages
- 5s initial delay is user-friendly while avoiding rapid reconnect spam
- 30s max prevents excessively long waits
- Matches reference implementation

**Formula**: `delay = min(baseInterval * 2^attempts, 30000)`

### ADR-004: Browser/Node.js Compatibility

**Decision**: Use native `WebSocket` in browser, `ws` package in Node.js.

**Rationale**:
- Native WebSocket is standard in all modern browsers
- Node.js does not have native WebSocket
- `ws` is the de-facto standard Node.js WebSocket library
- Detection via `typeof WebSocket !== 'undefined'`

**Implementation**:
```typescript
if (typeof WebSocket !== 'undefined') {
  this.ws = new WebSocket(url);
} else {
  const WebSocketNode = require('ws');
  this.ws = new WebSocketNode(url, { handshakeTimeout: timeout });
}
```

### ADR-005: Two-Step Connection Flow

**Decision**: Require explicit `connect()` then `subscribe()` calls instead of auto-subscribe on connect.

**Rationale**:
- Matches reference implementation behavior
- Allows changing subscription types without reconnecting
- Makes subscription explicit and controllable
- Enables connecting without subscribing initially

### ADR-006: Subscription Confirmation Handling

**Decision**: Support both `type: 'SUBSCRIPTION_CONFIRMATION'` and `action: 'subscribeEvent'` response formats.

**Rationale**:
- Server may use either format depending on version/configuration
- Reference implementation handles both
- Forward-compatible with potential server changes

---

## Common Pitfalls & Troubleshooting

> **IMPORTANT FOR AI AGENTS**: These are known issues from production. Handle them explicitly.

### Pitfall 1: Can't Receive Positions After Publishing

**Symptoms**: Published positions don't appear in subscriber.

**Causes & Solutions**:
1. **Namespace mismatch**: Ensure `namespace` matches exactly between publisher and subscriber
2. **Missing subscription**: Must call `subscribe([SubscriptionType.POSITIONS])` after connect
3. **Not connected**: Check `getConnectionStatus().state === 'CONNECTED'` before operations

### Pitfall 2: mapUuid Required for Publishing

**Symptoms**: `sendTagLocation` fails with validation error.

**Solution**: `mapUuid` is REQUIRED for `RtlsWebSocketPublisher` and publishing operations. It is OPTIONAL for `RtlsWebSocketSubscriber`.

```typescript
// WRONG - missing mapUuid for publisher
const publisher = new RtlsWebSocketPublisher({
  apiKey: 'xxx',
  namespace: 'ns'
}); // Will throw error

// CORRECT
const publisher = new RtlsWebSocketPublisher({
  apiKey: 'xxx',
  namespace: 'ns',
  mapUuid: 'map-uuid-here' // Required!
});
```

### Pitfall 3: Subscription Types Not an Array

**Symptoms**: Subscription fails or receives no data.

**Solution**: `subscribe()` accepts either a single type or an array:
```typescript
// Both valid:
await client.subscribe(SubscriptionType.POSITIONS);
await client.subscribe([SubscriptionType.POSITIONS, SubscriptionType.ALERTS]);
```

### Pitfall 4: WebSocket URL Typos

**Symptoms**: Connection fails immediately.

**Default URLs** (verify these are correct):
- Subscriber: `wss://rtls.ubudu.com/api/ws/subscriber`
- Publisher: `wss://rtls.ubudu.com/api/ws/publisher`

### Pitfall 5: MAC Address Format

**Symptoms**: Positions not matching expected tags.

**Solution**: Normalize MAC addresses to lowercase without colons:
```typescript
// These should all map to the same tag:
'AA:BB:CC:DD:EE:FF' → 'aabbccddeeff'
'aa:bb:cc:dd:ee:ff' → 'aabbccddeeff'
'AABBCCDDEEFF'      → 'aabbccddeeff'
```

Implement a normalization function (see Task 1.9 below).

### Pitfall 6: Not Waiting for Subscription Confirmation

**Symptoms**: Messages not received after subscribe call returns.

**Solution**: The `subscribe()` method MUST wait for server confirmation before resolving. Implementation must track pending subscriptions and resolve only when confirmation received.

---

## Test Data Fixtures

> **FOR AI AGENTS**: Use these exact fixtures in tests for consistency.

### Position Message Fixture

```typescript
export const POSITION_MESSAGE_FIXTURE: PositionMessage = {
  app_namespace: 'test_namespace',
  lat: 48.8584,
  lon: 2.2945,
  user_uuid: 'aabbccddeeff',
  user_udid: 'aabbccddeeff',
  user_name: 'Test-Asset-001',
  user_type: 'tag',
  model: 'GenericTag',
  map_uuid: 'test-map-uuid',
  timestamp: 1673345678901,
  color: '#FF0000',
  origin: 4,
  data: {
    battery: 95,
    status: 'active'
  }
};
```

### Zone Entry Event Fixture

```typescript
export const ZONE_ENTRY_FIXTURE: ZoneEntryExitMessage = {
  app_namespace: 'test_namespace',
  map_uuid: 'test-map-uuid',
  event_type: 'ENTER_ZONE',
  zone: {
    type: 'Feature',
    geometry: {
      type: 'Polygon',
      coordinates: [[[2.3795, 48.6187], [2.3796, 48.6187], [2.3796, 48.6188], [2.3795, 48.6188], [2.3795, 48.6187]]]
    },
    properties: {
      id: 12345,
      name: 'Warehouse-A',
      level: 0,
      rgb_color: '#2eff9d',
      tags: ['storage', 'restricted'],
      type: 'map_zone'
    }
  },
  user_uuid: 'aabbccddeeff',
  user_udid: 'aabbccddeeff',
  user_name: 'Forklift-01',
  user_type: 'tag',
  timestamp: 1673345678901
};
```

### Zone Stats Event Fixture

```typescript
export const ZONE_STATS_FIXTURE: ZoneStatsMessage = {
  app_namespace: 'test_namespace',
  event_type: 'UPDATE_ZONE_COUNTER',
  zone_id: 12345,
  zone_name: 'Warehouse-A',
  total_count: 15,
  tag_count: 12,
  mobile_count: 3,
  avg_time_seconds: 3600,
  timestamp: 1673345678901
};
```

### Alert Message Fixture

```typescript
export const ALERT_MESSAGE_FIXTURE: AlertMessage = {
  app_namespace: 'test_namespace',
  map_uuid: 'test-map-uuid',
  event_type: 'NOTIFICATION',
  action: 'notifyEvent',
  user_uuid: 'aabbccddeeff',
  user_udid: 'aabbccddeeff',
  user_type: 'tag',
  zone: {
    type: 'Feature',
    geometry: {
      type: 'Polygon',
      coordinates: [[[2.3795, 48.6187], [2.3796, 48.6187], [2.3796, 48.6188], [2.3795, 48.6188], [2.3795, 48.6187]]]
    },
    properties: {
      id: 12345,
      name: 'Storage_Zone',
      level: 0,
      rgb_color: '#2eff9d',
      tags: [],
      type: 'map_zone'
    }
  },
  params: {
    style: 'warning',
    title: 'Zone Presence Alert',
    text: 'Tag is present in Storage_Zone for over 1 minute',
    duration: 5000,
    coalescence: 60,
    coalescence_group: 'aabbccddeeff_12345_zone_presence',
    icon: 'alert-circle',
    sound: true,
    vibration: true,
    priority: 'high'
  },
  timestamp: 1673345678901
};
```

### Asset Create/Update Fixture

```typescript
export const ASSET_UPDATE_FIXTURE: AssetMessage = {
  action: 'update',
  app_namespace: 'test_namespace',
  mac_address: 'aabbccddeeff',
  type: 'assets',
  data: {
    color: '#f500f5',
    createdBy: 'test_namespace',
    dateChanged: 1673345678901,
    dateCreated: 1673345600000,
    external_id: 'asset_tag_123',
    model: 'asset_model',
    path: '/Area/Location/',
    data: {
      client: 'client_company',
      reference: 'REF-123',
      status: 'OK',
      location: 'Building A'
    },
    user_motion: 'moving',
    user_name: 'Asset-1234',
    user_type: 'tag',
    user_udid: 'aabbccddeeff',
    user_uuid: 'aabbccddeeff'
  }
};
```

### Asset Delete Fixture

```typescript
export const ASSET_DELETE_FIXTURE: AssetMessage = {
  action: 'delete',
  app_namespace: 'test_namespace',
  mac_address: 'aabbccddeeff',
  type: 'assets'
};
```

### Subscription Confirmation Fixtures

```typescript
// Standard format
export const SUBSCRIPTION_CONFIRMATION_STANDARD: SubscriptionConfirmation = {
  type: 'SUBSCRIPTION_CONFIRMATION',
  types: ['POSITIONS', 'ALERTS'],
  app_namespace: 'test_namespace'
};

// Alternative format (also valid)
export const SUBSCRIPTION_CONFIRMATION_ALT: SubscriptionConfirmation = {
  action: 'subscribeEvent',
  app_namespace: 'test_namespace'
};
```

---

## MAC Address Normalization Utility

> **Task 1.9**: Add this utility function to `src/websocket/types.ts`

```typescript
/**
 * Normalize a MAC address to lowercase without separators.
 * Handles various input formats:
 * - 'AA:BB:CC:DD:EE:FF' → 'aabbccddeeff'
 * - 'aa:bb:cc:dd:ee:ff' → 'aabbccddeeff'
 * - 'AA-BB-CC-DD-EE-FF' → 'aabbccddeeff'
 * - 'AABBCCDDEEFF'      → 'aabbccddeeff'
 * - 'aabbccddeeff'      → 'aabbccddeeff'
 *
 * @param mac - MAC address in any common format
 * @returns Normalized 12-character lowercase hex string
 * @throws Error if input is not a valid MAC address
 */
export function normalizeMacAddress(mac: string): string {
  // Remove all separators (colons, dashes, dots)
  const cleaned = mac.replace(/[:\-\.]/g, '');

  // Validate: must be exactly 12 hex characters
  if (!/^[a-fA-F0-9]{12}$/.test(cleaned)) {
    throw new Error(`Invalid MAC address: "${mac}". Expected 12 hex characters.`);
  }

  return cleaned.toLowerCase();
}

/**
 * Check if a string is a valid MAC address (any format).
 */
export function isValidMacAddress(mac: string): boolean {
  try {
    normalizeMacAddress(mac);
    return true;
  } catch {
    return false;
  }
}
```

---

## Architecture Overview

```
src/
├── websocket/
│   ├── index.ts                 # Public exports
│   ├── types.ts                 # All WebSocket types and interfaces
│   ├── subscriber.ts            # RtlsWebSocketSubscriber class
│   ├── publisher.ts             # RtlsWebSocketPublisher class
│   ├── client.ts                # RtlsWebSocketClient (unified)
│   ├── connection.ts            # Base WebSocket connection logic
│   └── events.ts                # Event emitter utilities

test/
├── websocket/
│   ├── subscriber.test.ts
│   ├── publisher.test.ts
│   ├── client.test.ts
│   ├── connection.test.ts
│   └── mocks/
│       └── websocket.ts         # Mock WebSocket for testing
```

### Integration with Main Client

```typescript
// Final API surface
import { RtlsClient, RtlsWebSocketClient } from 'ubudu-rtls-sdk';

// Option 1: Standalone WebSocket client
const ws = new RtlsWebSocketClient({
  apiKey: 'your-api-key',
  namespace: 'your-namespace'
});

// Option 2: Create from existing client (shares config)
const client = new RtlsClient({ apiKey: 'your-api-key', namespace: 'ns' });
const ws = client.createWebSocket();
```

---

## Phase Dependencies

> **AI AGENT NOTE**: Phases must be completed in order. Each phase depends on previous phases.

```
Phase 1 (Types) ─────────────────────────────────────────────────────────────►
       │
       └───► Phase 2 (Events) ───► Phase 3 (Connection) ───► Phase 4 (Subscriber)
                                          │                         │
                                          │                         ├───► Phase 9 (Unit Tests)
                                          │                         │
                                          └───► Phase 5 (Publisher) ┘
                                                       │
                                                       └───► Phase 6 (Unified Client)
                                                                    │
                                                                    └───► Phase 7 (SDK Integration)
                                                                                 │
                                                                                 └───► Phase 8 (Mocks)
                                                                                            │
                                                                                            ├───► Phase 10 (Integration Tests)
                                                                                            │
                                                                                            ├───► Phase 11 (Documentation)
                                                                                            │
                                                                                            └───► Phase 12 (Examples)
```

| Phase | Depends On | Required Before |
|-------|------------|-----------------|
| 1 | None | All other phases |
| 2 | 1 | 3, 4, 5, 6 |
| 3 | 1, 2 | 4, 5 |
| 4 | 1, 2, 3 | 6, 9 |
| 5 | 1, 2, 3 | 6, 9 |
| 6 | 1-5 | 7 |
| 7 | 1-6 | 8 |
| 8 | 1-7 | 9, 10, 11, 12 |
| 9 | 1-8 | None |
| 10 | 1-8 | None |
| 11 | 1-8 | None |
| 12 | 1-8 | None |

---

## Connection State Machine

> **AI AGENT NOTE**: Implement this exact state machine in `connection.ts`.

```
                                        ┌──────────────────────────────────────┐
                                        │                                      │
                                        ▼                                      │
┌──────────────┐    connect()    ┌──────────────┐    success    ┌──────────────┐
│ DISCONNECTED │───────────────►│  CONNECTING  │─────────────►│  CONNECTED   │
└──────────────┘                └──────────────┘               └──────────────┘
       ▲                              │                              │
       │                              │ timeout/error                │ close() or
       │                              ▼                              │ server close
       │                        ┌──────────────┐                     │
       │◄───── max retries ─────│ RECONNECTING │◄────────────────────┘
       │                        └──────────────┘
       │                              │
       │                              │ success
       │                              ▼
       │                        ┌──────────────┐
       └────── disconnect() ────│   CLOSING    │
                                └──────────────┘
```

### State Transitions

| From State | Event | To State | Action |
|------------|-------|----------|--------|
| DISCONNECTED | `connect()` | CONNECTING | Open WebSocket |
| CONNECTING | Success | CONNECTED | Emit 'connected' |
| CONNECTING | Timeout/Error | RECONNECTING | Schedule retry |
| CONNECTED | `disconnect()` | CLOSING | Close WebSocket |
| CONNECTED | Server close | RECONNECTING | Schedule retry |
| RECONNECTING | Success | CONNECTED | Reset retry count |
| RECONNECTING | Max retries | DISCONNECTED | Emit 'error' |
| CLOSING | Close complete | DISCONNECTED | Emit 'disconnected' |

---

## WebSocket Error Classes

> **AI AGENT NOTE**: Add these to `src/websocket/types.ts` or `src/errors.ts`.

```typescript
// Base WebSocket error
export class WebSocketError extends Error {
  constructor(
    message: string,
    public readonly code?: number,
    public readonly reason?: string
  ) {
    super(message);
    this.name = 'WebSocketError';
  }
}

// Connection failed (timeout, network error)
export class WebSocketConnectionError extends WebSocketError {
  constructor(message: string, public readonly cause?: Error) {
    super(message);
    this.name = 'WebSocketConnectionError';
  }
}

// Authentication failed (401, 403)
export class WebSocketAuthenticationError extends WebSocketError {
  constructor(
    message: string = 'WebSocket authentication failed',
    code?: number
  ) {
    super(message, code);
    this.name = 'WebSocketAuthenticationError';
  }
}

// Subscription failed
export class WebSocketSubscriptionError extends WebSocketError {
  constructor(
    message: string,
    public readonly subscriptionTypes?: SubscriptionType[]
  ) {
    super(message);
    this.name = 'WebSocketSubscriptionError';
  }
}

// Message send failed
export class WebSocketSendError extends WebSocketError {
  constructor(
    message: string,
    public readonly payload?: unknown
  ) {
    super(message);
    this.name = 'WebSocketSendError';
  }
}
```

---

## Constants Reference

> **AI AGENT NOTE**: Define these as exported constants in `src/websocket/types.ts`.

```typescript
// ============================================================================
// CONSTANTS
// ============================================================================

/** Default WebSocket URLs */
export const WEBSOCKET_URLS = {
  SUBSCRIBER: 'wss://rtls.ubudu.com/api/ws/subscriber',
  PUBLISHER: 'wss://rtls.ubudu.com/api/ws/publisher',
} as const;

/** Default configuration values */
export const WEBSOCKET_DEFAULTS = {
  RECONNECT_INTERVAL_MS: 5000,
  MAX_RECONNECT_DELAY_MS: 30000,
  CONNECTION_TIMEOUT_MS: 10000,
  MAX_RECONNECT_ATTEMPTS: Infinity,
} as const;

/** Position origin values */
export const POSITION_ORIGIN = {
  GEOLOCATION: 1,
  INDOOR_SDK: 2,
  UWB: 3,
  EXTERNAL_API: 4, // Use this for published positions
} as const;

/** WebSocket close codes */
export const WS_CLOSE_CODES = {
  NORMAL_CLOSURE: 1000,
  GOING_AWAY: 1001,
  PROTOCOL_ERROR: 1002,
  ABNORMAL_CLOSURE: 1006,
  NO_STATUS: 1005,
} as const;
```

---

## API Contract (Public Interface)

> **AI AGENT NOTE**: This is the public API that MUST be implemented. All methods must match these signatures.

### RtlsWebSocketSubscriber

```typescript
export class RtlsWebSocketSubscriber {
  constructor(config: WebSocketSubscriberConfig);

  // Connection
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;
  getConnectionStatus(): ConnectionStatus;

  // Subscription
  subscribe(types: SubscriptionType | SubscriptionType[]): Promise<SubscriptionResult>;
  unsubscribe(types: SubscriptionType | SubscriptionType[]): Promise<void>;
  getActiveSubscriptions(): SubscriptionType[];

  // Event handling
  on<T extends keyof SubscriberEventMap>(
    event: T,
    handler: (data: SubscriberEventMap[T]) => void
  ): () => void;
  off<T extends keyof SubscriberEventMap>(
    event: T,
    handler: (data: SubscriberEventMap[T]) => void
  ): void;
}
```

### RtlsWebSocketPublisher

```typescript
export class RtlsWebSocketPublisher {
  constructor(config: WebSocketPublisherConfig);

  // Connection
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;
  getConnectionStatus(): ConnectionStatus;

  // Publishing
  sendPosition(data: PublishPositionData): Promise<SendResult>;
  sendBatch(positions: PublishPositionData[]): Promise<BatchSendResult>;

  // Event handling
  on<T extends keyof PublisherEventMap>(
    event: T,
    handler: (data: PublisherEventMap[T]) => void
  ): () => void;
  off<T extends keyof PublisherEventMap>(
    event: T,
    handler: (data: PublisherEventMap[T]) => void
  ): void;
}
```

### RtlsWebSocketClient (Unified)

```typescript
export class RtlsWebSocketClient {
  constructor(config: WebSocketClientConfig);

  // Connection (both)
  connect(options?: { subscriberOnly?: boolean; publisherOnly?: boolean }): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;
  isSubscriberConnected(): boolean;
  isPublisherConnected(): boolean;
  getConnectionStatus(): UnifiedConnectionStatus;

  // Subscriber delegation
  subscribe(types: SubscriptionType | SubscriptionType[]): Promise<SubscriptionResult>;
  unsubscribe(types: SubscriptionType | SubscriptionType[]): Promise<void>;
  getActiveSubscriptions(): SubscriptionType[];

  // Publisher delegation
  sendPosition(data: PublishPositionData): Promise<SendResult>;
  sendBatch(positions: PublishPositionData[]): Promise<BatchSendResult>;

  // Event handling (subscriber events)
  on<T extends keyof SubscriberEventMap>(
    event: T,
    handler: (data: SubscriberEventMap[T]) => void
  ): () => void;
  off<T extends keyof SubscriberEventMap>(
    event: T,
    handler: (data: SubscriberEventMap[T]) => void
  ): void;
}
```

---

## Package.json Changes

> **AI AGENT NOTE**: Make these exact changes to `package.json` in Phase 7.

```jsonc
{
  // Add to "peerDependencies"
  "peerDependencies": {
    "ws": "^8.0.0"  // Only needed for Node.js environments
  },

  // Add to "peerDependenciesMeta"
  "peerDependenciesMeta": {
    "ws": {
      "optional": true  // Not needed in browser
    }
  },

  // Add to "scripts"
  "scripts": {
    // ... existing scripts ...
    "test:ws": "vitest run --config vitest.websocket.config.ts",
    "test:ws:watch": "vitest watch --config vitest.websocket.config.ts",
    "test:ws:integration": "vitest run --config vitest.websocket.config.ts test/websocket/*.integration.test.ts"
  },

  // Add to "exports" (if using conditional exports)
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "require": "./dist/index.cjs",
      "types": "./dist/index.d.ts"
    },
    "./websocket": {
      "import": "./dist/websocket/index.js",
      "require": "./dist/websocket/index.cjs",
      "types": "./dist/websocket/index.d.ts"
    }
  }
}
```

---

## Phase 1: Type Definitions (9 tasks)

### Task 1.1: Create base WebSocket types file
**File**: `src/websocket/types.ts`

```typescript
// ============================================================================
// CONNECTION TYPES
// ============================================================================

/** WebSocket connection state */
export type ConnectionState =
  | 'DISCONNECTED'
  | 'CONNECTING'
  | 'CONNECTED'
  | 'CLOSING'
  | 'RECONNECTING';

/** Authentication method for WebSocket connection */
export type WebSocketAuthMethod = 'apiKey' | 'token';

/** Base configuration shared by all WebSocket clients */
export interface WebSocketBaseConfig {
  /** API key for authentication (sent as ?apiKey=) */
  apiKey?: string;
  /** JWT token for authentication (sent as ?token=) */
  token?: string;
  /** Application namespace (required for subscription) */
  namespace: string;
  /** Enable debug logging */
  debug?: boolean;
  /** Reconnection interval in ms (default: 5000) */
  reconnectInterval?: number;
  /** Maximum reconnection attempts (default: Infinity) */
  maxReconnectAttempts?: number;
  /** Connection timeout in ms (default: 10000) */
  connectionTimeout?: number;
}

/** Subscriber-specific configuration */
export interface WebSocketSubscriberConfig extends WebSocketBaseConfig {
  /** WebSocket URL for subscriber (default: wss://rtls.ubudu.com/api/ws/subscriber) */
  subscriberUrl?: string;
  /** Optional map UUID filter */
  mapUuid?: string;
}

/** Publisher-specific configuration */
export interface WebSocketPublisherConfig extends WebSocketBaseConfig {
  /** WebSocket URL for publisher (default: wss://rtls.ubudu.com/api/ws/publisher) */
  publisherUrl?: string;
  /** Map UUID (required for publishing) */
  mapUuid: string;
}

/** Unified client configuration */
export interface WebSocketClientConfig extends WebSocketBaseConfig {
  /** WebSocket URL for subscriber */
  subscriberUrl?: string;
  /** WebSocket URL for publisher */
  publisherUrl?: string;
  /** Map UUID (required for publishing) */
  mapUuid?: string;
}

// ============================================================================
// SUBSCRIPTION TYPES
// ============================================================================

/** Available subscription types matching server expectations */
export const SubscriptionType = {
  POSITIONS: 'POSITIONS',
  ZONES_ENTRIES_EVENTS: 'ZONES_ENTRIES_EVENTS',
  ZONE_STATS_EVENTS: 'ZONE_STATS_EVENTS',
  ALERTS: 'ALERTS',
  ASSETS: 'ASSETS',
} as const;

export type SubscriptionType = (typeof SubscriptionType)[keyof typeof SubscriptionType];

/** Message sent to server to subscribe */
export interface SubscribeMessage {
  type: 'SUBSCRIBE';
  app_namespace: string;
  map_uuid?: string;
  data_type_filter?: SubscriptionType[];
}

/** Server confirmation of subscription */
export interface SubscriptionConfirmation {
  type: 'SUBSCRIPTION_CONFIRMATION';
  types?: SubscriptionType[];
  action?: 'subscribeEvent';
  app_namespace?: string;
}

// ============================================================================
// POSITION MESSAGE TYPES
// ============================================================================

/** Device info included in position messages */
export interface DeviceInfo {
  model?: string;
  system_build_number?: string;
  system_name?: string;
  system_version?: string;
}

/** Position message from server */
export interface PositionMessage {
  /** Application namespace */
  app_namespace: string;
  /** Latitude coordinate */
  lat: number;
  /** Longitude coordinate */
  lon: number;
  /** Device identifier (MAC address without colons) */
  user_uuid?: string;
  /** Alternative device identifier */
  user_udid?: string;
  /** User-friendly name */
  user_name?: string;
  /** Device type (e.g., 'tag') */
  user_type?: string;
  /** Device model */
  model?: string;
  /** Map UUID */
  map_uuid?: string;
  /** Timestamp (ISO string or Unix ms) */
  timestamp?: string | number;
  /** Visual color for the tag */
  color?: string;
  /** Origin type (4 = external system) */
  origin?: number;
  /** Device information */
  device_info?: DeviceInfo;
  /** Custom data object */
  data?: Record<string, unknown>;
  /** Message type (if present) */
  type?: 'POSITIONS' | string;
}

/** Position data for publishing */
export interface PublishPositionData {
  /** MAC address of the tag (with or without colons) */
  macAddress: string;
  /** Latitude coordinate */
  latitude: number;
  /** Longitude coordinate */
  longitude: number;
  /** Optional: Tag model name */
  model?: string;
  /** Optional: User-friendly name */
  name?: string;
  /** Optional: Hex color code (e.g., '#FF0000') */
  color?: string;
  /** Optional: Override app namespace */
  appNamespace?: string;
  /** Optional: Override map UUID */
  mapUuid?: string;
  /** Optional: Additional custom data */
  data?: Record<string, unknown>;
}

// ============================================================================
// ZONE EVENT TYPES
// ============================================================================

/** Zone event types */
export type ZoneEventType =
  | 'ENTER_ZONE'
  | 'EXIT_ZONE'
  | 'ENTER'
  | 'EXIT'
  | 'ZONE_ENTRY'
  | 'ZONE_EXIT';

/** Zone geometry (GeoJSON) */
export interface ZoneGeometry {
  type: 'Polygon';
  coordinates: number[][][];
}

/** Zone properties */
export interface ZoneProperties {
  id: number;
  name: string;
  level?: number;
  rgb_color?: string;
  tags?: string[];
  type?: string;
}

/** Zone feature (GeoJSON) */
export interface ZoneFeature {
  type: 'Feature';
  geometry: ZoneGeometry;
  properties: ZoneProperties;
}

/** Zone entry/exit event message */
export interface ZoneEntryExitMessage {
  app_namespace: string;
  map_uuid?: string;
  event_type: ZoneEventType;
  zone?: ZoneFeature | string;
  user_uuid?: string;
  user_udid?: string;
  user_name?: string;
  user_type?: string;
  timestamp?: string | number;
  action?: string;
  data?: Record<string, unknown>;
  type?: 'ZONES_ENTRIES_EVENTS' | string;
}

/** Zone statistics event message */
export interface ZoneStatsMessage {
  app_namespace: string;
  event_type: 'UPDATE_ZONE_COUNTER';
  zone_id?: number;
  zone_name?: string;
  total_count?: number;
  tag_count?: number;
  mobile_count?: number;
  avg_time_seconds?: number;
  timestamp?: string | number;
  type?: 'ZONE_STATS_EVENTS' | string;
}

// ============================================================================
// ALERT/NOTIFICATION TYPES
// ============================================================================

/** Alert notification style */
export type AlertStyle = 'info' | 'warning' | 'error';

/** Alert parameters */
export interface AlertParams {
  /** Alert display style */
  style?: AlertStyle;
  /** Alert title */
  title?: string;
  /** Alert message text */
  text?: string;
  /** Display duration in ms */
  duration?: number;
  /** Minimum seconds between similar alerts */
  coalescence?: number;
  /** Grouping identifier */
  coalescence_group?: string;
  /** Icon to display */
  icon?: string;
  /** Play sound */
  sound?: boolean;
  /** Vibrate device */
  vibration?: boolean;
  /** Priority level */
  priority?: 'low' | 'normal' | 'high';
  /** URL to open on click */
  action_url?: string;
}

/** Alert/notification message */
export interface AlertMessage {
  app_namespace: string;
  map_uuid?: string;
  event_type: 'NOTIFICATION';
  action?: 'notifyEvent';
  user_uuid?: string;
  user_udid?: string;
  user_type?: string;
  zone?: ZoneFeature;
  params: AlertParams;
  timestamp?: string | number;
  type?: 'ALERTS' | 'NOTIFICATION' | string;
  alert_type?: string;
}

// ============================================================================
// ASSET TYPES
// ============================================================================

/** Asset action type */
export type AssetAction = 'update' | 'create' | 'delete';

/** Asset data */
export interface AssetData {
  color?: string;
  createdBy?: string;
  dateChanged?: number;
  dateCreated?: number;
  external_id?: string;
  model?: string;
  path?: string;
  data?: Record<string, unknown>;
  user_motion?: 'moving' | 'stationary' | string;
  user_name?: string;
  user_type?: string;
  user_udid?: string;
  user_uuid?: string;
}

/** Asset message */
export interface AssetMessage {
  action: AssetAction;
  app_namespace: string;
  mac_address: string;
  type: 'assets';
  data?: AssetData;
}

// ============================================================================
// UNIFIED MESSAGE TYPE
// ============================================================================

/** Any message that can be received from the server */
export type WebSocketMessage =
  | PositionMessage
  | ZoneEntryExitMessage
  | ZoneStatsMessage
  | AlertMessage
  | AssetMessage
  | SubscriptionConfirmation
  | Record<string, unknown>;

// ============================================================================
// EVENT TYPES
// ============================================================================

/** Connection event data */
export interface ConnectionEventData {
  timestamp: Date;
}

/** Disconnection event data */
export interface DisconnectionEventData {
  code: number;
  reason: string;
  timestamp: Date;
}

/** Error event data */
export interface ErrorEventData {
  error: Error;
  timestamp: Date;
}

/** Subscriber event map for type-safe event handling */
export interface SubscriberEventMap {
  connected: ConnectionEventData;
  disconnected: DisconnectionEventData;
  error: ErrorEventData;
  message: WebSocketMessage;
  POSITIONS: PositionMessage;
  ZONES_ENTRIES_EVENTS: ZoneEntryExitMessage;
  ZONE_STATS_EVENTS: ZoneStatsMessage;
  ALERTS: AlertMessage;
  ASSETS: AssetMessage;
}

/** Publisher event map */
export interface PublisherEventMap {
  connected: ConnectionEventData;
  disconnected: DisconnectionEventData;
  error: ErrorEventData;
  message: WebSocketMessage;
}

// ============================================================================
// RESULT TYPES
// ============================================================================

/** Result of subscription call */
export interface SubscriptionResult {
  success: boolean;
  types: SubscriptionType[] | 'ALL';
}

/** Result of publish call */
export interface PublishResult {
  success: boolean;
  error?: string;
}

/** Connection status result */
export interface ConnectionStatus {
  state: ConnectionState;
  connectedAt?: Date;
  reconnectAttempts?: number;
}
```

### Task 1.2: Export types from types.ts
Ensure all types are exported with JSDoc comments.

### Task 1.3: Create type guards for message classification
**File**: `src/websocket/types.ts` (append)

```typescript
// ============================================================================
// TYPE GUARDS
// ============================================================================

/** Check if message is a position message */
export function isPositionMessage(msg: WebSocketMessage): msg is PositionMessage {
  if (typeof msg !== 'object' || msg === null) return false;
  const m = msg as Record<string, unknown>;

  // Has explicit type field
  if (m.type === 'POSITIONS') return true;

  // Infer from content: has lat/lon and user identifier
  return (
    typeof m.lat === 'number' &&
    typeof m.lon === 'number' &&
    (typeof m.user_uuid === 'string' || typeof m.user_udid === 'string')
  );
}

/** Check if message is a zone entry/exit event */
export function isZoneEntryExitMessage(msg: WebSocketMessage): msg is ZoneEntryExitMessage {
  if (typeof msg !== 'object' || msg === null) return false;
  const m = msg as Record<string, unknown>;

  if (m.type === 'ZONES_ENTRIES_EVENTS') return true;

  const zoneEvents: string[] = [
    'ENTER_ZONE', 'EXIT_ZONE', 'ENTER', 'EXIT', 'ZONE_ENTRY', 'ZONE_EXIT'
  ];
  return typeof m.event_type === 'string' && zoneEvents.includes(m.event_type);
}

/** Check if message is a zone stats event */
export function isZoneStatsMessage(msg: WebSocketMessage): msg is ZoneStatsMessage {
  if (typeof msg !== 'object' || msg === null) return false;
  const m = msg as Record<string, unknown>;

  return m.type === 'ZONE_STATS_EVENTS' || m.event_type === 'UPDATE_ZONE_COUNTER';
}

/** Check if message is an alert/notification */
export function isAlertMessage(msg: WebSocketMessage): msg is AlertMessage {
  if (typeof msg !== 'object' || msg === null) return false;
  const m = msg as Record<string, unknown>;

  // Explicit type or NOTIFICATION event_type
  if (m.type === 'ALERTS' || m.type === 'NOTIFICATION') return true;
  if (m.event_type === 'NOTIFICATION') return true;

  // Has alert_type field
  if (typeof m.alert_type === 'string') return true;

  // event_type contains ALERT
  return typeof m.event_type === 'string' && m.event_type.includes('ALERT');
}

/** Check if message is an asset event */
export function isAssetMessage(msg: WebSocketMessage): msg is AssetMessage {
  if (typeof msg !== 'object' || msg === null) return false;
  const m = msg as Record<string, unknown>;

  if (m.type === 'assets') return true;
  if (typeof m.asset_id === 'string') return true;

  return typeof m.event_type === 'string' && m.event_type.includes('ASSET');
}

/** Check if message is a subscription confirmation */
export function isSubscriptionConfirmation(msg: WebSocketMessage): msg is SubscriptionConfirmation {
  if (typeof msg !== 'object' || msg === null) return false;
  const m = msg as Record<string, unknown>;

  return m.type === 'SUBSCRIPTION_CONFIRMATION' || m.action === 'subscribeEvent';
}

/** Classify a message and return its type */
export function classifyMessage(msg: WebSocketMessage): SubscriptionType | 'UNKNOWN' | 'CONFIRMATION' {
  if (isSubscriptionConfirmation(msg)) return 'CONFIRMATION';
  if (isPositionMessage(msg)) return SubscriptionType.POSITIONS;
  if (isZoneEntryExitMessage(msg)) return SubscriptionType.ZONES_ENTRIES_EVENTS;
  if (isZoneStatsMessage(msg)) return SubscriptionType.ZONE_STATS_EVENTS;
  if (isAlertMessage(msg)) return SubscriptionType.ALERTS;
  if (isAssetMessage(msg)) return SubscriptionType.ASSETS;
  return 'UNKNOWN';
}
```

### Task 1.4-1.9: Create remaining type exports
- Task 1.4: Add WebSocket error types (WebSocketError, ConnectionError, AuthenticationError, SubscriptionError)
- Task 1.5: Add reconnection strategy types
- Task 1.6: Add connection options type with all configurable parameters
- Task 1.7: Add type tests to verify type guards work correctly
- Task 1.8: Add JSDoc documentation to all exported types
- Task 1.9: Add MAC address normalization utility (see "MAC Address Normalization Utility" section above)

### Phase 1 Verification Checklist

> **AI AGENT**: Complete all items before proceeding to Phase 2.

- [ ] File `src/websocket/types.ts` exists with all types exported
- [ ] `ConnectionState` type includes all 5 states
- [ ] `SubscriptionType` const object and type are defined
- [ ] All 5 message types defined: `PositionMessage`, `ZoneEntryExitMessage`, `ZoneStatsMessage`, `AlertMessage`, `AssetMessage`
- [ ] All 6 type guards implemented: `isPositionMessage`, `isZoneEntryExitMessage`, `isZoneStatsMessage`, `isAlertMessage`, `isAssetMessage`, `isSubscriptionConfirmation`
- [ ] `classifyMessage` function returns correct type for each message type
- [ ] `normalizeMacAddress` and `isValidMacAddress` functions work correctly
- [ ] Run `npm run typecheck` - no errors
- [ ] Run `npm run lint` - no errors in new files

---

## Phase 2: Event Emitter Utilities (4 tasks)

### Task 2.1: Create typed event emitter
**File**: `src/websocket/events.ts`

```typescript
/**
 * Type-safe event emitter for WebSocket clients
 */

/** Event handler function type */
export type EventHandler<T> = (data: T) => void;

/** Generic event map interface */
export type EventMap = Record<string, unknown>;

/**
 * Type-safe event emitter class
 *
 * @example
 * ```typescript
 * interface MyEvents {
 *   message: { text: string };
 *   error: Error;
 * }
 *
 * const emitter = new TypedEventEmitter<MyEvents>();
 * emitter.on('message', (data) => console.log(data.text));
 * emitter.emit('message', { text: 'hello' });
 * ```
 */
export class TypedEventEmitter<TEvents extends EventMap> {
  private handlers: Map<keyof TEvents, Set<EventHandler<unknown>>> = new Map();

  /**
   * Register an event handler
   * @param event - Event name to listen for
   * @param handler - Function to call when event is emitted
   * @returns Unsubscribe function
   */
  on<K extends keyof TEvents>(event: K, handler: EventHandler<TEvents[K]>): () => void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    this.handlers.get(event)!.add(handler as EventHandler<unknown>);

    // Return unsubscribe function
    return () => this.off(event, handler);
  }

  /**
   * Register a one-time event handler
   * @param event - Event name to listen for
   * @param handler - Function to call once when event is emitted
   * @returns Unsubscribe function
   */
  once<K extends keyof TEvents>(event: K, handler: EventHandler<TEvents[K]>): () => void {
    const wrappedHandler: EventHandler<TEvents[K]> = (data) => {
      this.off(event, wrappedHandler);
      handler(data);
    };
    return this.on(event, wrappedHandler);
  }

  /**
   * Remove an event handler
   * @param event - Event name
   * @param handler - Handler to remove
   */
  off<K extends keyof TEvents>(event: K, handler: EventHandler<TEvents[K]>): void {
    const eventHandlers = this.handlers.get(event);
    if (eventHandlers) {
      eventHandlers.delete(handler as EventHandler<unknown>);
    }
  }

  /**
   * Remove all handlers for an event (or all events)
   * @param event - Optional event name (all events if not provided)
   */
  removeAllListeners<K extends keyof TEvents>(event?: K): void {
    if (event) {
      this.handlers.delete(event);
    } else {
      this.handlers.clear();
    }
  }

  /**
   * Emit an event to all registered handlers
   * @param event - Event name
   * @param data - Event data
   */
  protected emit<K extends keyof TEvents>(event: K, data: TEvents[K]): void {
    const eventHandlers = this.handlers.get(event);
    if (eventHandlers) {
      for (const handler of eventHandlers) {
        try {
          (handler as EventHandler<TEvents[K]>)(data);
        } catch (error) {
          console.error(`Error in event handler for "${String(event)}":`, error);
        }
      }
    }
  }

  /**
   * Get the number of listeners for an event
   * @param event - Event name
   */
  listenerCount<K extends keyof TEvents>(event: K): number {
    return this.handlers.get(event)?.size ?? 0;
  }

  /**
   * Check if an event has any listeners
   * @param event - Event name
   */
  hasListeners<K extends keyof TEvents>(event: K): boolean {
    return this.listenerCount(event) > 0;
  }
}
```

### Task 2.2: Add event emitter tests
### Task 2.3: Add debug logging utility
### Task 2.4: Export event utilities from index

### Phase 2 Verification Checklist

- [ ] File `src/websocket/events.ts` exists
- [ ] `TypedEventEmitter` class implements: `on`, `once`, `off`, `removeAllListeners`, `emit`
- [ ] Event handlers are type-safe (correct data types for each event)
- [ ] `on()` returns unsubscribe function
- [ ] Run `npm run test` - event emitter tests pass

---

## Phase 3: Base Connection Class (6 tasks)

### Task 3.1: Create base WebSocket connection class
**File**: `src/websocket/connection.ts`

```typescript
import { TypedEventEmitter } from './events';
import type {
  ConnectionState,
  WebSocketBaseConfig,
  ConnectionEventData,
  DisconnectionEventData,
  ErrorEventData,
  WebSocketMessage,
} from './types';

/** Default configuration values */
const DEFAULTS = {
  SUBSCRIBER_URL: 'wss://rtls.ubudu.com/api/ws/subscriber',
  PUBLISHER_URL: 'wss://rtls.ubudu.com/api/ws/publisher',
  RECONNECT_INTERVAL: 5000,
  MAX_RECONNECT_ATTEMPTS: Infinity,
  CONNECTION_TIMEOUT: 10000,
};

/** Base events shared by all WebSocket clients */
interface BaseWebSocketEvents {
  connected: ConnectionEventData;
  disconnected: DisconnectionEventData;
  error: ErrorEventData;
  message: WebSocketMessage;
}

/**
 * Base WebSocket connection manager
 * Handles connection lifecycle, reconnection, and authentication
 */
export abstract class BaseWebSocketConnection<
  TEvents extends BaseWebSocketEvents = BaseWebSocketEvents
> extends TypedEventEmitter<TEvents> {
  protected ws: WebSocket | null = null;
  protected config: Required<WebSocketBaseConfig>;
  protected state: ConnectionState = 'DISCONNECTED';
  protected reconnectAttempts = 0;
  protected reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  protected connectionPromise: Promise<void> | null = null;
  protected connectedAt: Date | null = null;

  constructor(config: WebSocketBaseConfig, protected baseUrl: string) {
    super();

    // Validate auth
    if (!config.apiKey && !config.token) {
      throw new Error('Either apiKey or token is required for WebSocket authentication');
    }

    if (!config.namespace) {
      throw new Error('namespace is required');
    }

    this.config = {
      apiKey: config.apiKey ?? '',
      token: config.token ?? '',
      namespace: config.namespace,
      debug: config.debug ?? false,
      reconnectInterval: config.reconnectInterval ?? DEFAULTS.RECONNECT_INTERVAL,
      maxReconnectAttempts: config.maxReconnectAttempts ?? DEFAULTS.MAX_RECONNECT_ATTEMPTS,
      connectionTimeout: config.connectionTimeout ?? DEFAULTS.CONNECTION_TIMEOUT,
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
    if (this.config.debug) {
      const prefix = `[${this.constructor.name}]`;
      if (data !== undefined) {
        console.log(`${prefix} ${message}`, data);
      } else {
        console.log(`${prefix} ${message}`);
      }
    }
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
      if (this.ws) {
        try {
          this.ws.close();
        } catch {
          // Ignore close errors
        }
      }

      // Create WebSocket
      // Note: In browser, use native WebSocket
      // In Node.js, the 'ws' package is needed (peer dependency)
      if (typeof WebSocket !== 'undefined') {
        this.ws = new WebSocket(url);
      } else {
        // Node.js environment - require ws package
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const WebSocketNode = require('ws');
        this.ws = new WebSocketNode(url, {
          handshakeTimeout: this.config.connectionTimeout,
        });
      }

      // Connection timeout
      const timeout = setTimeout(() => {
        if (this.state === 'CONNECTING') {
          this.ws?.close();
          const error = new Error('Connection timeout');
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
          console.error('Error parsing WebSocket message:', error);
        }
      };

      // Handle errors
      this.ws.onerror = (event: Event) => {
        clearTimeout(timeout);
        const error = new Error('WebSocket error');
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
        this.state = 'DISCONNECTED';
        this.connectedAt = null;

        this.debug(`Connection closed. Code: ${event.code}, Reason: ${event.reason}`);
        this.emit('disconnected' as keyof TEvents, {
          code: event.code,
          reason: event.reason,
          timestamp: new Date()
        } as TEvents[keyof TEvents]);

        // Attempt reconnection if was connected
        if (wasConnected) {
          this.scheduleReconnect();
        }
      };
    });
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
      return;
    }

    // Exponential backoff with max of 30 seconds
    const delay = Math.min(
      this.config.reconnectInterval * Math.pow(2, this.reconnectAttempts),
      30000
    );

    this.reconnectAttempts++;
    this.state = 'RECONNECTING';

    this.debug(`Scheduling reconnection in ${delay}ms (attempt ${this.reconnectAttempts})`);

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
    // Override in subclasses
  }

  /**
   * Send data over the WebSocket connection
   */
  protected send(data: unknown): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket is not connected');
    }

    const message = typeof data === 'string' ? data : JSON.stringify(data);
    this.debug('Sending:', data);
    this.ws.send(message);
  }

  /**
   * Get current connection status
   */
  getConnectionStatus(): { state: ConnectionState; connectedAt: Date | null; reconnectAttempts: number } {
    return {
      state: this.state,
      connectedAt: this.connectedAt,
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
      return;
    }

    return new Promise((resolve) => {
      this.state = 'CLOSING';

      // Already closed
      if (this.ws!.readyState === WebSocket.CLOSED) {
        this.ws = null;
        this.state = 'DISCONNECTED';
        resolve();
        return;
      }

      // Wait for close event
      const originalOnClose = this.ws!.onclose;
      this.ws!.onclose = (event: CloseEvent) => {
        if (originalOnClose) {
          (originalOnClose as (event: CloseEvent) => void)(event);
        }
        this.ws = null;
        this.state = 'DISCONNECTED';
        resolve();
      };

      // Initiate close
      try {
        this.ws!.close(1000, 'Client disconnect');
      } catch {
        this.ws = null;
        this.state = 'DISCONNECTED';
        resolve();
      }

      // Force resolve after timeout
      setTimeout(() => {
        if (this.ws) {
          try {
            this.ws.close();
          } catch {
            // Ignore
          }
          this.ws = null;
        }
        this.state = 'DISCONNECTED';
        resolve();
      }, 1000);
    });
  }
}
```

### Task 3.2: Add browser/Node.js WebSocket detection
### Task 3.3: Add connection error handling
### Task 3.4: Add exponential backoff reconnection
### Task 3.5: Add connection tests with mock WebSocket
### Task 3.6: Handle WebSocket in both browser and Node environments

### Phase 3 Verification Checklist

- [ ] File `src/websocket/connection.ts` exists
- [ ] `BaseWebSocketConnection` class extends `TypedEventEmitter`
- [ ] `buildUrl()` correctly appends `?apiKey=` or `?token=` query param
- [ ] `connect()` returns a Promise that resolves when connected
- [ ] `scheduleReconnect()` uses exponential backoff (5s base, 30s max)
- [ ] Browser detection works: uses native `WebSocket` or `require('ws')`
- [ ] Connection emits `connected`, `disconnected`, `error` events
- [ ] Run `npm run test` - connection tests pass

---

## Phase 4: Subscriber Implementation (8 tasks)

### Task 4.1: Create RtlsWebSocketSubscriber class
**File**: `src/websocket/subscriber.ts`

```typescript
import { BaseWebSocketConnection } from './connection';
import {
  type WebSocketSubscriberConfig,
  type SubscriberEventMap,
  type WebSocketMessage,
  type SubscriptionType,
  type SubscribeMessage,
  type SubscriptionResult,
  SubscriptionType as SubType,
  classifyMessage,
  isSubscriptionConfirmation,
} from './types';

const DEFAULT_SUBSCRIBER_URL = 'wss://rtls.ubudu.com/api/ws/subscriber';

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

  constructor(config: WebSocketSubscriberConfig) {
    super(config, config.subscriberUrl ?? DEFAULT_SUBSCRIBER_URL);
    this.mapUuid = config.mapUuid;
  }

  /**
   * Subscribe to specific event types
   * Must be called after connect() to receive events.
   *
   * @param types - Array of subscription types
   * @returns Promise resolving to subscription result
   *
   * @example
   * ```typescript
   * await subscriber.subscribe([
   *   SubscriptionType.POSITIONS,
   *   SubscriptionType.ALERTS
   * ]);
   * ```
   */
  async subscribe(types: SubscriptionType[] = []): Promise<SubscriptionResult> {
    if (!this.isConnected()) {
      throw new Error('WebSocket not connected. Call connect() first.');
    }

    // Validate types
    const validTypes = Object.values(SubType) as SubscriptionType[];
    const invalidTypes = types.filter(t => !validTypes.includes(t));
    if (invalidTypes.length > 0) {
      throw new Error(
        `Invalid subscription type(s): ${invalidTypes.join(', ')}. ` +
        `Valid types: ${validTypes.join(', ')}`
      );
    }

    // Build subscription message
    const message: SubscribeMessage = {
      type: 'SUBSCRIBE',
      app_namespace: this.config.namespace,
    };

    if (this.mapUuid) {
      message.map_uuid = this.mapUuid;
    }

    if (types.length > 0) {
      message.data_type_filter = types;
    }

    this.debug('Sending SUBSCRIBE:', message);

    // Create promise for subscription confirmation
    this.subscriptionPromise = new Promise((resolve, reject) => {
      this.subscriptionResolver = resolve;
      this.subscriptionRejecter = reject;

      // Timeout after 10 seconds
      this.subscriptionTimeout = setTimeout(() => {
        this.subscriptionRejecter?.(new Error('Subscription confirmation timeout'));
        this.cleanupSubscriptionPromise();
      }, 10000);
    });

    // Send subscription message
    this.send(message);

    // Store active subscriptions
    this.activeSubscriptions = types;

    return this.subscriptionPromise;
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
      // Type assertion needed because of conditional types
      switch (messageType) {
        case SubType.POSITIONS:
          this.emit('POSITIONS', data as SubscriberEventMap['POSITIONS']);
          break;
        case SubType.ZONES_ENTRIES_EVENTS:
          this.emit('ZONES_ENTRIES_EVENTS', data as SubscriberEventMap['ZONES_ENTRIES_EVENTS']);
          break;
        case SubType.ZONE_STATS_EVENTS:
          this.emit('ZONE_STATS_EVENTS', data as SubscriberEventMap['ZONE_STATS_EVENTS']);
          break;
        case SubType.ALERTS:
          this.emit('ALERTS', data as SubscriberEventMap['ALERTS']);
          break;
        case SubType.ASSETS:
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
      return;
    }

    this.debug('Subscription confirmed:', data);

    const result: SubscriptionResult = {
      success: true,
      types: (data as Record<string, unknown>).types as SubscriptionType[] ?? 'ALL',
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
    if (this.activeSubscriptions.length > 0) {
      this.debug('Re-subscribing after reconnection');
      this.subscribe(this.activeSubscriptions).catch(error => {
        console.error('Failed to re-subscribe after reconnection:', error);
      });
    }
  }
}
```

### Task 4.2: Add subscription management
### Task 4.3: Add message routing to event handlers
### Task 4.4: Add re-subscription on reconnect
### Task 4.5: Add subscription timeout handling
### Task 4.6: Write subscriber unit tests
### Task 4.7: Write subscriber integration tests (live API)
### Task 4.8: Add subscriber examples

### Phase 4 Verification Checklist

- [ ] File `src/websocket/subscriber.ts` exists
- [ ] `RtlsWebSocketSubscriber` extends `BaseWebSocketConnection`
- [ ] `subscribe()` returns Promise that resolves on server confirmation
- [ ] Handles both confirmation formats: `type: 'SUBSCRIPTION_CONFIRMATION'` and `action: 'subscribeEvent'`
- [ ] `handleMessage()` routes messages to correct event handlers using type guards
- [ ] Re-subscribes automatically on reconnection
- [ ] `getActiveSubscriptions()` returns current subscription types
- [ ] Run `npm run test` - subscriber tests pass

---

## Phase 5: Publisher Implementation (7 tasks)

### Task 5.1: Create RtlsWebSocketPublisher class
**File**: `src/websocket/publisher.ts`

```typescript
import { BaseWebSocketConnection } from './connection';
import {
  type WebSocketPublisherConfig,
  type PublisherEventMap,
  type WebSocketMessage,
  type PublishPositionData,
  type PublishResult,
  type DeviceInfo,
} from './types';

const DEFAULT_PUBLISHER_URL = 'wss://rtls.ubudu.com/api/ws/publisher';

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
    super(config, config.publisherUrl ?? DEFAULT_PUBLISHER_URL);

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
      return {
        success: false,
        error: (error as Error).message,
      };
    }
  }

  /**
   * Build a position message for the RTLS server
   */
  private buildPositionMessage(data: PublishPositionData): Record<string, unknown> {
    // Format MAC address: lowercase, no colons
    const formattedMac = data.macAddress.toLowerCase().replace(/:/g, '');

    const deviceInfo: DeviceInfo = {
      model: 'GNSS',
      system_build_number: '1.0',
      system_name: 'UbuduRtlsSdk',
      system_version: '1.0',
    };

    return {
      app_namespace: data.appNamespace ?? this.config.namespace,
      device_info: deviceInfo,
      data: data.data ?? {},
      lat: data.latitude,
      lon: data.longitude,
      map_uuid: data.mapUuid ?? this.mapUuid,
      model: data.model ?? 'GenericTag',
      origin: 4, // External system
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
}
```

### Task 5.2: Add position message formatting
### Task 5.3: Add batch position publishing
### Task 5.4: Add send queue for reliability
### Task 5.5: Write publisher unit tests
### Task 5.6: Write publisher integration tests
### Task 5.7: Add publisher examples

### Phase 5 Verification Checklist

- [ ] File `src/websocket/publisher.ts` exists
- [ ] `RtlsWebSocketPublisher` extends `BaseWebSocketConnection`
- [ ] Constructor requires `mapUuid` - throws if missing
- [ ] `sendPosition()` normalizes MAC address to lowercase without colons
- [ ] `buildPositionMessage()` includes all required fields: `app_namespace`, `lat`, `lon`, `map_uuid`, `user_uuid`, `origin: 4`
- [ ] Returns `{ success: boolean, error?: string }` result
- [ ] Run `npm run test` - publisher tests pass

---

## Phase 6: Unified Client (6 tasks)

### Task 6.1: Create RtlsWebSocketClient class
**File**: `src/websocket/client.ts`

```typescript
import { RtlsWebSocketSubscriber } from './subscriber';
import { RtlsWebSocketPublisher } from './publisher';
import {
  type WebSocketClientConfig,
  type SubscriberEventMap,
  type SubscriptionType,
  type SubscriptionResult,
  type PublishPositionData,
  type PublishResult,
  type ConnectionStatus,
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
  private publisherConnected = false;
  private subscriberConnected = false;
  private config: WebSocketClientConfig;

  constructor(config: WebSocketClientConfig) {
    if (!config.namespace) {
      throw new Error('namespace is required');
    }

    if (!config.apiKey && !config.token) {
      throw new Error('Either apiKey or token is required');
    }

    this.config = config;

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
   */
  async subscribe(types: SubscriptionType[]): Promise<SubscriptionResult> {
    return this.subscriber.subscribe(types);
  }

  /**
   * Register an event handler
   */
  on<K extends keyof SubscriberEventMap>(
    event: K,
    handler: (data: SubscriberEventMap[K]) => void
  ): () => void {
    return this.subscriber.on(event, handler);
  }

  /**
   * Send a position update
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
   * Get connection status for both publisher and subscriber
   */
  getConnectionStatus(): { publisher: ConnectionStatus | null; subscriber: ConnectionStatus } {
    return {
      publisher: this.publisher?.getConnectionStatus() ?? null,
      subscriber: this.subscriber.getConnectionStatus(),
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
   * Disconnect from all WebSocket servers
   */
  async disconnect(): Promise<void> {
    const promises: Promise<void>[] = [];

    if (this.subscriberConnected) {
      promises.push(
        this.subscriber.disconnect().then(() => {
          this.subscriberConnected = false;
        })
      );
    }

    if (this.publisherConnected && this.publisher) {
      promises.push(
        this.publisher.disconnect().then(() => {
          this.publisherConnected = false;
        })
      );
    }

    await Promise.all(promises);
  }
}
```

### Task 6.2: Add convenience methods delegating to subscriber/publisher
### Task 6.3: Add connection status aggregation
### Task 6.4: Write unified client unit tests
### Task 6.5: Write unified client integration tests
### Task 6.6: Add unified client examples

### Phase 6 Verification Checklist

- [ ] File `src/websocket/client.ts` exists
- [ ] `RtlsWebSocketClient` manages both subscriber and publisher
- [ ] `connect()` accepts options: `{ publisherOnly?, subscriberOnly? }`
- [ ] `getConnectionStatus()` returns status for both connections
- [ ] Delegates `on()` to subscriber, `sendPosition()` to publisher
- [ ] `disconnect()` closes both connections
- [ ] Run `npm run test` - unified client tests pass

---

## Phase 7: SDK Integration (5 tasks)

### Task 7.1: Add createWebSocket method to RtlsClient
**File**: `src/client/index.ts` (modify)

```typescript
// Add import at top
import { RtlsWebSocketClient, type WebSocketClientConfig } from '../websocket';

// Add method to RtlsClient class:

  /**
   * Create a WebSocket client that shares configuration with this client
   *
   * @param options - Additional WebSocket-specific options
   * @returns Configured WebSocket client
   *
   * @example
   * ```typescript
   * const client = new RtlsClient({ apiKey: 'key', namespace: 'ns' });
   * const ws = client.createWebSocket({ mapUuid: 'map-id' });
   *
   * ws.on('POSITIONS', (pos) => console.log(pos));
   * await ws.connect();
   * await ws.subscribe([SubscriptionType.POSITIONS]);
   * ```
   */
  createWebSocket(options?: Partial<WebSocketClientConfig>): RtlsWebSocketClient {
    return new RtlsWebSocketClient({
      apiKey: this.options.apiKey,
      namespace: this._context.namespace ?? '',
      ...options,
    });
  }
```

### Task 7.2: Export WebSocket types and classes from main index
**File**: `src/index.ts` (modify)

```typescript
// Add WebSocket exports
export {
  RtlsWebSocketClient,
  RtlsWebSocketSubscriber,
  RtlsWebSocketPublisher,
} from './websocket';

export {
  SubscriptionType,
  type WebSocketClientConfig,
  type WebSocketSubscriberConfig,
  type WebSocketPublisherConfig,
  type SubscriberEventMap,
  type PublisherEventMap,
  type PositionMessage,
  type ZoneEntryExitMessage,
  type ZoneStatsMessage,
  type AlertMessage,
  type AssetMessage,
  type PublishPositionData,
  type PublishResult,
  type SubscriptionResult,
  type ConnectionState,
  type ConnectionStatus,
  // Type guards
  isPositionMessage,
  isZoneEntryExitMessage,
  isZoneStatsMessage,
  isAlertMessage,
  isAssetMessage,
} from './websocket';
```

### Task 7.3: Add websocket module exports
**File**: `src/websocket/index.ts`

```typescript
// Classes
export { RtlsWebSocketClient } from './client';
export { RtlsWebSocketSubscriber } from './subscriber';
export { RtlsWebSocketPublisher } from './publisher';

// All types
export * from './types';

// Event utilities
export { TypedEventEmitter } from './events';
```

### Task 7.4: Update package.json with ws peer dependency
### Task 7.5: Update tsconfig for WebSocket browser/Node compatibility

### Phase 7 Verification Checklist

- [ ] `RtlsClient.createWebSocket()` method exists and works
- [ ] WebSocket exports added to `src/index.ts`
- [ ] `ws` added as optional peer dependency in `package.json`
- [ ] `npm run build` succeeds
- [ ] `npm run typecheck` passes

---

## Phase 8: Mock WebSocket for Testing (4 tasks)

### Task 8.1: Create WebSocket mock
**File**: `test/websocket/mocks/websocket.ts`

```typescript
import { vi } from 'vitest';

/**
 * Mock WebSocket for testing
 */
export class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  readyState = MockWebSocket.CONNECTING;
  url: string;

  onopen: ((event: Event) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;

  private messageQueue: unknown[] = [];
  public sentMessages: unknown[] = [];

  constructor(url: string) {
    this.url = url;

    // Auto-open after a tick
    setTimeout(() => {
      this.readyState = MockWebSocket.OPEN;
      this.onopen?.({ type: 'open' } as Event);
    }, 0);
  }

  send(data: string | ArrayBuffer): void {
    if (this.readyState !== MockWebSocket.OPEN) {
      throw new Error('WebSocket is not open');
    }

    const parsed = typeof data === 'string' ? JSON.parse(data) : data;
    this.sentMessages.push(parsed);
  }

  close(code?: number, reason?: string): void {
    this.readyState = MockWebSocket.CLOSING;

    setTimeout(() => {
      this.readyState = MockWebSocket.CLOSED;
      this.onclose?.({
        code: code ?? 1000,
        reason: reason ?? '',
        wasClean: true,
      } as CloseEvent);
    }, 0);
  }

  // Test helpers

  /**
   * Simulate receiving a message
   */
  simulateMessage(data: unknown): void {
    const message = typeof data === 'string' ? data : JSON.stringify(data);
    this.onmessage?.({ data: message } as MessageEvent);
  }

  /**
   * Simulate connection error
   */
  simulateError(error?: Error): void {
    this.onerror?.({ type: 'error', error } as unknown as Event);
  }

  /**
   * Simulate connection close
   */
  simulateClose(code = 1000, reason = ''): void {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.({ code, reason, wasClean: true } as CloseEvent);
  }

  /**
   * Get messages sent by the client
   */
  getSentMessages(): unknown[] {
    return this.sentMessages;
  }

  /**
   * Clear sent messages
   */
  clearSentMessages(): void {
    this.sentMessages = [];
  }
}

/**
 * Setup WebSocket mock for tests
 */
export function setupWebSocketMock(): void {
  vi.stubGlobal('WebSocket', MockWebSocket);
}

/**
 * Clean up WebSocket mock
 */
export function teardownWebSocketMock(): void {
  vi.unstubAllGlobals();
}

/**
 * Create a mock WebSocket and capture the instance
 */
export function createMockWebSocket(url: string): MockWebSocket {
  return new MockWebSocket(url);
}
```

### Task 8.2: Add MSW handlers for WebSocket (if possible)
### Task 8.3: Create test utilities for WebSocket testing
### Task 8.4: Add test fixtures for common message types

### Phase 8 Verification Checklist

- [ ] File `test/websocket/mocks/websocket.ts` exists
- [ ] `WebSocketMock` simulates: `CONNECTING → OPEN → CLOSING → CLOSED` lifecycle
- [ ] Mock responds to `SUBSCRIBE` messages with confirmation
- [ ] `setupWebSocketMock()` and `teardownWebSocketMock()` utilities work
- [ ] Test fixtures exist for all 5 message types

---

## Phase 9: Unit Tests (6 tasks)

### Task 9.1: Write event emitter tests
**File**: `test/websocket/events.test.ts`

```typescript
import { describe, it, expect, vi } from 'vitest';
import { TypedEventEmitter } from '../../src/websocket/events';

interface TestEvents {
  message: { text: string };
  error: Error;
  count: number;
}

describe('TypedEventEmitter', () => {
  it('should emit events to registered handlers', () => {
    const emitter = new TypedEventEmitter<TestEvents>();
    const handler = vi.fn();

    emitter.on('message', handler);
    emitter['emit']('message', { text: 'hello' });

    expect(handler).toHaveBeenCalledWith({ text: 'hello' });
  });

  it('should return unsubscribe function', () => {
    const emitter = new TypedEventEmitter<TestEvents>();
    const handler = vi.fn();

    const unsubscribe = emitter.on('message', handler);
    unsubscribe();

    emitter['emit']('message', { text: 'hello' });
    expect(handler).not.toHaveBeenCalled();
  });

  it('should handle once listeners', () => {
    const emitter = new TypedEventEmitter<TestEvents>();
    const handler = vi.fn();

    emitter.once('message', handler);

    emitter['emit']('message', { text: 'first' });
    emitter['emit']('message', { text: 'second' });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith({ text: 'first' });
  });

  it('should remove all listeners', () => {
    const emitter = new TypedEventEmitter<TestEvents>();
    const handler1 = vi.fn();
    const handler2 = vi.fn();

    emitter.on('message', handler1);
    emitter.on('error', handler2);

    emitter.removeAllListeners();

    emitter['emit']('message', { text: 'test' });
    emitter['emit']('error', new Error('test'));

    expect(handler1).not.toHaveBeenCalled();
    expect(handler2).not.toHaveBeenCalled();
  });

  it('should count listeners correctly', () => {
    const emitter = new TypedEventEmitter<TestEvents>();

    expect(emitter.listenerCount('message')).toBe(0);

    const unsub1 = emitter.on('message', () => {});
    const unsub2 = emitter.on('message', () => {});

    expect(emitter.listenerCount('message')).toBe(2);

    unsub1();
    expect(emitter.listenerCount('message')).toBe(1);
  });
});
```

### Task 9.2: Write type guard tests
### Task 9.3: Write subscriber unit tests
### Task 9.4: Write publisher unit tests
### Task 9.5: Write unified client unit tests
### Task 9.6: Write connection base class tests

### Phase 9 Verification Checklist

- [ ] All test files exist in `test/websocket/`
- [ ] Run `npm run test` - all unit tests pass
- [ ] Run `npm run test:coverage` - coverage > 80% for websocket files
- [ ] Type guards are tested with valid and invalid inputs
- [ ] Event emitter tested for: `on`, `once`, `off`, unsubscribe function

---

## Phase 10: Integration Tests (4 tasks)

### Task 10.1: Create WebSocket integration test config
**File**: `vitest.websocket.config.ts`

```typescript
import { defineConfig } from 'vitest/config';
import dotenv from 'dotenv';

dotenv.config();

export default defineConfig({
  test: {
    include: ['test/websocket/**/*.integration.test.ts'],
    testTimeout: 30000,
    hookTimeout: 10000,
  },
});
```

### Task 10.2: Write subscriber integration tests
**File**: `test/websocket/subscriber.integration.test.ts`

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { RtlsWebSocketSubscriber, SubscriptionType } from '../../src/websocket';

// Skip if no credentials
const hasCredentials = process.env.RTLS_API_KEY && process.env.APP_NAMESPACE;

describe.skipIf(!hasCredentials)('RtlsWebSocketSubscriber Integration', () => {
  let subscriber: RtlsWebSocketSubscriber;

  beforeAll(() => {
    subscriber = new RtlsWebSocketSubscriber({
      apiKey: process.env.RTLS_API_KEY!,
      namespace: process.env.APP_NAMESPACE!,
      debug: true,
    });
  });

  afterAll(async () => {
    await subscriber.disconnect();
  });

  it('should connect to the server', async () => {
    await subscriber.connect();
    expect(subscriber.isConnected()).toBe(true);
  });

  it('should subscribe to positions', async () => {
    const result = await subscriber.subscribe([SubscriptionType.POSITIONS]);
    expect(result.success).toBe(true);
  });

  it('should receive position messages', async () => {
    const positions: unknown[] = [];

    subscriber.on('POSITIONS', (pos) => {
      positions.push(pos);
    });

    // Wait for some messages (may timeout if no active tags)
    await new Promise(resolve => setTimeout(resolve, 5000));

    // This test may pass or fail depending on whether there are active tags
    console.log(`Received ${positions.length} position messages`);
  });
});
```

### Task 10.3: Write publisher integration tests
### Task 10.4: Add integration test npm script

### Phase 10 Verification Checklist

- [ ] Integration test config exists: `vitest.websocket.config.ts`
- [ ] `.env` has `APP_NAMESPACE` and `RTLS_API_KEY` for testing
- [ ] Run `npm run test:integration` - all integration tests pass
- [ ] Subscriber can connect and receive real events
- [ ] Publisher can send positions and verify receipt

---

## Phase 11: Documentation (4 tasks)

### Task 11.1: Add WebSocket guide
**File**: `docs/guides/websocket.md`

```markdown
# WebSocket Real-Time Streaming Guide

This guide covers real-time data streaming using the SDK's WebSocket client.

## Overview

The RTLS WebSocket API provides real-time streaming of:
- **Positions**: Tag location updates
- **Zone Events**: Entry/exit notifications
- **Zone Stats**: Occupancy counters
- **Alerts**: System notifications
- **Assets**: Asset CRUD events

## Quick Start

### Subscriber Only

```typescript
import { RtlsWebSocketSubscriber, SubscriptionType } from 'ubudu-rtls-sdk';

const subscriber = new RtlsWebSocketSubscriber({
  apiKey: 'your-api-key',
  namespace: 'your-namespace',
});

// Register handlers BEFORE connecting
subscriber.on('POSITIONS', (position) => {
  console.log(`Tag ${position.user_uuid} at ${position.lat}, ${position.lon}`);
});

subscriber.on('ALERTS', (alert) => {
  console.log(`Alert: ${alert.params.title}`);
});

// Connect and subscribe
await subscriber.connect();
await subscriber.subscribe([
  SubscriptionType.POSITIONS,
  SubscriptionType.ALERTS,
]);

// Later: disconnect
await subscriber.disconnect();
```

### Publisher Only

```typescript
import { RtlsWebSocketPublisher } from 'ubudu-rtls-sdk';

const publisher = new RtlsWebSocketPublisher({
  apiKey: 'your-api-key',
  namespace: 'your-namespace',
  mapUuid: 'your-map-uuid', // Required for publishing
});

await publisher.connect();

// Send a position
const result = await publisher.sendPosition({
  macAddress: 'aabbccddeeff',
  latitude: 48.8566,
  longitude: 2.3522,
  name: 'Forklift-42',
  color: '#FF5500',
});

console.log(result.success); // true

await publisher.disconnect();
```

### Unified Client

```typescript
import { RtlsWebSocketClient, SubscriptionType } from 'ubudu-rtls-sdk';

const client = new RtlsWebSocketClient({
  apiKey: 'your-api-key',
  namespace: 'your-namespace',
  mapUuid: 'your-map-uuid',
});

// Event handlers
client.on('POSITIONS', (pos) => console.log(pos));

// Connect both publisher and subscriber
await client.connect();
await client.subscribe([SubscriptionType.POSITIONS]);

// Send and receive
await client.sendPosition({
  macAddress: 'aabbccddeeff',
  latitude: 48.8566,
  longitude: 2.3522,
});

await client.disconnect();
```

### Creating from RtlsClient

```typescript
import { RtlsClient, SubscriptionType } from 'ubudu-rtls-sdk';

const client = new RtlsClient({
  apiKey: 'your-api-key',
  namespace: 'your-namespace',
});

// Create WebSocket client that shares config
const ws = client.createWebSocket({ mapUuid: 'map-id' });

ws.on('POSITIONS', (pos) => console.log(pos));
await ws.connect();
await ws.subscribe([SubscriptionType.POSITIONS]);
```

## Authentication

WebSocket connections are authenticated via query parameters:

```
wss://rtls.ubudu.com/api/ws/subscriber?apiKey=YOUR_API_KEY
wss://rtls.ubudu.com/api/ws/subscriber?token=YOUR_JWT_TOKEN
```

The SDK handles this automatically when you provide `apiKey` or `token` in the config.

## Subscription Types

| Type | Description |
|------|-------------|
| `POSITIONS` | Real-time tag positions |
| `ZONES_ENTRIES_EVENTS` | Zone entry/exit events |
| `ZONE_STATS_EVENTS` | Zone occupancy statistics |
| `ALERTS` | System alerts and notifications |
| `ASSETS` | Asset create/update/delete events |

## Event Handling

### Type-Safe Events

```typescript
import { PositionMessage, AlertMessage } from 'ubudu-rtls-sdk';

subscriber.on('POSITIONS', (pos: PositionMessage) => {
  console.log(pos.lat, pos.lon);
});

subscriber.on('ALERTS', (alert: AlertMessage) => {
  console.log(alert.params.title);
});
```

### Unsubscribing

```typescript
const unsubscribe = subscriber.on('POSITIONS', handler);

// Later: remove handler
unsubscribe();
```

## Reconnection

The client automatically reconnects with exponential backoff:

```typescript
const subscriber = new RtlsWebSocketSubscriber({
  apiKey: 'key',
  namespace: 'ns',
  reconnectInterval: 5000,      // Base interval (ms)
  maxReconnectAttempts: 10,     // Max attempts
});

// Listen for reconnection events
subscriber.on('disconnected', ({ code, reason }) => {
  console.log('Disconnected, will attempt reconnect');
});

subscriber.on('connected', () => {
  console.log('Connected (or reconnected)');
});
```

## Error Handling

```typescript
subscriber.on('error', ({ error }) => {
  console.error('WebSocket error:', error);
});

try {
  await subscriber.connect();
} catch (error) {
  console.error('Failed to connect:', error);
}
```

## Node.js Usage

For Node.js environments, install the `ws` package:

```bash
npm install ws
```

The SDK will automatically use it when `WebSocket` is not globally available.
```

### Task 11.2: Add WebSocket API reference docs
### Task 11.3: Update main README with WebSocket section
### Task 11.4: Add migration notes for existing users

### Phase 11 Verification Checklist

- [ ] File `docs/guides/websocket.md` exists with complete guide
- [ ] API reference includes all WebSocket classes and methods
- [ ] Main README has WebSocket section with quick start example
- [ ] All code examples in docs are valid TypeScript

---

## Phase 12: Examples (4 tasks)

### Task 12.1: Create subscriber example
**File**: `examples/websocket-subscriber.ts`

```typescript
/**
 * WebSocket Subscriber Example
 *
 * Demonstrates subscribing to real-time position updates.
 *
 * Run: npx ts-node examples/websocket-subscriber.ts
 */

import { RtlsWebSocketSubscriber, SubscriptionType } from '../src';

async function main() {
  const subscriber = new RtlsWebSocketSubscriber({
    apiKey: process.env.RTLS_API_KEY!,
    namespace: process.env.APP_NAMESPACE!,
    debug: true,
  });

  // Register handlers
  subscriber.on('connected', () => {
    console.log('Connected to RTLS WebSocket');
  });

  subscriber.on('disconnected', ({ code, reason }) => {
    console.log(`Disconnected: ${code} - ${reason}`);
  });

  subscriber.on('error', ({ error }) => {
    console.error('Error:', error);
  });

  subscriber.on('POSITIONS', (pos) => {
    console.log(`Position: ${pos.user_name ?? pos.user_uuid} at ${pos.lat}, ${pos.lon}`);
  });

  subscriber.on('ZONES_ENTRIES_EVENTS', (event) => {
    console.log(`Zone Event: ${event.event_type} - ${event.user_uuid}`);
  });

  subscriber.on('ALERTS', (alert) => {
    console.log(`Alert: ${alert.params.title} - ${alert.params.text}`);
  });

  // Connect and subscribe
  try {
    await subscriber.connect();
    console.log('Connected!');

    await subscriber.subscribe([
      SubscriptionType.POSITIONS,
      SubscriptionType.ZONES_ENTRIES_EVENTS,
      SubscriptionType.ALERTS,
    ]);
    console.log('Subscribed!');

    // Keep running for 60 seconds
    console.log('Listening for events for 60 seconds...');
    await new Promise(resolve => setTimeout(resolve, 60000));

  } catch (error) {
    console.error('Failed:', error);
  } finally {
    await subscriber.disconnect();
    console.log('Disconnected');
  }
}

main();
```

### Task 12.2: Create publisher example
### Task 12.3: Create unified client example
### Task 12.4: Add JavaScript examples

### Phase 12 Verification Checklist

- [ ] All example files exist in `examples/`
- [ ] TypeScript examples: subscriber, publisher, unified client
- [ ] JavaScript examples work with CommonJS (`require`)
- [ ] Run `npm run test:examples` - all examples execute without errors
- [ ] Examples demonstrate error handling and graceful shutdown

---

## Acceptance Criteria

### Functional Requirements
- [ ] Subscriber can connect to `/ws/subscriber` with API key authentication
- [ ] Subscriber can subscribe to specific event types
- [ ] Subscriber correctly routes messages to type-specific handlers
- [ ] Publisher can connect to `/ws/publisher` with API key authentication
- [ ] Publisher can send position updates
- [ ] Automatic reconnection with exponential backoff works
- [ ] Event handlers can be added and removed
- [ ] Type guards correctly classify messages

### Non-Functional Requirements
- [ ] Works in both browser and Node.js environments
- [ ] TypeScript types are complete and accurate
- [ ] All public APIs have JSDoc documentation
- [ ] Unit test coverage > 80%
- [ ] Integration tests pass against live API
- [ ] Examples run successfully

### Integration Requirements
- [ ] Exports from main `src/index.ts` work correctly
- [ ] `createWebSocket()` method on `RtlsClient` works
- [ ] Context (namespace) is shared when creating from client
- [ ] Build produces correct ESM and CJS outputs

---

## Task Summary

| Phase | Tasks | Description |
|-------|-------|-------------|
| 1 | 9 | Type definitions |
| 2 | 4 | Event emitter utilities |
| 3 | 6 | Base connection class |
| 4 | 8 | Subscriber implementation |
| 5 | 7 | Publisher implementation |
| 6 | 6 | Unified client |
| 7 | 5 | SDK integration |
| 8 | 4 | Mock WebSocket for testing |
| 9 | 6 | Unit tests |
| 10 | 4 | Integration tests |
| 11 | 4 | Documentation |
| 12 | 4 | Examples |
| **Total** | **67** | |

---

## Dependencies

### Runtime Dependencies
- None (uses native WebSocket in browser)

### Peer Dependencies (Node.js)
- `ws` (^8.x) - WebSocket implementation for Node.js

### Dev Dependencies (already in project)
- `vitest` - Testing
- `typescript` - Type checking
- `tsup` - Build

---

## File Checklist

### New Files to Create
- [ ] `src/websocket/index.ts`
- [ ] `src/websocket/types.ts`
- [ ] `src/websocket/events.ts`
- [ ] `src/websocket/connection.ts`
- [ ] `src/websocket/subscriber.ts`
- [ ] `src/websocket/publisher.ts`
- [ ] `src/websocket/client.ts`
- [ ] `test/websocket/mocks/websocket.ts`
- [ ] `test/websocket/events.test.ts`
- [ ] `test/websocket/types.test.ts`
- [ ] `test/websocket/connection.test.ts`
- [ ] `test/websocket/subscriber.test.ts`
- [ ] `test/websocket/publisher.test.ts`
- [ ] `test/websocket/client.test.ts`
- [ ] `test/websocket/subscriber.integration.test.ts`
- [ ] `test/websocket/publisher.integration.test.ts`
- [ ] `docs/guides/websocket.md`
- [ ] `examples/websocket-subscriber.ts`
- [ ] `examples/websocket-publisher.ts`
- [ ] `examples/websocket-unified.ts`
- [ ] `examples/websocket-subscriber.js`
- [ ] `vitest.websocket.config.ts`

### Files to Modify
- [ ] `src/index.ts` - Add WebSocket exports
- [ ] `src/client/index.ts` - Add `createWebSocket()` method
- [ ] `package.json` - Add `ws` peer dependency and test script
- [ ] `README.md` - Add WebSocket section
- [ ] `docs/README.md` - Add WebSocket guide link

---

## Notes for AI Implementation

1. **Start with types**: Complete `types.ts` first as other modules depend on it
2. **Test type guards**: Use the reference JS client's message detection logic
3. **Browser/Node compatibility**: Use conditional require for `ws` package
4. **Event emitter pattern**: Follow the TypedEventEmitter pattern exactly
5. **Authentication**: Query params only (`?apiKey=` or `?token=`)
6. **Reconnection**: Use exponential backoff, max 30 seconds
7. **Message classification**: Match the logic from reference client's `_handleMessage`
8. **Subscription flow**: Connect -> Subscribe (separate steps)
9. **Integration with main client**: Share config via `createWebSocket()`
10. **Testing**: Use MockWebSocket for unit tests, skip integration if no credentials

---

## Reference Materials (Appendices)

The following reference materials are available in separate files for easier reading and AI agent access:

| Appendix | File | Description |
|----------|------|-------------|
| A | [APPENDIX_A_TYPES.md](./websocket-reference/APPENDIX_A_TYPES.md) | Reference TypeScript definitions from JS client |
| B | [APPENDIX_B_MOCK_WEBSOCKET.md](./websocket-reference/APPENDIX_B_MOCK_WEBSOCKET.md) | Mock WebSocket pattern for unit testing |
| C | [APPENDIX_C_PUBLISHER.md](./websocket-reference/APPENDIX_C_PUBLISHER.md) | Reference Publisher implementation patterns |
| D | [APPENDIX_D_MESSAGE_DETECTION.md](./websocket-reference/APPENDIX_D_MESSAGE_DETECTION.md) | Message classification logic |
| E | [APPENDIX_E_SUBSCRIBER_EXAMPLE.md](./websocket-reference/APPENDIX_E_SUBSCRIBER_EXAMPLE.md) | Complete subscriber example |
| F | [APPENDIX_F_PUBLISHER_EXAMPLE.md](./websocket-reference/APPENDIX_F_PUBLISHER_EXAMPLE.md) | Complete publisher example |
| G | [APPENDIX_G_UNIFIED_EXAMPLE.md](./websocket-reference/APPENDIX_G_UNIFIED_EXAMPLE.md) | Complete unified client example |
| H | [APPENDIX_H_CONFIGURATION.md](./websocket-reference/APPENDIX_H_CONFIGURATION.md) | Technical configuration reference |
| I | [APPENDIX_I_TEST_PATTERNS.md](./websocket-reference/APPENDIX_I_TEST_PATTERNS.md) | Test patterns for subscriber/publisher/client |
| J | [APPENDIX_J_AUTHENTICATION.md](./websocket-reference/APPENDIX_J_AUTHENTICATION.md) | WebSocket authentication specification |

> **AI AGENT NOTE**: Read appendices as needed during implementation. Each appendix is self-contained and can be read independently.

---

## Summary

This work package provides everything needed for autonomous AI implementation of the WebSocket client:

### Core Content
1. **Business Context** - Asset association, data flow architecture, alert system overview
2. **Decision Records (ADRs)** - Architectural decisions with rationale
3. **Common Pitfalls** - Known issues and solutions from production
4. **Test Data Fixtures** - Concrete test data for all message types
5. **MAC Address Normalization** - Utility function specification

### Implementation Specifications
6. **Phase Dependencies** - Execution order with dependency graph
7. **Connection State Machine** - State diagram with transitions and actions
8. **WebSocket Error Classes** - Complete error hierarchy specification
9. **Constants Reference** - All constants (URLs, defaults, close codes)
10. **API Contract** - Public interface signatures for all classes
11. **Package.json Changes** - Exact changes required for integration

### Phases Overview
| Phase | Focus | Tasks |
|-------|-------|-------|
| 1 | Type Definitions | 9 |
| 2 | Event Emitter | 4 |
| 3 | Base Connection | 6 |
| 4 | Subscriber | 8 |
| 5 | Publisher | 7 |
| 6 | Unified Client | 6 |
| 7 | SDK Integration | 5 |
| 8 | Mock WebSocket | 4 |
| 9 | Unit Tests | 6 |
| 10 | Integration Tests | 4 |
| 11 | Documentation | 4 |
| 12 | Examples | 4 |
| **Total** | | **67** |

### Reference Materials (Appendices A-J)
Located in `./websocket-reference/` directory with complete:
- Type definitions and interfaces
- Mock WebSocket for testing
- Publisher/Subscriber patterns
- Working code examples
- Test patterns
- Authentication specification

The implementation should follow patterns established in the existing SDK (resources pattern, error hierarchy, pagination utilities) while adapting WebSocket-specific logic from the reference JavaScript implementation.
