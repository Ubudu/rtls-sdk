// Live environment (P0 §6.2 `env.ts`). The only harness module that reads `.env` and the process
// environment. `.env` is read with dotenv `parse`; nothing from it is copied into `process.env`, and no
// value is ever printed. Tier flags come from the process environment only (set on the command line,
// LIVE-TESTING §3); a tier key or an `RTLS_IT_INTERNAL_` key found in `.env` is a precondition error (exit 2).
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { inspect } from 'node:util';
import { parse } from 'dotenv';
import { CHECKOUT_ROOT } from './state-io.mjs';

export type Tier = 'R' | 'W' | 'C' | 'S';
export const TIERS: readonly Tier[] = ['R', 'W', 'C', 'S'];

/** Command-line variable that enables each tier (R is always enabled). */
export const TIER_FLAGS = {
  W: 'RTLS_IT_WRITES',
  C: 'RTLS_IT_CONFIG',
  S: 'RTLS_IT_SIDE_EFFECTS',
} as const;

/** Prefix of the variables set only by the harness and the runners (CONVENTIONS §7). */
export const INTERNAL_PREFIX = 'RTLS_IT_INTERNAL_';
/** The internal variables (the only one is the lock token of the run, lock.mjs). */
export const INTERNAL_VARIABLES = ['RTLS_IT_INTERNAL_LOCK_TOKEN'] as const;

export const DEFAULT_BASE_URL = 'https://rtls.ubudu.com/api';
/** `.env` of this checkout. */
export const ENV_FILE = join(CHECKOUT_ROOT, '.env');

const REQUIRED = ['RTLS_API_KEY', 'APP_NAMESPACE'] as const;

/** Credentials are missing (driver exit 3). The message names variables, never values. */
export class ContextMissing extends Error {
  readonly exitCode = 3;
  readonly names: string[];
  constructor(names: string[]) {
    super(`credentials missing: ${names.join(', ')}`);
    this.name = 'ContextMissing';
    this.names = names;
  }
}

/** A precondition does not hold (driver exit 2). The message names variables, never values. */
export class HarnessPrecondition extends Error {
  readonly exitCode = 2;
  readonly names: string[];
  constructor(message: string, names: string[] = []) {
    super(message);
    this.name = 'HarnessPrecondition';
    this.names = names;
  }
}

export interface LiveEnv {
  apiKey: string;
  namespace: string;
  baseUrl: string;
  origin: string;
  basePath: string;
  tiers: Record<Tier, boolean>;
}

/** Where the environment is read from; unit tests pass their own sources and never read the real `.env`. */
export interface EnvSources {
  processEnv?: NodeJS.ProcessEnv;
  /** Path of the `.env` file (default: this checkout's `.env`); `null` = no file. */
  envFile?: string | null;
  /** Content of a `.env` file, instead of `envFile`. */
  dotenvText?: string | null;
}

function dotenvVariables(sources: EnvSources): Record<string, string> {
  let text: string | null | undefined = sources.dotenvText;
  if (text === undefined) {
    const file = sources.envFile === undefined ? ENV_FILE : sources.envFile;
    text = file !== null && existsSync(file) ? readFileSync(file, 'utf8') : null;
  }
  if (!text) return {};
  const variables = parse(text);
  const invalid = Object.keys(variables).filter(
    (key) =>
      (Object.values(TIER_FLAGS) as string[]).includes(key) || key.startsWith(INTERNAL_PREFIX)
  );
  if (invalid.length > 0) {
    throw new HarnessPrecondition(
      `.env must not contain tier or internal variables (set tier flags on the command line): ${invalid.join(', ')}`,
      invalid
    );
  }
  return variables;
}

/** Tier flags from a process environment: R always; W, C, S only when their variable is exactly `'1'`. */
export function tiersFrom(processEnv: NodeJS.ProcessEnv): Record<Tier, boolean> {
  return {
    R: true,
    W: processEnv[TIER_FLAGS.W] === '1',
    C: processEnv[TIER_FLAGS.C] === '1',
    S: processEnv[TIER_FLAGS.S] === '1',
  };
}

/** Checks `.env` for tier and internal keys (throws HarnessPrecondition, exit 2). */
export function checkDotenv(sources: EnvSources = {}): void {
  dotenvVariables(sources);
}

/**
 * The variables of `.env` (parsed, never copied into `process.env`; tier and internal keys → HarnessPrecondition).
 * Only the scan CLI reads them, to look for their values in files; nothing prints a value.
 *
 * @internal
 */
export function dotenvValues(sources: EnvSources = {}): Record<string, string> {
  return { ...dotenvVariables(sources) };
}

function resolveVariables(sources: EnvSources): {
  get: (key: string) => string | undefined;
  processEnv: NodeJS.ProcessEnv;
} {
  const processEnv = sources.processEnv ?? process.env;
  const fileVars = dotenvVariables(sources);
  const get = (key: string): string | undefined => {
    const fromEnv = processEnv[key];
    if (fromEnv !== undefined && fromEnv !== '') return fromEnv;
    const fromFile = fileVars[key];
    return fromFile !== undefined && fromFile !== '' ? fromFile : undefined;
  };
  return { get, processEnv };
}

/** True when both credentials are present (process environment first, then `.env`). */
export function hasCredentials(sources: EnvSources = {}): boolean {
  const { get } = resolveVariables(sources);
  return REQUIRED.every((key) => get(key) !== undefined);
}

/** The live environment; throws ContextMissing when a credential is absent. */
export function liveEnv(sources: EnvSources = {}): LiveEnv {
  const { get, processEnv } = resolveVariables(sources);
  const missing = REQUIRED.filter((key) => get(key) === undefined);
  if (missing.length > 0) throw new ContextMissing([...missing]);
  return makeLiveEnv({
    apiKey: get('RTLS_API_KEY') as string,
    namespace: get('APP_NAMESPACE') as string,
    baseUrl: get('RTLS_BASE_URL') ?? DEFAULT_BASE_URL,
    tiers: tiersFrom(processEnv),
  });
}

/**
 * Builds a LiveEnv whose JSON and inspection forms never contain the key or the namespace.
 *
 * @internal unit tests build their environment with it
 */
export function makeLiveEnv(input: {
  apiKey: string;
  namespace: string;
  baseUrl: string;
  tiers: Record<Tier, boolean>;
}): LiveEnv {
  const baseUrl = input.baseUrl.replace(/\/+$/, '');
  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    throw new HarnessPrecondition('RTLS_BASE_URL is not an absolute URL', ['RTLS_BASE_URL']);
  }
  const env: LiveEnv = {
    apiKey: input.apiKey,
    namespace: input.namespace,
    baseUrl,
    origin: url.origin,
    basePath: url.pathname.replace(/\/+$/, ''),
    tiers: { ...input.tiers },
  };
  const redacted = (): Record<string, unknown> => ({
    apiKey: '<redacted>',
    namespace: '<redacted>',
    baseUrl: env.baseUrl,
    origin: env.origin,
    basePath: env.basePath,
    tiers: env.tiers,
  });
  Object.defineProperty(env, 'toJSON', { value: redacted, enumerable: false });
  Object.defineProperty(env, inspect.custom, { value: redacted, enumerable: false });
  return env;
}
