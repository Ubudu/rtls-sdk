// `npm run test:integration:scan -- <paths…> | --tracked | --stdin` (P0 §6.1, P10 H2). Looks for the configured
// API key, the namespace and the other values of `.env` in files and prints `file:line class` for every hit
// (classes `api-key`, `namespace`, `env-value`), never a value. Values come from the process environment first,
// then from `.env` (read by env.ts). `env-value` covers the other `.env` variables except the public base URL and
// the run id, and only values of at least 8 characters. Exit codes: 0 nothing found, 1 findings, 2 usage or
// precondition (a tier or internal key in `.env`), 3 credentials missing. Offline: no request is sent.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { listTrackedFiles } from '../../../scripts/lib/git.mjs';
import { dotenvValues, HarnessPrecondition, type EnvSources } from './env';
import { CHECKOUT_ROOT } from './state-io.mjs';

export type ScanClass = 'api-key' | 'namespace' | 'env-value';

export interface ScanTarget {
  cls: ScanClass;
  /** the value and its URL-encoded form (never printed) */
  forms: string[];
}

export interface ScanFinding {
  file: string;
  line: number;
  cls: ScanClass;
}

/** `.env` variables never looked for as `env-value` (public or not secret). */
const NOT_SECRET = new Set(['RTLS_BASE_URL', 'RTLS_IT_RUN_ID']);
const MIN_ENV_VALUE_LENGTH = 8;
const SKIP_DIRS = new Set(['.git', 'node_modules']);

function forms(value: string): string[] {
  const encoded = encodeURIComponent(value);
  return encoded === value ? [value] : [value, encoded];
}

/** What to look for: the key, the namespace and the other `.env` values. */
export function scanTargets(sources: EnvSources = {}): ScanTarget[] {
  const processEnv = sources.processEnv ?? process.env;
  const file = dotenvValues(sources);
  const value = (key: string): string | undefined => {
    const v = processEnv[key];
    if (v !== undefined && v !== '') return v;
    const f = file[key];
    return f !== undefined && f !== '' ? f : undefined;
  };
  const targets: ScanTarget[] = [];
  const key = value('RTLS_API_KEY');
  const ns = value('APP_NAMESPACE');
  if (key) targets.push({ cls: 'api-key', forms: forms(key) });
  if (ns) targets.push({ cls: 'namespace', forms: forms(ns) });
  for (const [name, v] of Object.entries(file)) {
    if (name === 'RTLS_API_KEY' || name === 'APP_NAMESPACE' || NOT_SECRET.has(name)) continue;
    if (v.length < MIN_ENV_VALUE_LENGTH || v === key || v === ns) continue;
    targets.push({ cls: 'env-value', forms: forms(v) });
  }
  return targets;
}

/** Lines (1-based) of `text` that hold a target, one finding per line and class. */
export function scanText(
  text: string,
  targets: readonly ScanTarget[]
): { line: number; cls: ScanClass }[] {
  const out: { line: number; cls: ScanClass }[] = [];
  const lines = text.split(/\r?\n/);
  lines.forEach((content, i) => {
    const classes = new Set<ScanClass>();
    for (const t of targets) if (t.forms.some((f) => content.includes(f))) classes.add(t.cls);
    for (const cls of classes) out.push({ line: i + 1, cls });
  });
  return out;
}

function isBinary(bytes: Buffer): boolean {
  return bytes.subarray(0, 8192).includes(0);
}

function expand(path: string): string[] {
  const st = statSync(path);
  if (!st.isDirectory()) return [path];
  const out: string[] = [];
  for (const name of readdirSync(path).sort()) {
    if (SKIP_DIRS.has(name)) continue;
    out.push(...expand(join(path, name)));
  }
  return out;
}

export interface ScanCliDeps {
  envSources?: EnvSources;
  /** folder that relative paths and `--tracked` resolve against (default: the checkout root) */
  cwd?: string;
  readStdin?: () => Promise<string>;
  out?: (line: string) => void;
  err?: (line: string) => void;
}

async function readAllStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk as Buffer));
  return Buffer.concat(chunks).toString('utf8');
}

const USAGE = 'usage: test:integration:scan -- <paths…> | --tracked | --stdin';

export async function scanCli(argv: readonly string[], deps: ScanCliDeps = {}): Promise<number> {
  const out = deps.out ?? ((line: string) => console.log(line));
  const err = deps.err ?? ((line: string) => console.error(line));
  const cwd = deps.cwd ?? CHECKOUT_ROOT;
  const tracked = argv.includes('--tracked');
  const stdin = argv.includes('--stdin');
  const flags = argv.filter((a) => a.startsWith('--'));
  const paths = argv.filter((a) => !a.startsWith('--'));
  if (
    flags.some((f) => f !== '--tracked' && f !== '--stdin') ||
    Number(tracked) + Number(stdin) + Number(paths.length > 0) !== 1
  ) {
    err(USAGE);
    return 2;
  }
  let targets: ScanTarget[];
  try {
    targets = scanTargets(deps.envSources);
  } catch (error) {
    if (error instanceof HarnessPrecondition) {
      err(`scan: ${error.message}`);
      return 2;
    }
    throw error;
  }
  if (!targets.some((t) => t.cls === 'api-key') || !targets.some((t) => t.cls === 'namespace')) {
    err('scan: credentials missing (RTLS_API_KEY, APP_NAMESPACE): nothing to look for');
    return 3;
  }

  const findings: ScanFinding[] = [];
  let scanned = 0;
  if (stdin) {
    const text = await (deps.readStdin ?? readAllStdin)();
    scanned = 1;
    for (const f of scanText(text, targets)) findings.push({ file: '<stdin>', ...f });
  } else {
    const files = tracked
      ? listTrackedFiles({ cwd }).map((f) => resolve(cwd, f))
      : paths.flatMap((p) => expand(resolve(cwd, p)));
    for (const file of files) {
      let bytes: Buffer;
      try {
        bytes = readFileSync(file);
      } catch {
        continue; // a tracked file deleted in the work tree
      }
      if (isBinary(bytes)) continue;
      scanned += 1;
      const label = relative(cwd, file).split('\\').join('/') || file;
      for (const f of scanText(bytes.toString('utf8'), targets))
        findings.push({ file: label, ...f });
    }
  }
  for (const f of findings) out(`${f.file}:${f.line} ${f.cls}`);
  out(`scan: ${scanned} file(s), ${findings.length} finding(s)`);
  return findings.length > 0 ? 1 : 0;
}

const isMain =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  scanCli(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (error: unknown) => {
      console.error(`scan: ${error instanceof Error ? error.name : 'Error'}`);
      process.exit(2);
    }
  );
}
