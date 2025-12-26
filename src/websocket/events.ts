/**
 * Type-safe Event Emitter Utilities
 *
 * This module provides a typed event emitter for WebSocket clients
 * with full TypeScript support for event names and data types.
 */

/** Event handler function type */
export type EventHandler<T> = (data: T) => void;

/** Generic event map interface - allows any string keys with any value types */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type EventMap = { [key: string]: any };

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
          // eslint-disable-next-line no-console
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

  /**
   * Get all registered event names
   */
  eventNames(): (keyof TEvents)[] {
    return Array.from(this.handlers.keys());
  }
}

/**
 * Debug logger for WebSocket connections
 *
 * Note: Console usage is intentional in this class as it's a logging utility.
 */
/* eslint-disable no-console */
export class DebugLogger {
  private enabled: boolean;
  private prefix: string;

  constructor(prefix: string, enabled: boolean = false) {
    this.prefix = prefix;
    this.enabled = enabled;
  }

  /**
   * Enable or disable debug logging
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  /**
   * Log a debug message
   */
  log(message: string, data?: unknown): void {
    if (!this.enabled) return;

    const timestamp = new Date().toISOString();
    const formattedMessage = `[${timestamp}] [${this.prefix}] ${message}`;

    if (data !== undefined) {
      console.log(formattedMessage, data);
    } else {
      console.log(formattedMessage);
    }
  }

  /**
   * Log an error message (always logged, regardless of debug setting)
   */
  error(message: string, error?: unknown): void {
    const timestamp = new Date().toISOString();
    const formattedMessage = `[${timestamp}] [${this.prefix}] ERROR: ${message}`;

    if (error !== undefined) {
      console.error(formattedMessage, error);
    } else {
      console.error(formattedMessage);
    }
  }

  /**
   * Log a warning message
   */
  warn(message: string, data?: unknown): void {
    if (!this.enabled) return;

    const timestamp = new Date().toISOString();
    const formattedMessage = `[${timestamp}] [${this.prefix}] WARN: ${message}`;

    if (data !== undefined) {
      console.warn(formattedMessage, data);
    } else {
      console.warn(formattedMessage);
    }
  }
}
/* eslint-enable no-console */
