// coverage:live:check on real provider output (P0 §5.7 step 3). One vitest coverage run of two fixture modules, with
// the coverage options of vitest.integration.config.ts (test/contract/__fixtures__/live-coverage/), produces the
// coverage-final.json a live run would write: the one-line mapping callback of callbacks.ts never runs, and in
// things.ts only Things.list runs. The check must see the callback as anonymous with count 0 and reject it outside a
// line entry; with AST-aware remapping the provider names every method `(anonymous_<n>)` (and counts an uncalled
// static method 1), so the check must take function names from the source and require a function's first
// statement to have run. Hand-made fnMaps (coverage-live.test.ts) cannot show what the provider emits.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { runLiveCheck } from '../../../scripts/coverage/live-check.mjs';

const ROOT = join(__dirname, '..', '..', '..');
const FIXTURES = join(ROOT, 'test', 'contract', '__fixtures__', 'live-coverage');
const MODULE = 'src/resources/callbacks.ts';
const THINGS = 'src/resources/things.ts';
const UNIT_TEST = 'test/resources/callbacks.test.ts';

interface FileData {
  path: string;
  fnMap: Record<string, { name: string; loc: { start: { line: number }; end: { line: number } } }>;
  f: Record<string, number>;
  statementMap: Record<string, { start: { line: number } }>;
  s: Record<string, number>;
}

let probe: FileData;
let things: FileData;

beforeAll(() => {
  const out = mkdtempSync(join(tmpdir(), 'rtls-live-provider-'));
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([k]) => !k.startsWith('VITEST') && k !== 'NODE_OPTIONS')
  );
  const run = spawnSync(
    process.execPath,
    [
      join(ROOT, 'node_modules', 'vitest', 'vitest.mjs'),
      'run',
      '--config',
      join(FIXTURES, 'vitest.probe.config.ts'),
      '--root',
      ROOT,
      `--coverage.reportsDirectory=${out}`,
    ],
    { cwd: ROOT, env, encoding: 'utf8', timeout: 60_000 }
  );
  if (run.status !== 0) throw new Error(`probe run failed (exit ${run.status})`);
  const report = JSON.parse(readFileSync(join(out, 'coverage-final.json'), 'utf8')) as Record<
    string,
    FileData
  >;
  const find = (name: string): FileData => {
    const entry = Object.values(report).find((d) => d.path.endsWith(`/${name}`));
    if (!entry) throw new Error(`probe report has no entry for ${name}`);
    return entry;
  };
  probe = find('callbacks.ts');
  things = find('things.ts');
}, 90_000);

/** A scratch repository whose src/resources/<module> carries the probe data of one fixture as one live run. */
function scratch(
  allowlist: unknown[] | null,
  options: {
    module?: string;
    fixture?: string;
    data?: FileData;
    surface?: { name: string; file: string; line: number }[];
  } = {}
) {
  const module = options.module ?? MODULE;
  const fixtureData = options.data ?? probe;
  const root = join(mkdtempSync(join(tmpdir(), 'rtls-live-provider-repo-')), 'repo');
  const write = (rel: string, text: string): void => {
    mkdirSync(dirname(join(root, rel)), { recursive: true });
    writeFileSync(join(root, rel), text);
  };
  const source = readFileSync(join(FIXTURES, options.fixture ?? 'callbacks.ts'), 'utf8');
  write(module, source);
  write(UNIT_TEST, '// unit test\n');
  const data = { [join(root, module)]: { ...fixtureData, path: join(root, module) } };
  write('coverage-live/r1/coverage-final.json', JSON.stringify(data));
  write(
    'coverage-live/r1/sources.json',
    JSON.stringify({
      version: 1,
      files: { [module]: createHash('sha256').update(source).digest('hex') },
    })
  );
  // The unit report: the same module, run by a unit test that reaches every function.
  const unit = {
    ...fixtureData,
    path: join(root, module),
    f: Object.fromEntries(Object.keys(fixtureData.f).map((k) => [k, 1])),
    s: Object.fromEntries(Object.keys(fixtureData.s).map((k) => [k, 1])),
  };
  write('coverage/coverage-final.json', JSON.stringify({ [join(root, module)]: unit }));
  write('spec/manifest/base.json', JSON.stringify({ specVersion: 'x', operations: [] }));
  if (allowlist) write('test/integration/allowlist/P4.json', JSON.stringify(allowlist));
  return runLiveCheck({ root, surface: () => options.surface ?? [], writeOutputs: false });
}

const lineEntry = (
  id: string,
  file: string,
  lines: [number, number],
  match: string,
  category: string
) => ({
  id,
  file,
  lines,
  match,
  category,
  reason: 'a probe range that no live test reaches',
  unitTest: UNIT_TEST,
});

describe('coverage:live:check on the provider output of the live config', () => {
  it('the uncalled one-line callback is a fnMap entry `(anonymous_<n>)` with count 0; its line still counts', () => {
    const fns = Object.entries(probe.fnMap).map(([id, fn]) => ({
      name: fn.name,
      line: fn.loc.start.line,
      count: probe.f[id],
    }));
    expect(fns).toEqual(
      expect.arrayContaining([
        { name: 'mapIds', line: 1, count: 1 },
        { name: expect.stringMatching(/^\(anonymous_\d+\)$/), line: 2, count: 0 },
      ])
    );
  });

  it('runLiveCheck rejects that callback outside a line entry and accepts it inside one', () => {
    const outside = scratch(null);
    expect(outside.status).toBe('fail');
    expect(outside.errors).toEqual([
      `${MODULE}:2: anonymous function not executed live and not inside an allowlisted range`,
    ]);
    const entry = {
      id: 'P4-1',
      file: MODULE,
      lines: [2, 2],
      match: 'items.map',
      category: 'unreachable-live',
      reason: 'no live listing returns an item here',
      unitTest: UNIT_TEST,
    };
    const inside = scratch([entry]);
    expect(inside.errors).toEqual([]);
    // the line counts as executed (another statement on it ran), the callback did not: the entry is needed
    expect(inside.warnings).toEqual([]);
    expect(inside.status).toBe('pass');
  });
});

describe('coverage:live:check names methods from the source (AST-aware remapping)', () => {
  const fromThings = (
    allowlist: unknown[] | null,
    surface?: { name: string; file: string; line: number }[]
  ) =>
    scratch(allowlist, {
      module: THINGS,
      fixture: 'things.ts',
      data: things,
      ...(surface ? { surface } : {}),
    });
  /** the ranges of things.ts that never run live: the field initializer and the four uncalled functions */
  const ranges = (functions: string) => [
    lineEntry('P4-1', THINGS, [2, 2], 'items', 'unreachable-live'),
    lineEntry('P4-2', THINGS, [8, 10], 'remove(', functions),
    lineEntry('P4-3', THINGS, [12, 14], 'static make', functions),
    lineEntry('P4-4', THINGS, [18, 20], 'ping(', functions),
    lineEntry('P4-5', THINGS, [23, 25], 'export const named', functions),
  ];

  it('the provider names every method (anonymous_<n>); the uncalled static method counts 0 or 1', () => {
    const fns = Object.entries(things.fnMap).map(([id, fn]) => [fn.loc.start.line, things.f[id]]);
    expect(Object.values(things.fnMap).every((fn) => /^\(anonymous_\d+\)$/.test(fn.name))).toBe(
      true
    );
    expect(fns.map(([line]) => line)).toEqual([4, 8, 12, 18, 23]);
    expect(fns.filter(([line]) => line !== 12)).toEqual([
      [4, 1],
      [8, 0],
      [18, 0],
      [23, 0],
    ]);
    // The static method on line 12 is never called. Recent Node versions report it with count 1, older ones
    // (Node 20 and 22) with count 0; the check below names it from the source either way.
    const staticCount = fns.find(([line]) => line === 12)?.[1];
    expect([0, 1]).toContain(staticCount);
  });

  it('an uncalled method, static method, object method or named arrow fails inside an unreachable-live range', () => {
    const result = fromThings(ranges('unreachable-live'));
    expect(result.errors).toEqual([
      `${THINGS}:8: function remove not executed live`,
      `${THINGS}:12: function make not executed live`,
      `${THINGS}:18: function ping not executed live`,
      `${THINGS}:23: function named not executed live`,
    ]);
    expect(result.status).toBe('fail');
  });

  it('the same functions pass inside environment ranges; report.md shows the live count of a called method', () => {
    const result = fromThings(ranges('environment'), [
      { name: 'Things.list', file: THINGS, line: 4 },
      { name: 'Things.make', file: THINGS, line: 12 },
    ]);
    expect(result.errors).toEqual([]);
    expect(result.status).toBe('pass');
    expect(result.surfaceRows).toEqual([
      `| Things.list | ${THINGS}:4 | 1 |  |`,
      `| Things.make | ${THINGS}:12 | 0 | P4-3 |`,
    ]);
  });
});
