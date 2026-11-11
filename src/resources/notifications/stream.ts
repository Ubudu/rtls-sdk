/**
 * The notification stream (`client.notifications.stream()`): server-sent events of the caller's inbox, with
 * reconnection. Internal module: `NotificationsResource.stream()` is the public entry point.
 *
 * The reconnect loop is domain logic on top of `transport.stream`: one request per attempt, the failure
 * counter reset by every `open`, an exponential back-off between attempts, and fatal statuses (401, 403, 404).
 *
 * @module resources/notifications/stream
 * @internal
 */
import type { Transport } from '../../client/transport';
import { RtlsError, StreamError } from '../../errors';
import type {
  NotificationStream,
  NotificationStreamEnd,
  NotificationStreamEvent,
  NotificationStreamOptions,
} from '../../types/notifications';
import type { SseEvent } from '../../utils/sse';
import { invalidArgument } from './query';

/** Default idle timeout: more than two 20 s heartbeats. */
const DEFAULT_IDLE_TIMEOUT_MS = 45_000;
const DEFAULT_INITIAL_DELAY_MS = 1_000;
const DEFAULT_MAX_DELAY_MS = 30_000;
/** Statuses after which a reconnection cannot succeed. */
const FATAL_STATUSES: readonly number[] = [401, 403, 404];
const EVENT_TYPES: readonly string[] = ['open', 'item', 'state', 'unread_count'];

interface ReconnectPolicy {
  enabled: boolean;
  initialDelayMs: number;
  maxDelayMs: number;
  maxAttempts: number;
}

function isAbortSignal(value: unknown): value is AbortSignal {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as { aborted?: unknown; addEventListener?: unknown };
  return typeof candidate.aborted === 'boolean' && typeof candidate.addEventListener === 'function';
}

function delayOption(value: unknown, name: string, fallback: number): number {
  if (value === undefined) return fallback;
  if (typeof value !== 'number' || Number.isNaN(value) || value < 0 || !Number.isFinite(value)) {
    throw invalidArgument(
      `stream: reconnect.${name} must be a finite number >= 0, not ${String(value)}`,
      'reconnect'
    );
  }
  return value;
}

function reconnectPolicy(value: NotificationStreamOptions['reconnect']): ReconnectPolicy {
  if (value === undefined || value === true) {
    return {
      enabled: true,
      initialDelayMs: DEFAULT_INITIAL_DELAY_MS,
      maxDelayMs: DEFAULT_MAX_DELAY_MS,
      maxAttempts: Infinity,
    };
  }
  if (value === false) {
    return { enabled: false, initialDelayMs: 0, maxDelayMs: 0, maxAttempts: 0 };
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw invalidArgument('stream: reconnect must be a boolean or an object', 'reconnect');
  }
  const initialDelayMs = delayOption(
    value.initialDelayMs,
    'initialDelayMs',
    DEFAULT_INITIAL_DELAY_MS
  );
  const maxDelayMs = delayOption(value.maxDelayMs, 'maxDelayMs', DEFAULT_MAX_DELAY_MS);
  const maxAttempts = value.maxAttempts ?? Infinity;
  if (
    typeof maxAttempts !== 'number' ||
    maxAttempts < 0 ||
    !(Number.isInteger(maxAttempts) || maxAttempts === Infinity)
  ) {
    throw invalidArgument(
      `stream: reconnect.maxAttempts must be an integer >= 0 or Infinity, not ${String(maxAttempts)}`,
      'reconnect'
    );
  }
  return { enabled: true, initialDelayMs, maxDelayMs, maxAttempts };
}

/** A typed event, or `undefined` for an unknown event name or data that is not a JSON object. */
function toEvent(raw: SseEvent): NotificationStreamEvent | undefined {
  if (!EVENT_TYPES.includes(raw.event)) return undefined;
  let data: unknown;
  try {
    data = typeof raw.data === 'string' ? JSON.parse(raw.data) : raw.data;
  } catch {
    return undefined;
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return undefined;
  return { type: raw.event, data } as NotificationStreamEvent;
}

/** An `RtlsError` as is; anything else (never thrown by the transport) as a network `StreamError`. */
function asFailure(error: unknown): RtlsError {
  return error instanceof RtlsError
    ? error
    : new StreamError('The notification stream failed', { reason: 'network', cause: error });
}

class NotificationEventStream implements NotificationStream {
  readonly done: Promise<NotificationStreamEnd>;

  private readonly signal: AbortSignal;
  private readonly policy: ReconnectPolicy;
  private readonly idleTimeoutMs: number;
  private readonly listeners = new Map<string, Set<(...args: never[]) => void>>();
  private readonly queue: NotificationStreamEvent[] = [];
  private readonly waiters: Array<() => void> = [];
  private iterating = false;
  private iteratorThrown = false;
  private stopped = false;
  private ended: NotificationStreamEnd | undefined;
  private attempt: AbortController | undefined;
  private wake: (() => void) | undefined;
  private readonly onAbort = (): void => this.interrupt();

  constructor(
    private readonly transport: Transport,
    private readonly namespace: string,
    options: NotificationStreamOptions
  ) {
    const opts = options as Partial<NotificationStreamOptions> | null | undefined;
    if (typeof opts !== 'object' || opts === null || !isAbortSignal(opts.signal)) {
      throw invalidArgument('stream: options.signal must be an AbortSignal', 'signal');
    }
    const idle = opts.idleTimeoutMs ?? DEFAULT_IDLE_TIMEOUT_MS;
    if (typeof idle !== 'number' || Number.isNaN(idle) || idle < 0) {
      throw invalidArgument(
        `stream: idleTimeoutMs must be a number >= 0, not ${String(idle)}`,
        'idleTimeoutMs'
      );
    }
    this.signal = opts.signal;
    this.policy = reconnectPolicy(opts.reconnect);
    this.idleTimeoutMs = idle;
    if (this.signal.aborted) {
      this.done = Promise.resolve(this.finish({ reason: 'aborted' }));
      return;
    }
    this.signal.addEventListener('abort', this.onAbort);
    // Nothing is sent synchronously: the first attempt starts on a later tick.
    this.done = Promise.resolve()
      .then(() => this.run())
      .catch((error: unknown): NotificationStreamEnd => ({
        reason: 'error',
        error: asFailure(error),
      }))
      .then((end) => this.finish(end));
  }

  on(type: string, listener: (...args: never[]) => void): this {
    let set = this.listeners.get(type);
    if (set === undefined) {
      set = new Set();
      this.listeners.set(type, set);
    }
    set.add(listener);
    return this;
  }

  off(type: string, listener: (...args: never[]) => void): this {
    this.listeners.get(type)?.delete(listener);
    return this;
  }

  [Symbol.asyncIterator](): AsyncIterator<NotificationStreamEvent> {
    if (this.iterating) {
      throw new TypeError('A notification stream supports one iterator only');
    }
    this.iterating = true;
    return {
      next: async (): Promise<IteratorResult<NotificationStreamEvent>> => {
        for (;;) {
          const event = this.queue.shift();
          if (event !== undefined) return { value: event, done: false };
          if (this.ended !== undefined) {
            if (this.ended.reason === 'error' && !this.iteratorThrown && !this.stopped) {
              this.iteratorThrown = true;
              throw this.ended.error;
            }
            return { value: undefined, done: true };
          }
          await new Promise<void>((resolve) => this.waiters.push(resolve));
        }
      },
      return: async (): Promise<IteratorResult<NotificationStreamEvent>> => {
        this.stop();
        return { value: undefined, done: true };
      },
      throw: async (error?: unknown): Promise<IteratorResult<NotificationStreamEvent>> => {
        this.stop();
        throw error;
      },
    };
  }

  /** The consumer ended the iteration: close the stream (`aborted`). */
  private stop(): void {
    this.stopped = true;
    this.queue.length = 0;
    this.interrupt();
  }

  /** Aborts the current attempt and cuts a back-off wait short. */
  private interrupt(): void {
    this.attempt?.abort();
    this.wake?.();
  }

  private get closing(): boolean {
    return this.stopped || this.signal.aborted;
  }

  private finish(end: NotificationStreamEnd): NotificationStreamEnd {
    this.ended = end;
    this.signal.removeEventListener('abort', this.onAbort);
    for (const resolve of this.waiters.splice(0)) resolve();
    return end;
  }

  private notify(type: string, ...args: unknown[]): void {
    const set = this.listeners.get(type);
    if (set === undefined) return;
    for (const listener of [...set]) {
      try {
        (listener as (...a: unknown[]) => void)(...args);
      } catch (cause) {
        if (type === 'error') continue; // an error listener that throws is ignored
        this.notify(
          'error',
          new StreamError('Stream listener threw', { reason: 'protocol', cause }),
          { fatal: false }
        );
      }
    }
  }

  private emit(event: NotificationStreamEvent): void {
    if (this.iterating && !this.stopped) {
      this.queue.push(event);
      for (const resolve of this.waiters.splice(0)) resolve();
    }
    this.notify(event.type, event);
  }

  private emitError(error: RtlsError, fatal: boolean): void {
    this.notify('error', error, { fatal });
  }

  /** Waits `ms`, or less when the caller aborts or the consumer stops. */
  private async pause(ms: number): Promise<void> {
    await new Promise<void>((resolve) => {
      const timer = setTimeout(done, ms);
      function done(): void {
        clearTimeout(timer);
        resolve();
      }
      this.wake = done;
    });
    this.wake = undefined;
  }

  /** One connection: `error` is absent after a clean server close; `opened` tells whether an `open` arrived. */
  private async connect(failures: number): Promise<{ error?: unknown; opened: boolean }> {
    const controller = new AbortController();
    this.attempt = controller;
    let opened = false;
    try {
      const events = this.transport.stream('/notifications/{namespace}/stream', {
        params: { namespace: this.namespace },
        signal: controller.signal,
        idleTimeoutMs: this.idleTimeoutMs,
      });
      for await (const raw of events) {
        const event = toEvent(raw);
        if (event === undefined) continue;
        this.emit(event);
        if (event.type === 'open') {
          if (!opened && failures > 0)
            this.emit({ type: 'reconnected', data: { attempt: failures } });
          opened = true;
          failures = 0;
        }
        if (this.closing) break;
      }
      return { opened };
    } catch (error) {
      return { error, opened };
    } finally {
      this.attempt = undefined;
    }
  }

  private async run(): Promise<NotificationStreamEnd> {
    let failures = 0;
    for (;;) {
      if (this.closing) break;
      const { error, opened } = await this.connect(failures);
      if (opened) failures = 0;
      if (this.closing) break;
      if (error === undefined && !this.policy.enabled) return { reason: 'ended' };
      const failure =
        error === undefined
          ? new StreamError('Stream closed by server', { reason: 'network' })
          : asFailure(error);
      if (FATAL_STATUSES.includes(failure.status) || !this.policy.enabled) {
        this.emitError(failure, true);
        return { reason: 'error', error: failure };
      }
      failures += 1;
      if (failures > this.policy.maxAttempts) {
        this.emitError(failure, true);
        return { reason: 'error', error: failure };
      }
      this.emitError(failure, false);
      if (this.closing) break;
      await this.pause(
        Math.min(this.policy.initialDelayMs * 2 ** (failures - 1), this.policy.maxDelayMs)
      );
    }
    return { reason: 'aborted' };
  }
}

/**
 * Opens the caller's notification stream. Validates `options` synchronously and sends nothing
 * synchronously; the first request starts on a later tick.
 * @throws {ValidationError} status 0 when `signal` is not an `AbortSignal`, or for an invalid `reconnect` or
 *   `idleTimeoutMs` (nothing is sent)
 * @internal
 */
export function createNotificationStream(
  transport: Transport,
  namespace: string,
  options: NotificationStreamOptions
): NotificationStream {
  return new NotificationEventStream(transport, namespace, options);
}
