// Fixture envelope loader, MSW response builder and contract checks (P0 §5.5.1, CONVENTIONS §6).
// Fixtures live in test/fixtures/<domain>/*.json (top level only; subfolders such as inputs/ are ignored).
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, join, relative, resolve } from 'node:path';
import type { SpecValidator } from './spec';

export const FIXTURES_ROOT = resolve(__dirname, '..', 'fixtures');
export const REPO_ROOT = resolve(__dirname, '..', '..');
export const FIXTURE_SOURCES = ['spec', 'live', 'server-code'] as const;
export const FIXTURE_DOMAINS = [
  'harness',
  'core',
  'assets',
  'positions-spatial',
  'venues-navigation',
  'dashboards-rules',
  'notifications',
  'etl',
  'websocket',
] as const;
const ENVELOPE_KEYS = new Set([
  '_source',
  '_note',
  '_operation',
  '_nonHttp',
  '_usi',
  '_recorded',
  'status',
  'contentType',
  'headers',
  'body',
  'text',
  'base64',
]);
const BODY_KEYS = ['body', 'text', 'base64'] as const;

export interface FixtureEnvelope {
  _source: (typeof FIXTURE_SOURCES)[number];
  /** Required unless `_source === 'spec'`: describes the shape difference; no server file paths. */
  _note?: string;
  /** "METHOD path" as in base.json; required for `spec` fixtures and on the 2xx fixture of every wrapped op. */
  _operation?: string;
  /** WebSocket fixtures (P8): id of a `nonHttp` manifest entry instead of `_operation`. */
  _nonHttp?: string;
  _usi?: string[];
  _recorded?: { specVersion: string; runId: string };
  /** Default 200. */
  status?: number;
  /** Default: application/json for JSON, text/plain for `text`, none for null, application/octet-stream for `base64`. */
  contentType?: string;
  headers?: Record<string, string>;
  /** JSON value, or null for an empty body. Exactly one of `body` / `text` / `base64`. */
  body?: unknown;
  /** Non-JSON body (text/plain, HTML, CSV, SSE). */
  text?: string;
  /** Binary body, base64-encoded. */
  base64?: string;
}

export interface FixtureFile {
  domain: string;
  name: string;
  /** Absolute path. */
  file: string;
}

export interface LoadedFixture extends FixtureFile {
  raw: string;
  data: FixtureEnvelope;
}

export interface FixtureCheck {
  /** Contract violations: the fixture is rejected. */
  errors: string[];
  /** Informational: validation results of live/server-code fixtures, additional properties. */
  reports: string[];
  /** A live/server-code fixture whose body validates against the spec (fails only with --release). */
  overrideUnnecessary: boolean;
}

/** Domain folders under the fixtures root, and their top-level `*.json` files (subfolders ignored). */
export function listFixtureFiles(root: string = FIXTURES_ROOT): FixtureFile[] {
  if (!existsSync(root)) return [];
  const out: FixtureFile[] = [];
  for (const domain of readdirSync(root).sort()) {
    const dir = join(root, domain);
    if (!statSync(dir).isDirectory()) continue;
    for (const entry of readdirSync(dir).sort()) {
      const file = join(dir, entry);
      if (!entry.endsWith('.json') || !statSync(file).isFile()) continue;
      out.push({ domain, name: basename(entry, '.json'), file });
    }
  }
  return out;
}

/** Non-JSON files and non-domain entries directly under the fixtures root (they should not exist). */
export function strayFixtureEntries(root: string = FIXTURES_ROOT): string[] {
  if (!existsSync(root)) return [];
  return readdirSync(root)
    .filter(
      (e) =>
        !statSync(join(root, e)).isDirectory() ||
        !(FIXTURE_DOMAINS as readonly string[]).includes(e)
    )
    .sort();
}

export function readFixture(f: FixtureFile): LoadedFixture {
  const raw = readFileSync(f.file, 'utf8');
  return { ...f, raw, data: JSON.parse(raw) as FixtureEnvelope };
}

/** Loads `test/fixtures/<domain>/<name>.json` (name with or without `.json`). */
export function loadFixture(
  domain: string,
  name: string,
  root: string = FIXTURES_ROOT
): FixtureEnvelope {
  const file = join(root, domain, name.endsWith('.json') ? name : `${name}.json`);
  return JSON.parse(readFileSync(file, 'utf8')) as FixtureEnvelope;
}

export function loadAllFixtures(root: string = FIXTURES_ROOT): LoadedFixture[] {
  return listFixtureFiles(root).map(readFixture);
}

function has(f: FixtureEnvelope, key: (typeof BODY_KEYS)[number]): boolean {
  return Object.prototype.hasOwnProperty.call(f, key) && f[key] !== undefined;
}

/** The content type a fixture's response carries (explicit, or the envelope default). */
export function fixtureContentType(f: FixtureEnvelope): string | undefined {
  if (f.contentType !== undefined) return f.contentType;
  if (has(f, 'base64')) return 'application/octet-stream';
  if (has(f, 'text')) return 'text/plain';
  if (!has(f, 'body') || f.body === null) return undefined;
  return 'application/json';
}

/**
 * The MSW `Response` of a fixture: `body: null` (or no body key) → empty body, `text` → the string,
 * `base64` → the decoded bytes, any other `body` → JSON; with `status`, content type and `headers`.
 */
export function fixtureResponse(f: FixtureEnvelope): Response {
  const headers = new Headers(f.headers ?? {});
  const contentType = fixtureContentType(f);
  if (contentType !== undefined && !headers.has('content-type'))
    headers.set('content-type', contentType);
  let payload: BodyInit | null = null;
  if (has(f, 'base64')) payload = new Uint8Array(Buffer.from(f.base64 as string, 'base64'));
  else if (has(f, 'text')) payload = f.text as string;
  else if (has(f, 'body') && f.body !== null) payload = JSON.stringify(f.body);
  return new Response(payload, { status: f.status ?? 200, headers });
}

const RESERVED_EMAIL_DOMAIN =
  /@(?:[a-z0-9-]+\.)*(?:example\.(?:com|net|org)|[a-z0-9-]+\.(?:invalid|test|example))$/i;
const HYGIENE: Array<[string, RegExp]> = [
  ['e-mail address', /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g],
  ['JWT-like token', /\beyJ[A-Za-z0-9_-]{8,}/g],
  ['bearer credential', /Bearer\s/g],
  ['40-hex identifier', /\b[0-9a-fA-F]{40}\b/g],
  ['server source reference', /\.(?:js|h|cpp):\d+/g],
  ['server repository path', /(?:rtls-api|rt_positions_server)\//g],
];

/**
 * Hygiene problems of a fixture's raw text (always fatal, P0 §5.5.1). E-mail addresses at reserved
 * domains (RFC 2606/6761: example.com/.net/.org, *.invalid, *.test, *.example), such as the scrub
 * placeholder `user@example.invalid`, are not problems.
 */
export function hygieneProblems(text: string): string[] {
  const problems: string[] = [];
  for (const [label, pattern] of HYGIENE) {
    const hits = [...text.matchAll(pattern)].filter(
      (m) => label !== 'e-mail address' || !RESERVED_EMAIL_DOMAIN.test(m[0])
    );
    if (hits.length)
      problems.push(`hygiene: ${label} (${hits.length} occurrence${hits.length > 1 ? 's' : ''})`);
  }
  return problems;
}

function isBase64(s: string): boolean {
  return /^[A-Za-z0-9+/]*={0,2}$/.test(s) && s.length % 4 === 0;
}

/**
 * Hygiene problems of the bytes of a `base64` body (P0 §5.5.1: hygiene applies to every fixture). The encoded
 * text hides its content from every pattern, so the bytes are read as latin1 (one character per byte: an ASCII
 * e-mail, token or reference reads as itself, in UTF-8 text too) and checked like the raw file.
 */
export function base64HygieneProblems(base64: string): string[] {
  return hygieneProblems(Buffer.from(base64, 'base64').toString('latin1')).map((p) =>
    p.replace(/^hygiene: /, 'hygiene (decoded base64): ')
  );
}

/**
 * Checks one fixture against the envelope and contract rules of P0 §5.5.1:
 * - `spec`: `_operation` and `status` declared in the spec, JSON `body` valid against the response schema
 *   (a `text`/`base64` fixture: its content type declared for that status; `body: null`: the status declares
 *   no content);
 * - `live` / `server-code`: `_note` present; when `_operation` is set and a schema exists, the validation
 *   result is reported; a body that validates is reported as "override possibly unnecessary";
 * - additional properties are reported, never failed; hygiene always fails, on the raw file and on the decoded
 *   bytes of a `base64` body.
 */
export function checkFixture(fixture: LoadedFixture, validator: SpecValidator): FixtureCheck {
  const errors: string[] = [...hygieneProblems(fixture.raw)];
  const reports: string[] = [];
  let overrideUnnecessary = false;
  const f = fixture.data as FixtureEnvelope & Record<string, unknown>;

  if (f === null || typeof f !== 'object' || Array.isArray(f)) {
    return { errors: [...errors, 'envelope: not a JSON object'], reports, overrideUnnecessary };
  }
  for (const key of Object.keys(f))
    if (!ENVELOPE_KEYS.has(key)) errors.push(`envelope: unknown key "${key}"`);
  if (!(FIXTURE_SOURCES as readonly string[]).includes(f._source as string))
    errors.push(`envelope: _source must be one of ${FIXTURE_SOURCES.join(', ')}`);
  const bodies = BODY_KEYS.filter((k) => has(f, k));
  if (bodies.length !== 1)
    errors.push(
      `envelope: exactly one of body / text / base64 is required (found ${bodies.length ? bodies.join(', ') : 'none'})`
    );
  if (f.status !== undefined && (!Number.isInteger(f.status) || f.status < 100 || f.status > 599))
    errors.push('envelope: status must be an integer 100–599');
  if (f._source !== 'spec' && (typeof f._note !== 'string' || f._note.trim() === ''))
    errors.push(`envelope: _note is required for _source "${String(f._source)}"`);
  if (f.text !== undefined && typeof f.text !== 'string')
    errors.push('envelope: text must be a string');
  if (f.base64 !== undefined && (typeof f.base64 !== 'string' || !isBase64(f.base64)))
    errors.push('envelope: base64 must be a base64 string');
  else if (typeof f.base64 === 'string') errors.push(...base64HygieneProblems(f.base64));
  if (f.contentType !== undefined && typeof f.contentType !== 'string')
    errors.push('envelope: contentType must be a string');
  if (
    f.headers !== undefined &&
    (typeof f.headers !== 'object' ||
      f.headers === null ||
      Object.values(f.headers).some((v) => typeof v !== 'string'))
  )
    errors.push('envelope: headers must map names to strings');
  if (
    f._usi !== undefined &&
    (!Array.isArray(f._usi) || f._usi.some((u) => !/^USI-P\d+-\d+$/.test(String(u))))
  )
    errors.push('envelope: _usi must be a list of USI-P<n>-<m> ids');
  if (f._nonHttp !== undefined && typeof f._nonHttp !== 'string')
    errors.push('envelope: _nonHttp must be a string');
  if (f._operation !== undefined && f._nonHttp !== undefined)
    errors.push('envelope: _operation and _nonHttp exclude each other');
  if (
    f._operation !== undefined &&
    (typeof f._operation !== 'string' || !validator.hasOperation(f._operation))
  )
    errors.push(`envelope: _operation "${String(f._operation)}" is not an operation of the spec`);
  if (errors.length) return { errors, reports, overrideUnnecessary };

  const status = f.status ?? 200;
  const op = f._operation;
  const contentType = fixtureContentType(f);
  if (f._source === 'spec') {
    if (op === undefined) {
      errors.push('spec fixture: _operation is required');
      return { errors, reports, overrideUnnecessary };
    }
    if (!validator.isStatusDeclared(op, status)) {
      errors.push(`spec fixture: status ${status} is not declared for ${op}`);
      return { errors, reports, overrideUnnecessary };
    }
    const declared = validator.contentTypes(op, status);
    if (has(f, 'body') && f.body === null) {
      if (declared.length)
        errors.push(
          `spec fixture: ${op} ${status} declares content (${declared.join(', ')}), body is empty`
        );
    } else if (has(f, 'body')) {
      const result = validator.validateResponse(op, status, f.body, contentType);
      if (!result)
        errors.push(
          `spec fixture: ${op} ${status} has no ${contentType} schema (use _source live or server-code)`
        );
      else {
        for (const e of result.errors) errors.push(`spec fixture: body${e.path} ${e.message}`);
        for (const a of result.additional) reports.push(`additional property body${a}`);
      }
    } else {
      const base = (contentType ?? '').split(';')[0]?.trim().toLowerCase();
      if (!declared.some((d) => d.toLowerCase() === base))
        errors.push(
          `spec fixture: content type ${String(contentType)} is not declared for ${op} ${status}`
        );
    }
    return { errors, reports, overrideUnnecessary };
  }

  if (op !== undefined && has(f, 'body') && f.body !== null) {
    const result = validator.validateResponse(op, status, f.body, contentType);
    if (result) {
      if (result.valid) {
        overrideUnnecessary = true;
        reports.push(
          `${f._source} fixture validates against the spec: override possibly unnecessary`
        );
      } else {
        reports.push(
          `${f._source} fixture differs from the spec: ${result.errors.map((e) => `body${e.path} ${e.message}`).join('; ')}`
        );
      }
      for (const a of result.additional) reports.push(`additional property body${a}`);
    }
  }
  return { errors, reports, overrideUnnecessary };
}

/** Repository-relative POSIX path of a fixture file (for reports). */
export function fixtureLabel(f: FixtureFile): string {
  return relative(REPO_ROOT, f.file).split('\\').join('/');
}
