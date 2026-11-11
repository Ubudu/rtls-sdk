// Fake WebSocket classes injected through `config.WebSocket` (P8 §8.1). `FakeBrowserWebSocket` has the DOM shape
// (no ping/on/terminate); `FakeNodeWebSocket` adds the Node `ws` members (ping, on('pong'), terminate) and takes
// `{ headers }` options. Each socket attaches to the active FakeRtServer, which drives every event.
// This file imports nothing from src (it is copied into the regression-proof tree of the 0.2.0 sources).

/** What a fake socket needs from the server. */
export interface FakeServerLink {
  accept(socket: FakeSocket): void;
  receive(socket: FakeSocket, data: string): void;
  clientClose(socket: FakeSocket, code: number | undefined, reason: string | undefined): void;
  clientTerminate(socket: FakeSocket): void;
  clientPing(socket: FakeSocket): void;
}

let active: FakeServerLink | null = null;

/** Called by FakeRtServer: new sockets attach to `server`. */
export function setActiveServer(server: FakeServerLink | null): void {
  active = server;
}

export interface FakeCloseEvent {
  code: number;
  reason: string;
  wasClean: boolean;
}

/** Common part of both fakes. */
export class FakeSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;

  readyState = 0;
  onopen: ((event: unknown) => void) | null = null;
  onclose: ((event: FakeCloseEvent) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  readonly url: string;
  readonly options: unknown;
  /** Raw frames this socket sent. */
  readonly sent: string[] = [];
  /** When set, `send()` throws this error once (and the flag clears). */
  failNextSend: Error | null = null;
  private readonly server: FakeServerLink;

  constructor(url: string, options?: unknown) {
    if (active === null) throw new Error('no FakeRtServer is active');
    this.url = url;
    this.options = options;
    this.server = active;
    this.server.accept(this);
  }

  send(data: string): void {
    if (this.failNextSend !== null) {
      const error = this.failNextSend;
      this.failNextSend = null;
      throw error;
    }
    if (this.readyState !== 1)
      throw new Error(`WebSocket is not open: readyState ${this.readyState}`);
    this.sent.push(data);
    this.server.receive(this, data);
  }

  close(code?: number, reason?: string): void {
    if (this.readyState === 2 || this.readyState === 3) return;
    this.server.clientClose(this, code, reason);
  }

  /** Server side: open the socket. */
  fireOpen(): void {
    this.readyState = 1;
    this.onopen?.({ type: 'open' });
  }

  /** Server side: deliver a frame (objects are JSON-encoded; strings and binary data as they are). */
  fireMessage(data: unknown): void {
    const payload =
      typeof data === 'string' || data instanceof ArrayBuffer || ArrayBuffer.isView(data)
        ? data
        : JSON.stringify(data);
    this.onmessage?.({ data: payload });
  }

  /** Server side: an error event with an optional `ws`-style message. */
  fireError(message?: string): void {
    this.onerror?.(
      message === undefined
        ? { type: 'error' }
        : { type: 'error', message, error: new Error(message) }
    );
  }

  /** Server side: the close event. */
  fireClose(code: number, reason = '', wasClean = code !== 1006): void {
    this.readyState = 3;
    this.onclose?.({ code, reason, wasClean });
  }

  protected link(): FakeServerLink {
    return this.server;
  }
}

/** DOM-shaped fake: no `ping`, `on` or `terminate`. */
export class FakeBrowserWebSocket extends FakeSocket {}

/** Node `ws`-shaped fake. */
export class FakeNodeWebSocket extends FakeSocket {
  pings = 0;
  terminates = 0;
  private readonly pongListeners: (() => void)[] = [];

  ping(): void {
    this.pings += 1;
    this.link().clientPing(this);
  }

  on(event: 'pong', listener: () => void): this {
    if (event === 'pong') this.pongListeners.push(listener);
    return this;
  }

  terminate(): void {
    this.terminates += 1;
    if (this.readyState === 3) return;
    this.link().clientTerminate(this);
  }

  /** Server side: a pong. */
  firePong(): void {
    for (const listener of this.pongListeners) listener();
  }

  /** The `headers` passed in the constructor options, if any. */
  headers(): Record<string, string> | undefined {
    const options = this.options as { headers?: Record<string, string> } | undefined;
    return options?.headers;
  }
}
