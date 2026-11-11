#!/usr/bin/env node
// Endpoint-coverage generator: one row per operation of the vendored spec with its decision from the
// operation manifests, plus the non-HTTP (WebSocket) entries in a separate section.
//
//   node docs/api/tools/gen-endpoint-coverage.mjs           writes docs/api/endpoint-coverage.{md,json}
//   node docs/api/tools/gen-endpoint-coverage.mjs --check   exit 1 when the committed files differ
//
// Inputs: spec/rtls-api.swagger.json, spec/manifest/base.json and the phase manifests, read through the
// manifest loader (scripts/manifest/load.mjs). Problems (missing or double decisions, unknown operations,
// incomplete wrap or exclude entries) throw a CoverageError; the CLI lists them and exits 1.
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { REPO_ROOT } from '../../../scripts/lib/git.mjs';
import {
  loadBase,
  loadPhaseManifests,
  manifestPaths,
  mergeOperations,
  readJson,
  toList,
} from '../../../scripts/manifest/load.mjs';

/**
 * @typedef {import('../../../scripts/manifest/load.mjs').BaseManifest} BaseManifest
 * @typedef {import('../../../scripts/manifest/load.mjs').LoadedPhaseManifest} LoadedPhaseManifest
 * @typedef {'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'} HttpMethod
 * @typedef {'R' | 'W' | 'C' | 'S'} Tier
 * @typedef {{ tag: string; method: HttpMethod; path: string; operationId?: string; phase: string;
 *   decision: 'wrap' | 'exclude'; sdkMethod?: string; tier?: Tier; allowlist?: string; reason?: string }} CoverageRow
 * @typedef {{ id: string; kind: 'ws-endpoint' | 'ws-command' | 'ws-message'; decision: 'wrap' | 'exclude';
 *   sdkMethod?: string; tier?: Tier; allowlist?: string; reason?: string }} NonHttpRow
 * @typedef {{ total: number; wrapped: number; excluded: number }} Counts
 * @typedef {{ specVersion: string; total: number; wrapped: number; excluded: number;
 *   byTag: Record<string, Counts> }} CoverageSummary
 * @typedef {{ spec: unknown; base: unknown; phases: Record<string, unknown> }} CoverageInputs
 * @typedef {{ rows: CoverageRow[]; nonHttp: NonHttpRow[]; summary: CoverageSummary; markdown: string;
 *   json: string }} Coverage
 */

/** @type {readonly HttpMethod[]} */
const METHOD_ORDER = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
const SPEC_METHODS = ['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace'];
const KIND_ORDER = ['ws-endpoint', 'ws-command', 'ws-message'];
const DASH = '—';

export class CoverageError extends Error {
  /** @param {string[]} problems */
  constructor(problems) {
    super(`endpoint coverage: ${problems.length} problem(s)\n- ${problems.join('\n- ')}`);
    this.name = 'CoverageError';
    /** @readonly */
    this.problems = problems;
  }
}

/**
 * The parsed input files: the spec, base.json and every phase manifest that exists (keyed by phase).
 *
 * @param {string} [root]
 * @returns {CoverageInputs}
 */
export function loadInputs(root = REPO_ROOT) {
  return {
    spec: readJson(manifestPaths(root).spec),
    base: loadBase(root),
    phases: loadPhaseManifests(root),
  };
}

/**
 * One SDK surface name rendered as a call: `assets.list` → `client.assets.list()`; `client.health`,
 * `RtlsWebSocketSubscriber.connect` and one-segment function names keep their form and get `()`.
 *
 * @param {string} name
 * @returns {string}
 */
export function renderSdkName(name) {
  const bare = name.trim().replace(/\(\)$/, '');
  const segments = bare.split('.');
  const first = bare.charAt(0);
  const prefix =
    segments.length >= 2 && first === first.toLowerCase() && first !== first.toUpperCase()
      ? bare.startsWith('client.')
        ? ''
        : 'client.'
      : '';
  return `${prefix}${bare}()`;
}

/**
 * @param {unknown} sdk
 * @returns {string | undefined}
 */
function renderSdk(sdk) {
  const names = toList(sdk).filter((n) => n.trim() !== '');
  return names.length > 0 ? names.map(renderSdkName).join(', ') : undefined;
}

/** @param {string} text */
const cell = (text) => text.replace(/\r?\n/g, ' ').replace(/\|/g, '\\|');

/**
 * @param {string} a
 * @param {string} b
 */
const compareText = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * @param {{ tier?: string; allowlist?: string }} r
 * @returns {string}
 */
function tierCell(r) {
  if (r.tier !== undefined) return cell(r.tier);
  if (r.allowlist !== undefined) return `not live (allowlist ${cell(r.allowlist)})`;
  return DASH;
}

/**
 * @param {{ decision: string; reason?: string }} r
 * @returns {string}
 */
function decisionCell(r) {
  return r.decision === 'wrap' ? 'wrap' : `exclude: ${cell(r.reason ?? '')}`;
}

/**
 * @param {string | undefined} sdkMethod
 * @returns {string}
 */
function sdkCell(sdkMethod) {
  return sdkMethod === undefined ? DASH : `\`${cell(sdkMethod)}\``;
}

/**
 * Spec operations: `{ id, method, path, tag, operationId }` for every path item method.
 *
 * @param {unknown} spec
 * @param {string[]} problems
 */
function specOperationsOf(spec, problems) {
  /** @type {Map<string, { method: HttpMethod; path: string; tag: string; operationId?: string }>} */
  const ops = new Map();
  const paths = /** @type {Record<string, Record<string, any>>} */ (
    /** @type {any} */ (spec)?.paths ?? {}
  );
  for (const [path, item] of Object.entries(paths)) {
    for (const m of SPEC_METHODS) {
      const op = item?.[m];
      if (!op) continue;
      const method = /** @type {HttpMethod} */ (m.toUpperCase());
      const id = `${method} ${path}`;
      if (!METHOD_ORDER.includes(method)) {
        problems.push(`${id}: method ${method} is not supported by the coverage table`);
        continue;
      }
      /** @type {{ method: HttpMethod; path: string; tag: string; operationId?: string }} */
      const entry = { method, path, tag: String(op.tags?.[0] ?? '') };
      if (typeof op.operationId === 'string') entry.operationId = op.operationId;
      ops.set(id, entry);
    }
  }
  return ops;
}

/**
 * Builds the coverage rows, summary and both renderings; throws CoverageError on any problem.
 *
 * @param {CoverageInputs} inputs
 * @returns {Coverage}
 */
export function buildCoverage(inputs) {
  /** @type {string[]} */
  const problems = [];
  const base = /** @type {BaseManifest} */ (inputs.base);
  const phases = /** @type {Record<string, LoadedPhaseManifest>} */ (inputs.phases);
  const baseOps = Array.isArray(base?.operations) ? base.operations : [];
  const specOps = specOperationsOf(inputs.spec, problems);
  const specVersion = String(
    /** @type {any} */ (inputs.spec)?.info?.version ?? base?.specVersion ?? ''
  );

  // Base decisions: exactly one per operation, and only for operations of the spec.
  /** @type {Map<string, number>} */
  const baseCount = new Map();
  for (const b of baseOps) baseCount.set(b.id, (baseCount.get(b.id) ?? 0) + 1);
  for (const [id, n] of baseCount) {
    if (n > 1) problems.push(`${id}: more than one decision in base.json (${n})`);
    if (!specOps.has(id)) problems.push(`${id}: base.json names an operation absent from the spec`);
  }
  for (const id of specOps.keys()) {
    if (!baseCount.has(id)) problems.push(`${id}: no decision`);
  }
  if (specOps.size !== baseCount.size) {
    problems.push(
      `the spec has ${specOps.size} operations, the merged manifest decides ${baseCount.size}`
    );
  }

  // Phase files: each operation decided by at most one entry, of the owning phase, with the base decision.
  /** @type {Map<string, string[]>} */
  const decidedIn = new Map();
  for (const phase of Object.keys(phases).sort()) {
    const ops = phases[phase]?.data?.operations ?? [];
    for (const e of ops) {
      const id = String(e.op);
      decidedIn.set(id, [...(decidedIn.get(id) ?? []), phase]);
      if (!specOps.has(id)) {
        problems.push(`${id}: ${phase}.json names an operation absent from the spec`);
        continue;
      }
      const b = baseOps.find((x) => x.id === id);
      if (b && b.phase !== phase)
        problems.push(`${id}: decided in ${phase}.json but owned by ${b.phase} in base.json`);
      if (b && e.decision !== undefined && e.decision !== b.decision)
        problems.push(
          `${id}: ${phase}.json decides ${e.decision}, base.json decides ${b.decision}`
        );
    }
  }
  for (const [id, list] of decidedIn) {
    if (list.length > 1) problems.push(`${id}: decided more than once (${list.join(', ')})`);
  }

  /** @type {CoverageRow[]} */
  const rows = [];
  const seen = new Set();
  for (const m of mergeOperations({ ...base, operations: baseOps }, phases)) {
    const s = specOps.get(m.op);
    if (!s || seen.has(m.op)) continue;
    seen.add(m.op);
    const entry = (phases[m.phase]?.data?.operations ?? []).find((x) => x.op === m.op);
    /** @type {CoverageRow} */
    const row = {
      tag: s.tag,
      method: s.method,
      path: s.path,
      phase: m.phase,
      decision: m.decision,
    };
    if (s.operationId !== undefined) row.operationId = s.operationId;
    const sdkMethod = renderSdk(m.sdk);
    if (sdkMethod !== undefined) row.sdkMethod = sdkMethod;
    if (m.tier !== undefined) row.tier = /** @type {Tier} */ (m.tier);
    if (m.allowlist !== undefined) row.allowlist = m.allowlist;
    const reason = entry?.reason ?? m.reason;
    if (reason !== undefined && reason !== '') row.reason = reason;
    if (row.decision === 'wrap') {
      if (row.sdkMethod === undefined) problems.push(`${m.op}: wrap without sdkMethod`);
      if (row.tier === undefined && row.allowlist === undefined)
        problems.push(`${m.op}: wrap with neither tier nor allowlist`);
    } else if (row.decision === 'exclude') {
      if (row.reason === undefined) problems.push(`${m.op}: exclude without reason`);
    } else {
      problems.push(`${m.op}: decision must be wrap or exclude`);
    }
    rows.push(row);
  }
  rows.sort(
    (a, b) =>
      compareText(a.tag.toLowerCase(), b.tag.toLowerCase()) ||
      compareText(a.tag, b.tag) ||
      compareText(a.path, b.path) ||
      METHOD_ORDER.indexOf(a.method) - METHOD_ORDER.indexOf(b.method)
  );

  /** @type {NonHttpRow[]} */
  const nonHttp = [];
  const nonHttpIds = new Set();
  for (const phase of Object.keys(phases).sort()) {
    for (const e of phases[phase]?.data?.nonHttp ?? []) {
      const id = String(e.id);
      if (nonHttpIds.has(id)) problems.push(`${id}: non-HTTP entry listed more than once`);
      nonHttpIds.add(id);
      /** @type {NonHttpRow} */
      const row = { id, kind: e.kind, decision: e.decision };
      const sdkMethod = renderSdk(e.sdk);
      if (sdkMethod !== undefined) row.sdkMethod = sdkMethod;
      if (e.tier !== undefined) row.tier = e.tier;
      if (e.allowlist !== undefined) row.allowlist = e.allowlist;
      if (e.reason !== undefined && e.reason !== '') row.reason = e.reason;
      if (row.decision === 'wrap') {
        if (row.tier === undefined && row.allowlist === undefined)
          problems.push(`${id}: non-HTTP wrap with neither tier nor allowlist`);
      } else if (row.decision === 'exclude') {
        if (row.reason === undefined) problems.push(`${id}: non-HTTP exclude without reason`);
      } else {
        problems.push(`${id}: non-HTTP decision must be wrap or exclude`);
      }
      nonHttp.push(row);
    }
  }
  nonHttp.sort(
    (a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) || compareText(a.id, b.id)
  );

  if (problems.length > 0) throw new CoverageError(problems);

  /** @type {Record<string, Counts>} */
  const byTag = {};
  for (const r of rows) {
    const t = (byTag[r.tag] ??= { total: 0, wrapped: 0, excluded: 0 });
    t.total += 1;
    if (r.decision === 'wrap') t.wrapped += 1;
    else t.excluded += 1;
  }
  const wrapped = rows.filter((r) => r.decision === 'wrap').length;
  /** @type {CoverageSummary} */
  const summary = {
    specVersion,
    total: rows.length,
    wrapped,
    excluded: rows.length - wrapped,
    byTag,
  };

  const tags = [...new Set(rows.map((r) => r.tag))];
  const lines = [
    '# Endpoint coverage',
    '',
    '<!-- Generated by `npm run docs:coverage` from spec/rtls-api.swagger.json and spec/manifest/*.json. Do not edit. -->',
    '',
    `Spec \`${cell(specVersion)}\` · ${summary.total} operations · ${summary.wrapped} wrapped · ${summary.excluded} excluded`,
    '',
    '| Tag | Operations | Wrapped | Excluded |',
    '|---|---|---|---|',
    ...tags.map((t) => {
      const c = /** @type {Counts} */ (byTag[t]);
      return `| ${cell(t)} | ${c.total} | ${c.wrapped} | ${c.excluded} |`;
    }),
  ];
  for (const t of tags) {
    lines.push(
      '',
      `## ${cell(t)}`,
      '',
      '| Method | Path | SDK method | Live tier | Decision |',
      '|---|---|---|---|---|'
    );
    for (const r of rows.filter((x) => x.tag === t)) {
      lines.push(
        `| ${r.method} | \`${cell(r.path)}\` | ${sdkCell(r.sdkMethod)} | ${tierCell(r)} | ${decisionCell(r)} |`
      );
    }
  }
  if (nonHttp.length > 0) {
    lines.push(
      '',
      '## WebSocket (non-HTTP, not counted in the 176)',
      '',
      '| Id | Kind | SDK method | Live tier | Decision |',
      '|---|---|---|---|---|'
    );
    for (const r of nonHttp) {
      lines.push(
        `| \`${cell(r.id)}\` | ${cell(r.kind)} | ${sdkCell(r.sdkMethod)} | ${tierCell(r)} | ${decisionCell(r)} |`
      );
    }
  }
  const markdown = `${lines.join('\n')}\n`;
  const json = `${JSON.stringify({ summary, rows, nonHttp }, null, 2)}\n`;
  return { rows, nonHttp, summary, markdown, json };
}

/**
 * @param {string} root
 */
export function outputPaths(root = REPO_ROOT) {
  return {
    markdown: join(root, 'docs', 'api', 'endpoint-coverage.md'),
    json: join(root, 'docs', 'api', 'endpoint-coverage.json'),
  };
}

/**
 * @param {string} file
 * @returns {string | null}
 */
function readText(file) {
  try {
    return readFileSync(file, 'utf8');
  } catch {
    return null;
  }
}

/**
 * CLI entry point. Returns the exit code.
 *
 * @param {readonly string[]} argv
 * @param {{ root?: string; log?: (line: string) => void; error?: (line: string) => void }} [deps]
 * @returns {number}
 */
export function main(argv, deps = {}) {
  const root = deps.root ?? REPO_ROOT;
  const log = deps.log ?? ((l) => console.log(l));
  const error = deps.error ?? ((l) => console.error(l));
  const unknown = argv.filter((a) => a !== '--check');
  if (unknown.length > 0) {
    error(`docs:coverage: unknown argument ${unknown[0]} (usage: [--check])`);
    return 2;
  }
  /** @type {Coverage} */
  let coverage;
  try {
    coverage = buildCoverage(loadInputs(root));
  } catch (err) {
    if (err instanceof CoverageError) {
      error(err.message);
      return 1;
    }
    throw err;
  }
  const out = outputPaths(root);
  if (argv.includes('--check')) {
    const stale = [
      readText(out.markdown) === coverage.markdown ? null : 'docs/api/endpoint-coverage.md',
      readText(out.json) === coverage.json ? null : 'docs/api/endpoint-coverage.json',
    ].filter((x) => x !== null);
    if (stale.length > 0) {
      error(`docs:coverage: out of date: ${stale.join(', ')} (run npm run docs:coverage)`);
      return 1;
    }
    log(
      `docs:coverage: up to date (${coverage.summary.total} operations, ${coverage.summary.wrapped} wrapped, ${coverage.summary.excluded} excluded)`
    );
    return 0;
  }
  writeFileSync(out.markdown, coverage.markdown);
  writeFileSync(out.json, coverage.json);
  log(
    `docs:coverage: wrote ${coverage.summary.total} rows (${coverage.summary.wrapped} wrapped, ${coverage.summary.excluded} excluded)`
  );
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.exitCode = main(process.argv.slice(2));
}
