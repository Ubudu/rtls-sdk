/**
 * Server-sent events parser, following the WHATWG event-stream interpretation rules.
 *
 * @module utils/sse
 */

/**
 * One server-sent event. `data` is the raw string (multi-line data joined with `\n`); consumers parse JSON
 * themselves. `event` defaults to `'message'`. `id` is the last event id the stream set, when it set one.
 */
export interface SseEvent {
  event: string;
  data: string;
  id?: string;
}

const BOM = '﻿';

/**
 * Parses an event stream into events.
 *
 * Rules (WHATWG): a leading byte-order mark is stripped; CRLF, LF and CR end a line (a CR at the end of one chunk and
 * an LF at the start of the next are one line end); a line starting with `:` is a comment; `field:value` loses one
 * leading space of the value; a line without `:` is a field with an empty value; `data` lines are joined with `\n`;
 * `event` sets the type (default `'message'`); `id` sets the last event id unless it contains NUL; `retry` and
 * unknown fields are ignored; a blank line dispatches the event when at least one `data` line was seen; an
 * unterminated trailing event is discarded. Byte chunks are decoded as UTF-8, also when a character is split across
 * chunks.
 *
 * @internal
 */
export async function* parseSse(
  source: AsyncIterable<Uint8Array | string>
): AsyncGenerator<SseEvent, void, undefined> {
  const decoder = new TextDecoder('utf-8', { ignoreBOM: true });
  let started = false;
  let pending = '';
  let skipLineFeed = false;

  let data = '';
  let sawData = false;
  let eventType = '';
  let lastId = '';

  /** Applies one line; returns the event a blank line dispatches. */
  const takeLine = (line: string): SseEvent | undefined => {
    if (line === '') {
      const event: SseEvent | undefined = sawData
        ? {
            event: eventType === '' ? 'message' : eventType,
            // Every data line appended a trailing LF; the last one is removed (WHATWG).
            data: data.slice(0, -1),
            ...(lastId === '' ? {} : { id: lastId }),
          }
        : undefined;
      data = '';
      sawData = false;
      eventType = '';
      return event;
    }
    if (line.startsWith(':')) return undefined;
    const colon = line.indexOf(':');
    const field = colon === -1 ? line : line.slice(0, colon);
    let value = colon === -1 ? '' : line.slice(colon + 1);
    if (value.startsWith(' ')) value = value.slice(1);
    if (field === 'data') {
      data += `${value}\n`;
      sawData = true;
    } else if (field === 'event') {
      eventType = value;
    } else if (field === 'id') {
      if (!value.includes('\u0000')) lastId = value;
    }
    return undefined;
  };

  for await (const chunk of source) {
    let text = typeof chunk === 'string' ? chunk : decoder.decode(chunk, { stream: true });
    if (text === '') continue;
    if (!started) {
      started = true;
      if (text.startsWith(BOM)) text = text.slice(1);
      if (text === '') continue;
    }
    if (skipLineFeed) {
      skipLineFeed = false;
      if (text.startsWith('\n')) text = text.slice(1);
    }
    pending += text;

    let start = 0;
    for (let i = 0; i < pending.length; i += 1) {
      const ch = pending[i];
      if (ch !== '\r' && ch !== '\n') continue;
      const event = takeLine(pending.slice(start, i));
      if (ch === '\r') {
        if (i + 1 < pending.length) {
          if (pending[i + 1] === '\n') i += 1;
        } else {
          skipLineFeed = true;
        }
      }
      start = i + 1;
      if (event) yield event;
    }
    pending = pending.slice(start);
  }
  // The stream ended: an unterminated line or event is discarded (WHATWG).
}
