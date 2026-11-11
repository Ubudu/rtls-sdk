#!/usr/bin/env node
// Normalised form of the vendored OpenAPI spec (P0 §5.1):
//   JSON.stringify(sortKeysDeep(spec), null, 2) + '\n'
// Objects are key-sorted recursively, arrays keep their order, line endings are LF.
// `spec/spec.lock.json` records { version, sha256, operations, paths, source }; the hash is over the
// normalised file.
//
// CLI:
//   node scripts/spec/normalize.mjs --from <raw.json> [--out <spec.json>] [--lock <lock.json>] [--source-url <url>]
//       normalise <raw.json>, write the spec (default spec/rtls-api.swagger.json) and its lock
//       (default spec/spec.lock.json)
//   node scripts/spec/normalize.mjs --check [<spec.json>]
//       exit 0 when the file is already in normalised form (re-normalising is byte-identical), 1 otherwise
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/**
 * @typedef {{ url: string; rawSha256?: string }} SpecSource
 * @typedef {{ version: string | null; sha256: string; operations: number; paths: number; source: SpecSource }} SpecLock
 */

export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const SPEC_PATH = resolve(REPO_ROOT, 'spec', 'rtls-api.swagger.json');
export const LOCK_PATH = resolve(REPO_ROOT, 'spec', 'spec.lock.json');
/** Public, unauthenticated location of the live spec (`spec:update` fetches `${RTLS_BASE_URL}/docs/swagger.json`). */
export const DEFAULT_SOURCE_URL = 'https://rtls.ubudu.com/api/docs/swagger.json';

export const HTTP_METHODS = Object.freeze([
  'get',
  'put',
  'post',
  'delete',
  'options',
  'head',
  'patch',
  'trace',
]);

/**
 * Returns a deep copy whose plain objects have their keys inserted in sorted order. Arrays keep their
 * order. Note: JavaScript always enumerates integer-like keys (e.g. response codes) first, in numeric
 * order; the output is still deterministic and idempotent.
 *
 * @param {unknown} value
 * @returns {unknown}
 */
export function sortKeysDeep(value) {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value !== null && typeof value === 'object') {
    const source = /** @type {Record<string, unknown>} */ (value);
    /** @type {Record<string, unknown>} */
    const out = {};
    for (const key of Object.keys(source).sort()) out[key] = sortKeysDeep(source[key]);
    return out;
  }
  return value;
}

/**
 * Normalised text of a parsed spec.
 *
 * @param {unknown} spec
 * @returns {string}
 */
export function normalizeSpec(spec) {
  return JSON.stringify(sortKeysDeep(spec), null, 2) + '\n';
}

/**
 * Normalised text of a spec given as JSON text (any key order, any whitespace, CRLF or LF).
 *
 * @param {string} text
 * @returns {string}
 */
export function normalizeSpecText(text) {
  return normalizeSpec(JSON.parse(text));
}

/**
 * @param {string} text
 * @returns {string}
 */
export function sha256(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

/**
 * Lists the operations of a spec as `"METHOD path"` ids, in path order then method order.
 *
 * @param {{ paths?: Record<string, unknown> }} spec
 * @returns {string[]}
 */
export function listOperations(spec) {
  /** @type {string[]} */
  const ids = [];
  for (const [path, item] of Object.entries(spec.paths ?? {})) {
    if (item === null || typeof item !== 'object') continue;
    const pathItem = /** @type {Record<string, unknown>} */ (item);
    for (const method of HTTP_METHODS) {
      if (pathItem[method]) ids.push(`${method.toUpperCase()} ${path}`);
    }
  }
  return ids;
}

/**
 * @param {{ paths?: Record<string, unknown> }} spec
 * @returns {{ operations: number; paths: number }}
 */
export function countSpec(spec) {
  return { operations: listOperations(spec).length, paths: Object.keys(spec.paths ?? {}).length };
}

/**
 * Builds the lock object for a normalised spec text.
 *
 * @param {string} normalizedText
 * @param {SpecSource} [source]
 * @returns {SpecLock}
 */
export function buildLock(normalizedText, source = { url: DEFAULT_SOURCE_URL }) {
  const spec = JSON.parse(normalizedText);
  const { operations, paths } = countSpec(spec);
  return {
    version: spec.info?.version ?? null,
    sha256: sha256(normalizedText),
    operations,
    paths,
    source,
  };
}

/**
 * @param {SpecLock} lock
 * @returns {string}
 */
export function lockText(lock) {
  return JSON.stringify(lock, null, 2) + '\n';
}

/**
 * Normalises a raw spec text and returns `{ text, lock }`. The lock's `source` records where the
 * snapshot came from: `{ url, rawSha256 }` (the hash of the bytes as read, before normalisation).
 *
 * @param {string} rawText
 * @param {string} [sourceUrl]
 * @returns {{ text: string; lock: SpecLock }}
 */
export function vendorSpec(rawText, sourceUrl = DEFAULT_SOURCE_URL) {
  const text = normalizeSpecText(rawText);
  const lock = buildLock(text, { url: sourceUrl, rawSha256: sha256(rawText) });
  return { text, lock };
}

/**
 * True when `text` is byte-identical to its own normalisation.
 *
 * @param {string} text
 * @returns {boolean}
 */
export function isNormalized(text) {
  return normalizeSpecText(text) === text;
}

/**
 * @param {string[]} argv
 */
function parseArgs(argv) {
  const args = {
    check: false,
    /** @type {string | null} */
    from: null,
    out: SPEC_PATH,
    lock: LOCK_PATH,
    sourceUrl: DEFAULT_SOURCE_URL,
    /** @type {string[]} */
    rest: [],
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => {
      const v = argv[++i];
      if (v === undefined) throw new Error(`missing value after ${a}`);
      return v;
    };
    if (a === '--check') args.check = true;
    else if (a === '--from') args.from = next();
    else if (a === '--out') args.out = resolve(next());
    else if (a === '--lock') args.lock = resolve(next());
    else if (a === '--source-url') args.sourceUrl = next();
    else if (a !== undefined) args.rest.push(a);
  }
  return args;
}

/**
 * @param {string[]} argv
 * @returns {number}
 */
function main(argv) {
  const args = parseArgs(argv);
  if (args.check) {
    const file = args.rest[0] ? resolve(args.rest[0]) : SPEC_PATH;
    const ok = isNormalized(readFileSync(file, 'utf8'));
    console.log(ok ? `normalised: ${file}` : `NOT normalised: ${file}`);
    return ok ? 0 : 1;
  }
  if (!args.from) {
    console.error(
      'usage: normalize.mjs --from <raw.json> [--out <spec.json>] [--lock <lock.json>] [--source-url <url>] | --check [<spec.json>]'
    );
    return 2;
  }
  const raw = readFileSync(resolve(args.from), 'utf8');
  const { text, lock } = vendorSpec(raw, args.sourceUrl);
  mkdirSync(dirname(args.out), { recursive: true });
  writeFileSync(args.out, text);
  mkdirSync(dirname(args.lock), { recursive: true });
  writeFileSync(args.lock, lockText(lock));
  console.log(
    `wrote ${args.out}: version ${lock.version}, ${lock.operations} operations, ${lock.paths} paths, sha256 ${lock.sha256}`
  );
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.exitCode = main(process.argv.slice(2));
}
