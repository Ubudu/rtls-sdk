// Operation-manifest loader (P0 §5.5.2, §5.5.3, CONVENTIONS §8). Used by the manifest checks, by
// `npm run manifest:report` and by P9's endpoint-coverage generator.
//
//   spec/manifest/base.json       all 176 spec operations: { id, tag, phase, decision, reason? }
//   spec/manifest/P1.json … P8.json phase manifests (owned by their phase): { phase, domain, status, operations,
//                                  nonHttp?, sdkMethods?, aliases?, localMethods? }
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT } from '../lib/git.mjs';

/**
 * @typedef {{ id: string; tag: string; phase: string; decision: 'wrap' | 'exclude'; reason?: string }} BaseOperation
 * @typedef {{ specVersion: string; operations: BaseOperation[] }} BaseManifest
 * @typedef {string | string[]} StringOrList
 * @typedef {{ op: string; decision: 'wrap' | 'exclude'; reason?: string; sdk?: StringOrList; unit?: StringOrList;
 *   live?: StringOrList; tier?: 'R' | 'W' | 'C' | 'S'; allowlist?: string; realPath?: string; usi?: string[] }} OperationEntry
 * @typedef {{ id: string; kind: 'ws-endpoint' | 'ws-command' | 'ws-message'; decision: 'wrap' | 'exclude';
 *   reason?: string; sdk?: StringOrList; unit?: StringOrList; live?: StringOrList; tier?: 'R' | 'W' | 'C' | 'S';
 *   allowlist?: string }} NonHttpEntry
 * @typedef {{ name: string; unit: StringOrList; live?: StringOrList; tier?: 'R' | 'W' | 'C' | 'S';
 *   allowlist?: string; deprecated?: boolean }} SdkMethodEntry
 * @typedef {{ sdk: string; delegatesTo?: string; op?: string; deprecated?: boolean; unit?: StringOrList;
 *   live?: StringOrList; tier?: 'R' | 'W' | 'C' | 'S'; allowlist?: string }} AliasEntry
 * @typedef {{ phase: string; domain: string; status: 'draft' | 'complete'; operations: OperationEntry[];
 *   nonHttp?: NonHttpEntry[]; sdkMethods?: SdkMethodEntry[]; aliases?: AliasEntry[]; localMethods?: string[] }} PhaseManifest
 * @typedef {{ phase: string; file: string; data: PhaseManifest }} LoadedPhaseManifest
 * @typedef {{ op: string; tag: string; phase: string; decision: 'wrap' | 'exclude'; reason?: string;
 *   sdk: string[]; unit: string[]; live: string[]; tier?: string; allowlist?: string; realPath?: string;
 *   usi: string[]; manifestStatus?: string }} MergedOperation
 */

export const MANIFEST_PHASES = Object.freeze(['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8']);

/**
 * @param {string} [root]
 */
export function manifestPaths(root = REPO_ROOT) {
  const dir = join(root, 'spec', 'manifest');
  return {
    dir,
    base: join(dir, 'base.json'),
    schema: join(dir, 'schema.json'),
    spec: join(root, 'spec', 'rtls-api.swagger.json'),
    fixtures: join(root, 'test', 'fixtures'),
    allowlists: join(root, 'test', 'integration', 'allowlist'),
  };
}

/**
 * @param {string} file
 * @returns {any}
 */
export function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch (err) {
    throw new Error(`${file}: ${/** @type {Error} */ (err).message}`, { cause: err });
  }
}

/**
 * @param {unknown} value
 * @returns {string[]}
 */
export function toList(value) {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value.map(String) : [String(value)];
}

/**
 * @param {string} [root]
 * @returns {BaseManifest}
 */
export function loadBase(root = REPO_ROOT) {
  return readJson(manifestPaths(root).base);
}

/**
 * The phase manifests that exist (P1…P8), keyed by phase.
 *
 * @param {string} [root]
 * @returns {Record<string, LoadedPhaseManifest>}
 */
export function loadPhaseManifests(root = REPO_ROOT) {
  const { dir } = manifestPaths(root);
  /** @type {Record<string, LoadedPhaseManifest>} */
  const out = {};
  for (const phase of MANIFEST_PHASES) {
    const file = join(dir, `${phase}.json`);
    if (existsSync(file)) out[phase] = { phase, file, data: readJson(file) };
  }
  return out;
}

/**
 * Operations of the vendored spec as `{ id, tag }` ("METHOD path", first tag), in spec order.
 *
 * @param {string} [root]
 * @returns {Array<{ id: string; tag: string }>}
 */
export function specOperations(root = REPO_ROOT) {
  const spec = readJson(manifestPaths(root).spec);
  const methods = ['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace'];
  /** @type {Array<{ id: string; tag: string }>} */
  const ops = [];
  for (const [path, item] of Object.entries(spec.paths ?? {})) {
    for (const m of methods) {
      const op = /** @type {any} */ (item)?.[m];
      if (op) ops.push({ id: `${m.toUpperCase()} ${path}`, tag: String(op.tags?.[0] ?? '') });
    }
  }
  return ops;
}

/**
 * One row per base operation, joined with its phase-manifest entry (when the owning phase lists it).
 *
 * @param {BaseManifest} base
 * @param {Record<string, LoadedPhaseManifest>} phases
 * @returns {MergedOperation[]}
 */
export function mergeOperations(base, phases) {
  return base.operations.map((b) => {
    const e = (phases[b.phase]?.data.operations ?? []).find((x) => x.op === b.id);
    /** @type {MergedOperation} */
    const row = {
      op: b.id,
      tag: b.tag,
      phase: b.phase,
      decision: b.decision,
      sdk: toList(e?.sdk),
      unit: toList(e?.unit),
      live: toList(e?.live),
      usi: toList(e?.usi),
    };
    if (b.reason !== undefined) row.reason = b.reason;
    if (e?.tier !== undefined) row.tier = e.tier;
    if (e?.allowlist !== undefined) row.allowlist = e.allowlist;
    if (e?.realPath !== undefined) row.realPath = e.realPath;
    if (phases[b.phase]) row.manifestStatus = phases[b.phase]?.data.status;
    return row;
  });
}

/**
 * Totals of a base manifest: operations, wrap, exclude, and per phase.
 *
 * @param {BaseManifest} base
 */
export function baseTotals(base) {
  /** @type {Record<string, { wrap: number; exclude: number }>} */
  const byPhase = {};
  let wrap = 0;
  let exclude = 0;
  for (const op of base.operations) {
    const p = (byPhase[op.phase] ??= { wrap: 0, exclude: 0 });
    if (op.decision === 'wrap') {
      wrap++;
      p.wrap++;
    } else {
      exclude++;
      p.exclude++;
    }
  }
  return { operations: base.operations.length, wrap, exclude, byPhase };
}
