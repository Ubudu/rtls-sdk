// Types of examples/shared/config.js.
import type { RtlsClient, RtlsClientOptions } from 'ubudu-rtls-sdk';

export interface ExampleConfig {
  apiKey: string;
  namespace: string;
  baseUrl: string;
  /** started with `--write` */
  write: boolean;
  runId: string;
}

export declare const DEFAULT_BASE_URL: string;
/** `sdk-test-dummy-key`: the credential of unreachable clients, never the configured key. */
export declare const DUMMY_API_KEY: string;
/** `http://192.0.2.1/api` (RFC 5737). */
export declare const UNREACHABLE_BASE_URL: string;
export declare const EXAMPLE_DEADLINE_MS: number;

/** RTLS_IT_RUN_ID when set (must match /^[0-9a-f]{8}$/, else exit 2), else random 8 hex. */
export declare const runId: string;

/**
 * Root `.env` via dotenv (quiet, nothing copied into process.env) unless the variables are already
 * set; missing variables → `CONFIG MISSING: <names>` (names only), exit 3; a tier key or an
 * `RTLS_IT_INTERNAL_` key in `.env` → `CONFIG INVALID: <names>`, exit 2.
 */
export declare function loadConfig(): ExampleConfig;

/** createRtlsClient with the loaded apiKey, baseUrl and namespace; `overrides` win. */
export declare function createExampleClient(overrides?: Partial<RtlsClientOptions>): RtlsClient;

/** `--<name>` present. */
export declare function hasFlag(name: string, argv?: readonly string[]): boolean;
/** `--<name>=v` or `--<name> v`, else `fallback`. */
export declare function getArg(name: string, fallback: string, argv?: readonly string[]): string;

/** `sdk-test-${runId}-${label}`, label /^[a-z0-9][a-z0-9-]{0,39}$/. */
export declare function testName(label: string): string;
/** n 0..255 → '025d4b' + runId.slice(0, 4) + hex2(n); same scheme as harness.testMac. */
export declare function testMac(n: number): string;
/** Same rule as harness.isTestMac: separators and case ignored; 12 hex starting 025d4b. */
export declare function isTestMac(mac: string): boolean;

export type SkipCategory = 'feature-off' | 'role' | 'tier' | 'no-fixture' | 'preflight';
export declare const SKIP_CATEGORIES: readonly SkipCategory[];

export declare class ExampleSkip extends Error {
  readonly category: SkipCategory;
  readonly text: string;
  constructor(category: SkipCategory, text: string);
}

/** Throws ExampleSkip; runExample prints `SKIPPED: <category> <text>` and exits 0. */
export declare function skip(category: SkipCategory, text: string): never;

/** Prints `BUDGET positions=<n> notifications=<n> ble=<n> etl=<n>`. */
export declare function reportBudget(counts: {
  positions?: number;
  notifications?: number;
  ble?: number;
  etl?: number;
}): void;

/** The four preflight verdicts, as written to preflight.json. */
export interface PreflightVerdicts {
  ruleEngineSafe: boolean;
  positionSafe: boolean;
  declaredPositionSafe: boolean;
  linkedNamespaceSafe: boolean;
  linkedCount: number;
  blocking: { index: number; eventType: string }[];
  /**
   * Position verdicts that hold only through the `time_in_zone` leaf: each counts as false from
   * `timeLimitedUntil` on (ISO time; missing or unparsable → at once). Absent when none is. Present
   * and not an array (an unknown shape): both position verdicts count as false.
   */
  timeLimited?: ('positionSafe' | 'declaredPositionSafe')[];
  timeLimitedUntil?: string | null;
}

/**
 * Reads `.state/<runId>/preflight.json` when RTLS_IT_RUN_ID is set and the file exists; else reads
 * the alert rules and the assets raw, evaluates them (examples/shared/preflight.js; the
 * `time_in_zone` leaf counts as "may match" there) and writes the file when RTLS_IT_RUN_ID is set.
 * `client` is accepted for call-site compatibility.
 */
export declare function preflightRules(client?: unknown): Promise<PreflightVerdicts>;

/**
 * 'assets' → ruleEngineSafe && linkedNamespaceSafe; 'publish' → ruleEngineSafe && positionSafe;
 * 'declared' → ruleEngineSafe && linkedNamespaceSafe && declaredPositionSafe; a verdict listed in
 * `timeLimited` counts as false from `timeLimitedUntil` on (a `timeLimited` that is not an array:
 * both position verdicts at once).
 */
export declare function preflightAllows(
  v: PreflightVerdicts,
  shape: 'assets' | 'publish' | 'declared'
): boolean;

/** `{ baseUrl: 'http://192.0.2.1/api', apiKey: 'sdk-test-dummy-key', namespace }`. */
export declare function unreachableConfig(): { baseUrl: string; apiKey: string; namespace: string };

export interface ExampleContext {
  config: ExampleConfig;
  client: RtlsClient;
  log: (...a: unknown[]) => void;
  /** aborted at the overall deadline of 120 s */
  signal: AbortSignal;
}

/**
 * success → `DONE <id>` last line, exit 0; ExampleSkip → `SKIPPED: <category> <text>`, exit 0;
 * error → `FAILED <id>: <name>: <message>` (no stack, no credentials), exit 1. A `--write` run whose
 * tier variables are not set to `1` (missingTierVariables) → `SKIPPED: tier …` before `main` runs.
 */
export declare function runExample(
  id: string,
  main: (ctx: ExampleContext) => Promise<void>
): Promise<void>;

/**
 * @internal The tier variables a `--write` run of the example file needs and `env` does not set to `1`: W →
 * RTLS_IT_WRITES; C → also RTLS_IT_CONFIG; S → also RTLS_IT_SIDE_EFFECTS; none → none; an unreadable file or
 * first-line header → all three.
 */
export declare function missingTierVariables(
  file: string | undefined,
  env: NodeJS.ProcessEnv
): string[];

/** @internal */
export declare function resolveRunId(
  env: NodeJS.ProcessEnv
): { ok: true; runId: string } | { ok: false; code: number; message: string };

/** @internal */
export declare function resolveConfig(input: {
  env: NodeJS.ProcessEnv;
  dotenvText?: string | null;
  argv?: readonly string[];
  runId: string;
}): { ok: true; config: ExampleConfig } | { ok: false; code: number; message: string };

/**
 * @internal Test hook: use another `.env` file and another state root for preflightRules(), and clear
 * the cached configuration.
 */
export declare function _resetConfigForTesting(options?: {
  envPath?: string;
  stateRoot?: string;
}): void;
