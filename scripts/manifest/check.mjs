// Manifest checks (P0 §5.5.3, CONVENTIONS §8), run by `npm run test:contract` after the contract tests.
//
// base.json: schema; ids unique and sorted; exactly the operations of the vendored spec, with their first tag;
// no operation wrapped by no phase.
// Every phase manifest: schema (strict); `phase`/`domain` match the file name; every `op` is a base operation
// of this phase with the same decision (no overrides); no duplicates; referenced unit/live files exist; `tier`
// matches a `describeLive('<tier>'` in a listed live file; `tier` given whenever `live` is non-empty; a `live`
// list that is empty needs an `allowlist`; `allowlist` ids exist in test/integration/allowlist/<phase>.json;
// `aliases[].op` is a base operation (any phase).
// Additionally when `status: "complete"`: every base wrap operation of the phase is listed; every wrap entry has
// `sdk`, `unit`, and `live` + `tier` or `allowlist`; every wrap operation has a 2xx fixture with `_operation`
// under test/fixtures/<domain>/; every surface item declared in a file owned by the phase appears in some
// manifest; every listed name exists in the surface (constants allowed in `sdkMethods`).
import ajvModule from 'ajv';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';
import { REPO_ROOT } from '../lib/git.mjs';
import { domainOfPhase, ownerOf as defaultOwnerOf } from '../lib/ownership.mjs';
import { walkSurface } from '../lib/surface.mjs';
import {
  MANIFEST_PHASES,
  baseTotals,
  loadBase,
  loadPhaseManifests,
  manifestPaths,
  readJson,
  specOperations,
  toList,
} from './load.mjs';

/** @typedef {import('./load.mjs').BaseManifest} BaseManifest */
/** @typedef {import('./load.mjs').PhaseManifest} PhaseManifest */
/** @typedef {import('./load.mjs').LoadedPhaseManifest} LoadedPhaseManifest */
/** @typedef {{ items: Array<{ name: string; file: string; line: number }>; values: Array<{ name: string; file: string; line: number }> }} Surface */
/** @typedef {(data: unknown) => string[]} SchemaCheck */

/**
 * Validators for the two manifest kinds of spec/manifest/schema.json.
 *
 * @param {string} schemaPath
 * @returns {{ base: SchemaCheck; phase: SchemaCheck }}
 */
export function schemaValidators(schemaPath) {
  const schema = readJson(schemaPath);
  // ajv is CommonJS: under NodeNext its default import is the module object, whose `default` is the class.
  const Ajv = ajvModule.default;
  const ajv = new Ajv({ allErrors: true, strict: false });
  ajv.addSchema(schema);
  /** @param {string} def */
  const make = (def) => {
    const validate = ajv.getSchema(`${schema.$id}#/definitions/${def}`);
    if (!validate) throw new Error(`schema.json has no definitions/${def}`);
    return /** @type {SchemaCheck} */ (
      (data) =>
        validate(data)
          ? []
          : (validate.errors ?? [])
              .filter((e) => e.keyword !== 'if')
              .map((e) => `schema: ${e.instancePath || '/'} ${e.message ?? e.keyword}`)
    );
  };
  return { base: make('base'), phase: make('phase') };
}

/**
 * @param {BaseManifest} base
 * @param {Array<{ id: string; tag: string }>} specOps
 * @param {SchemaCheck} [validateSchema]
 * @returns {string[]}
 */
export function checkBase(base, specOps, validateSchema) {
  const errors = validateSchema ? validateSchema(base).map((e) => `base.json: ${e}`) : [];
  if (!Array.isArray(base?.operations))
    return errors.length ? errors : ['base.json: no operations list'];
  const spec = new Map(specOps.map((o) => [o.id, o.tag]));
  /** @type {Set<string>} */
  const seen = new Set();
  let previous = '';
  for (const op of base.operations) {
    if (seen.has(op.id)) errors.push(`base.json: ${op.id} listed twice`);
    seen.add(op.id);
    if (op.id < previous) errors.push(`base.json: ${op.id} is out of order (sort by id)`);
    previous = op.id;
    if (!spec.has(op.id))
      errors.push(`base.json: ${op.id} is not an operation of the vendored spec`);
    else if (spec.get(op.id) !== op.tag)
      errors.push(
        `base.json: ${op.id} tag "${op.tag}" differs from the spec's first tag "${spec.get(op.id)}"`
      );
    if (op.phase === 'none' && op.decision === 'wrap')
      errors.push(
        `base.json: ${op.id} is wrapped by no phase (phase "none" needs decision "exclude")`
      );
  }
  for (const id of spec.keys())
    if (!seen.has(id)) errors.push(`base.json: spec operation ${id} has no decision`);
  return errors;
}

/**
 * Allowlist entry ids of a phase (array form or `{ entries }` form).
 *
 * @param {string} dir
 * @param {string} phase
 * @returns {Set<string>}
 */
export function allowlistIds(dir, phase) {
  const file = join(dir, `${phase}.json`);
  if (!existsSync(file)) return new Set();
  const data = readJson(file);
  const entries = Array.isArray(data) ? data : Array.isArray(data?.entries) ? data.entries : [];
  return new Set(entries.map((/** @type {any} */ e) => String(e?.id)));
}

/**
 * Operations with a 2xx fixture (top-level `test/fixtures/<domain>/*.json`, `_operation` set).
 *
 * @param {string} fixturesRoot
 * @param {string} domain
 * @returns {Set<string>}
 */
export function fixtureOperations(fixturesRoot, domain) {
  const dir = join(fixturesRoot, domain);
  /** @type {Set<string>} */
  const ops = new Set();
  if (!existsSync(dir)) return ops;
  for (const entry of readdirSync(dir)) {
    const file = join(dir, entry);
    if (!entry.endsWith('.json') || !statSync(file).isFile()) continue;
    /** @type {any} */
    let data;
    try {
      data = JSON.parse(readFileSync(file, 'utf8'));
    } catch {
      continue; // the fixture contract test reports unreadable fixtures
    }
    const status = data?.status ?? 200;
    if (typeof data?._operation === 'string' && status >= 200 && status < 300)
      ops.add(data._operation);
  }
  return ops;
}

/**
 * Names a manifest lists as surface (sdk of operations, nonHttp and aliases, sdkMethods, localMethods).
 *
 * @param {PhaseManifest} m
 * @returns {Set<string>}
 */
export function listedNames(m) {
  const names = new Set();
  for (const e of m.operations ?? []) for (const n of toList(e.sdk)) names.add(n);
  for (const e of m.nonHttp ?? []) for (const n of toList(e.sdk)) names.add(n);
  for (const e of m.aliases ?? []) names.add(e.sdk);
  for (const e of m.sdkMethods ?? []) names.add(e.name);
  for (const n of m.localMethods ?? []) names.add(n);
  return names;
}

/**
 * @typedef {{ root: string; baseById: Map<string, import('./load.mjs').BaseOperation>; validateSchema: SchemaCheck;
 *   requireComplete: boolean; surface: () => Surface; allListed: Set<string>;
 *   ownerOf: (path: string) => string; fixturesRoot: string; allowlistDir: string }} PhaseContext
 */

/**
 * @param {LoadedPhaseManifest} loaded
 * @param {PhaseContext} ctx
 * @returns {{ errors: string[]; warnings: string[] }}
 */
export function checkPhaseManifest(loaded, ctx) {
  const label = basename(loaded.file);
  const m = loaded.data;
  /** @type {string[]} */
  const errors = [];
  /** @type {string[]} */
  const warnings = [];
  const err = (/** @type {string} */ msg) => errors.push(`${label}: ${msg}`);

  const schemaErrors = ctx.validateSchema(m);
  if (schemaErrors.length) {
    for (const e of schemaErrors) err(e);
    return { errors, warnings };
  }
  const expectedDomain = domainOfPhase(loaded.phase);
  if (m.phase !== loaded.phase)
    err(`phase "${m.phase}" does not match the file name (${loaded.phase})`);
  if (m.domain !== expectedDomain)
    err(`domain "${m.domain}" is not the domain of ${loaded.phase} (${expectedDomain})`);
  const complete = m.status === 'complete';
  if (ctx.requireComplete && !complete)
    err(`status is "${m.status}"; this check requires "complete"`);

  const allowlist = allowlistIds(ctx.allowlistDir, loaded.phase);
  /** @type {Map<string, string>} */
  const liveText = new Map();
  const readLive = (/** @type {string} */ f) => {
    if (!liveText.has(f)) liveText.set(f, readFileSync(join(ctx.root, f), 'utf8'));
    return /** @type {string} */ (liveText.get(f));
  };

  /**
   * Common checks of an entry with unit / live / tier / allowlist.
   *
   * @param {string} where
   * @param {{ unit?: unknown; live?: unknown; tier?: string; allowlist?: string }} e
   * @param {boolean} needsTests
   */
  const checkTests = (where, e, needsTests) => {
    const unit = toList(e.unit);
    const live = toList(e.live);
    for (const f of [...unit, ...live])
      if (!existsSync(join(ctx.root, f))) err(`${where}: file ${f} not found`);
    if (e.allowlist !== undefined && !allowlist.has(e.allowlist))
      err(
        `${where}: allowlist id ${e.allowlist} not found in test/integration/allowlist/${loaded.phase}.json`
      );
    if (e.live !== undefined && live.length === 0 && e.allowlist === undefined)
      err(`${where}: live is empty and no allowlist is given`);
    if (live.length > 0 && e.tier === undefined)
      err(`${where}: tier is required when live is given`);
    if (live.length > 0 && e.tier !== undefined) {
      const pattern = new RegExp(`describeLive\\(\\s*['"\`]${e.tier}['"\`]`);
      const present = live.filter((f) => existsSync(join(ctx.root, f)));
      if (present.length === live.length && !present.some((f) => pattern.test(readLive(f))))
        err(`${where}: no describeLive('${e.tier}', …) in ${live.join(', ')}`);
    }
    if (complete && needsTests) {
      if (unit.length === 0) err(`${where}: unit test file required`);
      if (live.length === 0 && e.allowlist === undefined)
        err(`${where}: live test (with tier) or allowlist required`);
    }
  };

  /** @type {Set<string>} */
  const listedOps = new Set();
  (m.operations ?? []).forEach((e, i) => {
    const where = `operations[${i}] (${e.op})`;
    if (listedOps.has(e.op)) err(`${where}: listed twice`);
    listedOps.add(e.op);
    const b = ctx.baseById.get(e.op);
    if (!b) return err(`${where}: not an operation of base.json`);
    if (b.phase !== loaded.phase)
      return err(`${where}: owned by ${b.phase} in base.json, not ${loaded.phase}`);
    if (e.decision !== b.decision)
      return err(
        `${where}: decision "${e.decision}" differs from base.json "${b.decision}" (ask the orchestrator)`
      );
    if (e.decision === 'wrap') {
      if (complete && toList(e.sdk).length === 0) err(`${where}: sdk is required`);
      checkTests(where, e, true);
    }
  });
  /** @type {Set<string>} */
  const nonHttpIds = new Set();
  (m.nonHttp ?? []).forEach((e, i) => {
    const where = `nonHttp[${i}] (${e.id})`;
    if (nonHttpIds.has(e.id)) err(`${where}: listed twice`);
    nonHttpIds.add(e.id);
    if (e.decision === 'wrap') checkTests(where, e, true);
  });
  /** @type {Set<string>} */
  const methodNames = new Set();
  (m.sdkMethods ?? []).forEach((e, i) => {
    const where = `sdkMethods[${i}] (${e.name})`;
    if (methodNames.has(e.name)) err(`${where}: listed twice`);
    methodNames.add(e.name);
    checkTests(where, e, true);
  });
  (m.aliases ?? []).forEach((e, i) => {
    const where = `aliases[${i}] (${e.sdk})`;
    if (e.op !== undefined && !ctx.baseById.has(e.op))
      err(`${where}: op ${e.op} is not an operation of base.json`);
    checkTests(where, e, true);
  });

  if (complete) {
    for (const b of ctx.baseById.values()) {
      if (b.phase === loaded.phase && b.decision === 'wrap' && !listedOps.has(b.id))
        err(`wrapped operation ${b.id} is not listed`);
    }
    const fixtures = fixtureOperations(ctx.fixturesRoot, /** @type {string} */ (expectedDomain));
    for (const b of ctx.baseById.values()) {
      if (b.phase === loaded.phase && b.decision === 'wrap' && !fixtures.has(b.id))
        err(`${b.id}: no 2xx fixture with _operation under test/fixtures/${expectedDomain}/`);
    }
    const surface = ctx.surface();
    const callable = new Set(surface.items.map((s) => s.name));
    const values = new Set(surface.values.map((s) => s.name));
    for (const item of surface.items) {
      if (ctx.ownerOf(item.file) === loaded.phase && !ctx.allListed.has(item.name))
        err(`surface item ${item.name} (${item.file}:${item.line}) is not listed in any manifest`);
    }
    const mustExist = [
      ...(m.operations ?? []).flatMap((e) => toList(e.sdk)),
      ...(m.nonHttp ?? []).flatMap((e) => toList(e.sdk)),
      ...(m.aliases ?? []).flatMap((e) => [e.sdk, ...(e.delegatesTo ? [e.delegatesTo] : [])]),
      ...(m.localMethods ?? []),
    ];
    for (const n of mustExist) if (!callable.has(n)) err(`name ${n} is not in the public surface`);
    for (const e of m.sdkMethods ?? [])
      if (!callable.has(e.name) && !values.has(e.name))
        err(`sdkMethods name ${e.name} is not exported`);
  }
  return { errors, warnings };
}

/**
 * Runs the base and phase-manifest checks.
 *
 * The public surface is walked (scripts/lib/surface.mjs) only when a manifest is complete; `surface`
 * replaces the walker in tests.
 *
 * @param {{ root?: string; phase?: string; release?: boolean; surface?: () => Surface;
 *   ownerOf?: (path: string) => string; specOps?: Array<{ id: string; tag: string }> }} [options]
 * @returns {{ errors: string[]; warnings: string[]; totals: ReturnType<typeof baseTotals> | null;
 *   statuses: Record<string, string> }}
 */
export function runManifestChecks({
  root = REPO_ROOT,
  phase,
  release = false,
  surface,
  ownerOf = defaultOwnerOf,
  specOps,
} = {}) {
  const paths = manifestPaths(root);
  const validators = schemaValidators(paths.schema);
  /** @type {string[]} */
  const errors = [];
  /** @type {string[]} */
  const warnings = [];
  const base = loadBase(root);
  errors.push(...checkBase(base, specOps ?? specOperations(root), validators.base));
  const baseById = new Map((base.operations ?? []).map((o) => [o.id, o]));
  const phases = loadPhaseManifests(root);
  /** @type {Set<string>} */
  const allListed = new Set();
  for (const { data } of Object.values(phases)) for (const n of listedNames(data)) allListed.add(n);

  /** @type {Surface | undefined} */
  let cachedSurface;
  const getSurface = () => {
    cachedSurface ??= surface ? surface() : walkSurface({ root });
    return cachedSurface;
  };

  /** @type {Record<string, string>} */
  const statuses = {};
  for (const p of MANIFEST_PHASES) {
    const loaded = phases[p];
    if (!loaded) {
      const msg = `spec/manifest/${p}.json is missing`;
      if (release || phase === p) errors.push(msg);
      else warnings.push(msg);
      continue;
    }
    statuses[p] = String(loaded.data?.status);
    const result = checkPhaseManifest(loaded, {
      root,
      baseById,
      validateSchema: validators.phase,
      requireComplete: release || phase === p,
      surface: getSurface,
      allListed,
      ownerOf,
      fixturesRoot: paths.fixtures,
      allowlistDir: paths.allowlists,
    });
    errors.push(...result.errors);
    warnings.push(...result.warnings);
  }
  return {
    errors,
    warnings,
    totals: Array.isArray(base.operations) ? baseTotals(base) : null,
    statuses,
  };
}
