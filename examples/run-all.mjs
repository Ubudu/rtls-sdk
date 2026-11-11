#!/usr/bin/env node
// `npm run examples:all`: runs the example catalogue (examples/catalogue.json) under the example guard,
// read-only or, once, with --write; also checks the catalogue, the TS/JS parity and the index table of
// examples/README.md.
//
//   node examples/run-all.mjs [--write] [--only 01,20] [--lang ts|js|both] [--check-index | --write-index] [--list]
//
//   --only         example numbers, comma-separated (default: every catalogue entry; with --write the entries
//                  that have a write section)
//   --lang         default `both` for the read pass, `ts` with --write; `--write --lang js|both` exits 2
//   --write        the write sections, TypeScript twins only; needs RTLS_IT_WRITES=1, plus RTLS_IT_SIDE_EFFECTS=1
//                  for tier S and RTLS_IT_CONFIG=1 for tier C (an entry whose variable is missing is skipped: tier)
//   --check-index  exit 1 when the table between the catalogue markers of examples/README.md is stale
//   --write-index  rewrites that table
//   --list         prints the catalogue
//
// It reuses the runner pieces of `npm run examples:check` (scripts/examples/run.mjs) and the harness locks and
// ledger. A read pass holds one read slot (none for an unreachable base URL); a write pass checks the summed
// budgets against the examples
// share, holds the run lock (and the config lock for tier C), checks the cumulative ledger with S, records the
// state snapshot before the first entry, and afterwards runs the own-run sweeper check and the snapshot
// comparison and compares the ledger entry with the guard counts. Logs go to
// test/integration/.state/<runId>/examples/<id>-<lang>[-write].log; the console shows the summary only.
// Exit: 0 no failure, 1 a failure, 2 a precondition or usage problem (nothing ran), 3/4 as a child reported.
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import {
  createWriteStream,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { UsageError, parseArgs } from '../scripts/lib/cli.mjs';
import {
  KILL_GRACE_MS,
  PRELOAD_PATH,
  SKIP_CATEGORIES,
  budgetLines,
  budgetRefusals,
  classify as classifyChild,
  defaultChildCommand,
  defaultSweepCheck,
  parseArgsComment,
  parseHeader,
  preconditionProblem,
  unexpectedViolations,
  zeroBudget,
} from '../scripts/examples/run.mjs';
import { isUnreachableBaseUrl, tiersOf } from '../scripts/integration.mjs';
import { EXAMPLES_SHARE, checkLedger, ledgerEntry } from '../test/integration/harness/ledger.mjs';
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
} from '../test/integration/harness/lock.mjs';
import { checkoutStateDir } from '../test/integration/harness/state-io.mjs';

/** @typedef {'positions' | 'notifications' | 'bleActions' | 'etlWrites'} BudgetName */
/** @typedef {Record<BudgetName, number>} Budget */
/** @typedef {'feature-off' | 'role' | 'tier' | 'no-fixture' | 'preflight'} SkipCategory */
/** @typedef {'ts' | 'js'} Lang */
/**
 * @typedef {{ tier: 'W' | 'C' | 'S'; budget: Budget; creates: string }} WriteSection
 * @typedef {{ id: string; name: string; title: string; summary: string;
 *   owner: 'P2' | 'P3' | 'P4' | 'P5' | 'P6' | 'P7' | 'P8' | 'P9'; guide: string; recipe?: string;
 *   readAllowedSkips: SkipCategory[]; write: WriteSection | null; timeoutMs?: number }} CatalogueEntry
 * @typedef {{ examples: CatalogueEntry[] }} Catalogue
 * @typedef {{ exitCode: number | null; timedOut: boolean; stdout: string; guardCounts?: Budget;
 *   violations?: number; budgetRefusals?: number }} RunResult
 * @typedef {{ status: 'pass' | 'skip' | 'fail'; reason?: string; budgetUsed?: Budget }} Verdict
 * @typedef {{ id: string; lang: Lang; pass: 'read' | 'write'; status: 'pass' | 'skip' | 'fail';
 *   reason?: string; ms: number; guardCounts?: Budget }} Outcome
 */

export const EXAMPLES_DIR = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = resolve(EXAMPLES_DIR, '..');
export const CATALOGUE_PATH = join(EXAMPLES_DIR, 'catalogue.json');
export const DEFAULT_ENTRY_TIMEOUT_MS = 90_000;
export const INDEX_START = '<!-- catalogue:start -->';
export const INDEX_END = '<!-- catalogue:end -->';

/** @type {readonly BudgetName[]} */
const BUDGET_NAMES = ['positions', 'notifications', 'bleActions', 'etlWrites'];
const OWNERS = ['P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8', 'P9'];
const ENTRY_KEYS = [
  'id',
  'name',
  'title',
  'summary',
  'owner',
  'guide',
  'recipe',
  'readAllowedSkips',
  'write',
  'timeoutMs',
];
const WRITE_KEYS = ['tier', 'budget', 'creates'];
const ID_RE = /^\d{2}$/;
const NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const RUN_ID_RE = /^[0-9a-f]{8}$/;
const FILE_RE = /^(\d{2})-(.+)\.(ts|js)$/;

/**
 * @param {Budget} a
 * @param {Partial<Budget>} b
 * @returns {Budget}
 */
function addBudget(a, b) {
  /** @type {Budget} */
  const out = { ...a };
  for (const n of BUDGET_NAMES) out[n] += typeof b[n] === 'number' ? b[n] : 0;
  return out;
}

/**
 * @param {Budget} a
 * @param {Budget} b
 */
const sameBudget = (a, b) => BUDGET_NAMES.every((n) => a[n] === b[n]);

/** @param {unknown} v */
const isObject = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Validation problems of a parsed catalogue; [] when it is valid.
 *
 * @param {unknown} data
 * @returns {string[]}
 */
export function catalogueProblems(data) {
  /** @type {string[]} */
  const problems = [];
  if (!isObject(data) || !Array.isArray(/** @type {any} */ (data).examples))
    return ['the catalogue must be an object with an `examples` array'];
  const extra = Object.keys(/** @type {object} */ (data)).filter((k) => k !== 'examples');
  if (extra.length > 0) problems.push(`unknown top-level key(s): ${extra.join(', ')}`);
  const ids = new Set();
  /** @type {unknown[]} */
  const examples = /** @type {any} */ (data).examples;
  examples.forEach((raw, i) => {
    if (!isObject(raw)) {
      problems.push(`entry ${i}: not an object`);
      return;
    }
    const e = /** @type {Record<string, unknown>} */ (raw);
    const at = `entry ${typeof e.id === 'string' ? e.id : i}`;
    for (const k of Object.keys(e))
      if (!ENTRY_KEYS.includes(k)) problems.push(`${at}: unknown key ${k}`);
    if (typeof e.id !== 'string' || !ID_RE.test(e.id))
      problems.push(`${at}: id must be two digits`);
    else if (ids.has(e.id)) problems.push(`${at}: duplicate id`);
    else ids.add(e.id);
    if (typeof e.name !== 'string' || !NAME_RE.test(e.name))
      problems.push(`${at}: name must be kebab-case`);
    for (const k of ['title', 'summary', 'guide']) {
      if (typeof e[k] !== 'string' || /** @type {string} */ (e[k]).trim() === '')
        problems.push(`${at}: ${k} must be a non-empty string`);
    }
    if (typeof e.owner !== 'string' || !OWNERS.includes(e.owner))
      problems.push(`${at}: owner must be one of ${OWNERS.join(', ')}`);
    if (
      e.recipe !== undefined &&
      (typeof e.recipe !== 'string' || !/^docs\/recipes\/[a-z0-9-]+\.md$/.test(e.recipe))
    )
      problems.push(`${at}: recipe must be docs/recipes/<name>.md`);
    if (
      !Array.isArray(e.readAllowedSkips) ||
      !e.readAllowedSkips.every((s) => typeof s === 'string' && SKIP_CATEGORIES.includes(s))
    )
      problems.push(
        `${at}: readAllowedSkips must list skip categories (${SKIP_CATEGORIES.join(', ')})`
      );
    if (
      e.timeoutMs !== undefined &&
      !(typeof e.timeoutMs === 'number' && e.timeoutMs > 0 && Number.isFinite(e.timeoutMs))
    )
      problems.push(`${at}: timeoutMs must be a positive number`);
    if (e.write === undefined) problems.push(`${at}: write must be null or a write section`);
    else if (e.write !== null) {
      if (!isObject(e.write)) {
        problems.push(`${at}: write must be null or an object`);
        return;
      }
      const w = /** @type {Record<string, unknown>} */ (e.write);
      for (const k of Object.keys(w))
        if (!WRITE_KEYS.includes(k)) problems.push(`${at}: write has an unknown key ${k}`);
      if (w.tier !== 'W' && w.tier !== 'C' && w.tier !== 'S')
        problems.push(`${at}: write.tier must be W, C or S`);
      if (typeof w.creates !== 'string' || w.creates.trim() === '')
        problems.push(`${at}: write.creates must be a non-empty string`);
      if (!isObject(w.budget)) problems.push(`${at}: write.budget must be an object`);
      else {
        const b = /** @type {Record<string, unknown>} */ (w.budget);
        for (const k of Object.keys(b))
          if (!(/** @type {readonly string[]} */ (BUDGET_NAMES).includes(k)))
            problems.push(`${at}: write.budget has an unknown key ${k}`);
        for (const n of BUDGET_NAMES) {
          const v = b[n];
          if (typeof v !== 'number' || !Number.isInteger(v) || v < 0)
            problems.push(`${at}: write.budget.${n} must be a non-negative integer`);
        }
      }
    }
  });
  return problems;
}

/**
 * Loads and validates the catalogue; throws an Error listing the problems.
 *
 * @param {string} [file]
 * @returns {Catalogue}
 */
export function loadCatalogue(file = CATALOGUE_PATH) {
  /** @type {unknown} */
  let data;
  try {
    data = JSON.parse(readFileSync(file, 'utf8'));
  } catch (err) {
    throw new Error(`${file}: ${/** @type {Error} */ (err).message}`, { cause: err });
  }
  const problems = catalogueProblems(data);
  if (problems.length > 0)
    throw new Error(`${file}: invalid catalogue\n- ${problems.join('\n- ')}`);
  const catalogue = /** @type {Catalogue} */ (data);
  return {
    examples: [...catalogue.examples].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)),
  };
}

/**
 * Source text without comments (string and template literals kept).
 *
 * @param {string} text
 * @returns {string}
 */
export function stripComments(text) {
  let out = '';
  let i = 0;
  /** @type {string | null} */
  let quote = null;
  while (i < text.length) {
    const c = /** @type {string} */ (text[i]);
    const next = text[i + 1];
    if (quote !== null) {
      out += c;
      if (c === '\\') {
        out += next ?? '';
        i += 2;
        continue;
      }
      if (c === quote) quote = null;
      i += 1;
      continue;
    }
    if (c === '/' && next === '/') {
      while (i < text.length && text[i] !== '\n') i += 1;
      continue;
    }
    if (c === '/' && next === '*') {
      const end = text.indexOf('*/', i + 2);
      i = end === -1 ? text.length : end + 2;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') quote = c;
    out += c;
    i += 1;
  }
  return out;
}

/**
 * Ordered `client.<path>(`, `reportBudget(` and `skip(` calls after the first `config.write` check (comments and
 * type arguments ignored), or null when the source has no `config.write` check.
 *
 * @param {string} source
 * @returns {string[] | null}
 */
export function writeSectionCalls(source) {
  const code = stripComments(source);
  const at = code.search(/\bconfig\.write\b/);
  if (at === -1) return null;
  const rest = code.slice(at);
  /** @type {string[]} */
  const calls = [];
  const re =
    /(?<![\w$.])(client(?:\s*\.\s*[A-Za-z_$][\w$]*)+|reportBudget|skip)\s*(?:<[^()]*?>)?\s*\(/g;
  for (const m of rest.matchAll(re)) {
    const name = /** @type {string} */ (m[1]).replace(/\s+/g, '');
    calls.push(`${name}(`);
  }
  return calls;
}

/**
 * `<dir>/<lang>` numbered example files as `{ id, name }` keyed by `<id>-<name>`.
 *
 * @param {string} dir
 * @param {'ts' | 'js'} ext
 * @returns {Map<string, { id: string; name: string; file: string }>}
 */
function numberedFiles(dir, ext) {
  const out = new Map();
  /** @type {string[]} */
  let names;
  try {
    names = readdirSync(dir);
  } catch {
    return out;
  }
  for (const n of names.sort()) {
    const m = FILE_RE.exec(n);
    if (!m || m[3] !== ext) continue;
    out.set(`${m[1]}-${m[2]}`, {
      id: /** @type {string} */ (m[1]),
      name: /** @type {string} */ (m[2]),
      file: join(dir, n),
    });
  }
  return out;
}

/**
 * TS/JS/catalogue agreement; [] when they agree.
 *
 * @param {Catalogue} catalogue
 * @param {string} examplesDir
 * @returns {string[]}
 */
export function checkParity(catalogue, examplesDir) {
  /** @type {string[]} */
  const problems = [];
  const ts = numberedFiles(join(examplesDir, 'typescript'), 'ts');
  const js = numberedFiles(join(examplesDir, 'javascript'), 'js');
  const known = new Set(catalogue.examples.map((e) => `${e.id}-${e.name}`));
  for (const [base] of ts)
    if (!known.has(base)) problems.push(`typescript/${base}.ts is not in the catalogue`);
  for (const [base] of js)
    if (!known.has(base)) problems.push(`javascript/${base}.js is not in the catalogue`);
  for (const e of catalogue.examples) {
    const base = `${e.id}-${e.name}`;
    const t = ts.get(base);
    const j = js.get(base);
    if (!t) problems.push(`${e.id}: typescript/${base}.ts is missing`);
    if (!j) problems.push(`${e.id}: javascript/${base}.js is missing`);
    if (!t || !j || e.write === null) continue;
    const tsText = readFileSync(t.file, 'utf8');
    const jsText = readFileSync(j.file, 'utf8');
    if ((tsText.split('\n')[0] ?? '') !== (jsText.split('\n')[0] ?? ''))
      problems.push(`${e.id}: the TypeScript and JavaScript first lines differ`);
    const tsCalls = writeSectionCalls(tsText);
    const jsCalls = writeSectionCalls(jsText);
    if (tsCalls === null) problems.push(`${e.id}: typescript/${base}.ts has no config.write check`);
    if (jsCalls === null) problems.push(`${e.id}: javascript/${base}.js has no config.write check`);
    if (tsCalls !== null && jsCalls !== null && tsCalls.join(' ') !== jsCalls.join(' '))
      problems.push(
        `${e.id}: write-section calls differ (typescript: ${tsCalls.join(' ') || 'none'}; javascript: ${jsCalls.join(' ') || 'none'})`
      );
  }
  return problems;
}

/** @param {string} text */
const mdCell = (text) => text.replace(/\|/g, '\\|');

/**
 * @param {WriteSection | null} w
 * @returns {string}
 */
function writeCell(w) {
  if (w === null) return 'read-only';
  const parts = BUDGET_NAMES.filter((n) => w.budget[n] > 0).map((n) => `${n} ${w.budget[n]}`);
  return `\`--write\` tier ${w.tier}${parts.length > 0 ? ` (${parts.join(', ')})` : ''}`;
}

/**
 * The index table of examples/README.md (the text between the catalogue markers, without them).
 *
 * @param {Catalogue} catalogue
 * @returns {string}
 */
export function renderIndex(catalogue) {
  const lines = [
    '| # | Example | Main SDK calls | Guide | TypeScript | JavaScript | Write section |',
    '|---|---|---|---|---|---|---|',
  ];
  for (const e of catalogue.examples) {
    const base = `${e.id}-${e.name}`;
    const title = e.recipe ? `[${mdCell(e.title)}](../${e.recipe})` : mdCell(e.title);
    const guideName = e.guide.split('/').at(-1) ?? e.guide;
    lines.push(
      `| ${e.id} | ${title} | ${mdCell(e.summary)} | [${mdCell(guideName)}](../${e.guide}) | [${base}.ts](typescript/${base}.ts) | [${base}.js](javascript/${base}.js) | ${writeCell(e.write)} |`
    );
  }
  return `${lines.join('\n')}\n`;
}

/**
 * The README text with the index block replaced, or null when the markers are missing.
 *
 * @param {string} readme
 * @param {string} index
 * @returns {string | null}
 */
export function replaceIndex(readme, index) {
  const start = readme.indexOf(INDEX_START);
  const end = readme.indexOf(INDEX_END);
  if (start === -1 || end === -1 || end < start) return null;
  return `${readme.slice(0, start + INDEX_START.length)}\n${index}${readme.slice(end)}`;
}

/**
 * The index block of a README (between the markers), or null when the markers are missing.
 *
 * @param {string} readme
 * @returns {string | null}
 */
export function indexBlock(readme) {
  const start = readme.indexOf(INDEX_START);
  const end = readme.indexOf(INDEX_END);
  if (start === -1 || end === -1 || end < start) return null;
  return readme.slice(start + INDEX_START.length, end).replace(/^\n/, '');
}

/**
 * Sum of the write budgets of the entries (one TypeScript run each).
 *
 * @param {CatalogueEntry[]} entries
 * @returns {Budget}
 */
export function sumBudgets(entries) {
  let sum = zeroBudget();
  for (const e of entries) if (e.write) sum = addBudget(sum, e.write.budget);
  return sum;
}

/**
 * The problem of an example's first line against its catalogue entry (the `// Write section:` header: tier,
 * budget and read skips must equal the entry's `write` and `readAllowedSkips`), or null.
 *
 * @param {CatalogueEntry} entry
 * @param {string} firstLine
 * @returns {string | null}
 */
export function entryHeaderProblem(entry, firstLine) {
  if (!firstLine.startsWith('// Write section:'))
    return 'the first line is not a `// Write section:` header';
  const h = parseHeader(firstLine);
  if (h === null)
    return 'the Write section header is malformed (tier, budget and read skips clauses)';
  const tier = entry.write?.tier ?? 'none';
  if (h.tier !== tier) return `the header says tier ${h.tier}, the catalogue ${tier}`;
  if (!sameBudget(h.budget, entry.write?.budget ?? zeroBudget()))
    return 'the header budget differs from the catalogue';
  const skips = (/** @type {string[]} */ l) => [...l].sort().join(',');
  if (skips(h.readSkips) !== skips(entry.readAllowedSkips))
    return 'the header read skips differ from the catalogue readAllowedSkips';
  return null;
}

/**
 * Classifies one entry run with the rules of `npm run examples:check`: markers, timeout, budgets, guard counts, and
 * the guard violations and budget refusals recorded while it ran (each fails the entry).
 *
 * @param {RunResult} r
 * @param {CatalogueEntry} entry
 * @param {'read' | 'write'} pass
 * @returns {Verdict}
 */
export function classify(r, entry, pass) {
  const guardCounts = r.guardCounts ?? zeroBudget();
  const header = {
    tier: entry.write?.tier ?? /** @type {const} */ ('none'),
    budget: entry.write?.budget ?? zeroBudget(),
    readSkips: entry.readAllowedSkips,
  };
  /** @type {Verdict} */
  const verdict = classifyChild(
    {
      exitCode: r.exitCode,
      timedOut: r.timedOut,
      stdout: r.stdout,
      pid: null,
      guardCounts,
      ...(r.violations !== undefined ? { violations: r.violations } : {}),
      ...(r.budgetRefusals !== undefined ? { budgetRefusals: r.budgetRefusals } : {}),
    },
    { basename: `${entry.id}-${entry.name}`, header },
    pass
  );
  if (pass === 'write' && verdict.status !== 'fail')
    verdict.budgetUsed = budgetLines(r.stdout) ?? zeroBudget();
  return verdict;
}

/**
 * argv of the npm commands around a write pass (snapshot before; sweeper check and snapshot comparison after).
 *
 * @param {string} runId
 * @returns {{ snapshotBefore: string[]; sweep: string[]; snapshotAfter: string[] }}
 */
export function writePassCommands(runId) {
  const before = `examples-${runId}-before`;
  return {
    snapshotBefore: ['npm', 'run', 'test:integration:snapshot', '--', '--label', before],
    sweep: ['npm', 'run', 'test:integration:sweep', '--', '--check', '--run', runId, '--force'],
    snapshotAfter: [
      'npm',
      'run',
      'test:integration:snapshot',
      '--',
      '--label',
      `examples-${runId}-after`,
      '--compare',
      before,
    ],
  };
}

/**
 * Verdict of the after-pass checks of a write pass.
 *
 * @param {{ sweepExit: number; compareExit: number; ledgerCounts: Budget | null; guardSum: Budget }} r
 * @returns {{ ok: boolean; problems: string[] }}
 */
export function afterPassVerdict(r) {
  /** @type {string[]} */
  const problems = [];
  if (r.sweepExit !== 0) problems.push('residue');
  if (r.compareExit !== 0) problems.push('state difference');
  if (r.ledgerCounts === null || !sameBudget({ ...zeroBudget(), ...r.ledgerCounts }, r.guardSum))
    problems.push('ledger differs from guard counts');
  return { ok: problems.length === 0, problems };
}

/**
 * Runs one of those npm commands (argv[0] = npm) from `cwd`; resolves with its exit code (a spawn error or a
 * signal → 1).
 *
 * @param {string[]} argv
 * @param {NodeJS.ProcessEnv} env
 * @param {string} cwd
 * @returns {Promise<number>}
 */
export function defaultCommand(argv, env, cwd) {
  const [cmd, ...rest] = argv;
  const command =
    cmd === 'npm' && process.platform === 'win32' ? 'npm.cmd' : /** @type {string} */ (cmd);
  return new Promise((resolvePromise) => {
    const child = spawn(command, rest, { cwd, env, stdio: ['ignore', 'inherit', 'inherit'] });
    child.on('error', () => resolvePromise(1));
    child.on('close', (code) => resolvePromise(code ?? 1));
  });
}

/**
 * @param {{ command: string; args: string[] }} cmd
 * @param {{ cwd: string; env: NodeJS.ProcessEnv; timeoutMs: number; graceMs: number; logPath: string }} o
 * @returns {Promise<{ exitCode: number | null; timedOut: boolean; stdout: string }>}
 */
function runChild(cmd, o) {
  return new Promise((resolvePromise) => {
    mkdirSync(dirname(o.logPath), { recursive: true });
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
      resolvePromise({ exitCode: code, timedOut, stdout });
    };
    child.on('error', () => finish(1));
    child.on('close', (code) => finish(code));
  });
}

/**
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
 * Counts and violations of every guard file written while an entry ran.
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
 *   snapshot?: (argv: string[], env: NodeJS.ProcessEnv, cwd: string) => Promise<number>;
 *   graceMs?: number;
 *   log?: (line: string) => void;
 *   error?: (line: string) => void;
 * }} RunAllDeps
 */

/**
 * @param {readonly string[]} argv
 * @returns {{ write: boolean; only: string[]; lang: 'ts' | 'js' | 'both'; checkIndex: boolean; writeIndex: boolean; list: boolean }}
 */
export function parseRunAllArgs(argv) {
  const a = parseArgs(argv, {
    flags: ['write', 'check-index', 'write-index', 'list'],
    options: ['only', 'lang'],
  });
  if (a.positionals.length > 0) throw new UsageError(`unexpected argument ${a.positionals[0]}`);
  const write = a.flags.write;
  const lang = a.options.lang ?? (write ? 'ts' : 'both');
  if (lang !== 'ts' && lang !== 'js' && lang !== 'both')
    throw new UsageError(`--lang must be ts, js or both (got ${lang})`);
  if (write && lang !== 'ts')
    throw new UsageError(`--write runs the TypeScript twins only (--lang ${lang} refused)`);
  if (a.flags['check-index'] && a.flags['write-index'])
    throw new UsageError('--check-index and --write-index exclude each other');
  const only = a.options.only === undefined ? [] : a.options.only.split(',').map((s) => s.trim());
  for (const id of only)
    if (!ID_RE.test(id))
      throw new UsageError(`--only takes example numbers such as 01,20 (got ${id})`);
  return {
    write,
    only: [...new Set(only)],
    lang,
    checkIndex: a.flags['check-index'],
    writeIndex: a.flags['write-index'],
    list: a.flags.list,
  };
}

/**
 * @param {readonly string[]} argv
 * @param {RunAllDeps} [deps]
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
  const sweepCheck = deps.sweepCheck ?? defaultSweepCheck;
  const snapshot = deps.snapshot ?? defaultCommand;
  const graceMs = deps.graceMs ?? KILL_GRACE_MS;
  const log = deps.log ?? ((l) => console.log(l));
  const error = deps.error ?? ((l) => console.error(l));

  /** @type {ReturnType<typeof parseRunAllArgs>} */
  let args;
  try {
    args = parseRunAllArgs(argv);
  } catch (err) {
    error(`examples:all: ${/** @type {Error} */ (err).message}`);
    return 2;
  }
  const tiers = tiersOf(env);
  if (args.write && !tiers.W) {
    error('examples:all: every --write pass needs RTLS_IT_WRITES=1 (set on the command line)');
    return 2;
  }

  /** @type {Catalogue} */
  let catalogue;
  try {
    catalogue = loadCatalogue(join(examplesDir, 'catalogue.json'));
  } catch (err) {
    error(`examples:all: ${/** @type {Error} */ (err).message}`);
    return 1;
  }
  if (args.list) {
    for (const e of catalogue.examples)
      log(
        `${e.id} ${e.name} ${e.owner} ${e.write ? `write tier ${e.write.tier}` : 'read-only'} ${e.title}`
      );
    return 0;
  }
  const parity = checkParity(catalogue, examplesDir);
  if (parity.length > 0) {
    for (const p of parity) error(`examples:all: parity: ${p}`);
    return 1;
  }
  if (args.checkIndex || args.writeIndex) {
    const readmePath = join(examplesDir, 'README.md');
    const readme = existsSync(readmePath) ? readFileSync(readmePath, 'utf8') : '';
    const index = renderIndex(catalogue);
    if (args.writeIndex) {
      const next = replaceIndex(readme, index);
      if (next === null) {
        error(`examples:all: examples/README.md has no ${INDEX_START} … ${INDEX_END} block`);
        return 1;
      }
      writeFileSync(readmePath, next);
      log('examples:all: examples/README.md index written');
      return 0;
    }
    const block = indexBlock(readme);
    if (block !== index) {
      error('examples:all: the examples/README.md index is out of date (run with --write-index)');
      return 1;
    }
    log('examples:all: examples/README.md index is up to date');
    return 0;
  }

  const runIdEnv = env.RTLS_IT_RUN_ID;
  if (runIdEnv !== undefined && runIdEnv !== '' && !RUN_ID_RE.test(runIdEnv)) {
    error('examples:all: RTLS_IT_RUN_ID must be 8 lowercase hex characters');
    return 2;
  }
  const runId = runIdEnv || randomBytes(4).toString('hex');
  const byId = new Map(catalogue.examples.map((e) => [e.id, e]));
  for (const id of args.only) {
    if (!byId.has(id)) {
      error(`examples:all: --only ${id} is not in the catalogue`);
      return 2;
    }
  }
  const chosen =
    args.only.length > 0
      ? catalogue.examples.filter((e) => args.only.includes(e.id))
      : catalogue.examples;
  const selected = args.write ? chosen.filter((e) => e.write !== null) : chosen;
  const pass = args.write ? 'write' : 'read';
  log(
    `examples:all: ${selected.length} selected${selected.length ? ` (${selected.map((e) => e.id).join(', ')})` : ''}; ${pass} pass; run ${runId}`
  );
  if (selected.length === 0) return 0;

  const problem = preconditionProblem(root);
  if (problem) {
    error(`examples:all: ${problem}`);
    return 2;
  }
  const guarded = existsSync(preloadPath);
  if (!guarded && args.write) {
    error(
      'examples:all: the example guard (test/integration/harness/preload.mjs) is missing; --write refused'
    );
    return 2;
  }
  const childCommand =
    deps.childCommand ??
    ((/** @type {Lang} */ lang, /** @type {string} */ file, /** @type {string[]} */ a) =>
      guarded
        ? defaultChildCommand(lang, file, a, preloadPath)
        : lang === 'ts'
          ? { command: process.platform === 'win32' ? 'npx.cmd' : 'npx', args: ['tsx', file, ...a] }
          : { command: process.execPath, args: [file, ...a] });

  /** @param {CatalogueEntry} e */
  const startable = (e) =>
    e.write !== null && !(e.write.tier === 'S' && !tiers.S) && !(e.write.tier === 'C' && !tiers.C);

  const token = newLockToken();
  /** @type {'run' | 'slot' | null} */
  let held = null;
  let registered = false;
  let configHeld = false;
  /** @type {Outcome[]} */
  const outcomes = [];
  let stopCode = 0;
  /** @type {string[]} */
  let passProblems = [];
  const runDir = join(stateRoot, runId);
  try {
    if (args.write) {
      const sum = sumBudgets(selected);
      const over = BUDGET_NAMES.filter((n) => sum[n] > (EXAMPLES_SHARE[n] ?? 0));
      if (over.length > 0) {
        error(
          `examples:all: the selected write budgets exceed the examples share (${over.join(', ')}); budget-share`
        );
        return 2;
      }
      if (
        !(await acquireRunLock({
          ...lockOptions,
          ...lockWait,
          token,
          holder: `examples:all ${runId}`,
        }))
      ) {
        error('examples:all: the run lock is held by another run; no-run-lock');
        return 2;
      }
      held = 'run';
      registerRun(runId, { domain: 'examples', tiers }, lockOptions);
      registered = true;
      if (selected.some((e) => startable(e) && e.write?.tier === 'C')) {
        if (
          !(await acquireConfigLock({
            ...lockOptions,
            wait: false,
            token,
            holder: `examples:all ${runId}`,
          }))
        ) {
          error('examples:all: the config lock is held; no-config-lock');
          return 2;
        }
        configHeld = true;
      }
      if (tiers.S) {
        const refused = checkLedger(runId, EXAMPLES_SHARE, ledgerOptions);
        if (refused.length > 0) {
          error(
            `examples:all: write pass refused by the cumulative cap (${refused.join(', ')}); ledger-cap`
          );
          return 2;
        }
      }
      const before = await snapshot(
        writePassCommands(runId).snapshotBefore,
        { ...env, RTLS_IT_RUN_ID: runId, RTLS_IT_INTERNAL_LOCK_TOKEN: token },
        root
      );
      if (before !== 0) {
        error(
          `examples:all: the state snapshot before the pass failed (exit ${before}); no-snapshot`
        );
        return 2;
      }
    } else if (!isUnreachableBaseUrl(env.RTLS_BASE_URL)) {
      if (
        !(await acquireReadSlot({
          ...lockOptions,
          ...lockWait,
          token,
          holder: `examples:all ${runId}`,
        }))
      ) {
        error('examples:all: no read slot is free; no-read-slot');
        return 2;
      }
      held = 'slot';
    }

    /** @type {NodeJS.ProcessEnv} */
    const childEnv = { ...env, RTLS_IT_RUN_ID: runId };
    if (held !== null) childEnv.RTLS_IT_INTERNAL_LOCK_TOKEN = token;
    else delete childEnv.RTLS_IT_INTERNAL_LOCK_TOKEN;
    const guardDir = join(runDir, 'guard');
    /** @type {Lang[]} */
    const langs = args.lang === 'both' ? ['ts', 'js'] : [args.lang];
    let writeChildren = 0;
    let guardSum = zeroBudget();

    outer: for (const e of selected) {
      for (const lang of langs) {
        const started = Date.now();
        /** @param {Omit<Outcome, 'id' | 'lang' | 'pass' | 'ms'>} o */
        const record = (o) =>
          outcomes.push({ id: e.id, lang, pass, ms: Date.now() - started, ...o });
        if (args.write && !startable(e)) {
          const flag = e.write?.tier === 'S' ? 'RTLS_IT_SIDE_EFFECTS' : 'RTLS_IT_CONFIG';
          record({ status: 'skip', reason: `tier ${e.write?.tier} needs ${flag}=1` });
          continue;
        }
        const file = join(
          examplesDir,
          lang === 'ts' ? 'typescript' : 'javascript',
          `${e.id}-${e.name}.${lang}`
        );
        const text = readFileSync(file, 'utf8');
        const headerProblem = entryHeaderProblem(e, text.split('\n')[0] ?? '');
        if (headerProblem !== null) {
          record({ status: 'fail', reason: headerProblem });
          continue;
        }
        const childArgs = args.write ? ['--write'] : parseArgsComment(text);
        const before = guardFiles(guardDir);
        const violationsBefore = unexpectedViolations(runDir);
        const refusalsBefore = budgetRefusals(runDir);
        const result = await runChild(childCommand(lang, file, childArgs), {
          cwd: examplesDir,
          env: childEnv,
          timeoutMs: e.timeoutMs ?? DEFAULT_ENTRY_TIMEOUT_MS,
          graceMs,
          logPath: join(runDir, 'examples', `${e.id}-${lang}${args.write ? '-write' : ''}.log`),
        });
        const guard = guardRecordsSince(guardDir, before);
        const violations = Math.max(
          unexpectedViolations(runDir) - violationsBefore,
          guard.violations
        );
        const refusals = budgetRefusals(runDir) - refusalsBefore;
        if (args.write) {
          writeChildren += 1;
          guardSum = addBudget(guardSum, guard.counts);
        }
        if (result.exitCode === 2 || result.exitCode === 3 || result.exitCode === 4) {
          record({
            status: 'fail',
            reason:
              result.exitCode === 2
                ? 'precondition (exit 2)'
                : result.exitCode === 3
                  ? 'credentials missing (exit 3)'
                  : 'configuration restore failed (exit 4)',
            guardCounts: guard.counts,
          });
          stopCode = result.exitCode;
          break outer;
        }
        const verdict = classify(
          { ...result, guardCounts: guard.counts, violations, budgetRefusals: refusals },
          e,
          pass
        );
        record({
          status: verdict.status,
          ...(verdict.reason ? { reason: verdict.reason } : {}),
          guardCounts: guard.counts,
        });
      }
    }

    if (args.write && stopCode === 0) {
      const passEnv = { ...env, RTLS_IT_RUN_ID: runId, RTLS_IT_INTERNAL_LOCK_TOKEN: token };
      const sweepExit = await sweepCheck(runId, passEnv, root);
      const compareExit = await snapshot(writePassCommands(runId).snapshotAfter, passEnv, root);
      const entry = ledgerEntry(runId, ledgerOptions);
      /** @type {Budget | null} */
      const ledgerCounts = entry
        ? { ...zeroBudget(), ...entry.counts }
        : writeChildren === 0
          ? zeroBudget()
          : null;
      const verdict = afterPassVerdict({ sweepExit, compareExit, ledgerCounts, guardSum });
      passProblems = verdict.problems;
      log(
        `examples:all: write pass spend (guard) positions=${guardSum.positions} notifications=${guardSum.notifications} ble=${guardSum.bleActions} etl=${guardSum.etlWrites}; ledger ${ledgerCounts ? `positions=${ledgerCounts.positions} notifications=${ledgerCounts.notifications} ble=${ledgerCounts.bleActions} etl=${ledgerCounts.etlWrites}` : 'missing'}`
      );
    }
    if (budgetRefusals(runDir) > 0) passProblems = [...passProblems, 'budget refusal recorded'];
  } finally {
    if (registered) deregisterRun(runId, lockOptions);
    if (configHeld) await releaseConfigLock(token, lockOptions);
    if (held === 'run') await releaseRunLock(token, lockOptions);
    else if (held === 'slot') await releaseReadSlot(token, lockOptions);
  }

  for (const o of outcomes)
    log(`${o.id} ${o.lang} ${o.pass} ${o.status} ${o.ms}ms${o.reason ? ` ${o.reason}` : ''}`);
  if (passProblems.length > 0) error(`examples:all: write pass failed: ${passProblems.join(', ')}`);
  const count = (/** @type {Outcome['status']} */ s) =>
    outcomes.filter((o) => o.status === s).length;
  log(
    `examples:all: ${count('pass')} pass, ${count('skip')} skip, ${count('fail')} fail${guarded ? '' : ' (unguarded)'}; logs in test/integration/.state/${runId}/examples/`
  );
  if (stopCode !== 0) return stopCode;
  return count('fail') > 0 || passProblems.length > 0 ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.exitCode = await main(process.argv.slice(2));
}
