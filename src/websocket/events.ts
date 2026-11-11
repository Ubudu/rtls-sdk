/**
 * Typed event emitter and debug logger of the WebSocket clients.
 *
 * @module websocket/events
 */

/** Event handler function type (public signatures spell it out, so the reference needs no exported alias). */
export type EventHandler<T> = (data: T) => void;

/**
 * Type-safe event emitter.
 *
 * @example
 * ```typescript
 * const off = subscriber.on('POSITIONS', (position) => console.log(position.user_uuid));
 * off(); // or subscriber.off('POSITIONS', handler)
 * ```
 */
export class TypedEventEmitter<TEvents extends object> {
  private readonly handlers = new Map<keyof TEvents, Set<EventHandler<never>>>();
  /** `once` wrappers by original handler, so that `off(original)` removes the wrapper. */
  private readonly onceWrappers = new Map<
    keyof TEvents,
    Map<EventHandler<never>, EventHandler<never>>
  >();

  /** Registers a handler; returns a function that removes it. */
  on<K extends keyof TEvents>(event: K, handler: (data: TEvents[K]) => void): () => void {
    let set = this.handlers.get(event);
    if (set === undefined) {
      set = new Set();
      this.handlers.set(event, set);
    }
    set.add(handler);
    return this.remover(event, handler);
  }

  /** Registers a handler called at most once; returns a function that removes it. */
  once<K extends keyof TEvents>(event: K, handler: (data: TEvents[K]) => void): () => void {
    const wrapper: EventHandler<TEvents[K]> = (data) => {
      this.off(event, handler);
      handler(data);
    };
    let wrappers = this.onceWrappers.get(event);
    if (wrappers === undefined) {
      wrappers = new Map();
      this.onceWrappers.set(event, wrappers);
    }
    wrappers.set(handler, wrapper);
    this.on(event, wrapper);
    return this.remover(event, handler);
  }

  /** Removes a handler registered with `on` or `once`. */
  off<K extends keyof TEvents>(event: K, handler: (data: TEvents[K]) => void): void {
    const set = this.handlers.get(event);
    set?.delete(handler);
    const wrappers = this.onceWrappers.get(event);
    const wrapper = wrappers?.get(handler);
    if (wrapper !== undefined) {
      wrappers?.delete(handler);
      set?.delete(wrapper);
    }
  }

  /** Removes every handler of `event`, or of every event. */
  removeAllListeners(event?: keyof TEvents): void {
    if (event === undefined) {
      this.handlers.clear();
      this.onceWrappers.clear();
    } else {
      this.handlers.delete(event);
      this.onceWrappers.delete(event);
    }
  }

  /** Number of handlers of `event`. */
  listenerCount(event: keyof TEvents): number {
    return this.handlers.get(event)?.size ?? 0;
  }

  /** `true` when `event` has at least one handler. */
  hasListeners(event: keyof TEvents): boolean {
    return this.listenerCount(event) > 0;
  }

  /** The events that have handlers. */
  eventNames(): (keyof TEvents)[] {
    const names: (keyof TEvents)[] = [];
    for (const [event, set] of this.handlers) if (set.size > 0) names.push(event);
    return names;
  }

  private remover<K extends keyof TEvents>(
    event: K,
    handler: EventHandler<TEvents[K]>
  ): () => void {
    return () => this.off(event, handler);
  }

  /** Calls every handler of `event`; a throwing handler is reported and does not stop the others. */
  protected emit<K extends keyof TEvents>(event: K, data: TEvents[K]): void {
    const set = this.handlers.get(event);
    if (set === undefined) return;
    for (const handler of [...set]) {
      try {
        (handler as EventHandler<TEvents[K]>)(data);
      } catch (error) {
        console.error(`Error in event handler for "${String(event)}":`, error);
      }
    }
  }
}

/** Log levels of `DebugLogger.print`. */
type LogLevel = 'log' | 'warn' | 'error';

const LEVEL_TAGS: Record<LogLevel, string> = { log: '', warn: 'WARN: ', error: 'ERROR: ' };

/**
 * Console logger of a WebSocket client. `log` and `warn` print only in debug mode, the `error` level always. Every
 * message goes through `redact` first. All levels share `print`, so the error level needs no function of its own:
 * no function of the WebSocket module runs only on a path that the live tests cannot reach.
 *
 * @internal
 */
export class DebugLogger {
  constructor(
    private readonly prefix: string,
    private readonly enabled: boolean,
    private readonly redact: (text: string) => string
  ) {}

  /** Debug message. */
  log(message: string): void {
    this.print('log', message);
  }

  /** Warning (deprecated options), debug mode only. */
  warn(message: string): void {
    this.print('warn', message);
  }

  /** Prints `message` at `level`: `log` and `warn` in debug mode only, `error` always. */
  print(level: LogLevel, message: string): void {
    if (level !== 'error' && !this.enabled) return;
    console[level](
      this.redact(`[${new Date().toISOString()}] [${this.prefix}] ${LEVEL_TAGS[level]}${message}`)
    );
  }
}
