import { describe, it, expect, vi, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  baselineText,
  buildEntries,
  evaluate,
  normalizeMessage,
  replaceToolEntries,
} from '../../../scripts/lib/baseline.mjs';
import { main } from '../../../scripts/quality.mjs';

type Finding = {
  tool: 'typecheck' | 'lint' | 'format' | 'docs' | 'links';
  file: string;
  line?: number;
  column?: number;
  code?: string;
  message: string;
};

const P8_FILE = 'test/websocket/events.test.ts';
const P1_FILE = 'src/client/index.ts';
const P0_FILE = 'scripts/quality.mjs';

const tsError = (
  file: string,
  line: number,
  message = "Object is possibly 'undefined'."
): Finding => ({
  tool: 'typecheck',
  file,
  line,
  column: 3,
  code: 'TS2532',
  message,
});

const baselineOf = (...entries: Array<Record<string, unknown>>) =>
  ({ version: 1 as const, entries }) as Parameters<typeof evaluate>[1];

describe('quality baseline matching (P0 §5.5.5)', () => {
  it('matching ignores line numbers and line/column references in the message', () => {
    const baseline = baselineOf({
      tool: 'typecheck',
      file: P8_FILE,
      code: 'TS2532',
      message: "Object is possibly 'undefined'.",
      count: 2,
      phase: 'P8',
    });
    const findings = [tsError(P8_FILE, 10), tsError(P8_FILE, 250)];
    const result = evaluate(findings, baseline, { tool: 'typecheck' });
    expect(result.failures).toEqual([]);
    expect(result.tolerated).toHaveLength(2);
    expect(normalizeMessage('Type X (12,5) is wrong at a.ts:3:4\nsecond line')).toBe(
      'Type X is wrong at a.ts'
    );
  });

  it('occurrences above count fail', () => {
    const baseline = baselineOf({
      tool: 'typecheck',
      file: P8_FILE,
      code: 'TS2532',
      message: "Object is possibly 'undefined'.",
      count: 2,
      phase: 'P8',
    });
    const findings = [tsError(P8_FILE, 1), tsError(P8_FILE, 2), tsError(P8_FILE, 3)];
    const result = evaluate(findings, baseline, { tool: 'typecheck' });
    expect(result.tolerated).toHaveLength(2);
    expect(result.failures).toEqual([tsError(P8_FILE, 3)]);
  });

  it('a different code, message, file or tool is not matched', () => {
    const baseline = baselineOf({
      tool: 'typecheck',
      file: P8_FILE,
      code: 'TS2532',
      message: "Object is possibly 'undefined'.",
      count: 5,
      phase: 'P8',
    });
    const findings: Finding[] = [
      { ...tsError(P8_FILE, 1), code: 'TS2345' },
      tsError(P8_FILE, 2, 'Another message.'),
      tsError('test/websocket/types.test.ts', 3),
      { ...tsError(P8_FILE, 4), tool: 'lint' },
    ];
    const typecheck = evaluate(findings.slice(0, 3), baseline, { tool: 'typecheck' });
    expect(typecheck.failures).toHaveLength(3);
    const lint = evaluate(findings.slice(3), baseline, { tool: 'lint' });
    expect(lint.failures).toHaveLength(1);
  });

  it('--phase Pn rejects entries owned by Pn and keeps tolerating the others', () => {
    const baseline = baselineOf(
      {
        tool: 'format',
        file: P8_FILE,
        code: 'prettier',
        message: 'not formatted',
        count: 1,
        phase: 'P8',
      },
      {
        tool: 'format',
        file: P1_FILE,
        code: 'prettier',
        message: 'not formatted',
        count: 1,
        phase: 'P1',
      }
    );
    const findings: Finding[] = [
      { tool: 'format', file: P8_FILE, code: 'prettier', message: 'not formatted' },
      { tool: 'format', file: P1_FILE, code: 'prettier', message: 'not formatted' },
    ];
    const asP8 = evaluate(findings, baseline, { tool: 'format', phase: 'P8' });
    expect(asP8.failures.map((f) => f.file)).toEqual([P8_FILE]);
    expect(asP8.tolerated.map((f) => f.file)).toEqual([P1_FILE]);
    const asP0 = evaluate(findings, baseline, { tool: 'format', phase: 'P0' });
    expect(asP0.failures).toEqual([]);
    expect(asP0.tolerated).toHaveLength(2);
  });

  it('--release tolerates no entry, unowned files included', () => {
    const baseline = baselineOf({
      tool: 'lint',
      file: P1_FILE,
      code: 'no-x',
      message: 'm',
      count: 1,
      phase: 'P1',
    });
    const findings: Finding[] = [
      { tool: 'lint', file: P1_FILE, line: 1, code: 'no-x', message: 'm' },
      { tool: 'lint', file: 'LICENSE', line: 1, code: 'no-x', message: 'm' },
    ];
    const plain = evaluate(findings, baseline, { tool: 'lint' });
    expect(plain.failures).toEqual([]);
    expect(plain.unowned).toHaveLength(1);
    expect(plain.warnings.some((w) => w.includes('unowned file'))).toBe(true);
    const release = evaluate(findings, baseline, { tool: 'lint', release: true });
    expect(release.failures).toHaveLength(2);
    expect(release.tolerated).toEqual([]);
  });

  it('a finding on a P0 file is never tolerated by a missing entry, and new findings fail', () => {
    const findings: Finding[] = [
      { tool: 'lint', file: P0_FILE, line: 3, code: 'no-unused-vars', message: "'x' is unused" },
      { tool: 'lint', file: P1_FILE, line: 3, code: 'no-unused-vars', message: "'x' is unused" },
    ];
    const result = evaluate(findings, baselineOf(), { tool: 'lint' });
    expect(result.failures).toHaveLength(2);
  });

  it('stale entries, too-high counts and a wrong phase print warnings', () => {
    const baseline = baselineOf(
      {
        tool: 'lint',
        file: P1_FILE,
        code: 'gone',
        message: 'fixed long ago',
        count: 1,
        phase: 'P1',
      },
      { tool: 'lint', file: P8_FILE, code: 'a', message: 'b', count: 3, phase: 'P8' },
      { tool: 'lint', file: 'src/utils/geojson.ts', code: 'c', message: 'd', count: 1, phase: 'P1' }
    );
    const findings: Finding[] = [
      { tool: 'lint', file: P8_FILE, code: 'a', message: 'b' },
      { tool: 'lint', file: 'src/utils/geojson.ts', code: 'c', message: 'd' },
    ];
    const result = evaluate(findings, baseline, { tool: 'lint' });
    expect(result.failures).toEqual([]);
    expect(result.warnings).toEqual([
      `stale baseline entry (nothing matches it): lint ${P1_FILE} gone fixed long ago`,
      `baseline entry allows 3, found 1 (lower the count): lint ${P8_FILE} a b`,
      'baseline entry phase P1 differs from the owner P4: lint src/utils/geojson.ts c d',
    ]);
    // When only some files were checked, entries of other files are not reported stale.
    const scoped = evaluate(findings, baseline, { tool: 'lint', files: [P8_FILE] });
    expect(scoped.warnings).toEqual([
      `baseline entry allows 3, found 1 (lower the count): lint ${P8_FILE} a b`,
    ]);
  });
});

describe('quality baseline writing (P0 §5.5.5)', () => {
  it('groups findings per file, code and message with counts and owners', () => {
    const { entries, refused } = buildEntries('typecheck', [
      tsError(P8_FILE, 1),
      tsError(P8_FILE, 9),
      tsError(P1_FILE, 4, 'Other (1,2) message.\nmore'),
    ]);
    expect(refused).toEqual([]);
    expect(entries).toEqual([
      {
        tool: 'typecheck',
        file: P1_FILE,
        code: 'TS2532',
        message: 'Other message.',
        count: 1,
        phase: 'P1',
      },
      {
        tool: 'typecheck',
        file: P8_FILE,
        code: 'TS2532',
        message: "Object is possibly 'undefined'.",
        count: 2,
        phase: 'P8',
      },
    ]);
  });

  it('refuses entries for P0-owned files', () => {
    const { entries, refused } = buildEntries('lint', [
      { tool: 'lint', file: P0_FILE, line: 1, code: 'r', message: 'm' },
      { tool: 'lint', file: 'test/contract/spec.ts', line: 2, code: 'r', message: 'm' },
      { tool: 'lint', file: P1_FILE, line: 3, code: 'r', message: 'm' },
    ]);
    expect(refused.map((f) => f.file)).toEqual([P0_FILE, 'test/contract/spec.ts']);
    expect(entries.map((e) => e.file)).toEqual([P1_FILE]);
  });

  it('replacing one tool keeps the other tools and the text is stable', () => {
    const before = baselineOf(
      { tool: 'lint', file: P1_FILE, code: 'r', message: 'm', count: 1, phase: 'P1' },
      {
        tool: 'format',
        file: P8_FILE,
        code: 'prettier',
        message: 'not formatted',
        count: 1,
        phase: 'P8',
      }
    );
    const next = replaceToolEntries(before, 'format', []);
    expect(next.entries).toEqual([before.entries[0]]);
    const text = baselineText(next);
    expect(text.endsWith('}\n')).toBe(true);
    expect(JSON.parse(text)).toEqual({ version: 1, entries: [before.entries[0]] });
  });
});

describe('quality.mjs CLI against a scratch repository', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function scratchRepo() {
    const dir = mkdtempSync(join(tmpdir(), 'quality-cli-'));
    execFileSync('git', ['init', '-q'], { cwd: dir });
    writeFileSync(join(dir, '.prettierrc'), '{ "singleQuote": true }\n');
    writeFileSync(join(dir, '.prettierignore'), '**/*.md\n');
    mkdirSync(join(dir, 'src', 'websocket'), { recursive: true });
    mkdirSync(join(dir, 'scripts'), { recursive: true });
    writeFileSync(join(dir, 'src', 'websocket', 'x.ts'), 'export const a = {b:1}\n');
    writeFileSync(join(dir, 'README.md'), '#   not   checked\n');
    return dir;
  }

  it('writes a baseline, tolerates it, and enforces --phase and --release', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const dir = scratchRepo();
    const baselinePath = join(dir, 'baseline.json');
    const env = { cwd: dir, baselinePath };

    expect(await main(['format'], env)).toBe(1);
    expect(await main(['format', '--write-baseline'], env)).toBe(0);
    const written = JSON.parse(readFileSync(baselinePath, 'utf8'));
    expect(written.entries).toEqual([
      {
        tool: 'format',
        file: 'src/websocket/x.ts',
        code: 'prettier',
        message: 'not formatted',
        count: 1,
        phase: 'P8',
      },
    ]);
    expect(await main(['format'], env)).toBe(0);
    expect(await main(['format', '--phase', 'P0'], env)).toBe(0);
    expect(await main(['format', '--phase', 'P8'], env)).toBe(1);
    expect(await main(['format', '--release'], env)).toBe(1);
    expect(await main(['format', '--phase', 'P11'], env)).toBe(2);
    expect(await main(['nope'], env)).toBe(2);

    // A P0-owned file with a finding cannot be baselined.
    writeFileSync(join(dir, 'scripts', 'y.mjs'), 'export const y = {z:1}\n');
    err.mockClear();
    expect(await main(['format', '--write-baseline'], env)).toBe(1);
    expect(err.mock.calls.flat().join('\n')).toContain('scripts/y.mjs');
    expect(JSON.parse(readFileSync(baselinePath, 'utf8'))).toEqual(written);

    // --write --phase P0 formats only the P0 file.
    expect(await main(['format', '--write', '--phase', 'P0'], env)).toBe(0);
    expect(readFileSync(join(dir, 'scripts', 'y.mjs'), 'utf8')).toBe(
      'export const y = { z: 1 };\n'
    );
    expect(readFileSync(join(dir, 'src', 'websocket', 'x.ts'), 'utf8')).toBe(
      'export const a = {b:1}\n'
    );
  });
});
