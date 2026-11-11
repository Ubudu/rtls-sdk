// State snapshot and comparison (LIVE-TESTING §2.10, P0 §6.2 "Snapshot items", P10 H1). Global setup takes a
// before-image, global teardown an after-image, and `snapshot-cli.ts` takes labelled images outside a run. The
// images live in git-ignored state folders; a comparison reports only keys, JSON paths, ids and value hashes,
// never a value.
//
// Items: alert rules (deep, key-order-insensitive); cleanup policy and tenant config (deep, ignoring
// `updated_at`, `updatedAt`, `__v`; a non-200 such as 403 is compared by status only); settings (deep);
// dashboards (`_id` set of `application_namespace === ns`, names not `sdk-test-`); assets (count and sha256 of
// the sorted `user_udid` set, over MACs outside the test range only); notification rules (`_id` + `enabled`),
// saved views, connections, recipient mappings (id sets); ETL mapping profiles (`_id` + `updated_at`,
// non-`sdk-test-`). Each run's own test entities are excluded: names and alert-rule ids starting with the prefix,
// recipient mappings whose `match.event_types` holds the run's marker, and the ids of `runs/<runId>.created.json`.
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { activeHarness } from './active';
import { METADATA_KEYS } from './config-resources';
import type { Harness } from './context';
import { isTestMac } from './names';
import { isPlainObject } from './policy';
import { rawRequest } from './raw';

export type SnapshotKey =
  | 'alertRules'
  | 'cleanupPolicy'
  | 'tenantConfig'
  | 'settings'
  | 'dashboards'
  | 'assets'
  | 'notificationRules'
  | 'savedViews'
  | 'connections'
  | 'recipientMappings'
  | 'etlProfiles';

export interface SnapshotEntry {
  /** HTTP status of the read; a value is kept only for 200 */
  status: number;
  value?: unknown;
}

export interface StateSnapshot {
  version: 1;
  takenAt: string;
  items: Record<SnapshotKey, SnapshotEntry>;
}

export interface StateDifference {
  key: string;
  path: string;
  beforeHash?: string;
  afterHash?: string;
}

export type StateDiff = 'none' | 'foreign' | 'unexpected';

/** One entity of an id-set item (names are kept only when they start with `sdk-test-`). */
export interface IdItem {
  id: string;
  enabled?: unknown;
  updated_at?: unknown;
  testName?: string;
  testEventTypes?: string[];
}

type Kind = 'deep' | 'deep-meta' | 'ids' | 'assets';

interface ItemSpec {
  path: string;
  kind: Kind;
  project?: (body: unknown, ns: string) => unknown;
}

const testNameOf = (name: unknown): string | undefined =>
  typeof name === 'string' && name.startsWith('sdk-test-') ? name : undefined;

const idOf = (item: Record<string, unknown>, primary: '_id' | 'id' = '_id'): string | null => {
  const secondary = primary === '_id' ? 'id' : '_id';
  const raw = item[primary] ?? item[secondary];
  return typeof raw === 'string' || typeof raw === 'number' ? String(raw) : null;
};

function idItems(
  body: unknown,
  pick: (item: Record<string, unknown>) => IdItem | null
): IdItem[] | { unexpectedShape: true } {
  if (!Array.isArray(body)) return { unexpectedShape: true };
  return body
    .filter(isPlainObject)
    .map(pick)
    .filter((x): x is IdItem => x !== null)
    .sort((a, b) => a.id.localeCompare(b.id));
}

function compact(item: IdItem): IdItem {
  return Object.fromEntries(Object.entries(item).filter(([, v]) => v !== undefined)) as IdItem;
}

/** Snapshot reads, in order (all GET, raw, through the guarded fetch). */
export const SNAPSHOT_ITEMS: Record<SnapshotKey, ItemSpec> = {
  alertRules: { path: '/alert_rules/{ns}', kind: 'deep' },
  cleanupPolicy: { path: '/notifications/{ns}/cleanup-policy', kind: 'deep-meta' },
  tenantConfig: { path: '/notifications/{ns}/tenant-config', kind: 'deep-meta' },
  settings: { path: '/settings/{ns}', kind: 'deep' },
  dashboards: {
    path: '/dashboards',
    kind: 'ids',
    project: (body, ns) =>
      idItems(body, (d) => {
        const id = idOf(d);
        if (id === null || d.application_namespace !== ns) return null;
        return compact({ id, testName: testNameOf(d.name) });
      }),
  },
  assets: {
    path: '/assets/{ns}',
    kind: 'assets',
    project: (body) => {
      if (!Array.isArray(body)) return { unexpectedShape: true };
      const macs = body
        .filter(isPlainObject)
        .map((a) => (typeof a.user_udid === 'string' ? a.user_udid : ''))
        .filter((mac) => !isTestMac(mac));
      const unique = [...new Set(macs)].sort();
      return {
        count: macs.length,
        hash: createHash('sha256').update(unique.join('\n')).digest('hex'),
      };
    },
  },
  notificationRules: {
    path: '/notifications/{ns}/rules',
    kind: 'ids',
    project: (body) =>
      idItems(body, (r) => {
        const id = idOf(r);
        return id === null
          ? null
          : compact({ id, enabled: r.enabled, testName: testNameOf(r.name) });
      }),
  },
  savedViews: {
    path: '/notifications/{ns}/saved-views',
    kind: 'ids',
    project: (body) =>
      idItems(body, (v) => {
        const id = idOf(v);
        return id === null ? null : compact({ id, testName: testNameOf(v.name) });
      }),
  },
  connections: {
    path: '/notifications/{ns}/connections',
    kind: 'ids',
    project: (body) =>
      idItems(body, (c) => {
        const id = idOf(c);
        return id === null ? null : { id };
      }),
  },
  recipientMappings: {
    path: '/notifications/{ns}/recipient-mappings',
    kind: 'ids',
    project: (body) =>
      idItems(body, (m) => {
        const id = idOf(m, 'id');
        if (id === null) return null;
        const match = isPlainObject(m.match) ? m.match : {};
        const types = Array.isArray(match.event_types) ? match.event_types : [];
        const testTypes = types.filter(
          (t): t is string => typeof t === 'string' && t.startsWith('sdk-test')
        );
        return compact({ id, testEventTypes: testTypes.length > 0 ? testTypes : undefined });
      }),
  },
  etlProfiles: {
    path: '/etl/mapping-profiles',
    kind: 'ids',
    project: (body) =>
      idItems(body, (p) => {
        const id = idOf(p);
        if (id === null) return null;
        return compact({ id, updated_at: p.updated_at, testName: testNameOf(p.name) });
      }),
  },
};

export const SNAPSHOT_KEYS = Object.keys(SNAPSHOT_ITEMS) as SnapshotKey[];

/** Reads every snapshot item (11 raw GETs). A network failure rejects. */
export async function takeSnapshot(h: Harness = activeHarness()): Promise<StateSnapshot> {
  const items = {} as Record<SnapshotKey, SnapshotEntry>;
  for (const key of SNAPSHOT_KEYS) {
    const spec = SNAPSHOT_ITEMS[key];
    const response = await rawRequest('GET', spec.path);
    if (response.status !== 200) {
      items[key] = { status: response.status };
      continue;
    }
    const body = response.json ?? null;
    items[key] = {
      status: 200,
      value: spec.project ? spec.project(body, h.env.namespace) : body,
    };
  }
  return { version: 1, takenAt: new Date().toISOString(), items };
}

export function writeSnapshot(path: string, snapshot: StateSnapshot): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(snapshot, null, 2)}\n`);
}

export function readSnapshot(path: string): StateSnapshot {
  const value = JSON.parse(readFileSync(path, 'utf8')) as StateSnapshot;
  if (!value || value.version !== 1 || !isPlainObject(value.items)) {
    throw new Error('snapshot has an unexpected shape');
  }
  return value;
}

// ─── Comparison ───────────────────────────────────────────────────────────────────────────────────────

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .filter((k) => value[k] !== undefined)
        .map((k) => [k, canonical(value[k])])
    );
  }
  return value;
}

/** Short sha256 of the canonical JSON of a value (the only trace of a value in a difference). */
export function valueHash(value: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(canonical(value)) ?? 'undefined')
    .digest('hex')
    .slice(0, 16);
}

function withoutKeys(value: unknown, keys: readonly string[]): unknown {
  if (Array.isArray(value)) return value.map((v) => withoutKeys(v, keys));
  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([k]) => !keys.includes(k))
        .map(([k, v]) => [k, withoutKeys(v, keys)])
    );
  }
  return value;
}

function typeOf(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

function joinPath(base: string, segment: string | number): string {
  if (typeof segment === 'number') return `${base}[${segment}]`;
  return base === '' ? segment : `${base}.${segment}`;
}

/** Deep differences with value hashes (key-order-insensitive, arrays order-sensitive). */
function deepDifferences(key: string, before: unknown, after: unknown): StateDifference[] {
  const out: StateDifference[] = [];
  const at = (path: string, b: unknown, a: unknown, hasB: boolean, hasA: boolean): void => {
    out.push({
      key,
      path: path === '' ? '<root>' : path,
      ...(hasB ? { beforeHash: valueHash(b) } : {}),
      ...(hasA ? { afterHash: valueHash(a) } : {}),
    });
  };
  const walk = (b: unknown, a: unknown, path: string): void => {
    if (typeOf(b) !== typeOf(a)) return at(path, b, a, true, true);
    if (Array.isArray(b) && Array.isArray(a)) {
      for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
        const p = joinPath(path, i);
        if (i >= b.length) at(p, undefined, a[i], false, true);
        else if (i >= a.length) at(p, b[i], undefined, true, false);
        else walk(b[i], a[i], p);
      }
      return;
    }
    if (isPlainObject(b) && isPlainObject(a)) {
      const keys = [...new Set([...Object.keys(b), ...Object.keys(a)])].sort();
      for (const k of keys) {
        const p = joinPath(path, k);
        const inB = b[k] !== undefined;
        const inA = a[k] !== undefined;
        if (inB && inA) walk(b[k], a[k], p);
        else if (inB) at(p, b[k], undefined, true, false);
        else if (inA) at(p, undefined, a[k], false, true);
      }
      return;
    }
    if (!Object.is(b, a)) at(path, b, a, true, true);
  };
  walk(before, after, '');
  return out;
}

export interface CompareOptions {
  /** prefix of the excluded test entities: `sdk-test-<runId>-` in a run, `sdk-test-` outside one */
  prefix: string;
  /** ids of the created records (`runs/<runId>.created.json`) whose entities are excluded */
  createdIds?: ReadonlySet<string>;
}

function isOwnEventType(type: string, prefix: string): boolean {
  return type === prefix.replace(/-$/, '') || type.startsWith(prefix);
}

function excluded(item: IdItem, options: CompareOptions): boolean {
  if (item.testName?.startsWith(options.prefix)) return true;
  if (options.createdIds?.has(item.id)) return true;
  return (item.testEventTypes ?? []).some((t) => isOwnEventType(t, options.prefix));
}

function withoutOwnRules(doc: unknown, prefix: string): unknown {
  if (!isPlainObject(doc) || !Array.isArray(doc.rules)) return doc;
  return {
    ...doc,
    rules: doc.rules.filter(
      (r) => !(isPlainObject(r) && typeof r.id === 'string' && r.id.startsWith(prefix))
    ),
  };
}

function idDifferences(
  key: string,
  before: unknown,
  after: unknown,
  options: CompareOptions
): StateDifference[] {
  if (!Array.isArray(before) || !Array.isArray(after)) return deepDifferences(key, before, after);
  const keep = (list: IdItem[]): Map<string, IdItem> =>
    new Map(list.filter((i) => !excluded(i, options)).map((i) => [i.id, i]));
  const b = keep(before as IdItem[]);
  const a = keep(after as IdItem[]);
  const out: StateDifference[] = [];
  for (const id of [...new Set([...b.keys(), ...a.keys()])].sort()) {
    const bi = b.get(id);
    const ai = a.get(id);
    if (!ai) out.push({ key, path: `[${id}]`, beforeHash: valueHash(bi) });
    else if (!bi) out.push({ key, path: `[${id}]`, afterHash: valueHash(ai) });
    else {
      for (const field of ['enabled', 'updated_at'] as const) {
        if (!Object.is(bi[field], ai[field])) {
          out.push({
            key,
            path: `[${id}].${field}`,
            beforeHash: valueHash(bi[field]),
            afterHash: valueHash(ai[field]),
          });
        }
      }
    }
  }
  return out;
}

/** Differences between two images (keys, paths, ids and value hashes only). */
export function compareSnapshots(
  before: StateSnapshot,
  after: StateSnapshot,
  options: CompareOptions
): StateDifference[] {
  const out: StateDifference[] = [];
  for (const key of SNAPSHOT_KEYS) {
    const b = before.items[key];
    const a = after.items[key];
    if (!b || !a) {
      out.push({ key, path: '<missing item>' });
      continue;
    }
    if (b.status !== a.status) {
      out.push({
        key,
        path: 'status',
        beforeHash: valueHash(b.status),
        afterHash: valueHash(a.status),
      });
      continue;
    }
    if (b.status !== 200) continue;
    switch (SNAPSHOT_ITEMS[key].kind) {
      case 'deep':
        out.push(
          ...(key === 'alertRules'
            ? deepDifferences(
                key,
                withoutOwnRules(b.value, options.prefix),
                withoutOwnRules(a.value, options.prefix)
              )
            : deepDifferences(key, b.value, a.value))
        );
        break;
      case 'deep-meta':
        out.push(
          ...deepDifferences(
            key,
            withoutKeys(b.value, METADATA_KEYS),
            withoutKeys(a.value, METADATA_KEYS)
          )
        );
        break;
      case 'assets':
        out.push(...deepDifferences(key, b.value, a.value));
        break;
      case 'ids':
        out.push(...idDifferences(key, b.value, a.value, options));
        break;
    }
  }
  return out;
}

/**
 * Outcome of a comparison: no difference → `none`; a difference in a run that held the run lock → `unexpected`
 * (fails the run); in a tier-R-only run (it may overlap a write-capable run) → `foreign` (a warning).
 */
export function stateDiffOf(
  differences: readonly StateDifference[],
  runLockHeld: boolean
): StateDiff {
  if (differences.length === 0) return 'none';
  return runLockHeld ? 'unexpected' : 'foreign';
}
