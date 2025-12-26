# Appendix B: Mock WebSocket Pattern for Testing

Use this pattern for unit testing WebSocket clients. This is from the reference implementation's test files:

```typescript
// test/websocket/mocks/websocket.ts
import { vi } from 'vitest';
import EventEmitter from 'events';

/**
 * Mock WebSocket class for testing
 * Simulates WebSocket behavior including:
 * - Connection lifecycle (CONNECTING -> OPEN -> CLOSING -> CLOSED)
 * - Message sending and receiving
 * - Subscription confirmation responses
 */
class WebSocketMock extends EventEmitter {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  url: string;
  options?: unknown;
  readyState: number = WebSocketMock.CONNECTING;

  constructor(url: string, options?: unknown) {
    super();
    this.url = url;
    this.options = options;

    // Simulate connection after a short delay
    setTimeout(() => {
      this.readyState = WebSocketMock.OPEN;
      this.emit('open');
    }, 50);
  }

  /**
   * Mock send method - captures sent data and simulates responses
   */
  send(data: string, callback?: (error?: Error) => void): void {
    if (this.readyState !== WebSocketMock.OPEN) {
      const error = new Error('WebSocket is not open');
      if (callback) callback(error);
      return;
    }

    // Simulate successful send
    if (callback) callback();

    // Parse the data to simulate different responses
    try {
      const parsedData = JSON.parse(data);

      // If this is a SUBSCRIBE command, simulate a confirmation response
      if (parsedData.type === 'SUBSCRIBE') {
        setTimeout(() => {
          this.emit('message', JSON.stringify({
            type: 'SUBSCRIPTION_CONFIRMATION',
            action: 'subscribeEvent',
            app_namespace: parsedData.app_namespace,
            types: parsedData.data_type_filter,
            timestamp: new Date().toISOString()
          }));
        }, 20);
      }

      // If this contains position data, echo it back (simulate server forwarding)
      if (parsedData.lat !== undefined && parsedData.lon !== undefined && parsedData.user_uuid) {
        setTimeout(() => {
          this.emit('message', JSON.stringify({
            ...parsedData,
            type: 'POSITIONS',
            timestamp: new Date().toISOString()
          }));
        }, 20);
      }
    } catch {
      // Not JSON or other error, just ignore
    }
  }

  /**
   * Mock close method
   */
  close(code?: number, reason?: string): void {
    this.readyState = WebSocketMock.CLOSING;
    setTimeout(() => {
      this.readyState = WebSocketMock.CLOSED;
      this.emit('close', code || 1000, reason || 'Normal closure');
    }, 50);
  }

  /**
   * Mock terminate method
   */
  terminate(): void {
    this.readyState = WebSocketMock.CLOSED;
    this.emit('close', 1006, 'Connection was terminated');
  }
}

/**
 * Setup function to mock WebSocket globally
 */
export function setupWebSocketMock(): typeof WebSocketMock {
  vi.stubGlobal('WebSocket', WebSocketMock);
  return WebSocketMock;
}

/**
 * Cleanup function
 */
export function teardownWebSocketMock(): void {
  vi.unstubAllGlobals();
}

export { WebSocketMock };
```
