// Harness live smoke (P0 §9.1, domain `harness`). Tier R: H-R1…H-R10, which also settle the UNVERIFIED items
// U1–U5 and U9 of P0 §5.2; tier W: H-W1 (one test asset created, swept and verified gone; U6). Budget: 0
// positions, 0 notifications, 0 BLE, 0 ETL. Observations go to `report.json.facts` through recordFact (booleans,
// numbers, media types; never a value of a response, a credential or the namespace). Assertions compare
// booleans, counts, statuses and key names only, so no failure message carries a live value.
import { join } from 'node:path';
import { beforeAll, vi } from 'vitest';
import { insideAnyZone, isMapBounds } from '../../../examples/shared/discover.js';
import {
  compareSnapshots,
  createTestAsset,
  describeLive,
  discover,
  DUMMY_API_KEY,
  expectGuardViolation,
  feature,
  getHarness,
  guardedFetch,
  lastHour,
  rawRequest,
  recordFact,
  requestLog,
  runCleanup,
  safePublishPoint,
  stateDir,
  sweep,
  takeSnapshot,
  UNREACHABLE_BASE_URLS,
  type Discovery,
  type Harness,
} from '../harness';
import { readJsonFileSync } from './state-io.mjs';

type Sent = { hosts: string[]; restore: () => void };

/** Records the host of every request that actually leaves through the context's fetch. */
function spyOnSends(h: Harness): Sent {
  const original = h.fetchImpl;
  const hosts: string[] = [];
  h.fetchImpl = (input, init) => {
    const url = input instanceof Request ? input.url : String(input);
    hosts.push(new URL(url).host);
    return original(input, init);
  };
  return {
    hosts,
    restore: () => {
      h.fetchImpl = original;
    },
  };
}

function between(x: number, a: number, b: number): boolean {
  return x >= Math.min(a, b) && x <= Math.max(a, b);
}

/** Zone vertices ([lng, lat] in GeoJSON) inside the bounds read lat-first and read lng-first. */
function boundsOrientation(discovery: Discovery): { latFirst: number; lngFirst: number } {
  const [[a, b], [c, d]] = discovery.mapBounds;
  let latFirst = 0;
  let lngFirst = 0;
  const visit = (value: unknown): void => {
    if (!Array.isArray(value)) return;
    if (value.length >= 2 && typeof value[0] === 'number' && typeof value[1] === 'number') {
      const [lng, lat] = value as [number, number];
      if (between(lat, a, c) && between(lng, b, d)) latFirst += 1;
      if (between(lat, b, d) && between(lng, a, c)) lngFirst += 1;
      return;
    }
    for (const v of value) visit(v);
  };
  for (const zone of discovery.zones) visit(zone.geometry.coordinates);
  return { latFirst, lngFirst };
}

describeLive('R', 'harness smoke', () => {
  let h: Harness;

  beforeAll(() => {
    h = getHarness();
  });

  it('H-R1 reads /health through the guard and logs one request', async () => {
    const r = await rawRequest('GET', '/health');
    expect(r.status).toBe(200);
    expect((r.json as { status?: unknown }).status).toBe('OK');
    expect(requestLog()).toHaveLength(1);
  });

  it('H-R2 rejects a foreign namespace before anything is sent (G3)', async () => {
    const sent = spyOnSends(h);
    try {
      await expectGuardViolation('G3', () => rawRequest('GET', '/assets/sdk-test-foreign'));
    } finally {
      sent.restore();
    }
    expect(sent.hosts).toEqual([]);
    expect(requestLog()).toHaveLength(0);
  });

  it('H-R3 rejects an unbounded /es/alerts read (G12) and admits a bounded one', async () => {
    await expectGuardViolation('G12', () => rawRequest('GET', '/es/alerts/{ns}'));
    const r = await rawRequest('GET', '/es/alerts/{ns}', { query: { ...lastHour(), size: 10 } });
    expect(r.status).toBe(200);
    expect(Array.isArray(r.json)).toBe(true);
  });

  it('H-R4 discovers venue, map, zones and a safe publish point (U1)', async () => {
    const discovery = await discover();
    expect(Number.isInteger(discovery.venueId)).toBe(true);
    expect(Number.isInteger(discovery.mapId)).toBe(true);
    expect(typeof discovery.mapUuid === 'string' && discovery.mapUuid.length > 0).toBe(true);
    expect(isMapBounds(discovery.mapBounds)).toBe(true);
    expect(discovery.zones.length).toBeGreaterThan(0);
    expect(insideAnyZone(discovery.zoneCentroid, discovery.zones)).toBe(true);

    const [[a, b], [c, d]] = discovery.mapBounds;
    const { lat, lng } = discovery.zoneCentroid;
    const orientation = boundsOrientation(discovery);
    recordFact('U1.zoneVerticesInsideLatFirst', orientation.latFirst);
    recordFact('U1.zoneVerticesInsideLngFirst', orientation.lngFirst);
    recordFact('U1.centroidInsideLatFirst', between(lat, a, c) && between(lng, b, d));
    expect(Math.abs(a) <= 90 && Math.abs(c) <= 90).toBe(true);
    expect(orientation.latFirst).toBeGreaterThan(orientation.lngFirst);
    recordFact('U1.mapBoundsLatFirst', orientation.latFirst > orientation.lngFirst);

    const point = safePublishPoint(discovery);
    recordFact('H-R4.zones', discovery.zones.length);
    recordFact('H-R4.hasSafePoint', point !== null);
    expect(point === null || !insideAnyZone(point, discovery.zones)).toBe(true);
    const report = readJsonFileSync<{ venueId?: unknown; mapId?: unknown; hasSafePoint?: unknown }>(
      join(stateDir(), 'discovery.json'),
      {}
    );
    expect(Object.keys(report).sort()).toEqual(['hasSafePoint', 'mapId', 'venueId']);
  });

  it('H-R5 two snapshots of the namespace compare equal', async () => {
    const first = await takeSnapshot();
    const second = await takeSnapshot();
    const differences = compareSnapshots(first, second, { prefix: h.runPrefix });
    expect(differences.map((d) => `${d.key} ${d.path}`)).toEqual([]);
  });

  it('H-R6 the preflight holds four boolean verdicts, a count, indices and event types only (and a time limit)', () => {
    const preflight = readJsonFileSync<Record<string, unknown>>(
      join(stateDir(), 'preflight.json'),
      {}
    );
    // a position verdict that holds only through the time_in_zone leaf adds both time-limit keys (LIVE-TESTING §2.7)
    const limited = Object.hasOwn(preflight, 'timeLimited');
    expect(Object.keys(preflight).sort()).toEqual([
      'blocking',
      'declaredPositionSafe',
      'linkedCount',
      'linkedNamespaceSafe',
      'positionSafe',
      'ruleEngineSafe',
      ...(limited ? ['timeLimited', 'timeLimitedUntil'] : []),
    ]);
    const names: unknown[] = limited ? (preflight.timeLimited as unknown[]) : [];
    const limitOk =
      !limited ||
      (Array.isArray(names) &&
        names.length > 0 &&
        names.every((n) => n === 'positionSafe' || n === 'declaredPositionSafe') &&
        Number.isFinite(Date.parse(String(preflight.timeLimitedUntil))));
    expect(limitOk).toBe(true);
    recordFact('preflight.timeLimited', Array.isArray(names) ? names.length : 0);
    for (const verdict of [
      'ruleEngineSafe',
      'positionSafe',
      'declaredPositionSafe',
      'linkedNamespaceSafe',
    ]) {
      expect(typeof preflight[verdict]).toBe('boolean');
      recordFact(`preflight.${verdict}`, preflight[verdict] as boolean);
    }
    expect(typeof preflight.linkedCount).toBe('number');
    recordFact('preflight.linkedCount', preflight.linkedCount as number);
    const blocking = preflight.blocking as unknown[];
    expect(Array.isArray(blocking)).toBe(true);
    for (const b of blocking) {
      expect(Object.keys(b as object).sort()).toEqual(['eventType', 'index']);
      expect(typeof (b as { index: unknown }).index).toBe('number');
      expect(typeof (b as { eventType: unknown }).eventType).toBe('string');
    }
    recordFact('preflight.blocking', blocking.length);
  });

  it('H-R7 notifications and ETL are enabled for the key', () => {
    expect(feature('notifications')).toBe(true);
    expect(feature('etl')).toBe(true);
  });

  it('H-R8 ETL profiles name an application; the cleanup policy names the own user (U2, U3)', async () => {
    const profiles = await rawRequest('GET', '/etl/mapping-profiles');
    expect(profiles.status).toBe(200);
    const list = profiles.json as Record<string, unknown>[];
    expect(Array.isArray(list)).toBe(true);
    expect(list.every((p) => typeof p.applicationId === 'string')).toBe(true);
    const matching = list.filter((p) => p.applicationId === h.env.namespace).length;
    recordFact('U2.profiles', list.length);
    recordFact('U2.profilesOfThisNamespace', matching);

    const policy = await rawRequest('GET', '/notifications/{ns}/cleanup-policy');
    expect(policy.status).toBe(200);
    const self = (policy.json as { user_id?: unknown }).user_id;
    expect(typeof self === 'string' && self.length > 0).toBe(true);

    const rules = await rawRequest('GET', '/notifications/{ns}/rules');
    expect(rules.status).toBe(200);
    const ruleList = Array.isArray(rules.json) ? (rules.json as Record<string, unknown>[]) : [];
    recordFact('U3.forwardingRules', ruleList.length);
    recordFact(
      'U3.selfEqualsForwardingRuleUser',
      ruleList.length > 0 && ruleList.every((r) => r.user_id === self)
    );
  });

  it('H-R9 the ws module is guarded and the worker sees the run id (U4, U5)', async () => {
    type Ctor = new (...a: unknown[]) => unknown;
    const guarded = (await import('ws')) as unknown as { WebSocket: Ctor; default: Ctor };
    const actual = await vi.importActual<{ WebSocket: Ctor }>('ws');
    expect(guarded.WebSocket).not.toBe(actual.WebSocket);
    expect(Object.getPrototypeOf(guarded.WebSocket)).toBe(actual.WebSocket);
    expect(guarded.default).toBe(guarded.WebSocket);
    await expectGuardViolation('G16', async () => {
      new guarded.WebSocket('wss://foreign.invalid/api/ws/subscriber');
    });
    recordFact('U4.wsModuleGuarded', true);

    const setupEnv = readJsonFileSync<{ runId?: unknown }>(join(stateDir(), 'env.json'), {});
    const workerRunId = process.env.RTLS_IT_RUN_ID;
    expect(workerRunId === h.runId && setupEnv.runId === h.runId).toBe(true);
    recordFact('U5.workerRunIdEqualsSetup', workerRunId === setupEnv.runId);
  });

  it('H-R10 a request to the RFC 5737 address fails without a response before 30 s (U9)', async () => {
    const violationsBefore = h.violations().length;
    const sent = spyOnSends(h);
    const started = Date.now();
    try {
      await expect(
        guardedFetch(`${UNREACHABLE_BASE_URLS.blackhole}/health`, {
          headers: { 'X-API-Key': DUMMY_API_KEY },
        })
      ).rejects.toBeInstanceOf(Error);
    } finally {
      sent.restore();
    }
    const elapsed = Date.now() - started;
    recordFact('U9.blackholeRejectMs', elapsed);
    expect(elapsed).toBeLessThan(30_000);
    expect(sent.hosts).toEqual([new URL(UNREACHABLE_BASE_URLS.blackhole).host]);
    expect(h.violations().length).toBe(violationsBefore);
  }, 45_000);
});

describeLive(
  'W',
  'sweep',
  () => {
    it('H-W1 creates one test asset, sweeps it and verifies it is gone (U6)', async () => {
      const h = getHarness();
      const asset = await createTestAsset(0, 'sweep');
      recordFact('U6.createStatus', asset.status);
      recordFact('U6.createContentType', asset.contentType);
      expect(asset.status).toBe(201);
      expect(asset.body).toBe('Created');

      const found = await sweep({ check: true, runId: h.runId, force: true });
      expect(found.residue).toEqual([{ target: 'assets', id: asset.mac }]);

      const removed = await sweep({ check: false, runId: h.runId, force: true });
      expect(removed.removed).toBe(1);
      expect(removed.residue).toEqual([]);
      const deletes = requestLog().filter(
        (e) => e.method === 'DELETE' && e.template === '/assets/{app_namespace}/{mac_address}'
      );
      // U6: the observed delete shape is recorded for P1 and P2; the harness accepts any 2xx (P0 §5.2).
      expect(deletes).toHaveLength(1);
      const deleteStatus = deletes[0]?.status ?? 0;
      const deleteHeaders = deletes[0]?.responseHeaders ?? {};
      recordFact('U6.deleteStatus', deleteStatus);
      recordFact('U6.deleteContentType', deleteHeaders['content-type'] ?? null);
      recordFact(
        'U6.deleteContentLength',
        deleteHeaders['content-length'] === undefined
          ? null
          : Number(deleteHeaders['content-length'])
      );
      expect(deleteStatus >= 200 && deleteStatus < 300).toBe(true);

      const gone = await rawRequest('GET', `/assets/{ns}/${asset.mac}`);
      expect(gone.status).toBe(404);
      expect(gone.text).toBe('');
      recordFact('U6.getUnknownContentType', gone.headers.get('content-type'));

      const again = await rawRequest('DELETE', `/assets/{ns}/${asset.mac}`);
      recordFact('U6.deleteUnknownStatus', again.status);
      recordFact('U6.deleteUnknownBodyIs404NotFound', again.text === '404 Not Found\r\n');
      recordFact('U6.deleteUnknownContentType', again.headers.get('content-type'));

      // The registered cleanup no-ops: its DELETE answers 404, which counts as done.
      const cleanup = await runCleanup();
      expect(cleanup).toEqual({ done: 1, failed: [] });
    });
  },
  { ruleEngine: true }
);
