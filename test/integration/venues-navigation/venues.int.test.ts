/**
 * Live tests of `client.venues` (P4 spec §9.2), tier R, filter mode SERVER (O1). No writes; nothing logs a body.
 */
import { beforeAll, expect, it } from 'vitest';
import {
  AbortError,
  ContextError,
  NetworkError,
  TimeoutError,
  ValidationError,
  filters,
} from '../../../src';
import {
  createUnreachableClient,
  denyAll,
  describeLive,
  expectKnownServerIssue,
  testName,
  withRequestGuard,
} from '../harness';
import {
  discoverVenue,
  presentOrSkip,
  routeFixture,
  settle,
  type RouteFixture,
  type VenueDiscovery,
} from './discovery';

/** node_type values seen on Demo Factory by P4-T1 (run e9e58cab) */
const LIVE_NODE_TYPES = new Set(['waypoint', 'entrance']);

describeLive('R', 'venues', () => {
  let d: VenueDiscovery;
  let route: RouteFixture;

  beforeAll(async () => {
    d = await discoverVenue();
    route = routeFixture(d.nodes, d.segments);
  });

  it('list: typed items, no location/metadata, namespace override and legacy form', async () => {
    const items = await d.client.venues.list();
    const wellTyped = items.every(
      (v) =>
        Number.isInteger(v.id) &&
        typeof v.name === 'string' &&
        Number.isFinite(v.coordinates.lat) &&
        Number.isFinite(v.coordinates.lng) &&
        [
          v.statistics.zones,
          v.statistics.pois,
          v.statistics.pathNodes,
          v.statistics.pathSegments,
        ].every((n) => typeof n === 'number')
    );
    expect(items.length).toBeGreaterThanOrEqual(1);
    expect(wellTyped, 'venue items typed').toBe(true);
    await expectKnownServerIssue('USI-P4-1', 'venue list items carry no location or metadata', () =>
      expect(
        items.every((v) => !('location' in v) && !('metadata' in v)),
        'no location/metadata'
      ).toBe(true)
    );
    const ids = items.map((v) => String(v.id));
    const byOption = await d.client.venues.list({ namespace: d.namespace });
    const byLegacy = await d.client.venues.list(d.namespace);
    expect(byOption.map((v) => String(v.id))).toEqual(ids);
    expect(byLegacy.map((v) => String(v.id))).toEqual(ids);
  });

  it('list filters: name equality on the server', async () => {
    const name = d.venue.name;
    const hit = await d.client.venues.list({ filters: filters.equals('name', name) });
    const none = await d.client.venues.list({
      filters: filters.equals('name', testName('none')),
    });
    expect(hit.length).toBeGreaterThanOrEqual(1);
    expect(
      hit.every((v) => v.name === name),
      'all names equal'
    ).toBe(true);
    expect(none).toEqual([]);
  });

  it('iterate: same ids as list, one request', async () => {
    const seen: string[] = [];
    for await (const v of d.client.venues.iterate()) seen.push(String(v.id));
    const legacy: string[] = [];
    for await (const v of d.client.venues.iterate(d.namespace)) legacy.push(String(v.id));
    const ids = (await d.client.venues.list()).map((v) => String(v.id));
    expect(seen).toEqual(ids);
    expect(legacy).toEqual(ids);
  });

  it('get: details of the discovered venue; unknown id answers the stub (USI-P4-2)', async () => {
    const v = await d.client.venues.get();
    const hours = v.metadata?.openingHours;
    const hoursOk =
      hours === undefined ||
      Object.values(hours.week).every((s) => /^\d\d:\d\d - \d\d:\d\d$|^Closed$/.test(s));
    expect(String(v.id)).toBe(String(d.venue.id));
    expect(v.name).toBe(d.venue.name);
    expect(hoursOk, 'opening hours format').toBe(true);
    const r = await d.client.venues.get({ venueId: 999999999 });
    await expectKnownServerIssue('USI-P4-2', 'unknown venue id answers 200 with a stub', () =>
      expect(
        r.id === 999999999 && r.name === undefined && r.statistics?.pathNodes === 0,
        'stub body'
      ).toBe(true)
    );
  });

  it('listMaps: typed maps, tile template, lat-first bounds, level filter', async () => {
    const maps = await d.client.venues.listMaps();
    const typed = maps.every(
      (m) =>
        Number.isInteger(m.id) &&
        typeof m.uuid === 'string' &&
        Number.isInteger(m.level) &&
        ['{z}', '{x}', '{y}'].every((t) => m.tiles_url_base.includes(t))
    );
    const latFirst = maps.every((m) => Math.abs(m.map_bounds[0][0] - d.venue.coordinates.lat) < 1);
    const level = d.maps[0]?.level ?? 0;
    const onLevel = await d.client.venues.listMaps({ level });
    expect(maps.length).toBeGreaterThanOrEqual(1);
    expect(typed, 'maps typed with tile template').toBe(true);
    expect(latFirst, 'map_bounds lat first').toBe(true);
    expect(onLevel.length).toBeGreaterThanOrEqual(1);
    expect(
      onLevel.every((m) => m.level === level),
      'every map on the level'
    ).toBe(true);
  });

  it('listPois / listPoisAsArray: collection, never-matching tag, level filter', async () => {
    const col = await d.client.venues.listPois();
    const flat = await d.client.venues.listPoisAsArray();
    const none = await d.client.venues.listPois({ tag: testName('none') });
    const level = route.A.level;
    const onLevel = await d.client.venues.listPois({ level });
    expect(col.type).toBe('FeatureCollection');
    expect(Array.isArray(col.features), 'features array').toBe(true);
    expect(flat.length).toBe(col.features.filter((f) => f.geometry !== null).length);
    expect(none.features).toEqual([]);
    expect(none.total).toBe(0);
    expect(
      onLevel.features.every((f) => f.properties.level === level),
      'every POI on the level'
    ).toBe(true);
    expect(onLevel.total).toBe(onLevel.features.length);
  });

  it('listPois with POIs: Point geometry, required keys, tag filter', async (ctx) => {
    const tag = presentOrSkip(
      ctx,
      d.pois.length > 0 ? d.poiTag : undefined,
      'Demo Factory has no (tagged) POI (P4-T1: 0 POI features)'
    );
    const col = await d.client.venues.listPois();
    const tagged = await d.client.venues.listPois({ tag });
    const shaped = col.features.every(
      (f) => f.geometry?.type === 'Point' && ['id', 'name', 'level'].every((k) => k in f.properties)
    );
    const near = d.pois.every(
      (p) =>
        Math.abs(p.lat - d.venue.coordinates.lat) < 1 &&
        Math.abs(p.lng - d.venue.coordinates.lng) < 1
    );
    expect(col.features.length).toBeGreaterThanOrEqual(1);
    expect(shaped, 'POI features shaped').toBe(true);
    expect(near, 'POIs within 1 degree of the venue').toBe(true);
    expect(
      tagged.features.every((f) => (f.properties.tags ?? []).includes(tag)),
      'every POI carries the tag'
    ).toBe(true);
    expect(typeof tagged.total).toBe('number');
  });

  it('listPaths: geometry kinds, level filter, nodeType filter', async () => {
    const all = await d.client.venues.listPaths();
    const level = route.A.level;
    const byLevel = await d.client.venues.listPaths({ level });
    const nodeType = route.A.nodeType;
    const byType = await d.client.venues.listPaths({ nodeType });
    expect(
      all.features.every((f) => f.geometry?.type === 'Point' || f.geometry?.type === 'LineString'),
      'Point/LineString only'
    ).toBe(true);
    expect(byLevel.features.length).toBeGreaterThanOrEqual(1);
    expect(
      byLevel.features.every((f) => f.properties.level === level),
      'every feature on the level'
    ).toBe(true);
    expect(byType.features.length).toBeGreaterThanOrEqual(1);
    expect(
      byType.features.every(
        (f) => f.properties.type === 'path_node' && f.properties.node_type === nodeType
      ),
      'only nodes of the type'
    ).toBe(true);
  });

  it('listPathNodes: live node types, finite coordinates, boolean isActive', async () => {
    const nodes = await d.client.venues.listPathNodes();
    expect(nodes.length).toBeGreaterThanOrEqual(4);
    expect(
      nodes.every(
        (n) =>
          LIVE_NODE_TYPES.has(n.nodeType) &&
          Number.isFinite(n.lat) &&
          Number.isFinite(n.lng) &&
          typeof n.isActive === 'boolean'
      ),
      'nodes typed'
    ).toBe(true);
  });

  it('listPathSegments: wire property names map to known nodes', async () => {
    const segments = await d.client.venues.listPathSegments();
    expect(segments.length).toBeGreaterThanOrEqual(1);
    expect(
      segments.every(
        (s) =>
          d.nodeIds.has(String(s.sourceNodeId)) &&
          d.nodeIds.has(String(s.targetNodeId)) &&
          s.distance >= 0 &&
          typeof s.bidirectional === 'boolean'
      ),
      'segments reference known nodes'
    ).toBe(true);
  });

  it('listMapPois: sample-data route answers an empty {items,total} (USI-P4-6)', async () => {
    const r = await d.client.venues.listMapPois({ mapId: d.mapId });
    expect(Array.isArray(r.items), 'items array').toBe(true);
    expect(typeof r.total).toBe('number');
    await expectKnownServerIssue('USI-P4-6', 'map POIs route serves sample data only', () =>
      expect(r.items.length === 0 && r.total === 0, 'empty map POIs').toBe(true)
    );
  });

  it('legacy positional forms reach the same data', async () => {
    const ns = d.namespace;
    const id = d.venue.id;
    const got = await d.client.venues.get(ns, String(id));
    const maps = await d.client.venues.listMaps(ns, id);
    const pois = await d.client.venues.listPois(ns, id);
    const flatPois = await d.client.venues.listPoisAsArray(ns, id);
    const paths = await d.client.venues.listPaths(ns, id);
    const nodes = await d.client.venues.listPathNodes(ns, id);
    const segments = await d.client.venues.listPathSegments(ns, id);
    const mapPois = await d.client.venues.listMapPois(ns, id, String(d.mapId));
    const trailing = await d.client.venues.get({}, { timeoutMs: 30_000 });
    expect(String(got.id)).toBe(String(id));
    expect(String(trailing.id)).toBe(String(id));
    expect(maps.map((m) => m.id)).toEqual(d.maps.map((m) => m.id));
    expect(pois.type).toBe('FeatureCollection');
    expect(flatPois.length).toBe(d.pois.length);
    expect(paths.features.length).toBe(d.nodes.length + d.segments.length);
    expect(nodes.length).toBe(d.nodes.length);
    expect(segments.length).toBe(d.segments.length);
    expect(mapPois.total).toBe(0);
  });

  it('errors: network, timeout, abort, invalid context id', async () => {
    const unreachable = createUnreachableClient({ target: 'refused' });
    const net = await settle(
      unreachable.venues.get({ namespace: d.namespace, venueId: d.venue.id })
    );
    const timeout = await settle(d.client.venues.list({ timeoutMs: 1 }));
    const controller = new AbortController();
    controller.abort();
    const aborted = await settle(d.client.venues.list({ signal: controller.signal }));
    const invalid = await withRequestGuard(denyAll, () =>
      d.client.venues.get({ venueId: 'x' as never })
    );
    expect(net.error).toBeInstanceOf(NetworkError);
    expect(timeout.error).toBeInstanceOf(TimeoutError);
    expect(aborted.error).toBeInstanceOf(AbortError);
    expect(invalid.error).toBeInstanceOf(ContextError);
    expect((invalid.error as ContextError).problem).toBe('invalid');
    expect(invalid.attempts).toHaveLength(0);
  });

  it('local argument errors send no request', async () => {
    const ns = d.namespace;
    const cases: Array<() => Promise<unknown>> = [
      () => d.client.venues.get(ns, 'x'),
      () => d.client.venues.get(ns, '1.5'),
      () => d.client.venues.get(ns, '-1'),
      () => d.client.venues.listMapPois(ns, d.venue.id, 'x'),
      () => d.client.venues.listMaps({ level: 0.5 }),
    ];
    const results = [];
    for (const run of cases) results.push(await withRequestGuard(denyAll, run));
    expect(
      results.every((r) => r.error instanceof ContextError || r.error instanceof ValidationError),
      'local error class'
    ).toBe(true);
    expect(results.flatMap((r) => r.attempts)).toHaveLength(0);
  });
});
