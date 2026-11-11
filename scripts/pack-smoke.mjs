#!/usr/bin/env node
// Pack smoke (P0 §5.9, §5.5.8): proves that the packed tarball installs and runs as ESM and CJS, also on a
// Node without a global WebSocket, and as a consumer under Bun, fully offline. `npm run test:pack` builds
// first, then runs this file with Node.
//
//   node scripts/pack-smoke.mjs [--strict]
//
// Steps:
//   1. `npm pack --json --ignore-scripts --pack-destination .cache/pack` (dist/ is built by test:pack; the
//      flag stops `prepare` from regenerating and printing into the JSON); the tarball must list
//      dist/index.{js,cjs,d.ts,d.cts}, package.json, README.md, LICENSE, nothing else outside dist/, and
//      nothing under src/, test/, docs/, spec/, examples/ or any .env file            → check `tarball`
//   2. extract into .cache/pack/consumer/node_modules/ubudu-rtls-sdk/ and symlink every `dependencies` entry
//      of the packed package.json, and `ws`, from the repository's node_modules                → `consumer`
//      The consumer folder sits inside the repository, so Node's upward lookup would also find the
//      repository's node_modules; `dist-imports` therefore checks statically that every bare specifier of
//      the built files is a Node builtin, a dependency or a peer dependency.               → `dist-imports`
//   3. scripts/pack-smoke/esm.mjs and cjs.cjs: client with a fake fetch, `await client.health()`, sorted
//      export keys                                                        → `esm`, `cjs`, `export-keys`
//   4. scripts/pack-smoke/ws-no-global.{mjs,cjs}: subscriber against a loopback `ws` server without a global
//      WebSocket                                                       → `ws-no-global-esm`, `-cjs`
//   5. publint on the extracted folder (one check per finding, `publint:<code>`), attw on the tarball
//      (`attw:<kind>`, offline: --no-definitely-typed)                       → `publint`, `attw`, findings
//   6. test/websocket/smoke/dist-smoke.mjs and .cjs when present (P8)        → `dist-smoke-esm`, `-cjs`
//   7. Bun as a consumer runtime (README D18): the same esm.mjs and cjs.cjs run with the `bun` binary
//      (first `bun` on PATH, else ~/.bun/bin/bun; `bun --version` at least BUN_MIN_VERSION, printed), with
//      --no-install and --no-env-file; same assertions as step 3, and the export keys equal under Bun ESM,
//      Bun CJS and Node                                       → `bun`, `bun-esm`, `bun-cjs`, `bun-export-keys`
//      Without a usable Bun the four rows are skipped ("skipped: bun not found", or the version is too
//      old) and the run still passes; with `--strict` the `bun` row fails instead. The ws-no-global checks
//      are not run under Bun: Bun always provides globalThis.WebSocket, so a Bun consumer without one does
//      not exist. Only the consumers run under Bun; every test and build step stays on Node.
//
// scripts/pack-smoke.known.json lists checks that are known to fail, with owner and reason. A listed
// check that fails is reported as known; one that passes prints "known issue no longer reproduces —
// request removal". `--strict` ignores the file (P10).
// Exit codes: 0 every check passed or is known, 1 a check failed, 2 precondition or usage error.
import { spawnSync } from 'node:child_process';
import {
  accessSync,
  constants as fsConstants,
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { builtinModules, createRequire } from 'node:module';
import { homedir } from 'node:os';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { UsageError, parseArgs } from './lib/cli.mjs';
import { PHASES } from './lib/ownership.mjs';

export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const KNOWN_PATH = join(REPO_ROOT, 'scripts', 'pack-smoke.known.json');
export const PACK_DIR = join(REPO_ROOT, '.cache', 'pack');
export const CONSUMER_DIR = join(PACK_DIR, 'consumer');
export const PACKAGE_NAME = 'ubudu-rtls-sdk';
export const REQUIRED_EXPORTS = Object.freeze([
  'createRtlsClient',
  'RtlsClient',
  'RtlsError',
  'RtlsWebSocketSubscriber',
]);
export const REQUIRED_FILES = Object.freeze([
  'dist/index.js',
  'dist/index.cjs',
  'dist/index.d.ts',
  'dist/index.d.cts',
  'package.json',
  'README.md',
  'LICENSE',
]);
const ROOT_FILES = new Set(['package.json', 'README.md', 'LICENSE']);
const FORBIDDEN_DIRS = Object.freeze(['src/', 'test/', 'docs/', 'spec/', 'examples/']);
const CHILD_TIMEOUT_MS = 60_000;
const DIST_SMOKE = Object.freeze([
  ['dist-smoke-esm', 'test/websocket/smoke/dist-smoke.mjs'],
  ['dist-smoke-cjs', 'test/websocket/smoke/dist-smoke.cjs'],
]);
/** Minimum Bun version of the consumer check (README D18); CI installs exactly this version. */
export const BUN_MIN_VERSION = '1.4.4';
/** Bun flags for the consumers: no auto-install from the registry, no automatic `.env` loading. */
export const BUN_FLAGS = Object.freeze(['--no-install', '--no-env-file']);
/** The step-7 rows, in output order. */
export const BUN_CASES = Object.freeze(['bun-esm', 'bun-cjs', 'bun-export-keys']);
const BUN_VERSION_TIMEOUT_MS = 10_000;

/**
 * @typedef {{ owner: string; reason: string }} KnownEntry
 * @typedef {Record<string, KnownEntry>} KnownList
 * @typedef {'pass' | 'fail' | 'skip'} CheckOutcome
 * @typedef {{ id: string; outcome: CheckOutcome; detail: string }} CheckResult
 * @typedef {'pass' | 'fail' | 'known' | 'skip'} RowStatus
 * @typedef {{ id: string; status: RowStatus; detail: string; known?: KnownEntry & { fixed?: boolean } }} Row
 * @typedef {{ status: number | null; signal: NodeJS.Signals | null; stdout: string; stderr: string; error?: Error }} RunOutput
 * @typedef {{ cmd: string; args: readonly string[] }} Runtime
 */

/**
 * Reads and validates scripts/pack-smoke.known.json: `{ "<check-id>": { owner, reason } }`.
 *
 * @param {string} [path]
 * @returns {KnownList}
 */
export function loadKnown(path = KNOWN_PATH) {
  if (!existsSync(path)) return {};
  const data = JSON.parse(readFileSync(path, 'utf8'));
  if (data === null || typeof data !== 'object' || Array.isArray(data))
    throw new UsageError(`${path}: expected an object of { "<check-id>": { owner, reason } }`);
  /** @type {KnownList} */
  const known = {};
  for (const [id, entry] of Object.entries(data)) {
    if (!/^[a-z0-9][a-z0-9-]*(?::[A-Za-z0-9_-]+)?$/.test(id))
      throw new UsageError(`${path}: invalid check id ${JSON.stringify(id)}`);
    const e = /** @type {Record<string, unknown>} */ (entry ?? {});
    if (
      typeof e.owner !== 'string' ||
      !(/** @type {readonly string[]} */ (PHASES).includes(e.owner))
    )
      throw new UsageError(`${path}: ${id}: owner must be a phase (P0…P10)`);
    if (typeof e.reason !== 'string' || e.reason.trim().length < 20)
      throw new UsageError(`${path}: ${id}: reason must be a sentence (at least 20 characters)`);
    const extra = Object.keys(e).filter((k) => k !== 'owner' && k !== 'reason');
    if (extra.length) throw new UsageError(`${path}: ${id}: unknown key(s) ${extra.join(', ')}`);
    known[id] = { owner: e.owner, reason: e.reason };
  }
  return known;
}

/** Check ids that stand for one finding of a tool; absent from the results means "no longer found". */
function isFindingId(/** @type {string} */ id) {
  return /^(?:publint|attw):/.test(id);
}

/**
 * Applies the known list to the check results.
 *
 * @param {readonly CheckResult[]} results
 * @param {KnownList} known
 * @param {{ strict?: boolean }} [options]
 * @returns {{ rows: Row[]; failed: boolean; warnings: string[]; counts: Record<RowStatus, number> }}
 */
export function evaluateChecks(results, known, { strict = false } = {}) {
  /** @type {Row[]} */
  const rows = [];
  /** @type {string[]} */
  const warnings = [];
  const seen = new Set();
  for (const r of results) {
    seen.add(r.id);
    const entry = strict ? undefined : known[r.id];
    if (r.outcome === 'skip') rows.push({ id: r.id, status: 'skip', detail: r.detail });
    else if (r.outcome === 'pass')
      rows.push(
        entry
          ? { id: r.id, status: 'pass', detail: r.detail, known: { ...entry, fixed: true } }
          : { id: r.id, status: 'pass', detail: r.detail }
      );
    else if (entry) rows.push({ id: r.id, status: 'known', detail: r.detail, known: entry });
    else rows.push({ id: r.id, status: 'fail', detail: r.detail });
  }
  if (!strict) {
    for (const [id, entry] of Object.entries(known)) {
      if (seen.has(id)) continue;
      if (isFindingId(id))
        rows.push({
          id,
          status: 'pass',
          detail: 'finding not reported any more',
          known: { ...entry, fixed: true },
        });
      else warnings.push(`known entry ${id} matches no check that ran`);
    }
  }
  /** @type {Record<RowStatus, number>} */
  const counts = { pass: 0, fail: 0, known: 0, skip: 0 };
  for (const row of rows) counts[row.status] += 1;
  return { rows, failed: counts.fail > 0, warnings, counts };
}

/**
 * One output line per row.
 *
 * @param {Row} row
 * @returns {string}
 */
export function formatRow(row) {
  let text = `  ${row.status.padEnd(5)}  ${row.id.padEnd(18)}  ${row.detail}`;
  if (row.status === 'known' && row.known)
    text += ` — known issue (owner ${row.known.owner}): ${row.known.reason}`;
  if (row.status === 'pass' && row.known?.fixed)
    text += ` — known issue no longer reproduces — request removal from scripts/pack-smoke.known.json (owner ${row.known.owner})`;
  return text;
}

/**
 * Step 1: the file list of `npm pack --json`.
 *
 * @param {readonly string[]} files
 * @returns {CheckResult}
 */
export function checkTarballFiles(files) {
  /** @type {string[]} */
  const problems = [];
  const set = new Set(files);
  for (const f of REQUIRED_FILES) if (!set.has(f)) problems.push(`missing ${f}`);
  for (const f of files) {
    const base = f.split('/').pop() ?? f;
    if (FORBIDDEN_DIRS.some((d) => f.startsWith(d))) problems.push(`must not contain ${f}`);
    else if (/^\.env(?:\..*)?$/.test(base)) problems.push(`must not contain ${f}`);
    else if (!f.startsWith('dist/') && !ROOT_FILES.has(f)) problems.push(`unexpected ${f}`);
  }
  return problems.length
    ? { id: 'tarball', outcome: 'fail', detail: problems.join('; ') }
    : {
        id: 'tarball',
        outcome: 'pass',
        detail: `${files.length} files: ${[...files].sort().join(', ')}`,
      };
}

/**
 * Bare module specifiers of a built file (`import … from`, `import()`, `require()`, tsup's `__require()`).
 *
 * @param {string} text
 * @returns {string[]}
 */
export function bareSpecifiers(text) {
  // A keyword right after a quote is a string value (`["from", "to"]`), not an import.
  const re =
    /(?<!['"`])(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+|\b(?:__)?require\s*\(\s*)(['"])([^'"\n]+)\1/g;
  /** @type {Set<string>} */
  const out = new Set();
  for (const m of text.matchAll(re)) {
    const spec = /** @type {string} */ (m[2]);
    if (spec.startsWith('.') || spec.startsWith('/')) continue;
    out.add(spec);
  }
  return [...out].sort();
}

/**
 * The package name of a bare specifier (`@scope/name/sub` → `@scope/name`, `name/sub` → `name`).
 *
 * @param {string} spec
 */
function packageOf(spec) {
  const parts = spec.split('/');
  return spec.startsWith('@') ? parts.slice(0, 2).join('/') : /** @type {string} */ (parts[0]);
}

/**
 * Step 2 complement: every bare specifier of the built files is a Node builtin, a dependency or a peer
 * dependency of the packed package.json, or the package's own name when it declares `exports` (Node resolves such
 * a self-reference to the package itself; the bundles keep JSDoc `@example` text that imports the package by name).
 *
 * @param {Record<string, string>} texts  file name → contents
 * @param {{ name?: string; exports?: unknown; dependencies?: Record<string, string>;
 *   peerDependencies?: Record<string, string> }} pkg
 * @returns {CheckResult}
 */
export function checkDistImports(texts, pkg) {
  const declared = new Set([
    ...Object.keys(pkg.dependencies ?? {}),
    ...Object.keys(pkg.peerDependencies ?? {}),
    ...(typeof pkg.name === 'string' && pkg.exports !== undefined ? [pkg.name] : []),
  ]);
  const builtins = new Set(builtinModules);
  /** @type {Set<string>} */
  const used = new Set();
  /** @type {string[]} */
  const undeclared = [];
  for (const [file, text] of Object.entries(texts)) {
    for (const spec of bareSpecifiers(text)) {
      if (spec.startsWith('node:') || builtins.has(spec) || builtins.has(packageOf(spec))) continue;
      const name = packageOf(spec);
      used.add(name);
      if (!declared.has(name)) undeclared.push(`${file}: ${spec}`);
    }
  }
  return undeclared.length
    ? {
        id: 'dist-imports',
        outcome: 'fail',
        detail: `not in dependencies or peerDependencies: ${undeclared.join(', ')}`,
      }
    : {
        id: 'dist-imports',
        outcome: 'pass',
        detail: used.size ? `bare imports: ${[...used].sort().join(', ')}` : 'no bare imports',
      };
}

/**
 * Step 3: the ESM and CJS export key sets are equal and contain the required names.
 *
 * @param {readonly string[] | undefined} esm
 * @param {readonly string[] | undefined} cjs
 * @param {string} [id]  check id (`bun-export-keys` for step 7)
 * @returns {CheckResult}
 */
export function compareExports(esm, cjs, id = 'export-keys') {
  if (!esm || !cjs)
    return {
      id,
      outcome: 'fail',
      detail: `export keys missing (${!esm ? 'esm' : ''}${!esm && !cjs ? ', ' : ''}${!cjs ? 'cjs' : ''})`,
    };
  const a = new Set(esm);
  const b = new Set(cjs);
  /** @type {string[]} */
  const problems = [];
  const onlyEsm = [...a].filter((k) => !b.has(k)).sort();
  const onlyCjs = [...b].filter((k) => !a.has(k)).sort();
  if (onlyEsm.length) problems.push(`only in ESM: ${onlyEsm.join(', ')}`);
  if (onlyCjs.length) problems.push(`only in CJS: ${onlyCjs.join(', ')}`);
  const missing = REQUIRED_EXPORTS.filter((k) => !a.has(k) || !b.has(k));
  if (missing.length) problems.push(`missing ${missing.join(', ')}`);
  return problems.length
    ? { id, outcome: 'fail', detail: problems.join('; ') }
    : {
        id,
        outcome: 'pass',
        detail: `${a.size} keys, equal in ESM and CJS, include ${REQUIRED_EXPORTS.join(', ')}`,
      };
}

/**
 * Step 7: the Bun ESM and CJS export key sets are equal, contain the required names (as step 3) and equal
 * the Node key set.
 *
 * @param {readonly string[] | undefined} esm  keys of the ESM consumer under Bun
 * @param {readonly string[] | undefined} cjs  keys of the CJS consumer under Bun
 * @param {readonly string[] | undefined} node  keys of the ESM consumer under Node
 * @returns {CheckResult}
 */
export function compareBunExports(esm, cjs, node) {
  const id = 'bun-export-keys';
  const own = compareExports(esm, cjs, id);
  if (own.outcome === 'fail' || !esm) return own;
  if (!node)
    return { id, outcome: 'fail', detail: 'Node export keys missing: nothing to compare with' };
  const bun = new Set(esm);
  const ref = new Set(node);
  /** @type {string[]} */
  const problems = [];
  const onlyBun = [...bun].filter((k) => !ref.has(k)).sort();
  const onlyNode = [...ref].filter((k) => !bun.has(k)).sort();
  if (onlyBun.length) problems.push(`only under Bun: ${onlyBun.join(', ')}`);
  if (onlyNode.length) problems.push(`only under Node: ${onlyNode.join(', ')}`);
  return problems.length
    ? { id, outcome: 'fail', detail: problems.join('; ') }
    : { id, outcome: 'pass', detail: `${bun.size} keys, equal under Bun (ESM and CJS) and Node` };
}

/**
 * The last `PACK-SMOKE <json>` line of a consumer's stdout.
 *
 * @param {string} stdout
 * @returns {Record<string, any> | null}
 */
export function parseSmokeLine(stdout) {
  const lines = String(stdout)
    .split(/\r?\n/)
    .filter((l) => l.startsWith('PACK-SMOKE '));
  const last = lines[lines.length - 1];
  if (!last) return null;
  const value = parseJson(last.slice('PACK-SMOKE '.length));
  return value !== null && typeof value === 'object' ? value : null;
}

/**
 * @param {string} text
 * @returns {any} the parsed JSON value, or null when the text is not JSON
 */
function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * publint messages → one check per finding (`publint:<code>`).
 *
 * @param {readonly { code: string; type: string; text: string }[]} messages
 * @returns {CheckResult[]}
 */
export function publintChecks(messages) {
  return messages.map((m) => ({
    id: `publint:${m.code}`,
    outcome: /** @type {CheckOutcome} */ ('fail'),
    detail: `${m.type}: ${m.text}`,
  }));
}

/**
 * attw `--format json` output → one check per problem kind (`attw:<kind>`).
 *
 * @param {{ analysis?: { types?: unknown; problems?: readonly { kind: string }[] } }} report
 * @returns {CheckResult[]}
 */
export function attwChecks(report) {
  const analysis = report.analysis ?? {};
  if (analysis.types === false || analysis.types === undefined)
    return [{ id: 'attw:untyped', outcome: 'fail', detail: 'the package ships no types' }];
  /** @type {Map<string, number>} */
  const byKind = new Map();
  for (const p of analysis.problems ?? []) byKind.set(p.kind, (byKind.get(p.kind) ?? 0) + 1);
  return [...byKind].map(([kind, n]) => ({
    id: `attw:${kind}`,
    outcome: /** @type {CheckOutcome} */ ('fail'),
    detail: `${n} problem(s) of kind ${kind}`,
  }));
}

/**
 * @param {string} cmd
 * @param {readonly string[]} args
 * @param {{ cwd: string; timeout?: number }} options
 * @returns {RunOutput}
 */
function run(cmd, args, { cwd, timeout = CHILD_TIMEOUT_MS }) {
  const r = spawnSync(cmd, args, {
    cwd,
    encoding: 'utf8',
    timeout,
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, npm_config_update_notifier: 'false' },
  });
  return {
    status: r.status,
    signal: r.signal,
    stdout: r.stdout ?? '',
    stderr: r.stderr ?? '',
    error: r.error,
  };
}

/** `npm` through the running npm's CLI script when started by npm, else from PATH. */
function npmCommand() {
  const execPath = process.env.npm_execpath;
  if (execPath && /\.(?:c?js)$/.test(execPath) && existsSync(execPath))
    return { cmd: process.execPath, prefix: [execPath] };
  return { cmd: process.platform === 'win32' ? 'npm.cmd' : 'npm', prefix: [] };
}

/** The Node runtime that runs this script. */
const NODE_RUNTIME = Object.freeze({ cmd: process.execPath, args: Object.freeze([]) });

/**
 * Copies a consumer script into the consumer folder and runs it there with the given runtime.
 *
 * @param {string} script  file under scripts/pack-smoke/
 * @param {Runtime} runtime
 * @returns {RunOutput}
 */
function runConsumerScript(script, runtime) {
  const target = join(CONSUMER_DIR, script);
  copyFileSync(join(REPO_ROOT, 'scripts', 'pack-smoke', script), target);
  return run(runtime.cmd, [...runtime.args, target], { cwd: CONSUMER_DIR });
}

/**
 * The check of one consumer run: the process must exit 0 with a `PACK-SMOKE` line that `validate` accepts.
 *
 * @param {string} id
 * @param {RunOutput} r
 * @param {(result: Record<string, any>) => string | null} validate  null when the result is acceptable
 * @returns {{ check: CheckResult; result: Record<string, any> | null }}
 */
export function consumerCheck(id, r, validate) {
  const result = parseSmokeLine(r.stdout);
  if (r.error || r.status !== 0 || !result) {
    const why =
      result?.error ??
      (r.error
        ? r.error.message
        : r.signal
          ? `killed by ${r.signal}`
          : `exit ${r.status}${r.stderr ? `: ${r.stderr.trim().split('\n').slice(-1)[0]}` : ''}`);
    return { check: { id, outcome: 'fail', detail: String(why) }, result };
  }
  const problem = validate(result);
  return problem
    ? { check: { id, outcome: 'fail', detail: problem }, result }
    : { check: { id, outcome: 'pass', detail: describeResult(result) }, result };
}

/**
 * @param {string} id
 * @param {string} script  file under scripts/pack-smoke/
 * @param {(result: Record<string, any>) => string | null} validate  null when the result is acceptable
 * @returns {{ check: CheckResult; result: Record<string, any> | null }}
 */
function runConsumer(id, script, validate) {
  return consumerCheck(id, runConsumerScript(script, NODE_RUNTIME), validate);
}

/**
 * Steps 3 and 7: `health()` answered `{"status":"OK"}` and the fake fetch saw `GET …/health`.
 *
 * @param {Record<string, any>} r  the consumer's `PACK-SMOKE` result
 * @returns {string | null} null when acceptable
 */
export function healthProblem(r) {
  return r.ok === true && r.health?.status === 'OK'
    ? Array.isArray(r.requests) && r.requests.some((q) => /^GET \S*\/health$/.test(String(q)))
      ? null
      : `the fake fetch saw no GET …/health (${JSON.stringify(r.requests)})`
    : `health() returned ${JSON.stringify(r.health)}`;
}

/**
 * @param {string} file
 * @returns {boolean} true for an existing regular file this process may execute
 */
function isExecutableFile(file) {
  try {
    if (!statSync(file).isFile()) return false;
    accessSync(file, fsConstants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Locates the `bun` binary (step 7): the first executable `bun` in a PATH directory, else `~/.bun/bin/bun`.
 *
 * @param {{ path?: string; home?: string; platform?: NodeJS.Platform; isExecutable?: (file: string) => boolean }} [options]
 * @returns {string | null} absolute path, or null when Bun is not found
 */
export function findBun({
  path = process.env.PATH ?? '',
  home = homedir(),
  platform = process.platform,
  isExecutable = isExecutableFile,
} = {}) {
  const name = platform === 'win32' ? 'bun.exe' : 'bun';
  const dirs = path.split(platform === 'win32' ? ';' : ':').filter((d) => d.trim() !== '');
  for (const dir of dirs) {
    const candidate = resolve(dir, name);
    if (isExecutable(candidate)) return candidate;
  }
  const fallback = join(home, '.bun', 'bin', name);
  return isExecutable(fallback) ? fallback : null;
}

/**
 * `bun --version` of a binary, or null when it does not answer with exit 0 and some output.
 *
 * @param {string} bin
 * @returns {string | null}
 */
export function readBunVersion(bin) {
  const r = run(bin, ['--version'], { cwd: REPO_ROOT, timeout: BUN_VERSION_TIMEOUT_MS });
  const text = r.stdout.trim().split(/\r?\n/)[0]?.trim() ?? '';
  return r.error || r.status !== 0 || text === '' ? null : text;
}

/**
 * `1.4.4`, `v1.4.4`, `1.4.5-canary.3+38afee6c8` → numbers and prerelease tag; anything else → null.
 *
 * @param {string} text
 * @returns {{ major: number; minor: number; patch: number; pre: string } | null}
 */
export function parseVersion(text) {
  const m = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/.exec(text.trim());
  if (!m) return null;
  return { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]), pre: m[4] ?? '' };
}

/**
 * Compares two versions numerically; a prerelease sorts before its release (`1.4.4-canary.1` < `1.4.4`).
 *
 * @param {NonNullable<ReturnType<typeof parseVersion>>} a
 * @param {NonNullable<ReturnType<typeof parseVersion>>} b
 * @returns {number} negative when a < b, 0 when equal, positive when a > b
 */
export function compareVersions(a, b) {
  for (const key of /** @type {const} */ (['major', 'minor', 'patch']))
    if (a[key] !== b[key]) return a[key] - b[key];
  if (a.pre === b.pre) return 0;
  if (a.pre === '') return 1;
  if (b.pre === '') return -1;
  return a.pre < b.pre ? -1 : 1;
}

/**
 * `~/…` for a path under the home directory (output only).
 *
 * @param {string} file
 * @param {string} home
 */
function displayPath(file, home) {
  return home && file.startsWith(home + sep) ? `~${file.slice(home.length)}` : file;
}

/**
 * Step 7 row `bun`: whether a usable Bun was found. Without one the row is a skip, or a fail with `--strict`;
 * `skip` is then the detail of the case rows.
 *
 * @param {{ bin: string | null; version: string | null; strict?: boolean; home?: string }} found
 * @returns {{ check: CheckResult; usable: boolean; skip: string }}
 */
export function bunRuntimeCheck({ bin, version, strict = false, home = homedir() }) {
  const min = /** @type {NonNullable<ReturnType<typeof parseVersion>>} */ (
    parseVersion(BUN_MIN_VERSION)
  );
  const where = bin ? displayPath(bin, home) : '';
  const parsed = version === null ? null : parseVersion(version);
  /** @type {string} */
  let reason;
  if (!bin) reason = 'bun not found (looked on PATH and at ~/.bun/bin/bun)';
  else if (version === null) reason = `bun at ${where} reported no version (bun --version)`;
  else if (!parsed)
    reason = `bun at ${where} reported an unreadable version ${JSON.stringify(version)}`;
  else if (compareVersions(parsed, min) < 0)
    reason = `bun ${version} at ${where} is older than the minimum ${BUN_MIN_VERSION}`;
  else
    return {
      check: {
        id: 'bun',
        outcome: 'pass',
        detail: `bun ${version} at ${where} (minimum ${BUN_MIN_VERSION})`,
      },
      usable: true,
      skip: '',
    };
  const skip = `skipped: ${reason}`;
  return {
    check: strict
      ? {
          id: 'bun',
          outcome: 'fail',
          detail: `${reason}; --strict requires bun >= ${BUN_MIN_VERSION}`,
        }
      : { id: 'bun', outcome: 'skip', detail: skip },
    usable: false,
    skip,
  };
}

/**
 * Step 7: the ESM and CJS consumers under Bun, with the assertions of step 3, and the export keys compared
 * with the Node ones. The defaults locate and run the real binary; tests inject `locate`, `versionOf` and
 * `exec`.
 *
 * @param {{
 *   strict?: boolean;
 *   nodeExports?: readonly string[];
 *   locate?: () => string | null;
 *   versionOf?: (bin: string) => string | null;
 *   exec?: (script: string, runtime: Runtime) => RunOutput;
 *   home?: string;
 * }} [options]
 * @returns {CheckResult[]}
 */
export function bunChecks({
  strict = false,
  nodeExports,
  locate = () => findBun(),
  versionOf = readBunVersion,
  exec = runConsumerScript,
  home = homedir(),
} = {}) {
  const bin = locate();
  const runtime = bunRuntimeCheck({ bin, version: bin ? versionOf(bin) : null, strict, home });
  if (!runtime.usable || !bin)
    return [
      runtime.check,
      ...BUN_CASES.map((id) => ({
        id,
        outcome: /** @type {CheckOutcome} */ ('skip'),
        detail: runtime.skip,
      })),
    ];
  /** @type {Runtime} */
  const bun = { cmd: bin, args: BUN_FLAGS };
  const esm = consumerCheck('bun-esm', exec('esm.mjs', bun), healthProblem);
  const cjs = consumerCheck('bun-cjs', exec('cjs.cjs', bun), healthProblem);
  return [
    runtime.check,
    esm.check,
    cjs.check,
    compareBunExports(esm.result?.exports, cjs.result?.exports, nodeExports),
  ];
}

/** @param {Record<string, any>} result */
function describeResult(result) {
  if (result.health)
    return `health() → ${JSON.stringify(result.health)}; ${result.exports?.length ?? 0} export keys`;
  if (result.confirmed) return `SUBSCRIBE sent and confirmed without a global WebSocket`;
  return 'ok';
}

/**
 * Runs every step and returns the check results. Throws a UsageError for a missing precondition.
 *
 * @param {{ log?: (line: string) => void; strict?: boolean }} [options]
 * @returns {Promise<CheckResult[]>}
 */
export async function runChecks({ log = (line) => console.log(line), strict = false } = {}) {
  for (const f of ['dist/index.js', 'dist/index.cjs', 'dist/index.d.ts', 'dist/index.d.cts'])
    if (!existsSync(join(REPO_ROOT, f)))
      throw new UsageError(`${f} is missing: run \`npm run build\` first (npm run test:pack does)`);

  /** @type {CheckResult[]} */
  const results = [];
  rmSync(PACK_DIR, { recursive: true, force: true });
  mkdirSync(PACK_DIR, { recursive: true });

  // 1. pack
  const npm = npmCommand();
  const packed = run(
    npm.cmd,
    [...npm.prefix, 'pack', '--json', '--ignore-scripts', '--pack-destination', PACK_DIR],
    { cwd: REPO_ROOT }
  );
  /** @type {{ filename: string; files: { path: string }[] }[] | null} */
  const packInfo = parseJson(packed.stdout);
  const info = packInfo?.[0];
  if (packed.status !== 0 || !info)
    throw new UsageError(
      `npm pack failed (exit ${packed.status}): ${packed.error?.message ?? packed.stderr.trim().split('\n').slice(-1)[0] ?? ''}`
    );
  const tarball = join(PACK_DIR, info.filename);
  log(`pack-smoke: ${info.filename} (${info.files.length} files)`);
  results.push(checkTarballFiles(info.files.map((f) => f.path)));

  // 2. consumer
  const pkgDir = join(CONSUMER_DIR, 'node_modules', PACKAGE_NAME);
  mkdirSync(pkgDir, { recursive: true });
  writeFileSync(
    join(CONSUMER_DIR, 'package.json'),
    JSON.stringify({ name: 'pack-smoke-consumer', private: true, type: 'module' }, null, 2) + '\n'
  );
  const untar = run('tar', ['-xzf', tarball, '--strip-components=1', '-C', pkgDir], {
    cwd: PACK_DIR,
  });
  if (untar.status !== 0) throw new UsageError(`tar -xzf failed: ${untar.stderr.trim()}`);
  const packedPkg = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8'));
  const links = [...new Set([...Object.keys(packedPkg.dependencies ?? {}), 'ws'])].sort();
  /** @type {string[]} */
  const missingLinks = [];
  for (const name of links) {
    const source = join(REPO_ROOT, 'node_modules', name);
    if (!existsSync(source)) {
      missingLinks.push(name);
      continue;
    }
    const target = join(CONSUMER_DIR, 'node_modules', name);
    mkdirSync(dirname(target), { recursive: true });
    symlinkSync(source, target, 'dir');
  }
  results.push(
    missingLinks.length
      ? {
          id: 'consumer',
          outcome: 'fail',
          detail: `not installed in the repository's node_modules: ${missingLinks.join(', ')} (run npm ci)`,
        }
      : { id: 'consumer', outcome: 'pass', detail: `extracted; linked ${links.join(', ')}` }
  );
  results.push(
    checkDistImports(
      {
        'dist/index.js': readFileSync(join(pkgDir, 'dist', 'index.js'), 'utf8'),
        'dist/index.cjs': readFileSync(join(pkgDir, 'dist', 'index.cjs'), 'utf8'),
      },
      packedPkg
    )
  );

  // 3. ESM and CJS consumers
  const esm = runConsumer('esm', 'esm.mjs', healthProblem);
  const cjs = runConsumer('cjs', 'cjs.cjs', healthProblem);
  results.push(esm.check, cjs.check);
  results.push(compareExports(esm.result?.exports, cjs.result?.exports));

  // 4. no global WebSocket
  /** @param {Record<string, any>} r */
  const subscribed = (r) =>
    r.globalRemoved !== true
      ? 'globalThis.WebSocket was not removed'
      : r.confirmed === true && Array.isArray(r.frames) && r.frames.includes('SUBSCRIBE')
        ? null
        : `no confirmed SUBSCRIBE (frames ${JSON.stringify(r.frames)})`;
  results.push(runConsumer('ws-no-global-esm', 'ws-no-global.mjs', subscribed).check);
  results.push(runConsumer('ws-no-global-cjs', 'ws-no-global.cjs', subscribed).check);

  // 5. publint and attw
  try {
    const { publint } = await import('publint');
    const { formatMessage } = await import('publint/utils');
    const lint = await publint({ pkgDir, pack: false, level: 'suggestion' });
    const messages = lint.messages.map((m) => ({
      code: m.code,
      type: m.type,
      text: formatMessage(m, packedPkg, { color: false }) ?? m.code,
    }));
    results.push({
      id: 'publint',
      outcome: 'pass',
      detail: `ran on the extracted package: ${messages.length} finding(s)`,
    });
    results.push(...publintChecks(messages));
  } catch (err) {
    results.push({ id: 'publint', outcome: 'fail', detail: `publint failed: ${String(err)}` });
  }
  const attwBin = resolveBin('@arethetypeswrong/cli', 'attw');
  const attw = run(
    process.execPath,
    [attwBin, tarball, '--format', 'json', '--no-definitely-typed'],
    {
      cwd: PACK_DIR,
    }
  );
  /** @type {any} */
  const attwReport = parseJson(attw.stdout);
  if (!attwReport?.analysis)
    results.push({
      id: 'attw',
      outcome: 'fail',
      detail: `attw produced no report (exit ${attw.status}): ${attw.stderr.trim().split('\n').slice(-1)[0] ?? ''}`,
    });
  else {
    const found = attwChecks(attwReport);
    results.push({
      id: 'attw',
      outcome: 'pass',
      detail: `ran on the tarball (profile strict): ${found.length} problem kind(s)`,
    });
    results.push(...found);
  }

  // 6. P8's dist smoke scripts
  for (const [id, file] of DIST_SMOKE) {
    const path = join(REPO_ROOT, /** @type {string} */ (file));
    if (!existsSync(path)) {
      results.push({
        id: /** @type {string} */ (id),
        outcome: 'skip',
        detail: `${file} not present (P8)`,
      });
      continue;
    }
    const r = run(process.execPath, [path], { cwd: REPO_ROOT });
    results.push(
      r.status === 0
        ? { id: /** @type {string} */ (id), outcome: 'pass', detail: `${file} exit 0` }
        : {
            id: /** @type {string} */ (id),
            outcome: 'fail',
            detail: `${file} ${r.signal ? `killed by ${r.signal}` : `exit ${r.status}`}`,
          }
    );
  }

  // 7. Bun as a consumer runtime (the consumers only; tests and build stay on Node)
  results.push(...bunChecks({ strict, nodeExports: esm.result?.exports }));
  return results;
}

/**
 * Absolute path of a dependency's bin script.
 *
 * @param {string} pkg
 * @param {string} bin
 */
function resolveBin(pkg, bin) {
  const require = createRequire(import.meta.url);
  const manifestPath = require.resolve(`${pkg}/package.json`);
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const rel = typeof manifest.bin === 'string' ? manifest.bin : manifest.bin?.[bin];
  if (!rel) throw new UsageError(`${pkg} declares no bin ${bin}`);
  return join(dirname(manifestPath), rel);
}

const USAGE = 'usage: pack-smoke.mjs [--strict]';

/**
 * @param {readonly string[]} argv
 * @param {{ checks?: (options: { strict: boolean }) => Promise<CheckResult[]>; knownPath?: string; log?: (line: string) => void; error?: (line: string) => void }} [deps]
 * @returns {Promise<number>}
 */
export async function main(argv, deps = {}) {
  const log = deps.log ?? ((line) => console.log(line));
  const error = deps.error ?? ((line) => console.error(line));
  /** @type {boolean} */
  let strict;
  /** @type {KnownList} */
  let known;
  /** @type {CheckResult[]} */
  let results;
  try {
    const args = parseArgs(argv, { flags: ['strict'] });
    if (args.positionals.length) throw new UsageError(`unexpected argument ${args.positionals[0]}`);
    strict = args.flags.strict;
    known = loadKnown(deps.knownPath ?? KNOWN_PATH);
    const checks = deps.checks ?? ((options) => runChecks({ log, ...options }));
    results = await checks({ strict });
  } catch (err) {
    if (err instanceof UsageError) {
      error(`pack-smoke: ${err.message}\n${USAGE}`);
      return 2;
    }
    throw err;
  }
  const { rows, failed, warnings, counts } = evaluateChecks(results, known, { strict });
  for (const row of rows) (row.status === 'fail' ? error : log)(formatRow(row));
  for (const w of warnings) log(`pack-smoke: warning: ${w}`);
  log(
    `pack-smoke${strict ? ' --strict' : ''}: ${counts.pass} passed, ${counts.known} known, ${counts.fail} failed, ${counts.skip} skipped`
  );
  return failed ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).then(
    (code) => {
      process.exitCode = code;
    },
    (err) => {
      console.error(
        `pack-smoke: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`
      );
      process.exitCode = 2;
    }
  );
}
