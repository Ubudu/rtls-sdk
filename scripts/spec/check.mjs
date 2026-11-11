#!/usr/bin/env node
// `npm run spec:check` (P0 §6.1): offline consistency of the vendored spec.
//   1. spec/rtls-api.swagger.json is in normalised form (re-normalising is byte-identical);
//   2. spec/spec.lock.json matches it: sha256 of the file, info.version, operation and path counts;
//   3. regenerating the types with the `generate` command of package.json into .cache/schema.ts gives
//      exactly src/generated/schema.ts (a stale or hand-edited schema fails).
// Options (for tests and tooling): --spec <file> --lock <file> --schema <file> --out <file>.
// Exit 0 pass, 1 fail, 2 usage or precondition error.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { delimiter, dirname, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  LOCK_PATH,
  REPO_ROOT,
  SPEC_PATH,
  countSpec,
  normalizeSpecText,
  sha256,
} from './normalize.mjs';

export const SCHEMA_PATH = resolve(REPO_ROOT, 'src', 'generated', 'schema.ts');
export const CACHE_SCHEMA_PATH = resolve(REPO_ROOT, '.cache', 'schema.ts');

/**
 * Compares a vendored spec text with its lock. Returns the list of problems (empty = consistent).
 *
 * @param {string} specText
 * @param {unknown} lock
 * @returns {string[]}
 */
export function checkLock(specText, lock) {
  /** @type {string[]} */
  const problems = [];
  /** @type {any} */
  let spec;
  try {
    spec = JSON.parse(specText);
  } catch (err) {
    return [`spec is not valid JSON: ${/** @type {Error} */ (err).message}`];
  }
  if (normalizeSpecText(specText) !== specText) {
    problems.push('spec is not in normalised form (run scripts/spec/normalize.mjs)');
  }
  if (lock === null || typeof lock !== 'object')
    return [...problems, 'lock is missing or not an object'];
  const l = /** @type {Record<string, unknown>} */ (lock);
  for (const key of ['version', 'sha256', 'operations', 'paths', 'source']) {
    if (!(key in l)) problems.push(`lock has no "${key}"`);
  }
  const actualSha = sha256(specText);
  if (l.sha256 !== actualSha)
    problems.push(`lock sha256 ${String(l.sha256)} != spec sha256 ${actualSha}`);
  const version = spec?.info?.version ?? null;
  if (l.version !== version)
    problems.push(`lock version ${String(l.version)} != spec info.version ${String(version)}`);
  const counts = countSpec(spec ?? {});
  if (l.operations !== counts.operations) {
    problems.push(
      `lock operations ${String(l.operations)} != spec operations ${counts.operations}`
    );
  }
  if (l.paths !== counts.paths)
    problems.push(`lock paths ${String(l.paths)} != spec paths ${counts.paths}`);
  return problems;
}

/**
 * Splits the `generate` script of package.json into its input, output and flags.
 * Expected form: `openapi-typescript <input> -o <output> [flags…]`.
 *
 * @param {string} script
 * @returns {{ bin: string; input: string; output: string; flags: string[] }}
 */
export function parseGenerateScript(script) {
  const tokens = script
    .trim()
    .split(/\s+/)
    .map((t) => t.replace(/^["']|["']$/g, ''));
  const [bin, ...rest] = tokens;
  if (bin !== 'openapi-typescript')
    throw new Error(`generate script must start with openapi-typescript: ${script}`);
  /** @type {string | undefined} */
  let input;
  /** @type {string | undefined} */
  let output;
  /** @type {string[]} */
  const flags = [];
  for (let i = 0; i < rest.length; i++) {
    const t = /** @type {string} */ (rest[i]);
    if (t === '-o' || t === '--output') output = rest[++i];
    else if (t.startsWith('-')) flags.push(t);
    else if (input === undefined) input = t;
    else throw new Error(`unexpected argument in generate script: ${t}`);
  }
  if (!input || !output)
    throw new Error(`generate script needs an input and -o <output>: ${script}`);
  if (/^https?:/.test(input)) throw new Error('generate must read the vendored spec, not a URL');
  return { bin, input, output, flags };
}

/**
 * Runs the generate command of package.json with another input and output file.
 *
 * @param {{ specPath: string; outPath: string }} paths
 * @returns {{ ok: boolean; output: string }}
 */
export function regenerate({ specPath, outPath }) {
  const pkg = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8'));
  const { bin, flags } = parseGenerateScript(String(pkg.scripts?.generate ?? ''));
  mkdirSync(dirname(outPath), { recursive: true });
  const env = {
    ...process.env,
    PATH: [join(REPO_ROOT, 'node_modules', '.bin'), process.env.PATH ?? ''].join(delimiter),
  };
  const res = spawnSync(bin, [specPath, '-o', outPath, ...flags], {
    cwd: REPO_ROOT,
    env,
    encoding: 'utf8',
    shell: process.platform === 'win32',
  });
  return {
    ok: res.status === 0,
    output: `${res.stdout ?? ''}${res.stderr ?? ''}${res.error ? String(res.error) : ''}`,
  };
}

/**
 * @param {string[]} argv
 */
function parseArgs(argv) {
  const args = { spec: SPEC_PATH, lock: LOCK_PATH, schema: SCHEMA_PATH, out: CACHE_SCHEMA_PATH };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const v = argv[i + 1];
    if (a === '--spec' && v) ((args.spec = resolve(v)), i++);
    else if (a === '--lock' && v) ((args.lock = resolve(v)), i++);
    else if (a === '--schema' && v) ((args.schema = resolve(v)), i++);
    else if (a === '--out' && v) ((args.out = resolve(v)), i++);
    else throw new Error(`unknown argument: ${a}`);
  }
  return args;
}

/**
 * @param {string[]} argv
 * @returns {number}
 */
export function main(argv) {
  /** @type {ReturnType<typeof parseArgs>} */
  let args;
  try {
    args = parseArgs(argv);
  } catch (err) {
    console.error(`spec:check: ${/** @type {Error} */ (err).message}`);
    return 2;
  }
  const rel = (/** @type {string} */ p) => relative(process.cwd(), p) || p;
  if (!existsSync(args.spec)) {
    console.error(`spec:check: ${rel(args.spec)} not found`);
    return 2;
  }
  const specText = readFileSync(args.spec, 'utf8');
  /** @type {unknown} */
  let lock = null;
  if (existsSync(args.lock)) {
    try {
      lock = JSON.parse(readFileSync(args.lock, 'utf8'));
    } catch {
      lock = null;
    }
  }
  const problems = checkLock(specText, lock);
  const spec = (() => {
    try {
      return JSON.parse(specText);
    } catch {
      return {};
    }
  })();
  const counts = countSpec(spec);

  const gen = regenerate({ specPath: args.spec, outPath: args.out });
  if (!gen.ok) {
    problems.push(`type generation failed:\n${gen.output.trim()}`);
  } else if (!existsSync(args.schema)) {
    problems.push(`${rel(args.schema)} is missing (run npm run generate)`);
  } else if (readFileSync(args.schema, 'utf8') !== readFileSync(args.out, 'utf8')) {
    problems.push(
      `${rel(args.schema)} differs from the types generated from ${rel(args.spec)} (run npm run generate)`
    );
  }

  if (problems.length > 0) {
    for (const p of problems) console.error(`spec:check: FAIL ${p}`);
    return 1;
  }
  console.log(
    `spec:check: ok — version ${spec.info?.version}, ${counts.operations} operations, ${counts.paths} paths, ` +
      `lock matches, ${rel(args.schema)} up to date`
  );
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.exitCode = main(process.argv.slice(2));
}
