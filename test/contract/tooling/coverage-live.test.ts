// Unit tests of `coverage:live:check` (scripts/coverage/live-check.mjs, P0 §5.7, §8.2). Every case builds a scratch
// repository: src files of P1 (src/client/**, src/utils/**) and P6 (src/resources/notifications/**), live source
// runs under coverage-live/<label>/ (coverage-final.json, sources.json, report.json), a unit report, allowlist
// fragments and a base manifest. Coverage data is hand-made istanbul JSON, one statement per listed line.
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { main, runLiveCheck } from '../../../scripts/coverage/live-check.mjs';

const TRANSPORT = 'src/client/transport.ts';
const HELPER = 'src/utils/helper.ts';
const NOTIFY = 'src/resources/notifications/index.ts';
const UNIT_TEST = 'test/unit/core/transport.test.ts';

// Line numbers used below (1-based):
//  1 export function send(): number {       2 return 1;   3 }
//  4 export function browserOnly(): number { 5 return 2;   6 }
//  7 export const cb = [1].map((x) => x + 1);
//  8 export function rare(): number {        9 return 3;  10 }
const TRANSPORT_SRC = [
  'export function send(): number {',
  '  return 1;',
  '}',
  'export function browserOnly(): number {',
  '  return 2;',
  '}',
  'export const cb = [1].map((x) => x + 1);',
  'export function rare(): number {',
  '  return 3;',
  '}',
  '',
].join('\n');
const HELPER_SRC = ['export function helper(): number {', '  return 4;', '}', ''].join('\n');
const NOTIFY_SRC = ['export function inbox(): number {', '  return 5;', '}', ''].join('\n');

type Fn = { name: string; start: number; end: number; count: number };
type FileSpec = { lines: Record<number, number>; fns: Fn[] };

function cov(path: string, spec: FileSpec) {
  const statementMap: Record<string, unknown> = {};
  const s: Record<string, number> = {};
  Object.entries(spec.lines).forEach(([line, count], i) => {
    statementMap[i] = {
      start: { line: Number(line), column: 0 },
      end: { line: Number(line), column: 1 },
    };
    s[i] = count;
  });
  const fnMap: Record<string, unknown> = {};
  const f: Record<string, number> = {};
  spec.fns.forEach((fn, i) => {
    const loc = { start: { line: fn.start, column: 0 }, end: { line: fn.end, column: 1 } };
    fnMap[i] = { name: fn.name, decl: loc, loc, line: fn.start };
    f[i] = fn.count;
  });
  return { path, statementMap, s, fnMap, f, branchMap: {}, b: {} };
}

/** Live data of the three files where every line and function ran (counts overridable). */
function fullLive(overrides: Partial<Record<string, FileSpec>> = {}): Record<string, FileSpec> {
  return {
    [TRANSPORT]: {
      lines: { 1: 1, 2: 1, 4: 1, 5: 1, 7: 1, 8: 1, 9: 1 },
      fns: [
        { name: 'send', start: 1, end: 3, count: 1 },
        { name: 'browserOnly', start: 4, end: 6, count: 1 },
        { name: '(anonymous_2)', start: 7, end: 7, count: 1 },
        { name: 'rare', start: 8, end: 10, count: 1 },
      ],
    },
    [HELPER]: { lines: { 1: 1, 2: 1 }, fns: [{ name: 'helper', start: 1, end: 3, count: 1 }] },
    [NOTIFY]: { lines: { 1: 1, 2: 1 }, fns: [{ name: 'inbox', start: 1, end: 3, count: 1 }] },
    ...overrides,
  } as Record<string, FileSpec>;
}

const sha = (text: string) => createHash('sha256').update(text).digest('hex');

class Scratch {
  readonly root = join(mkdtempSync(join(tmpdir(), 'rtls-live-check-')), 'repo');
  constructor() {
    this.write(TRANSPORT, TRANSPORT_SRC);
    this.write(HELPER, HELPER_SRC);
    this.write(NOTIFY, NOTIFY_SRC);
    this.write(UNIT_TEST, '// unit test\n');
    this.write('src/generated/schema.ts', 'export {};\n');
    // Unit report: every line covered.
    this.writeJson('coverage/coverage-final.json', this.coverage(fullLive()));
    this.writeJson('spec/manifest/base.json', {
      specVersion: 'x',
      operations: [
        {
          id: 'POST /spatial/navigate/{namespace}/accessible-path',
          tag: 'Navigation',
          phase: 'P4',
          decision: 'wrap',
        },
        {
          id: 'GET /status/{component}',
          tag: 'Health',
          phase: 'P5',
          decision: 'exclude',
          reason: 'r',
        },
      ],
    });
  }

  write(rel: string, text: string): void {
    mkdirSync(dirname(join(this.root, rel)), { recursive: true });
    writeFileSync(join(this.root, rel), text);
  }

  writeJson(rel: string, value: unknown): void {
    this.write(rel, `${JSON.stringify(value, null, 2)}\n`);
  }

  coverage(files: Record<string, FileSpec>, root = this.root) {
    return Object.fromEntries(
      Object.entries(files).map(([rel, spec]) => [join(root, rel), cov(join(root, rel), spec)])
    );
  }

  sources(overrides: Record<string, string> = {}) {
    const read = (rel: string) => readFileSync(join(this.root, rel), 'utf8');
    return {
      version: 1,
      files: {
        [TRANSPORT]: sha(read(TRANSPORT)),
        [HELPER]: sha(read(HELPER)),
        [NOTIFY]: sha(read(NOTIFY)),
        ...overrides,
      },
    };
  }

  /** One source run; `sources: null` writes no sources.json, `report: null` no report.json. */
  liveRun(
    label: string,
    files: Record<string, FileSpec>,
    options: { sources?: unknown; report?: unknown; root?: string } = {}
  ): void {
    const dir = `coverage-live/${label}`;
    this.writeJson(`${dir}/coverage-final.json`, this.coverage(files, options.root));
    if (options.sources !== null)
      this.writeJson(`${dir}/sources.json`, options.sources ?? this.sources());
    if (options.report !== undefined && options.report !== null)
      this.writeJson(`${dir}/report.json`, options.report);
  }

  allowlist(phase: string, entries: unknown[], residue?: unknown[]): void {
    this.writeJson(
      `test/integration/allowlist/${phase}.json`,
      residue ? { phase, entries, residue } : entries
    );
  }

  check(options: { phase?: string; release?: boolean } = {}) {
    return runLiveCheck({
      root: this.root,
      surface: () => [
        { name: 'send', file: TRANSPORT, line: 1 },
        { name: 'browserOnly', file: TRANSPORT, line: 4 },
        { name: 'notifications.inbox', file: NOTIFY, line: 1 },
      ],
      writeOutputs: false,
      ...options,
    });
  }
}

const line = (id: string, from: number, to: number, extra: Record<string, unknown> = {}) => ({
  id,
  file: TRANSPORT,
  lines: [from, to],
  match: TRANSPORT_SRC.split('\n')[from - 1]?.slice(0, 20) ?? '',
  category: 'unreachable-live',
  reason: 'cannot be provoked safely against production',
  unitTest: UNIT_TEST,
  ...extra,
});

/** Live data where `browserOnly` (lines 4–6) never ran. */
const browserOnlyUncovered = () =>
  fullLive({
    [TRANSPORT]: {
      lines: { 1: 1, 2: 1, 4: 0, 5: 0, 7: 1, 8: 1, 9: 1 },
      fns: [
        { name: 'send', start: 1, end: 3, count: 1 },
        { name: 'browserOnly', start: 4, end: 6, count: 0 },
        { name: '(anonymous_2)', start: 7, end: 7, count: 1 },
        { name: 'rare', start: 8, end: 10, count: 1 },
      ],
    },
  });

/** Live data where only line 9 of `rare` (its body) never ran; the function itself did. */
const rareBodyUncovered = () =>
  fullLive({
    [TRANSPORT]: {
      lines: { 1: 1, 2: 1, 4: 1, 5: 1, 7: 1, 8: 1, 9: 0 },
      fns: [
        { name: 'send', start: 1, end: 3, count: 1 },
        { name: 'browserOnly', start: 4, end: 6, count: 1 },
        { name: '(anonymous_2)', start: 7, end: 7, count: 1 },
        { name: 'rare', start: 8, end: 10, count: 1 },
      ],
    },
  });

const ACTIVATING_TEST = '[C] mappings > creates a mapping when none exists';
const reportWith = (activated: boolean, skippedForTier = false) => ({
  domains: {
    core: {
      passed: 1,
      failed: 0,
      skipped: skippedForTier
        ? [
            {
              test: `[C] mappings (skipped: tier C off (RTLS_IT_CONFIG not 1)) > creates a mapping when none exists`,
              reason: 'tier',
            },
          ]
        : activated
          ? [{ test: ACTIVATING_TEST, reason: 'existing entity' }]
          : [],
    },
  },
  dynamicAllowlist: activated
    ? [
        {
          allowlistId: 'P1-3',
          test: ACTIVATING_TEST,
          kind: 'run-scoped',
          reason: 'existing entity',
        },
      ]
    : [],
});

describe('coverage:live:check functions', () => {
  it('an uncovered named function fails even inside an unreachable-live range', () => {
    const s = new Scratch();
    s.liveRun('r1', browserOnlyUncovered());
    s.allowlist('P1', [line('P1-1', 4, 6)]);
    const r = s.check();
    expect(r.status).toBe('fail');
    expect(r.errors).toContain(`${TRANSPORT}:4: function browserOnly not executed live`);
  });

  it('an uncovered named function inside an environment range passes', () => {
    const s = new Scratch();
    s.liveRun('r1', browserOnlyUncovered());
    s.allowlist('P1', [
      line('P1-1', 4, 6, {
        category: 'environment',
        reason: 'browser-only code path, never in Node',
      }),
    ]);
    const r = s.check();
    expect(r.errors).toEqual([]);
    expect(r.status).toBe('pass');
  });

  it('an uncovered anonymous callback inside a line range passes, outside one fails', () => {
    const s = new Scratch();
    const live = fullLive({
      [TRANSPORT]: {
        lines: { 1: 1, 2: 1, 4: 1, 5: 1, 7: 0, 8: 1, 9: 1 },
        fns: [
          { name: 'send', start: 1, end: 3, count: 1 },
          { name: 'browserOnly', start: 4, end: 6, count: 1 },
          { name: '(anonymous_2)', start: 7, end: 7, count: 0 },
          { name: 'rare', start: 8, end: 10, count: 1 },
        ],
      },
    });
    s.liveRun('r1', live);
    expect(s.check().errors).toContain(
      `${TRANSPORT}:7: anonymous function not executed live and not inside an allowlisted range`
    );
    s.allowlist('P1', [line('P1-1', 7, 7)]);
    expect(s.check().errors).toEqual([]);
  });
});

describe('coverage:live:check coverage-ignore hints', () => {
  it('a /* v8 ignore */ (or c8, istanbul, node:coverage) hint in a judged src file fails with file:line', () => {
    const s = new Scratch();
    const hinted = [
      'export function helper(): number {',
      '  /* v8 ignore next -- @preserve */',
      '  return 4;',
      '}',
      '// istanbul ignore else',
      '',
    ].join('\n');
    s.write(HELPER, hinted);
    s.liveRun('r1', fullLive());
    const r = s.check();
    expect(r.status).toBe('fail');
    expect(r.errors).toEqual([
      `${HELPER}:2: coverage ignore hint: use an allowlist entry`,
      `${HELPER}:5: coverage ignore hint: use an allowlist entry`,
    ]);
    // outside the judged scope (another phase's file) the hint is not this check's finding
    expect(s.check({ phase: 'P6' }).errors).toEqual([]);
  });

  it('a /* node:coverage disable */ … /* node:coverage enable */ block fails with file:line', () => {
    const s = new Scratch();
    const hinted = [
      'export function helper(): number {',
      '  /* node:coverage disable -- @preserve */',
      '  return 4;',
      '  /* node:coverage enable -- @preserve */',
      '}',
      '',
    ].join('\n');
    s.write(HELPER, hinted);
    s.liveRun('r1', fullLive());
    const r = s.check();
    expect(r.status).toBe('fail');
    expect(r.errors).toEqual([
      `${HELPER}:2: coverage ignore hint: use an allowlist entry`,
      `${HELPER}:4: coverage ignore hint: use an allowlist entry`,
    ]);
  });
});

describe('coverage:live:check lines and entries', () => {
  it('an allowlisted line range passes; an unlisted uncovered line fails', () => {
    const s = new Scratch();
    s.liveRun('r1', rareBodyUncovered());
    expect(s.check().errors).toEqual([
      `${TRANSPORT}:9: line not executed live and not allowlisted`,
    ]);
    s.allowlist('P1', [line('P1-1', 9, 9)]);
    const r = s.check();
    expect(r.errors).toEqual([]);
    expect(r.rows.find((x) => x.file === TRANSPORT)?.allowlisted).toBe(1);
  });

  it('a stale match fails', () => {
    const s = new Scratch();
    s.liveRun('r1', rareBodyUncovered());
    s.allowlist('P1', [line('P1-1', 9, 9, { match: 'no longer here' })]);
    expect(s.check().errors).toEqual([
      `allowlist/P1.json P1-1: stale (match not found on ${TRANSPORT}:9)`,
    ]);
  });

  it('a range the unit tests do not cover fails', () => {
    const s = new Scratch();
    s.liveRun('r1', rareBodyUncovered());
    s.writeJson('coverage/coverage-final.json', s.coverage(rareBodyUncovered()));
    s.allowlist('P1', [line('P1-1', 9, 9)]);
    expect(s.check().errors).toEqual([
      'allowlist/P1.json P1-1: lines 9 not covered by the unit tests',
    ]);
  });

  it('an unneeded entry warns, and fails with --release', () => {
    const s = new Scratch();
    s.liveRun('r1', fullLive());
    s.allowlist('P1', [line('P1-1', 9, 9)]);
    const r = s.check();
    expect(r.status).toBe('pass');
    expect(r.warnings).toEqual([
      'allowlist/P1.json P1-1: unneeded (every line of the range ran live)',
    ]);
    const rel = s.check({ release: true });
    expect(rel.status).toBe('fail');
    expect(rel.errors).toEqual([
      'allowlist/P1.json P1-1: unneeded (every line of the range ran live)',
    ]);
  });

  it('an operation entry with a base wrap op of its phase passes; with an unknown op it fails', () => {
    const s = new Scratch();
    s.liveRun('r1', fullLive());
    const op = (id: string, opId: string) => ({
      id,
      op: opId,
      category: 'excluded-by-policy',
      reason: 'the server call is never made live by policy',
      unitTest: UNIT_TEST,
    });
    s.allowlist('P4', [op('P4-1', 'POST /spatial/navigate/{namespace}/accessible-path')]);
    expect(s.check().errors).toEqual([]);
    s.allowlist('P4', [op('P4-1', 'GET /nope/{ns}'), op('P4-2', 'GET /status/{component}')]);
    expect(s.check().errors).toEqual([
      'allowlist/P4.json P4-1: op GET /nope/{ns} is not in base.json',
      'allowlist/P4.json P4-2: op GET /status/{component} is not a wrapped operation of P4',
    ]);
  });

  it('residue entries are accepted', () => {
    const s = new Scratch();
    s.liveRun('r1', fullLive());
    s.allowlist(
      'P7',
      [],
      [
        {
          kind: 'etl-activity-log',
          match: 'upload',
          perRun: true,
          category: 'non-removable',
          reason: 'activity logs cannot be deleted',
        },
      ]
    );
    const r = s.check();
    expect(r.errors).toEqual([]);
    expect(r.status).toBe('pass');
  });

  it('an entry whose method is not a surface name fails', () => {
    const s = new Scratch();
    s.liveRun('r1', rareBodyUncovered());
    s.allowlist('P1', [line('P1-1', 9, 9, { method: 'rare' })]);
    expect(s.check().errors).toEqual(['allowlist/P1.json P1-1: method rare is not a surface name']);
    s.allowlist('P1', [line('P1-1', 9, 9, { method: 'send' })]);
    expect(s.check().errors).toEqual([]);
  });

  it('rejects an entry that breaks the schema', () => {
    const s = new Scratch();
    s.liveRun('r1', fullLive());
    s.allowlist('P1', [{ ...line('P1-1', 9, 9), reason: 'short' }]);
    expect(s.check().errors.some((e) => e.startsWith('allowlist/P1.json: schema:'))).toBe(true);
  });
});

describe('coverage:live:check deferred entries', () => {
  it('a deferredTo P6 entry covering a whole uncovered named function of a P1 file passes and is listed; --release fails', () => {
    const s = new Scratch();
    s.liveRun('r1', browserOnlyUncovered());
    s.allowlist('P1', [line('P1-1', 4, 6, { deferredTo: 'P6', category: 'excluded-by-policy' })]);
    const r = s.check();
    expect(r.errors).toEqual([]);
    expect(r.deferred).toEqual([`P1-1 ${TRANSPORT}:4-6 → P6`]);
    expect(r.rows.find((x) => x.file === TRANSPORT)?.deferred).toBe(2);
    const rel = s.check({ release: true });
    expect(rel.errors).toContain(
      'allowlist/P1.json P1-1: deferredTo P6 is not accepted with --release'
    );
    expect(rel.errors).toContain(`${TRANSPORT}:4: function browserOnly not executed live`);
  });

  it('a deferredTo naming an earlier phase fails; excluded-by-policy is an accepted category', () => {
    const s = new Scratch();
    s.liveRun('r1', browserOnlyUncovered());
    s.allowlist('P1', [line('P1-1', 4, 6, { deferredTo: 'P2', category: 'excluded-by-policy' })]);
    expect(s.check().errors).toEqual([]);
    s.allowlist('P6', [
      { ...line('P6-1', 1, 3, { deferredTo: 'P2' }), file: NOTIFY, match: 'export function inbox' },
    ]);
    expect(s.check().errors).toContain(
      'allowlist/P6.json P6-1: deferredTo P2 does not come after the owner P6'
    );
  });
});

describe('coverage:live:check run-scoped entries', () => {
  const scoped = () => line('P1-3', 9, 9, { runScoped: true });

  it('accepted when every judged source run activated it; missing in one judged run → its lines must be covered', () => {
    const s = new Scratch();
    s.allowlist('P1', [scoped()]);
    s.liveRun('r1', rareBodyUncovered(), { report: reportWith(true) });
    s.liveRun('r2', rareBodyUncovered(), { report: reportWith(true) });
    expect(s.check().errors).toEqual([]);
    s.liveRun('r3', rareBodyUncovered(), { report: reportWith(false) });
    expect(s.check().errors).toEqual([
      `${TRANSPORT}:9: line not executed live and not allowlisted`,
    ]);
  });

  it('a full-tier activation is accepted next to a tier-R-only run that skipped the activating test for tier', () => {
    const s = new Scratch();
    s.allowlist('P1', [scoped()]);
    s.liveRun('full', rareBodyUncovered(), { report: reportWith(true) });
    s.liveRun('tier-r', rareBodyUncovered(), { report: reportWith(false, true) });
    expect(s.check().errors).toEqual([]);
  });

  it('not accepted when no kept run activated it; a source folder without report.json activates nothing', () => {
    const s = new Scratch();
    s.allowlist('P1', [scoped()]);
    s.liveRun('no-report', rareBodyUncovered());
    expect(s.check().errors).toEqual([
      `${TRANSPORT}:9: line not executed live and not allowlisted`,
    ]);
    s.liveRun('activated', rareBodyUncovered(), { report: reportWith(true) });
    expect(s.check().errors).toEqual([
      `${TRANSPORT}:9: line not executed live and not allowlisted`,
    ]);
  });
});

describe('coverage:live:check source runs', () => {
  it('merges two reports', () => {
    const s = new Scratch();
    s.liveRun('r1', rareBodyUncovered());
    s.liveRun('r2', browserOnlyUncovered());
    const r = s.check();
    expect(r.errors).toEqual([]);
    expect(r.runs.map((x) => x.label)).toEqual(['r1', 'r2']);
    expect(r.rows.find((x) => x.file === TRANSPORT)).toMatchObject({
      functions: '4/4',
      lines: '7/7',
    });
  });

  it('ignores a run of an older version of a file for that file, lists it as stale, and keeps it for unchanged files', () => {
    const s = new Scratch();
    s.liveRun('old', fullLive(), { sources: s.sources({ [TRANSPORT]: sha('older version') }) });
    s.liveRun('new', rareBodyUncovered(), {
      sources: s.sources({ [HELPER]: sha('older helper') }),
    });
    const r = s.check();
    expect(r.rows.find((x) => x.file === TRANSPORT)?.stale).toEqual(['old']);
    expect(r.rows.find((x) => x.file === HELPER)?.stale).toEqual(['new']);
    // TRANSPORT: only `new` is kept, whose line 9 did not run; HELPER: only `old`, fully covered.
    expect(r.errors).toEqual([`${TRANSPORT}:9: line not executed live and not allowlisted`]);
  });

  it('a folder without sources.json is stale for every file', () => {
    const s = new Scratch();
    s.liveRun('unhashed', fullLive(), { sources: null });
    const r = s.check();
    expect(r.rows.every((x) => x.stale.includes('unhashed'))).toBe(true);
    expect(r.errors).toContain(
      `${TRANSPORT}: no live data on its current version (stale runs: unhashed)`
    );
  });

  it('merges a folder copied from another worktree for the files whose hash matches, with its activations', () => {
    const s = new Scratch();
    s.allowlist('P1', [line('P1-3', 9, 9, { runScoped: true })]);
    // The lane's tier-S verification run, copied in: other absolute paths, the current file versions, line 9
    // skipped by the activating test.
    s.liveRun('lane-s', rareBodyUncovered(), {
      root: join(dirname(s.root), 'lane-worktree'),
      report: reportWith(true),
    });
    // The post-merge run of this checkout skipped that test for tier.
    s.liveRun('main', rareBodyUncovered(), { report: reportWith(false, true) });
    const r = s.check();
    expect(r.runs.map((x) => x.label)).toEqual(['lane-s', 'main']);
    expect(r.rows.find((x) => x.file === TRANSPORT)?.stale).toEqual([]);
    expect(r.errors).toEqual([]);
    rmSync(join(s.root, 'coverage-live', 'lane-s', 'report.json'));
    expect(s.check().errors).toEqual([
      `${TRANSPORT}:9: line not executed live and not allowlisted`,
    ]);
  });

  it('no source run → exit 2; a phase that owns no src file passes by construction', () => {
    const s = new Scratch();
    const out: string[] = [];
    const deps = {
      root: s.root,
      surface: () => [],
      writeOutputs: false,
      log: (l: string) => out.push(l),
      error: (l: string) => out.push(l),
    };
    expect(main([], deps)).toBe(2);
    expect(main(['--phase', 'P0'], deps)).toBe(0);
    expect(main(['--phase', 'P0', '--release'], deps)).toBe(2);
  });
});

describe('coverage:live:check --phase scoping', () => {
  it('checks only the files the phase owns and its own entries', () => {
    const s = new Scratch();
    s.liveRun(
      'r1',
      fullLive({
        [NOTIFY]: { lines: { 1: 1, 2: 0 }, fns: [{ name: 'inbox', start: 1, end: 3, count: 1 }] },
      })
    );
    expect(s.check({ phase: 'P1' }).errors).toEqual([]);
    expect(s.check({ phase: 'P1' }).scope).toEqual([TRANSPORT, HELPER]);
    expect(s.check({ phase: 'P6' }).errors).toEqual([
      `${NOTIFY}:2: line not executed live and not allowlisted`,
    ]);
    expect(s.check({ phase: 'P6' }).scope).toEqual([NOTIFY]);
  });

  it('a manifest entry referring to a missing allowlist entry fails', () => {
    const s = new Scratch();
    s.liveRun('r1', fullLive());
    s.writeJson('spec/manifest/P4.json', {
      phase: 'P4',
      domain: 'venues-navigation',
      status: 'draft',
      operations: [
        {
          op: 'POST /spatial/navigate/{namespace}/accessible-path',
          decision: 'wrap',
          allowlist: 'P4-9',
        },
      ],
    });
    expect(s.check().errors).toEqual([
      'spec/manifest/P4.json operations: allowlist P4-9 not found',
    ]);
  });
});
