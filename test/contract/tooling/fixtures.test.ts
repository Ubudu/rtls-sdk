import { describe, it, expect } from 'vitest';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  checkFixture,
  fixtureResponse,
  hygieneProblems,
  listFixtureFiles,
  loadAllFixtures,
  loadFixture,
  strayFixtureEntries,
  type FixtureEnvelope,
  type LoadedFixture,
} from '../../contract/fixtures';
import { SpecValidator, loadSpec } from '../../contract/spec';
import { runManifestChecks } from '../../../scripts/manifest/check.mjs';
import { SAMPLE_SURFACE, completeP7, scratchRepo } from './scratch-repo';

const validator = new SpecValidator(
  loadSpec(resolve(__dirname, '..', '__fixtures__', 'sample-spec.json'))
);
const LIST = 'GET /things/{ns}';
const THING = { id: 't1', name: 'one' };

function fixture(data: unknown, raw?: string): LoadedFixture {
  return {
    domain: 'assets',
    name: 'sample',
    file: '/x/test/fixtures/assets/sample.json',
    raw: raw ?? JSON.stringify(data, null, 2),
    data: data as FixtureEnvelope,
  };
}
const check = (data: unknown, raw?: string) => checkFixture(fixture(data, raw), validator);

describe('fixture envelope and contract rules (P0 §5.5.1)', () => {
  it('a spec fixture with a valid body passes', () => {
    const result = check({ _source: 'spec', _operation: LIST, body: { items: [THING], total: 1 } });
    expect(result).toEqual({ errors: [], reports: [], overrideUnnecessary: false });
  });

  it('a spec fixture with an invalid body fails with the path', () => {
    const result = check({
      _source: 'spec',
      _operation: LIST,
      body: { items: [{ id: 1 }], total: 1 },
    });
    expect([...result.errors].sort()).toEqual([
      "spec fixture: body/items/0 must have required property 'name'",
      'spec fixture: body/items/0/id must be string',
    ]);
  });

  it('a spec fixture needs _operation, a declared status and a schema', () => {
    expect(check({ _source: 'spec', body: {} }).errors).toEqual([
      'spec fixture: _operation is required',
    ]);
    expect(check({ _source: 'spec', _operation: LIST, status: 500, body: {} }).errors).toEqual([
      `spec fixture: status 500 is not declared for ${LIST}`,
    ]);
    expect(
      check({ _source: 'spec', _operation: LIST, status: 404, body: { error: 'x' } }).errors
    ).toEqual([
      `spec fixture: ${LIST} 404 has no application/json schema (use _source live or server-code)`,
    ]);
    expect(check({ _source: 'spec', _operation: 'GET /unknown', body: {} }).errors).toEqual([
      'envelope: _operation "GET /unknown" is not an operation of the spec',
    ]);
  });

  it('spec text, binary and empty fixtures are checked for status and content type only', () => {
    expect(
      check({ _source: 'spec', _operation: 'POST /things/{ns}', status: 201, text: 'Created' })
        .errors
    ).toEqual([]);
    expect(
      check({
        _source: 'spec',
        _operation: 'POST /things/{ns}',
        status: 201,
        text: 'x',
        contentType: 'text/html',
      }).errors
    ).toEqual(['spec fixture: content type text/html is not declared for POST /things/{ns} 201']);
    expect(
      check({ _source: 'spec', _operation: 'GET /files/{ns}/{id}', base64: 'AAEC' }).errors
    ).toEqual([]);
    expect(
      check({ _source: 'spec', _operation: 'POST /things/{ns}', status: 204, body: null }).errors
    ).toEqual([]);
    expect(check({ _source: 'spec', _operation: LIST, body: null }).errors).toEqual([
      `spec fixture: ${LIST} 200 declares content (application/json), body is empty`,
    ]);
  });

  it('a live fixture without _note fails; a server-code fixture with _note and no _operation passes', () => {
    expect(check({ _source: 'live', _operation: LIST, body: {} }).errors).toEqual([
      'envelope: _note is required for _source "live"',
    ]);
    expect(check({ _source: 'server-code', _note: 'text body', body: 'Created' })).toEqual({
      errors: [],
      reports: [],
      overrideUnnecessary: false,
    });
  });

  it('live fixtures: a spec mismatch is reported, a body that validates is "override possibly unnecessary"', () => {
    const differs = check({
      _source: 'live',
      _note: 'wire shape',
      _operation: LIST,
      body: { data: [] },
    });
    expect(differs.errors).toEqual([]);
    expect(differs.overrideUnnecessary).toBe(false);
    expect(differs.reports[0]).toContain('live fixture differs from the spec');
    const same = check({
      _source: 'live',
      _note: 'recorded',
      _operation: LIST,
      body: { items: [], total: 0, x: 1 },
    });
    expect(same.errors).toEqual([]);
    expect(same.overrideUnnecessary).toBe(true);
    expect(same.reports).toEqual([
      'live fixture validates against the spec: override possibly unnecessary',
      'additional property body/x',
    ]);
  });

  it('additional properties of a spec fixture are reported, not failed', () => {
    const result = check({
      _source: 'spec',
      _operation: LIST,
      body: { items: [{ ...THING, extra: 1 }], total: 1 },
    });
    expect(result.errors).toEqual([]);
    expect(result.reports).toEqual(['additional property body/items/0/extra']);
  });

  it('a WebSocket fixture with _nonHttp passes', () => {
    const result = check({
      _source: 'server-code',
      _note: 'broker confirmation frame',
      _nonHttp: 'WS-M12',
      body: { app_namespace: 'test-namespace', action: 'subscribeEvent' },
    });
    expect(result.errors).toEqual([]);
  });

  it('exactly one of body / text / base64', () => {
    expect(check({ _source: 'server-code', _note: 'n', body: {}, text: 'x' }).errors).toEqual([
      'envelope: exactly one of body / text / base64 is required (found body, text)',
    ]);
    expect(check({ _source: 'server-code', _note: 'n', text: 'x', base64: 'AA==' }).errors).toEqual(
      ['envelope: exactly one of body / text / base64 is required (found text, base64)']
    );
    expect(check({ _source: 'server-code', _note: 'n' }).errors).toEqual([
      'envelope: exactly one of body / text / base64 is required (found none)',
    ]);
  });

  it('rejects unknown keys and malformed envelope fields', () => {
    expect(check({ _source: 'web', _note: 'n', body: {} }).errors).toEqual([
      'envelope: _source must be one of spec, live, server-code',
    ]);
    expect(check({ _source: 'live', _note: 'n', body: {}, note: 'typo' }).errors).toEqual([
      'envelope: unknown key "note"',
    ]);
    expect(check({ _source: 'live', _note: 'n', body: {}, status: 99 }).errors).toEqual([
      'envelope: status must be an integer 100–599',
    ]);
    expect(check({ _source: 'live', _note: 'n', base64: 'not base64!' }).errors).toEqual([
      'envelope: base64 must be a base64 string',
    ]);
    expect(check({ _source: 'live', _note: 'n', body: {}, _usi: ['USI-1'] }).errors).toEqual([
      'envelope: _usi must be a list of USI-P<n>-<m> ids',
    ]);
  });
});

describe('fixture hygiene (always fatal)', () => {
  const base = { _source: 'server-code', _note: 'n' };
  it.each([
    ['e-mail address', { ...base, body: { owner: 'jane.doe@company.io' } }],
    ['JWT-like token', { ...base, body: { token: 'eyJhbGciOiJIUzI1NiJ9.payload' } }],
    ['40-hex identifier', { ...base, body: { app_namespace: 'a'.repeat(40) } }],
    [
      'server source reference',
      { ...base, text: 'Error: boom\n    at handler (routes/assets.js:12:5)' },
    ],
    ['bearer credential', { ...base, headers: { authorization: 'Bearer abc' }, body: null }],
    ['server repository path', { ...base, text: 'see rtls-api/src/index' }],
  ])('%s fails', (label, data) => {
    expect(check(data).errors).toEqual([expect.stringContaining(`hygiene: ${label}`)]);
  });

  it('a base64 body is checked on its decoded bytes as well: an e-mail or a JWT inside it fails', () => {
    const b64 = (s: string) => Buffer.from(s, 'utf8').toString('base64');
    const csv = b64('user_udid,owner\n025d4b000001,jane.doe@company.io\n');
    const withEmail = { ...base, contentType: 'text/csv', base64: csv };
    // the encoded text alone carries nothing a pattern can match
    expect(hygieneProblems(JSON.stringify(withEmail))).toEqual([]);
    expect(check(withEmail).errors).toEqual([
      'hygiene (decoded base64): e-mail address (1 occurrence)',
    ]);
    const withJwt = { ...base, base64: b64('\u0000\u0001token=eyJhbGciOiJIUzI1NiJ9.payloadÿ') };
    expect(check(withJwt).errors).toEqual([
      'hygiene (decoded base64): JWT-like token (1 occurrence)',
    ]);
    // clean bytes and the scrub placeholder pass
    expect(check({ ...base, base64: b64('owner,user@example.invalid\n') }).errors).toEqual([]);
    expect(check({ ...base, base64: 'AAEC/w==' }).errors).toEqual([]);
  });

  it('the scrub placeholder and other reserved-domain addresses pass', () => {
    expect(
      hygieneProblems('{"email":"user@example.invalid","b":"x@example.com","c":"q@host.test"}')
    ).toEqual([]);
    expect(hygieneProblems('{"id":"' + 'f'.repeat(39) + '"}')).toEqual([]);
  });
});

describe('fixture files and responses', () => {
  it('lists top-level json files per domain; inputs/ subfolders and other files are ignored', () => {
    const root = mkdtempSync(join(tmpdir(), 'fixtures-'));
    mkdirSync(join(root, 'assets', 'inputs'), { recursive: true });
    mkdirSync(join(root, 'etl'));
    writeFileSync(
      join(root, 'assets', 'list.json'),
      JSON.stringify({ _source: 'spec', _operation: LIST, body: {} })
    );
    writeFileSync(join(root, 'assets', 'inputs', 'upload.json'), '{"not":"an envelope"}');
    writeFileSync(join(root, 'assets', 'notes.txt'), 'x');
    writeFileSync(
      join(root, 'etl', 'b.json'),
      JSON.stringify({ _source: 'live', _note: 'n', text: 'ok' })
    );
    writeFileSync(join(root, 'README.md'), '# stray');
    mkdirSync(join(root, 'not-a-domain'));
    expect(listFixtureFiles(root).map((f) => `${f.domain}/${f.name}`)).toEqual([
      'assets/list',
      'etl/b',
    ]);
    expect(loadAllFixtures(root).map((f) => f.data._source)).toEqual(['spec', 'live']);
    expect(loadFixture('etl', 'b', root)).toEqual({ _source: 'live', _note: 'n', text: 'ok' });
    expect(loadFixture('etl', 'b.json', root).text).toBe('ok');
    expect(strayFixtureEntries(root)).toEqual(['README.md', 'not-a-domain']);
    expect(listFixtureFiles(join(root, 'missing'))).toEqual([]);
  });

  it('fixtureResponse builds JSON, text, empty and binary responses', async () => {
    const json = fixtureResponse({
      _source: 'spec',
      body: { a: 1 },
      headers: { 'x-total-count': '3' },
    });
    expect(json.status).toBe(200);
    expect(json.headers.get('content-type')).toBe('application/json');
    expect(json.headers.get('x-total-count')).toBe('3');
    expect(await json.json()).toEqual({ a: 1 });

    const text = fixtureResponse({ _source: 'live', _note: 'n', status: 201, text: 'Created' });
    expect(text.status).toBe(201);
    expect(text.headers.get('content-type')).toBe('text/plain');
    expect(await text.text()).toBe('Created');

    const csv = fixtureResponse({
      _source: 'live',
      _note: 'n',
      text: 'a,b\n',
      contentType: 'text/csv',
    });
    expect(csv.headers.get('content-type')).toBe('text/csv');

    const empty = fixtureResponse({ _source: 'server-code', _note: 'n', status: 204, body: null });
    expect(empty.status).toBe(204);
    expect(empty.headers.get('content-type')).toBeNull();
    expect(await empty.text()).toBe('');

    const emptyTyped = fixtureResponse({
      _source: 'server-code',
      _note: 'n',
      body: null,
      contentType: 'text/plain',
    });
    expect(emptyTyped.headers.get('content-type')).toBe('text/plain');

    const bin = fixtureResponse({
      _source: 'live',
      _note: 'n',
      base64: Buffer.from([0, 1, 2, 255]).toString('base64'),
    });
    expect(bin.headers.get('content-type')).toBe('application/octet-stream');
    expect([...new Uint8Array(await bin.arrayBuffer())]).toEqual([0, 1, 2, 255]);
  });
});

describe('2xx fixture per wrapped operation (P0 §5.5.3, CONVENTIONS §6)', () => {
  it('a complete manifest whose wrapped op has only an empty-body handler response and no fixture fails', () => {
    const handler = [
      "import { http, HttpResponse } from 'msw';",
      "export const handlers = [http.post('https://rtls.test/api/widgets/:ns', () => new HttpResponse(null, { status: 201 }))];",
      '',
    ].join('\n');
    const root = scratchRepo({
      manifests: { P7: completeP7() },
      files: { 'test/fixtures/etl/create.json': null, 'test/mocks/handlers/etl.ts': handler },
    });
    expect(runManifestChecks({ root, surface: () => SAMPLE_SURFACE }).errors).toEqual([
      'P7.json: POST /widgets/{ns}: no 2xx fixture with _operation under test/fixtures/etl/',
    ]);
    // A 4xx fixture of the operation does not count; an empty-body 2xx fixture (`body: null`) does.
    const withError = scratchRepo({
      manifests: { P7: completeP7() },
      files: {
        'test/fixtures/etl/create.json': JSON.stringify({
          _source: 'live',
          _note: 'n',
          _operation: 'POST /widgets/{ns}',
          status: 409,
          body: null,
        }),
      },
    });
    expect(
      runManifestChecks({ root: withError, surface: () => SAMPLE_SURFACE }).errors
    ).toHaveLength(1);
    const withEmpty = scratchRepo({
      manifests: { P7: completeP7() },
      files: {
        'test/fixtures/etl/create.json': JSON.stringify({
          _source: 'live',
          _note: 'n',
          _operation: 'POST /widgets/{ns}',
          status: 201,
          body: null,
        }),
      },
    });
    expect(runManifestChecks({ root: withEmpty, surface: () => SAMPLE_SURFACE }).errors).toEqual(
      []
    );
  });
});
