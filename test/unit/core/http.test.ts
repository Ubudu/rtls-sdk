import { describe, it, expect } from 'vitest';
import { errorFromResponse, parseResponseBody, readErrorBody } from '../../../src/client/http';
import {
  NotFoundError,
  RateLimitError,
  ResponseParseError,
  ServerError,
  ValidationError,
} from '../../../src';
import { coreFixture, fixtureHttpResponse } from './support/core-fixtures';

const bytes = (text: string) => new TextEncoder().encode(text);

describe('parseResponseBody (P1 §6.3 step 5), every parseAs', () => {
  it("'stream' → the unread body; null for an empty body", async () => {
    const body = await parseResponseBody(new Response('abc'), 'stream');
    expect(body).toBeInstanceOf(ReadableStream);
    expect(await new Response(body as ReadableStream).text()).toBe('abc');
    expect(await parseResponseBody(new Response(null), 'stream')).toBeNull();
  });

  it.each(['auto', 'json', 'text', 'blob'] as const)(
    '%s on 204 and 205 → undefined',
    async (parseAs) => {
      expect(await parseResponseBody(new Response(null, { status: 204 }), parseAs)).toBeUndefined();
      expect(await parseResponseBody(new Response(null, { status: 205 }), parseAs)).toBeUndefined();
    }
  );

  it("'blob' → Blob whatever the content type", async () => {
    const blob = await parseResponseBody(
      new Response('{"a":1}', { headers: { 'content-type': 'application/json' } }),
      'blob'
    );
    expect(blob).toBeInstanceOf(Blob);
    expect(await (blob as Blob).text()).toBe('{"a":1}');
  });

  it("'text' → the text, also for JSON; an empty body → undefined", async () => {
    expect(
      await parseResponseBody(
        new Response('{"a":1}', { headers: { 'content-type': 'application/json' } }),
        'text'
      )
    ).toBe('{"a":1}');
    expect(await parseResponseBody(new Response(bytes('')), 'text')).toBeUndefined();
  });

  it("'json' on text → JSON.parse, or ResponseParseError with status, contentType and body cut to 2 000", async () => {
    expect(await parseResponseBody(new Response(bytes('[1,2]')), 'json')).toEqual([1, 2]);
    const long = `x${'y'.repeat(3000)}`;
    const promise = parseResponseBody(
      new Response(long, { status: 201, headers: { 'content-type': 'text/plain' } }),
      'json'
    );
    await expect(promise).rejects.toBeInstanceOf(ResponseParseError);
    await expect(promise).rejects.toMatchObject({ status: 201, contentType: 'text/plain' });
    await expect(promise).rejects.toSatisfy(
      (e: ResponseParseError) =>
        typeof e.body === 'string' && e.body.length === 2000 && e.cause instanceof SyntaxError
    );
  });

  it("'auto': application/problem+json is JSON; text/html on a 2xx is text; an empty content-type counts as absent", async () => {
    expect(
      await parseResponseBody(
        new Response('{"title":"x"}', { headers: { 'content-type': 'application/problem+json' } }),
        'auto'
      )
    ).toEqual({ title: 'x' });
    expect(
      await parseResponseBody(
        new Response('<p>ok</p>', { headers: { 'content-type': 'text/html' } }),
        'auto'
      )
    ).toBe('<p>ok</p>');
    expect(
      await parseResponseBody(
        new Response(bytes('[3]'), { headers: { 'content-type': '' } }),
        'auto'
      )
    ).toEqual([3]);
  });

  it('an aborted signal ends the read with its reason', async () => {
    const reason = new Error('stop');
    await expect(
      parseResponseBody(new Response('abc'), 'auto', AbortSignal.abort(reason))
    ).rejects.toBe(reason);
  });
});

describe('readErrorBody / errorFromResponse (P1 §6.3 step 6)', () => {
  it('JSON content type → parsed; JSON-looking text without it → parsed; other text → the text; empty → undefined', async () => {
    expect(
      await readErrorBody(
        new Response('{"error":"x"}', { headers: { 'content-type': 'application/json' } })
      )
    ).toEqual({ error: 'x' });
    expect(await readErrorBody(new Response(bytes(' [1]')))).toEqual([1]);
    expect(await readErrorBody(new Response(bytes('Error: boom')))).toBe('Error: boom');
    expect(await readErrorBody(new Response(bytes('{bad')))).toBe('{bad');
    expect(await readErrorBody(new Response(null, { status: 404 }))).toBeUndefined();
  });

  it('a body that cannot be read counts as empty', async () => {
    const broken = new Response(
      new ReadableStream({
        start(controller) {
          controller.error(new Error('socket reset'));
        },
      }),
      { status: 500 }
    );
    expect(await readErrorBody(broken)).toBeUndefined();
  });

  it('an abort during the read is rethrown, not swallowed', async () => {
    const reason = new Error('cancelled');
    const slow = new Response(new ReadableStream({ start() {} }), { status: 500 });
    await expect(readErrorBody(slow, AbortSignal.abort(reason))).rejects.toBe(reason);
  });

  it.each([
    ['error-e8-noct', NotFoundError, '404 Not Found', undefined],
    [
      'error-e10-400',
      ValidationError,
      `SyntaxError: Unexpected token 'b', "bad" is not valid JSON`,
      undefined,
    ],
    ['error-e4b', ServerError, 'Failed to retrieve nearest assets', undefined],
    ['error-429', RateLimitError, 'Too many requests, retry later', 17_000],
  ] as const)(
    '%s → class and message, retryAfter from the headers',
    async (name, cls, message, retryAfter) => {
      const err = await errorFromResponse(fixtureHttpResponse(coreFixture(name)));
      expect(err).toBeInstanceOf(cls);
      expect(err.message).toBe(message);
      expect(err.retryAfter).toBe(retryAfter);
    }
  );

  it('an empty error body → the fallback with the status text', async () => {
    const err = await errorFromResponse(
      new Response(null, { status: 404, statusText: 'Not Found' })
    );
    expect(err).toBeInstanceOf(NotFoundError);
    expect(err.message).toBe('HTTP 404 Not Found');
    expect(err.body).toBeUndefined();
  });
});
