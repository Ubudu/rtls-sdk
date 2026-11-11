// Small argument parser shared by the P0 CLIs (P0 §3.1). No dependencies.
//
//   parseArgs(argv, { flags: ['release', 'json'], options: ['phase'] })
//     → { flags: { release: boolean, json: boolean }, options: { phase?: string }, positionals: string[] }
//
// `--name=value` and `--name value` are both accepted for options. `--` ends option parsing. An unknown
// `--option` throws a UsageError (the CLIs map it to exit 2).
import { PHASES } from './ownership.mjs';

export class UsageError extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message);
    this.name = 'UsageError';
  }
}

/**
 * @template {string} F
 * @template {string} O
 * @param {readonly string[]} argv
 * @param {{ flags?: readonly F[]; options?: readonly O[]; multi?: readonly O[] }} spec
 * @returns {{ flags: Record<F, boolean>; options: Partial<Record<O, string>>; lists: Partial<Record<O, string[]>>; positionals: string[] }}
 */
export function parseArgs(argv, spec) {
  const flagNames = new Set(spec.flags ?? []);
  const optionNames = new Set([...(spec.options ?? []), ...(spec.multi ?? [])]);
  const multi = new Set(spec.multi ?? []);
  const flags = /** @type {Record<F, boolean>} */ (
    Object.fromEntries([...flagNames].map((f) => [f, false]))
  );
  /** @type {Partial<Record<O, string>>} */
  const options = {};
  /** @type {Partial<Record<O, string[]>>} */
  const lists = {};
  /** @type {string[]} */
  const positionals = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = /** @type {string} */ (argv[i]);
    if (arg === '--') {
      positionals.push(...argv.slice(i + 1));
      break;
    }
    if (!arg.startsWith('--') || arg === '-') {
      positionals.push(arg);
      continue;
    }
    const eq = arg.indexOf('=');
    const name = arg.slice(2, eq === -1 ? undefined : eq);
    if (flagNames.has(/** @type {F} */ (name))) {
      if (eq !== -1) throw new UsageError(`--${name} takes no value`);
      flags[/** @type {F} */ (name)] = true;
      continue;
    }
    if (optionNames.has(/** @type {O} */ (name))) {
      let value;
      if (eq !== -1) value = arg.slice(eq + 1);
      else {
        value = argv[++i];
        if (value === undefined || value.startsWith('--'))
          throw new UsageError(`--${name} needs a value`);
      }
      const key = /** @type {O} */ (name);
      if (multi.has(key)) (lists[key] ??= []).push(value);
      else options[key] = value;
      continue;
    }
    throw new UsageError(`unknown option ${arg}`);
  }
  return { flags, options, lists, positionals };
}

/**
 * Validates a `--phase` value (P0…P10).
 *
 * @param {string | undefined} value
 * @returns {string | undefined}
 */
export function parsePhase(value) {
  if (value === undefined) return undefined;
  if (!(/** @type {readonly string[]} */ (PHASES).includes(value)))
    throw new UsageError(`--phase must be one of ${PHASES.join(', ')} (got ${value})`);
  return value;
}
