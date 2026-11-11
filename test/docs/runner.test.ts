// Unit tests of the catalogue runner (examples/run-all.mjs, P9 §6.4, §8). classify, writePassCommands and
// afterPassVerdict are pure. The CLI cases build a scratch repository (dist, the examples link, a catalogue,
// numbered twins, a README with the index block) with temporary state, lock and ledger folders, and run main()
// with fake children (`node --input-type=module -e <file>`), a fake sweeper and a fake snapshot. Nothing reads
// .env, sends a request or touches the main checkout's .state.
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  afterPassVerdict,
  classify,
  main,
  renderIndex,
  writePassCommands,
  type Budget,
  type Catalogue,
  type CatalogueEntry,
} from '../../examples/run-all.mjs';
import { recordLedger } from '../integration/harness/ledger.mjs';
import { acquireReadSlot, newLockToken } from '../integration/harness/lock.mjs';

const RUN = 'd9d9d9d9';
const RUN_ALL = join(__dirname, '..', '..', 'examples', 'run-all.mjs');
const LOCK_URL = pathToFileURL(join(__dirname, '../integration/harness/lock.mjs')).href;
const zero = (): Budget => ({ positions: 0, notifications: 0, bleActions: 0, etlWrites: 0 });

const readEntry: CatalogueEntry = {
  id: '01',
  name: 'getting-started',
  title: 'Getting started',
  summary: 's',
  owner: 'P9',
  guide: 'docs/guides/getting-started.md',
  readAllowedSkips: [],
  write: null,
};
const writeEntry = (positions = 2, notifications = 1): CatalogueEntry => ({
  ...readEntry,
  id: '24',
  name: 'bulk-declared-location',
  write: {
    tier: 'S',
    budget: { positions, notifications, bleActions: 0, etlWrites: 0 },
    creates: 'x',
  },
});
const ok = { exitCode: 0, timedOut: false };

describe('classify', () => {
  it('exit 0 + DONE <id>-<name> → pass; no DONE → fail; DONE for another id → fail', () => {
    expect(classify({ ...ok, stdout: 'x\nDONE 01-getting-started\n' }, readEntry, 'read')).toEqual({
      status: 'pass',
    });
    expect(classify({ ...ok, stdout: 'x\n' }, readEntry, 'read')).toEqual({
      status: 'fail',
      reason: 'no DONE or SKIPPED marker',
    });
    expect(classify({ ...ok, stdout: 'DONE 05-error-handling\n' }, readEntry, 'read')).toEqual({
      status: 'fail',
      reason: 'foreign DONE marker',
    });
  });

  it('a read-pass skip passes only with an allowed category; any category in the write pass', () => {
    const r = { ...ok, stdout: 'SKIPPED: feature-off notifications are off\n' };
    expect(classify(r, readEntry, 'read')).toEqual({
      status: 'fail',
      reason: 'skip category feature-off not allowed in the read pass',
    });
    expect(classify(r, { ...readEntry, readAllowedSkips: ['feature-off'] }, 'read')).toEqual({
      status: 'skip',
      reason: 'feature-off notifications are off',
    });
    expect(
      classify({ ...ok, stdout: 'SKIPPED: tier needs S\n' }, writeEntry(), 'write')
    ).toMatchObject({
      status: 'skip',
      reason: 'tier needs S',
    });
  });

  it('exit 1 → fail; timeout → fail', () => {
    expect(
      classify(
        { exitCode: 1, timedOut: false, stdout: 'DONE 01-getting-started\n' },
        readEntry,
        'read'
      )
    ).toEqual({ status: 'fail', reason: 'exit 1' });
    expect(classify({ exitCode: null, timedOut: true, stdout: '' }, readEntry, 'read')).toEqual({
      status: 'fail',
      reason: 'timeout',
    });
  });

  it('write pass: BUDGET over the declared budget fails; equal passes with budgetUsed; BUDGET lines are summed', () => {
    const done = 'DONE 24-bulk-declared-location';
    expect(
      classify(
        {
          ...ok,
          stdout: `BUDGET positions=3 notifications=0 ble=0 etl=0\n${done}\n`,
          guardCounts: { ...zero(), positions: 3 },
        },
        writeEntry(),
        'write'
      )
    ).toEqual({ status: 'fail', reason: 'BUDGET over the header budget' });
    expect(
      classify(
        {
          ...ok,
          stdout: `BUDGET positions=1 notifications=0 ble=0 etl=0\nBUDGET positions=1 notifications=1 ble=0 etl=0\n${done}\n`,
          guardCounts: { ...zero(), positions: 2, notifications: 1 },
        },
        writeEntry(),
        'write'
      )
    ).toEqual({
      status: 'pass',
      budgetUsed: { positions: 2, notifications: 1, bleActions: 0, etlWrites: 0 },
    });
  });

  it('read pass: a non-zero BUDGET line or a non-zero guard count fails', () => {
    expect(
      classify(
        {
          ...ok,
          stdout: 'BUDGET positions=1 notifications=0 ble=0 etl=0\nDONE 01-getting-started\n',
        },
        readEntry,
        'read'
      )
    ).toEqual({ status: 'fail', reason: 'BUDGET line in a read-only run' });
    expect(
      classify(
        { ...ok, stdout: 'DONE 01-getting-started\n', guardCounts: { ...zero(), positions: 1 } },
        readEntry,
        'read'
      )
    ).toEqual({ status: 'fail', reason: 'guard counted units in a read-only run' });
  });

  it('write pass: guard counts differing from the BUDGET lines fail', () => {
    expect(
      classify(
        {
          ...ok,
          stdout:
            'BUDGET positions=0 notifications=1 ble=0 etl=0\nDONE 24-bulk-declared-location\n',
          guardCounts: { ...zero(), notifications: 2 },
        },
        writeEntry(0, 2),
        'write'
      )
    ).toEqual({ status: 'fail', reason: 'guard counts differ from the BUDGET lines' });
  });

  it('a guard violation or a budget refusal recorded while the entry ran fails it (H-P0-I12)', () => {
    const r = { ...ok, stdout: 'DONE 01-getting-started\n' };
    expect(classify({ ...r, violations: 1 }, readEntry, 'read')).toEqual({
      status: 'fail',
      reason: 'guard violation (1) while the example ran',
    });
    expect(classify({ ...r, budgetRefusals: 1 }, readEntry, 'read').status).toBe('fail');
  });
});

describe('writePassCommands and afterPassVerdict', () => {
  it('builds the P0 commands of the write pass', () => {
    const c = writePassCommands('r1');
    expect(c.snapshotBefore).toEqual([
      'npm',
      'run',
      'test:integration:snapshot',
      '--',
      '--label',
      'examples-r1-before',
    ]);
    expect(c.sweep.slice(-4)).toEqual(['--check', '--run', 'r1', '--force']);
    expect(c.sweep.slice(0, 3)).toEqual(['npm', 'run', 'test:integration:sweep']);
    expect(c.snapshotAfter).toEqual([
      'npm',
      'run',
      'test:integration:snapshot',
      '--',
      '--label',
      'examples-r1-after',
      '--compare',
      'examples-r1-before',
    ]);
  });

  it('residue, state difference and a ledger mismatch each fail the pass; all clean → ok', () => {
    const guardSum = { ...zero(), positions: 1, notifications: 1 };
    const clean = { sweepExit: 0, compareExit: 0, ledgerCounts: { ...guardSum }, guardSum };
    expect(afterPassVerdict(clean)).toEqual({ ok: true, problems: [] });
    expect(afterPassVerdict({ ...clean, sweepExit: 1 })).toEqual({
      ok: false,
      problems: ['residue'],
    });
    expect(afterPassVerdict({ ...clean, compareExit: 1 })).toEqual({
      ok: false,
      problems: ['state difference'],
    });
    expect(afterPassVerdict({ ...clean, ledgerCounts: null }).problems).toEqual([
      'ledger differs from guard counts',
    ]);
    expect(
      afterPassVerdict({ ...clean, ledgerCounts: { ...guardSum, positions: 2 } }).problems
    ).toEqual(['ledger differs from guard counts']);
  });
});

interface Child {
  marker?: string;
  exit?: number;
  lines?: string[];
  guard?: Partial<Budget>;
}

function childCode(header: string, name: string, b: Child): string {
  const counts = JSON.stringify({ ...zero(), ...(b.guard ?? {}) });
  return [
    header,
    "import { mkdirSync, writeFileSync } from 'node:fs';",
    "import { join } from 'node:path';",
    `const lock = await import(${JSON.stringify(LOCK_URL)});`,
    'const env = process.env;',
    'const token = env.RTLS_IT_INTERNAL_LOCK_TOKEN ?? null;',
    'const p = lock.lockPaths(env.TEST_LOCK_DIR);',
    'mkdirSync(env.TEST_TRACE_DIR, { recursive: true });',
    `writeFileSync(join(env.TEST_TRACE_DIR, ${JSON.stringify(`${name}.json`)}), JSON.stringify({ argv: process.argv.slice(1), token,`,
    '  runLock: lock.holdsLock(p.run, token), readSlot: lock.holdsReadSlot(token, { stateDir: env.TEST_LOCK_DIR }) }));',
    ...(b.guard
      ? [
          "const guardDir = join(env.TEST_STATE_ROOT, env.RTLS_IT_RUN_ID, 'guard');",
          'mkdirSync(guardDir, { recursive: true });',
          `writeFileSync(join(guardDir, process.pid + '.json'), JSON.stringify({ mode: 'example', counts: ${counts}, violations: 0 }));`,
        ]
      : []),
    ...(b.lines ?? []).map((l) => `console.log(${JSON.stringify(l)});`),
    `console.log(${JSON.stringify(b.marker ?? `DONE ${name.slice(0, -3)}`)});`,
    `process.exit(${b.exit ?? 0});`,
    '',
  ].join('\n');
}

const NONE =
  '// Write section: tier none; budget positions=0 notifications=0 ble=0 etl=0; read skips none';

class Repo {
  readonly dir = mkdtempSync(join(tmpdir(), 'rtls-run-all-'));
  readonly root = join(this.dir, 'repo');
  readonly stateRoot = join(this.dir, 'state');
  readonly lockDir = join(this.dir, 'main-state');
  readonly ledgerPath = join(this.dir, 'main-state', 'ledger.json');
  readonly traceDir = join(this.dir, 'trace');
  readonly catalogue: Catalogue = { examples: [] };
  sweepCalls: string[] = [];
  snapshotCalls: string[][] = [];
  sweepExit = 0;
  snapshotExit = 0;

  constructor() {
    mkdirSync(join(this.root, 'dist'), { recursive: true });
    writeFileSync(join(this.root, 'dist', 'index.js'), '');
    writeFileSync(join(this.root, 'dist', 'index.cjs'), '');
    for (const d of ['node_modules', 'typescript', 'javascript'])
      mkdirSync(join(this.root, 'examples', d), { recursive: true });
    symlinkSync(this.root, join(this.root, 'examples', 'node_modules', 'ubudu-rtls-sdk'));
  }

  add(e: CatalogueEntry, b: Child = {}): void {
    this.catalogue.examples.push(e);
    this.catalogue.examples.sort((a, c) => a.id.localeCompare(c.id));
    const w = e.write;
    const header = w
      ? `// Write section: tier ${w.tier}; budget positions=${w.budget.positions} notifications=${w.budget.notifications} ble=${w.budget.bleActions} etl=${w.budget.etlWrites}; read skips none`
      : NONE;
    const base = `${e.id}-${e.name}`;
    const writeTail = w ? '\nif (process.argv.includes("--write") && config.write) {}\n' : '';
    writeFileSync(
      join(this.root, 'examples', 'typescript', `${base}.ts`),
      childCode(header, `${base}-ts`, b) + writeTail
    );
    writeFileSync(
      join(this.root, 'examples', 'javascript', `${base}.js`),
      childCode(header, `${base}-js`, b) + writeTail
    );
    writeFileSync(
      join(this.root, 'examples', 'catalogue.json'),
      JSON.stringify(this.catalogue, null, 2)
    );
    writeFileSync(
      join(this.root, 'examples', 'README.md'),
      `# Examples\n\n<!-- catalogue:start -->\n${renderIndex(this.catalogue)}<!-- catalogue:end -->\n`
    );
  }

  trace(name: string): Record<string, unknown> | null {
    const f = join(this.traceDir, `${name}.json`);
    return existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : null;
  }

  async run(
    argv: string[],
    env: NodeJS.ProcessEnv = {},
    lockWait = { wait: false } as { wait: boolean; pollMs?: number; maxWaitMs?: number }
  ) {
    const lines: string[] = [];
    const code = await main(argv, {
      root: this.root,
      env: {
        PATH: process.env.PATH,
        RTLS_IT_RUN_ID: RUN,
        TEST_LOCK_DIR: this.lockDir,
        TEST_STATE_ROOT: this.stateRoot,
        TEST_TRACE_DIR: this.traceDir,
        ...env,
      },
      stateRoot: this.stateRoot,
      lockStateDir: this.lockDir,
      ledgerPath: this.ledgerPath,
      lockWait,
      graceMs: 200,
      childCommand: (_lang, file, args) => ({
        command: process.execPath,
        args: ['--input-type=module', '-e', readFileSync(file, 'utf8'), '--', ...args],
      }),
      sweepCheck: async (runId) => {
        this.sweepCalls.push(runId);
        return this.sweepExit;
      },
      snapshot: async (argv2) => {
        this.snapshotCalls.push(argv2);
        return this.snapshotExit;
      },
      log: (l) => lines.push(l),
      error: (l) => lines.push(l),
    });
    const outcomes = lines
      .map((l) => /^(\d{2}) (ts|js) (read|write) (pass|skip|fail) \d+ms ?(.*)$/.exec(l))
      .filter((m): m is RegExpExecArray => m !== null)
      .map((m) => ({ id: m[1], lang: m[2], pass: m[3], status: m[4], reason: m[5] }));
    return { code, lines, outcomes };
  }
}

const W = { RTLS_IT_WRITES: '1', RTLS_IT_SIDE_EFFECTS: '1' };

describe('run-all CLI', () => {
  it('--write --lang js, --write --lang both and --write without RTLS_IT_WRITES=1 exit 2 in a child process before any entry', () => {
    const env = {
      PATH: process.env.PATH,
      RTLS_API_KEY: '',
      APP_NAMESPACE: '',
      RTLS_IT_RUN_ID: RUN,
    };
    for (const argv of [['--write', '--lang', 'js'], ['--write', '--lang', 'both'], ['--write']]) {
      const r = spawnSync(process.execPath, [RUN_ALL, ...argv], { env, encoding: 'utf8' });
      expect(r.status).toBe(2);
      expect(r.stdout).not.toMatch(/^\d{2} (ts|js) /m);
    }
  }, 30_000);

  it('read pass: both languages, one read slot with a fresh token passed to every child, released at the end', async () => {
    const r = new Repo();
    r.add(readEntry);
    r.add({ ...readEntry, id: '05', name: 'error-handling' });
    const res = await r.run([]);
    expect(res.code).toBe(0);
    expect(res.outcomes.map((o) => `${o.id} ${o.lang} ${o.status}`)).toEqual([
      '01 ts pass',
      '01 js pass',
      '05 ts pass',
      '05 js pass',
    ]);
    const t1 = r.trace('01-getting-started-ts');
    const t2 = r.trace('05-error-handling-js');
    expect(t1).toMatchObject({ readSlot: true, runLock: false });
    expect(typeof t1?.token).toBe('string');
    expect(t2?.token).toBe(t1?.token);
    expect(existsSync(join(r.lockDir, 'locks', 'read-1.lock'))).toBe(false);
    expect(existsSync(join(r.stateRoot, RUN, 'examples', '01-ts.log'))).toBe(true);
  }, 30_000);

  it('read pass with both read slots held by live pids → wait, then exit 2 before any entry', async () => {
    const r = new Repo();
    r.add(readEntry);
    for (let i = 0; i < 2; i += 1)
      await acquireReadSlot({ stateDir: r.lockDir, token: newLockToken(), wait: false });
    const res = await r.run([], {}, { wait: true, pollMs: 20, maxWaitMs: 60 });
    expect(res.code).toBe(2);
    expect(res.lines.some((l) => l.endsWith('no-read-slot'))).toBe(true);
    expect(r.trace('01-getting-started-ts')).toBeNull();
  });

  it('a read pass with an unreachable base URL takes no read slot', async () => {
    const r = new Repo();
    r.add(readEntry);
    for (let i = 0; i < 2; i += 1)
      await acquireReadSlot({ stateDir: r.lockDir, token: newLockToken(), wait: false });
    const res = await r.run(['--lang', 'ts'], { RTLS_BASE_URL: 'http://192.0.2.1/api' });
    expect(res.code).toBe(0);
    expect(r.trace('01-getting-started-ts')).toMatchObject({ token: null, readSlot: false });
  });

  it('--only selects by number; --list prints the catalogue; --check-index and --write-index keep the README in sync', async () => {
    const r = new Repo();
    r.add(readEntry);
    r.add({ ...readEntry, id: '05', name: 'error-handling' });
    const only = await r.run(['--only', '05', '--lang', 'ts']);
    expect(only.outcomes.map((o) => o.id)).toEqual(['05']);
    const list = await r.run(['--list']);
    expect(list.lines).toEqual([
      '01 getting-started P9 read-only Getting started',
      '05 error-handling P9 read-only Getting started',
    ]);
    expect((await r.run(['--check-index'])).code).toBe(0);
    writeFileSync(
      join(r.root, 'examples', 'README.md'),
      '# Examples\n\n<!-- catalogue:start -->\nold\n<!-- catalogue:end -->\n'
    );
    expect((await r.run(['--check-index'])).code).toBe(1);
    expect((await r.run(['--write-index'])).code).toBe(0);
    expect((await r.run(['--check-index'])).code).toBe(0);
    expect((await r.run(['--only', '99'])).code).toBe(2);
  }, 30_000);

  it('a parity problem fails before any entry runs', async () => {
    const r = new Repo();
    r.add(readEntry);
    writeFileSync(join(r.root, 'examples', 'javascript', '99-x.js'), NONE);
    const res = await r.run([]);
    expect(res.code).toBe(1);
    expect(res.lines).toContain('examples:all: parity: javascript/99-x.js is not in the catalogue');
    expect(r.trace('01-getting-started-ts')).toBeNull();
  });

  it('write pass: run lock with the token, snapshot before and after, sweeper, ledger equal to the guard counts → exit 0', async () => {
    const r = new Repo();
    r.add(readEntry);
    r.add(writeEntry(1, 0), {
      lines: ['BUDGET positions=1 notifications=0 ble=0 etl=0'],
      guard: { positions: 1 },
    });
    recordLedger(
      RUN,
      'examples',
      { R: true, W: true, C: false, S: true },
      { positions: 1 },
      { ledgerPath: r.ledgerPath }
    );
    const res = await r.run(['--write'], W);
    expect(res.outcomes.map((o) => `${o.id} ${o.lang} ${o.pass} ${o.status}`)).toEqual([
      '24 ts write pass',
    ]);
    expect(res.code).toBe(0);
    expect(r.trace('24-bulk-declared-location-ts')).toMatchObject({
      runLock: true,
      argv: ['--write'],
    });
    expect(r.snapshotCalls).toEqual([
      writePassCommands(RUN).snapshotBefore,
      writePassCommands(RUN).snapshotAfter,
    ]);
    expect(r.sweepCalls).toEqual([RUN]);
    expect(existsSync(join(r.lockDir, 'locks', 'run.lock'))).toBe(false);
    expect(existsSync(join(r.lockDir, 'runs', `${RUN}.json`))).toBe(false);
  }, 30_000);

  it('write pass: residue, a ledger mismatch, a tier-S entry without RTLS_IT_SIDE_EFFECTS, a failed snapshot and budgets over the share', async () => {
    const r = new Repo();
    r.add(writeEntry(1, 0), {
      lines: ['BUDGET positions=1 notifications=0 ble=0 etl=0'],
      guard: { positions: 1 },
    });
    r.sweepExit = 1;
    const residue = await r.run(['--write'], W);
    expect(residue.code).toBe(1);
    expect(
      residue.lines.some((l) =>
        l.includes('write pass failed: residue, ledger differs from guard counts')
      )
    ).toBe(true);

    r.sweepExit = 0;
    const noS = await r.run(['--write'], { RTLS_IT_WRITES: '1' });
    expect(noS.outcomes.map((o) => [o.status, o.reason])).toEqual([
      ['skip', 'tier S needs RTLS_IT_SIDE_EFFECTS=1'],
    ]);

    r.snapshotExit = 1;
    const snap = await r.run(['--write'], W);
    expect(snap.code).toBe(2);
    expect(snap.outcomes).toEqual([]);

    r.snapshotExit = 0;
    const big = new Repo();
    big.add(writeEntry(5, 0));
    const over = await big.run(['--write'], W);
    expect(over.code).toBe(2);
    expect(over.lines.some((l) => l.endsWith('budget-share'))).toBe(true);
    expect(big.snapshotCalls).toEqual([]);
  }, 30_000);
});
