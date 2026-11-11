// Unit tests of the `examples:check` runner (scripts/examples/run.mjs, P0 §10.2, §8.2). Each case builds a scratch
// repository (dist, the examples link, numbered twins) and temporary state, lock and ledger folders. The example
// children are real processes: `node --input-type=module -e <example file> -- <args>` stands in for the guarded
// `npx tsx` / `node --import preload.mjs` commands. A child records what it saw (argv, token, locks) in a trace
// file and may write a `guard/<pid>.json` record and its ledger entry as the example-mode preload does. Nothing
// reads `.env` or sends a request.
import { execFileSync } from 'node:child_process';
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  classify,
  defaultChildCommand,
  defaultSweepCheck,
  main,
  parseHeader,
  PRELOAD_PATH,
  zeroBudget,
} from '../../../scripts/examples/run.mjs';
import { ledgerEntry, recordLedger } from '../../integration/harness/ledger.mjs';
import { acquireReadSlot, acquireRunLock, newLockToken } from '../../integration/harness/lock.mjs';

const RUN = 'e0e0e0e0';
const LOCK_URL = pathToFileURL(join(__dirname, '../../integration/harness/lock.mjs')).href;
const LEDGER_URL = pathToFileURL(join(__dirname, '../../integration/harness/ledger.mjs')).href;

const header = (tier: string, budget = 'positions=0 notifications=0 ble=0 etl=0', skips = 'none') =>
  `// Write section: tier ${tier}; budget ${budget}; read skips ${skips}`;

type Counts = {
  positions?: number;
  notifications?: number;
  bleActions?: number;
  etlWrites?: number;
};
interface Behaviour {
  header?: string | null;
  argsLine?: string;
  lines?: string[];
  marker?: 'done' | 'none' | string;
  exit?: number;
  sleepMs?: number;
  guard?: Counts;
  ledger?: Counts;
  /** `violations` of the guard/<pid>.json record (written only with `guard`) */
  guardViolations?: number;
  /** lines appended to `.state/<runId>/violations.jsonl`, as the guard does before it throws */
  violationLines?: { rule: string; expected?: boolean }[];
  /** a `budget.json` with one `exceeded` entry, as the budget refusal of the guard writes it */
  refusal?: boolean;
}

function exampleCode(name: string, b: Behaviour): string {
  const counts = (c: Counts) =>
    JSON.stringify({ positions: 0, notifications: 0, bleActions: 0, etlWrites: 0, ...c });
  return [
    ...(b.header === null ? ['// no header'] : [b.header ?? header('W')]),
    ...(b.argsLine ? [b.argsLine] : []),
    "import { appendFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';",
    "import { join } from 'node:path';",
    `const lock = await import(${JSON.stringify(LOCK_URL)});`,
    `const ledger = await import(${JSON.stringify(LEDGER_URL)});`,
    'const env = process.env;',
    'const token = env.RTLS_IT_INTERNAL_LOCK_TOKEN ?? null;',
    'const p = lock.lockPaths(env.TEST_LOCK_DIR);',
    'const trace = { argv: process.argv.slice(1), token, runId: env.RTLS_IT_RUN_ID,',
    '  runLock: lock.holdsLock(p.run, token), configLock: lock.holdsLock(p.config, token),',
    '  readSlot: lock.holdsReadSlot(token, { stateDir: env.TEST_LOCK_DIR }),',
    "  registered: existsSync(join(env.TEST_LOCK_DIR, 'runs', `${env.RTLS_IT_RUN_ID}.json`)),",
    "  preflightFile: existsSync(join(env.TEST_STATE_ROOT, env.RTLS_IT_RUN_ID, 'preflight.json')) };",
    'mkdirSync(env.TEST_TRACE_DIR, { recursive: true });',
    `writeFileSync(join(env.TEST_TRACE_DIR, ${JSON.stringify(`${name}.json`)}), JSON.stringify(trace));`,
    ...(b.guard
      ? [
          "const guardDir = join(env.TEST_STATE_ROOT, env.RTLS_IT_RUN_ID, 'guard');",
          'mkdirSync(guardDir, { recursive: true });',
          `writeFileSync(join(guardDir, process.pid + '.json'), JSON.stringify({ mode: 'example', counts: ${counts(b.guard)}, violations: ${b.guardViolations ?? 0} }));`,
        ]
      : []),
    ...(b.violationLines || b.refusal
      ? [
          'const runDir = join(env.TEST_STATE_ROOT, env.RTLS_IT_RUN_ID);',
          'mkdirSync(runDir, { recursive: true });',
        ]
      : []),
    ...(b.violationLines ?? []).map(
      (v) =>
        `appendFileSync(join(runDir, 'violations.jsonl'), ${JSON.stringify(`${JSON.stringify({ method: 'GET', template: '/x', ...v })}
`)});`
    ),
    ...(b.refusal
      ? [
          `writeFileSync(join(runDir, 'budget.json'), JSON.stringify({ version: 1, counts: ${counts({})}, byDomain: {}, exceeded: [{ budget: 'positions', limit: 'run', domain: null }] }));`,
        ]
      : []),
    // As the example-mode preload does at the exit of a --write process: confirm the run's ledger entry.
    "if (process.argv.includes('--write'))",
    `  ledger.recordLedger(env.RTLS_IT_RUN_ID, 'examples', { R: true, W: true, C: false, S: true }, ${counts(b.ledger ?? b.guard ?? {})}, { ledgerPath: env.TEST_LEDGER });`,
    ...(b.lines ?? []).map((l) => `console.log(${JSON.stringify(l)});`),
    ...(b.sleepMs ? [`await new Promise((r) => setTimeout(r, ${b.sleepMs}));`] : []),
    ...(b.marker === 'none'
      ? []
      : [
          `console.log(${JSON.stringify(b.marker === undefined || b.marker === 'done' ? `DONE ${name.slice(0, -3)}` : b.marker)});`,
        ]),
    `process.exit(${b.exit ?? 0});`,
    '',
  ].join('\n');
}

class Repo {
  readonly dir = mkdtempSync(join(tmpdir(), 'rtls-examples-runner-'));
  readonly root = join(this.dir, 'repo');
  readonly stateRoot = join(this.dir, 'state');
  readonly lockDir = join(this.dir, 'main-state');
  readonly ledgerPath = join(this.dir, 'main-state', 'ledger.json');
  readonly traceDir = join(this.dir, 'trace');
  sweepCalls: { runId: string; token: string | undefined }[] = [];
  sweepExit = 0;

  constructor(options: { dist?: boolean; link?: 'ok' | 'missing' | 'elsewhere' } = {}) {
    mkdirSync(join(this.root, 'dist'), { recursive: true });
    if (options.dist !== false) {
      writeFileSync(join(this.root, 'dist', 'index.js'), '');
      writeFileSync(join(this.root, 'dist', 'index.cjs'), '');
    }
    mkdirSync(join(this.root, 'examples', 'node_modules'), { recursive: true });
    mkdirSync(join(this.root, 'examples', 'typescript'), { recursive: true });
    mkdirSync(join(this.root, 'examples', 'javascript'), { recursive: true });
    const link = options.link ?? 'ok';
    if (link !== 'missing')
      symlinkSync(
        link === 'ok' ? this.root : this.dir,
        join(this.root, 'examples', 'node_modules', 'ubudu-rtls-sdk')
      );
  }

  /** Writes both twins (or one with `only`). */
  example(
    id: string,
    name: string,
    b: Behaviour = {},
    only?: 'ts' | 'js',
    jsBehaviour?: Behaviour
  ): void {
    const base = `${id}-${name}`;
    if (only !== 'js')
      writeFileSync(
        join(this.root, 'examples', 'typescript', `${base}.ts`),
        exampleCode(`${base}-ts`, b)
      );
    if (only !== 'ts')
      writeFileSync(
        join(this.root, 'examples', 'javascript', `${base}.js`),
        exampleCode(`${base}-js`, jsBehaviour ?? b)
      );
  }

  trace(name: string): Record<string, unknown> | null {
    const file = join(this.traceDir, `${name}.json`);
    return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null;
  }

  async run(
    argv: string[],
    env: NodeJS.ProcessEnv = {},
    lockWait: { wait: boolean; pollMs?: number; maxWaitMs?: number } = { wait: false }
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
        TEST_LEDGER: this.ledgerPath,
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
      sweepCheck: async (runId, sweepEnv) => {
        this.sweepCalls.push({ runId, token: sweepEnv.RTLS_IT_INTERNAL_LOCK_TOKEN });
        return this.sweepExit;
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

const W = { RTLS_IT_WRITES: '1' };

describe('examples:check classification', () => {
  it('DONE → pass, SKIPPED: tier → skip, exit 1 → fail, no marker → fail, timeout → fail', async () => {
    const r = new Repo();
    r.example('01', 'done');
    r.example('02', 'skipped', {
      header: header('W', undefined, 'tier'),
      marker: 'SKIPPED: tier x',
    });
    r.example('03', 'exit-one', { exit: 1 });
    r.example('04', 'no-marker', { marker: 'none' });
    r.example('05', 'slow', { sleepMs: 10_000 });
    const res = await r.run(['01', '02', '03', '04', '05', '--lang', 'ts', '--timeout', '1']);
    expect(res.code).toBe(1);
    expect(res.outcomes.map((o) => [o.id, o.status, o.reason])).toEqual([
      ['01', 'pass', ''],
      ['02', 'skip', 'tier x'],
      ['03', 'fail', 'exit 1'],
      ['04', 'fail', 'no DONE or SKIPPED marker'],
      ['05', 'fail', 'timeout'],
    ]);
    expect(existsSync(join(r.stateRoot, RUN, 'examples', '01-ts.log'))).toBe(true);
  }, 30_000);

  it('a skip category the header does not allow fails in the read pass, and a foreign DONE fails', () => {
    const h = parseHeader(header('W')) as NonNullable<ReturnType<typeof parseHeader>>;
    const r = { exitCode: 0, timedOut: false, pid: 1, guardCounts: zeroBudget() };
    expect(
      classify(
        { ...r, stdout: 'SKIPPED: role no admin\n' },
        { basename: '01-x', header: h },
        'read'
      )
    ).toEqual({
      status: 'fail',
      reason: 'skip category role not allowed in the read pass',
    });
    expect(
      classify(
        { ...r, stdout: 'SKIPPED: role no admin\n' },
        { basename: '01-x', header: h },
        'write'
      ).status
    ).toBe('skip');
    expect(
      classify({ ...r, stdout: 'DONE 02-y\n' }, { basename: '01-x', header: h }, 'read')
    ).toEqual({
      status: 'fail',
      reason: 'foreign DONE marker',
    });
    expect(
      parseHeader('// Write section: tier W; budget positions=0 notifications=0 ble=0 etl=0')
    ).toBeNull();
    expect(parseHeader(header('X'))).toBeNull();
  });

  it('a TS/JS twin missing for a selected phase fails that id', async () => {
    const r = new Repo();
    r.example('03', 'positions-spatial', {}, 'ts');
    const res = await r.run(['--phase', 'P3']);
    expect(res.code).toBe(1);
    expect(res.outcomes.map((o) => [o.id, o.status, o.reason])).toEqual([
      ['03', 'fail', 'TS/JS twin missing (typescript 1, javascript 0)'],
      ['03', 'fail', 'TS/JS twin missing (typescript 1, javascript 0)'],
    ]);
  });

  it('a BUDGET line over the header budget fails; a BUDGET line differing from the guard counts fails', async () => {
    const r = new Repo();
    r.example('01', 'over', {
      lines: ['BUDGET positions=1 notifications=0 ble=0 etl=0'],
      guard: { positions: 1 },
      ledger: { positions: 1 },
    });
    r.example('02', 'differs', {
      header: header('W', 'positions=1 notifications=0 ble=0 etl=0'),
      lines: ['BUDGET positions=1 notifications=0 ble=0 etl=0'],
      guard: {},
    });
    const res = await r.run(['01', '02', '--write'], W);
    expect(res.outcomes.map((o) => [o.id, o.status, o.reason])).toEqual([
      ['01', 'fail', 'BUDGET over the header budget'],
      ['02', 'fail', 'guard counts differ from the BUDGET lines'],
    ]);
    expect(res.code).toBe(1);
  });

  it('a BUDGET line or a guard count in a read-only run fails', async () => {
    const r = new Repo();
    r.example('01', 'read-budget', { lines: ['BUDGET positions=1 notifications=0 ble=0 etl=0'] });
    r.example('02', 'read-guard', { guard: { notifications: 1 } });
    const res = await r.run(['01', '02', '--lang', 'ts']);
    expect(res.outcomes.map((o) => o.reason)).toEqual([
      'BUDGET line in a read-only run',
      'guard counted units in a read-only run',
    ]);
  });
});

describe('examples:check arguments and stops', () => {
  it('passes // args: on the read-only run and not on the write run', async () => {
    const r = new Repo();
    r.example('17', 'stream', { argsLine: '// args: --seconds 5' });
    expect((await r.run(['17', '--lang', 'ts'])).code).toBe(0);
    expect(r.trace('17-stream-ts')?.argv).toEqual(['--seconds', '5']);
    expect((await r.run(['17', '--write'], W)).code).toBe(0);
    expect(r.trace('17-stream-ts')?.argv).toEqual(['--write']);
  });

  it('a child exit 3 stops the run with exit 3', async () => {
    const r = new Repo();
    r.example('01', 'no-creds', { exit: 3, marker: 'none' });
    r.example('02', 'after');
    const res = await r.run(['01', '02', '--lang', 'ts']);
    expect(res.code).toBe(3);
    expect(r.trace('02-after-ts')).toBeNull();
  });

  it('a child exit 2 (a precondition such as a tier key in .env) stops the run with exit 2', async () => {
    const r = new Repo();
    r.example('01', 'precondition', { exit: 2, marker: 'none' });
    r.example('02', 'after');
    const res = await r.run(['01', '02', '--lang', 'ts']);
    expect(res.code).toBe(2);
    expect(res.outcomes.map((o) => [o.id, o.status, o.reason])).toEqual([
      ['01', 'fail', 'precondition (exit 2)'],
    ]);
    expect(r.trace('02-after-ts')).toBeNull();
  });

  it('--write without RTLS_IT_WRITES exits 2 before the first child, also when every header is tier S or C', async () => {
    const r = new Repo();
    r.example('03', 'side', { header: header('S', 'positions=1 notifications=0 ble=0 etl=0') });
    r.example('15', 'config', { header: header('C') });
    expect(
      (await r.run(['03', '15', '--write'], { RTLS_IT_SIDE_EFFECTS: '1', RTLS_IT_CONFIG: '1' }))
        .code
    ).toBe(2);
    expect(r.trace('03-side-ts')).toBeNull();
    expect(r.trace('15-config-ts')).toBeNull();
  });

  it('missing dist, a missing link or a link elsewhere → exit 2 with a hint before any child', async () => {
    for (const [options, hint] of [
      [{ dist: false }, 'npm run build'],
      [{ link: 'missing' }, 'npm run examples:install'],
      [{ link: 'elsewhere' }, 'npm run examples:install'],
    ] as const) {
      const r = new Repo(options);
      r.example('01', 'any');
      const res = await r.run(['01']);
      expect(res.code).toBe(2);
      expect(res.lines.some((l) => l.includes(hint))).toBe(true);
      expect(r.trace('01-any-ts')).toBeNull();
    }
  });
});

describe('examples:check selection and languages', () => {
  it('ids are numbers; without ids or --phase only header ids present in both languages; --phase P0 selects 0', async () => {
    const r = new Repo();
    r.example('01', 'with-header');
    r.example('02', 'ts-only', {}, 'ts');
    r.example('03', 'no-header', { header: null });
    r.example('04', 'also');
    expect((await r.run(['03-no-header'])).code).toBe(2);
    const bare = await r.run([]);
    expect(bare.lines[0]).toBe(`examples:check: 2 selected (01, 04); read-only pass; run ${RUN}`);
    expect(bare.code).toBe(0);
    const none = await r.run(['--phase', 'P0']);
    expect(none.lines).toEqual([`examples:check: 0 selected; read-only pass; run ${RUN}`]);
    expect(none.code).toBe(0);
    const one = await r.run(['04']);
    expect(one.lines[0]).toBe(`examples:check: 1 selected (04); read-only pass; run ${RUN}`);
    const noHeader = await r.run(['03', '--lang', 'ts']);
    expect(noHeader.outcomes[0]?.reason).toBe(
      'Write section header missing or malformed (the first line of an example must be the ' +
        '`// Write section: tier …; budget …; read skips …` header)'
    );
  });

  it('--lang defaults to both for a read-only pass and ts for --write; --write --lang js|both exits 2', async () => {
    const r = new Repo();
    r.example('01', 'x');
    expect((await r.run(['01'])).outcomes.map((o) => o.lang)).toEqual(['ts', 'js']);
    expect((await r.run(['01', '--write'], W)).outcomes.map((o) => o.lang)).toEqual(['ts']);
    expect((await r.run(['01', '--write', '--lang', 'js'], W)).code).toBe(2);
    expect((await r.run(['01', '--write', '--lang', 'both'], W)).code).toBe(2);
    expect((await r.run(['--write'], W)).code).toBe(2);
  });
});

describe('examples:check locks, tiers, ledger and residue', () => {
  it('a --write pass holds the run lock with the token passed to the child and registers in runs/', async () => {
    const r = new Repo();
    r.example('14', 'dashboards');
    const res = await r.run(['14', '--write'], W);
    expect(res.code).toBe(0);
    const t = r.trace('14-dashboards-ts');
    expect(t).toMatchObject({ runLock: true, registered: true, readSlot: false, runId: RUN });
    expect(typeof t?.token).toBe('string');
    expect(existsSync(join(r.lockDir, 'locks', 'run.lock'))).toBe(false);
    expect(existsSync(join(r.lockDir, 'runs', `${RUN}.json`))).toBe(false);
    expect(r.sweepCalls).toEqual([{ runId: RUN, token: t?.token }]);
  });

  it('a --write pass removes a preflight.json left by an earlier pass of the same run id before the first child; a read-only pass keeps it', async () => {
    const r = new Repo();
    r.example('14', 'dashboards');
    const stale = join(r.stateRoot, RUN, 'preflight.json');
    const leave = () => {
      mkdirSync(join(r.stateRoot, RUN), { recursive: true });
      writeFileSync(stale, JSON.stringify({ ruleEngineSafe: true, positionSafe: true }));
    };
    leave();
    expect((await r.run(['14'])).code).toBe(0);
    expect(r.trace('14-dashboards-ts')).toMatchObject({ preflightFile: true });
    expect(existsSync(stale)).toBe(true);
    const res = await r.run(['14', '--write'], W);
    expect(res.code).toBe(0);
    expect(r.trace('14-dashboards-ts')).toMatchObject({ runLock: true, preflightFile: false });
  });

  it('a held run lock → wait, then exit 2', async () => {
    const r = new Repo();
    r.example('14', 'dashboards');
    await acquireRunLock({ stateDir: r.lockDir, token: newLockToken(), wait: false });
    const started = Date.now();
    const res = await r.run(['14', '--write'], W, { wait: true, pollMs: 20, maxWaitMs: 100 });
    expect(res.code).toBe(2);
    expect(Date.now() - started).toBeGreaterThanOrEqual(60);
    expect(r.trace('14-dashboards-ts')).toBeNull();
  });

  it('a read-only pass holds a read slot with the token passed to the child; both slots held → wait, then exit 2', async () => {
    const r = new Repo();
    r.example('13', 'venues');
    expect((await r.run(['13', '--lang', 'ts'])).code).toBe(0);
    expect(r.trace('13-venues-ts')).toMatchObject({ readSlot: true, runLock: false });
    expect(existsSync(join(r.lockDir, 'locks', 'read-1.lock'))).toBe(false);
    for (let i = 0; i < 2; i += 1)
      await acquireReadSlot({ stateDir: r.lockDir, token: newLockToken(), wait: false });
    const res = await r.run(['13'], {}, { wait: true, pollMs: 20, maxWaitMs: 60 });
    expect(res.code).toBe(2);
    expect(res.lines.some((l) => l.endsWith('no-read-slot'))).toBe(true);
  });

  it('without RTLS_IT_SIDE_EFFECTS a tier-S id is skipped (tier), without RTLS_IT_CONFIG a tier-C id, and a tier-W id runs', async () => {
    const r = new Repo();
    r.example('03', 'side', { header: header('S', 'positions=1 notifications=0 ble=0 etl=0') });
    r.example('14', 'dashboards');
    r.example('15', 'config', { header: header('C') });
    const res = await r.run(['03', '14', '15', '--write'], W);
    expect(res.outcomes.map((o) => [o.id, o.status, o.reason])).toEqual([
      ['03', 'skip', 'tier S needs RTLS_IT_SIDE_EFFECTS=1'],
      ['14', 'pass', ''],
      ['15', 'skip', 'tier C needs RTLS_IT_CONFIG=1'],
    ]);
    expect(r.trace('03-side-ts')).toBeNull();
    expect(r.trace('15-config-ts')).toBeNull();
    expect(res.code).toBe(0);
  });

  it('a tier-C example runs with the config lock taken with the same token', async () => {
    const r = new Repo();
    r.example('15', 'config', { header: header('C') });
    const res = await r.run(['15', '--write'], { ...W, RTLS_IT_CONFIG: '1' });
    expect(res.code).toBe(0);
    expect(r.trace('15-config-ts')).toMatchObject({ runLock: true, configLock: true });
    expect(existsSync(join(r.lockDir, 'locks', 'config.lock'))).toBe(false);
  });

  it('with S enabled and the ledger at a cap → exit 2 before the first child', async () => {
    const r = new Repo();
    r.example('03', 'side', { header: header('S', 'positions=1 notifications=0 ble=0 etl=0') });
    recordLedger(
      'aaaaaaaa',
      'integration',
      { R: true, W: true, C: false, S: true },
      { positions: 57 },
      { ledgerPath: r.ledgerPath }
    );
    const res = await r.run(['03', '--write'], { ...W, RTLS_IT_SIDE_EFFECTS: '1' });
    expect(res.code).toBe(2);
    expect(res.lines.some((l) => l.endsWith('ledger-cap'))).toBe(true);
    expect(r.trace('03-side-ts')).toBeNull();
  });

  it('after a write pass the ledger entry equals the sum of the children’s guard counts; the runner writes none', async () => {
    const r = new Repo();
    const S = { ...W, RTLS_IT_SIDE_EFFECTS: '1' };
    r.example('03', 'side', {
      header: header('S', 'positions=1 notifications=0 ble=0 etl=0'),
      lines: ['BUDGET positions=1 notifications=0 ble=0 etl=0'],
      guard: { positions: 1 },
      ledger: { positions: 1 },
    });
    r.example('16', 'notify', {
      header: header('S', 'positions=0 notifications=1 ble=0 etl=0'),
      lines: ['BUDGET positions=0 notifications=1 ble=0 etl=0'],
      guard: { notifications: 1 },
      ledger: { positions: 1, notifications: 1 },
    });
    const ok = await r.run(['03', '16', '--write'], S);
    expect(ok.code).toBe(0);
    expect(ledgerEntry(RUN, { ledgerPath: r.ledgerPath })?.counts).toEqual({
      positions: 1,
      notifications: 1,
      bleActions: 0,
      etlWrites: 0,
    });

    // A pass that starts no child (tier S without RTLS_IT_SIDE_EFFECTS) leaves no ledger entry: the runner
    // itself writes no counts.
    const quiet = new Repo();
    quiet.example('03', 'side', { header: header('S', 'positions=1 notifications=0 ble=0 etl=0') });
    const skipped = await quiet.run(['03', '--write'], W);
    expect(skipped.code).toBe(0);
    expect(skipped.outcomes.map((o) => o.status)).toEqual(['skip']);
    expect(ledgerEntry(RUN, { ledgerPath: quiet.ledgerPath })).toBeNull();

    // A ledger entry that differs from the guard counts fails the pass.
    const off = new Repo();
    off.example('03', 'side', {
      header: header('S', 'positions=1 notifications=0 ble=0 etl=0'),
      lines: ['BUDGET positions=1 notifications=0 ble=0 etl=0'],
      guard: { positions: 1 },
      ledger: { positions: 0 },
    });
    const bad = await off.run(['03', '--write'], S);
    expect(bad.code).toBe(1);
    expect(bad.lines).toContain(
      'examples:check: write pass failed: ledger entry differs from the guard counts'
    );
  });

  it('residue found by the own-run sweeper check fails the pass', async () => {
    const r = new Repo();
    r.example('14', 'dashboards');
    r.sweepExit = 1;
    const res = await r.run(['14', '--write'], W);
    expect(res.code).toBe(1);
    expect(res.lines).toContain(
      'examples:check: write pass failed: own-run sweeper check exit 1 (residue)'
    );
    expect(r.sweepCalls.map((c) => c.runId)).toEqual([RUN]);
  });
});

describe('examples:check: guard violations and budget refusals fail the entry', () => {
  it('classify: a violation or a refusal recorded while the child ran fails it, whatever it printed', () => {
    const example = { basename: '14-dashboards', header: parseHeader(header('W')) as never };
    const printed = {
      exitCode: 0,
      timedOut: false,
      stdout: 'error: GuardViolation G12 caught and logged\nDONE 14-dashboards\n',
      pid: 1,
      guardCounts: zeroBudget(),
    };
    expect(classify(printed, example, 'read')).toEqual({ status: 'pass' });
    expect(classify({ ...printed, violations: 1 }, example, 'read')).toEqual({
      status: 'fail',
      reason: 'guard violation (1) while the example ran',
    });
    expect(classify({ ...printed, budgetRefusals: 1 }, example, 'write')).toEqual({
      status: 'fail',
      reason: 'budget refused (BudgetExceeded) while the example ran',
    });
  });

  it('a read pass: a guard record with violations, or a new unexpected violations.jsonl line, fails the entry', async () => {
    const r = new Repo();
    r.example('14', 'caught', {
      lines: ['error: GuardViolation G12 caught and logged'],
      guard: {},
      guardViolations: 1,
    });
    r.example('15', 'killed', { violationLines: [{ rule: 'G3' }] });
    r.example('16', 'expected', { violationLines: [{ rule: 'G1', expected: true }] });
    const res = await r.run(['14', '15', '16', '--lang', 'js']);
    expect(res.code).toBe(1);
    expect(res.outcomes.map((o) => [o.id, o.status, o.reason])).toEqual([
      ['14', 'fail', 'guard violation (1) while the example ran'],
      ['15', 'fail', 'guard violation (1) while the example ran'],
      ['16', 'pass', ''],
    ]);
  });

  it('a write pass: a budget refusal fails the entry and the pass', async () => {
    const r = new Repo();
    r.example('03', 'refused', {
      header: header('S', 'positions=1 notifications=0 ble=0 etl=0'),
      refusal: true,
    });
    const res = await r.run(['03', '--write'], { ...W, RTLS_IT_SIDE_EFFECTS: '1' });
    expect(res.code).toBe(1);
    expect(res.outcomes.map((o) => [o.status, o.reason])).toEqual([
      ['fail', 'budget refused (BudgetExceeded) while the example ran'],
    ]);
    expect(res.lines).toContain(
      'examples:check: write pass failed: budget.json records a budget refusal'
    );
  });
});

describe('examples:check default commands (the guard wiring)', () => {
  const REPO_ROOT = join(__dirname, '..', '..', '..');
  const HARNESS = join(REPO_ROOT, 'test', 'integration', 'harness');

  it('both languages start the example with --import <repo>/test/integration/harness/preload.mjs before the file', () => {
    expect(PRELOAD_PATH).toBe(join(HARNESS, 'preload.mjs'));
    expect(existsSync(PRELOAD_PATH)).toBe(true);
    const file = join(REPO_ROOT, 'examples', 'typescript', '03-x.ts');
    const ts = defaultChildCommand('ts', file, ['--write']);
    expect(ts).toEqual({
      command: process.platform === 'win32' ? 'npx.cmd' : 'npx',
      args: ['tsx', '--import', PRELOAD_PATH, file, '--write'],
    });
    const js = defaultChildCommand('js', file.replace('typescript', 'javascript'), [
      '--seconds',
      '5',
    ]);
    expect(js).toEqual({
      command: process.execPath,
      args: ['--import', PRELOAD_PATH, file.replace('typescript', 'javascript'), '--seconds', '5'],
    });
  });

  it('the own-run sweep check runs `test:integration:sweep -- --check --run <id> --force` with the token and passes its exit code through', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'rtls-runner-sweep-'));
    writeFileSync(
      join(dir, 'package.json'),
      JSON.stringify({
        name: 'sweep-scratch',
        private: true,
        scripts: { 'test:integration:sweep': 'node sweep.mjs' },
      })
    );
    writeFileSync(
      join(dir, 'sweep.mjs'),
      [
        "import { writeFileSync } from 'node:fs';",
        "writeFileSync('seen.json', JSON.stringify({ argv: process.argv.slice(2), token: process.env.RTLS_IT_INTERNAL_LOCK_TOKEN }));",
        'process.exit(Number(process.env.TEST_SWEEP_EXIT));',
        '',
      ].join('\n')
    );
    const env = {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      npm_config_update_notifier: 'false',
      RTLS_IT_INTERNAL_LOCK_TOKEN: 'token-of-the-pass-0123456789abcdef',
    };
    expect(await defaultSweepCheck(RUN, { ...env, TEST_SWEEP_EXIT: '1' }, dir)).toBe(1);
    expect(JSON.parse(readFileSync(join(dir, 'seen.json'), 'utf8'))).toEqual({
      argv: ['--check', '--run', RUN, '--force'],
      token: 'token-of-the-pass-0123456789abcdef',
    });
    expect(await defaultSweepCheck(RUN, { ...env, TEST_SWEEP_EXIT: '0' }, dir)).toBe(0);
    expect(await defaultSweepCheck(RUN, { ...env, TEST_SWEEP_EXIT: '2' }, dir)).toBe(2);
  }, 60_000);

  it('a read pass with the default command runs the example under the guard: a foreign fetch is a GuardViolation and guard/<pid>.json is written', async () => {
    // A scratch checkout as in preload.test.ts: the harness files copied, src/spec/node_modules linked, its own git
    // repository, so the child's state, locks and ledger stay in a temporary folder. The base URL is unreachable
    // (no read slot, no host reached); the only request the example tries goes to a foreign host.
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'rtls-runner-guarded-')));
    const harness = join(root, 'test', 'integration', 'harness');
    mkdirSync(harness, { recursive: true });
    for (const name of readdirSync(HARNESS)) {
      if (/\.(ts|mjs|cjs)$/.test(name) && !name.endsWith('.test.ts'))
        copyFileSync(join(HARNESS, name), join(harness, name));
    }
    cpSync(join(REPO_ROOT, 'examples', 'shared'), join(root, 'examples', 'shared'), {
      recursive: true,
    });
    for (const link of ['src', 'spec', 'node_modules'])
      symlinkSync(join(REPO_ROOT, link), join(root, link));
    writeFileSync(
      join(root, 'package.json'),
      JSON.stringify({ name: 'runner-scratch', private: true, type: 'module' })
    );
    mkdirSync(join(root, 'dist'));
    writeFileSync(join(root, 'dist', 'index.js'), '');
    writeFileSync(join(root, 'dist', 'index.cjs'), '');
    mkdirSync(join(root, 'examples', 'node_modules'), { recursive: true });
    symlinkSync(root, join(root, 'examples', 'node_modules', 'ubudu-rtls-sdk'));
    const example = [
      header('none'),
      'try {',
      "  await fetch('https://example.invalid/x');",
      "  console.log('foreign sent');",
      '} catch (e) {',
      '  console.log(`foreign ${e?.name} ${e?.rule}`);',
      '}',
      "console.log('DONE 01-guarded');",
      '',
    ].join('\n');
    for (const [lang, ext] of [
      ['typescript', 'ts'],
      ['javascript', 'js'],
    ] as const) {
      mkdirSync(join(root, 'examples', lang), { recursive: true });
      writeFileSync(join(root, 'examples', lang, `01-guarded.${ext}`), example);
    }
    execFileSync('git', ['init', '-q'], { cwd: root });
    const stateRoot = join(root, 'test', 'integration', '.state');
    const lines: string[] = [];
    const code = await main(['01', '--lang', 'js'], {
      root,
      env: {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        RTLS_IT_RUN_ID: RUN,
        RTLS_BASE_URL: 'http://127.0.0.1:9/api',
        RTLS_API_KEY: 'sdk-test-dummy-key',
        APP_NAMESPACE: 'test-ns',
      },
      stateRoot,
      lockStateDir: stateRoot,
      ledgerPath: join(stateRoot, 'ledger.json'),
      lockWait: { wait: false },
      preloadPath: join(harness, 'preload.mjs'),
      log: (l) => lines.push(l),
      error: (l) => lines.push(l),
    });
    const log = readFileSync(join(stateRoot, RUN, 'examples', '01-js.log'), 'utf8');
    expect(log).toContain('foreign GuardViolation G1');
    expect(log).not.toContain('foreign sent');
    const guardDir = join(stateRoot, RUN, 'guard');
    const records = readdirSync(guardDir).map(
      (n) => JSON.parse(readFileSync(join(guardDir, n), 'utf8')) as Record<string, unknown>
    );
    expect(records).toEqual([
      expect.objectContaining({ mode: 'example', requests: 0, violations: 1 }),
    ]);
    expect(readFileSync(join(stateRoot, RUN, 'violations.jsonl'), 'utf8')).toContain('"G1"');
    // the example caught the GuardViolation and printed DONE: the runner still fails it
    expect(lines.find((l) => l.startsWith('01 js read '))).toMatch(
      /^01 js read fail \d+ms guard violation \(1\) while the example ran$/
    );
    expect(code).toBe(1);
  }, 90_000);
});
