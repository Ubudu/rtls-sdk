#!/usr/bin/env node
// `npm run test:integration` (P0 §6.1, LIVE-TESTING §2–§3): the driver of a live integration run.
//
//   node scripts/integration.mjs [<domain>…] [--phase Pn] [--record] [--filter <text>]
//
//   <domain>         harness, core, assets, positions-spatial, venues-navigation, dashboards-rules,
//                    notifications, etl, websocket (test/integration/websocket/ and test/websocket/**/*.int.test.ts);
//                    none = every domain
//   --phase Pn       the domain of phase Pn (P0 → harness, P1 → core, …, P8 → websocket)
//   --record         writes the `record` marker: recordFixture() writes fixtures in this run
//   --filter <text>  only tests whose name contains <text> (vitest -t)
//
// Steps: run id (`RTLS_IT_RUN_ID` when set, else random) → `.state/<runId>/selection.json` (the domains, read by
// global setup for the ledger share) → tier W, C or S: with S the cumulative ledger is checked first, then the run
// lock is taken with a fresh token for the whole run; tier R only: a read slot is taken with a fresh token (none
// for an unreachable base URL) → vitest with `RTLS_IT_RUN_ID` and `RTLS_IT_INTERNAL_LOCK_TOKEN`, coverage into
// `coverage-live/<runId>/` → `coverage-live/<runId>/sources.json` (sha256 of every src/** file at run start) and a
// copy of `report.json` → release.
//
// The driver never reads `.env` (global setup does, through the harness, and turns a tier or internal key found
// there into `report.json.abort = 'precondition'`); tier flags come only from its own environment. It prints no
// credential, namespace or response value.
//
// Exit: vitest's exit code, except 1 when `report.json.ok` is false; 2 when the run is refused (`ledger-cap`,
// `no-run-lock`, `no-read-slot`, `precondition`, or a usage error); 3 when `report.json.abort === 'no-credentials'`;
// 4 when a configuration restore failed (`restore-failed`).
import { spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { UsageError, parseArgs, parsePhase } from './lib/cli.mjs';
import { REPO_ROOT } from './lib/git.mjs';
import { DOMAINS, domainOfPhase } from './lib/ownership.mjs';
import { checkLedger, integrationShare } from '../test/integration/harness/ledger.mjs';
import {
  acquireReadSlot,
  acquireRunLock,
  newLockToken,
  releaseConfigLock,
  releaseReadSlot,
  releaseRunLock,
} from '../test/integration/harness/lock.mjs';
import { checkoutStateDir, readJsonFileSync } from '../test/integration/harness/state-io.mjs';

/** @typedef {'R' | 'W' | 'C' | 'S'} Tier */
/** @typedef {Record<Tier, boolean>} TierFlags */
/**
 * @typedef {{ runId?: string; ok?: boolean; abort?: string | null; tiers?: TierFlags;
 *   budgets?: Record<string, { used: number; limit: number }>; violations?: unknown[];
 *   stateDiff?: string; cleanup?: { done: number; failed: unknown[] };
 *   preflight?: { warnings?: string[] } }} ReportSummary
 */

/** Domain keys in CONVENTIONS §6 order. */
export const DOMAIN_KEYS = Object.freeze(Object.keys(DOMAINS));

/** Base URLs that reach no host (P0 G1; the same values as `UNREACHABLE_BASE_URLS` in policy.ts). */
export const UNREACHABLE_BASE_URLS = Object.freeze({
  refused: 'http://127.0.0.1:9/api',
  dns: 'https://rtls.invalid/api',
  blackhole: 'http://192.0.2.1/api',
});

const RUN_ID_RE = /^[0-9a-f]{8}$/;

/**
 * Tier flags of a process environment: R always; W, C and S only when their variable is exactly `'1'`.
 *
 * @param {NodeJS.ProcessEnv} env
 * @returns {TierFlags}
 */
export function tiersOf(env) {
  return {
    R: true,
    W: env.RTLS_IT_WRITES === '1',
    C: env.RTLS_IT_CONFIG === '1',
    S: env.RTLS_IT_SIDE_EFFECTS === '1',
  };
}

/**
 * True when `baseUrl` names one of the unreachable origins (no host is reached, so no read slot is taken).
 *
 * @param {string | undefined} baseUrl
 * @returns {boolean}
 */
export function isUnreachableBaseUrl(baseUrl) {
  if (!baseUrl) return false;
  let origin;
  try {
    origin = new URL(baseUrl).origin;
  } catch {
    return false;
  }
  return Object.values(UNREACHABLE_BASE_URLS).some((u) => new URL(u).origin === origin);
}

/**
 * Exit code of a finished run (P0 §6.1). `report` null: no report was written (vitest failed before global
 * setup, or global setup crashed) → vitest's code, at least 1.
 *
 * @param {ReportSummary | null} report
 * @param {number} vitestStatus
 * @returns {number}
 */
export function exitCodeFor(report, vitestStatus) {
  if (report === null) return vitestStatus === 0 ? 1 : vitestStatus;
  switch (report.abort) {
    case 'no-credentials':
      return 3;
    case 'ledger-cap':
    case 'no-run-lock':
    case 'no-read-slot':
    case 'precondition':
      return 2;
    case 'restore-failed':
      return 4;
    default:
      break;
  }
  if (report.ok !== true) return 1;
  return vitestStatus;
}

/**
 * The test folders (vitest path filters) of the selected domains; none = every live file.
 *
 * @param {readonly string[]} domains
 * @returns {string[]}
 */
export function domainFilters(domains) {
  /** @type {string[]} */
  const filters = [];
  for (const domain of domains) {
    if (domain === 'websocket') filters.push('test/integration/websocket/', 'test/websocket/');
    else filters.push(`test/integration/${domain}/`);
  }
  return filters;
}

/**
 * @typedef {{ domains: string[]; record: boolean; filter?: string }} DriverArgs
 */

/**
 * @param {readonly string[]} argv
 * @returns {DriverArgs}
 */
export function parseDriverArgs(argv) {
  const args = parseArgs(argv, { flags: ['record'], options: ['phase', 'filter'] });
  const phase = parsePhase(args.options.phase);
  /** @type {string[]} */
  const domains = [];
  for (const d of args.positionals) {
    if (!DOMAIN_KEYS.includes(d))
      throw new UsageError(`unknown domain ${d} (one of ${DOMAIN_KEYS.join(', ')})`);
    if (!domains.includes(d)) domains.push(d);
  }
  if (phase !== undefined) {
    const d = domainOfPhase(phase);
    if (d === undefined) throw new UsageError(`${phase} has no live domain`);
    if (!domains.includes(d)) domains.push(d);
  }
  const filter = args.options.filter;
  if (filter !== undefined && filter.trim() === '') throw new UsageError('--filter needs a text');
  return { domains, record: args.flags.record, ...(filter !== undefined ? { filter } : {}) };
}

/**
 * Run id: `RTLS_IT_RUN_ID` when set (8 lowercase hex, else a usage error), else 8 random hex.
 *
 * @param {NodeJS.ProcessEnv} env
 * @returns {string}
 */
export function runIdOf(env) {
  const value = env.RTLS_IT_RUN_ID;
  if (value === undefined || value === '') return randomBytes(4).toString('hex');
  if (!RUN_ID_RE.test(value))
    throw new UsageError('RTLS_IT_RUN_ID must be 8 lowercase hex characters');
  return value;
}

/**
 * sha256 of every file under `<root>/src` (repository-relative POSIX paths, sorted): `sources.json` of a run
 * (P0 §5.7 step 1 keeps, per file, only the runs made on the current version of that file).
 *
 * @param {string} root
 * @returns {{ version: 1; files: Record<string, string> }}
 */
export function sourceHashes(root) {
  /** @type {Record<string, string>} */
  const files = {};
  const srcDir = join(root, 'src');
  /** @param {string} dir */
  const walk = (dir) => {
    let names;
    try {
      names = readdirSync(dir).sort();
    } catch {
      return;
    }
    for (const name of names) {
      const path = join(dir, name);
      const st = statSync(path);
      if (st.isDirectory()) walk(path);
      else if (st.isFile()) {
        const rel = relative(root, path).split(sep).join('/');
        files[rel] = createHash('sha256').update(readFileSync(path)).digest('hex');
      }
    }
  };
  walk(srcDir);
  return { version: 1, files };
}

/**
 * @param {string} path
 * @param {unknown} value
 */
function writeJson(path, value) {
  mkdirSync(resolve(path, '..'), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

/**
 * @param {string[]} args
 * @param {NodeJS.ProcessEnv} env
 * @param {string} cwd
 * @returns {Promise<number>}
 */
function runVitestDefault(args, env, cwd) {
  const bin = join(cwd, 'node_modules', 'vitest', 'vitest.mjs');
  return new Promise((resolvePromise) => {
    const child = spawn(process.execPath, [bin, ...args], { cwd, env, stdio: 'inherit' });
    /** @param {NodeJS.Signals} signal */
    const forward = (signal) => {
      child.kill(signal);
    };
    process.on('SIGINT', forward);
    process.on('SIGTERM', forward);
    child.on('exit', (code, signal) => {
      process.off('SIGINT', forward);
      process.off('SIGTERM', forward);
      resolvePromise(code ?? (signal === 'SIGINT' ? 130 : signal === 'SIGTERM' ? 143 : 1));
    });
    child.on('error', () => resolvePromise(1));
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
 *   runVitest?: (args: string[], env: NodeJS.ProcessEnv, cwd: string) => Promise<number>;
 *   log?: (line: string) => void;
 *   error?: (line: string) => void;
 * }} DriverDeps
 */

/**
 * @param {readonly string[]} argv
 * @param {DriverDeps} [deps]
 * @returns {Promise<number>}
 */
export async function main(argv, deps = {}) {
  const root = deps.root ?? REPO_ROOT;
  const env = deps.env ?? process.env;
  const stateRoot = deps.stateRoot ?? checkoutStateDir();
  const lockOptions = deps.lockStateDir ? { stateDir: deps.lockStateDir } : {};
  const ledgerOptions = deps.ledgerPath ? { ledgerPath: deps.ledgerPath } : {};
  const lockWait = deps.lockWait ?? { wait: true };
  const runVitest = deps.runVitest ?? runVitestDefault;
  const log = deps.log ?? ((line) => console.log(line));
  const error = deps.error ?? ((line) => console.error(line));

  /** @type {DriverArgs} */
  let args;
  /** @type {string} */
  let runId;
  try {
    args = parseDriverArgs(argv);
    runId = runIdOf(env);
  } catch (err) {
    error(`test:integration: ${/** @type {Error} */ (err).message}`);
    return 2;
  }

  const tiers = tiersOf(env);
  const writeCapable = tiers.W || tiers.C || tiers.S;
  const enabled = /** @type {Tier[]} */ (['R', 'W', 'C', 'S']).filter((t) => tiers[t]).join('');
  const domainLabel = args.domains.length > 0 ? args.domains.join(', ') : 'all domains';
  const stateDir = join(stateRoot, runId);
  const coverageDir = join(root, 'coverage-live', runId);
  const sources = sourceHashes(root);

  writeJson(join(stateDir, 'selection.json'), { domains: args.domains });
  if (args.record) writeFileSync(join(stateDir, 'record'), '');

  if (tiers.S) {
    const refused = checkLedger(runId, integrationShare(args.domains), ledgerOptions);
    if (refused.length > 0) {
      error(
        `test:integration: run ${runId} refused by the cumulative cap (${refused.join(', ')}); ledger-cap`
      );
      return 2;
    }
  }

  const token = newLockToken();
  /** @type {'run' | 'slot' | null} */
  let held = null;
  if (writeCapable) {
    if (
      !(await acquireRunLock({
        ...lockOptions,
        ...lockWait,
        token,
        holder: `integration ${runId}`,
      }))
    ) {
      error(`test:integration: run ${runId}: the run lock is held by another run; no-run-lock`);
      return 2;
    }
    held = 'run';
  } else if (!isUnreachableBaseUrl(env.RTLS_BASE_URL)) {
    if (
      !(await acquireReadSlot({
        ...lockOptions,
        ...lockWait,
        token,
        holder: `integration ${runId}`,
      }))
    ) {
      error(`test:integration: run ${runId}: no read slot is free; no-read-slot`);
      return 2;
    }
    held = 'slot';
  }

  /** @type {{ status: number; report: ReportSummary | null }} */
  const result = { status: 1, report: null };
  try {
    const vitestArgs = [
      'run',
      '--config',
      'vitest.integration.config.ts',
      ...domainFilters(args.domains),
      ...(args.filter !== undefined ? ['-t', args.filter] : []),
      '--coverage.enabled=true',
      `--coverage.reportsDirectory=${relative(root, coverageDir).split(sep).join('/')}`,
    ];
    /** @type {NodeJS.ProcessEnv} */
    const childEnv = { ...env, RTLS_IT_RUN_ID: runId };
    if (held !== null) childEnv.RTLS_IT_INTERNAL_LOCK_TOKEN = token;
    else delete childEnv.RTLS_IT_INTERNAL_LOCK_TOKEN;
    log(`test:integration: run ${runId}, label ${runId}; ${domainLabel}; tiers ${enabled}`);
    result.status = await runVitest(vitestArgs, childEnv, root);

    writeJson(join(coverageDir, 'sources.json'), sources);
    const reportFile = join(stateDir, 'report.json');
    if (existsSync(reportFile)) {
      result.report = readJsonFileSync(reportFile, null);
      writeFileSync(join(coverageDir, 'report.json'), readFileSync(reportFile));
    }
  } finally {
    if (held === 'run') {
      await releaseConfigLock(token, lockOptions);
      await releaseRunLock(token, lockOptions);
    } else if (held === 'slot') {
      await releaseReadSlot(token, lockOptions);
    }
  }

  const { status, report } = result;
  const code = exitCodeFor(report, status);
  if (report === null) {
    error(`test:integration: run ${runId}: no report.json was written (vitest exit ${status})`);
  } else {
    const budgets = Object.entries(report.budgets ?? {})
      .map(([name, b]) => `${name} ${b.used}/${b.limit}`)
      .join(', ');
    log(
      `test:integration: run ${runId} ${report.ok ? 'ok' : 'FAILED'}; abort ${report.abort ?? 'none'}; ` +
        `violations ${report.violations?.length ?? 0}; stateDiff ${report.stateDiff ?? '?'}; ` +
        `cleanup ${report.cleanup?.done ?? 0} done, ${report.cleanup?.failed.length ?? 0} failed; budgets ${budgets}`
    );
    // §6.2 Rule preflight (U7): the warning names only, never a value; the orchestrator reads this line.
    const warnings = report.preflight?.warnings ?? [];
    if (warnings.length > 0)
      log(`test:integration: run ${runId} preflight warning: ${warnings.join(', ')}`);
    log(`test:integration: report and live coverage in coverage-live/${runId}/ (label ${runId})`);
  }
  return code;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.exitCode = await main(process.argv.slice(2));
}
