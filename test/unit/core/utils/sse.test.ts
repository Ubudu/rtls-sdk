import { describe, it, expect } from 'vitest';
import { parseSse, type SseEvent } from '../../../../src/utils/sse';

const encoder = new TextEncoder();

async function* from(
  chunks: ReadonlyArray<string | Uint8Array>
): AsyncGenerator<string | Uint8Array> {
  for (const chunk of chunks) yield chunk;
}

async function events(chunks: ReadonlyArray<string | Uint8Array>): Promise<SseEvent[]> {
  const out: SseEvent[] = [];
  for await (const event of parseSse(from(chunks))) out.push(event);
  return out;
}

/** Every byte of `text` as its own chunk. */
function byteByByte(text: string): Uint8Array[] {
  return [...encoder.encode(text)].map((b) => new Uint8Array([b]));
}

const THREE =
  'event: open\ndata: {"a":1}\n\n: hb\n\nevent: item\ndata: x\ndata: y\n\ndata: é ✓\n\n';
const THREE_EVENTS: SseEvent[] = [
  { event: 'open', data: '{"a":1}' },
  { event: 'item', data: 'x\ny' },
  { event: 'message', data: 'é ✓' },
];

describe('parseSse (P1 §6.7, WHATWG event-stream rules)', () => {
  it('a leading BOM is stripped (string and byte sources)', async () => {
    expect(await events(['﻿data: a\n\n'])).toEqual([{ event: 'message', data: 'a' }]);
    expect(
      await events([new Uint8Array([0xef, 0xbb, 0xbf]), encoder.encode('data: b\n\n')])
    ).toEqual([{ event: 'message', data: 'b' }]);
  });

  it('only the first BOM is stripped; a later U+FEFF is data', async () => {
    expect(await events(['﻿data: ﻿x\n\n'])).toEqual([{ event: 'message', data: '﻿x' }]);
  });

  it.each([
    ['CRLF', 'event: a\r\ndata: 1\r\n\r\n'],
    ['LF', 'event: a\ndata: 1\n\n'],
    ['CR', 'event: a\rdata: 1\r\r'],
  ])('%s line ends', async (_name, text) => {
    expect(await events([text])).toEqual([{ event: 'a', data: '1' }]);
  });

  it('CR at the end of a chunk + LF at the start of the next count as one line end', async () => {
    expect(await events(['data: 1\r', '\ndata: 2\r', '\n\r', '\n'])).toEqual([
      { event: 'message', data: '1\n2' },
    ]);
  });

  it('a CR at a chunk end followed by an empty chunk and then LF is still one line end', async () => {
    expect(await events(['data: 1\r', '', '\n\r\n'])).toEqual([{ event: 'message', data: '1' }]);
  });

  it('a comment-only stream yields no event', async () => {
    expect(await events([': hb\n\n', ': hb\n\n', ':\n\n'])).toEqual([]);
  });

  it('data: without a space keeps the whole value; only one leading space is stripped', async () => {
    expect(await events(['data:x\n\n', 'data:  two\n\n'])).toEqual([
      { event: 'message', data: 'x' },
      { event: 'message', data: ' two' },
    ]);
  });

  it('a field without a colon has an empty value', async () => {
    expect(await events(['data\ndata\n\n'])).toEqual([{ event: 'message', data: '\n' }]);
    expect(await events(['event\ndata: v\n\n'])).toEqual([{ event: 'message', data: 'v' }]);
  });

  it("the event type defaults to 'message' and resets after each event", async () => {
    expect(await events(['event: a\ndata: 1\n\ndata: 2\n\n'])).toEqual([
      { event: 'a', data: '1' },
      { event: 'message', data: '2' },
    ]);
  });

  it('a block without data + blank line → no event (and its event type is dropped)', async () => {
    expect(await events(['event: lonely\n\n', 'data: next\n\n'])).toEqual([
      { event: 'message', data: 'next' },
    ]);
  });

  it('an empty data line dispatches an event with empty data (the data buffer is non-empty)', async () => {
    expect(await events(['data:\n\n'])).toEqual([{ event: 'message', data: '' }]);
  });

  it('id is kept and sticky; an id containing NUL is ignored; an empty id clears it', async () => {
    expect(
      await events(['id: 7\ndata: a\n\ndata: b\n\nid: 8\u00009\ndata: c\n\nid\ndata: d\n\n'])
    ).toEqual([
      { event: 'message', data: 'a', id: '7' },
      { event: 'message', data: 'b', id: '7' },
      { event: 'message', data: 'c', id: '7' },
      { event: 'message', data: 'd' },
    ]);
  });

  it('retry and unknown fields are ignored; field names are case-sensitive', async () => {
    expect(await events(['retry: 1000\nfoo: bar\nData: X\nEvent: Y\ndata: kept\n\n'])).toEqual([
      { event: 'message', data: 'kept' },
    ]);
  });

  it('a trailing event without a blank line is discarded', async () => {
    expect(await events(['data: one\n\ndata: two\n'])).toEqual([{ event: 'message', data: 'one' }]);
    expect(await events(['data: one\n\ndata: partial'])).toEqual([
      { event: 'message', data: 'one' },
    ]);
  });

  it('3 events split byte by byte equal the same events in one chunk', async () => {
    expect(await events([THREE])).toEqual(THREE_EVENTS);
    expect(await events([encoder.encode(THREE)])).toEqual(THREE_EVENTS);
    expect(await events(byteByByte(THREE))).toEqual(THREE_EVENTS);
  });

  it('a UTF-8 multibyte character split across chunks is decoded', async () => {
    const bytes = encoder.encode('data: €\n\n'); // € is 3 bytes
    const at = bytes.indexOf(0xe2);
    expect(
      await events([bytes.slice(0, at + 1), bytes.slice(at + 1, at + 2), bytes.slice(at + 2)])
    ).toEqual([{ event: 'message', data: '€' }]);
  });

  it('events are yielded as soon as their blank line arrives (lazy)', async () => {
    let pulled = 0;
    async function* source(): AsyncGenerator<string> {
      pulled += 1;
      yield 'data: 1\n\n';
      pulled += 1;
      yield 'data: 2\n\n';
    }
    const it = parseSse(source());
    await expect(it.next()).resolves.toEqual({
      done: false,
      value: { event: 'message', data: '1' },
    });
    expect(pulled).toBe(1);
    await it.return();
  });
});
