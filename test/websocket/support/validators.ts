// Runtime validators of the WebSocket wire messages (spec P8 §5.3) and the loader of the WebSocket fixtures
// (spec P8 §8.3). Used by the unit tests (fixtures, mutated fixtures) and by the live tests (traffic).
// A problem names a key path and a type, never a value, so live output carries no payload.
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { WebSocketMessageKind } from '../../../src/websocket';

/** The P0 fixture envelope as the WebSocket fixtures use it (no `_operation`, the message under `body`). */
export interface WsFixtureEnvelope {
  _source: 'server-code' | 'live';
  _note: string;
  _nonHttp: string;
  _usi?: string[];
  body: Record<string, unknown>;
}

export interface WsFixtureEntry {
  /** file name in `test/fixtures/websocket/` */
  file: string;
  /** what `classifyMessage(fixture.body)` returns */
  kind: WebSocketMessageKind;
  /** the WS-M row of the operation table (spec P8 §4.3) */
  nonHttp: string;
}

export const WS_FIXTURES_DIR = resolve(__dirname, '..', '..', 'fixtures', 'websocket');

/** Every WebSocket fixture with its expected kind (spec P8 §8.3). */
export const WS_FIXTURES: readonly WsFixtureEntry[] = [
  { file: 'position.json', kind: 'POSITIONS', nonHttp: 'WS-M1' },
  { file: 'position-declared.json', kind: 'POSITIONS', nonHttp: 'WS-M1' },
  { file: 'zone-enter.json', kind: 'ZONES_ENTRIES_EVENTS', nonHttp: 'WS-M2' },
  { file: 'zone-enter-outside.json', kind: 'ZONES_ENTRIES_EVENTS', nonHttp: 'WS-M2' },
  { file: 'zone-exit-synthetic.json', kind: 'ZONES_ENTRIES_EVENTS', nonHttp: 'WS-M2' },
  { file: 'zone-counter.json', kind: 'ZONE_STATS_EVENTS', nonHttp: 'WS-M3' },
  { file: 'zone-counter-full.json', kind: 'ZONE_STATS_EVENTS', nonHttp: 'WS-M3' },
  { file: 'alert.json', kind: 'ALERTS', nonHttp: 'WS-M4' },
  { file: 'alert-no-params.json', kind: 'ALERTS', nonHttp: 'WS-M4' },
  { file: 'tag-lost.json', kind: 'TAG_LOST', nonHttp: 'WS-M5' },
  { file: 'asset-update.json', kind: 'ASSETS', nonHttp: 'WS-M6' },
  { file: 'asset-delete.json', kind: 'ASSETS', nonHttp: 'WS-M6' },
  { file: 'alert-rules-changed.json', kind: 'ALERT_RULES_CHANGED', nonHttp: 'WS-M7' },
  { file: 'assets-library-changed.json', kind: 'ASSETS_LIBRARY_CHANGED', nonHttp: 'WS-M8' },
  { file: 'data-models-changed.json', kind: 'DATA_MODELS_CHANGED', nonHttp: 'WS-M9' },
  { file: 'settings-changed.json', kind: 'SETTINGS_CHANGED', nonHttp: 'WS-M10' },
  { file: 'map-data-changed.json', kind: 'MAP_DATA_CHANGED', nonHttp: 'WS-M11' },
  { file: 'subscription-confirmation.json', kind: 'CONFIRMATION', nonHttp: 'WS-M12' },
  { file: 'clear-alert.json', kind: 'UNKNOWN', nonHttp: 'WS-M13' },
];

/** Reads `test/fixtures/websocket/<file>` (name with or without `.json`) and returns the envelope. */
export function loadWsFixture(file: string): WsFixtureEnvelope {
  const name = file.endsWith('.json') ? file : `${file}.json`;
  return JSON.parse(readFileSync(join(WS_FIXTURES_DIR, name), 'utf8')) as WsFixtureEnvelope;
}

// ---------------------------------------------------------------------------------------------------------
// Checks: each returns the problems of one value at `path` ("" for the root).

type Check = (value: unknown, path: string) => string[];

function typeName(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function label(path: string): string {
  return path === '' ? '(root)' : path;
}

function child(path: string, key: string): string {
  return path === '' ? key : `${path}.${key}`;
}

function simple(name: string, test: (v: unknown) => boolean): Check {
  return (v, path) => (test(v) ? [] : [`${label(path)}: expected ${name}, got ${typeName(v)}`]);
}

const str = simple('string', (v) => typeof v === 'string');
const num = simple('number', (v) => typeof v === 'number' && Number.isFinite(v));
const bool = simple('boolean', (v) => typeof v === 'boolean');
const nul = simple('null', (v) => v === null);
const record = simple('object', isRecord);
const anything: Check = () => [];
const strArr = simple('string[]', (v) => Array.isArray(v) && v.every((e) => typeof e === 'string'));

function literal(...values: readonly string[]): Check {
  const text = values.map((v) => `'${v}'`).join(' | ');
  return (v, path) => {
    if (typeof v === 'string' && values.includes(v)) return [];
    // the actual value is never echoed: only its type, or "another string"
    return [
      `${label(path)}: expected ${text}, got ${typeof v === 'string' ? 'another string' : typeName(v)}`,
    ];
  };
}

/** The first alternative without problems wins; otherwise the problems of the closest one are reported. */
function oneOf(name: string, ...alternatives: Check[]): Check {
  return (v, path) => {
    let best: string[] | null = null;
    for (const check of alternatives) {
      const problems = check(v, path);
      if (problems.length === 0) return [];
      if (best === null || problems.length < best.length) best = problems;
    }
    return best !== null && best.length === 1 && best[0]?.startsWith(`${label(path)}: expected`)
      ? [`${label(path)}: expected ${name}, got ${typeName(v)}`]
      : (best ?? []);
  };
}

const strOrNum = oneOf('string | number', str, num);
const strOrNull = oneOf('string | null', str, nul);
const strNumOrNull = oneOf('string | number | null', str, num, nul);
const numOrNull = oneOf('number | null', num, nul);
const strArrOrNull = oneOf('string[] | null', strArr, nul);
const recordOrNull = oneOf('object | null', record, nul);

interface ObjectSpec {
  required?: Record<string, Check>;
  optional?: Record<string, Check>;
  /** keys that must be absent (discriminators of another kind) */
  forbidden?: readonly string[];
  /** true: an index signature admits any other key */
  open?: boolean;
}

function object(spec: ObjectSpec): Check {
  return (v, path) => {
    if (!isRecord(v)) return [`${label(path)}: expected object, got ${typeName(v)}`];
    const problems: string[] = [];
    const required = spec.required ?? {};
    const optional = spec.optional ?? {};
    for (const [key, check] of Object.entries(required)) {
      if (!Object.hasOwn(v, key)) problems.push(`${child(path, key)}: missing`);
      else problems.push(...check(v[key], child(path, key)));
    }
    for (const [key, value] of Object.entries(v)) {
      if (Object.hasOwn(required, key)) continue;
      if (spec.forbidden?.includes(key))
        problems.push(`${child(path, key)}: not allowed on this kind`);
      else if (Object.hasOwn(optional, key))
        problems.push(...(optional[key] as Check)(value, child(path, key)));
      else if (!spec.open) problems.push(`${child(path, key)}: unexpected key`);
    }
    return problems;
  };
}

// ---------------------------------------------------------------------------------------------------------
// Shared fragments (WsPositionZone, WsZoneStub, WsZoneFeature, WsDeviceInfo, WsAssetFields, WsAssetData).

const positionZone = object({
  required: { id: num, name: str, tags: strArr, color: strOrNull },
});

const zoneStub = object({ required: { properties: object({ required: { id: num } }) } });

const zoneFeature = object({
  required: {
    type: literal('Feature'),
    geometry: object({ required: { type: str, coordinates: anything }, open: true }),
    properties: object({
      required: { id: num },
      optional: { name: str, level: num, rgb_color: str, tags: strArr, type: str },
      open: true,
    }),
  },
  open: true,
});

const deviceInfo = object({
  optional: {
    model: str,
    system_api_id: str,
    system_build_number: str,
    system_name: str,
    system_version: str,
  },
});

const assetFields: Record<string, Check> = {
  user_name: str,
  user_type: str,
  user_motion: str,
  model: str,
  color: str,
  path: str,
  tags: strArr,
  external_id: strOrNull,
  data: record,
  targetApplications: anything,
  battery_percent: num,
  declared_location: recordOrNull,
  is_virtual: bool,
  createdBy: str,
  dateCreated: num,
  dateChanged: num,
};

const assetData = object({ optional: { ...assetFields, user_udid: str }, open: true });

const alertParams = object({ optional: { text: str, title: str, style: str }, open: true });

// ---------------------------------------------------------------------------------------------------------
// One spec per kind (spec P8 §5.3).

const SPECS: Record<WebSocketMessageKind, Check> = {
  POSITIONS: object({
    required: {
      app_namespace: str,
      user_uuid: str,
      user_udid: str,
      lat: num,
      lon: num,
      map_uuid: str,
      timestamp: strOrNum,
      zone: positionZone,
    },
    optional: {
      ...assetFields,
      origin: num,
      origin_detail: str,
      level: num,
      speed: numOrNull,
      prev_pos_distance: num,
      prev_pos_time_diff_seconds: num,
      device_info: deviceInfo,
      il_sdk_ver: str,
    },
    forbidden: ['action', 'event_type'],
    open: true,
  }),
  ZONES_ENTRIES_EVENTS: object({
    required: {
      action: literal('notifyEvent'),
      event_type: literal('ENTER_ZONE', 'EXIT_ZONE'),
      app_namespace: str,
      user_udid: str,
      zone: oneOf('Feature | stub | null', zoneFeature, zoneStub, nul),
    },
    optional: {
      map_uuid: str,
      timestamp: strOrNum,
      user_name: str,
      external_id: strOrNull,
      tags: strArr,
      data: record,
      path: strOrNull,
      model: strOrNull,
      color: strOrNull,
      visit_id: strOrNull,
      start_ts: strNumOrNull,
      exit_ts: strNumOrNull,
    },
  }),
  ZONE_STATS_EVENTS: object({
    required: {
      action: literal('notifyEvent'),
      event_type: literal('UPDATE_ZONE_COUNTER'),
      app_namespace: str,
      zone: oneOf('stub | Feature', zoneStub, zoneFeature),
      total: num,
      total_tags: num,
      total_mobiles: num,
      avg_time: num,
      avg_time_tags: num,
      avg_time_mobiles: num,
    },
    optional: { timestamp: strOrNum, map_uuid: str, is_synthetic_exit: bool },
  }),
  ALERTS: object({
    required: {
      action: literal('notifyEvent'),
      event_type: literal('NOTIFICATION'),
      app_namespace: str,
    },
    optional: {
      map_uuid: str,
      user_udid: str,
      user_type: str,
      zone: oneOf(
        'position zone | Feature | stub | null',
        positionZone,
        zoneFeature,
        zoneStub,
        nul
      ),
      params: alertParams,
    },
  }),
  TAG_LOST: object({
    required: {
      action: literal('notifyEvent'),
      event_type: literal('USR_EXIT'),
      app_namespace: str,
      user_udid: str,
    },
    optional: {
      is_synthetic_exit: bool,
      map_uuid: str,
      zone: oneOf('Feature | stub | null', zoneFeature, zoneStub, nul),
      user_name: str,
      tags: strArrOrNull,
      data: record,
      external_id: strOrNull,
    },
  }),
  ASSETS: object({
    required: {
      type: literal('assets'),
      action: literal('create', 'update', 'delete'),
      app_namespace: str,
      mac_address: str,
    },
    optional: { data: assetData },
  }),
  ALERT_RULES_CHANGED: object({
    required: { type: literal('alert_rules'), action: literal('update'), app_namespace: str },
  }),
  ASSETS_LIBRARY_CHANGED: object({
    required: { action: literal('fetchAssetsLibraryEvent'), app_namespace: str },
  }),
  DATA_MODELS_CHANGED: object({
    required: { action: literal('fetchDataFiltersTaxonomyEvent'), app_namespace: str },
  }),
  SETTINGS_CHANGED: object({
    required: { action: literal('updateSettingsEvent'), app_namespace: str },
  }),
  MAP_DATA_CHANGED: object({
    required: { action: literal('fetchMapEditorDataEvent'), app_namespace: str },
    optional: { venue_id: strOrNum, map_id: strOrNum },
  }),
  CONFIRMATION: object({
    required: { action: literal('subscribeEvent'), app_namespace: str },
  }),
  UNKNOWN: record,
};

/**
 * The problems of `msg` as a message of `kind` (spec P8 §5.3): missing or mistyped fields, keys a closed kind
 * does not have, discriminators of another kind. `[]` means valid. Problems carry key paths and type names
 * only, never values.
 */
export function validateMessage(kind: WebSocketMessageKind, msg: unknown): string[] {
  const check = SPECS[kind];
  if (check === undefined) return [`(root): no validator for kind ${String(kind)}`];
  return check(msg, '');
}

/** The sorted top-level key set of a message (what a live failure message may show). */
export function keySet(msg: unknown): string[] {
  return isRecord(msg) ? Object.keys(msg).sort() : [typeName(msg)];
}
