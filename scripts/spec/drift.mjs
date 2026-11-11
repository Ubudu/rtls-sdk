#!/usr/bin/env node
// `npm run spec:drift` (P0 §6.1, D5): compares the vendored spec with the live one.
//
//   node scripts/spec/drift.mjs [--from <live.json>] [--spec <vendored.json>] [--out <report.md>]
//
// Without --from it makes one public request, no credential: GET ${RTLS_BASE_URL}/docs/swagger.json
// (RTLS_BASE_URL from the process environment, default https://rtls.ubudu.com/api; .env is not read).
// Compared: info.version; the operation set ("METHOD path"); per operation the parameters (path- and
// operation-level, by `in` + `name`: required flag and schema hash), the request body (required flag, media
// types, schema hash per media type) and the responses (status codes, media types, schema hash per media
// type); and the component schemas. Schema hashes are sha256 over the key-sorted schema with every `$ref`
// resolved, ignoring documentation-only keys (description, summary, title, example, examples,
// externalDocs), so a change in a referenced component shows on every operation that uses it and a
// wording change is not drift. The report goes to .cache/spec-drift.md (default).
// Exit codes: 0 no drift, 1 drift (report written), 2 fetch failed or usage error.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  HTTP_METHODS,
  REPO_ROOT,
  SPEC_PATH,
  normalizeSpec,
  sha256,
  sortKeysDeep,
} from './normalize.mjs';
import { SpecFetchError, fetchLiveSpec, liveSpecUrl } from './update.mjs';

export const REPORT_PATH = resolve(REPO_ROOT, '.cache', 'spec-drift.md');
const DOC_KEYS = new Set([
  'description',
  'summary',
  'title',
  'example',
  'examples',
  'externalDocs',
]);

/**
 * @typedef {Record<string, any>} Spec
 * @typedef {{ required: boolean; schema: string }} ParamPrint
 * @typedef {{
 *   params: Record<string, ParamPrint>;
 *   body: { required: boolean; content: Record<string, string> } | null;
 *   responses: Record<string, Record<string, string>>;
 * }} OperationPrint
 * @typedef {{ op: string; changes: string[] }} OperationChange
 * @typedef {{
 *   version: { vendored: string | null; live: string | null; changed: boolean };
 *   added: string[]; removed: string[]; changed: OperationChange[];
 *   components: { added: string[]; removed: string[]; changed: string[] };
 *   identicalText: boolean; drift: boolean;
 * }} DriftResult
 */

/**
 * Follows a local `$ref` (`#/a/b`). Returns undefined for an unknown target.
 *
 * @param {Spec} spec
 * @param {string} ref
 */
function lookup(spec, ref) {
  if (!ref.startsWith('#/')) return undefined;
  /** @type {any} */
  let node = spec;
  for (const part of ref.slice(2).split('/')) {
    const key = part.replace(/~1/g, '/').replace(/~0/g, '~');
    if (node === null || typeof node !== 'object' || !(key in node)) return undefined;
    node = node[key];
  }
  return node;
}

/**
 * The value with every `$ref` resolved (a reference back into the current resolution chain becomes
 * `{ $recursive: <ref> }`) and documentation-only keys removed.
 *
 * @param {unknown} value
 * @param {Spec} spec
 * @param {string[]} [chain]
 * @returns {unknown}
 */
export function resolveShape(value, spec, chain = []) {
  if (Array.isArray(value)) return value.map((v) => resolveShape(v, spec, chain));
  if (value === null || typeof value !== 'object') return value;
  const obj = /** @type {Record<string, unknown>} */ (value);
  if (typeof obj.$ref === 'string') {
    const ref = obj.$ref;
    if (chain.includes(ref)) return { $recursive: ref };
    const target = lookup(spec, ref);
    if (target === undefined) return { $unresolved: ref };
    return resolveShape(target, spec, [...chain, ref]);
  }
  /** @type {Record<string, unknown>} */
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (DOC_KEYS.has(k)) continue;
    out[k] = resolveShape(v, spec, chain);
  }
  return out;
}

/**
 * @param {unknown} schema
 * @param {Spec} spec
 */
export function schemaHash(schema, spec) {
  if (schema === undefined) return 'none';
  return sha256(JSON.stringify(sortKeysDeep(resolveShape(schema, spec)))).slice(0, 16);
}

/**
 * @param {unknown} value
 * @param {Spec} spec
 * @returns {Record<string, any>}
 */
function deref(value, spec) {
  /** @type {any} */
  let v = value;
  const seen = new Set();
  while (v && typeof v === 'object' && typeof v.$ref === 'string' && !seen.has(v.$ref)) {
    seen.add(v.$ref);
    v = lookup(spec, v.$ref);
  }
  return v && typeof v === 'object' ? v : {};
}

/**
 * The fingerprint of every operation of a spec, keyed by "METHOD path".
 *
 * @param {Spec} spec
 * @returns {Map<string, OperationPrint>}
 */
export function operationPrints(spec) {
  /** @type {Map<string, OperationPrint>} */
  const prints = new Map();
  for (const [path, rawItem] of Object.entries(spec.paths ?? {})) {
    const item = deref(rawItem, spec);
    for (const method of HTTP_METHODS) {
      const op = item[method];
      if (!op || typeof op !== 'object') continue;
      /** @type {Record<string, ParamPrint>} */
      const params = {};
      for (const raw of [...(item.parameters ?? []), ...(op.parameters ?? [])]) {
        const p = deref(raw, spec);
        params[`${p.in}:${p.name}`] = {
          required: p.required === true,
          schema: schemaHash(p.schema ?? p.content, spec),
        };
      }
      /** @type {OperationPrint['body']} */
      let body = null;
      if (op.requestBody) {
        const rb = deref(op.requestBody, spec);
        /** @type {Record<string, string>} */
        const content = {};
        for (const [type, media] of Object.entries(rb.content ?? {}))
          content[type] = schemaHash(deref(media, spec).schema, spec);
        body = { required: rb.required === true, content };
      }
      /** @type {Record<string, Record<string, string>>} */
      const responses = {};
      for (const [status, raw] of Object.entries(op.responses ?? {})) {
        const r = deref(raw, spec);
        /** @type {Record<string, string>} */
        const content = {};
        for (const [type, media] of Object.entries(r.content ?? {}))
          content[type] = schemaHash(deref(media, spec).schema, spec);
        responses[status] = content;
      }
      prints.set(`${method.toUpperCase()} ${path}`, { params, body, responses });
    }
  }
  return prints;
}

/**
 * Human-readable differences between two operation fingerprints (empty = unchanged).
 *
 * @param {OperationPrint} a  vendored
 * @param {OperationPrint} b  live
 * @returns {string[]}
 */
export function diffOperation(a, b) {
  /** @type {string[]} */
  const changes = [];
  for (const key of union(Object.keys(a.params), Object.keys(b.params))) {
    const x = a.params[key];
    const y = b.params[key];
    if (!x) changes.push(`parameter ${key} added${y?.required ? ' (required)' : ''}`);
    else if (!y) changes.push(`parameter ${key} removed`);
    else {
      if (x.required !== y.required)
        changes.push(`parameter ${key} ${y.required ? 'became required' : 'became optional'}`);
      if (x.schema !== y.schema) changes.push(`parameter ${key} schema changed`);
    }
  }
  if (!a.body && b.body) changes.push('request body added');
  else if (a.body && !b.body) changes.push('request body removed');
  else if (a.body && b.body) {
    if (a.body.required !== b.body.required)
      changes.push(`request body ${b.body.required ? 'became required' : 'became optional'}`);
    for (const type of union(Object.keys(a.body.content), Object.keys(b.body.content))) {
      const x = a.body.content[type];
      const y = b.body.content[type];
      if (x === undefined) changes.push(`request body ${type} added`);
      else if (y === undefined) changes.push(`request body ${type} removed`);
      else if (x !== y) changes.push(`request body ${type} schema changed`);
    }
  }
  for (const status of union(Object.keys(a.responses), Object.keys(b.responses))) {
    const x = a.responses[status];
    const y = b.responses[status];
    if (!x) changes.push(`response ${status} added`);
    else if (!y) changes.push(`response ${status} removed`);
    else
      for (const type of union(Object.keys(x), Object.keys(y))) {
        if (x[type] === undefined) changes.push(`response ${status} ${type} added`);
        else if (y[type] === undefined) changes.push(`response ${status} ${type} removed`);
        else if (x[type] !== y[type]) changes.push(`response ${status} ${type} schema changed`);
      }
  }
  return changes;
}

/**
 * @param {readonly string[]} a
 * @param {readonly string[]} b
 */
function union(a, b) {
  return [...new Set([...a, ...b])].sort();
}

/**
 * Compares a vendored spec with a live one.
 *
 * @param {Spec} vendored
 * @param {Spec} live
 * @returns {DriftResult}
 */
export function compareSpecs(vendored, live) {
  const a = operationPrints(vendored);
  const b = operationPrints(live);
  const added = [...b.keys()].filter((k) => !a.has(k)).sort();
  const removed = [...a.keys()].filter((k) => !b.has(k)).sort();
  /** @type {OperationChange[]} */
  const changed = [];
  for (const op of [...a.keys()].filter((k) => b.has(k)).sort()) {
    const changes = diffOperation(
      /** @type {OperationPrint} */ (a.get(op)),
      /** @type {OperationPrint} */ (b.get(op))
    );
    if (changes.length) changed.push({ op, changes });
  }
  const ca = vendored.components?.schemas ?? {};
  const cb = live.components?.schemas ?? {};
  // Components are compared shallowly (their own content, references kept), to name the changed one.
  const shallow = (/** @type {unknown} */ s) => sha256(JSON.stringify(sortKeysDeep(stripDocs(s))));
  const components = {
    added: Object.keys(cb)
      .filter((k) => !(k in ca))
      .sort(),
    removed: Object.keys(ca)
      .filter((k) => !(k in cb))
      .sort(),
    changed: Object.keys(ca)
      .filter((k) => k in cb && shallow(ca[k]) !== shallow(cb[k]))
      .sort(),
  };
  const version = {
    vendored: vendored.info?.version ?? null,
    live: live.info?.version ?? null,
    changed: (vendored.info?.version ?? null) !== (live.info?.version ?? null),
  };
  const identicalText = normalizeSpec(vendored) === normalizeSpec(live);
  const drift =
    version.changed ||
    added.length > 0 ||
    removed.length > 0 ||
    changed.length > 0 ||
    components.added.length + components.removed.length + components.changed.length > 0;
  return { version, added, removed, changed, components, identicalText, drift };
}

/**
 * @param {unknown} value
 * @returns {unknown}
 */
function stripDocs(value) {
  if (Array.isArray(value)) return value.map(stripDocs);
  if (value === null || typeof value !== 'object') return value;
  /** @type {Record<string, unknown>} */
  const out = {};
  for (const [k, v] of Object.entries(/** @type {Record<string, unknown>} */ (value)))
    if (!DOC_KEYS.has(k)) out[k] = stripDocs(v);
  return out;
}

/**
 * The Markdown report of a comparison.
 *
 * @param {DriftResult} r
 * @param {{ vendoredLabel: string; liveLabel: string }} labels
 */
export function renderReport(r, { vendoredLabel, liveLabel }) {
  const lines = [
    '# Spec drift',
    '',
    `- Vendored: \`${vendoredLabel}\`, version \`${r.version.vendored}\``,
    `- Live: \`${liveLabel}\`, version \`${r.version.live}\``,
    `- Result: ${r.drift ? '**drift**' : 'no drift'}${r.identicalText ? ' (normalised texts identical)' : r.drift ? '' : ' (texts differ in documentation-only fields)'}`,
    `- Operations: ${r.added.length} added, ${r.removed.length} removed, ${r.changed.length} changed`,
    `- Component schemas: ${r.components.added.length} added, ${r.components.removed.length} removed, ${r.components.changed.length} changed`,
    '',
  ];
  /** @param {string} title @param {string[]} items */
  const section = (title, items) => {
    if (!items.length) return;
    lines.push(`## ${title}`, '', ...items, '');
  };
  if (r.version.changed)
    section('Version', [`- \`${r.version.vendored}\` → \`${r.version.live}\``]);
  section(
    'Added operations',
    r.added.map((op) => `- \`${op}\``)
  );
  section(
    'Removed operations',
    r.removed.map((op) => `- \`${op}\``)
  );
  section(
    'Changed operations',
    r.changed.flatMap((c) => [`- \`${c.op}\``, ...c.changes.map((x) => `  - ${x}`)])
  );
  section('Component schemas', [
    ...r.components.added.map((n) => `- added \`${n}\``),
    ...r.components.removed.map((n) => `- removed \`${n}\``),
    ...r.components.changed.map((n) => `- changed \`${n}\``),
  ]);
  return lines.join('\n').replace(/\n+$/, '') + '\n';
}

/**
 * @param {string[]} argv
 */
function parseArgs(argv) {
  /** @type {{ from: string | null; spec: string; out: string }} */
  const args = { from: null, spec: SPEC_PATH, out: REPORT_PATH };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => {
      const v = argv[++i];
      if (v === undefined) throw new Error(`missing value after ${a}`);
      return v;
    };
    if (a === '--from') args.from = resolve(next());
    else if (a === '--spec') args.spec = resolve(next());
    else if (a === '--out') args.out = resolve(next());
    else throw new Error(`unknown argument: ${a}`);
  }
  return args;
}

/**
 * @param {string[]} argv
 * @param {{ fetchImpl?: typeof fetch; url?: string; log?: (l: string) => void; error?: (l: string) => void }} [env]
 * @returns {Promise<number>}
 */
export async function main(argv, env = {}) {
  const log = env.log ?? ((l) => console.log(l));
  const error = env.error ?? ((l) => console.error(l));
  /** @type {ReturnType<typeof parseArgs>} */
  let args;
  try {
    args = parseArgs(argv);
  } catch (err) {
    error(
      `spec:drift: ${/** @type {Error} */ (err).message}\nusage: drift.mjs [--from <live.json>] [--spec <vendored.json>] [--out <report.md>]`
    );
    return 2;
  }
  const rel = (/** @type {string} */ p) => relative(process.cwd(), p) || p;
  /** @type {Spec} */
  let vendored;
  try {
    vendored = JSON.parse(readFileSync(args.spec, 'utf8'));
  } catch (err) {
    error(`spec:drift: cannot read ${rel(args.spec)}: ${/** @type {Error} */ (err).message}`);
    return 2;
  }
  /** @type {Spec} */
  let live;
  /** @type {string} */
  let liveLabel;
  if (args.from) {
    try {
      live = JSON.parse(readFileSync(args.from, 'utf8'));
    } catch (err) {
      error(`spec:drift: cannot read ${rel(args.from)}: ${/** @type {Error} */ (err).message}`);
      return 2;
    }
    liveLabel = rel(args.from);
  } else {
    const url = env.url ?? liveSpecUrl();
    log(`spec:drift: GET ${url} (public, no credential)`);
    try {
      live = (await fetchLiveSpec({ url, fetchImpl: env.fetchImpl })).spec;
    } catch (err) {
      if (err instanceof SpecFetchError) {
        error(`spec:drift: fetch failed: ${err.message}`);
        return 2;
      }
      throw err;
    }
    liveLabel = url;
  }
  const result = compareSpecs(vendored, live);
  const report = renderReport(result, { vendoredLabel: rel(args.spec), liveLabel });
  mkdirSync(dirname(args.out), { recursive: true });
  writeFileSync(args.out, report);
  log(
    `spec:drift: ${result.drift ? 'DRIFT' : 'no drift'} — vendored ${result.version.vendored}, live ${result.version.live}; ` +
      `operations +${result.added.length} −${result.removed.length} ~${result.changed.length}; ` +
      `component schemas +${result.components.added.length} −${result.components.removed.length} ~${result.components.changed.length}; ` +
      `report ${rel(args.out)}`
  );
  return result.drift ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).then(
    (code) => {
      process.exitCode = code;
    },
    (err) => {
      console.error(
        `spec:drift: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`
      );
      process.exitCode = 2;
    }
  );
}
