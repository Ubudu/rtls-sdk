import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { checkFixture, type FixtureEnvelope } from '../../contract/fixtures';
import { specValidator } from '../../contract/spec';
import { setActiveHarness } from './active';
import type { Harness } from './context';
import { recordFixture, RecorderRefusal, recordMarkerPath } from './recorder';
import {
  REDACTED,
  REDACTED_TOKEN,
  residualSecrets,
  scrub,
  SCRUB_KEYS,
  SCRUBBED_EMAIL,
  SCRUBBED_NAMESPACE,
} from './scrub';
import { makeHarness, TEST_KEY, TEST_NS, TEST_RUN_ID } from './unit-support';

// Hand-made values (no recorded data): an address, a JWT-shaped string and a 40-hex id built at run time.
const EMAIL = ['someone', 'corp.example-mail.com'].join('@');
const JWT = `eyJ${'a'.repeat(12)}.eyJ${'b'.repeat(12)}.${'c'.repeat(10)}`;
const HEX40 = 'ab'.repeat(20);

let h: Harness;

beforeEach(() => {
  h = makeHarness().h;
  mkdirSync(h.stateDir, { recursive: true });
  writeFileSync(recordMarkerPath(h.stateDir), '');
});
afterEach(() => setActiveHarness(null));

const fixtureFile = (domain: string, name: string): string =>
  join(h.fixturesDir, domain, `${name}.json`);
const readFixture = (domain: string, name: string): FixtureEnvelope =>
  JSON.parse(readFileSync(fixtureFile(domain, name), 'utf8')) as FixtureEnvelope;
const json = () => new Headers({ 'content-type': 'application/json; charset=utf-8' });

describe('scrub', () => {
  it('replaces the value of every scrub key with <redacted>, at any depth; null stays null', () => {
    const record = Object.fromEntries(SCRUB_KEYS.map((k) => [k, { nested: 'value' }]));
    const out = scrub({ items: [record], keep: 'visible', user_id: null }) as {
      items: Record<string, unknown>[];
      keep: string;
      user_id: null;
    };
    for (const key of SCRUB_KEYS) expect(out.items[0]?.[key]).toBe(REDACTED);
    expect(Object.keys(out.items[0] ?? {})).toHaveLength(SCRUB_KEYS.length);
    expect(out.keep).toBe('visible');
    expect(out.user_id).toBeNull();
    expect(scrub({ device_owner: 'x', extra: 'y' }, ['extra'])).toEqual({
      device_owner: 'x',
      extra: REDACTED,
    });
  });

  it('replaces e-mail, JWT-like and bearer tokens, the API key and the namespace in strings and keys', () => {
    const out = scrub({
      note: `mail ${EMAIL} token ${JWT} header Bearer abc.def-123`,
      path: `/assets/${TEST_NS}/x?apiKey=${TEST_KEY}`,
      [TEST_NS]: [`${TEST_NS}`],
    });
    expect(out).toEqual({
      note: `mail ${SCRUBBED_EMAIL} token ${REDACTED_TOKEN} header ${REDACTED_TOKEN}`,
      path: `/assets/${SCRUBBED_NAMESPACE}/x?apiKey=${REDACTED}`,
      [SCRUBBED_NAMESPACE]: [SCRUBBED_NAMESPACE],
    });
    expect(residualSecrets(JSON.stringify(out))).toEqual([]);
  });
});

describe('recordFixture', () => {
  it('writes the envelope: spec source, operation, recorded run, status and the scrubbed body', async () => {
    expect(
      await recordFixture('core', 'health.ok', {
        operation: 'GET /health',
        status: 200,
        headers: json(),
        body: { status: 'OK' },
      })
    ).toBe(true);
    const raw = readFileSync(fixtureFile('core', 'health.ok'), 'utf8');
    expect(JSON.parse(raw)).toEqual({
      _source: 'spec',
      _operation: 'GET /health',
      _recorded: { specVersion: '3.4.0-15bab236', runId: TEST_RUN_ID },
      status: 200,
      body: { status: 'OK' },
    });
    expect(raw.endsWith('}\n')).toBe(true);
    expect(raw).toContain('\n  "_source": "spec",\n');
    const data = JSON.parse(raw) as FixtureEnvelope;
    const file = fixtureFile('core', 'health.ok');
    expect(
      checkFixture({ domain: 'core', name: 'health.ok', file, raw, data }, specValidator()).errors
    ).toEqual([]);
  });

  it('a spec-invalid body without a note is refused; with a note it is stored as live with _note', async () => {
    const response = { operation: 'GET /health', status: 200, headers: json(), body: { up: true } };
    await expect(recordFixture('core', 'health.odd', response)).rejects.toThrow(/pass a note/);
    expect(existsSync(fixtureFile('core', 'health.odd'))).toBe(false);
    expect(await recordFixture('core', 'health.odd', response, 'server answers { up }')).toBe(true);
    expect(readFixture('core', 'health.odd')).toMatchObject({
      _source: 'live',
      _note: 'server answers { up }',
      body: { up: true },
    });
  });

  it('a text/csv string body is stored as text with its content type, scrubbed', async () => {
    await recordFixture(
      'notifications',
      'export.csv',
      {
        operation: 'GET /notifications/{namespace}/export',
        status: 200,
        headers: new Headers({ 'content-type': 'text/csv', 'x-total-count': '2' }),
        body: `title,sender\nhello,${EMAIL}\n`,
      },
      'the export answers CSV'
    );
    const f = readFixture('notifications', 'export.csv');
    expect(f).toMatchObject({
      _source: 'live',
      contentType: 'text/csv',
      headers: { 'x-total-count': '2' },
      text: `title,sender\nhello,${SCRUBBED_EMAIL}\n`,
    });
    expect(f.body).toBeUndefined();
  });

  it('a text/event-stream body is stored as text with its content type, scrubbed', async () => {
    await recordFixture('notifications', 'stream.frames', {
      operation: 'GET /notifications/{namespace}/stream',
      status: 200,
      headers: new Headers({ 'content-type': 'text/event-stream' }),
      body: `: hb\n\nevent: notification\ndata: {"namespace":"${TEST_NS}"}\n\n`,
    });
    expect(readFixture('notifications', 'stream.frames')).toEqual({
      _source: 'spec',
      _operation: 'GET /notifications/{namespace}/stream',
      _recorded: { specVersion: '3.4.0-15bab236', runId: TEST_RUN_ID },
      status: 200,
      contentType: 'text/event-stream',
      text: `: hb\n\nevent: notification\ndata: {"namespace":"${SCRUBBED_NAMESPACE}"}\n\n`,
    });
  });

  it('a 204 with an empty body is stored as body: null with no content type', async () => {
    await recordFixture('dashboards-rules', 'delete.204', {
      operation: 'DELETE /dashboards/{id}',
      status: 204,
      headers: new Headers(),
      body: '',
    });
    const f = readFixture('dashboards-rules', 'delete.204');
    expect(f).toMatchObject({ _source: 'spec', status: 204, body: null });
    expect(Object.keys(f)).not.toContain('contentType');
  });

  it('a Uint8Array body is stored as base64 with the header content type', async () => {
    const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x00, 0xff]);
    await recordFixture(
      'assets',
      'document.download',
      {
        operation: 'GET /assets/{namespace}/{mac_address}/documents/{documentId}/download',
        status: 200,
        headers: new Headers({ 'content-type': 'application/pdf' }),
        body: bytes,
      },
      'binary download'
    );
    const f = readFixture('assets', 'document.download');
    expect(f).toMatchObject({ contentType: 'application/pdf', base64: 'JVBERgD/' });
    expect(Buffer.from(f.base64 as string, 'base64')).toEqual(Buffer.from(bytes));
  });

  it('refuses a binary body whose bytes hold an e-mail or a JWT (bytes cannot be scrubbed)', async () => {
    const download = (name: string, text: string, contentType: string) =>
      recordFixture(
        'assets',
        name,
        {
          operation: 'GET /assets/{namespace}/{mac_address}/documents/{documentId}/download',
          status: 200,
          headers: new Headers({ 'content-type': contentType }),
          body: new TextEncoder().encode(text),
        },
        'binary download'
      );
    const email = download(
      'mail',
      'user_udid,owner\n025d4b000001,jane.doe@company.io\n',
      'text/csv'
    );
    await expect(email).rejects.toBeInstanceOf(RecorderRefusal);
    await expect(email).rejects.toThrow(/binary body holds hygiene: e-mail address/);
    await expect(email).rejects.toSatisfy((e: Error) => !e.message.includes('jane.doe'));
    await expect(
      download('jwt', 'token=eyJhbGciOiJIUzI1NiJ9.payload', 'application/octet-stream')
    ).rejects.toThrow(/binary body holds hygiene: JWT-like token/);
    expect(existsSync(fixtureFile('assets', 'mail'))).toBe(false);
    expect(existsSync(fixtureFile('assets', 'jwt'))).toBe(false);
    // clean bytes are still stored
    await expect(download('clean', 'user_udid\n025d4b000001\n', 'text/csv')).resolves.toBe(true);
  });

  it('refuses an output that still holds a secret: a 40-hex id, or the key inside a binary body', async () => {
    await expect(
      recordFixture('core', 'odd', {
        operation: 'GET /health',
        status: 200,
        headers: json(),
        body: { status: HEX40 },
      })
    ).rejects.toThrow(/still holds hygiene: 40-hex identifier/);
    await expect(
      recordFixture(
        'assets',
        'leak',
        {
          operation: 'GET /assets/{namespace}/{mac_address}/documents/{documentId}/download',
          status: 200,
          headers: new Headers({ 'content-type': 'application/octet-stream' }),
          body: new TextEncoder().encode(`key=${TEST_KEY}`),
        },
        'binary'
      )
    ).rejects.toThrow(/binary body holds api-key/);
    const refused = recordFixture('core', 'odd', {
      operation: 'GET /health',
      status: 200,
      headers: json(),
      body: { status: HEX40 },
    });
    await expect(refused).rejects.toBeInstanceOf(RecorderRefusal);
    await expect(refused).rejects.toSatisfy((e: Error) => !e.message.includes(HEX40));
    expect(existsSync(fixtureFile('core', 'odd'))).toBe(false);
    expect(existsSync(fixtureFile('assets', 'leak'))).toBe(false);
  });

  it('refuses graph diagnostics and route operations (success and error), even with the marker', async () => {
    const ops: [string, number][] = [
      ['GET /spatial/navigate/{namespace}/graph-analysis', 200],
      ['POST /spatial/navigate/{namespace}/shortest-path', 200],
      ['POST /spatial/navigate/{namespace}/shortest-path', 400],
    ];
    for (const [operation, status] of ops) {
      await expect(
        recordFixture(
          'venues-navigation',
          'route',
          { operation, status, headers: json(), body: {} },
          'n'
        )
      ).rejects.toBeInstanceOf(RecorderRefusal);
    }
    expect(existsSync(join(h.fixturesDir, 'venues-navigation'))).toBe(false);
  });

  it('without the record marker it returns false and writes nothing', async () => {
    const fresh = makeHarness().h;
    expect(
      await recordFixture('core', 'health.ok', {
        operation: 'GET /health',
        status: 200,
        headers: json(),
        body: { status: 'OK' },
      })
    ).toBe(false);
    expect(existsSync(fresh.fixturesDir)).toBe(false);
  });
});
