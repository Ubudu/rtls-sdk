// Shared configuration and helpers for the numbered examples.
// Every example loads its configuration through this module, names what it creates with testName(),
// prints exactly one marker line at the end (DONE / SKIPPED / FAILED, written by runExample) and
// never prints a credential.
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'dotenv';
import { createRtlsClient } from 'ubudu-rtls-sdk';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..', '..');
const STATE_ROOT = join(REPO_ROOT, 'test', 'integration', '.state');

export const DEFAULT_BASE_URL = 'https://rtls.ubudu.com/api';
/** Dummy credential for unreachable hosts; never the configured key. */
export const DUMMY_API_KEY = 'sdk-test-dummy-key';
/** RFC 5737 documentation address: no host answers, the request fails with a network error. */
export const UNREACHABLE_BASE_URL = 'http://192.0.2.1/api';
/** Overall deadline of one example run. */
export const EXAMPLE_DEADLINE_MS = 120_000;

const TIER_KEYS = ['RTLS_IT_WRITES', 'RTLS_IT_CONFIG', 'RTLS_IT_SIDE_EFFECTS'];
/** @type {Readonly<Record<string, readonly string[]>>} */
const TIER_VARIABLES = Object.freeze({
  none: [],
  W: ['RTLS_IT_WRITES'],
  C: ['RTLS_IT_WRITES', 'RTLS_IT_CONFIG'],
  S: ['RTLS_IT_WRITES', 'RTLS_IT_SIDE_EFFECTS'],
});
const HEADER_TIER_RE = /^\/\/ Write section: tier (W|C|S|none);/;
const INTERNAL_PREFIX = 'RTLS_IT_INTERNAL_';
const REQUIRED_KEYS = ['RTLS_API_KEY', 'APP_NAMESPACE'];
const RUN_ID_RE = /^[0-9a-f]{8}$/;
const LABEL_RE = /^[a-z0-9][a-z0-9-]{0,39}$/;
const TEST_MAC_RE = /^025d4b[0-9a-f]{6}$/;

/** @type {readonly import('./config.js').SkipCategory[]} */
export const SKIP_CATEGORIES = Object.freeze([
  'feature-off',
  'role',
  'tier',
  'no-fixture',
  'preflight',
]);

/**
 * Prints a configuration error (names only, never values) and exits.
 *
 * @param {number} code
 * @param {string} message
 * @returns {never}
 */
function exitWith(code, message) {
  console.error(message);
  process.exit(code);
}

/**
 * @param {NodeJS.ProcessEnv} env
 * @returns {{ ok: true; runId: string } | { ok: false; code: number; message: string }}
 */
export function resolveRunId(env) {
  const value = env.RTLS_IT_RUN_ID;
  if (value === undefined || value === '')
    return { ok: true, runId: randomBytes(4).toString('hex') };
  if (!RUN_ID_RE.test(value))
    return { ok: false, code: 2, message: 'CONFIG INVALID: RTLS_IT_RUN_ID' };
  return { ok: true, runId: value };
}

const runIdResult = resolveRunId(process.env);
if (!runIdResult.ok) exitWith(runIdResult.code, runIdResult.message);

/** RTLS_IT_RUN_ID when set, else random 8 hex characters. */
export const runId = runIdResult.ok ? runIdResult.runId : '';

/**
 * Pure part of loadConfig(): process environment first, then the parsed `.env` text.
 * A tier key or an `RTLS_IT_INTERNAL_` key in `.env` is a precondition error (exit 2); missing
 * credentials are exit 3. Messages carry variable names only.
 *
 * @internal
 * @param {{ env: NodeJS.ProcessEnv; dotenvText?: string | null; argv?: readonly string[]; runId: string }} input
 * @returns {{ ok: true; config: import('./config.js').ExampleConfig } | { ok: false; code: number; message: string }}
 */
export function resolveConfig({ env, dotenvText, argv = [], runId: id }) {
  const fileVars = dotenvText ? parse(dotenvText) : {};
  const invalid = Object.keys(fileVars).filter(
    (k) => TIER_KEYS.includes(k) || k.startsWith(INTERNAL_PREFIX)
  );
  if (invalid.length > 0)
    return { ok: false, code: 2, message: `CONFIG INVALID: ${invalid.join(', ')}` };
  /** @param {string} key */
  const value = (key) => {
    const fromEnv = env[key];
    if (fromEnv !== undefined && fromEnv !== '') return fromEnv;
    const fromFile = fileVars[key];
    return fromFile !== undefined && fromFile !== '' ? fromFile : undefined;
  };
  const missing = REQUIRED_KEYS.filter((k) => value(k) === undefined);
  if (missing.length > 0)
    return { ok: false, code: 3, message: `CONFIG MISSING: ${missing.join(', ')}` };
  const baseUrl = (value('RTLS_BASE_URL') ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
  return {
    ok: true,
    config: {
      apiKey: /** @type {string} */ (value('RTLS_API_KEY')),
      namespace: /** @type {string} */ (value('APP_NAMESPACE')),
      baseUrl,
      write: argv.includes('--write'),
      runId: id,
    },
  };
}

/**
 * The tier variables that a `--write` run of the example file needs and that `env` does not set to `1`. The tier
 * comes from the file's first line (`// Write section: tier <W|C|S|none>; …`): W needs RTLS_IT_WRITES, C also
 * RTLS_IT_CONFIG, S also RTLS_IT_SIDE_EFFECTS; an unreadable file or header needs all three.
 *
 * @internal
 * @param {string | undefined} file
 * @param {NodeJS.ProcessEnv} env
 * @returns {string[]}
 */
export function missingTierVariables(file, env) {
  /** @type {string | undefined} */
  let tier;
  try {
    const first = readFileSync(String(file), 'utf8').split('\n', 1)[0] ?? '';
    tier = HEADER_TIER_RE.exec(first.trim())?.[1];
  } catch {
    tier = undefined;
  }
  const needed = (tier !== undefined ? TIER_VARIABLES[tier] : undefined) ?? TIER_KEYS;
  return needed.filter((k) => env[k] !== '1');
}

let envPath = join(REPO_ROOT, '.env');
let stateRoot = STATE_ROOT;
/** @type {import('./config.js').ExampleConfig | null} */
let cachedConfig = null;

/**
 * Test hook: point loadConfig() at another `.env` file, and preflightRules() at another state root
 * (default `test/integration/.state`), and clear the configuration cache.
 *
 * @internal
 * @param {{ envPath?: string; stateRoot?: string }} [options]
 */
export function _resetConfigForTesting(options = {}) {
  envPath = options.envPath ?? join(REPO_ROOT, '.env');
  stateRoot = options.stateRoot ?? STATE_ROOT;
  cachedConfig = null;
}

/**
 * Configuration of the example: variables already set in the process environment win, then the
 * repository's root `.env` (read with dotenv `parse`, nothing printed, nothing copied into
 * process.env). Missing variables → `CONFIG MISSING: <names>`, exit 3; a tier or internal key in
 * `.env` → `CONFIG INVALID: <names>`, exit 2.
 *
 * @returns {import('./config.js').ExampleConfig}
 */
export function loadConfig() {
  if (cachedConfig) return cachedConfig;
  const dotenvText = existsSync(envPath) ? readFileSync(envPath, 'utf8') : null;
  const result = resolveConfig({
    env: process.env,
    dotenvText,
    argv: process.argv.slice(2),
    runId,
  });
  if (!result.ok) return exitWith(result.code, result.message);
  cachedConfig = result.config;
  return cachedConfig;
}

/**
 * Client for the configured namespace. `overrides` win over the loaded values, so
 * `createExampleClient(unreachableConfig())` builds a client for the unreachable address.
 *
 * @param {Partial<import('ubudu-rtls-sdk').RtlsClientOptions>} [overrides]
 * @returns {import('ubudu-rtls-sdk').RtlsClient}
 */
export function createExampleClient(overrides = {}) {
  const config = loadConfig();
  return createRtlsClient({
    apiKey: config.apiKey,
    baseUrl: config.baseUrl,
    namespace: config.namespace,
    ...overrides,
  });
}

/**
 * True when the example was started with `--<name>`.
 *
 * @param {string} name
 * @param {readonly string[]} [argv]
 */
export function hasFlag(name, argv = process.argv.slice(2)) {
  return argv.includes(`--${name}`);
}

/**
 * Value of `--<name>=v` or `--<name> v`, else `fallback`.
 *
 * @param {string} name
 * @param {string} fallback
 * @param {readonly string[]} [argv]
 * @returns {string}
 */
export function getArg(name, fallback, argv = process.argv.slice(2)) {
  const flag = `--${name}`;
  for (let i = 0; i < argv.length; i++) {
    const a = /** @type {string} */ (argv[i]);
    if (a.startsWith(`${flag}=`)) return a.slice(flag.length + 1);
    if (a === flag) {
      const next = argv[i + 1];
      return next !== undefined && !next.startsWith('--') ? next : fallback;
    }
  }
  return fallback;
}

/**
 * `sdk-test-<runId>-<label>`; label `/^[a-z0-9][a-z0-9-]{0,39}$/`.
 *
 * @param {string} label
 * @returns {string}
 */
export function testName(label) {
  if (typeof label !== 'string' || !LABEL_RE.test(label)) {
    throw new TypeError(`testName: label must match ${LABEL_RE} (got ${JSON.stringify(label)})`);
  }
  return `sdk-test-${runId}-${label}`;
}

/**
 * Test MAC for this run: `025d4b` + the first four hex characters of the run id + `n` as two hex
 * characters (0 ≤ n ≤ 255). Same scheme as the harness `testMac(n)`.
 *
 * @param {number} n
 * @returns {string}
 */
export function testMac(n) {
  if (!Number.isInteger(n) || n < 0 || n > 255) {
    throw new RangeError(`testMac: n must be an integer from 0 to 255 (got ${String(n)})`);
  }
  return `025d4b${runId.slice(0, 4)}${n.toString(16).padStart(2, '0')}`;
}

/**
 * True for a locally administered test MAC `025d4b` + 6 hex; separators (`:`, `-`, `.`) and case are
 * ignored. Same rule as the harness `isTestMac`.
 *
 * @param {string} mac
 * @returns {boolean}
 */
export function isTestMac(mac) {
  if (typeof mac !== 'string') return false;
  return TEST_MAC_RE.test(mac.replace(/[:.-]/g, '').toLowerCase());
}

export class ExampleSkip extends Error {
  /**
   * @param {import('./config.js').SkipCategory} category
   * @param {string} text
   */
  constructor(category, text) {
    super(`${category} ${text}`);
    this.name = 'ExampleSkip';
    this.category = category;
    this.text = text;
  }
}

/**
 * Ends the example as skipped: runExample prints `SKIPPED: <category> <text>` and exits 0.
 *
 * @param {import('./config.js').SkipCategory} category
 * @param {string} text
 * @returns {never}
 */
export function skip(category, text) {
  if (!SKIP_CATEGORIES.includes(category)) {
    throw new TypeError(
      `skip: unknown category ${JSON.stringify(category)}; use one of ${SKIP_CATEGORIES.join(', ')}`
    );
  }
  throw new ExampleSkip(category, String(text));
}

/**
 * Prints `BUDGET positions=<n> notifications=<n> ble=<n> etl=<n>` (absent counts are 0).
 *
 * @param {{ positions?: number; notifications?: number; ble?: number; etl?: number }} counts
 */
export function reportBudget(counts = {}) {
  /** @type {Array<'positions' | 'notifications' | 'ble' | 'etl'>} */
  const keys = ['positions', 'notifications', 'ble', 'etl'];
  const parts = keys.map((k) => {
    const n = counts[k] ?? 0;
    if (!Number.isInteger(n) || n < 0)
      throw new RangeError(`reportBudget: ${k} must be a non-negative integer`);
    return `${k}=${n}`;
  });
  console.log(`BUDGET ${parts.join(' ')}`);
}

/**
 * Whether the verdicts allow a write of this shape: 'assets' → ruleEngineSafe && linkedNamespaceSafe;
 * 'publish' → ruleEngineSafe && positionSafe; 'declared' → ruleEngineSafe && linkedNamespaceSafe &&
 * declaredPositionSafe. A verdict listed in `timeLimited` counts as false once the current time is not
 * before `timeLimitedUntil` (a missing or unparsable time: at once). A `timeLimited` that is present and
 * not an array (an unknown shape) makes both position verdicts false.
 *
 * @param {import('./config.js').PreflightVerdicts} v
 * @param {'assets' | 'publish' | 'declared'} shape
 * @returns {boolean}
 */
export function preflightAllows(v, shape) {
  /** @type {unknown} */
  const listed = v.timeLimited;
  const malformed = listed !== undefined && !Array.isArray(listed);
  const limited = Array.isArray(listed) ? listed : [];
  const until = typeof v.timeLimitedUntil === 'string' ? Date.parse(v.timeLimitedUntil) : NaN;
  const now = Date.now();
  /** @param {'positionSafe' | 'declaredPositionSafe'} name */
  const holds = (name) =>
    v[name] === true && !malformed && !(limited.includes(name) && !(now < until));
  switch (shape) {
    case 'assets':
      return v.ruleEngineSafe === true && v.linkedNamespaceSafe === true;
    case 'publish':
      return v.ruleEngineSafe === true && holds('positionSafe');
    case 'declared':
      return (
        v.ruleEngineSafe === true && v.linkedNamespaceSafe === true && holds('declaredPositionSafe')
      );
    default:
      throw new TypeError(`preflightAllows: unknown shape ${JSON.stringify(shape)}`);
  }
}

/**
 * @param {unknown} value
 * @returns {import('./config.js').PreflightVerdicts}
 */
function pickVerdicts(value) {
  const v = /** @type {Record<string, unknown>} */ (value ?? {});
  // A `timeLimited` that is present and not an array is an unknown shape: the position verdicts it could
  // limit are dropped with it (false), as the harness reader does.
  const malformed = v.timeLimited !== undefined && !Array.isArray(v.timeLimited);
  const listed = Array.isArray(v.timeLimited) ? v.timeLimited : [];
  const limited = /** @type {('positionSafe' | 'declaredPositionSafe')[]} */ (
    ['positionSafe', 'declaredPositionSafe'].filter((name) => listed.includes(name))
  );
  return {
    ruleEngineSafe: v.ruleEngineSafe === true,
    positionSafe: !malformed && v.positionSafe === true,
    declaredPositionSafe: !malformed && v.declaredPositionSafe === true,
    linkedNamespaceSafe: v.linkedNamespaceSafe === true,
    linkedCount: typeof v.linkedCount === 'number' ? v.linkedCount : 0,
    blocking: Array.isArray(v.blocking)
      ? v.blocking.map((b) => ({ index: Number(b?.index), eventType: String(b?.eventType) }))
      : [],
    ...(limited.length > 0
      ? {
          timeLimited: limited,
          timeLimitedUntil: typeof v.timeLimitedUntil === 'string' ? v.timeLimitedUntil : null,
        }
      : {}),
  };
}

/**
 * Raw authenticated GET used by the preflight (no SDK involved).
 *
 * @param {import('./config.js').ExampleConfig} config
 * @param {string} template path with `{ns}`
 * @returns {Promise<unknown>}
 */
async function rawGet(config, template) {
  const url = `${config.baseUrl}${template.replace('{ns}', encodeURIComponent(config.namespace))}`;
  const res = await fetch(url, {
    headers: { 'X-API-Key': config.apiKey, Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`preflight read failed: GET ${template} answered ${res.status}`);
  return res.json();
}

/**
 * The four preflight verdicts. Reads `.state/<runId>/preflight.json` when RTLS_IT_RUN_ID is set and
 * the file exists (the guarded runners write the same file); else reads the alert rules and the asset
 * list raw, evaluates them with `examples/shared/preflight.js` and, when RTLS_IT_RUN_ID is set, writes
 * the file. Computed here, without the run's history, the `time_in_zone` leaf always counts as "may
 * match" (a guarded write pass reads the runner's file instead). `client` is accepted for call-site
 * compatibility and unused.
 *
 * @param {unknown} [_client]
 * @returns {Promise<import('./config.js').PreflightVerdicts>}
 */
export async function preflightRules(_client) {
  const sharedRun = Boolean(process.env.RTLS_IT_RUN_ID);
  const file = join(stateRoot, runId, 'preflight.json');
  if (sharedRun && existsSync(file)) return pickVerdicts(JSON.parse(readFileSync(file, 'utf8')));

  const config = loadConfig();
  // Computed specifier: the evaluators live in preflight.js and are loaded only here.
  const evaluators = await import(new URL('./preflight.js', import.meta.url).href);
  const rulesDoc = await rawGet(config, '/alert_rules/{ns}');
  const assets = await rawGet(config, '/assets/{ns}');
  const rules = evaluators.evaluateAlertRules(rulesDoc);
  const linked = evaluators.evaluateLinkedNamespace(assets, config.namespace);
  const verdicts = pickVerdicts({ ...rules, ...linked });

  if (sharedRun) {
    mkdirSync(dirname(file), { recursive: true });
    try {
      writeFileSync(file, JSON.stringify(verdicts, null, 2) + '\n', { flag: 'wx' });
    } catch (err) {
      // Another process of the run wrote it first: the run keeps one preflight.
      if (/** @type {NodeJS.ErrnoException} */ (err).code !== 'EEXIST') throw err;
      return pickVerdicts(JSON.parse(readFileSync(file, 'utf8')));
    }
  }
  return verdicts;
}

/**
 * `{ baseUrl: 'http://192.0.2.1/api', apiKey: 'sdk-test-dummy-key', namespace }`, usable as
 * createExampleClient overrides.
 *
 * @returns {{ baseUrl: string; apiKey: string; namespace: string }}
 */
export function unreachableConfig() {
  return {
    baseUrl: UNREACHABLE_BASE_URL,
    apiKey: DUMMY_API_KEY,
    namespace: loadConfig().namespace,
  };
}

/**
 * Single-line, credential-free text of an error.
 *
 * @param {unknown} err
 * @param {string} apiKey
 */
function describeError(err, apiKey) {
  const e = /** @type {{ name?: unknown; message?: unknown }} */ (err ?? {});
  const name = typeof e.name === 'string' && e.name !== '' ? e.name : 'Error';
  let message =
    err instanceof Error || typeof e.message === 'string' ? String(e.message) : String(err);
  if (apiKey) message = message.split(apiKey).join('<redacted>');
  return `${name}: ${message.replace(/\s*\n\s*/g, ' ').trim()}`;
}

/**
 * Prints the final marker line, then exits once stdout has flushed it.
 *
 * @param {number} code
 * @param {string} line
 * @returns {Promise<void>}
 */
function finish(code, line) {
  return new Promise((done) => {
    process.stdout.write(`${line}\n`, () => {
      process.exit(code);
      done();
    });
  });
}

/**
 * Runs an example: success → `DONE <id>` (exit 0); skip() → `SKIPPED: <category> <text>` (exit 0);
 * error → `FAILED <id>: <name>: <message>` (exit 1, no stack, no credentials). The context's
 * `signal` aborts at the overall deadline of 120 s, which also fails the run. A `--write` run whose
 * tier variables (missingTierVariables) are not set on the command line ends as
 * `SKIPPED: tier …` before `main` runs, also when started directly.
 *
 * @param {string} id
 * @param {(ctx: { config: import('./config.js').ExampleConfig; client: import('ubudu-rtls-sdk').RtlsClient; log: (...a: unknown[]) => void; signal: AbortSignal }) => Promise<void>} main
 * @returns {Promise<void>}
 */
export async function runExample(id, main) {
  const config = loadConfig();
  const controller = new AbortController();
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let timer;
  const deadline = new Promise((_resolve, reject) => {
    timer = setTimeout(() => {
      const err = new Error(`example deadline of ${EXAMPLE_DEADLINE_MS / 1000} s exceeded`);
      err.name = 'TimeoutError';
      controller.abort(err);
      reject(err);
    }, EXAMPLE_DEADLINE_MS);
  });
  /** @type {[number, string]} */
  let outcome;
  try {
    if (config.write) {
      const missing = missingTierVariables(process.argv[1], process.env);
      if (missing.length > 0) {
        skip(
          'tier',
          `--write needs ${missing.map((k) => `${k}=1`).join(' and ')} on the command line`
        );
      }
    }
    const client = createExampleClient();
    /** @param {...unknown} args */
    const log = (...args) => console.log(...args);
    const running = Promise.resolve().then(() =>
      main({ config, client, log, signal: controller.signal })
    );
    // A rejection that arrives after the deadline is reported by the deadline, never as unhandled.
    running.catch(() => {});
    await Promise.race([running, deadline]);
    outcome = [0, `DONE ${id}`];
  } catch (err) {
    outcome =
      err instanceof ExampleSkip
        ? [0, `SKIPPED: ${err.category} ${err.text}`]
        : [1, `FAILED ${id}: ${describeError(err, config.apiKey)}`];
  } finally {
    clearTimeout(timer);
  }
  await finish(outcome[0], outcome[1]);
}
