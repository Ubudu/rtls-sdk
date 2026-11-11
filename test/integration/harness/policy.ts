// Guard policy constants and pure helpers (P0 §5.3). The rules themselves are applied by guard.ts (G1–G15,
// G17, G18) and ws-guard.ts (G16); this module holds the fixed lists they read, so a reviewer can compare
// them with §5.3 line by line.
import { isTestMac } from './names';

export type DomainKey =
  | 'harness'
  | 'core'
  | 'assets'
  | 'positions-spatial'
  | 'venues-navigation'
  | 'dashboards-rules'
  | 'notifications'
  | 'etl'
  | 'websocket';

export const DOMAIN_KEYS: readonly DomainKey[] = [
  'harness',
  'core',
  'assets',
  'positions-spatial',
  'venues-navigation',
  'dashboards-rules',
  'notifications',
  'etl',
  'websocket',
];

/** Dummy credential: the only one a request to an unreachable URL may carry (G1, LIVE-TESTING §6). */
export const DUMMY_API_KEY = 'sdk-test-dummy-key';

/** Unreachable base URLs (G1): recognised by origin, whatever the path. */
export const UNREACHABLE_BASE_URLS = {
  refused: 'http://127.0.0.1:9/api',
  dns: 'https://rtls.invalid/api',
  blackhole: 'http://192.0.2.1/api',
} as const;
export type UnreachableTarget = keyof typeof UNREACHABLE_BASE_URLS;

/** P1 H-P0-1. */
export const unroutableBaseUrl: string = UNREACHABLE_BASE_URLS.refused;

/** `ws:`/`wss:` origins compare as `http:`/`https:`. */
export function httpOrigin(url: URL): string {
  const protocol =
    url.protocol === 'ws:' ? 'http:' : url.protocol === 'wss:' ? 'https:' : url.protocol;
  return `${protocol}//${url.host}`;
}

/** The unreachable target whose origin `url` has, else null. */
export function unreachableTarget(url: URL): UnreachableTarget | null {
  const origin = httpOrigin(url);
  for (const [key, base] of Object.entries(UNREACHABLE_BASE_URLS)) {
    if (new URL(base).origin === origin) return key as UnreachableTarget;
  }
  return null;
}

export const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]', '::1']);

/** G4: POSTs that only compute (admitted in tier R). Normalised spec templates. */
export const READ_ONLY_POSTS: ReadonlySet<string> = new Set([
  '/es/query/{appNamespace}/{dataType}',
  '/spatial/zones/{namespace}/analyze-custom',
  '/spatial/zones/{namespace}/calculate-distances',
  '/spatial/pois/{namespace}/analyze-custom',
  '/spatial/navigate/{namespace}/shortest-path',
  '/spatial/navigate/{namespace}/multi-stop',
  '/etl/parse-excel-headers',
]);

/** G2: path prefixes never called, any method (segment-wise prefix of the path below the base path). */
export const NEVER_PREFIXES: readonly string[] = [
  '/admin',
  '/internal',
  '/esl',
  '/ai-agent',
  '/ai',
];
/** G2: method + path prefix never called. */
export const NEVER_METHOD_PREFIXES: readonly (readonly [string, string])[] = [
  ['GET', '/status'],
  ['POST', '/settings'],
  ['POST', '/assets_library'],
  ['POST', '/data_filters_taxonomy'],
  ['DELETE', '/venues/cache/invalidate'],
];
/** G2: method + template never called (besides every base.json `exclude` operation). */
export const NEVER_TEMPLATES: ReadonlySet<string> = new Set([
  'POST /notifications/{namespace}/{id}/mute',
  'POST /spatial/navigate/{namespace}/accessible-path',
]);

/** True when `path` equals `prefix` or continues it with `/`. */
export function hasSegmentPrefix(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(`${prefix}/`);
}

/** G3: namespace path parameters (`:namespace` is normalised to `{namespace}`). */
export const NAMESPACE_PARAMS: ReadonlySet<string> = new Set([
  'app_namespace',
  'appNamespace',
  'namespace',
]);
/** G3: query and top-level body keys that name a namespace. */
export const NAMESPACE_KEYS: readonly string[] = [
  'app_namespace',
  'appNamespace',
  'application_namespace',
  'namespace',
  'applicationId',
];
/**
 * G3: keys whose value is a list of namespaces (LIVE-TESTING §2.1: no body names another namespace). The asset's
 * `targetApplications` (string array in the spec) is the only one a writable request carries. A value passes when
 * it is absent, null, a string equal to APP_NAMESPACE, or an array of such strings (empty included).
 */
export const NAMESPACE_LIST_KEYS: readonly string[] = ['targetApplications'];

/** True when the value of a NAMESPACE_LIST_KEYS key names no namespace other than `ns` (see there). */
export function namespaceListOk(value: unknown, ns: string): boolean {
  if (value === undefined || value === null || value === ns) return true;
  return Array.isArray(value) && value.every((entry) => entry === ns);
}

/** G6: keys whose values must be test MACs. */
export const MAC_KEYS: ReadonlySet<string> = new Set([
  'user_udid',
  'user_uuid',
  'mac',
  'mac_address',
  'macAddress',
  'mac_addresses',
]);
export const MAC_PLAIN_RE = /^[0-9a-fA-F]{12}$/;
export const MAC_SEPARATED_RE = /^([0-9a-fA-F]{2}[:-]){5}[0-9a-fA-F]{2}$/;
/** MAC-like tokens inside free text (CSV, text bodies). */
export const MAC_TOKEN_RE =
  /(?<![0-9A-Fa-f:-])(?:[0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}(?![0-9A-Fa-f:-])|(?<![0-9A-Fa-f])[0-9A-Fa-f]{12}(?![0-9A-Fa-f])/g;

export function looksLikeMac(value: string): boolean {
  return MAC_PLAIN_RE.test(value) || MAC_SEPARATED_RE.test(value);
}

/** MAC-like tokens of a text that are not test MACs. */
export function foreignMacTokens(text: string): number {
  let count = 0;
  for (const match of text.matchAll(MAC_TOKEN_RE)) if (!isTestMac(match[0])) count += 1;
  return count;
}

/** G10: channels the server knows (a POST with another channel is answered 400 before any write). */
export const SERVER_CHANNELS: ReadonlySet<string> = new Set([
  'inapp',
  'email',
  'slack',
  'telegram',
  'teams',
  'whatsapp',
]);

/** G12 bounds. */
export const HOUR_MS = 3_600_000;
export const DAY_MS = 86_400_000;
export const ES_RANGE_TEMPLATES: ReadonlySet<string> = new Set([
  '/es/position_history/{appNamespace}',
  '/es/zone_presence/{appNamespace}',
  '/es/last_positions/{appNamespace}',
]);
export const ES_ALERTS_TEMPLATE = '/es/alerts/{appNamespace}';
export const ES_QUERY_TEMPLATE = '/es/query/{appNamespace}/{dataType}';
export const ASSET_HISTORY_TEMPLATE = '/asset_history/{app_namespace}/{mac_address}';

/** G13: hard deadline of a stream request. */
export const STREAM_DEADLINE_MS = 120_000;
/** G16: hard lifetime of a socket. */
export const SOCKET_LIFETIME_MS = 120_000;
/** G15: token bucket. */
export const RATE_CAPACITY = 5;
export const RATE_PER_SECOND = 5;

/**
 * G5 (c): the create collections, `"POST template"`. A POST elsewhere (an action on an entity such as
 * `/dashboards/{id}/share` or `/notifications/{ns}/{id}/archive`) is never admitted by its body's name; recipient
 * mappings and connections are G10's, sends G7's.
 */
export const CREATE_COLLECTIONS: ReadonlySet<string> = new Set([
  'POST /dashboards',
  'POST /notifications/{namespace}/rules',
  'POST /notifications/{namespace}/saved-views',
  'POST /etl/mapping-profiles',
]);

/**
 * G5: `"METHOD template"` of the writes keyed by the path MAC that create or change an asset (or its documents) under
 * that key: the asset upsert, the asset patch and the document upload. Only a test MAC in the path admits them (G5 a,
 * LIVE-TESTING §2.3); a made-up id (G5 e) does not, since the upsert and the upload create what the path names.
 */
export const PATH_KEYED_WRITES: ReadonlySet<string> = new Set([
  'POST /assets/{app_namespace}/{mac_address}',
  'PATCH /assets/{app_namespace}/{mac_address}',
  'POST /assets/{namespace}/{mac_address}/documents',
]);

/**
 * G6 (fail closed): `"METHOD template"` of the operations that may send a body that is not UTF-8 text. Empty: asset
 * documents and ETL files go as multipart forms, every other body is JSON.
 */
export const BINARY_BODY_TEMPLATES: ReadonlySet<string> = new Set<string>();

/** G7/G18: the `patch_asset_data` values the publisher reads as true (P3 §5). */
export const PATCH_ASSET_DATA_TRUE: ReadonlySet<string> = new Set(['1', 'true', 'True', 'TRUE']);

/**
 * G6 (fail closed): `"METHOD template"` of the operations whose body is a multipart form (the spec's only
 * `multipart/form-data` request bodies). Every other body is JSON.
 */
export const MULTIPART_TEMPLATES: ReadonlySet<string> = new Set([
  'POST /assets/{namespace}/{mac_address}/documents',
  'POST /etl/parse-excel-headers',
  'POST /etl/upload',
]);

/** G7: an ETL writing upload is at most this large. */
export const ETL_WRITE_MAX_BYTES = 64 * 1024;

/** Templates the rules name (normalised from the vendored spec). */
export const T = {
  publisher: '/publisher/{app_namespace}',
  assets: '/assets/{app_namespace}',
  asset: '/assets/{app_namespace}/{mac_address}',
  bulkDeclare: '/assets/{namespace}/bulk-declare',
  bulkClear: '/assets/{namespace}/bulk-clear-declared',
  send: '/notifications/{namespace}/send',
  tagActions: '/tag-actions/{appNamespace}',
  etlUpload: '/etl/upload',
  bulk: '/notifications/{namespace}/bulk',
  bulkUndo: '/notifications/{namespace}/bulk/undo',
  alertRules: '/alert_rules/{app_namespace}',
  cleanupPolicy: '/notifications/{namespace}/cleanup-policy',
  tenantConfig: '/notifications/{namespace}/tenant-config',
  connections: '/notifications/{namespace}/connections',
  connection: '/notifications/{namespace}/connections/{id}',
  connectionTest: '/notifications/{namespace}/connections/{id}/test',
  mappings: '/notifications/{namespace}/recipient-mappings',
  mapping: '/notifications/{namespace}/recipient-mappings/{id}',
  rules: '/notifications/{namespace}/rules',
  rule: '/notifications/{namespace}/rules/{id}',
} as const;

export interface PreflightVerdicts {
  ruleEngineSafe: boolean;
  positionSafe: boolean;
  declaredPositionSafe: boolean;
  linkedNamespaceSafe: boolean;
  linkedCount: number;
  blocking: { index: number; eventType: string }[];
  /**
   * The position verdicts that hold only through the `time_in_zone` leaf (LIVE-TESTING §2.7): each counts as false
   * from `timeLimitedUntil` on (ISO time: the preflight's start plus TIME_IN_ZONE_RUN_LIMIT_SECONDS), and at once
   * when that time is missing or does not parse. Absent when no verdict depends on that leaf.
   */
  timeLimited?: TimeLimitedVerdict[];
  timeLimitedUntil?: string | null;
}

export type TimeLimitedVerdict = 'positionSafe' | 'declaredPositionSafe';

export type ReachShape = 'assets' | 'publish' | 'declared';

/** The verdicts a shape needs (G18, describeLive, examples/shared preflightAllows). */
export function verdictsFor(shape: ReachShape): (keyof PreflightVerdicts)[] {
  switch (shape) {
    case 'assets':
      return ['ruleEngineSafe', 'linkedNamespaceSafe'];
    case 'publish':
      return ['ruleEngineSafe', 'positionSafe'];
    case 'declared':
      return ['ruleEngineSafe', 'linkedNamespaceSafe', 'declaredPositionSafe'];
  }
}

/**
 * Verdicts a shape needs that are not true (a missing preflight fails every verdict). A verdict listed in
 * `timeLimited` also fails once `now` is not before `timeLimitedUntil` (a missing or unparsable time: at once). A
 * `timeLimited` that is present and not an array fails both position verdicts at once (an unknown shape).
 */
export function failedVerdicts(
  v: PreflightVerdicts | null,
  shape: ReachShape,
  now: number = Date.now()
): string[] {
  const listed: unknown = v?.timeLimited;
  const malformed = listed !== undefined && !Array.isArray(listed);
  const limited = new Set<unknown>(Array.isArray(listed) ? listed : []);
  const until = typeof v?.timeLimitedUntil === 'string' ? Date.parse(v.timeLimitedUntil) : NaN;
  return verdictsFor(shape).filter(
    (name) =>
      v?.[name] !== true ||
      (malformed && (name === 'positionSafe' || name === 'declaredPositionSafe')) ||
      (limited.has(name) && !(now < until))
  );
}

/** Same rule as `examples/shared/config.js` `preflightAllows`. */
export function preflightAllows(
  v: PreflightVerdicts | null,
  shape: ReachShape,
  now: number = Date.now()
): boolean {
  return failedVerdicts(v, shape, now).length === 0;
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
