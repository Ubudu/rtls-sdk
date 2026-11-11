#!/usr/bin/env node
// `npm run examples:check`: the guarded runner of the numbered examples.
//
//   node scripts/examples/run.mjs [<id>…] [--phase Pn] [--lang ts|js|both] [--write] [--timeout <s>]
//
//   <id>        example numbers (`03`, not `03-positions-spatial`)
//   --phase Pn  the example numbers assigned to Pn in scripts/lib/ownership.mjs; P0 has none
//   (neither)   every id present in both languages whose first line carries the `// Write section:` header
//   --lang      default `both` for a read-only pass, `ts` with --write; `--write --lang js|both` exits 2
//   --write     the write sections (TypeScript twins only); needs explicit ids or --phase and RTLS_IT_WRITES=1
//   --timeout   per child, seconds (default 180)
//
// Never builds; before any child it exits 2 with a hint when dist/index.js or dist/index.cjs is missing, or when
// examples/node_modules/ubudu-rtls-sdk is missing or its realpath is not the repository root. Children run one at
// a time from examples/, with RTLS_IT_RUN_ID and RTLS_IT_INTERNAL_LOCK_TOKEN, under the guard:
//   npx tsx --import <repo>/test/integration/harness/preload.mjs <file.ts> [--write] [<args>]
//   node --import <repo>/test/integration/harness/preload.mjs <file.js> [--write] [<args>]
// `<args>` come from an optional `// args: <argv>` comment on the first lines, read-only runs only.
//
// A read-only pass holds a read slot with a fresh token (none for an unreachable base URL). A --write pass:
// RTLS_IT_WRITES=1 (else exit 2), with S the cumulative ledger checked against the examples share (exit 2), the
// run lock with a fresh token (exit 2 when still held after the wait), the pass registered in runs/, a
// `.state/<runId>/preflight.json` of an earlier pass of the same run id removed (the first child's preload
// computes a fresh one), the config lock with the same token when a tier-C id runs (exit 2 when held). An S or C
// id whose tier variable is not 1 is not started and is reported `skip` (tier). After the pass: the own-run
// sweeper check (`test:integration:sweep -- --check --run <runId> --force`, with the token, so it takes no slot;
// residue fails the pass) and the ledger entry compared with the sum of the children's guard counts; then
// deregister and release. The runner writes no counts to the ledger (each child's guard records them).
//
// Classification (budgets and allowed read skips from the header): `DONE <basename>` last → pass;
// `SKIPPED: <category> <text>` last with an allowed category → skip; anything else fails: timeout, a guard
// violation or a budget refusal while the child ran (new unexpected lines in `.state/<runId>/violations.jsonl`, a
// `guard/<pid>.json` written meanwhile with `violations > 0`, new `budget.json` `exceeded` entries; a
// violation fails the run even when the example caught the error), a missing or foreign marker, a disallowed skip
// category, in a read pass any non-zero BUDGET line or guard count, in a write pass BUDGET or guard counts over the
// header budget or guard counts differing from the BUDGET lines. A pass whose `budget.json` holds a refusal fails.
// Logs: `test/integration/.state/<runId>/examples/<id>-<lang>[-write].log`; the console shows the summary only.
// Exit: 0 no failure, 1 a failure, 2 precondition or usage, 3 a child reported missing credentials, 4 a child's
// configuration restore failed.
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import {
  createWriteStream,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { UsageError, parseArgs, parsePhase } from '../lib/cli.mjs';
import { REPO_ROOT } from '../lib/git.mjs';
import { EXAMPLE_NUMBERS } from '../lib/ownership.mjs';
import { isUnreachableBaseUrl, tiersOf } from '../integration.mjs';
import {
  EXAMPLES_SHARE,
  checkLedger,
  ledgerEntry,
} from '../../test/integration/harness/ledger.mjs';
import {
  acquireConfigLock,
  acquireReadSlot,
  acquireRunLock,
  deregisterRun,
  newLockToken,
  registerRun,
  releaseConfigLock,
  releaseReadSlot,
  releaseRunLock,
} from '../../test/integration/harness/lock.mjs';
import { checkoutStateDir } from '../../test/integration/harness/state-io.mjs';

/** @typedef {'positions' | 'notifications' | 'bleActions' | 'etlWrites'} BudgetName */
/** @typedef {Record<BudgetName, number>} Budget */
/** @typedef {'ts' | 'js'} Lang */
/** @typedef {'feature-off' | 'role' | 'tier' | 'no-fixture' | 'preflight'} SkipCategory */
/**
 * @typedef {{ tier: 'W' | 'C' | 'S' | 'none'; budget: Budget; readSkips: SkipCategory[] }} Header
 * @typedef {{ id: string; basename: string | null; ts: string | null; js: string | null;
 *   header: Header | null; headerLine: string; args: string[]; problem: string | null }} Example
 * @typedef {{ id: string; lang: Lang; pass: 'read' | 'write'; status: 'pass' | 'skip' | 'fail';
 *   reason?: string; ms: number; guardCounts?: Budget }} Outcome
 * @typedef {{ exitCode: number | null; timedOut: boolean; stdout: string; pid: number | null }} ChildResult
 * @typedef {{ guardCounts: Budget; violations?: number; budgetRefusals?: number }} ChildRecord
 */

export const SKIP_CATEGORIES = Object.freeze([
  'feature-off',
  'role',
  'tier',
  'no-fixture',
  'preflight',
]);
export const DEFAULT_TIMEOUT_S = 180;
export const KILL_GRACE_MS = 5_000;
export const PRELOAD_PATH = join(REPO_ROOT, 'test', 'integration', 'harness', 'preload.mjs');

const HEADER_RE =
  /^\/\/ Write section: tier (W|C|S|none); budget positions=(\d+) notifications=(\d+) ble=(\d+) etl=(\d+); read skips (none|[a-z-]+(?:,[a-z-]+)*)$/;
const ARGS_RE = /^\/\/ args: (.+)$/;
const BUDGET_RE = /^BUDGET positions=(\d+) notifications=(\d+) ble=(\d+) etl=(\d+)$/;
const ID_RE = /^\d{2}$/;
const RUN_ID_RE = /^[0-9a-f]{8}$/;
const ARGS_LINES = 5;

/** @returns {Budget} */
export function zeroBudget() {
  return { positions: 0, notifications: 0, bleActions: 0, etlWrites: 0 };
}

/** @type {readonly BudgetName[]} */
const BUDGET_NAMES = ['positions', 'notifications', 'bleActions', 'etlWrites'];

/**
 * @param {Budget} a
 * @param {Partial<Budget>} b
 * @returns {Budget}
 */
function addBudget(a, b) {
  /** @type {Budget} */
  const out = { ...a };
  for (const name of BUDGET_NAMES) out[name] += typeof b[name] === 'number' ? b[name] : 0;
  return out;
}

/**
 * @param {Budget} a
 * @param {Budget} b
 */
const sameBudget = (a, b) => BUDGET_NAMES.every((n) => a[n] === b[n]);
/**
 * @param {Budget} a
 * @param {Budget} limit
 */
const overBudget = (a, limit) => BUDGET_NAMES.some((n) => a[n] > limit[n]);
/** @param {Budget} a */
const nonZero = (a) => BUDGET_NAMES.some((n) => a[n] !== 0);

/**
 * The `// Write section:` header of an example's first line, or null when it is missing or malformed.
 *
 * @param {string} line
 * @returns {Header | null}
 */
export function parseHeader(line) {
  const m = HEADER_RE.exec(line.trim());
  if (!m) return null;
  const skips = m[6] === 'none' ? [] : /** @type {string} */ (m[6]).split(',');
  if (!skips.every((s) => SKIP_CATEGORIES.includes(s))) return null;
  return {
    tier: /** @type {Header['tier']} */ (m[1]),
    budget: {
      positions: Number(m[2]),
      notifications: Number(m[3]),
      bleActions: Number(m[4]),
      etlWrites: Number(m[5]),
    },
    readSkips: /** @type {SkipCategory[]} */ (skips),
  };
}

/**
 * Arguments of an optional `// args: <argv>` comment on the first lines (read-only runs only).
 *
 * @param {string} text
 * @returns {string[]}
 */
export function parseArgsComment(text) {
  for (const line of text.split('\n').slice(0, ARGS_LINES)) {
    const m = ARGS_RE.exec(line.trim());
    if (m) return /** @type {string} */ (m[1]).trim().split(/\s+/);
  }
  return [];
}

/**
 * Sum of the `BUDGET …` lines of a child's stdout, or null when it printed none.
 *
 * @param {string} stdout
 * @returns {Budget | null}
 */
export function budgetLines(stdout) {
  /** @type {Budget | null} */
  let sum = null;
  for (const line of stdout.split('\n')) {
    const m = BUDGET_RE.exec(line.trim());
    if (!m) continue;
    sum = addBudget(sum ?? zeroBudget(), {
      positions: Number(m[1]),
      notifications: Number(m[2]),
      bleActions: Number(m[3]),
      etlWrites: Number(m[4]),
    });
  }
  return sum;
}

/**
 * Classifies one child run. `violations` and `budgetRefusals`: the guard violations and budget
 * refusals recorded while the child ran; either fails the entry whatever the child printed or exited with.
 *
 * @param {ChildResult & ChildRecord} r
 * @param {{ basename: string; header: Header }} example
 * @param {'read' | 'write'} pass
 * @returns {{ status: 'pass' | 'skip' | 'fail'; reason?: string }}
 */
export function classify(r, example, pass) {
  if (r.timedOut) return { status: 'fail', reason: 'timeout' };
  if ((r.violations ?? 0) > 0)
    return { status: 'fail', reason: `guard violation (${r.violations}) while the example ran` };
  if ((r.budgetRefusals ?? 0) > 0)
    return { status: 'fail', reason: 'budget refused (BudgetExceeded) while the example ran' };
  const budget = budgetLines(r.stdout);
  if (pass === 'read') {
    if (budget && nonZero(budget))
      return { status: 'fail', reason: 'BUDGET line in a read-only run' };
    if (nonZero(r.guardCounts))
      return { status: 'fail', reason: 'guard counted units in a read-only run' };
  } else {
    const reported = budget ?? zeroBudget();
    if (overBudget(reported, example.header.budget))
      return { status: 'fail', reason: 'BUDGET over the header budget' };
    if (overBudget(r.guardCounts, example.header.budget))
      return { status: 'fail', reason: 'guard counts over the header budget' };
    if (!sameBudget(reported, r.guardCounts))
      return { status: 'fail', reason: 'guard counts differ from the BUDGET lines' };
  }
  if (r.exitCode !== 0) return { status: 'fail', reason: `exit ${r.exitCode ?? 'signal'}` };
  const last =
    r.stdout
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l !== '')
      .at(-1) ?? '';
  if (last === `DONE ${example.basename}`) return { status: 'pass' };
  const skip = /^SKIPPED: (\S+)(?: (.*))?$/.exec(last);
  if (skip) {
    const category = /** @type {string} */ (skip[1]);
    const allowed =
      pass === 'write'
        ? SKIP_CATEGORIES.includes(category)
        : example.header.readSkips.includes(/** @type {SkipCategory} */ (category));
    return allowed
      ? { status: 'skip', reason: `${category}${skip[2] ? ` ${skip[2]}` : ''}` }
      : { status: 'fail', reason: `skip category ${category} not allowed in the ${pass} pass` };
  }
  return {
    status: 'fail',
    reason: last.startsWith('DONE ') ? 'foreign DONE marker' : 'no DONE or SKIPPED marker',
  };
}

/**
 * `<dir>/<id>-*.<ext>` files.
 *
 * @param {string} dir
 * @param {string} id
 * @param {string} ext
 * @returns {string[]}
 */
function filesOf(dir, id, ext) {
  try {
    return readdirSync(dir)
      .filter((n) => n.startsWith(`${id}-`) && n.endsWith(ext))
      .sort();
  } catch {
    return [];
  }
}

/**
 * The two twins of an example and its header (a problem is a reason to fail the id).
 *
 * @param {string} examplesDir
 * @param {string} id
 * @returns {Example}
 */
export function loadExample(examplesDir, id) {
  const ts = filesOf(join(examplesDir, 'typescript'), id, '.ts');
  const js = filesOf(join(examplesDir, 'javascript'), id, '.js');
  /** @type {Example} */
  const ex = {
    id,
    basename: null,
    ts: null,
    js: null,
    header: null,
    headerLine: '',
    args: [],
    problem: null,
  };
  if (ts.length !== 1 || js.length !== 1) {
    ex.problem = `TS/JS twin missing (typescript ${ts.length}, javascript ${js.length})`;
    return ex;
  }
  const tsBase = /** @type {string} */ (ts[0]).slice(0, -3);
  const jsBase = /** @type {string} */ (js[0]).slice(0, -3);
  if (tsBase !== jsBase) {
    ex.problem = 'TS/JS twins have different basenames';
    return ex;
  }
  ex.basename = tsBase;
  ex.ts = join(examplesDir, 'typescript', /** @type {string} */ (ts[0]));
  ex.js = join(examplesDir, 'javascript', /** @type {string} */ (js[0]));
  const text = readFileSync(ex.ts, 'utf8');
  ex.headerLine = text.split('\n')[0] ?? '';
  ex.header = parseHeader(ex.headerLine);
  ex.args = parseArgsComment(text);
  if (ex.header === null)
    ex.problem =
      'Write section header missing or malformed (the first line of an example must be the ' +
      '`// Write section: tier …; budget …; read skips …` header)';
  return ex;
}

/**
 * Ids present in both languages whose TypeScript first line carries the `Write section:` header.
 *
 * @param {string} examplesDir
 * @returns {string[]}
 */
export function headerIds(examplesDir) {
  const ids = new Set();
  for (const lang of /** @type {const} */ (['typescript', 'javascript'])) {
    /** @type {string[]} */
    let names;
    try {
      names = readdirSync(join(examplesDir, lang));
    } catch {
      continue;
    }
    for (const n of names) if (/^\d{2}-/.test(n)) ids.add(n.slice(0, 2));
  }
  return [...ids].sort().filter((id) => {
    const ts = filesOf(join(examplesDir, 'typescript'), id, '.ts');
    const js = filesOf(join(examplesDir, 'javascript'), id, '.js');
    if (ts.length === 0 || js.length === 0) return false;
    const first =
      readFileSync(join(examplesDir, 'typescript', /** @type {string} */ (ts[0])), 'utf8').split(
        '\n'
      )[0] ?? '';
    return first.startsWith('// Write section:');
  });
}

/**
 * @typedef {{ ids: string[]; phase?: string; lang: 'ts' | 'js' | 'both'; write: boolean; timeoutS: number }} RunnerArgs
 */

/**
 * @param {readonly string[]} argv
 * @returns {RunnerArgs}
 */
export function parseRunnerArgs(argv) {
  const args = parseArgs(argv, { flags: ['write'], options: ['phase', 'lang', 'timeout'] });
  const phase = parsePhase(args.options.phase);
  for (const id of args.positionals) {
    if (!ID_RE.test(id)) throw new UsageError(`ids are example numbers such as 03 (got ${id})`);
  }
  const write = args.flags.write;
  const lang = args.options.lang ?? (write ? 'ts' : 'both');
  if (lang !== 'ts' && lang !== 'js' && lang !== 'both')
    throw new UsageError(`--lang must be ts, js or both (got ${lang})`);
  if (write && lang !== 'ts')
    throw new UsageError(`--write runs the TypeScript twins only (--lang ${lang} refused)`);
  if (write && args.positionals.length === 0 && phase === undefined)
    throw new UsageError('--write needs explicit ids or --phase');
  const timeoutS =
    args.options.timeout === undefined ? DEFAULT_TIMEOUT_S : Number(args.options.timeout);
  if (!Number.isFinite(timeoutS) || timeoutS <= 0)
    throw new UsageError('--timeout must be a positive number of seconds');
  return {
    ids: [...new Set(args.positionals)],
    ...(phase !== undefined ? { phase } : {}),
    lang,
    write,
    timeoutS,
  };
}

/**
 * The precondition problem of the build and the examples link, or null.
 *
 * @param {string} root
 * @returns {string | null}
 */
export function preconditionProblem(root) {
  for (const f of ['dist/index.js', 'dist/index.cjs']) {
    if (!existsSync(join(root, f))) return `${f} is missing (hint: npm run build)`;
  }
  const link = join(root, 'examples', 'node_modules', 'ubudu-rtls-sdk');
  let target;
  try {
    target = realpathSync(link);
  } catch {
    return 'examples/node_modules/ubudu-rtls-sdk is missing (hint: npm run examples:install)';
  }
  if (target !== realpathSync(root))
    return 'examples/node_modules/ubudu-rtls-sdk does not point at this repository (hint: npm run examples:install)';
  return null;
}

/**
 * Default child command: the guarded example process (`--import <preload>` before the example file).
 *
 * @internal exported for the runner tests
 * @param {Lang} lang
 * @param {string} file
 * @param {string[]} args
 * @param {string} [preload] the guard entry point (default PRELOAD_PATH; tests pass a scratch copy)
 * @returns {{ command: string; args: string[] }}
 */
export function defaultChildCommand(lang, file, args, preload = PRELOAD_PATH) {
  if (lang === 'ts') {
    return {
      command: process.platform === 'win32' ? 'npx.cmd' : 'npx',
      args: ['tsx', '--import', preload, file, ...args],
    };
  }
  return { command: process.execPath, args: ['--import', preload, file, ...args] };
}

/**
 * Runs one child, writing stdout and stderr to the log file; SIGTERM at the timeout, SIGKILL after the grace.
 *
 * @param {{ command: string; args: string[] }} cmd
 * @param {{ cwd: string; env: NodeJS.ProcessEnv; timeoutMs: number; graceMs: number; logPath: string }} o
 * @returns {Promise<ChildResult>}
 */
function runChild(cmd, o) {
  return new Promise((resolvePromise) => {
    mkdirSync(resolve(o.logPath, '..'), { recursive: true });
    const log = createWriteStream(o.logPath);
    const child = spawn(cmd.command, cmd.args, {
      cwd: o.cwd,
      env: o.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let timedOut = false;
    /** @type {NodeJS.Timeout | undefined} */
    let kill;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
      kill = setTimeout(() => child.kill('SIGKILL'), o.graceMs);
    }, o.timeoutMs);
    child.stdout.on('data', (chunk) => {
      stdout += String(chunk);
      log.write(chunk);
    });
    child.stderr.on('data', (chunk) => log.write(chunk));
    const finish = (/** @type {number | null} */ code) => {
      clearTimeout(timer);
      if (kill) clearTimeout(kill);
      log.end();
      resolvePromise({ exitCode: code, timedOut, stdout, pid: child.pid ?? null });
    };
    child.on('error', () => finish(1));
    child.on('close', (code) => finish(code));
  });
}

/**
 * mtimes of the `guard/<pid>.json` files of a run.
 *
 * @param {string} guardDir
 * @returns {Map<string, number>}
 */
function guardFiles(guardDir) {
  const out = new Map();
  /** @type {string[]} */
  let names;
  try {
    names = readdirSync(guardDir).filter((n) => n.endsWith('.json'));
  } catch {
    return out;
  }
  for (const n of names) out.set(n, statSync(join(guardDir, n)).mtimeMs);
  return out;
}

/**
 * Sum of the counts, and of the violations, of every guard file written while an entry ran (new or changed since
 * `before`).
 *
 * @param {string} guardDir
 * @param {Map<string, number>} before
 * @returns {{ counts: Budget; violations: number }}
 */
function guardRecordsSince(guardDir, before) {
  let counts = zeroBudget();
  let violations = 0;
  for (const [name, mtime] of guardFiles(guardDir)) {
    if (before.get(name) === mtime) continue;
    try {
      const record = JSON.parse(readFileSync(join(guardDir, name), 'utf8'));
      counts = addBudget(counts, record?.counts ?? {});
      if (typeof record?.violations === 'number') violations += record.violations;
    } catch {
      // an unreadable record counts nothing; the ledger comparison of a write pass still sees the units
    }
  }
  return { counts, violations };
}

/**
 * Number of unexpected guard violations in `.state/<runId>/violations.jsonl` (lines without `expected: true`;
 * an unreadable line counts as one).
 *
 * @param {string} runDir
 * @returns {number}
 */
export function unexpectedViolations(runDir) {
  let text;
  try {
    text = readFileSync(join(runDir, 'violations.jsonl'), 'utf8');
  } catch {
    return 0;
  }
  let n = 0;
  for (const line of text.split('\n')) {
    if (line.trim() === '') continue;
    try {
      if (JSON.parse(line)?.expected !== true) n += 1;
    } catch {
      n += 1;
    }
  }
  return n;
}

/**
 * Number of budget refusals in `.state/<runId>/budget.json` (`exceeded` entries).
 *
 * @param {string} runDir
 * @returns {number}
 */
export function budgetRefusals(runDir) {
  try {
    const file = JSON.parse(readFileSync(join(runDir, 'budget.json'), 'utf8'));
    return Array.isArray(file?.exceeded) ? file.exceeded.length : 0;
  } catch {
    return 0;
  }
}

/**
 * The own-run sweeper check after a --write pass: `npm run --silent test:integration:sweep -- --check --run <runId>
 * --force`, started with the pass's token in `env`; its exit code is passed through (a spawn error or a signal → 1).
 *
 * @internal exported for the runner tests
 * @param {string} runId
 * @param {NodeJS.ProcessEnv} env
 * @param {string} cwd
 * @returns {Promise<number>}
 */
export function defaultSweepCheck(runId, env, cwd) {
  return new Promise((resolvePromise) => {
    const child = spawn(
      process.platform === 'win32' ? 'npm.cmd' : 'npm',
      ['run', '--silent', 'test:integration:sweep', '--', '--check', '--run', runId, '--force'],
      { cwd, env, stdio: ['ignore', 'inherit', 'inherit'] }
    );
    child.on('error', () => resolvePromise(1));
    child.on('close', (code) => resolvePromise(code ?? 1));
  });
}

/**
 * @typedef {{
 *   root?: string;
 *   env?: NodeJS.ProcessEnv;
 *   stateRoot?: string;
 *   lockStateDir?: string;
 *   ledgerPath?: string;
 *   lockWait?: { wait: boolean; pollMs?: number; maxWaitMs?: number };
 *   childCommand?: (lang: Lang, file: string, args: string[]) => { command: string; args: string[] };
 *   preloadPath?: string;
 *   sweepCheck?: (runId: string, env: NodeJS.ProcessEnv, cwd: string) => Promise<number>;
 *   graceMs?: number;
 *   log?: (line: string) => void;
 *   error?: (line: string) => void;
 * }} RunnerDeps
 */

/**
 * @param {readonly string[]} argv
 * @param {RunnerDeps} [deps]
 * @returns {Promise<number>}
 */
export async function main(argv, deps = {}) {
  const root = deps.root ?? REPO_ROOT;
  const env = deps.env ?? process.env;
  const examplesDir = join(root, 'examples');
  const stateRoot = deps.stateRoot ?? checkoutStateDir();
  const lockOptions = deps.lockStateDir ? { stateDir: deps.lockStateDir } : {};
  const ledgerOptions = deps.ledgerPath ? { ledgerPath: deps.ledgerPath } : {};
  const lockWait = deps.lockWait ?? { wait: true };
  const preloadPath = deps.preloadPath ?? PRELOAD_PATH;
  const childCommand =
    deps.childCommand ??
    ((/** @type {Lang} */ lang, /** @type {string} */ file, /** @type {string[]} */ a) =>
      defaultChildCommand(lang, file, a, preloadPath));
  const sweepCheck = deps.sweepCheck ?? defaultSweepCheck;
  const log = deps.log ?? ((l) => console.log(l));
  const error = deps.error ?? ((l) => console.error(l));
  const graceMs = deps.graceMs ?? KILL_GRACE_MS;

  /** @type {RunnerArgs} */
  let args;
  try {
    args = parseRunnerArgs(argv);
  } catch (err) {
    error(`examples:check: ${/** @type {Error} */ (err).message}`);
    return 2;
  }
  const tiers = tiersOf(env);
  if (args.write && !tiers.W) {
    error('examples:check: every --write pass needs RTLS_IT_WRITES=1 (set on the command line)');
    return 2;
  }
  const runIdEnv = env.RTLS_IT_RUN_ID;
  if (runIdEnv !== undefined && runIdEnv !== '' && !RUN_ID_RE.test(runIdEnv)) {
    error('examples:check: RTLS_IT_RUN_ID must be 8 lowercase hex characters');
    return 2;
  }
  const runId = runIdEnv || randomBytes(4).toString('hex');

  /** @type {Record<string, readonly string[]>} */
  const phaseNumbers = EXAMPLE_NUMBERS;
  const selected =
    args.ids.length > 0
      ? args.ids
      : args.phase !== undefined
        ? [...(phaseNumbers[args.phase] ?? [])]
        : headerIds(examplesDir);
  const mode = args.write ? 'write' : 'read-only';
  log(
    `examples:check: ${selected.length} selected${selected.length ? ` (${selected.join(', ')})` : ''}; ${mode} pass; run ${runId}`
  );
  if (selected.length === 0) return 0;

  const problem = preconditionProblem(root);
  if (problem) {
    error(`examples:check: ${problem}`);
    return 2;
  }
  const examples = selected.map((id) => loadExample(examplesDir, id));
  /** @param {Example} ex */
  const startable = (ex) =>
    ex.problem === null &&
    ex.header !== null &&
    ex.header.tier !== 'none' &&
    !(ex.header.tier === 'S' && !tiers.S) &&
    !(ex.header.tier === 'C' && !tiers.C);

  const token = newLockToken();
  /** @type {'run' | 'slot' | null} */
  let held = null;
  let registered = false;
  let configHeld = false;
  /** @type {Outcome[]} */
  const outcomes = [];
  let stopCode = 0;
  let passProblem = /** @type {string | null} */ (null);
  try {
    if (args.write) {
      if (tiers.S) {
        const refused = checkLedger(runId, EXAMPLES_SHARE, ledgerOptions);
        if (refused.length > 0) {
          error(
            `examples:check: write pass refused by the cumulative cap (${refused.join(', ')}); ledger-cap`
          );
          return 2;
        }
      }
      if (
        !(await acquireRunLock({ ...lockOptions, ...lockWait, token, holder: `examples ${runId}` }))
      ) {
        error('examples:check: the run lock is held by another run; no-run-lock');
        return 2;
      }
      held = 'run';
      registerRun(runId, { domain: 'examples', tiers }, lockOptions);
      registered = true;
      // A preflight.json left by an earlier pass or run of a reused run id is removed, so the pass's first write
      // process computes the preflight from the namespace's current state.
      rmSync(join(stateRoot, runId, 'preflight.json'), { force: true });
      if (examples.some((ex) => startable(ex) && ex.header?.tier === 'C')) {
        if (
          !(await acquireConfigLock({
            ...lockOptions,
            wait: false,
            token,
            holder: `examples ${runId}`,
          }))
        ) {
          error('examples:check: the config lock is held; no-config-lock');
          return 2;
        }
        configHeld = true;
      }
    } else if (!isUnreachableBaseUrl(env.RTLS_BASE_URL)) {
      if (
        !(await acquireReadSlot({
          ...lockOptions,
          ...lockWait,
          token,
          holder: `examples ${runId}`,
        }))
      ) {
        error('examples:check: no read slot is free; no-read-slot');
        return 2;
      }
      held = 'slot';
    }

    /** @type {NodeJS.ProcessEnv} */
    const childEnv = { ...env, RTLS_IT_RUN_ID: runId };
    if (held !== null) childEnv.RTLS_IT_INTERNAL_LOCK_TOKEN = token;
    else delete childEnv.RTLS_IT_INTERNAL_LOCK_TOKEN;
    const runDir = join(stateRoot, runId);
    const guardDir = join(runDir, 'guard');
    const pass = args.write ? 'write' : 'read';
    /** @type {Lang[]} */
    const langs = args.lang === 'both' ? ['ts', 'js'] : [args.lang];
    let writeChildren = 0;
    let guardSum = zeroBudget();

    outer: for (const ex of examples) {
      for (const lang of langs) {
        const started = Date.now();
        /** @param {Omit<Outcome, 'id' | 'lang' | 'pass' | 'ms'>} o */
        const record = (o) =>
          outcomes.push({ id: ex.id, lang, pass, ms: Date.now() - started, ...o });
        if (ex.problem !== null || ex.header === null || ex.basename === null) {
          record({ status: 'fail', reason: ex.problem ?? 'unreadable example' });
          continue;
        }
        if (args.write && ex.header.tier === 'none') {
          record({ status: 'skip', reason: 'no write section (tier none)' });
          continue;
        }
        if (args.write && !startable(ex)) {
          const flag = ex.header.tier === 'S' ? 'RTLS_IT_SIDE_EFFECTS' : 'RTLS_IT_CONFIG';
          record({ status: 'skip', reason: `tier ${ex.header.tier} needs ${flag}=1` });
          continue;
        }
        const file = /** @type {string} */ (lang === 'ts' ? ex.ts : ex.js);
        const childArgs = args.write ? ['--write'] : ex.args;
        const before = guardFiles(guardDir);
        const violationsBefore = unexpectedViolations(runDir);
        const refusalsBefore = budgetRefusals(runDir);
        const result = await runChild(childCommand(lang, file, childArgs), {
          cwd: examplesDir,
          env: childEnv,
          timeoutMs: args.timeoutS * 1000,
          graceMs,
          logPath: join(
            stateRoot,
            runId,
            'examples',
            `${ex.id}-${lang}${args.write ? '-write' : ''}.log`
          ),
        });
        const guard = guardRecordsSince(guardDir, before);
        const guardCounts = guard.counts;
        const violations = Math.max(
          unexpectedViolations(runDir) - violationsBefore,
          guard.violations
        );
        const refusals = budgetRefusals(runDir) - refusalsBefore;
        if (args.write) {
          writeChildren += 1;
          guardSum = addBudget(guardSum, guardCounts);
        }
        // An example exits 0 or 1 (through runExample); 2, 3 and 4 come from the preload or config.js and stop the
        // pass with the same code (2 precondition, e.g. a tier or RTLS_IT_INTERNAL_ key in .env).
        if (result.exitCode === 2 || result.exitCode === 3 || result.exitCode === 4) {
          record({
            status: 'fail',
            reason:
              result.exitCode === 2
                ? 'precondition (exit 2)'
                : result.exitCode === 3
                  ? 'credentials missing (exit 3)'
                  : 'configuration restore failed (exit 4)',
            guardCounts,
          });
          stopCode = result.exitCode;
          break outer;
        }
        const verdict = classify(
          { ...result, guardCounts, violations, budgetRefusals: refusals },
          { basename: ex.basename, header: ex.header },
          pass
        );
        record({ ...verdict, guardCounts });
      }
    }

    if (args.write && stopCode === 0) {
      const sweepEnv = { ...env, RTLS_IT_RUN_ID: runId, RTLS_IT_INTERNAL_LOCK_TOKEN: token };
      const sweepExit = await sweepCheck(runId, sweepEnv, root);
      if (sweepExit !== 0) passProblem = `own-run sweeper check exit ${sweepExit} (residue)`;
      else if (writeChildren > 0) {
        const entry = ledgerEntry(runId, ledgerOptions);
        if (entry === null) passProblem = 'no ledger entry for the pass';
        else if (!sameBudget({ ...zeroBudget(), ...entry.counts }, guardSum))
          passProblem = 'ledger entry differs from the guard counts';
      }
    }
    // A budget refusal (BudgetExceeded) fails the pass even when the example caught it.
    if (passProblem === null && budgetRefusals(runDir) > 0)
      passProblem = 'budget.json records a budget refusal';
  } finally {
    if (registered) deregisterRun(runId, lockOptions);
    if (configHeld) await releaseConfigLock(token, lockOptions);
    if (held === 'run') await releaseRunLock(token, lockOptions);
    else if (held === 'slot') await releaseReadSlot(token, lockOptions);
  }

  for (const o of outcomes) {
    log(`${o.id} ${o.lang} ${o.pass} ${o.status} ${o.ms}ms${o.reason ? ` ${o.reason}` : ''}`);
  }
  if (passProblem) error(`examples:check: write pass failed: ${passProblem}`);
  const count = (/** @type {Outcome['status']} */ s) =>
    outcomes.filter((o) => o.status === s).length;
  log(
    `examples:check: ${count('pass')} pass, ${count('skip')} skip, ${count('fail')} fail; logs in test/integration/.state/${runId}/examples/`
  );
  if (stopCode !== 0) return stopCode;
  return count('fail') > 0 || passProblem ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.exitCode = await main(process.argv.slice(2));
}
