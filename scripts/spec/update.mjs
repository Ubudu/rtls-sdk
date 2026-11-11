#!/usr/bin/env node
// `npm run spec:update` (P0 §6.1, D5): refreshes the vendored spec from the live API. Manual only; nothing
// runs it at install or build time.
//
//   node scripts/spec/update.mjs
//
// One public request, no credential: GET ${RTLS_BASE_URL}/docs/swagger.json (RTLS_BASE_URL from the process
// environment, default https://rtls.ubudu.com/api; .env is not read). The response is normalised
// (scripts/spec/normalize.mjs), spec/rtls-api.swagger.json and spec/spec.lock.json are written, and the
// added and removed operations are printed. Afterwards: `npm run generate && npm run spec:check`, and
// reconcile spec/manifest/base.json with the orchestrator (P0 §4.2).
// Exit codes: 0 written, 2 fetch failed or the response is not an OpenAPI document.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { LOCK_PATH, SPEC_PATH, listOperations, lockText, vendorSpec } from './normalize.mjs';

export const DEFAULT_BASE_URL = 'https://rtls.ubudu.com/api';
export const FETCH_TIMEOUT_MS = 30_000;

export class SpecFetchError extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message);
    this.name = 'SpecFetchError';
  }
}

/**
 * The public URL of the live spec for a base URL (trailing slashes and any user info removed).
 *
 * @param {string | undefined} [baseUrl]
 */
export function liveSpecUrl(baseUrl = process.env.RTLS_BASE_URL || DEFAULT_BASE_URL) {
  const url = new URL(baseUrl.replace(/\/+$/, '') + '/docs/swagger.json');
  url.username = '';
  url.password = '';
  return url.href;
}

/**
 * Downloads the live spec: one GET without any credential header. Throws SpecFetchError on a network
 * error, a non-2xx status, a body that is not JSON, or JSON that is not an OpenAPI document.
 *
 * @param {{ url?: string; fetchImpl?: typeof fetch; timeoutMs?: number }} [options]
 * @returns {Promise<{ url: string; text: string; spec: Record<string, any> }>}
 */
export async function fetchLiveSpec({
  url = liveSpecUrl(),
  fetchImpl = globalThis.fetch,
  timeoutMs = FETCH_TIMEOUT_MS,
} = {}) {
  /** @type {Response} */
  let response;
  try {
    response = await fetchImpl(url, {
      method: 'GET',
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    const e = /** @type {Error & { cause?: Error }} */ (err);
    throw new SpecFetchError(
      `GET ${url} failed: ${e?.message ?? String(err)}${e?.cause?.message ? ` (${e.cause.message})` : ''}`
    );
  }
  if (!response.ok) throw new SpecFetchError(`GET ${url} answered ${response.status}`);
  const text = await response.text();
  /** @type {unknown} */
  let spec;
  try {
    spec = JSON.parse(text);
  } catch {
    throw new SpecFetchError(`GET ${url} did not return JSON`);
  }
  if (
    spec === null ||
    typeof spec !== 'object' ||
    !('openapi' in spec || 'swagger' in spec) ||
    !('paths' in spec) ||
    typeof (/** @type {Record<string, unknown>} */ (spec).paths) !== 'object'
  )
    throw new SpecFetchError(`GET ${url} did not return an OpenAPI document`);
  return { url, text, spec: /** @type {Record<string, any>} */ (spec) };
}

/**
 * Operation ids added and removed between two specs.
 *
 * @param {{ paths?: Record<string, unknown> } | null} before
 * @param {{ paths?: Record<string, unknown> }} after
 */
export function operationDelta(before, after) {
  const a = new Set(before ? listOperations(before) : []);
  const b = new Set(listOperations(after));
  return {
    added: [...b].filter((id) => !a.has(id)).sort(),
    removed: [...a].filter((id) => !b.has(id)).sort(),
  };
}

/**
 * Fetches, normalises and writes the spec and its lock.
 *
 * @param {{ url?: string; fetchImpl?: typeof fetch; specPath?: string; lockPath?: string }} [options]
 */
export async function updateSpec({
  url = liveSpecUrl(),
  fetchImpl,
  specPath = SPEC_PATH,
  lockPath = LOCK_PATH,
} = {}) {
  const live = await fetchLiveSpec({ url, fetchImpl });
  const previous = existsSync(specPath) ? JSON.parse(readFileSync(specPath, 'utf8')) : null;
  const { text, lock } = vendorSpec(live.text, url);
  mkdirSync(dirname(specPath), { recursive: true });
  writeFileSync(specPath, text);
  mkdirSync(dirname(lockPath), { recursive: true });
  writeFileSync(lockPath, lockText(lock));
  return {
    url,
    lock,
    previousVersion: previous?.info?.version ?? null,
    ...operationDelta(previous, JSON.parse(text)),
  };
}

/**
 * @param {readonly string[]} argv
 * @param {{ fetchImpl?: typeof fetch; specPath?: string; lockPath?: string; log?: (l: string) => void; error?: (l: string) => void }} [env]
 * @returns {Promise<number>}
 */
export async function main(argv, env = {}) {
  const log = env.log ?? ((l) => console.log(l));
  const error = env.error ?? ((l) => console.error(l));
  if (argv.length) {
    error(`spec:update: unexpected argument ${argv[0]}\nusage: update.mjs`);
    return 2;
  }
  try {
    const r = await updateSpec(env);
    const rel = (/** @type {string} */ p) => relative(process.cwd(), p) || p;
    log(`spec:update: ${r.url}`);
    log(
      `spec:update: version ${r.previousVersion ?? '(none)'} → ${r.lock.version}; ${r.lock.operations} operations, ${r.lock.paths} paths; wrote ${rel(env.specPath ?? SPEC_PATH)} and ${rel(env.lockPath ?? LOCK_PATH)}`
    );
    log(`spec:update: ${r.added.length} added, ${r.removed.length} removed operation(s)`);
    for (const id of r.added) log(`  + ${id}`);
    for (const id of r.removed) log(`  - ${id}`);
    log(
      'spec:update: next: npm run generate && npm run spec:check; reconcile spec/manifest/base.json'
    );
    return 0;
  } catch (err) {
    if (err instanceof SpecFetchError) {
      error(`spec:update: ${err.message}`);
      return 2;
    }
    throw err;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).then(
    (code) => {
      process.exitCode = code;
    },
    (err) => {
      console.error(
        `spec:update: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`
      );
      process.exitCode = 2;
    }
  );
}
