/**
 * Mock WebSocket for Testing
 *
 * This module provides a mock WebSocket implementation for unit testing
 * WebSocket clients without requiring a real server connection.
 */

import { vi, type MockInstance } from 'vitest';

/** WebSocket ready states */
export const WebSocketReadyState = {
  CONNECTING: 0,
  OPEN: 1,
  CLOSING: 2,
  CLOSED: 3,
} as const;

/**
 * Mock WebSocket for testing
 *
 * Simulates WebSocket connection lifecycle and message passing.
 *
 * @example
 * ```typescript
 * // In test setup
 * setupWebSocketMock();
 *
 * // In test
 * const client = new RtlsWebSocketSubscriber({ apiKey: 'key', namespace: 'ns' });
 * await client.connect();
 *
 * // Get the mock instance
 * const mockWs = MockWebSocket.lastInstance;
 *
 * // Simulate server messages
 * mockWs.simulateMessage({ type: 'POSITIONS', lat: 48.8, lon: 2.3 });
 *
 * // Verify sent messages
 * expect(mockWs.sentMessages).toContainEqual({ type: 'SUBSCRIBE', ... });
 * ```
 */
export class MockWebSocket {
  // Static ready state constants
  static CONNECTING = WebSocketReadyState.CONNECTING;
  static OPEN = WebSocketReadyState.OPEN;
  static CLOSING = WebSocketReadyState.CLOSING;
  static CLOSED = WebSocketReadyState.CLOSED;

  /** Track all instances for test access */
  static instances: MockWebSocket[] = [];

  /** Get the last created instance */
  static get lastInstance(): MockWebSocket | undefined {
    return MockWebSocket.instances[MockWebSocket.instances.length - 1];
  }

  /** Clear all instances */
  static clearInstances(): void {
    MockWebSocket.instances = [];
  }

  // Instance properties
  readyState: number = WebSocketReadyState.CONNECTING;
  url: string;
  protocol: string = '';
  extensions: string = '';
  binaryType: 'blob' | 'arraybuffer' = 'blob';

  // Event handlers
  onopen: ((event: Event) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;

  // Test utilities
  public sentMessages: unknown[] = [];
  private autoConnectDelay: number;
  private connectionTimeout: ReturnType<typeof setTimeout> | null = null;
  private shouldFail: boolean = false;
  private failReason: string = '';
  private failCode: number = 1006;

  constructor(url: string, _protocols?: string | string[]) {
    this.url = url;
    this.autoConnectDelay = 0; // Immediate by default

    // Track instance
    MockWebSocket.instances.push(this);

    // Auto-open after a tick (can be configured)
    this.connectionTimeout = setTimeout(() => {
      if (this.shouldFail) {
        this.simulateError(new Error(this.failReason));
        this.simulateClose(this.failCode, this.failReason);
      } else {
        this.simulateOpen();
      }
    }, this.autoConnectDelay);
  }

  /**
   * Send data over the connection
   */
  send(data: string | ArrayBuffer | Blob | ArrayBufferView): void {
    if (this.readyState !== WebSocketReadyState.OPEN) {
      throw new Error('WebSocket is not open');
    }

    const parsed = typeof data === 'string' ? JSON.parse(data) : data;
    this.sentMessages.push(parsed);
  }

  /**
   * Close the connection
   */
  close(code: number = 1000, reason: string = ''): void {
    if (this.readyState === WebSocketReadyState.CLOSED) {
      return;
    }

    this.readyState = WebSocketReadyState.CLOSING;

    // Simulate async close
    setTimeout(() => {
      this.readyState = WebSocketReadyState.CLOSED;
      this.onclose?.({
        code,
        reason,
        wasClean: true,
        type: 'close',
      } as CloseEvent);
    }, 0);
  }

  // ─── Test Helper Methods ────────────────────────────────────────────────────

  /**
   * Configure auto-connect delay
   */
  setAutoConnectDelay(delayMs: number): void {
    this.autoConnectDelay = delayMs;
  }

  /**
   * Configure connection to fail
   */
  setConnectionFailure(fail: boolean, reason: string = 'Connection refused', code: number = 1006): void {
    this.shouldFail = fail;
    this.failReason = reason;
    this.failCode = code;
  }

  /**
   * Simulate the connection opening
   */
  simulateOpen(): void {
    if (this.readyState !== WebSocketReadyState.CONNECTING) {
      return;
    }

    this.readyState = WebSocketReadyState.OPEN;
    this.onopen?.({ type: 'open' } as Event);
  }

  /**
   * Simulate receiving a message from the server
   */
  simulateMessage(data: unknown): void {
    if (this.readyState !== WebSocketReadyState.OPEN) {
      console.warn('MockWebSocket: Cannot simulate message when not open');
      return;
    }

    const message = typeof data === 'string' ? data : JSON.stringify(data);
    this.onmessage?.({ data: message, type: 'message' } as MessageEvent);
  }

  /**
   * Simulate a subscription confirmation
   */
  simulateSubscriptionConfirmation(types?: string[]): void {
    this.simulateMessage({
      type: 'SUBSCRIPTION_CONFIRMATION',
      types,
      app_namespace: this.extractNamespaceFromUrl(),
    });
  }

  /**
   * Simulate a connection error
   */
  simulateError(error?: Error): void {
    this.onerror?.({
      type: 'error',
      error,
      message: error?.message,
    } as unknown as Event);
  }

  /**
   * Simulate the connection closing
   */
  simulateClose(code: number = 1000, reason: string = ''): void {
    if (this.connectionTimeout) {
      clearTimeout(this.connectionTimeout);
      this.connectionTimeout = null;
    }

    this.readyState = WebSocketReadyState.CLOSED;
    this.onclose?.({
      code,
      reason,
      wasClean: code === 1000,
      type: 'close',
    } as CloseEvent);
  }

  /**
   * Simulate an authentication failure
   */
  simulateAuthFailure(): void {
    this.simulateError(new Error('Authentication failed'));
    this.simulateClose(4001, 'Unauthorized');
  }

  /**
   * Get all messages sent by the client
   */
  getSentMessages(): unknown[] {
    return [...this.sentMessages];
  }

  /**
   * Find sent messages matching a type
   */
  findSentMessages<T>(type: string): T[] {
    return this.sentMessages.filter(
      (msg) => typeof msg === 'object' && msg !== null && (msg as Record<string, unknown>).type === type
    ) as T[];
  }

  /**
   * Clear sent messages
   */
  clearSentMessages(): void {
    this.sentMessages = [];
  }

  /**
   * Extract namespace from URL query params
   */
  private extractNamespaceFromUrl(): string {
    try {
      const urlObj = new URL(this.url);
      return urlObj.searchParams.get('namespace') ?? '';
    } catch {
      return '';
    }
  }

  // No-op methods for compatibility
  addEventListener(): void {}
  removeEventListener(): void {}
  dispatchEvent(): boolean { return true; }
}

// Store original WebSocket
let originalWebSocket: typeof WebSocket | undefined;

/**
 * Setup WebSocket mock for tests
 *
 * Replaces the global WebSocket with MockWebSocket.
 * Call this in beforeEach() or at the start of your test.
 */
export function setupWebSocketMock(): MockInstance {
  MockWebSocket.clearInstances();

  // Store original if exists
  if (typeof WebSocket !== 'undefined') {
    originalWebSocket = WebSocket;
  }

  // Stub global WebSocket
  return vi.stubGlobal('WebSocket', MockWebSocket);
}

/**
 * Clean up WebSocket mock
 *
 * Restores the original WebSocket if it existed.
 * Call this in afterEach() or at the end of your test.
 */
export function teardownWebSocketMock(): void {
  MockWebSocket.clearInstances();

  if (originalWebSocket) {
    vi.stubGlobal('WebSocket', originalWebSocket);
  } else {
    vi.unstubAllGlobals();
  }
}

/**
 * Create a mock WebSocket and capture the instance
 *
 * Utility for creating a MockWebSocket directly in tests.
 */
export function createMockWebSocket(url: string): MockWebSocket {
  return new MockWebSocket(url);
}

/**
 * Wait for a mock WebSocket to be created
 *
 * Useful when the WebSocket is created asynchronously.
 */
export async function waitForMockWebSocket(timeout: number = 1000): Promise<MockWebSocket> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    if (MockWebSocket.lastInstance) {
      return MockWebSocket.lastInstance;
    }
    await new Promise(resolve => setTimeout(resolve, 10));
  }

  throw new Error('Timeout waiting for MockWebSocket instance');
}

/**
 * Flush all pending timers and microtasks
 *
 * Useful for ensuring async operations complete.
 */
export async function flushPromises(): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, 0));
}
