import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  buildLock,
  isNormalized,
  listOperations,
  normalizeSpecText,
  sha256,
  sortKeysDeep,
  vendorSpec,
  lockText,
  SPEC_PATH,
  LOCK_PATH,
} from '../../../scripts/spec/normalize.mjs';
import { checkLock, parseGenerateScript, regenerate } from '../../../scripts/spec/check.mjs';
import { compareSpecs, main as driftMain, renderReport } from '../../../scripts/spec/drift.mjs';
import {
  liveSpecUrl,
  main as updateMain,
  operationDelta,
  updateSpec,
} from '../../../scripts/spec/update.mjs';

const REPO = resolve(__dirname, '..', '..', '..');
const NORMALIZE = join(REPO, 'scripts', 'spec', 'normalize.mjs');

// A small spec written with unsorted keys, irregular spacing and CRLF line endings.
const UNSORTED = [
  '{',
  '  "paths": {',
  '    "/zeta/{ns}": { "post": { "responses": { "201": { "description": "created" } } },',
  '                    "get":  { "responses": { "200": { "description": "ok" } } } },',
  '    "/alpha": { "get": { "tags": ["B", "A"], "responses": { "200": { "description": "ok",',
  '      "content": { "application/json": { "schema": { "type": "object", "required": ["z", "a"],',
  '      "properties": { "z": { "type": "string" }, "a": { "type": "number" } } } } } } } } }',
  '  },',
  '  "info": { "version": "1.0.0-sample", "title": "Sample" },',
  '  "openapi": "3.0.0",',
  '  "servers": [{ "url": "/api", "description": "x" }]',
  '}',
].join('\r\n');

// The same document with a different key order and compact whitespace.
const REORDERED = JSON.stringify({
  servers: [{ description: 'x', url: '/api' }],
  openapi: '3.0.0',
  info: { title: 'Sample', version: '1.0.0-sample' },
  paths: {
    '/alpha': {
      get: {
        responses: {
          '200': {
            content: {
              'application/json': {
                schema: {
                  properties: { a: { type: 'number' }, z: { type: 'string' } },
                  required: ['z', 'a'],
                  type: 'object',
                },
              },
            },
            description: 'ok',
          },
        },
        tags: ['B', 'A'],
      },
    },
    '/zeta/{ns}': {
      get: { responses: { '200': { description: 'ok' } } },
      post: { responses: { '201': { description: 'created' } } },
    },
  },
});

function run(args: string[]) {
  return spawnSync(process.execPath, [NORMALIZE, ...args], { encoding: 'utf8' });
}

describe('spec normalisation (P0 §5.1)', () => {
  it('is deterministic: key order, whitespace and line endings do not change the bytes', () => {
    expect(normalizeSpecText(UNSORTED)).toBe(normalizeSpecText(REORDERED));
  });

  it('is idempotent: normalising the normalised text is byte-identical', () => {
    const once = normalizeSpecText(UNSORTED);
    expect(normalizeSpecText(once)).toBe(once);
    expect(isNormalized(once)).toBe(true);
    expect(isNormalized(UNSORTED)).toBe(false);
    expect(isNormalized(REORDERED)).toBe(false);
  });

  it('sorts object keys recursively, keeps array order, indents by two spaces and ends with one LF', () => {
    const text = normalizeSpecText(UNSORTED);
    expect(text.endsWith('}\n')).toBe(true);
    expect(text.endsWith('\n\n')).toBe(false);
    expect(text).not.toContain('\r');
    expect(text.split('\n')[1]).toBe('  "info": {');
    const parsed = JSON.parse(text);
    expect(Object.keys(parsed)).toEqual(['info', 'openapi', 'paths', 'servers']);
    expect(Object.keys(parsed.paths)).toEqual(['/alpha', '/zeta/{ns}']);
    expect(Object.keys(parsed.paths['/zeta/{ns}'])).toEqual(['get', 'post']);
    expect(Object.keys(parsed.servers[0])).toEqual(['description', 'url']);
    const schema = parsed.paths['/alpha'].get.responses['200'].content['application/json'].schema;
    expect(schema.required).toEqual(['z', 'a']);
    expect(parsed.paths['/alpha'].get.tags).toEqual(['B', 'A']);
  });

  it('sortKeysDeep does not mutate its input', () => {
    const input = { b: { d: 1, c: [{ y: 1, x: 2 }] }, a: 0 };
    const copy = JSON.parse(JSON.stringify(input));
    const out = sortKeysDeep(input) as Record<string, unknown>;
    expect(input).toEqual(copy);
    expect(Object.keys(input)).toEqual(['b', 'a']);
    expect(Object.keys(out)).toEqual(['a', 'b']);
  });

  it('lists operations as "METHOD path" ids and builds the lock over the normalised text', () => {
    const { text, lock } = vendorSpec(UNSORTED, 'https://example.invalid/swagger.json');
    expect(listOperations(JSON.parse(text))).toEqual([
      'GET /alpha',
      'GET /zeta/{ns}',
      'POST /zeta/{ns}',
    ]);
    expect(lock).toEqual({
      version: '1.0.0-sample',
      sha256: sha256(text),
      operations: 3,
      paths: 2,
      source: { url: 'https://example.invalid/swagger.json', rawSha256: sha256(UNSORTED) },
    });
    expect(lock.sha256).not.toBe(sha256(UNSORTED));
    expect(buildLock(text).sha256).toBe(lock.sha256);
  });

  it('the vendored spec is normalised and matches its lock (3.4.0-15bab236, 176 operations, 138 paths)', () => {
    const text = readFileSync(SPEC_PATH, 'utf8');
    const lock = JSON.parse(readFileSync(LOCK_PATH, 'utf8'));
    expect(isNormalized(text)).toBe(true);
    expect(lock.sha256).toBe(sha256(text));
    expect(lock.version).toBe('3.4.0-15bab236');
    expect(JSON.parse(text).info.version).toBe(lock.version);
    expect(lock.operations).toBe(176);
    expect(lock.paths).toBe(138);
    expect(buildLock(text, lock.source)).toEqual(lock);
  });

  it('CLI: --check fails on an unnormalised file and passes once --from has normalised it', () => {
    const dir = mkdtempSync(join(tmpdir(), 'spec-normalize-'));
    const raw = join(dir, 'raw.json');
    const out = join(dir, 'spec.json');
    const lock = join(dir, 'lock.json');
    writeFileSync(raw, UNSORTED);
    expect(run(['--check', raw]).status).toBe(1);
    const vendored = run(['--from', raw, '--out', out, '--lock', lock]);
    expect(vendored.status).toBe(0);
    expect(run(['--check', out]).status).toBe(0);
    expect(readFileSync(out, 'utf8')).toBe(normalizeSpecText(UNSORTED));
    expect(JSON.parse(readFileSync(lock, 'utf8')).operations).toBe(3);
    expect(run([]).status).toBe(2);
  });
});

describe('spec:check lock verification (P0 §6.1)', () => {
  const CHECK = join(REPO, 'scripts', 'spec', 'check.mjs');
  const runCheck = (args: string[]) =>
    spawnSync(process.execPath, [CHECK, ...args], { encoding: 'utf8', cwd: REPO });

  it('a consistent lock has no problems', () => {
    const { text, lock } = vendorSpec(UNSORTED);
    expect(checkLock(text, lock)).toEqual([]);
  });

  it.each([
    ['sha256', { sha256: '0'.repeat(64) }, 'lock sha256'],
    ['version', { version: '3.3.7' }, 'lock version'],
    ['operation count', { operations: 175 }, 'lock operations'],
    ['path count', { paths: 1 }, 'lock paths'],
  ])('a lock with a wrong %s is detected', (_label, patch, message) => {
    const { text, lock } = vendorSpec(UNSORTED);
    const problems = checkLock(text, { ...lock, ...patch });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain(message);
  });

  it('a spec edited after locking is detected (hash) and an unnormalised spec is reported', () => {
    const { text, lock } = vendorSpec(UNSORTED);
    const edited = text.replace('"Sample"', '"Edited"');
    expect(checkLock(edited, lock)).toEqual([expect.stringContaining('lock sha256')]);
    const unnormalised = checkLock(UNSORTED, buildLock(UNSORTED));
    expect(unnormalised).toEqual([expect.stringContaining('not in normalised form')]);
    expect(checkLock(text, null)).toEqual([expect.stringContaining('lock is missing')]);
    const { source: _omit, ...withoutSource } = lock;
    expect(checkLock(text, withoutSource)).toEqual(['lock has no "source"']);
  });

  it('parseGenerateScript reads the vendored input, output and flags, and refuses a URL input', () => {
    expect(
      parseGenerateScript(
        'openapi-typescript spec/rtls-api.swagger.json -o src/generated/schema.ts --empty-objects-unknown'
      )
    ).toEqual({
      bin: 'openapi-typescript',
      input: 'spec/rtls-api.swagger.json',
      output: 'src/generated/schema.ts',
      flags: ['--empty-objects-unknown'],
    });
    expect(() =>
      parseGenerateScript('openapi-typescript "https://example.invalid/swagger.json" -o x.ts')
    ).toThrow('vendored spec');
    expect(() => parseGenerateScript('tsc -p .')).toThrow('openapi-typescript');
  });

  it('CLI: exit 0 for a consistent spec, lock and schema; exit 1 for a wrong lock or a stale schema', () => {
    const dir = mkdtempSync(join(tmpdir(), 'spec-check-'));
    const spec = join(dir, 'spec.json');
    const lock = join(dir, 'lock.json');
    const schema = join(dir, 'schema.ts');
    const out = join(dir, 'regenerated.ts');
    const vendored = vendorSpec(UNSORTED);
    writeFileSync(spec, vendored.text);
    writeFileSync(lock, lockText(vendored.lock));
    expect(regenerate({ specPath: spec, outPath: schema }).ok).toBe(true);
    const args = ['--spec', spec, '--lock', lock, '--schema', schema, '--out', out];

    const ok = runCheck(args);
    expect(ok.stderr).toBe('');
    expect(ok.status).toBe(0);
    expect(ok.stdout).toContain('3 operations, 2 paths');

    writeFileSync(lock, lockText({ ...vendored.lock, sha256: 'f'.repeat(64) }));
    const badLock = runCheck(args);
    expect(badLock.status).toBe(1);
    expect(badLock.stderr).toContain('lock sha256');

    writeFileSync(lock, lockText(vendored.lock));
    writeFileSync(schema, readFileSync(schema, 'utf8') + '// hand edit\n');
    const stale = runCheck(args);
    expect(stale.status).toBe(1);
    expect(stale.stderr).toContain('differs from the types generated');
  });
});

// Two sample specs for spec:drift (P0 §8.2): a small OpenAPI 3.0 document with path- and operation-level
// parameters, a $ref parameter, a request body and a recursive component schema. Each case edits a fresh
// copy through `at()`.
type Tree = Record<string, unknown>;

/** The object at `path` inside a sample spec (the samples are plain JSON objects). */
function at(root: unknown, ...path: string[]): Tree {
  return path.reduce<Tree>((node, key) => node[key] as Tree, root as Tree);
}

function driftBase() {
  return {
    openapi: '3.0.0',
    info: { title: 'Sample', version: '1.0.0' },
    paths: {
      '/things/{ns}': {
        parameters: [{ name: 'ns', in: 'path', required: true, schema: { type: 'string' } }],
        get: {
          parameters: [{ $ref: '#/components/parameters/Limit' }],
          responses: {
            '200': {
              description: 'ok',
              content: {
                'application/json': {
                  schema: { type: 'array', items: { $ref: '#/components/schemas/Thing' } },
                },
              },
            },
          },
        },
        post: {
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Thing' } } },
          },
          responses: { '201': { description: 'created' } },
        },
      },
    },
    components: {
      parameters: { Limit: { name: 'limit', in: 'query', schema: { type: 'integer' } } },
      schemas: {
        Thing: {
          type: 'object',
          description: 'A thing.',
          properties: {
            id: { type: 'string' },
            size: { type: 'number' },
            parent: { $ref: '#/components/schemas/Thing' },
          },
        },
      },
    },
  };
}

describe('spec:drift comparison (P0 §8.2)', () => {
  it('identical specs → no drift, also with a different key order and whitespace', () => {
    const b = JSON.parse(normalizeSpecText(JSON.stringify(driftBase())));
    const r = compareSpecs(driftBase(), b);
    expect(r).toMatchObject({
      drift: false,
      identicalText: true,
      added: [],
      removed: [],
      changed: [],
    });
    expect(r.components).toEqual({ added: [], removed: [], changed: [] });
  });

  it('a documentation-only change is not drift', () => {
    const live = driftBase();
    at(live, 'components', 'schemas', 'Thing').description = 'A thing, reworded.';
    const r = compareSpecs(driftBase(), live);
    expect(r.drift).toBe(false);
    expect(r.identicalText).toBe(false);
  });

  it('an added operation is reported', () => {
    const live = driftBase();
    at(live, 'paths')['/things/{ns}/{id}'] = {
      delete: { responses: { '204': { description: 'gone' } } },
    };
    const r = compareSpecs(driftBase(), live);
    expect(r.drift).toBe(true);
    expect(r.added).toEqual(['DELETE /things/{ns}/{id}']);
    expect(r.removed).toEqual([]);
  });

  it('a removed operation is reported', () => {
    const live = driftBase();
    delete at(live, 'paths', '/things/{ns}').post;
    const r = compareSpecs(driftBase(), live);
    expect(r.drift).toBe(true);
    expect(r.removed).toEqual(['POST /things/{ns}']);
    expect(r.added).toEqual([]);
  });

  it('a changed parameter is reported (required flag, schema, added)', () => {
    const live = driftBase();
    at(live, 'components', 'parameters', 'Limit').required = true;
    at(live, 'components', 'parameters', 'Limit').schema = { type: 'string' };
    (at(live, 'paths', '/things/{ns}', 'get').parameters as unknown[]).push({
      name: 'offset',
      in: 'query',
      schema: { type: 'integer' },
    });
    const r = compareSpecs(driftBase(), live);
    expect(r.drift).toBe(true);
    expect(r.changed).toEqual([
      {
        op: 'GET /things/{ns}',
        changes: [
          'parameter query:limit became required',
          'parameter query:limit schema changed',
          'parameter query:offset added',
        ],
      },
    ]);
  });

  it('a changed response schema is reported on every operation that uses the component', () => {
    const live = driftBase();
    at(live, 'components', 'schemas', 'Thing', 'properties').size = { type: 'string' };
    const r = compareSpecs(driftBase(), live);
    expect(r.drift).toBe(true);
    expect(r.changed).toEqual([
      { op: 'GET /things/{ns}', changes: ['response 200 application/json schema changed'] },
      { op: 'POST /things/{ns}', changes: ['request body application/json schema changed'] },
    ]);
    expect(r.components.changed).toEqual(['Thing']);
  });

  it('a new response status and a version change are drift, and the report shows them', () => {
    const live = driftBase();
    at(live, 'info').version = '1.0.1';
    at(live, 'paths', '/things/{ns}', 'post', 'responses')['409'] = {
      description: 'conflict',
      content: { 'application/json': { schema: { type: 'object' } } },
    };
    const r = compareSpecs(driftBase(), live);
    expect(r.version).toEqual({ vendored: '1.0.0', live: '1.0.1', changed: true });
    expect(r.changed).toEqual([{ op: 'POST /things/{ns}', changes: ['response 409 added'] }]);
    const report = renderReport(r, { vendoredLabel: 'a.json', liveLabel: 'b.json' });
    expect(report).toContain('- Result: **drift**');
    expect(report).toContain('## Version\n\n- `1.0.0` → `1.0.1`');
    expect(report).toContain(
      '## Changed operations\n\n- `POST /things/{ns}`\n  - response 409 added'
    );
  });
});

describe('spec:drift and spec:update CLIs (P0 §6.1)', () => {
  const quiet = { log: () => {}, error: () => {} };

  function files(live: unknown) {
    const dir = mkdtempSync(join(tmpdir(), 'spec-drift-'));
    const spec = join(dir, 'vendored.json');
    const from = join(dir, 'live.json');
    const out = join(dir, 'drift.md');
    writeFileSync(spec, normalizeSpecText(JSON.stringify(driftBase())));
    writeFileSync(from, JSON.stringify(live));
    return { spec, from, out };
  }

  it('exit 0 and a "no drift" report for identical specs, exit 1 with the report for drift', async () => {
    const same = files(driftBase());
    expect(
      await driftMain(['--spec', same.spec, '--from', same.from, '--out', same.out], quiet)
    ).toBe(0);
    expect(readFileSync(same.out, 'utf8')).toContain(
      '- Result: no drift (normalised texts identical)'
    );

    const live = driftBase();
    delete at(live, 'paths', '/things/{ns}').get;
    const drifted = files(live);
    expect(
      await driftMain(['--spec', drifted.spec, '--from', drifted.from, '--out', drifted.out], quiet)
    ).toBe(1);
    expect(readFileSync(drifted.out, 'utf8')).toContain(
      '## Removed operations\n\n- `GET /things/{ns}`'
    );
  });

  it('fetches the live spec with one GET and no credential; a failed fetch exits 2', async () => {
    const f = files(driftBase());
    const calls: { url: string; init?: RequestInit }[] = [];
    const ok = async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      return new Response(JSON.stringify(driftBase()), { status: 200 });
    };
    const url = liveSpecUrl('https://rtls.test/api/');
    expect(url).toBe('https://rtls.test/api/docs/swagger.json');
    expect(liveSpecUrl('https://user:secret@rtls.test/api')).toBe(
      'https://rtls.test/api/docs/swagger.json'
    );
    expect(
      await driftMain(['--spec', f.spec, '--out', f.out], {
        ...quiet,
        url,
        fetchImpl: ok as typeof fetch,
      })
    ).toBe(0);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe('https://rtls.test/api/docs/swagger.json');
    expect(calls[0]?.init?.method).toBe('GET');
    // The only header is `accept`: no X-API-Key, no Authorization.
    expect(calls[0]?.init?.headers).toEqual({ accept: 'application/json' });

    const unavailable = async () => new Response('busy', { status: 503 });
    const offline = async () => {
      throw new TypeError('fetch failed');
    };
    const notSpec = async () => new Response('{"hello":1}', { status: 200 });
    for (const impl of [unavailable, offline, notSpec])
      expect(
        await driftMain(['--spec', f.spec, '--out', f.out], {
          ...quiet,
          url,
          fetchImpl: impl as typeof fetch,
        })
      ).toBe(2);
    expect(await driftMain(['--bogus'], quiet)).toBe(2);
  });

  it('spec:update writes the normalised spec and lock and reports added and removed operations', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'spec-update-'));
    const specPath = join(dir, 'spec.json');
    const lockPath = join(dir, 'lock.json');
    writeFileSync(specPath, normalizeSpecText(JSON.stringify(driftBase())));
    const live = driftBase();
    at(live, 'info').version = '1.1.0';
    delete at(live, 'paths', '/things/{ns}').post;
    at(live, 'paths')['/other/{ns}'] = { get: { responses: { '200': { description: 'ok' } } } };
    const raw = JSON.stringify(live, null, 4);
    const fetchImpl = (async () => new Response(raw, { status: 200 })) as typeof fetch;
    const url = 'https://rtls.test/api/docs/swagger.json';
    const r = await updateSpec({ url, fetchImpl, specPath, lockPath });
    expect(r).toMatchObject({
      previousVersion: '1.0.0',
      added: ['GET /other/{ns}'],
      removed: ['POST /things/{ns}'],
    });
    const written = readFileSync(specPath, 'utf8');
    expect(isNormalized(written)).toBe(true);
    expect(JSON.parse(readFileSync(lockPath, 'utf8'))).toEqual({
      version: '1.1.0',
      sha256: sha256(written),
      operations: 2,
      paths: 2,
      source: { url, rawSha256: sha256(raw) },
    });
    expect(operationDelta(null, live)).toEqual({
      added: ['GET /other/{ns}', 'GET /things/{ns}'],
      removed: [],
    });

    const lines: string[] = [];
    const failing = (async () => new Response('', { status: 500 })) as typeof fetch;
    const failed = await updateMain([], {
      fetchImpl: failing,
      specPath,
      lockPath,
      log: (l: string) => lines.push(l),
      error: (l: string) => lines.push(l),
    });
    expect(failed).toBe(2);
    expect(lines.join('\n')).toContain('answered 500');
    // The failed update left the previous files untouched.
    expect(readFileSync(specPath, 'utf8')).toBe(written);
    expect(await updateMain(['--x'], quiet)).toBe(2);
  });
});
