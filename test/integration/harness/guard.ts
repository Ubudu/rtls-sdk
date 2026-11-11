// Guarded fetch (P0 §5.3 G1–G15, G17, G18). A request that breaks a rule throws GuardViolation before any
// byte leaves the process; the violation is appended to `.state/<runId>/violations.jsonl` (rule, method,
// path template with {ns}; never values) and fails the run in teardown even if the test caught it. G18 also
// applies a time-limited verdict's end and sends positions to this run's MAC range only (LIVE-TESTING §2.7).
// `expectGuardViolation(rule, fn)` is the only way to expect one. G17: nothing here logs a body, a URL with
// credentials, a header or a state value; violation messages name the rule, the method and the template.
import { AsyncLocalStorage } from 'node:async_hooks';
import { createHash } from 'node:crypto';
import { activeHarness } from './active';
import { countAssertion } from './assertion-count';
import type { BudgetCounts } from './budgets';
import { alertRulesChange, configResourceOf, type ConfigResourceName } from './config-resources';
import type { Harness, RequestLogEntry } from './context';
import { isRunTestMac, isTestMac, normalizeMacLike, ZERO_ID } from './names';
import {
  ASSET_HISTORY_TEMPLATE,
  BINARY_BODY_TEMPLATES,
  CREATE_COLLECTIONS,
  DAY_MS,
  DUMMY_API_KEY,
  ES_ALERTS_TEMPLATE,
  ES_QUERY_TEMPLATE,
  ES_RANGE_TEMPLATES,
  ETL_WRITE_MAX_BYTES,
  failedVerdicts,
  foreignMacTokens,
  hasSegmentPrefix,
  HOUR_MS,
  isPlainObject,
  looksLikeMac,
  MAC_KEYS,
  MAC_TOKEN_RE,
  MULTIPART_TEMPLATES,
  NAMESPACE_KEYS,
  NAMESPACE_LIST_KEYS,
  namespaceListOk,
  NAMESPACE_PARAMS,
  NEVER_METHOD_PREFIXES,
  NEVER_PREFIXES,
  NEVER_TEMPLATES,
  PATCH_ASSET_DATA_TRUE,
  PATH_KEYED_WRITES,
  READ_ONLY_POSTS,
  SERVER_CHANNELS,
  STREAM_DEADLINE_MS,
  T,
  unreachableTarget,
  type ReachShape,
} from './policy';
import { matchRoute, type RouteMatch } from './routes';

/** A request or frame that the guard refused; `rule` is the §5.3 rule id (or `RG` for a request guard). */
export class GuardViolation extends Error {
  readonly rule: string;
  constructor(rule: string, method: string, template: string | null, reason: string) {
    super(`GuardViolation ${rule}: ${method} ${template ?? '<unmatched path>'}: ${reason}`);
    this.name = 'GuardViolation';
    this.rule = rule;
  }
}

// ─── Scopes ─────────────────────────────────────────────────────────────────────────────────────────

export interface GuardedRequest {
  method: string;
  path: string;
  template: string | null;
  query: Record<string, string>;
  body: unknown;
}

export interface AttemptedRequest {
  method: string;
  path: string;
  template: string | null;
  query: Record<string, string>;
  /** sha256 of the canonical JSON of the body, never the body */
  bodyHash: string | null;
  allowed: boolean;
}

export type ExistingEntityKind = 'notification-connections' | 'recipient-mappings';

/**
 * Admission scopes, active for the async chain of the function run inside them (AsyncLocalStorage).
 *
 * @internal used by config-cycle.ts, existing-entity.ts, cleanup.ts, sweeper.ts, request-guard.ts and the
 * global teardown
 */
export type GuardScope =
  /**
   * global teardown action (replay, restore, own-run sweep): G1–G3, G5, G6 apply; G4 applies the run's tier flags
   * only (no block); `replay` marks the replay of registered cleanups, which may only remove
   */
  | { kind: 'teardown'; replay?: boolean }
  /** a block's cleanup replay: only removals (G4), exempt from G18 */
  | { kind: 'cleanup' }
  /** the sweeper: G1–G3 and G6; a mutating request passes only on a path its find rules registered */
  | { kind: 'sweeper'; paths: Set<string> }
  /** a tier-C cycle that holds the config lock: admits the resource's writes that `validate` accepts */
  | {
      kind: 'config';
      resource: ConfigResourceName;
      before: unknown;
      mode: 'cycle' | 'sweeper';
      validate: (body: unknown) => boolean;
      lockHeld: () => boolean;
      paths?: Set<string>;
    }
  /** withExistingEntityGuard: enables G10 for `entity` while its body runs */
  | {
      kind: 'existing-entity';
      entity: ExistingEntityKind;
      lockHeld: () => boolean;
      paths?: Set<string>;
    }
  | {
      kind: 'request-guard';
      predicate: (r: GuardedRequest) => boolean;
      attempts: AttemptedRequest[];
    }
  /** expectGuardViolation: `open` while its `fn` runs; a violation raised after it returned is unexpected */
  | { kind: 'expect-violation'; seen: string[]; open: boolean };

const scopeStorage = new AsyncLocalStorage<readonly GuardScope[]>();

/** @internal */
export function currentScopes(): readonly GuardScope[] {
  return scopeStorage.getStore() ?? [];
}

/** @internal runs `fn` with `scope` added to the active scopes. */
export function runWithGuardScope<T>(scope: GuardScope, fn: () => T): T {
  return scopeStorage.run([...currentScopes(), scope], fn);
}

function hasScope(scopes: readonly GuardScope[], ...kinds: GuardScope['kind'][]): boolean {
  return scopes.some((s) => kinds.includes(s.kind));
}

/**
 * Records a violation (rule, method, template with `{ns}`) in `violations.jsonl`, marks it expected inside
 * `expectGuardViolation`, and returns it for throwing.
 *
 * @internal shared with ws-guard.ts
 */
export function raiseViolation(
  h: Harness,
  rule: string,
  method: string,
  template: string | null,
  reason: string
): GuardViolation {
  const scopes = currentScopes();
  const expecting = scopes.filter(
    (s): s is Extract<GuardScope, { kind: 'expect-violation' }> =>
      s.kind === 'expect-violation' && s.open
  );
  for (const s of expecting) s.seen.push(rule);
  h.recordViolation({
    rule,
    method,
    template: logTemplate(template),
    ...(expecting.length > 0 ? { expected: true } : {}),
  });
  return new GuardViolation(rule, method, template, reason);
}

function logTemplate(template: string | null): string {
  if (template === null) return '<unmatched>';
  return template.replace(/\{(app_namespace|appNamespace|namespace)\}/g, '{ns}');
}

// ─── Request view ───────────────────────────────────────────────────────────────────────────────────

interface FormEntry {
  name: string;
  value?: string;
  file?: { name: string; type: string; bytes: Uint8Array };
}

type ParsedBody =
  | { kind: 'none' }
  | { kind: 'json'; value: unknown }
  | { kind: 'text'; text: string }
  | { kind: 'form'; entries: FormEntry[] }
  | { kind: 'binary' }
  | { kind: 'unreadable' };

/**
 * The snapshot of one request, taken when the guarded fetch is called: the guard checks it and sends only it, never
 * the caller's URL object, init, Headers, FormData or buffer (which the caller may change while the guard awaits).
 */
interface RequestView {
  method: string;
  /** the request URL as a string (the guard's own `url` below is parsed from it) */
  href: string;
  url: URL;
  /** a copy of the request headers; these are the headers sent */
  headers: Headers;
  body: ParsedBody;
  /** the body bytes the guard inspected; these are the bytes sent (none for a request without a body) */
  bytes?: Uint8Array<ArrayBuffer>;
  /** the request's signal (it follows the caller's signal, if any) */
  signal: AbortSignal;
  hasSignal: boolean;
  credentials: string[];
  relPath: string | null;
  query: Record<string, string>;
}

function textOrJson(text: string, contentType: string): ParsedBody {
  const trimmed = text.trim();
  if (trimmed === '') return { kind: 'none' };
  if (contentType.includes('json') || trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      return { kind: 'json', value: JSON.parse(text) };
    } catch {
      return { kind: 'text', text };
    }
  }
  return { kind: 'text', text };
}

/**
 * Bytes of a body: a multipart body is parsed as a form; any UTF-8 text is inspected as text, and as JSON when it
 * looks like JSON, whatever the content type (a JSON body sent as `application/octet-stream` reaches the same server
 * parser); bytes that are not plain UTF-8 text are binary: invalid UTF-8, a byte-order mark (a parser that honours it
 * reads the same JSON the guard would otherwise skip) or a NUL byte (UTF-16 text whose characters are ASCII is valid
 * UTF-8 interleaved with NULs).
 */
async function decodeBytes(bytes: Uint8Array, rawContentType: string): Promise<ParsedBody> {
  if (bytes.byteLength === 0) return { kind: 'none' };
  const contentType = rawContentType.toLowerCase();
  if (contentType.startsWith('multipart/form-data')) {
    try {
      const form = await new Response(bytes.slice(), {
        headers: { 'content-type': rawContentType },
      }).formData();
      return { kind: 'form', entries: await formEntries(form) };
    } catch {
      return { kind: 'unreadable' };
    }
  }
  if (bytes.includes(0)) return { kind: 'binary' };
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    return { kind: 'binary' };
  }
  if (text.startsWith('\uFEFF')) return { kind: 'binary' };
  return textOrJson(text, contentType);
}

/** The `charset` parameter of a Content-Type (lower case, quotes removed), or null when there is none. */
function charsetOf(contentType: string): string | null {
  const match = /;\s*charset\s*=\s*("?)([^";\s]*)\1/i.exec(contentType);
  return match ? (match[2] ?? '').toLowerCase() : null;
}

async function formEntries(form: FormData): Promise<FormEntry[]> {
  const raw: [string, FormDataEntryValue][] = [];
  form.forEach((value, name) => raw.push([name, value]));
  const entries: FormEntry[] = [];
  for (const [name, value] of raw) {
    if (typeof value === 'string') entries.push({ name, value });
    else
      entries.push({
        name,
        file: {
          name: value.name,
          type: value.type,
          bytes: new Uint8Array(await value.arrayBuffer()),
        },
      });
  }
  return entries;
}

function headerRecord(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  headers.forEach((value, name) => {
    out[name] = value;
  });
  return out;
}

/** A copy made entry by entry (a `Headers` built from another `Headers` can drop entries under a patched global). */
function copyHeaders(source: Headers): Headers {
  const copy = new Headers();
  source.forEach((value, name) => copy.append(name, value));
  return copy;
}

function credentialsOf(headers: Headers, url: URL): string[] {
  const values: string[] = [];
  const key = headers.get('x-api-key');
  if (key !== null) values.push(key);
  const auth = headers.get('authorization');
  if (auth !== null) values.push(auth.replace(/^Bearer\s+/i, ''));
  for (const name of ['apiKey', 'token']) values.push(...url.searchParams.getAll(name));
  return values;
}

/**
 * Takes the request snapshot. `new Request(input, init)` runs synchronously when the guarded fetch is called, so
 * the URL string, the method, the headers and the body (a string, a copy of a buffer, the encoded parts of a
 * FormData; a stream is the caller's own) are fixed before the caller regains control; the body is then read once.
 */
async function viewOf(
  h: Harness,
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<RequestView> {
  const snapshot = new Request(input, init);
  const href = snapshot.url;
  const url = new URL(href);
  const method = snapshot.method.toUpperCase();
  const headers = copyHeaders(snapshot.headers);
  const contentType = headers.get('content-type') ?? '';
  let body: ParsedBody = { kind: 'none' };
  let bytes: Uint8Array<ArrayBuffer> | undefined;
  if (snapshot.body !== null) {
    try {
      bytes = new Uint8Array(await snapshot.arrayBuffer());
    } catch {
      bytes = undefined;
      body = { kind: 'unreadable' };
    }
    if (bytes) body = await decodeBytes(bytes, contentType);
  }
  const { origin, basePath } = h.env;
  let relPath: string | null = null;
  if (
    url.origin === origin &&
    (url.pathname === basePath || url.pathname.startsWith(`${basePath}/`))
  ) {
    relPath = url.pathname.slice(basePath.length) || '/';
  }
  return {
    method,
    href,
    url,
    headers,
    body,
    ...(bytes ? { bytes } : {}),
    signal: snapshot.signal,
    // G13 counts only a caller signal passed as `init.signal` (spec letter): the signal of a Request input cannot be
    // told apart from the default one every Request carries. The stream deadline is applied in every case.
    hasSignal: init?.signal !== undefined && init.signal !== null,
    credentials: credentialsOf(headers, url),
    relPath,
    query: Object.fromEntries(url.searchParams),
  };
}

function logBody(body: ParsedBody): unknown {
  switch (body.kind) {
    case 'none':
      return undefined;
    case 'json':
      return body.value;
    case 'text':
      return body.text;
    case 'form':
      return `<FormData: ${body.entries.map((e) => e.name).join(',')}>`;
    case 'binary':
      return '<binary>';
    case 'unreadable':
      return '<stream>';
  }
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((k) => [k, canonical(value[k])])
    );
  }
  return value;
}

function hashBody(body: unknown): string | null {
  if (body === undefined) return null;
  return createHash('sha256')
    .update(JSON.stringify(canonical(body)) ?? 'undefined')
    .digest('hex');
}

// ─── Rule helpers ───────────────────────────────────────────────────────────────────────────────────

type RequestClass = 'read' | 'ro-post' | 'W' | 'S' | 'SW' | 'C';

interface Plan {
  cls: RequestClass;
  mutating: boolean;
  /** G18 shapes (every verdict any of them needs) */
  reach: readonly ReachShape[];
  /** a removal (exempt from G18 in teardown, cleanup and the sweeper) */
  removal: boolean;
  /** G7 counts */
  units: Partial<BudgetCounts>;
  /** G6 scan: the whole body, nothing, or one value (an added alert rule) */
  scan: { kind: 'full' } | { kind: 'none' } | { kind: 'only'; value: unknown };
  /** a check that needs a read (the profiles of a writing ETL upload), run after G4, G18 and G6 admitted it */
  verify?: () => Promise<void>;
  /**
   * G5 (b): track the ids of the 2xx answer. Only for a create (G5 c, a send, a connection or mapping create, a
   * bulk answer's undo_token) or a request on an entity of this run (G5 a, b): never for an id the run did not make.
   */
  track: boolean;
}

function isNever(
  method: string,
  relPath: string,
  template: string | null,
  excluded: Set<string>
): boolean {
  const m = method === 'HEAD' ? 'GET' : method;
  if (NEVER_PREFIXES.some((p) => hasSegmentPrefix(relPath, p))) return true;
  if (NEVER_METHOD_PREFIXES.some(([pm, p]) => pm === m && hasSegmentPrefix(relPath, p)))
    return true;
  if (template === null) return false;
  return NEVER_TEMPLATES.has(`${m} ${template}`) || excluded.has(`${m} ${template}`);
}

function namespaceKeysOk(obj: Record<string, unknown>, ns: string): boolean {
  return (
    NAMESPACE_KEYS.every((k) => !Object.hasOwn(obj, k) || obj[k] === undefined || obj[k] === ns) &&
    NAMESPACE_LIST_KEYS.every((k) => !Object.hasOwn(obj, k) || namespaceListOk(obj[k], ns))
  );
}

function namespaceOk(h: Harness, route: RouteMatch, view: RequestView): boolean {
  const ns = h.env.namespace;
  for (const [name, value] of Object.entries(route.params)) {
    if (NAMESPACE_PARAMS.has(name) && value !== ns) return false;
  }
  // Query keys are compared by their qs root: the server's extended query parser reads `applicationId[]=x` (also
  // `applicationId%5B%5D`, `applicationId[0]`, `applicationId.x`, `[applicationId]`, `%5BapplicationId%5D`) as a
  // namespace filter.
  for (const [key, value] of view.url.searchParams) {
    const k = baseKey(key);
    if ((NAMESPACE_KEYS.includes(k) || NAMESPACE_LIST_KEYS.includes(k)) && value !== ns)
      return false;
  }
  const body = view.body;
  if (body.kind === 'form') {
    // a list key may be sent as `targetApplications[]` / `targetApplications[0]`: compared by its qs root
    return body.entries.every(
      (e) =>
        (!NAMESPACE_KEYS.includes(e.name) && !NAMESPACE_LIST_KEYS.includes(baseKey(e.name))) ||
        e.value === ns
    );
  }
  if (body.kind !== 'json') return true;
  const value = body.value;
  const items: Record<string, unknown>[] = [];
  if (Array.isArray(value)) items.push(...value.filter(isPlainObject));
  else if (isPlainObject(value)) {
    items.push(value);
    for (const child of Object.values(value))
      if (Array.isArray(child)) items.push(...child.filter(isPlainObject));
  }
  return items.every((item) => namespaceKeysOk(item, ns));
}

function numberParam(view: RequestView, name: string): number | null {
  const values = view.url.searchParams.getAll(name);
  if (values.length !== 1) return null;
  const text = values[0] as string;
  return /^\d+(\.\d+)?$/.test(text) ? Number(text) : null;
}

function hasKeyDeep(value: unknown, key: string): boolean {
  if (Array.isArray(value)) return value.some((v) => hasKeyDeep(v, key));
  if (!isPlainObject(value)) return false;
  return Object.hasOwn(value, key) || Object.values(value).some((v) => hasKeyDeep(v, key));
}

/** G12: null when the read is bounded, else the reason. */
function unboundedReason(view: RequestView, template: string): string | null {
  const span = (): number | null => {
    const from = numberParam(view, 'timestampFrom');
    const to = numberParam(view, 'timestampTo');
    return from === null || to === null ? null : to - from;
  };
  if (ES_RANGE_TEMPLATES.has(template)) {
    const s = span();
    return s !== null && s > 0 && s <= 7 * DAY_MS
      ? null
      : 'needs numeric timestampFrom/timestampTo, 0 < span ≤ 7 d';
  }
  if (template === ES_ALERTS_TEMPLATE) {
    const s = span();
    const size = numberParam(view, 'size');
    const ok =
      s !== null &&
      s > 0 &&
      size !== null &&
      Number.isInteger(size) &&
      size >= 1 &&
      ((s <= 7 * DAY_MS && size <= 100) ||
        (s <= HOUR_MS && size <= 10_001) ||
        (s <= 31 * DAY_MS && size <= 10));
    return ok
      ? null
      : 'needs a bounded range and an integer size (1–100; ≤ 10 001 over ≤ 1 h; ≤ 10 over ≤ 31 d)';
  }
  if (template === ASSET_HISTORY_TEMPLATE) {
    return numberParam(view, 'start_time') !== null && numberParam(view, 'end_time') !== null
      ? null
      : 'needs numeric start_time and end_time';
  }
  if (template === ES_QUERY_TEMPLATE && view.method === 'POST') {
    const body = view.body.kind === 'json' ? view.body.value : undefined;
    const size = isPlainObject(body) ? body.size : undefined;
    const ok =
      typeof size === 'number' &&
      Number.isInteger(size) &&
      size >= 0 &&
      size <= 100 &&
      hasKeyDeep(body, 'range');
    return ok ? null : 'needs a body size ≤ 100 and a range';
  }
  return null;
}

function hasNonEmptyValue(value: unknown): boolean {
  if (value === undefined || value === null || value === false) return false;
  if (typeof value === 'string') return value !== '';
  if (Array.isArray(value)) return value.some(hasNonEmptyValue);
  if (isPlainObject(value)) return Object.values(value).some(hasNonEmptyValue);
  return true;
}

function json(view: RequestView): unknown {
  return view.body.kind === 'json' ? view.body.value : undefined;
}

function nonNamespaceParams(route: RouteMatch): string[] {
  return Object.entries(route.params)
    .filter(([name]) => !NAMESPACE_PARAMS.has(name))
    .map(([, value]) => value);
}

function scopePaths(scopes: readonly GuardScope[]): Set<string> {
  const paths = new Set<string>();
  for (const s of scopes) {
    if ((s.kind === 'config' || s.kind === 'existing-entity') && s.paths)
      for (const p of s.paths) paths.add(p);
  }
  return paths;
}

/** Why G5 admits a generic mutating request: (a) `mac`, (b) `tracked`, (c) `create`, (e) `made-up`, (f) `scope`. */
type Admission = 'mac' | 'tracked' | 'create' | 'made-up' | 'scope';

/**
 * G5 (a), (b), (c), (e), (f) for a generic mutating request, or null. (c) holds only for a POST to one of the
 * create collections (`CREATE_COLLECTIONS`) whose body names carry this run's prefix; an action on an entity
 * (`POST /dashboards/{id}/share`, `POST /notifications/{ns}/{id}/archive`) needs (a), (b) or (e) on its path id.
 * A path-keyed write (`PATH_KEYED_WRITES`: asset upsert, asset patch, document upload) needs (a).
 */
function entityAdmitted(
  h: Harness,
  view: RequestView,
  route: RouteMatch,
  scopes: readonly GuardScope[]
): Admission | null {
  const params = nonNamespaceParams(route);
  const prefix = h.runPrefix;
  if (params.some((p) => isTestMac(p))) return 'mac';
  // A write that creates or changes what its path key names passes only on a test MAC (no made-up key, no scope).
  if (PATH_KEYED_WRITES.has(`${view.method} ${route.template}`)) return null;
  if (params.some((p) => h.isTracked(p))) return 'tracked';
  if (params.some((p) => p.startsWith(prefix) || p === ZERO_ID)) return 'made-up';
  if (CREATE_COLLECTIONS.has(`${view.method} ${route.template}`)) {
    const body = json(view);
    if (isPlainObject(body)) {
      const names = ['name', 'user_name', 'title', 'external_id'].filter(
        (k) => body[k] !== undefined
      );
      if (
        names.length > 0 &&
        names.every((k) => typeof body[k] === 'string' && (body[k] as string).startsWith(prefix))
      ) {
        return 'create';
      }
    }
  }
  return scopePaths(scopes).has(`${view.method} ${view.relPath}`) ? 'scope' : null;
}

function batchMac(item: unknown): unknown {
  if (typeof item === 'string') return item;
  if (isPlainObject(item)) return item.user_udid ?? item.mac_address ?? item.mac;
  return undefined;
}

function etlFileOk(entry: FormEntry): boolean {
  const file = entry.file;
  if (!file) return false;
  if (file.bytes.byteLength > ETL_WRITE_MAX_BYTES) return false;
  const textual =
    /\.csv$/i.test(file.name) || file.type.startsWith('text/') || file.type === 'application/csv';
  if (!textual || file.bytes.includes(0)) return false;
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(file.bytes);
  } catch {
    return false;
  }
  return foreignMacTokens(text) === 0;
}

/**
 * The top-level key the server's qs parser reads from a form field or query key (`debugMode[]` → `debugMode`,
 * `applicationId.x` → `applicationId`). A key that starts with a bracket (or a dot) has an empty parent, so qs takes
 * the first bracket segment as the root: `[applicationId]x` → `applicationId`. Dots are read as brackets (qs
 * `allowDots`), the more conservative reading.
 */
function baseKey(name: string): string {
  const key = name.replace(/\.([^.[]+)/g, '[$1]');
  const bracket = /\[[^[\]]*\]/.exec(key);
  const parent = bracket ? key.slice(0, bracket.index) : key;
  if (parent !== '' || !bracket) return parent;
  return bracket[0].slice(1, -1);
}

/**
 * Why a bulk-declare by external id may not be sent, or null (G18 e, LIVE-TESTING §2.7): the server resolves each
 * external id, compared in lower case, against the namespace's asset list and declares the `user_udid` of every
 * asset that matches (an asset without one is skipped), so each such asset must carry a MAC of this run's range.
 * Read raw through the configured key (`GET /assets/{ns}`, the list the server resolves against; no guard
 * re-entry; through the rate limiter); a failed read refuses. An external id that names no asset declares nothing.
 */
async function declaredExternalIdProblem(
  h: Harness,
  externalIds: readonly string[]
): Promise<string | null> {
  await h.bucket.take();
  let assets: unknown;
  try {
    const response = await h.fetchImpl(
      `${h.env.baseUrl}/assets/${encodeURIComponent(h.env.namespace)}`,
      { headers: { 'X-API-Key': h.env.apiKey, Accept: 'application/json' }, redirect: 'manual' }
    );
    assets = response.status === 200 ? JSON.parse(await response.text()) : undefined;
  } catch {
    assets = undefined;
  }
  if (!Array.isArray(assets))
    return 'the assets of a bulk-declare by external id could not be read';
  const wanted = new Set(externalIds.map((id) => id.toLowerCase()));
  const outside = assets.some(
    (asset) =>
      isPlainObject(asset) &&
      typeof asset.external_id === 'string' &&
      wanted.has(asset.external_id.toLowerCase()) &&
      Boolean(asset.user_udid) &&
      !isRunTestMac(asset.user_udid, h.runId)
  );
  return outside
    ? 'a bulk-declare by external id resolves to an asset outside this run’s MAC range'
    : null;
}

/**
 * Why a mapping profile may not carry a writing ETL import, or null (G7, LIVE-TESTING §5): it must target this
 * namespace (`applicationId`), key every row on `user_udid` only (each key column is the `sourceColumn` of mappings
 * that all target `user_udid`), and map nothing, nor default anything, under `declared_location` or under a G3
 * namespace-list key (`targetApplications`: the CSV could name another namespace). Read raw through the configured
 * key (no guard re-entry; one GET per profile, through the rate limiter).
 */
async function writingProfileProblem(h: Harness, id: string): Promise<string | null> {
  await h.bucket.take();
  const response = await h.fetchImpl(
    `${h.env.baseUrl}/etl/mapping-profiles/${encodeURIComponent(id)}`,
    { headers: { 'X-API-Key': h.env.apiKey, Accept: 'application/json' }, redirect: 'manual' }
  );
  let profile: unknown;
  try {
    profile = response.status === 200 ? JSON.parse(await response.text()) : undefined;
  } catch {
    profile = undefined;
  }
  if (!isPlainObject(profile)) return 'the mapping profile of a writing upload could not be read';
  if (profile.applicationId !== h.env.namespace)
    return 'the mapping profile of a writing upload targets another namespace';
  const mappings = isPlainObject(profile.mappings) ? profile.mappings : {};
  const keys = Array.isArray(profile.keyColumns) ? profile.keyColumns : [];
  if (keys.length === 0 || !keys.every((k) => typeof k === 'string'))
    return 'the mapping profile of a writing upload has no key column';
  const declared = (target: string): boolean =>
    target === 'declared_location' || /^declared_location[.[]/.test(target);
  const defaults = isPlainObject(profile.defaults) ? Object.keys(profile.defaults) : [];
  if (Object.keys(mappings).some(declared) || defaults.some(declared))
    return 'the mapping profile of a writing upload writes declared_location';
  const namespaceList = (target: string): boolean => NAMESPACE_LIST_KEYS.includes(baseKey(target));
  if (Object.keys(mappings).some(namespaceList) || defaults.some(namespaceList))
    return 'the mapping profile of a writing upload writes targetApplications';
  for (const key of keys) {
    const targets = Object.entries(mappings)
      .filter(([, m]) => isPlainObject(m) && m.sourceColumn === key)
      .map(([target]) => target);
    if (targets.length === 0 || targets.some((target) => target !== 'user_udid'))
      return 'a key column of the mapping profile of a writing upload is not mapped to user_udid only';
  }
  return null;
}

async function selfUserId(h: Harness): Promise<string | null> {
  h.selfUserId ??= (async () => {
    await h.bucket.take();
    const ns = encodeURIComponent(h.env.namespace);
    // redirect 'manual' (G1): a 3xx is never followed with the key; it means the self id is unavailable.
    const response = await h.fetchImpl(`${h.env.baseUrl}/notifications/${ns}/cleanup-policy`, {
      headers: { 'X-API-Key': h.env.apiKey, Accept: 'application/json' },
      redirect: 'manual',
    });
    const redirected =
      response.type === 'opaqueredirect' || (response.status >= 300 && response.status < 400);
    const body: unknown = response.ok && !redirected ? await response.json() : null;
    if (!isPlainObject(body) || typeof body.user_id !== 'string' || body.user_id === '') {
      throw new Error('self user id unavailable');
    }
    return body.user_id;
  })();
  try {
    return await h.selfUserId;
  } catch {
    h.selfUserId = null;
    return null;
  }
}

// ─── Classification (G5, G7–G11) ────────────────────────────────────────────────────────────────────

const READ: Plan = {
  cls: 'read',
  mutating: false,
  reach: [],
  removal: false,
  units: {},
  scan: { kind: 'none' },
  track: false,
};

async function classify(
  h: Harness,
  view: RequestView,
  route: RouteMatch,
  scopes: readonly GuardScope[],
  fail: (rule: string, reason: string) => GuardViolation
): Promise<Plan> {
  const { method } = view;
  const t = route.template;
  if (method === 'GET' || method === 'HEAD') return READ;
  if (method === 'POST' && READ_ONLY_POSTS.has(t)) return { ...READ, cls: 'ro-post' };
  const body = json(view);
  const prefix = h.runPrefix;
  const plan = (cls: RequestClass, extra: Partial<Plan> = {}): Plan => ({
    cls,
    mutating: true,
    reach: [],
    removal: method === 'DELETE',
    units: {},
    scan: { kind: 'full' },
    track: false,
    ...extra,
  });

  // G9 config writes (also the sweeper's --fix-config write and the teardown restore).
  const resource = configResourceOf(method, t);
  if (resource) {
    let before: unknown;
    let mode: 'cycle' | 'sweeper' = 'cycle';
    if (h.mode === 'example') {
      const gate = await h.configGate?.(resource, body);
      if (!gate || gate.admitted !== true)
        throw fail('G9', 'config write without the config lock or rejected by validateChange');
      before = gate.before;
    } else {
      const scope = [...scopes]
        .reverse()
        .find(
          (s): s is Extract<GuardScope, { kind: 'config' }> =>
            s.kind === 'config' && s.resource === resource
        );
      if (!scope || !scope.lockHeld() || !scope.validate(body)) {
        throw fail(
          'G9',
          'config write outside its configCycle, without the config lock, or rejected by validateChange'
        );
      }
      before = scope.before;
      mode = scope.mode;
    }
    let scan: Plan['scan'] = { kind: 'full' };
    if (resource === 'alert-rules') {
      const change = alertRulesChange(before, body, { runId: h.runId, mode });
      if (change?.kind === 'added') scan = { kind: 'only', value: change.rule };
      else if (change) scan = { kind: 'none' };
    }
    return plan('C', { scan });
  }

  const sweeper = scopes.find(
    (s): s is Extract<GuardScope, { kind: 'sweeper' }> => s.kind === 'sweeper'
  );
  if (sweeper) {
    if (!sweeper.paths.has(`${method} ${view.relPath}`))
      throw fail('G5', 'the sweeper removes only paths its find rules registered');
    return plan('W', { removal: true });
  }

  const inGuard = (
    entity: ExistingEntityKind
  ): Extract<GuardScope, { kind: 'existing-entity' }> | undefined =>
    scopes.find(
      (s): s is Extract<GuardScope, { kind: 'existing-entity' }> =>
        s.kind === 'existing-entity' && s.entity === entity
    );
  const params = nonNamespaceParams(route);
  const id = params[0] ?? '';

  if (method === 'POST' && t === T.publisher) {
    const items = Array.isArray(body) ? body : isPlainObject(body) ? [body] : [];
    const positions = items.filter(
      (i) =>
        isPlainObject(i) && (typeof i.user_uuid === 'string' || typeof i.user_udid === 'string')
    ).length;
    // patch_asset_data (P3 §5: true for 1/true/True/TRUE; any such value of the key counts) writes the item's fields
    // to an existing asset and its linked copies, and a changed declared_location publishes a declared position.
    const patching = [...view.url.searchParams].some(
      ([key, value]) => baseKey(key) === 'patch_asset_data' && PATCH_ASSET_DATA_TRUE.has(value)
    );
    if (!patching) return plan('S', { reach: ['publish'], units: { positions } });
    const declared = items.filter((i) => isPlainObject(i) && i.declared_location != null).length;
    return declared > 0
      ? plan('SW', {
          reach: ['publish', 'assets', 'declared'],
          units: { positions: positions + declared },
        })
      : plan('S', { reach: ['publish', 'assets'], units: { positions } });
  }

  if (method === 'POST' && t === T.bulkDeclare) {
    if (!isPlainObject(body) || !Array.isArray(body.assets))
      throw fail('G7', 'bulk-declare needs an assets list');
    if (
      body.auto_create_virtual_assets !== undefined &&
      body.auto_create_virtual_assets !== false
    ) {
      throw fail('G7', 'auto_create_virtual_assets is never sent');
    }
    const externalIds: string[] = [];
    for (const item of body.assets) {
      if (!isPlainObject(item)) throw fail('G7', 'bulk-declare item is not an object');
      const mac = item.mac_address;
      if (mac !== undefined && mac !== null) {
        if (!isTestMac(mac)) throw fail('G7', 'bulk-declare item MAC outside the test range');
      } else if (!(typeof item.external_id === 'string' && item.external_id.startsWith(prefix))) {
        throw fail(
          'G7',
          'bulk-declare item identified only by an external_id without the run prefix'
        );
      } else {
        externalIds.push(item.external_id);
      }
    }
    return plan('S', {
      reach: ['declared'],
      units: { positions: body.assets.length },
      // G18 (e): an external-id item declares the asset the server resolves it to; that MAC is read first.
      ...(externalIds.length > 0
        ? {
            verify: async () => {
              const problem = await declaredExternalIdProblem(h, externalIds);
              if (problem) throw fail('G18', problem);
            },
          }
        : {}),
    });
  }

  if (method === 'POST' && t === T.bulkClear) {
    const macs = isPlainObject(body) ? (body.mac_addresses ?? []) : null;
    const exts = isPlainObject(body) ? (body.external_ids ?? []) : null;
    const ok =
      Array.isArray(macs) &&
      Array.isArray(exts) &&
      macs.length + exts.length > 0 &&
      macs.every((m) => isTestMac(m)) &&
      exts.every((e) => typeof e === 'string' && e.startsWith(prefix));
    if (!ok) throw fail('G5', 'bulk-clear names an entity outside the test range');
    return plan('W', { reach: ['assets'], removal: true });
  }

  if (t === T.asset && (method === 'POST' || method === 'PATCH' || method === 'DELETE')) {
    if (entityAdmitted(h, view, route, scopes) === null)
      throw fail('G5', 'asset write on a MAC outside the test range');
    const declared = method !== 'DELETE' && isPlainObject(body) && body.declared_location != null;
    return declared
      ? plan('SW', { reach: ['declared'], units: { positions: 1 } })
      : plan('W', { reach: ['assets'] });
  }

  if (t === T.assets && (method === 'POST' || method === 'DELETE')) {
    const items = Array.isArray(body) ? body : [];
    if (items.length === 0 || !items.every((item) => isTestMac(batchMac(item)))) {
      throw fail('G5', 'batch body names a MAC outside the test range');
    }
    const declared =
      method === 'POST'
        ? items.filter((i) => isPlainObject(i) && i.declared_location != null).length
        : 0;
    return declared > 0
      ? plan('SW', { reach: ['declared'], units: { positions: declared } })
      : plan('W', { reach: ['assets'] });
  }

  if (method === 'POST' && t === T.send) {
    const channels = isPlainObject(body) ? body.channels : undefined;
    if (!(channels === undefined || (Array.isArray(channels) && channels.length === 0))) {
      throw fail('G7', 'send with channels (in-app only)');
    }
    const recipients = isPlainObject(body) ? body.recipients : undefined;
    const self = await selfUserId(h);
    const r: unknown =
      Array.isArray(recipients) && recipients.length === 1 ? recipients[0] : undefined;
    const ok =
      self !== null &&
      isPlainObject(r) &&
      Object.keys(r).length === 2 &&
      r.target_type === 'user' &&
      r.id === self;
    if (!ok) throw fail('G7', 'send needs exactly one recipient: the key’s own user');
    return plan('S', { units: { notifications: 1 }, track: true });
  }

  if (method === 'POST' && t === T.tagActions) {
    if (!Array.isArray(body)) throw fail('G7', 'tag actions need an array body');
    return plan('S', { units: { bleActions: body.length } });
  }

  if (method === 'POST' && t === T.etlUpload) {
    if (view.body.kind !== 'form') throw fail('G7', 'ETL upload needs a multipart body');
    const entries = view.body.entries;
    // The server parses repeated or bracketed fields into arrays (`debugMode: ['true', 'false']` is not `'true'`):
    // each of the three parts appears once, under its exact name.
    const parts = (name: string): FormEntry[] => entries.filter((e) => baseKey(e.name) === name);
    for (const name of ['debugMode', 'mappingProfileIds', 'file']) {
      const found = parts(name);
      if (found.length > 1) throw fail('G7', `ETL upload with more than one ${name} part`);
      if (found.some((e) => e.name !== name))
        throw fail('G7', `ETL upload part ${name} under a bracketed or dotted name`);
    }
    let ids: unknown;
    try {
      const raw = parts('mappingProfileIds')[0]?.value;
      ids = raw === undefined ? undefined : JSON.parse(raw);
    } catch {
      ids = undefined;
    }
    if (!Array.isArray(ids) || !ids.every((id): id is string => typeof id === 'string'))
      throw fail('G7', 'ETL upload needs one mappingProfileIds part holding a JSON array of ids');
    const dryRun = parts('debugMode')[0]?.value === 'true';
    if (dryRun) {
      // G5 (b)/(e): profiles this run created, or made-up ids that cannot name another entity (404)
      if (!ids.every((id) => h.isTracked(id) || id === ZERO_ID || id.startsWith(prefix)))
        throw fail('G7', 'ETL dry run on a mapping profile this run did not create');
      return plan('W');
    }
    const files = entries.filter((e) => e.file !== undefined);
    if (
      files.length !== 1 ||
      (files[0] as FormEntry).name !== 'file' ||
      !etlFileOk(files[0] as FormEntry)
    ) {
      throw fail(
        'G7',
        'a writing ETL upload must be one CSV file of at most 64 KiB with test MACs only'
      );
    }
    if (ids.length === 0 || !ids.every((id) => h.isTracked(id)))
      throw fail('G7', 'a writing ETL upload needs mapping profiles this run created');
    return plan('S', {
      reach: ['assets'],
      units: { etlWrites: 1 },
      verify: async () => {
        for (const id of ids) {
          const problem = await writingProfileProblem(h, id);
          if (problem) throw fail('G7', problem);
        }
      },
    });
  }

  if (method === 'POST' && t === T.bulk) {
    const ids = isPlainObject(body) ? body.ids : undefined;
    const threadOk = (key: unknown): boolean =>
      typeof key === 'string' &&
      (key.startsWith(`dm:${prefix}`) || key.startsWith(`mission:${prefix}`));
    let ok = false;
    if (Array.isArray(ids) && ids.length > 0) {
      ok = ids.every((i) => typeof i === 'string' && h.isTracked(i));
    } else if (
      isPlainObject(body) &&
      typeof body.thread_key === 'string' &&
      body.thread_key !== ''
    ) {
      ok = threadOk(body.thread_key);
    } else if (isPlainObject(body) && isPlainObject(body.filter)) {
      ok = threadOk(body.filter.thread_key);
    }
    if (!ok) throw fail('G8', 'bulk selects only tracked ids or this run’s thread_key');
    return plan('W', { track: true });
  }

  if (method === 'POST' && t === T.bulkUndo) {
    const token = isPlainObject(body) ? body.undo_token : undefined;
    if (!(typeof token === 'string' && h.isTracked(token)))
      throw fail('G5', 'undo needs a tracked undo_token');
    return plan('W');
  }

  if (t === T.connections && method === 'POST') {
    if (isPlainObject(body) && hasNonEmptyValue(body.credentials))
      throw fail('G10', 'connection with credentials');
    if (inGuard('notification-connections')) return plan('W', { track: true });
    // Outside the guard only a body the server answers 400 before any write: a plain object whose channel is a
    // string the server does not know (compared trimmed and in lower case). An absent channel fails closed.
    const channel = isPlainObject(body) ? body.channel : undefined;
    if (typeof channel !== 'string' || SERVER_CHANNELS.has(channel.trim().toLowerCase())) {
      throw fail(
        'G10',
        'connection upsert outside withExistingEntityGuard (only an unknown channel string passes)'
      );
    }
    return plan('W', { track: true });
  }
  if (t === T.connection && method === 'DELETE') {
    if (inGuard('notification-connections') || id === ZERO_ID) return plan('W');
    throw fail('G10', 'connection delete outside withExistingEntityGuard');
  }
  if (t === T.connectionTest && method === 'POST') {
    if (id === ZERO_ID || h.isTracked(id)) return plan('W');
    throw fail('G10', 'connection test on an id this run did not create');
  }

  if (t === T.mappings && method === 'POST') {
    if (!isPlainObject(body) || body.enabled !== false)
      throw fail('G11', 'recipient mapping must be created with enabled: false');
    const guard = inGuard('recipient-mappings');
    if (guard && guard.lockHeld()) return plan('C', { track: true });
    throw fail(
      'G10',
      'recipient-mapping write outside withExistingEntityGuard with the config lock'
    );
  }
  if (t === T.mapping && (method === 'PATCH' || method === 'DELETE')) {
    if (
      method === 'PATCH' &&
      isPlainObject(body) &&
      Object.hasOwn(body, 'enabled') &&
      body.enabled !== false
    ) {
      throw fail('G11', 'recipient mapping may only be patched to enabled: false');
    }
    const guard = inGuard('recipient-mappings');
    if (guard && guard.lockHeld()) return plan('C');
    if (id.startsWith(prefix) || id === ZERO_ID) return plan('W');
    throw fail(
      'G10',
      'recipient-mapping write outside withExistingEntityGuard with the config lock'
    );
  }

  if (t === T.rules && method === 'POST') {
    if (!isPlainObject(body) || body.enabled !== false)
      throw fail('G11', 'notification rule must be created with enabled: false');
  }
  if (t === T.rule && method === 'PATCH') {
    if (isPlainObject(body) && Object.hasOwn(body, 'enabled') && body.enabled !== false) {
      throw fail('G11', 'notification rule may only be patched to enabled: false');
    }
  }

  const admission = entityAdmitted(h, view, route, scopes);
  if (admission === null) throw fail('G5', 'mutating request on an entity this run did not create');
  return plan('W', {
    track: admission === 'create' || admission === 'mac' || admission === 'tracked',
  });
}

// ─── G4, G18, G6 ────────────────────────────────────────────────────────────────────────────────────

/**
 * G4 in global teardown (no block is running): the run's tier flags still apply. A W-class request needs
 * RTLS_IT_WRITES=1, a C-class one (the restore G9 admitted) RTLS_IT_CONFIG=1, and an S-class one is never sent.
 */
function teardownAdmits(h: Harness, cls: RequestClass): boolean {
  const flags = h.env.tiers;
  switch (cls) {
    case 'read':
    case 'ro-post':
      return true;
    case 'W':
      return flags.W;
    case 'C':
      return flags.C;
    case 'S':
    case 'SW':
      return false;
  }
}

/**
 * The shapes a replayed cleanup may send (G4): a DELETE or bulk-clear-declared (`plan.removal`), a notifications
 * bulk delete, or a PATCH whose body is exactly `{ enabled: false }`.
 */
function removalShape(view: RequestView, route: RouteMatch, plan: Plan): boolean {
  if (!plan.mutating || plan.removal) return true;
  const body = json(view);
  if (view.method === 'POST' && route.template === T.bulk)
    return isPlainObject(body) && body.action === 'delete';
  if (view.method === 'PATCH')
    return isPlainObject(body) && Object.keys(body).length === 1 && body.enabled === false;
  return false;
}

function tierAdmits(h: Harness, cls: RequestClass, method: string): boolean {
  if (cls === 'read') return true;
  if (h.mode === 'example') {
    const e = h.enabledTiers();
    switch (cls) {
      case 'ro-post':
        return true;
      case 'W':
        return e.W;
      case 'S':
        return e.S;
      case 'SW':
        return e.S && e.W;
      case 'C':
        return e.C;
    }
  }
  const block = h.currentBlock();
  if (!block) return method === 'GET' || method === 'HEAD';
  const flags = h.env.tiers;
  switch (cls) {
    case 'ro-post':
      return true;
    case 'W':
      return (block.tier === 'W' && flags.W) || (block.tier === 'S' && flags.S && flags.W);
    case 'S':
      return block.tier === 'S' && flags.S;
    case 'SW':
      return block.tier === 'S' && flags.S && flags.W;
    case 'C':
      return block.tier === 'C' && flags.C;
  }
}

/** Number of MAC values outside the test range; `found` collects the test MACs the body names. */
function scanJson(value: unknown, key: string | null, found: string[]): number {
  if (typeof value === 'string') {
    const bad = (key !== null && MAC_KEYS.has(key)) || looksLikeMac(value);
    if (!bad) return 0;
    if (isTestMac(value)) {
      found.push(normalizeMacLike(value));
      return 0;
    }
    return 1;
  }
  if (Array.isArray(value))
    return value.reduce<number>((n, item) => n + scanJson(item, key, found), 0);
  if (isPlainObject(value)) {
    return Object.entries(value).reduce<number>((n, [k, v]) => n + scanJson(v, k, found), 0);
  }
  return 0;
}

function scanBody(body: ParsedBody, found: string[]): number {
  switch (body.kind) {
    case 'json':
      return scanJson(body.value, null, found);
    case 'text': {
      let bad = 0;
      for (const match of body.text.matchAll(MAC_TOKEN_RE)) {
        if (isTestMac(match[0])) found.push(normalizeMacLike(match[0]));
        else bad += 1;
      }
      return bad;
    }
    case 'form':
      return body.entries.reduce<number>(
        (n, e) => n + (e.value !== undefined ? scanJson(e.value, e.name, found) : 0),
        0
      );
    default:
      return 0;
  }
}

// ─── Evaluation ─────────────────────────────────────────────────────────────────────────────────────

interface Decision {
  unreachable: boolean;
  view: RequestView;
  route: RouteMatch | null;
  plan: Plan;
  stream: boolean;
  macs: string[];
}

async function evaluate(
  h: Harness,
  view: RequestView,
  scopes: readonly GuardScope[]
): Promise<Decision> {
  const { method } = view;
  let template: string | null = null;
  const fail = (rule: string, reason: string): GuardViolation =>
    raiseViolation(h, rule, method, template, reason);

  // G1 host (unreachable URLs: recognised by origin, only the dummy credential).
  if (unreachableTarget(view.url)) {
    if (view.credentials.some((c) => c !== DUMMY_API_KEY)) {
      throw fail('G1', 'an unreachable URL carries a credential other than the dummy key');
    }
    return { unreachable: true, view, route: null, plan: READ, stream: false, macs: [] };
  }
  if (view.url.origin !== h.env.origin || view.relPath === null) {
    throw fail('G1', 'host or base path differs from the configured base URL');
  }
  const relPath = view.relPath;
  const route = matchRoute(h.routes, relPath);
  template = route?.template ?? null;

  // G2 never.
  if (isNever(method, relPath, template, h.routes.excluded))
    throw fail('G2', 'operation never called live');
  // G3 namespace pin.
  if (!route) throw fail('G3', 'path matches no spec template or ExtraPaths key');
  if (
    route.methods &&
    !(route.methods.has(method) || (method === 'HEAD' && route.methods.has('GET')))
  )
    throw fail('G3', 'method not declared for this path in the spec');
  // G6 (fail closed): a body the guard cannot inspect never leaves with a request other than GET/HEAD. Only plain
  // UTF-8 JSON passes, or a multipart form on an upload operation: a text, urlencoded or re-encoded body (a BOM,
  // UTF-16, another charset) could reach a server parser that reads JSON the guard never checked.
  if (method !== 'GET' && method !== 'HEAD') {
    const key = `${method} ${route.template}`;
    const kind = view.body.kind;
    if (kind === 'unreadable') throw fail('G6', 'request body not inspectable');
    if (kind === 'binary' && !BINARY_BODY_TEMPLATES.has(key))
      throw fail(
        'G6',
        'binary or non-UTF-8 request body (no operation is on the binary allowlist)'
      );
    if (kind === 'text')
      throw fail('G6', 'a request body that is neither JSON nor a multipart form');
    if (kind === 'form' && !MULTIPART_TEMPLATES.has(key))
      throw fail('G6', 'a multipart body outside the upload operations');
    const charset = charsetOf(view.headers.get('content-type') ?? '');
    if (kind !== 'none' && charset !== null && charset !== 'utf-8')
      throw fail('G6', 'a request body whose charset is not utf-8');
  }
  if (!namespaceOk(h, route, view)) throw fail('G3', 'namespace differs from APP_NAMESPACE');

  // Request guards (narrowing only).
  const guarded: GuardedRequest = {
    method,
    path: relPath,
    template,
    query: view.query,
    body: logBody(view.body),
  };
  for (const scope of scopes) {
    if (scope.kind === 'request-guard' && !scope.predicate(guarded))
      throw fail('RG', 'rejected by a request guard');
  }

  // G14 credentials.
  const configured =
    view.credentials.length > 0 && view.credentials.every((c) => c === h.env.apiKey);
  if (!configured && method !== 'GET')
    throw fail('G14', 'without the configured credential only GET is allowed');

  // G13 streams: decided on the matched template (the route table ignores a trailing slash and decodes segments,
  // so `/stream/` and `/strea%6D` reach the stream route) and on the Accept value in any letter case.
  const stream =
    (view.headers.get('accept') ?? '').toLowerCase().includes('text/event-stream') ||
    route.template.endsWith('/stream') ||
    relPath.endsWith('/stream');
  if (stream && !view.hasSignal) throw fail('G13', 'a stream request needs an abort signal');

  // G12 bounded reads.
  const unbounded = unboundedReason(view, route.template);
  if (unbounded) throw fail('G12', unbounded);

  // G5, G7–G11.
  const plan = await classify(h, view, route, scopes, fail);

  // G4 tier methods. A replayed cleanup (a block's afterAll or global teardown) only removes; the sweeper
  // removes only the paths its find rules registered (classify); global teardown applies the run's tier flags.
  const replaying = scopes.some(
    (s) => s.kind === 'cleanup' || (s.kind === 'teardown' && s.replay === true)
  );
  if (replaying && !removalShape(view, route, plan))
    throw fail('G4', 'a replayed cleanup only removes');
  if (!hasScope(scopes, 'sweeper')) {
    if (hasScope(scopes, 'teardown')) {
      if (!teardownAdmits(h, plan.cls))
        throw fail('G4', `request class ${plan.cls} not admitted in teardown with the run's tiers`);
    } else {
      if (h.abortState() && method !== 'GET' && method !== 'HEAD')
        throw fail('G4', 'the run is aborted: reads only');
      if (!tierAdmits(h, plan.cls, method))
        throw fail('G4', `request class ${plan.cls} not admitted in the current tier`);
    }
  }

  // G18 rule-engine reach (removals in teardown, cleanup and the sweeper are exempt).
  if (
    plan.reach.length > 0 &&
    !(plan.removal && hasScope(scopes, 'teardown', 'cleanup', 'sweeper'))
  ) {
    const verdicts = h.preflight();
    const failed = [...new Set(plan.reach.flatMap((shape) => failedVerdicts(verdicts, shape)))];
    if (failed.length > 0) throw fail('G18', `preflight verdict false: ${failed.join(', ')}`);
  }

  // G6 MAC scan of every mutating body.
  const macs = nonNamespaceParams(route)
    .filter((p) => isTestMac(p))
    .map(normalizeMacLike);
  if (plan.mutating && plan.scan.kind !== 'none') {
    const bad =
      plan.scan.kind === 'only' ? scanJson(plan.scan.value, null, macs) : scanBody(view.body, macs);
    if (bad > 0) throw fail('G6', 'a MAC outside the test range in the body');
  }
  // G18 (e): a request that sends a position (a publish, a declared location) names only test MACs of this run's
  // range, `025d4b` + the run id's first four hex digits (LIVE-TESTING §2.7: the ledger check of the time_in_zone
  // leaf is keyed by that prefix).
  if (
    (plan.units.positions ?? 0) > 0 ||
    plan.reach.some((s) => s === 'publish' || s === 'declared')
  ) {
    const named = nonNamespaceParams(route)
      .filter((p) => isTestMac(p))
      .map(normalizeMacLike);
    scanBody(view.body, named);
    if (named.some((mac) => !isRunTestMac(mac, h.runId)))
      throw fail('G18', 'a position on a test MAC outside this run’s range');
  }
  if (plan.verify) await plan.verify();
  return {
    unreachable: false,
    view,
    route,
    plan,
    stream,
    macs: plan.mutating ? [...new Set(macs)] : [],
  };
}

function idsOf(value: unknown): string[] {
  const ids: string[] = [];
  const take = (v: unknown): void => {
    if (typeof v === 'string' && v !== '') ids.push(v);
    else if (typeof v === 'number' && Number.isFinite(v)) ids.push(String(v));
  };
  const fromObject = (o: Record<string, unknown>): void => {
    take(o._id);
    take(o.id);
    if (isPlainObject(o.data)) {
      take(o.data._id);
      take(o.data.id);
    }
    take(o.undo_token);
  };
  if (Array.isArray(value)) for (const item of value) if (isPlainObject(item)) fromObject(item);
  if (isPlainObject(value)) fromObject(value);
  return ids;
}

/** The guarded fetch of the active harness (also installed as `globalThis.fetch` by installGuards). */
export const guardedFetch: typeof fetch = async (input, init) => {
  const h = activeHarness();
  const scopes = currentScopes();
  const attempts = scopes.filter(
    (s): s is Extract<GuardScope, { kind: 'request-guard' }> => s.kind === 'request-guard'
  );
  const view = await viewOf(h, input, init);
  const record = (allowed: boolean, template: string | null): void => {
    for (const scope of attempts) {
      scope.attempts.push({
        method: view.method,
        path: view.relPath ?? '<foreign>',
        template,
        query: view.query,
        bodyHash: hashBody(logBody(view.body)),
        allowed,
      });
    }
  };
  let decision: Decision;
  try {
    decision = await evaluate(h, view, scopes);
  } catch (error) {
    record(
      false,
      view.relPath !== null ? (matchRoute(h.routes, view.relPath)?.template ?? null) : null
    );
    throw error;
  }
  const template = decision.route?.template ?? null;
  try {
    // G7 budgets (recorded in budget.json and the ledger before the request leaves).
    h.consume(decision.plan.units, h.currentDomain());
  } catch (error) {
    record(false, template);
    throw error;
  }
  record(true, template);
  // Removals create nothing: the sweeper and teardown record no test MAC and track no id (their run id would get a
  // stray created record).
  const removalScope = hasScope(scopes, 'teardown', 'sweeper');
  if (decision.macs.length > 0 && !removalScope) h.track([], decision.macs);
  if (!decision.unreachable) await h.bucket.take();
  const entry: RequestLogEntry = {
    method: view.method,
    path: view.relPath ?? view.url.pathname,
    template,
    query: view.query,
    body: logBody(view.body),
  };
  h.requestLog.push(entry);
  h.requestsSent += 1;
  // Only the snapshot is sent: the URL string, the method, the headers and the bytes the guard checked; the caller's
  // input and init never reach fetchImpl. A stream gets the hard deadline next to the caller's signal (G13).
  const signal = decision.stream
    ? AbortSignal.any([view.signal, AbortSignal.timeout(STREAM_DEADLINE_MS)])
    : view.signal;
  // G1: redirects are never followed. A second hop would reach a path or a host the guard never evaluated, with
  // the method, the body and the X-API-Key of the first; a 3xx answer is a violation instead.
  const response = await h.fetchImpl(view.href, {
    method: view.method,
    headers: copyHeaders(view.headers),
    ...(view.bytes ? { body: view.bytes } : {}),
    signal,
    redirect: 'manual',
  });
  entry.status = response.status;
  entry.responseHeaders = headerRecord(response.headers);
  if (response.type === 'opaqueredirect' || (response.status >= 300 && response.status < 400)) {
    // not awaited: a mocked body may never settle its cancel; the bytes are dropped either way
    void response.body?.cancel().catch(() => undefined);
    throw raiseViolation(
      h,
      'G1',
      view.method,
      template,
      'the server answered with a redirect; the guard never follows one'
    );
  }
  if (decision.plan.mutating && decision.plan.track && response.ok && !removalScope) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(await response.clone().text());
    } catch {
      parsed = undefined;
    }
    const ids = idsOf(parsed);
    if (ids.length > 0) h.track(ids);
  }
  return response;
};

/** Tracks an id created by this run (G5 b), in memory and in `runs/<runId>.created.json`. */
export function trackCreated(id: string): void {
  if (typeof id !== 'string' || id === '')
    throw new TypeError('trackCreated: id must be a non-empty string');
  activeHarness().track([id]);
}

/** Requests of the current test that passed the guards and were sent. */
export function requestLog(): readonly RequestLogEntry[] {
  return activeHarness().requestLog;
}

/** Clears the request log (integration setup, before each test). */
export function resetRequestLog(): void {
  activeHarness().requestLog = [];
}

/**
 * The GuardViolation inside an error chain (`cause`, or the 0.2.0 SDK's `NetworkError.networkCause`).
 *
 * @internal
 */
export function guardViolationIn(error: unknown, depth = 0): GuardViolation | null {
  if (error instanceof GuardViolation) return error;
  if (depth > 5 || !(error instanceof Error)) return null;
  const linked = error as Error & { cause?: unknown; networkCause?: unknown };
  return (
    guardViolationIn(linked.cause, depth + 1) ?? guardViolationIn(linked.networkCause, depth + 1)
  );
}

/**
 * Runs `fn` and requires that it raised at least one GuardViolation, all of rule `rule` (the SDK may wrap it
 * in its own error). Violations raised inside are marked expected, so they do not fail the run.
 */
export async function expectGuardViolation(
  rule: string,
  fn: () => Promise<unknown>
): Promise<void> {
  const scope: Extract<GuardScope, { kind: 'expect-violation' }> = {
    kind: 'expect-violation',
    seen: [],
    open: true,
  };
  let error: unknown;
  let threw = false;
  try {
    await runWithGuardScope(scope, () => Promise.resolve().then(fn));
  } catch (e) {
    threw = true;
    error = e;
  } finally {
    // A timer, a handler or a reconnect started inside `fn` keeps this scope in its async context: what it sends
    // after the helper returned is not expected and fails the run.
    scope.open = false;
  }
  if (scope.seen.length === 0) {
    const what =
      threw && error instanceof Error ? `${error.name}: ${error.message}` : 'no violation';
    throw new Error(`expected GuardViolation ${rule}, got ${what}`);
  }
  const others = [...new Set(scope.seen.filter((r) => r !== rule))];
  if (others.length > 0)
    throw new Error(`expected GuardViolation ${rule}, got ${others.join(', ')}`);
  if (threw && !guardViolationIn(error)) throw error;
  countAssertion();
}
