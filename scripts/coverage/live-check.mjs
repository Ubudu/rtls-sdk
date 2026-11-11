#!/usr/bin/env node
// `npm run coverage:live:check` (P0 §5.7, LIVE-TESTING §6): the live-coverage gate.
//
//   node scripts/coverage/live-check.mjs [--phase Pn] [--release]
//
// 1. Sources: every `coverage-live/<label>/` with a `coverage-final.json` is one source run (label = run id); its
//    `sources.json` holds the sha256 of every src file at run start and its `report.json` copy the run-scoped
//    activations. Per file, only the runs whose recorded hash equals the current file's are merged (istanbul); the
//    others are listed as stale for that file; a folder without `sources.json` is stale for every file. No source
//    run at all → exit 2 (except when the scope holds no src file: nothing to check, P0 §9.3).
// 2. Scope: src/** minus src/generated/**; `--phase Pn` → the src files Pn owns (scripts/lib/ownership.mjs).
// 3. Functions (src/resources/**, src/client/**, src/websocket/**): every named function ran live, unless an
//    `environment` entry, or (without --release) a `deferredTo` entry, covers the whole function; an anonymous
//    callback that did not run lies entirely inside a line entry. Whether a function is named, and its name, come
//    from the TypeScript source (`sourceFunctions`), not from the provider: with AST-aware remapping every method
//    and every arrow bound to a name is `(anonymous_<n>)`. A function ran when its count is > 0 and the first
//    statement of its body ran (the AST-aware count of an uncalled static method is 1).
// 4. Lines: every statement line with live count 0 lies inside an allowlisted range (a run-scoped entry only when
//    accepted against the kept runs; a deferred entry only without --release).
// 5. Allowlist (test/integration/allowlist/<phase>.json, schema test/integration/harness/allowlist.schema.json):
//    `match` on line `lines[0]` (else stale), every statement line of the range covered by the unit report
//    `coverage/coverage-final.json`, a fully live-covered range is "unneeded" (warning; error with --release),
//    `method` exists in the surface, an operation entry names a base `wrap` op of its phase and an existing
//    `unitTest`, `deferredTo` names a later phase than the file's owner (any `deferredTo` fails with --release).
// 6. Manifests: every manifest entry with `allowlist` refers to an existing entry of its phase.
// 7. Output: a table per file, `coverage-live/report.md` (one row per surface item: name, file:line, live call
//    count, allowlist id; the accepted deferred entries) and the merged `test/integration/coverage-allowlist.json`.
//
// Exit codes: 0 pass, 1 fail, 2 no live data, usage error or missing unit report.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import ajvModule from 'ajv';
import libCoverage from 'istanbul-lib-coverage';
import ts from 'typescript';
import { UsageError, parseArgs, parsePhase } from '../lib/cli.mjs';
import { REPO_ROOT } from '../lib/git.mjs';
import { PHASES, domainOfPhase, ownerOf as defaultOwnerOf } from '../lib/ownership.mjs';
import { walkSurface } from '../lib/surface.mjs';
import { loadBase, loadPhaseManifests } from '../manifest/load.mjs';
import { ignoreHintFindings } from './ignore-hints.mjs';

/** @typedef {import('istanbul-lib-coverage').FileCoverage} FileCoverage */
/** @typedef {import('istanbul-lib-coverage').FileCoverageData} FileCoverageData */
/** @typedef {import('istanbul-lib-coverage').FunctionMapping} FunctionMapping */
/**
 * @typedef {{ id: string; file: string; lines: [number, number]; match: string; method?: string;
 *   category: 'unreachable-live' | 'excluded-by-policy' | 'environment'; reason: string; unitTest: string;
 *   runScoped?: true; deferredTo?: string; phase: string }} LineEntry
 */
/** @typedef {{ id: string; op: string; category: 'excluded-by-policy'; reason: string; unitTest: string; phase: string }} OperationEntry */
/** @typedef {{ kind: string; match: string; perRun: boolean; category: 'non-removable'; reason: string; phase: string }} ResidueEntry */
/**
 * @typedef {{ allowlistId?: string; test?: string; kind?: string }} Activation
 * @typedef {{ domains?: Record<string, { skipped?: Array<{ test: string }> }>; dynamicAllowlist?: Activation[] }} RunReportCopy
 * @typedef {{ label: string; dir: string; mtime: string; coverage: Record<string, FileCoverageData>;
 *   sources: Record<string, string> | null; report: RunReportCopy | null }} SourceRun
 */

/** Folders whose files must run every named function live (LIVE-TESTING §6). */
export const FUNCTION_DIRS = Object.freeze(['src/resources/', 'src/client/', 'src/websocket/']);
const ANONYMOUS_RE = /^\(anonymous_\d+\)$/;

export const SCHEMA_PATH = join(
  REPO_ROOT,
  'test',
  'integration',
  'harness',
  'allowlist.schema.json'
);

/**
 * @param {string} file
 * @returns {unknown}
 */
function readJsonFile(file) {
  return JSON.parse(readFileSync(file, 'utf8'));
}

/**
 * @param {string} file
 * @returns {string}
 */
function sha256File(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}

/** @param {string} p */
const posix = (p) => p.split(sep).join('/');

/**
 * Repository-relative paths of the src TypeScript files, minus src/generated/** (sorted).
 *
 * @param {string} root
 * @returns {string[]}
 */
export function srcFiles(root) {
  /** @type {string[]} */
  const out = [];
  /** @param {string} dir */
  const walk = (dir) => {
    let names;
    try {
      names = readdirSync(dir);
    } catch {
      return;
    }
    for (const name of names) {
      const path = join(dir, name);
      const st = statSync(path);
      if (st.isDirectory()) walk(path);
      else if (name.endsWith('.ts') && !name.endsWith('.d.ts'))
        out.push(posix(relative(root, path)));
    }
  };
  walk(join(root, 'src'));
  return out.filter((f) => !f.startsWith('src/generated/')).sort();
}

/**
 * Source runs under `coverageRoot`: every sub-folder with a `coverage-final.json`.
 *
 * @param {string} coverageRoot
 * @returns {SourceRun[]}
 */
export function loadSourceRuns(coverageRoot) {
  /** @type {SourceRun[]} */
  const runs = [];
  /** @type {string[]} */
  let names;
  try {
    names = readdirSync(coverageRoot).sort();
  } catch {
    return runs;
  }
  for (const label of names) {
    const dir = join(coverageRoot, label);
    const finalPath = join(dir, 'coverage-final.json');
    if (!statSync(dir).isDirectory() || !existsSync(finalPath)) continue;
    const sourcesPath = join(dir, 'sources.json');
    const reportPath = join(dir, 'report.json');
    const sourcesFile = existsSync(sourcesPath)
      ? /** @type {{ files?: Record<string, string> }} */ (readJsonFile(sourcesPath))
      : null;
    const sources = sourcesFile?.files ?? null;
    runs.push({
      label,
      dir,
      mtime: statSync(finalPath).mtime.toISOString(),
      coverage: /** @type {Record<string, FileCoverageData>} */ (readJsonFile(finalPath)),
      sources,
      report: existsSync(reportPath)
        ? /** @type {RunReportCopy} */ (readJsonFile(reportPath))
        : null,
    });
  }
  return runs;
}

/**
 * The coverage data of `rel` in a run, matched by the path suffix (a folder copied from another worktree carries
 * that worktree's absolute paths), or null.
 *
 * @param {SourceRun} run
 * @param {string} rel
 * @returns {FileCoverageData | null}
 */
export function fileDataOf(run, rel) {
  for (const [key, data] of Object.entries(run.coverage)) {
    const p = posix(key);
    if (p === rel || p.endsWith(`/${rel}`)) return data;
  }
  return null;
}

/**
 * Runs kept for a file (recorded hash = current hash, data present) and the labels skipped as stale.
 *
 * @param {readonly SourceRun[]} runs
 * @param {string} rel
 * @param {string} currentHash
 * @returns {{ kept: SourceRun[]; stale: string[] }}
 */
export function keptRunsFor(runs, rel, currentHash) {
  /** @type {SourceRun[]} */
  const kept = [];
  /** @type {string[]} */
  const stale = [];
  for (const run of runs) {
    if (run.sources?.[rel] === currentHash && fileDataOf(run, rel) !== null) kept.push(run);
    else stale.push(run.label);
  }
  return { kept, stale };
}

/**
 * The merged coverage of `rel` over the kept runs, or null.
 *
 * @param {readonly SourceRun[]} kept
 * @param {string} rel
 * @returns {FileCoverage | null}
 */
export function mergedCoverage(kept, rel) {
  /** @type {FileCoverage | null} */
  let merged = null;
  for (const run of kept) {
    const data = fileDataOf(run, rel);
    if (!data) continue;
    const fc = libCoverage.createFileCoverage({ ...data, path: rel });
    if (merged) merged.merge(fc);
    else merged = fc;
  }
  return merged;
}

/**
 * Statement lines of a coverage object with their counts.
 *
 * @param {FileCoverage} fc
 * @returns {Map<number, number>}
 */
function lineCounts(fc) {
  return new Map(Object.entries(fc.getLineCoverage()).map(([l, n]) => [Number(l), n]));
}

/**
 * @param {string} line
 * @returns {string}
 */
function stripSkipNotes(line) {
  return line.replace(/ \(skipped: .*?\)(?= > |$)/g, '');
}

/**
 * Run-scoped entry (P0 §5.5.4): judged only against the kept runs whose report shows the activating test as run
 * (its domain present, the test not in that domain's skipped list) or lists the activation; accepted when at least
 * one kept run activated it and every judged run did. A kept run without report.json activated nothing.
 *
 * @param {LineEntry} entry
 * @param {readonly SourceRun[]} kept
 * @returns {boolean}
 */
export function runScopedAccepted(entry, kept) {
  const domain = domainOfPhase(entry.phase);
  /** @param {SourceRun} run */
  const activations = (run) =>
    (run.report?.dynamicAllowlist ?? []).filter((a) => a?.allowlistId === entry.id);
  const activated = kept.filter((run) => activations(run).length > 0);
  if (activated.length === 0) return false;
  const tests = new Set(
    activated.flatMap((run) => activations(run).map((a) => stripSkipNotes(String(a.test ?? ''))))
  );
  for (const run of kept) {
    if (activations(run).length > 0) continue;
    if (run.report === null) return false;
    const d = domain ? run.report.domains?.[domain] : undefined;
    if (!d) continue;
    const skipped = new Set((d.skipped ?? []).map((s) => stripSkipNotes(String(s.test))));
    const ran = [...tests].some((t) => !skipped.has(t));
    if (ran) return false;
  }
  return true;
}

/**
 * Allowlist files: entries and residue, each tagged with its phase, and the schema or format errors.
 *
 * @param {string} dir
 * @param {(data: unknown) => string[]} validate
 * @returns {{ lines: LineEntry[]; operations: OperationEntry[]; residue: ResidueEntry[]; files: string[]; errors: string[] }}
 */
export function loadAllowlists(dir, validate) {
  /** @type {LineEntry[]} */
  const lines = [];
  /** @type {OperationEntry[]} */
  const operations = [];
  /** @type {ResidueEntry[]} */
  const residue = [];
  /** @type {string[]} */
  const errors = [];
  /** @type {string[]} */
  const files = [];
  /** @type {string[]} */
  let names;
  try {
    names = readdirSync(dir)
      .filter((n) => n.endsWith('.json'))
      .sort();
  } catch {
    return { lines, operations, residue, files, errors };
  }
  for (const name of names) {
    const phase = name.slice(0, -'.json'.length);
    const where = `allowlist/${name}`;
    files.push(where);
    if (!(/** @type {readonly string[]} */ (PHASES).includes(phase))) {
      errors.push(`${where}: file name is not a phase`);
      continue;
    }
    /** @type {any} */
    let data;
    try {
      data = readJsonFile(join(dir, name));
    } catch {
      errors.push(`${where}: not valid JSON`);
      continue;
    }
    const schemaErrors = validate(data);
    if (schemaErrors.length > 0) {
      for (const e of schemaErrors) errors.push(`${where}: ${e}`);
      continue;
    }
    if (!Array.isArray(data) && data.phase !== phase)
      errors.push(`${where}: phase ${data.phase} differs from the file name`);
    const entries = Array.isArray(data) ? data : data.entries;
    const seen = new Set();
    for (const e of entries) {
      if (!String(e.id).startsWith(`${phase}-`))
        errors.push(`${where}: id ${e.id} does not start with ${phase}-`);
      if (seen.has(e.id)) errors.push(`${where}: duplicate id ${e.id}`);
      seen.add(e.id);
      if ('op' in e) operations.push({ ...e, phase });
      else lines.push({ ...e, phase });
    }
    if (!Array.isArray(data)) for (const r of data.residue ?? []) residue.push({ ...r, phase });
  }
  return { lines, operations, residue, files, errors };
}

/**
 * @param {string} schemaPath
 * @returns {(data: unknown) => string[]}
 */
export function allowlistValidator(schemaPath = SCHEMA_PATH) {
  const Ajv = ajvModule.default;
  const ajv = new Ajv({ allErrors: true, strict: false });
  const validate = ajv.compile(/** @type {object} */ (readJsonFile(schemaPath)));
  return (data) =>
    validate(data)
      ? []
      : (validate.errors ?? []).map(
          (e) => `schema: ${e.instancePath || '/'} ${e.message ?? e.keyword}`
        );
}

/**
 * The name a function-like node is declared under, or null for an anonymous one (a callback, an IIFE, a returned
 * function): function declarations, methods (static, object-literal), accessors and constructors, and function or
 * arrow expressions bound to a variable, a property or a class field, or named themselves.
 *
 * @param {import('typescript').Node} node
 * @returns {string | null}
 */
function declaredName(node) {
  /** @param {import('typescript').PropertyName} name */
  const text = (name) =>
    ts.isIdentifier(name) ||
    ts.isPrivateIdentifier(name) ||
    ts.isStringLiteral(name) ||
    ts.isNumericLiteral(name)
      ? name.text
      : name.getText();
  if (ts.isFunctionDeclaration(node)) return node.name ? node.name.text : 'default';
  if (ts.isMethodDeclaration(node) || ts.isGetAccessor(node) || ts.isSetAccessor(node))
    return text(node.name);
  if (ts.isConstructorDeclaration(node)) return 'constructor';
  if (!ts.isFunctionExpression(node) && !ts.isArrowFunction(node)) return null;
  if (ts.isFunctionExpression(node) && node.name) return node.name.text;
  let parent = node.parent;
  /** @type {import('typescript').Node} */
  let child = node;
  while (
    ts.isParenthesizedExpression(parent) ||
    ts.isAsExpression(parent) ||
    ts.isSatisfiesExpression(parent) ||
    ts.isTypeAssertionExpression(parent) ||
    ts.isNonNullExpression(parent)
  ) {
    child = parent;
    parent = parent.parent;
  }
  if (ts.isVariableDeclaration(parent) && parent.initializer === child)
    return ts.isIdentifier(parent.name) ? parent.name.text : null;
  if (
    (ts.isPropertyAssignment(parent) || ts.isPropertyDeclaration(parent)) &&
    parent.initializer === child
  )
    return text(parent.name);
  if (ts.isExportAssignment(parent)) return 'default';
  return null;
}

/**
 * The function-like nodes of a TypeScript source, by the position their body starts at (`<line>:<column>`, 1-based
 * line and 0-based column, the istanbul `loc.start` of the function), with their declared name or null; `byLine`
 * lists the names of the bodies starting on each line.
 *
 * @param {string} text
 * @param {string} fileName
 * @returns {{ byPos: Map<string, string | null>; byLine: Map<number, (string | null)[]> }}
 */
export function sourceFunctions(text, fileName) {
  const sf = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  /** @type {Map<string, string | null>} */
  const byPos = new Map();
  /** @type {Map<number, (string | null)[]>} */
  const byLine = new Map();
  /** @param {import('typescript').Node} node */
  const visit = (node) => {
    if (ts.isFunctionLike(node) && 'body' in node && node.body) {
      const body = /** @type {import('typescript').Node} */ (node.body);
      const { line, character } = sf.getLineAndCharacterOfPosition(body.getStart(sf));
      const name = declaredName(node);
      byPos.set(`${line + 1}:${character}`, name);
      byLine.set(line + 1, [...(byLine.get(line + 1) ?? []), name]);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return { byPos, byLine };
}

/**
 * The source name of a fnMap entry: the declared name, null when the source declares it anonymously, or, when no
 * body starts at its position, the provider's own name (null when that is `(anonymous_<n>)`). Several bodies on
 * the entry's line, one of them named: named (the stricter reading).
 *
 * @param {{ byPos: Map<string, string | null>; byLine: Map<number, (string | null)[]> } | null} source
 * @param {FunctionMapping} fn
 * @returns {string | null}
 */
function functionName(source, fn) {
  const provided = ANONYMOUS_RE.test(fn.name) ? null : fn.name;
  if (!source) return provided;
  const key = `${fn.loc.start.line}:${fn.loc.start.column}`;
  if (source.byPos.has(key)) return source.byPos.get(key) ?? provided;
  const onLine = source.byLine.get(fn.loc.start.line) ?? [];
  return onLine.find((n) => n !== null) ?? provided;
}

/**
 * True when the function ran live: its count is > 0 and the first statement inside its body (by position) ran;
 * a body without statements relies on the count.
 *
 * @param {FileCoverage} fc
 * @param {string} id
 */
function ranLive(fc, id) {
  if ((fc.f[id] ?? 0) === 0) return false;
  const fn = fc.fnMap[id];
  if (!fn) return false;
  const before = (
    /** @type {{ line: number; column: number | null }} */ a,
    /** @type {{ line: number; column: number | null }} */ b
  ) =>
    a.line < b.line ||
    (a.line === b.line && (a.column ?? 0) < (b.column ?? Number.POSITIVE_INFINITY));
  /** @type {string | null} */
  let first = null;
  for (const [sid, st] of Object.entries(fc.statementMap)) {
    if (before(st.start, fn.loc.start) || before(fn.loc.end, st.start)) continue;
    const current = first === null ? null : fc.statementMap[first];
    if (current === null || current === undefined || before(st.start, current.start)) first = sid;
  }
  return first === null || (fc.s[first] ?? 0) > 0;
}

/**
 * @param {{ start: { line: number }; end: { line: number } }} loc
 * @param {LineEntry} entry
 */
function covers(entry, loc) {
  return entry.lines[0] <= loc.start.line && loc.end.line <= entry.lines[1];
}

/**
 * @typedef {{
 *   root?: string;
 *   phase?: string;
 *   release?: boolean;
 *   coverageRoot?: string;
 *   unitReport?: string;
 *   allowlistDir?: string;
 *   schemaPath?: string;
 *   mergedPath?: string;
 *   reportPath?: string;
 *   ownerOf?: (path: string) => string;
 *   surface?: () => Array<{ name: string; file: string; line: number }>;
 *   writeOutputs?: boolean;
 * }} LiveCheckOptions
 */

/**
 * @typedef {{ file: string; functions: string; lines: string; allowlisted: number; deferred: number; stale: string[] }} FileRow
 * @typedef {{ status: 'pass' | 'fail' | 'no-data' | 'no-unit-report'; errors: string[]; warnings: string[];
 *   rows: FileRow[]; deferred: string[]; runs: { label: string; mtime: string }[]; scope: string[];
 *   surfaceRows: string[] }} LiveCheckResult
 */

/**
 * Runs the check (no process exit, no printing; main() prints).
 *
 * @param {LiveCheckOptions} [options]
 * @returns {LiveCheckResult}
 */
export function runLiveCheck(options = {}) {
  const root = options.root ?? REPO_ROOT;
  const release = options.release === true;
  const phase = options.phase;
  const ownerOf = options.ownerOf ?? defaultOwnerOf;
  const coverageRoot = options.coverageRoot ?? join(root, 'coverage-live');
  const unitReportPath = options.unitReport ?? join(root, 'coverage', 'coverage-final.json');
  const allowlistDir = options.allowlistDir ?? join(root, 'test', 'integration', 'allowlist');
  /** @type {string[]} */
  const errors = [];
  /** @type {string[]} */
  const warnings = [];
  /** @type {FileRow[]} */
  const rows = [];
  /** @type {string[]} */
  const deferredAccepted = [];

  const scope = srcFiles(root).filter((f) => phase === undefined || ownerOf(f) === phase);
  const runs = loadSourceRuns(coverageRoot);
  const runList = runs.map((r) => ({ label: r.label, mtime: r.mtime }));
  /** @param {LiveCheckResult['status']} status */
  const done = (status, surfaceRows = /** @type {string[]} */ ([])) => ({
    status,
    errors,
    warnings,
    rows,
    deferred: deferredAccepted,
    runs: runList,
    scope,
    surfaceRows,
  });

  const allow = loadAllowlists(allowlistDir, allowlistValidator(options.schemaPath));
  errors.push(...allow.errors);
  // A coverage-ignore hint would count its lines as covered without an allowlist entry.
  errors.push(...ignoreHintFindings(root, scope));
  const inPhase = (/** @type {{ phase: string; file?: string }} */ e) =>
    phase === undefined || e.phase === phase || (e.file !== undefined && scope.includes(e.file));
  const lineEntries = allow.lines.filter(inPhase);
  const opEntries = allow.operations.filter(inPhase);

  if (scope.length > 0 && runs.length === 0) {
    errors.push(
      `no live coverage data under ${posix(relative(root, coverageRoot))}/*/coverage-final.json`
    );
    return done('no-data');
  }

  /** @type {Record<string, FileCoverageData> | null} */
  let unit = null;
  if (existsSync(unitReportPath)) unit = /** @type {any} */ (readJsonFile(unitReportPath));
  else if (lineEntries.length > 0) {
    errors.push(
      'unit coverage report coverage/coverage-final.json missing (run npm run test:coverage)'
    );
    return done('no-unit-report');
  }
  /** @param {string} rel */
  const unitLines = (rel) => {
    if (!unit) return null;
    for (const [key, data] of Object.entries(unit)) {
      const p = posix(key);
      if (p === rel || p.endsWith(`/${rel}`))
        return lineCounts(libCoverage.createFileCoverage({ ...data, path: rel }));
    }
    return null;
  };

  // Per file: kept runs, merged data, accepted entries, function and line rules.
  /** @type {Map<string, FileCoverage | null>} */
  const mergedByFile = new Map();
  /** @type {Map<string, SourceRun[]>} */
  const keptByFile = new Map();
  for (const rel of srcFiles(root)) {
    const { kept } = keptRunsFor(runs, rel, sha256File(join(root, rel)));
    keptByFile.set(rel, kept);
    mergedByFile.set(rel, mergedCoverage(kept, rel));
  }

  /** @param {LineEntry} e */
  const entryActive = (e) => {
    if (e.deferredTo !== undefined && release) return false;
    if (e.runScoped) return runScopedAccepted(e, keptByFile.get(e.file) ?? []);
    return true;
  };

  /** @type {Map<string, ReturnType<typeof sourceFunctions> | null>} */
  const sourceByFile = new Map();
  /** @param {string} rel */
  const sourceOf = (rel) => {
    if (!sourceByFile.has(rel)) {
      const abs = join(root, rel);
      sourceByFile.set(
        rel,
        existsSync(abs) ? sourceFunctions(readFileSync(abs, 'utf8'), rel) : null
      );
    }
    return sourceByFile.get(rel) ?? null;
  };

  for (const rel of scope) {
    const { stale } = keptRunsFor(runs, rel, sha256File(join(root, rel)));
    const fc = mergedByFile.get(rel) ?? null;
    if (fc === null) {
      errors.push(
        `${rel}: no live data on its current version (stale runs: ${stale.join(', ') || 'none'})`
      );
      rows.push({ file: rel, functions: '-', lines: '-', allowlisted: 0, deferred: 0, stale });
      continue;
    }
    const active = lineEntries.filter((e) => e.file === rel && entryActive(e));
    const lines = lineCounts(fc);
    let allowlisted = 0;
    let deferred = 0;
    let coveredLines = 0;
    for (const [line, count] of lines) {
      if (count > 0) {
        coveredLines += 1;
        continue;
      }
      const entry = active.find((e) => e.lines[0] <= line && line <= e.lines[1]);
      if (!entry) errors.push(`${rel}:${line}: line not executed live and not allowlisted`);
      else if (entry.deferredTo !== undefined) deferred += 1;
      else allowlisted += 1;
    }
    const fns = Object.entries(fc.fnMap);
    const source = sourceOf(rel);
    let coveredFns = 0;
    for (const [id, fn] of fns) {
      if (ranLive(fc, id)) {
        coveredFns += 1;
        continue;
      }
      if (!FUNCTION_DIRS.some((d) => rel.startsWith(d))) continue;
      const name = functionName(source, fn);
      const exempt =
        name === null
          ? active.some((e) => covers(e, fn.loc))
          : active.some(
              (e) =>
                (e.category === 'environment' || e.deferredTo !== undefined) && covers(e, fn.loc)
            );
      if (!exempt) {
        errors.push(
          name === null
            ? `${rel}:${fn.loc.start.line}: anonymous function not executed live and not inside an allowlisted range`
            : `${rel}:${fn.decl.start.line}: function ${name} not executed live`
        );
      }
    }
    rows.push({
      file: rel,
      functions: `${coveredFns}/${fns.length}`,
      lines: `${coveredLines}/${lines.size}`,
      allowlisted,
      deferred,
      stale,
    });
  }

  // Allowlist validation (step 5).
  /** @type {Array<{ name: string; file: string; line: number }> | null} */
  let surfaceCache = null;
  const surfaceItems = () => {
    surfaceCache ??= options.surface
      ? options.surface()
      : walkSurface({ root }).items.map(({ name, file, line }) => ({ name, file, line }));
    return surfaceCache;
  };
  const phaseIndex = (/** @type {string} */ p) =>
    /** @type {readonly string[]} */ (PHASES).indexOf(p);
  for (const e of lineEntries) {
    const where = `allowlist/${e.phase}.json ${e.id}`;
    const abs = join(root, e.file);
    if (!existsSync(abs)) {
      errors.push(`${where}: file ${e.file} not found`);
      continue;
    }
    if (e.lines[0] > e.lines[1])
      errors.push(`${where}: lines ${e.lines[0]}–${e.lines[1]} reversed`);
    const text = readFileSync(abs, 'utf8').split('\n');
    if (!(text[e.lines[0] - 1] ?? '').includes(e.match))
      errors.push(`${where}: stale (match not found on ${e.file}:${e.lines[0]})`);
    if (!existsSync(join(root, e.unitTest)))
      errors.push(`${where}: unitTest ${e.unitTest} not found`);
    const unitCounts = unitLines(e.file);
    const statementLines = [...(unitCounts?.keys() ?? [])].filter(
      (l) => e.lines[0] <= l && l <= e.lines[1]
    );
    if (unitCounts === null) errors.push(`${where}: ${e.file} is not in the unit coverage report`);
    else {
      const uncovered = statementLines.filter((l) => (unitCounts.get(l) ?? 0) === 0);
      if (uncovered.length > 0)
        errors.push(`${where}: lines ${uncovered.join(', ')} not covered by the unit tests`);
    }
    const fc = mergedByFile.get(e.file) ?? null;
    if (fc !== null) {
      const live = lineCounts(fc);
      const rangeLines = [...live.keys()].filter((l) => e.lines[0] <= l && l <= e.lines[1]);
      // A line counts as executed when any statement on it ran; a callback on that line that never ran
      // still needs the entry (§5.7 step 3).
      const fnNotRun = Object.entries(fc.fnMap).some(
        ([id, fn]) => !ranLive(fc, id) && covers(e, fn.loc)
      );
      if (rangeLines.length > 0 && rangeLines.every((l) => (live.get(l) ?? 0) > 0) && !fnNotRun) {
        const message = `${where}: unneeded (every line of the range ran live)`;
        if (release) errors.push(message);
        else warnings.push(message);
      }
    }
    if (e.method !== undefined) {
      const names = new Set(surfaceItems().map((i) => i.name));
      if (!names.has(e.method)) errors.push(`${where}: method ${e.method} is not a surface name`);
    }
    if (e.deferredTo !== undefined) {
      const owner = ownerOf(e.file);
      if (release)
        errors.push(`${where}: deferredTo ${e.deferredTo} is not accepted with --release`);
      else if (phaseIndex(e.deferredTo) <= phaseIndex(owner))
        errors.push(`${where}: deferredTo ${e.deferredTo} does not come after the owner ${owner}`);
      else deferredAccepted.push(`${e.id} ${e.file}:${e.lines[0]}-${e.lines[1]} → ${e.deferredTo}`);
    }
  }
  /** @type {Map<string, { phase: string; decision: string }>} */
  let baseById = new Map();
  if (opEntries.length > 0) {
    baseById = new Map(loadBase(root).operations.map((o) => [o.id, o]));
  }
  for (const e of opEntries) {
    const where = `allowlist/${e.phase}.json ${e.id}`;
    const base = baseById.get(e.op);
    if (!base) errors.push(`${where}: op ${e.op} is not in base.json`);
    else if (base.phase !== e.phase || base.decision !== 'wrap')
      errors.push(`${where}: op ${e.op} is not a wrapped operation of ${e.phase}`);
    if (!existsSync(join(root, e.unitTest)))
      errors.push(`${where}: unitTest ${e.unitTest} not found`);
  }

  // Manifest consistency (step 6).
  const ids = new Map([...allow.lines, ...allow.operations].map((e) => [`${e.phase}:${e.id}`, e]));
  for (const [p, loaded] of Object.entries(loadPhaseManifests(root))) {
    if (phase !== undefined && p !== phase) continue;
    const data = /** @type {any} */ (loaded.data);
    const lists = ['operations', 'nonHttp', 'sdkMethods', 'aliases'];
    for (const list of lists) {
      for (const entry of data[list] ?? []) {
        if (entry?.allowlist !== undefined && !ids.has(`${p}:${entry.allowlist}`))
          errors.push(`spec/manifest/${p}.json ${list}: allowlist ${entry.allowlist} not found`);
      }
    }
  }

  // Outputs (step 7).
  /** @type {string[]} */
  const surfaceRows = [];
  if (scope.length > 0) {
    const scoped = surfaceItems().filter((i) => scope.includes(i.file));
    for (const item of scoped) {
      const fc = mergedByFile.get(item.file) ?? null;
      const source = sourceOf(item.file);
      const last = item.name.split('.').at(-1) ?? item.name;
      const fn = fc
        ? Object.entries(fc.fnMap)
            .map(([id, f]) => /** @type {const} */ ([id, f, functionName(source, f) ?? '']))
            .filter(([, , name]) => name === last || name.endsWith(`.${last}`))
            .sort(
              ([, a], [, b]) =>
                Math.abs(a.decl.start.line - item.line) - Math.abs(b.decl.start.line - item.line)
            )[0]
        : undefined;
      const count = fc && fn ? String(ranLive(fc, fn[0]) ? (fc.f[fn[0]] ?? 0) : 0) : '-';
      const entry = lineEntries.find(
        (e) =>
          e.method === item.name ||
          (e.file === item.file && e.lines[0] <= item.line && item.line <= e.lines[1])
      );
      surfaceRows.push(
        `| ${item.name} | ${item.file}:${item.line} | ${count} | ${entry?.id ?? ''} |`
      );
    }
  }
  if (options.writeOutputs !== false) {
    const reportPath = options.reportPath ?? join(coverageRoot, 'report.md');
    const mergedPath =
      options.mergedPath ?? join(root, 'test', 'integration', 'coverage-allowlist.json');
    mkdirSync(dirname(reportPath), { recursive: true });
    writeFileSync(
      reportPath,
      [
        `# Live coverage${phase ? ` (${phase})` : ''}${release ? ' (release)' : ''}`,
        '',
        `Source runs: ${runList.map((r) => `${r.label} (${r.mtime})`).join(', ') || 'none'}`,
        '',
        '| Surface item | Declared at | Live calls | Allowlist |',
        '|---|---|---|---|',
        ...surfaceRows,
        '',
        '## Accepted deferred entries',
        '',
        ...(deferredAccepted.length > 0 ? deferredAccepted.map((d) => `- ${d}`) : ['- none']),
        '',
      ].join('\n')
    );
    mkdirSync(dirname(mergedPath), { recursive: true });
    writeFileSync(
      mergedPath,
      `${JSON.stringify(
        {
          sources: allow.files,
          entries: [...allow.lines, ...allow.operations],
          residue: allow.residue,
        },
        null,
        2
      )}\n`
    );
  }
  return done(errors.length > 0 ? 'fail' : 'pass', surfaceRows);
}

/**
 * @param {readonly string[]} argv
 * @param {LiveCheckOptions & { log?: (l: string) => void; error?: (l: string) => void }} [deps]
 * @returns {number}
 */
export function main(argv, deps = {}) {
  const log = deps.log ?? ((l) => console.log(l));
  const error = deps.error ?? ((l) => console.error(l));
  /** @type {string | undefined} */
  let phase;
  /** @type {boolean} */
  let release;
  try {
    const args = parseArgs(argv, { flags: ['release'], options: ['phase'] });
    if (args.positionals.length) throw new UsageError(`unexpected argument ${args.positionals[0]}`);
    phase = parsePhase(args.options.phase);
    release = args.flags.release;
    if (phase !== undefined && release)
      throw new UsageError('--phase and --release exclude each other');
  } catch (err) {
    error(`coverage:live:check: ${/** @type {Error} */ (err).message}`);
    return 2;
  }
  const result = runLiveCheck({ ...deps, phase, release });
  for (const run of result.runs) log(`source run ${run.label} (${run.mtime})`);
  for (const row of result.rows) {
    log(
      `${row.file}  functions ${row.functions}  lines ${row.lines}  allowlisted ${row.allowlisted}  ` +
        `deferred ${row.deferred}${row.stale.length ? `  stale runs skipped: ${row.stale.join(', ')}` : ''}`
    );
  }
  for (const d of result.deferred) log(`deferred (accepted without --release): ${d}`);
  for (const w of result.warnings) log(`coverage:live:check: warning: ${w}`);
  for (const e of result.errors) error(`coverage:live:check: FAIL ${e}`);
  const mode = release ? ' --release' : phase ? ` --phase ${phase}` : '';
  log(
    `coverage:live:check${mode}: ${result.scope.length} file(s) in scope, ${result.runs.length} source run(s), ` +
      `${result.errors.length} problem(s), ${result.warnings.length} warning(s)`
  );
  if (result.status === 'no-data' || result.status === 'no-unit-report') return 2;
  return result.status === 'pass' ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.exitCode = main(process.argv.slice(2));
}
