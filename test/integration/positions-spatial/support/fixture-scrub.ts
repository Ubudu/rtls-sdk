// P3 §8.5 substitutions, applied to a live body before `recordFixture` (which then applies the harness
// `scrub()` and its refuse check). Pure: never logs. Coordinates are translated to a synthetic origin
// (lat 48.80000, lon 2.30000) keeping relative geometry; identifiers and names become small placeholders kept
// consistent inside one fixture; arrays are cut to at most 3 items (GeoJSON coordinate arrays excepted).
import { recordFixture } from '../../harness';

const ORIGIN = { lat: 48.8, lon: 2.3 };
const MAX_ITEMS = 3;
const MAC_KEYS = new Set(['user_udid', 'user_uuid']);
const LAT_KEYS = new Set(['lat', 'latitude']);
const LON_KEYS = new Set(['lon', 'lng', 'longitude']);
const ID_KEYS = new Set(['id', 'zone_id', 'venue_id', 'map_id']);
const USER_ID_KEYS = new Set(['createdBy', 'user_id', 'userId', 'owner', 'updatedBy']);

class Scrubber {
  private offset: { lat: number; lon: number } | null = null;
  private readonly maps = new Map<string, Map<string, string | number>>();

  private placeholder(
    kind: string,
    value: unknown,
    make: (n: number) => string | number
  ): string | number {
    let m = this.maps.get(kind);
    if (!m) {
      m = new Map();
      this.maps.set(kind, m);
    }
    const key = String(value);
    let out = m.get(key);
    if (out === undefined) {
      out = make(m.size + 1);
      m.set(key, out);
    }
    return out;
  }

  private shift(axis: 'lat' | 'lon', v: number, other?: number): number {
    if (this.offset === null) {
      const lat = axis === 'lat' ? v : (other ?? ORIGIN.lat);
      const lon = axis === 'lon' ? v : (other ?? ORIGIN.lon);
      this.offset = { lat: ORIGIN.lat - lat, lon: ORIGIN.lon - lon };
    }
    return Number((v + this.offset[axis]).toFixed(7));
  }

  private mac(v: unknown): string {
    return this.placeholder(
      'mac',
      v,
      (n) => `025d4b0000${n.toString(16).padStart(2, '0')}`
    ) as string;
  }

  private coordinates(v: unknown): unknown {
    if (Array.isArray(v) && v.length >= 2 && typeof v[0] === 'number' && typeof v[1] === 'number') {
      const lon = v[0];
      const lat = v[1];
      return [this.shift('lon', lon, lat), this.shift('lat', lat, lon), ...v.slice(2)];
    }
    return Array.isArray(v) ? v.map((x) => this.coordinates(x)) : v;
  }

  walk(value: unknown, parentKey: string | null): unknown {
    if (Array.isArray(value)) return value.slice(0, MAX_ITEMS).map((x) => this.walk(x, parentKey));
    if (value === null || typeof value !== 'object') return value;
    const obj = value as Record<string, unknown>;
    const latLon =
      typeof obj.lat === 'number' && typeof (obj.lon ?? obj.lng) === 'number'
        ? { lat: obj.lat, lon: (obj.lon ?? obj.lng) as number }
        : null;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      out[k] = this.field(k, v, parentKey, latLon);
    }
    return out;
  }

  private field(
    k: string,
    v: unknown,
    parentKey: string | null,
    latLon: { lat: number; lon: number } | null
  ): unknown {
    if (MAC_KEYS.has(k) && typeof v === 'string') return this.mac(v);
    if (parentKey === 'user' && k === 'udid' && typeof v === 'string') return this.mac(v);
    if (k === 'app_namespace' && typeof v === 'string') return 'ns-fixture';
    if ((k === 'map_uuid' || k === 'uuid') && typeof v === 'string') return 'map-fixture';
    if (USER_ID_KEYS.has(k) && typeof v === 'string') return 'user-fixture';
    if (k === '_index' && typeof v === 'string') {
      const type = /_(positions|alerts|zone_visits)/.exec(v)?.[1] ?? 'positions';
      return `rt_ns-fixture_${type}-000001`;
    }
    if (k === '_id' && typeof v === 'string') return this.placeholder('doc', v, (n) => `doc-${n}`);
    if (k === 'user_name' && typeof v === 'string')
      return this.placeholder('asset', v, (n) => `Asset ${n}`);
    if (parentKey === 'user' && k === 'name' && typeof v === 'string') {
      return this.placeholder('asset', v, (n) => `Asset ${n}`);
    }
    if (k === 'external_id' && typeof v === 'string')
      return this.placeholder('ext', v, (n) => `ext-${n}`);
    if ((k === 'name' || k === 'zone_name') && typeof v === 'string') {
      return this.placeholder('zone', v, (n) => `Zone ${n}`);
    }
    if ((k === 'venue_name' || k === 'map_name') && typeof v === 'string') {
      return this.placeholder(k, v, (n) => (k === 'venue_name' ? `Venue ${n}` : `Map ${n}`));
    }
    if (k === 'description' && typeof v === 'string') return 'Description';
    if (ID_KEYS.has(k) && (typeof v === 'number' || typeof v === 'string')) {
      const n = this.placeholder(`id:${k === 'zone_id' ? 'id' : k}`, v, (i) => i) as number;
      return typeof v === 'string' ? String(n) : n;
    }
    if (k === 'tags' && Array.isArray(v)) return v.length > 0 ? ['tag-1'] : [];
    if (k === 'tags' && v !== null && typeof v === 'object') {
      return Object.keys(v).length > 0 ? { 'tag-1': 1 } : {};
    }
    if (k === 'path' && typeof v === 'string') return '/site/area';
    if (k === 'device_info' && v !== null && typeof v === 'object') return {};
    if (k === 'data' && v !== null && typeof v === 'object' && !Array.isArray(v)) return { k: 1 };
    if (k === 'coordinates') return this.coordinates(v);
    if (LAT_KEYS.has(k) && typeof v === 'number') return this.shift('lat', v, latLon?.lon);
    if (LON_KEYS.has(k) && typeof v === 'number') return this.shift('lon', v, latLon?.lat);
    return this.walk(v, k);
  }
}

/** The §8.5 substitutions on one body (a fresh placeholder table per fixture). */
export function scrubP3Body(body: unknown): unknown {
  return new Scrubber().walk(body, null);
}

/**
 * Records `test/fixtures/positions-spatial/<name>.json` from an SDK result (status 200 unless given) after the
 * §8.5 substitutions; a no-op without `--record`.
 */
export async function recordP3(
  name: string,
  operation: string,
  body: unknown,
  testId: string,
  status = 200
): Promise<boolean> {
  return recordFixture(
    'positions-spatial',
    name,
    { operation, status, body: scrubP3Body(body) },
    `Scrubbed live body (P3 §8.5 substitutions) recorded by ${testId}.`
  );
}
