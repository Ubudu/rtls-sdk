/**
 * Live tests of `client.navigation` (P4 spec §9.4), tier R. Every navigation assertion is a boolean with a fixed
 * label, so no route data is ever printed; the coordinate route is retried once for valid input (USI-P4-17).
 * `accessiblePath` runs only through its two local guards (§9.4 N2 live policy, allowlist P4-1).
 */
import { beforeAll, expect, it } from 'vitest';
import {
  ContextError,
  NotFoundError,
  RtlsError,
  ServerError,
  ValidationError,
  type NavigationFailureBody,
  type RouteNode,
  type RouteResult,
  type TspAlgorithm,
} from '../../../src';
import {
  createLiveClient,
  denyAll,
  describeLive,
  expectKnownServerIssue,
  recordFact,
  testName,
  withRequestGuard,
} from '../harness';
import {
  close,
  discoverVenue,
  presentOrSkip,
  routeFixture,
  settle,
  type RouteFixture,
  type VenueDiscovery,
} from './discovery';

const MULTI = { timeoutMs: 60_000 };
const sameId = (node: RouteNode | undefined, id: number | string): boolean =>
  node !== undefined && String(node.id) === String(id);
const finiteCoords = (path: RouteNode[]): boolean =>
  path.every((n) => n.coordinates.length === 2 && n.coordinates.every(Number.isFinite));

describeLive('R', 'navigation', () => {
  let d: VenueDiscovery;
  let r: RouteFixture;
  let forward: RouteResult;
  const inNodeSet = (path: RouteNode[]): boolean =>
    path.every((n) => n.id === null || d.nodeIds.has(String(n.id)));

  beforeAll(async () => {
    d = await discoverVenue();
    r = routeFixture(d.nodes, d.segments);
  });

  it('shortestPath by ids: A to D, haversine distance, default speed, known nodes', async () => {
    forward = await d.client.navigation.shortestPath({ start: r.A.id, end: r.D.id });
    const path = forward.path;
    expect(forward.success, 'success').toBe(true);
    expect(sameId(path[0], r.A.id), 'path starts at A').toBe(true);
    expect(sameId(path[path.length - 1], r.D.id), 'path ends at D').toBe(true);
    expect(forward.distance > 0, 'distance positive').toBe(true);
    expect(close(forward.estimatedTime, forward.distance / 1.2), 'time = distance / 1.2').toBe(
      true
    );
    expect(forward.algorithm === 'astar', 'algorithm astar').toBe(true);
    expect(forward.dataSource === 'real', 'dataSource real').toBe(true);
    expect(finiteCoords(path), 'finite coordinates').toBe(true);
    expect(inNodeSet(path), 'every path id in the node set').toBe(true);
  });

  it('shortestPath walkingSpeed 2', async () => {
    const res = await d.client.navigation.shortestPath({
      start: r.A.id,
      end: r.D.id,
      walkingSpeed: 2,
    });
    expect(close(res.estimatedTime, res.distance / 2), 'time = distance / 2').toBe(true);
  });

  it('shortestPath returnToStart: path comes back to A, distance includes the return', async () => {
    const res = await d.client.navigation.shortestPath({
      start: r.A.id,
      end: r.D.id,
      returnToStart: true,
    });
    const rt = res.roundTripInfo;
    // P4-T1: Demo Factory has no one-way segment, so a return path always exists and roundTripInfo is present
    const ok =
      rt !== undefined &&
      rt.returnDistance > 0 &&
      sameId(res.path[res.path.length - 1], r.A.id) &&
      close(res.distance, forward.distance + rt.returnDistance);
    expect(ok, 'round trip').toBe(true);
  });

  it('shortestPath by coordinates snaps to A and D (one retry, O8)', async () => {
    const request = {
      start: { lat: r.A.lat, lon: r.A.lng, level: r.A.level },
      end: { lat: r.D.lat, lon: r.D.lng, level: r.D.level },
    };
    let outcome = await settle(d.client.navigation.shortestPath(request));
    const transient = (e: unknown): boolean =>
      e instanceof NotFoundError || e instanceof ServerError;
    if (transient(outcome.error)) {
      await new Promise((resolve) => setTimeout(resolve, 1_000));
      outcome = await settle(d.client.navigation.shortestPath(request));
    }
    const path = outcome.value?.path ?? [];
    expect(outcome.error === undefined, 'coordinate route answered').toBe(true);
    expect(sameId(path[0], r.A.id), 'path starts at A').toBe(true);
    expect(sameId(path[path.length - 1], r.D.id), 'path ends at D').toBe(true);
  });

  it('shortestPath unknown node answers 500 (USI-P4-10)', async () => {
    const { error } = await settle(
      d.client.navigation.shortestPath({ start: r.A.id, end: testName('none') })
    );
    expect(error).toBeInstanceOf(ServerError);
    expect(
      /^End node .+ not found$/.test((error as ServerError).message),
      'End node not found message'
    ).toBe(true);
    await expectKnownServerIssue('USI-P4-10', 'unknown node id answers 500', () =>
      expect((error as ServerError).status, 'status').toBe(500)
    );
  });

  it('shortestPath from a point far from every node answers 404', async () => {
    const { error } = await settle(
      d.client.navigation.shortestPath({
        start: {
          lat: d.venue.coordinates.lat + 0.05,
          lon: d.venue.coordinates.lng,
          level: r.A.level,
        },
        end: r.D.id,
      })
    );
    expect(error).toBeInstanceOf(NotFoundError);
    const e = error as NotFoundError;
    expect(/^No node found near start position/.test(e.message), 'snap message').toBe(true);
    expect((e.body as NavigationFailureBody).success === false, 'body.success false').toBe(true);
  });

  it('local guards: missing venue, zero start coordinate, accessiblePath validation', async () => {
    const noVenue = createLiveClient();
    const results = [
      await withRequestGuard(denyAll, () =>
        noVenue.navigation.shortestPath({ start: r.A.id, end: r.B.id })
      ),
      await withRequestGuard(denyAll, () =>
        d.client.navigation.shortestPath({ start: { lat: 0, lon: 1 }, end: r.B.id })
      ),
      await withRequestGuard(denyAll, () =>
        d.client.navigation.accessiblePath({ start: '', end: r.B.id })
      ),
      await withRequestGuard(denyAll, () =>
        noVenue.navigation.accessiblePath(
          { start: r.A.id, end: r.B.id },
          { venueId: undefined, namespace: d.namespace }
        )
      ),
    ];
    const [missing, zero, blank, accessibleMissing] = results;
    expect(missing?.error).toBeInstanceOf(ContextError);
    expect(zero?.error).toBeInstanceOf(ValidationError);
    expect(blank?.error).toBeInstanceOf(ValidationError);
    expect(accessibleMissing?.error).toBeInstanceOf(ContextError);
    expect(results.flatMap((x) => x.attempts)).toHaveLength(0);
  });

  it('local argument validation of every navigation method sends no request', async () => {
    const nav = d.client.navigation;
    const B = r.B.id;
    const cases: Array<() => Promise<unknown>> = [
      () => nav.shortestPath({ start: '  ', end: B }),
      () => nav.shortestPath({ start: Number.NaN, end: B }),
      () => nav.shortestPath({ start: { lat: 91, lon: 1 }, end: B }),
      () => nav.shortestPath({ start: { lat: 1, lon: 181 }, end: B }),
      () => nav.shortestPath({ start: { lat: 1, lon: 'x' as never }, end: B }),
      () => nav.shortestPath({ start: { lat: 1, lon: 2, level: 0.5 }, end: B }),
      () => nav.shortestPath({ start: { x: 1 } as never, end: B }),
      () => nav.shortestPath({ start: B } as never),
      () => nav.shortestPath({ start: { lat: 2, lon: 0 }, end: B }),
      () => nav.shortestPath({ start: r.A.id, end: B, walkingSpeed: 0 }),
      () => nav.shortestPath({ start: r.A.id, end: B, walkingSpeed: -1 }),
      () => nav.shortestPath({ start: r.A.id, end: B, walkingSpeed: Number.NaN }),
      () => nav.accessiblePath({ start: { lat: 0, lon: 2 }, end: B }),
      () => nav.shortestPath(null as never),
      () => nav.multiStop(null as never, MULTI),
      () => nav.multiStop({ start: r.A.id, stops: [] }, MULTI),
      () => nav.multiStop({ start: r.A.id, stops: 'x' as never }, MULTI),
      () => nav.multiStop({ start: r.A.id, stops: [''] }, MULTI),
      () => nav.multiStop({ start: r.A.id, stops: [B], stopNames: ['a', 'b'] }, MULTI),
      () => nav.multiStop({ start: r.A.id, stops: [B], walkingSpeed: 0 }, MULTI),
      () => nav.nearestPoi(r.A.id, { poiType: '' }),
      () => nav.nearestPoi(r.A.id, { poiType: '  ' }),
      () => nav.nearestPoi(r.A.id, {} as never),
      () => nav.nearestPoi('', { poiType: 'all' }),
      () => nav.evacuationRoute(''),
    ];
    const results = [];
    for (const run of cases) results.push(await withRequestGuard(denyAll, run));
    const noVenue = createLiveClient();
    const contextCases = [
      await withRequestGuard(denyAll, () =>
        noVenue.navigation.multiStop({ start: r.A.id, stops: [B] })
      ),
      await withRequestGuard(denyAll, () =>
        noVenue.navigation.nearestPoi(r.A.id, { poiType: 'all' })
      ),
      await withRequestGuard(denyAll, () => noVenue.navigation.evacuationRoute(r.A.id)),
    ];
    expect(
      results.every((x) => x.error instanceof ValidationError),
      'ValidationError for every invalid argument'
    ).toBe(true);
    expect(
      contextCases.every((x) => x.error instanceof ContextError),
      'ContextError without venue'
    ).toBe(true);
    expect([...results, ...contextCases].flatMap((x) => x.attempts)).toHaveLength(0);
  });

  it('multiStop sequential: stops in input order on the A to D path', async () => {
    const res = await d.client.navigation.multiStop(
      { start: r.A.id, stops: [r.B.id, r.C.id, r.D.id], optimizeOrder: false },
      MULTI
    );
    const indexes = res.path.filter((n) => n.isStop === true).map((n) => n.stopIndex);
    expect(sameId(res.path[0], r.A.id), 'path starts at A').toBe(true);
    expect(indexes.join(',') === '1,2,3', 'stopIndex sequence 1,2,3').toBe(true);
    expect(
      res.multiStopInfo.optimized === false &&
        res.multiStopInfo.stopCount === 3 &&
        res.multiStopInfo.algorithm === undefined,
      'sequential multiStopInfo'
    ).toBe(true);
    expect(inNodeSet(res.path), 'every path id in the node set').toBe(true);
  });

  it('multiStop optimised with each offered algorithm', async () => {
    const algorithms: TspAlgorithm[] = ['twoOpt', 'nearestNeighbor', 'simulatedAnnealing'];
    const checks: boolean[] = [];
    for (const algorithm of algorithms) {
      const res = await d.client.navigation.multiStop(
        { start: r.A.id, stops: [r.B.id, r.C.id, r.D.id], algorithm },
        MULTI
      );
      const indexes = new Set(res.path.filter((n) => n.isStop === true).map((n) => n.stopIndex));
      checks.push(
        indexes.size === 3 &&
          [1, 2, 3].every((i) => indexes.has(i)) &&
          res.multiStopInfo.algorithm === algorithm &&
          (res.multiStopInfo.optimizationDistance ?? 0) > 0
      );
    }
    expect(checks.every(Boolean), 'every algorithm visits stops 1..3 and echoes').toBe(true);
  });

  it('multiStop genetic fails (USI-P4-13)', async () => {
    const { error } = await settle(
      d.client.navigation.multiStop(
        { start: r.A.id, stops: [r.B.id, r.C.id, r.D.id], algorithm: 'genetic' as never },
        MULTI
      )
    );
    // live (runs 63de8199, 60fd2053): 404 whose message contains the phrase inside a longer text
    recordFact('P4.genetic.status', error instanceof RtlsError ? error.status : -1);
    await expectKnownServerIssue('USI-P4-13', 'genetic multi-stop algorithm fails', () =>
      expect(
        error instanceof NotFoundError &&
          /TSPSolver\.genetic is not a function/.test(error.message),
        'genetic 404'
      ).toBe(true)
    );
  });

  it('multiStop round trip ends at A; returnDistance is 0 with optimizeOrder (USI-P4-13)', async () => {
    const res = await d.client.navigation.multiStop(
      { start: r.A.id, stops: [r.B.id, r.D.id], optimizeOrder: true, returnToStart: true },
      MULTI
    );
    expect(sameId(res.path[res.path.length - 1], r.A.id), 'path ends at A').toBe(true);
    await expectKnownServerIssue(
      'USI-P4-13',
      'returnDistance is 0 with optimizeOrder and returnToStart',
      () =>
        expect(res.multiStopInfo.roundTripInfo?.returnDistance === 0, 'returnDistance 0').toBe(true)
    );
  });

  it('multiStop unknown stop answers 404', async () => {
    const { error } = await settle(
      d.client.navigation.multiStop({ start: r.A.id, stops: [testName('none')] }, MULTI)
    );
    expect(error).toBeInstanceOf(NotFoundError);
    expect(/^Node .+ not found$/.test((error as NotFoundError).message), 'Node not found').toBe(
      true
    );
  });

  it("nearestPoi 'all': a POI route, or 404 when no POI node is indexed (USI-P4-14)", async () => {
    const out = await settle(d.client.navigation.nearestPoi(r.A.id, { poiType: 'all' }));
    const v = out.value;
    const ok200 =
      v !== undefined &&
      typeof v.poi.id === 'string' &&
      v.poi.coordinates.every(Number.isFinite) &&
      v.distance >= 0 &&
      (v.path === null || Array.isArray(v.path));
    const no404 =
      out.error instanceof NotFoundError && /^No POIs of type .+ found$/.test(out.error.message);
    recordFact('P4.nearestPoi.all.status', ok200 ? 200 : no404 ? 404 : -1);
    await expectKnownServerIssue('USI-P4-14', 'nearest-POI finds no POI node', () =>
      expect(ok200 || no404, 'POI route or no-POI 404').toBe(true)
    );
  });

  it('nearestPoi by the first POI tag', async (ctx) => {
    const poiType = presentOrSkip(
      ctx,
      d.poiTag,
      'Demo Factory has no tagged POI (P4-T1: 0 POI features)'
    );
    const out = await settle(d.client.navigation.nearestPoi(r.A.id, { poiType }));
    const ok200 = out.value !== undefined && typeof out.value.poi.id === 'string';
    const no404 =
      out.error instanceof NotFoundError && /^No POIs of type .+ found$/.test(out.error.message);
    await expectKnownServerIssue('USI-P4-14', 'nearest-POI finds no POI node', () =>
      expect(ok200 || no404, 'POI route or no-POI 404').toBe(true)
    );
  });

  it('nearestPoi from an unknown node answers 404', async () => {
    const { error } = await settle(
      d.client.navigation.nearestPoi(testName('none'), { poiType: 'all' })
    );
    expect(error).toBeInstanceOf(NotFoundError);
    expect(/^Node .+ not found$/.test((error as NotFoundError).message), 'Node not found').toBe(
      true
    );
  });

  it('evacuationRoute: an exit route, or a critical 404 (USI-P4-15)', async () => {
    const out = await settle(d.client.navigation.evacuationRoute(r.A.id));
    const v = out.value;
    const ok200 =
      v !== undefined && v.emergency === true && close(v.estimatedEvacuationTime, v.distance / 2);
    const critical404 =
      out.error instanceof NotFoundError &&
      (out.error.body as NavigationFailureBody).critical === true;
    recordFact('P4.evacuation.status', ok200 ? 200 : critical404 ? 404 : -1);
    await expectKnownServerIssue('USI-P4-15', 'evacuation finds no exit', () =>
      expect(ok200 || critical404, 'exit route or critical 404').toBe(true)
    );
  });
});
