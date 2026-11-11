// Unit tests of the endpoint-coverage generator (docs/api/tools/gen-endpoint-coverage.mjs, P9 §6.2, §8).
// Case 1 reads the real spec and manifests; the other cases build a scratch repository with fs.mkdtemp
// (a spec, base.json and phase manifests) and read it through loadInputs(root). No network.
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildCoverage,
  CoverageError,
  loadInputs,
  type CoverageInputs,
} from '../../docs/api/tools/gen-endpoint-coverage.mjs';

const REPO = join(__dirname, '..', '..');

interface SpecOp {
  method: 'get' | 'post' | 'put' | 'patch' | 'delete';
  path: string;
  tag: string;
}
interface BaseOp {
  id: string;
  tag: string;
  phase: string;
  decision: 'wrap' | 'exclude';
  reason?: string;
}
type PhaseEntry = Record<string, unknown>;

function scratch(
  specOps: SpecOp[],
  base: BaseOp[],
  phases: Record<string, { operations?: PhaseEntry[]; nonHttp?: PhaseEntry[] }>
): CoverageInputs {
  const root = mkdtempSync(join(tmpdir(), 'rtls-coverage-'));
  mkdirSync(join(root, 'spec', 'manifest'), { recursive: true });
  const paths: Record<string, Record<string, unknown>> = {};
  for (const op of specOps) {
    const item = (paths[op.path] ??= {});
    item[op.method] = { tags: [op.tag], operationId: `${op.method}${op.path.replace(/\W/g, '_')}` };
  }
  writeFileSync(
    join(root, 'spec', 'rtls-api.swagger.json'),
    JSON.stringify({ swagger: '2.0', info: { version: '9.9.9-test' }, paths })
  );
  writeFileSync(
    join(root, 'spec', 'manifest', 'base.json'),
    JSON.stringify({ specVersion: '9.9.9-test', operations: base })
  );
  for (const [phase, m] of Object.entries(phases)) {
    writeFileSync(
      join(root, 'spec', 'manifest', `${phase}.json`),
      JSON.stringify({
        phase,
        domain: phase.toLowerCase(),
        status: 'complete',
        operations: m.operations ?? [],
        nonHttp: m.nonHttp ?? [],
      })
    );
  }
  return loadInputs(root);
}

function problemsOf(inputs: CoverageInputs): string[] {
  try {
    buildCoverage(inputs);
  } catch (err) {
    if (err instanceof CoverageError) return [...err.problems];
    throw err;
  }
  throw new Error('expected a CoverageError');
}

// Three operations in two tags, listed out of order in the spec; one phase file (P2).
const THREE_OPS: SpecOp[] = [
  { method: 'get', path: '/zones/{ns}', tag: 'zones' },
  { method: 'post', path: '/assets/{ns}', tag: 'Assets' },
  { method: 'get', path: '/assets/{ns}', tag: 'Assets' },
];
const THREE_BASE: BaseOp[] = [
  { id: 'GET /zones/{ns}', tag: 'zones', phase: 'P2', decision: 'wrap' },
  { id: 'POST /assets/{ns}', tag: 'Assets', phase: 'P2', decision: 'wrap' },
  { id: 'GET /assets/{ns}', tag: 'Assets', phase: 'P2', decision: 'wrap' },
];
const THREE_P2: PhaseEntry[] = [
  { op: 'GET /assets/{ns}', decision: 'wrap', sdk: 'assets.list', tier: 'R' },
  { op: 'POST /assets/{ns}', decision: 'wrap', sdk: 'client.health', tier: 'W' },
  { op: 'GET /zones/{ns}', decision: 'wrap', sdk: ['assets.list', 'client.health'], tier: 'R' },
];

describe('endpoint coverage: real inputs', () => {
  it('176 rows, summary consistent, markdown equals the committed docs/api/endpoint-coverage.md', () => {
    const c = buildCoverage(loadInputs());
    expect(c.rows).toHaveLength(176);
    expect(c.summary.total).toBe(176);
    expect(c.summary.wrapped + c.summary.excluded).toBe(176);
    expect(c.summary.specVersion).toBe('3.4.0-15bab236');
    expect(c.markdown).toBe(
      readFileSync(join(REPO, 'docs', 'api', 'endpoint-coverage.md'), 'utf8')
    );
  });
});

describe('endpoint coverage: fixtures', () => {
  it('sorts rows by tag, path and method, counts per tag and renders SDK names', () => {
    const c = buildCoverage(
      scratch(THREE_OPS, THREE_BASE, {
        P2: { operations: THREE_P2 },
        P8: {
          nonHttp: [
            {
              id: 'ws:/positions',
              kind: 'ws-endpoint',
              decision: 'wrap',
              sdk: 'RtlsWebSocketSubscriber.connect',
              tier: 'R',
            },
          ],
        },
      })
    );
    expect(c.rows.map((r) => `${r.method} ${r.path}`)).toEqual([
      'GET /assets/{ns}',
      'POST /assets/{ns}',
      'GET /zones/{ns}',
    ]);
    expect(c.summary.byTag).toEqual({
      Assets: { total: 2, wrapped: 2, excluded: 0 },
      zones: { total: 1, wrapped: 1, excluded: 0 },
    });
    expect(c.summary).toMatchObject({
      specVersion: '9.9.9-test',
      total: 3,
      wrapped: 3,
      excluded: 0,
    });
    expect(c.rows.map((r) => r.sdkMethod)).toEqual([
      'client.assets.list()',
      'client.health()',
      'client.assets.list(), client.health()',
    ]);
    expect(c.rows[0]).toMatchObject({ tag: 'Assets', phase: 'P2', decision: 'wrap', tier: 'R' });
    expect(c.nonHttp[0]?.sdkMethod).toBe('RtlsWebSocketSubscriber.connect()');
    expect(c.markdown).toContain(
      '| GET | `/assets/{ns}` | `client.assets.list()` | R | wrap |\n| POST | `/assets/{ns}` | `client.health()` | W | wrap |'
    );
    expect(c.markdown).toContain(
      '| `ws:/positions` | ws-endpoint | `RtlsWebSocketSubscriber.connect()` | R | wrap |'
    );
    expect(c.markdown).toContain('| Assets | 2 | 2 | 0 |\n| zones | 1 | 1 | 0 |');
    expect(c.markdown.startsWith('# Endpoint coverage\n')).toBe(true);
    expect(c.markdown).toContain('Spec `9.9.9-test` · 3 operations · 3 wrapped · 0 excluded');
    expect(c.markdown.indexOf('## Assets')).toBeLessThan(c.markdown.indexOf('## zones'));
  });

  it('a spec operation without a decision → CoverageError naming METHOD path', () => {
    const problems = problemsOf(
      scratch([...THREE_OPS, { method: 'delete', path: '/zones/{ns}', tag: 'zones' }], THREE_BASE, {
        P2: { operations: THREE_P2 },
      })
    );
    expect(problems).toContain('DELETE /zones/{ns}: no decision');
    expect(() =>
      buildCoverage(
        scratch([...THREE_OPS, { method: 'put', path: '/x', tag: 'X' }], THREE_BASE, {
          P2: { operations: THREE_P2 },
        })
      )
    ).toThrow(CoverageError);
  });

  it('the same operation decided in two phase files → CoverageError', () => {
    const problems = problemsOf(
      scratch(THREE_OPS, THREE_BASE, {
        P2: { operations: THREE_P2 },
        P3: {
          operations: [{ op: 'GET /zones/{ns}', decision: 'wrap', sdk: 'zones.list', tier: 'R' }],
        },
      })
    );
    expect(
      problems.some((p) => p.startsWith('GET /zones/{ns}: decided more than once (P2, P3)'))
    ).toBe(true);
  });

  it('a manifest entry absent from the spec → CoverageError', () => {
    const problems = problemsOf(
      scratch(THREE_OPS, THREE_BASE, {
        P2: {
          operations: [
            ...THREE_P2,
            { op: 'GET /missing/{ns}', decision: 'wrap', sdk: 'missing.get', tier: 'R' },
          ],
        },
      })
    );
    expect(problems).toEqual([
      'GET /missing/{ns}: P2.json names an operation absent from the spec',
    ]);
    const baseProblems = problemsOf(
      scratch(
        THREE_OPS,
        [
          ...THREE_BASE,
          { id: 'GET /gone', tag: 'X', phase: 'none', decision: 'exclude', reason: 'r' },
        ],
        {
          P2: { operations: THREE_P2 },
        }
      )
    );
    expect(baseProblems).toContain('GET /gone: base.json names an operation absent from the spec');
  });

  it('wrap without sdk, wrap without tier or allowlist, exclude without reason → one problem each; allowlist alone is accepted', () => {
    const ops: SpecOp[] = [
      { method: 'get', path: '/a', tag: 'T' },
      { method: 'get', path: '/b', tag: 'T' },
      { method: 'get', path: '/c', tag: 'T' },
    ];
    const base: BaseOp[] = [
      { id: 'GET /a', tag: 'T', phase: 'P4', decision: 'wrap' },
      { id: 'GET /b', tag: 'T', phase: 'P4', decision: 'wrap' },
      { id: 'GET /c', tag: 'T', phase: 'P4', decision: 'exclude' },
    ];
    const problems = problemsOf(
      scratch(ops, base, {
        P4: {
          operations: [
            { op: 'GET /a', decision: 'wrap', tier: 'R' },
            { op: 'GET /b', decision: 'wrap', sdk: 'navigation.b' },
            { op: 'GET /c', decision: 'exclude' },
          ],
        },
      })
    );
    expect(problems.sort()).toEqual([
      'GET /a: wrap without sdkMethod',
      'GET /b: wrap with neither tier nor allowlist',
      'GET /c: exclude without reason',
    ]);
    const ok = buildCoverage(
      scratch(ops, base, {
        P4: {
          operations: [
            { op: 'GET /a', decision: 'wrap', sdk: 'navigation.accessiblePath', allowlist: 'P4-1' },
            { op: 'GET /b', decision: 'wrap', sdk: 'navigation.b', tier: 'R' },
            { op: 'GET /c', decision: 'exclude', reason: 'Server cache internals.' },
          ],
        },
      })
    );
    expect(ok.markdown).toContain(
      '| GET | `/a` | `client.navigation.accessiblePath()` | not live (allowlist P4-1) | wrap |'
    );
    expect(ok.markdown).toContain('| GET | `/c` | — | — | exclude: Server cache internals. |');
    expect(ok.summary).toMatchObject({ total: 3, wrapped: 2, excluded: 1 });
  });

  it('escapes | in reasons and paths and puts paths in backticks', () => {
    const c = buildCoverage(
      scratch(
        [{ method: 'get', path: '/a|b', tag: 'T' }],
        [{ id: 'GET /a|b', tag: 'T', phase: 'none', decision: 'exclude', reason: 'either x | y' }],
        {}
      )
    );
    expect(c.markdown).toContain('| GET | `/a\\|b` | — | — | exclude: either x \\| y |');
    expect(c.rows[0]).toMatchObject({ phase: 'none', reason: 'either x | y' });
  });

  it('is deterministic and carries no date', () => {
    const inputs = scratch(THREE_OPS, THREE_BASE, { P2: { operations: THREE_P2 } });
    const a = buildCoverage(inputs);
    const b = buildCoverage(inputs);
    expect(b.markdown).toBe(a.markdown);
    expect(b.json).toBe(a.json);
    expect(a.markdown).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    expect(a.json).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    expect(a.json.endsWith('}\n')).toBe(true);
    expect(JSON.parse(a.json)).toEqual({ summary: a.summary, rows: a.rows, nonHttp: a.nonHttp });
  });

  it('non-HTTP entries: a separate section in kind/id order, not counted; wrap without sdk renders —; wrap without tier or allowlist fails', () => {
    const nonHttp = [
      { id: 'ws:msg:B', kind: 'ws-message', decision: 'exclude', reason: 'internal message' },
      {
        id: 'ws:/positions',
        kind: 'ws-endpoint',
        decision: 'wrap',
        sdk: 'RtlsWebSocketSubscriber.connect',
        tier: 'R',
      },
    ];
    const c = buildCoverage(
      scratch(THREE_OPS, THREE_BASE, { P2: { operations: THREE_P2 }, P8: { nonHttp } })
    );
    expect(c.markdown).toContain(
      '## WebSocket (non-HTTP, not counted in the 176)\n\n| Id | Kind | SDK method | Live tier | Decision |\n|---|---|---|---|---|\n' +
        '| `ws:/positions` | ws-endpoint | `RtlsWebSocketSubscriber.connect()` | R | wrap |\n' +
        '| `ws:msg:B` | ws-message | — | — | exclude: internal message |\n'
    );
    expect(JSON.parse(c.json).nonHttp).toHaveLength(2);
    expect(c.summary.total).toBe(3);

    const noSdk = buildCoverage(
      scratch(THREE_OPS, THREE_BASE, {
        P2: { operations: THREE_P2 },
        P8: { nonHttp: [{ id: 'ws:cmd:x', kind: 'ws-command', decision: 'wrap', tier: 'R' }] },
      })
    );
    expect(noSdk.markdown).toContain('| `ws:cmd:x` | ws-command | — | R | wrap |');

    const bad = problemsOf(
      scratch(THREE_OPS, THREE_BASE, {
        P2: { operations: THREE_P2 },
        P8: { nonHttp: [{ id: 'ws:cmd:y', kind: 'ws-command', decision: 'wrap', sdk: 'x.y' }] },
      })
    );
    expect(bad).toEqual(['ws:cmd:y: non-HTTP wrap with neither tier nor allowlist']);

    const none = buildCoverage(scratch(THREE_OPS, THREE_BASE, { P2: { operations: THREE_P2 } }));
    expect(none.markdown).not.toContain('## WebSocket');
  });
});
