import { describe, it, expect, vi, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  GLOBAL_FLOOR,
  aggregate,
  evaluateCoverage,
  main,
  phaseOwnsSrc,
} from '../../../scripts/coverage/unit-check.mjs';

const ROOT = '/repo';

type M = { total: number; covered: number; pct: number };
const m = (covered: number, total: number): M => ({
  total,
  covered,
  pct: total ? Math.round((covered / total) * 10000) / 100 : 100,
});
const file = (lines: [number, number], branches: [number, number] = [1, 1]) => ({
  lines: m(...lines),
  statements: m(...lines),
  functions: m(1, 1),
  branches: m(...branches),
});
const totalOf = (lines: number, statements: number, functions: number, branches: number) => ({
  lines: m(lines, 100),
  statements: m(statements, 100),
  functions: m(functions, 100),
  branches: m(branches, 100),
});

describe('unit coverage thresholds (P0 §6.1 test:coverage)', () => {
  it('the global floor is the measured baseline rounded down', () => {
    expect(GLOBAL_FLOOR).toEqual({ lines: 73, statements: 73, functions: 75, branches: 85 });
    const at = evaluateCoverage({ total: totalOf(73, 73, 75, 85) }, { mode: 'floor' });
    expect(at.ok).toBe(true);
    const below = evaluateCoverage({ total: totalOf(73, 73, 74, 85) }, { mode: 'floor' });
    expect(below.ok).toBe(false);
    expect(below.lines.filter((l) => l.startsWith('FAIL'))).toEqual([
      'FAIL global functions 74% (floor 75%)',
    ]);
  });

  it('phase aggregate needs ≥ 95 % lines and ≥ 90 % branches over the phase files', () => {
    const summary = {
      total: totalOf(50, 50, 50, 50),
      [`${ROOT}/src/resources/etl.ts`]: file([96, 100], [9, 10]),
      [`${ROOT}/src/types/etl.ts`]: file([10, 10], [1, 1]),
      [`${ROOT}/src/resources/assets.ts`]: file([1, 100], [0, 10]),
    };
    const ok = evaluateCoverage(summary, { mode: 'phase', phase: 'P7', root: ROOT });
    expect(ok.ok).toBe(true);
    expect(ok.lines[0]).toBe('ok   P7 aggregate lines 96.36% (106/110; ≥ 95%)');
    expect(ok.lines[1]).toBe('ok   P7 aggregate branches 90.91% (10/11; ≥ 90%)');

    const lowBranches = {
      ...summary,
      [`${ROOT}/src/resources/etl.ts`]: file([100, 100], [8, 10]),
    };
    const res = evaluateCoverage(lowBranches, { mode: 'phase', phase: 'P7', root: ROOT });
    expect(res.ok).toBe(false);
    expect(res.lines.filter((l) => l.startsWith('FAIL'))).toEqual([
      'FAIL P7 aggregate branches 81.82% (9/11; ≥ 90%)',
    ]);
  });

  it('each phase file needs ≥ 80 % lines even when the aggregate passes', () => {
    const summary = {
      total: totalOf(99, 99, 99, 99),
      [`${ROOT}/src/resources/etl.ts`]: file([990, 1000], [100, 100]),
      [`${ROOT}/src/types/etl.ts`]: file([7, 10], [1, 1]),
    };
    const res = evaluateCoverage(summary, { mode: 'phase', phase: 'P7', root: ROOT });
    expect(res.ok).toBe(false);
    expect(res.lines).toContain('FAIL src/types/etl.ts lines 70% (≥ 80%)');
    expect(res.lines).toContain('ok   src/resources/etl.ts lines 99% (≥ 80%)');
    expect(aggregate([file([990, 1000]), file([7, 10])], 'lines').pct).toBeGreaterThan(95);
  });

  it('a file owned by another phase does not count for the phase', () => {
    const summary = {
      total: totalOf(1, 1, 1, 1),
      [`${ROOT}/src/utils/geojson.ts`]: file([100, 100], [10, 10]),
      [`${ROOT}/src/utils/args.ts`]: file([0, 100], [0, 10]),
    };
    expect(evaluateCoverage(summary, { mode: 'phase', phase: 'P4', root: ROOT }).ok).toBe(true);
    expect(evaluateCoverage(summary, { mode: 'phase', phase: 'P1', root: ROOT }).ok).toBe(false);
  });

  it('--release needs 95 % lines, statements and functions and 90 % branches', () => {
    expect(evaluateCoverage({ total: totalOf(95, 95, 95, 90) }, { mode: 'release' }).ok).toBe(true);
    const res = evaluateCoverage({ total: totalOf(95, 94, 96, 89) }, { mode: 'release' });
    expect(res.ok).toBe(false);
    expect(res.lines.filter((l) => l.startsWith('FAIL'))).toEqual([
      'FAIL global statements 94% (release 95%)',
      'FAIL global branches 89% (release 90%)',
    ]);
  });

  it('an empty measurement fails the floor and the release step (never 100 %)', () => {
    const unknown = { total: 0, covered: 0, skipped: 0, pct: 'Unknown' };
    const empty = {
      total: { lines: unknown, statements: unknown, functions: unknown, branches: unknown },
    };
    for (const mode of ['floor', 'release'] as const) {
      const res = evaluateCoverage(empty, { mode });
      expect(res.ok).toBe(false);
      expect(res.lines).toEqual(['FAIL coverage measured no src file (total lines 0)']);
    }
    expect(evaluateCoverage({}, { mode: 'floor' }).ok).toBe(false);
  });

  it('a phase file missing from the report fails instead of skipping the threshold step', () => {
    const elsewhere = {
      total: totalOf(96, 96, 96, 91),
      '/other-worktree/src/resources/etl.ts': file([100, 100], [10, 10]),
    };
    const none = evaluateCoverage(elsewhere, {
      mode: 'phase',
      phase: 'P7',
      root: ROOT,
      phaseFiles: ['src/resources/etl.ts'],
    });
    expect(none.ok).toBe(false);
    expect(none.lines).toEqual([
      'FAIL src/resources/etl.ts is missing from the coverage report',
      'FAIL phase P7 owns src files but none is in the coverage report',
    ]);
    const partly = evaluateCoverage(
      {
        total: totalOf(96, 96, 96, 91),
        [`${ROOT}/src/resources/etl.ts`]: file([100, 100], [10, 10]),
      },
      {
        mode: 'phase',
        phase: 'P7',
        root: ROOT,
        phaseFiles: ['src/resources/etl.ts', 'src/types/etl.ts'],
      }
    );
    expect(partly.ok).toBe(false);
    expect(partly.lines[0]).toBe('FAIL src/types/etl.ts is missing from the coverage report');
  });

  it('phaseOwnsSrc: P0, P9 and P10 own no measured src file', () => {
    const files = ['src/index.ts', 'src/client/index.ts', 'src/resources/etl.ts', 'scripts/x.mjs'];
    expect(phaseOwnsSrc('P0', files)).toBe(false);
    expect(phaseOwnsSrc('P9', files)).toBe(false);
    expect(phaseOwnsSrc('P10', files)).toBe(false);
    expect(phaseOwnsSrc('P1', files)).toBe(true);
    expect(phaseOwnsSrc('P7', files)).toBe(true);
    expect(phaseOwnsSrc('P1', ['src/index.ts'])).toBe(false);
  });
});

describe('unit-check.mjs driver', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function setup(summary?: unknown) {
    const dir = mkdtempSync(join(tmpdir(), 'unit-check-'));
    const summaryPath = join(dir, 'coverage-summary.json');
    if (summary !== undefined) writeFileSync(summaryPath, JSON.stringify(summary));
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    return { summaryPath, log };
  }

  it('--phase P0 runs the suite and skips the threshold step', () => {
    const { summaryPath, log } = setup(); // no summary at all: the step must not read it
    const runVitest = vi.fn(() => 0);
    const files = ['src/client/index.ts', 'scripts/quality.mjs'];
    expect(main(['--phase', 'P0'], { runVitest, summaryPath, files })).toBe(0);
    expect(runVitest).toHaveBeenCalledWith([]);
    expect(log.mock.calls.flat().join('\n')).toContain('owns no src file');
  });

  it('passes positional filters to vitest and skips the floor when filters are given', () => {
    const { summaryPath, log } = setup({ total: totalOf(1, 1, 1, 1) });
    const runVitest = vi.fn(() => 0);
    expect(main(['test/resources/notifications'], { runVitest, summaryPath })).toBe(0);
    expect(runVitest).toHaveBeenCalledWith(['test/resources/notifications']);
    expect(log.mock.calls.flat().join('\n')).toContain('global floor not applied');
  });

  it('applies the floor without filters, and returns the vitest status when the suite fails', () => {
    const below = setup({ total: totalOf(10, 10, 10, 10) });
    expect(main([], { runVitest: () => 0, summaryPath: below.summaryPath })).toBe(1);
    const above = setup({ total: totalOf(80, 80, 80, 90) });
    expect(main([], { runVitest: () => 0, summaryPath: above.summaryPath })).toBe(0);
    expect(main([], { runVitest: () => 1, summaryPath: above.summaryPath })).toBe(1);
    const missing = setup();
    expect(main([], { runVitest: () => 0, summaryPath: missing.summaryPath })).toBe(1);
  });

  it('--phase and --release fail on a coverage-ignore hint in a judged src file; the floor does not scan', () => {
    const root = mkdtempSync(join(tmpdir(), 'unit-check-hints-'));
    mkdirSync(join(root, 'src', 'resources'), { recursive: true });
    writeFileSync(
      join(root, 'src', 'resources', 'etl.ts'),
      'export function f(x: boolean): number {\n  /* v8 ignore start -- @preserve */\n  return x ? 1 : 2;\n}\n'
    );
    const summary = {
      total: totalOf(96, 96, 96, 91),
      [`${root}/src/resources/etl.ts`]: file([100, 100], [10, 10]),
    };
    const { summaryPath, log } = setup(summary);
    const deps = { runVitest: () => 0, summaryPath, root, files: ['src/resources/etl.ts'] };
    expect(main(['--phase', 'P7'], deps)).toBe(1);
    expect(log.mock.calls.flat()).toContain(
      'test:coverage: FAIL src/resources/etl.ts:2: coverage ignore hint: use an allowlist entry'
    );
    expect(main(['--release'], deps)).toBe(1);
    expect(
      main([], { ...deps, summaryPath: setup({ total: totalOf(80, 80, 80, 90) }).summaryPath })
    ).toBe(0);
  });

  it('--phase fails on a node:coverage disable/enable block (v8-to-istanbul drops its lines and branches)', () => {
    const root = mkdtempSync(join(tmpdir(), 'unit-check-hints-'));
    mkdirSync(join(root, 'src', 'resources'), { recursive: true });
    writeFileSync(
      join(root, 'src', 'resources', 'etl.ts'),
      [
        'export function f(x: boolean): number {',
        '  /* node:coverage disable -- @preserve */',
        '  if (x) return 1;',
        '  /* node:coverage enable -- @preserve */',
        '  return 2;',
        '}',
        '',
      ].join('\n')
    );
    const summary = {
      total: totalOf(96, 96, 96, 91),
      [`${root}/src/resources/etl.ts`]: file([100, 100], [10, 10]),
    };
    const { summaryPath, log } = setup(summary);
    const deps = { runVitest: () => 0, summaryPath, root, files: ['src/resources/etl.ts'] };
    expect(main(['--phase', 'P7'], deps)).toBe(1);
    expect(log.mock.calls.flat()).toEqual(
      expect.arrayContaining([
        'test:coverage: FAIL src/resources/etl.ts:2: coverage ignore hint: use an allowlist entry',
        'test:coverage: FAIL src/resources/etl.ts:4: coverage ignore hint: use an allowlist entry',
      ])
    );
  });

  it('main: --phase of a phase whose files are not in the summary exits 1 and lists them', () => {
    const { summaryPath, log } = setup({
      total: totalOf(96, 96, 96, 91),
      '/other-worktree/src/resources/etl.ts': file([100, 100], [10, 10]),
    });
    const deps = { runVitest: () => 0, summaryPath, root: ROOT, files: ['src/resources/etl.ts'] };
    expect(main(['--phase', 'P7'], deps)).toBe(1);
    expect(log.mock.calls.flat()).toContain(
      'test:coverage: FAIL src/resources/etl.ts is missing from the coverage report'
    );
  });

  it('applies the phase and release thresholds, and rejects bad arguments', () => {
    const summary = {
      total: totalOf(96, 96, 96, 91),
      [`${ROOT}/src/resources/etl.ts`]: file([70, 100], [9, 10]),
    };
    const { summaryPath } = setup(summary);
    const deps = { runVitest: () => 0, summaryPath, root: ROOT, files: ['src/resources/etl.ts'] };
    expect(main(['--phase', 'P7'], deps)).toBe(1);
    expect(main(['--release'], deps)).toBe(0);
    expect(main(['--phase', 'P7', '--release'], deps)).toBe(2);
    expect(main(['--phase', 'Q1'], deps)).toBe(2);
  });
});
