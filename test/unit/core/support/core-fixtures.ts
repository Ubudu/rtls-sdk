// Core fixtures (test/fixtures/core, P0 §5.5.1 envelope) as the transport sees them. An empty `contentType` marks a
// response that carries no Content-Type header at all (the server's typeless text and empty bodies), which the
// envelope's defaults cannot express; `fixtureHttpResponse` then sends the bytes without any content type.
import { loadFixture, type FixtureEnvelope } from '../../../contract/fixtures';

export type { FixtureEnvelope };

export function coreFixture(name: string): FixtureEnvelope {
  return loadFixture('core', name);
}

/** Body value handed to `createError`: the JSON value, the text, or `undefined` for an empty body. */
export function fixtureErrorBody(f: FixtureEnvelope): unknown {
  if (typeof f.text === 'string') return f.text;
  return f.body === null ? undefined : f.body;
}

/** Content type of the response, `undefined` when it carries none. */
export function fixtureContentType(f: FixtureEnvelope): string | undefined {
  if (f.contentType !== undefined) return f.contentType === '' ? undefined : f.contentType;
  if (typeof f.text === 'string') return 'text/plain';
  if (f.body === null || f.body === undefined) return undefined;
  return 'application/json';
}

/** Response headers of a fixture: its `headers` plus its content type (none when it carries none). */
export function fixtureHeaders(f: FixtureEnvelope): Headers {
  const headers = new Headers(f.headers ?? {});
  const contentType = fixtureContentType(f);
  if (contentType !== undefined && !headers.has('content-type'))
    headers.set('content-type', contentType);
  return headers;
}

/** Fetch `Response` of a fixture; bytes are sent as a `Uint8Array` so no content type is added implicitly. */
export function fixtureHttpResponse(f: FixtureEnvelope): Response {
  const payload =
    typeof f.text === 'string'
      ? new TextEncoder().encode(f.text)
      : f.body === null || f.body === undefined
        ? null
        : new TextEncoder().encode(JSON.stringify(f.body));
  return new Response(payload, { status: f.status ?? 200, headers: fixtureHeaders(f) });
}
