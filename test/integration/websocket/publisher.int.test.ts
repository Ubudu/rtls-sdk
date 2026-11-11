// Live tier-S suite of the WebSocket publisher (spec P8 §9.4, LT-S1 and LT-S2): 2 positions on the test MACs
// A = testMac(51) and B = testMac(52) of P8's block 50–59 (C = testMac(53) is never published). The block declares
// `positions: 'publish'`, so a false preflight verdict skips it with reason `preflight`; the local zone-0 rule
// guard (geometry.ts) is a cross-check that can only add a skip. W admits the conditional asset-delete cleanup.
// X, Y1, Y2 and P are shared by every test of the file, so there is no per-test socket cleanup here: the teardown
// test and afterAll close them.
import { afterAll, beforeAll, expect, it } from 'vitest';
import {
  classifyMessage,
  RtlsWebSocketPublisher,
  RtlsWebSocketSubscriber,
  SubscriptionType,
  type PositionMessage,
  type WebSocketSubscriberConfig,
  type ZoneEntryExitMessage,
  type ZoneStatsMessage,
} from '../../../src';
import { formatMac } from '../../../src/utils/mac';
import {
  activeHarness,
  describeLive,
  DiscoveryError,
  expectKnownServerIssue,
  liveEnv,
  rawRequest,
  recordFact,
  registerCleanup,
  testMac,
} from '../harness';
import { validateMessage } from '../../websocket/support/validators';
import { zoneZeroRuleGuard } from './geometry';
import {
  cleanupSockets,
  discover,
  GuardedWs,
  recordUrl,
  safePublishPoint,
  skipTest,
  sleep,
  socketMark,
  socketsSince,
  standaloneConfig,
  track,
  waitFor,
} from './support';

type WsImpl = NonNullable<WebSocketSubscriberConfig['WebSocket']>;
const PUBLISH_KEYS = ['app_namespace', 'user_uuid', 'lat', 'lon', 'map_uuid', 'timestamp'];

describeLive(
  'S',
  'websocket publisher',
  () => {
    const A = testMac(51);
    const B = testMac(52);
    const C = testMac(53);
    let skipReason: string | null = null;
    let s1Aborted = false;
    let positionsBefore = 0;
    let mapUuid = '';
    let point = { lat: 0, lng: 0, level: 0 };
    let X: RtlsWebSocketSubscriber;
    let Y1: RtlsWebSocketSubscriber;
    let Y2: RtlsWebSocketSubscriber;
    let P: RtlsWebSocketPublisher;
    let mark = 0;
    const received = {
      x: [] as { at: number; msg: PositionMessage }[],
      y1: [] as { at: number; msg: PositionMessage }[],
      y2: [] as { at: number; msg: PositionMessage }[],
      // raw POSITIONS frames (the `message` event, before the SDK's typed-event gate) on Y1 and Y2
      rawY1: [] as { at: number; tag: unknown }[],
      rawY2: [] as { at: number; tag: unknown }[],
      zone: [] as ZoneEntryExitMessage[],
      counters: [] as ZoneStatsMessage[],
    };

    const subscriber = (): RtlsWebSocketSubscriber => {
      const { namespace, apiKey, subscriberUrl } = standaloneConfig();
      return track(
        new RtlsWebSocketSubscriber({
          namespace,
          apiKey,
          subscriberUrl,
          WebSocket: GuardedWs as unknown as WsImpl,
          reconnect: false,
        })
      );
    };
    const publisherFrames = (): Record<string, unknown>[] =>
      socketsSince(mark)
        .filter((r) => recordUrl(r).pathname.endsWith('/ws/publisher'))
        .flatMap((r) => r.frames as Record<string, unknown>[]);
    const framesOf = (index: number): Record<string, unknown>[] =>
      (socketsSince(mark)[index]?.frames ?? []) as Record<string, unknown>[];

    beforeAll(async () => {
      positionsBefore = activeHarness().processCounts.positions;
      // 9.1 steps 1–3: discovery and the safe publish point (harness)
      let discovery;
      try {
        discovery = await discover();
      } catch (error) {
        if (!(error instanceof DiscoveryError)) throw error;
        skipReason = 'no map';
        return;
      }
      const safe = safePublishPoint(discovery);
      if (safe === null) {
        skipReason = 'no safe publish point';
        return;
      }
      mapUuid = discovery.mapUuid;
      point = safe;
      // 9.1 step 6: the local zone-0 rule guard (cross-check; never logged or stored). Its time_in_zone leaf counts
      // only while the shared positionSafe verdict is itself time-limited (geometry.ts).
      const rules = await rawRequest('GET', '/alert_rules/{ns}');
      const timeInZone =
        activeHarness().preflight()?.timeLimited?.includes('positionSafe') === true;
      const verdict = zoneZeroRuleGuard(rules.json, { timeInZone });
      recordFact('websocket.ruleGuard.timeInZone', timeInZone);
      recordFact('websocket.ruleGuard.safe', verdict.safe);
      recordFact('websocket.ruleGuard.mayMatch', verdict.mayMatch.length);
      if (!verdict.safe) {
        skipReason = 'an enabled alert rule may match a zone-0 test position';
        return;
      }
      // existing-entity guard: no cached position and no asset record for A and B
      for (const mac of [A, B]) {
        const cached = await rawRequest('GET', `/cache/{ns}/positions/${mac}`);
        const asset = await rawRequest('GET', `/assets/{ns}/${mac}`);
        if (cached.status !== 404 || cached.text !== '' || asset.status !== 404) {
          skipReason = 'test MAC already in use';
          return;
        }
      }
      // sockets X, Y1, Y2 and P
      mark = socketMark();
      X = subscriber();
      Y1 = subscriber();
      Y2 = subscriber();
      const { namespace, apiKey, publisherUrl } = standaloneConfig();
      P = track(
        new RtlsWebSocketPublisher({
          namespace,
          apiKey,
          publisherUrl,
          mapUuid,
          WebSocket: GuardedWs as unknown as WsImpl,
          reconnect: false,
        })
      );
      X.on('POSITIONS', (msg) => received.x.push({ at: Date.now(), msg }));
      Y1.on('POSITIONS', (msg) => received.y1.push({ at: Date.now(), msg }));
      Y2.on('POSITIONS', (msg) => received.y2.push({ at: Date.now(), msg }));
      Y1.on('message', (m) => {
        if (classifyMessage(m) === 'POSITIONS')
          received.rawY1.push({ at: Date.now(), tag: (m as { user_uuid?: unknown }).user_uuid });
      });
      Y2.on('message', (m) => {
        if (classifyMessage(m) === 'POSITIONS')
          received.rawY2.push({ at: Date.now(), tag: (m as { user_uuid?: unknown }).user_uuid });
      });
      X.on('ZONES_ENTRIES_EVENTS', (msg) => received.zone.push(msg));
      X.on('ZONE_STATS_EVENTS', (msg) => received.counters.push(msg));
      await Promise.all([X.connect(), Y1.connect(), Y2.connect()]);
      await X.subscribe({
        types: [
          SubscriptionType.POSITIONS,
          SubscriptionType.ZONES_ENTRIES_EVENTS,
          SubscriptionType.ZONE_STATS_EVENTS,
        ],
        uuids: [A],
      });
      await Y1.subscribe({ types: [SubscriptionType.POSITIONS], uuids: [A, B] });
      await Y2.subscribe({ types: [SubscriptionType.POSITIONS], uuids: [A, B] });
      await P.connect();
    }, 60_000);

    afterAll(async () => {
      // safety net: every socket closed even when a test failed before the teardown test
      await cleanupSockets();
    }, 30_000);

    it('LT-S1 one position: the minimal frame reaches every subscriber unchanged', async (ctx) => {
      if (skipReason !== null) skipTest(ctx, skipReason);
      const ns = liveEnv().namespace;
      const sentAt = Date.now();
      await expect(
        P.sendPosition({ macAddress: formatMac(A), latitude: point.lat, longitude: point.lng })
      ).resolves.toEqual({ success: true });
      const frames = publisherFrames();
      expect(frames).toHaveLength(1);
      const frame = frames[0] as Record<string, unknown>;
      expect(Object.keys(frame)).toEqual(PUBLISH_KEYS);
      expect(frame.user_uuid).toBe(A);

      const forA = (list: { at: number; msg: PositionMessage }[]) =>
        list.filter((e) => e.at >= sentAt && e.msg.user_uuid === A);
      expect(await waitFor(() => forA(received.x).length > 0, 10_000)).toBe(true);
      const pos = (forA(received.x)[0] as { msg: PositionMessage }).msg;
      s1Aborted = pos.zone?.id !== 0;
      expect(pos.zone.id).toBe(0);
      expect(pos.zone.name).toBe('OUTSIDE_ALL_ZONES');
      expect(pos.lat).toBe(point.lat);
      expect(pos.lon).toBe(point.lng);
      expect(pos.map_uuid === mapUuid).toBe(true);
      expect(pos.app_namespace === ns).toBe(true);
      expect(pos.user_udid).toBe(A);
      expect(pos.timestamp).toBe(frame.timestamp);
      expect(pos.origin).toBe(0);
      expect(['model', 'color', 'user_name', 'device_info'].filter((k) => k in pos)).toEqual([]);
      expect(validateMessage('POSITIONS', pos)).toEqual([]);
      expect(await waitFor(() => forA(received.y1).length > 0, 10_000)).toBe(true);
      expect(await waitFor(() => forA(received.y2).length > 0, 10_000)).toBe(true);

      // zone-0 events depend on the engine's zone geometry for the map: recorded, asserted when they occur
      await sleep(Math.max(0, sentAt + 10_000 - Date.now()));
      const zoneEvents = received.zone.filter((e) => e.user_udid === A);
      const zeroCounters = received.counters.filter((c) => c.zone?.properties?.id === 0);
      recordFact('websocket.S1.zoneEnterReceived', zoneEvents.length > 0);
      recordFact('websocket.S1.zoneZeroCounterReceived', zeroCounters.length > 0);
      for (const event of zoneEvents) {
        await expectKnownServerIssue(
          'USI-P8-7',
          'zone events name the tag user_udid, positions user_uuid',
          () => {
            expect(event.event_type).toBe('ENTER_ZONE');
            expect(event.zone).toBeNull();
            expect(event.user_udid).toBe(A);
            expect('user_uuid' in event).toBe(false);
          }
        );
      }
      for (const counter of zeroCounters) {
        expect(validateMessage('ZONE_STATS_EVENTS', counter)).toEqual([]);
      }
    }, 45_000);

    it('LT-S2 one position: FILTER_MGT live and no delivery after a change (B1)', async (ctx) => {
      if (skipReason !== null) skipTest(ctx, skipReason);
      if (s1Aborted) skipTest(ctx, 'LT-S1 aborted on the zone check: no more publishes');
      const ns = liveEnv().namespace;
      const withNs = (f: Record<string, unknown>) => ({
        ...f,
        app_namespace: f.app_namespace === ns ? '<ns>' : '<other>',
      });
      const xBefore = framesOf(0).length;
      const y1Before = framesOf(1).length;
      const y2Before = framesOf(2).length;

      await X.setTagFilter([B]);
      expect(framesOf(0).slice(xBefore).map(withNs)).toEqual([
        { type: 'FILTER_MGT', app_namespace: '<ns>', uuids: [B] },
      ]);
      await Y1.subscribe({ types: [SubscriptionType.ASSETS] });
      expect(framesOf(1).slice(y1Before).map(withNs)).toEqual([
        { type: 'UNSUBSCRIBE', app_namespace: '<ns>' },
        { type: 'SUBSCRIBE', app_namespace: '<ns>', data_type_filter: ['ASSETS'], uuids: [A, B] },
      ]);
      await Y2.unsubscribe();
      expect(framesOf(2).slice(y2Before).map(withNs)).toEqual([
        { type: 'UNSUBSCRIBE', app_namespace: '<ns>' },
      ]);
      const changedAt = Date.now();
      await sleep(1_000);

      const before = publisherFrames().length;
      const sentAt = Date.now();
      const result = await P.sendBatch([
        { macAddress: B, latitude: point.lat, longitude: point.lng },
        { macAddress: C, latitude: 91, longitude: point.lng },
      ]);
      expect(result).toMatchObject({ success: false, sent: 1, failed: 1 });
      expect(result.errors).toHaveLength(1);
      expect(result.errors?.[0]?.startsWith(C)).toBe(true);
      const sent = publisherFrames().slice(before);
      expect(sent).toHaveLength(1);
      expect(Object.keys(sent[0] ?? {})).toEqual(PUBLISH_KEYS);
      expect(sent[0]?.user_uuid).toBe(B);

      const forB = () => received.x.filter((e) => e.at >= sentAt && e.msg.user_uuid === B);
      expect(await waitFor(() => forB().length > 0, 10_000)).toBe(true);
      const receiptAt = (forB()[0] as { at: number }).at;
      await sleep(Math.max(0, receiptAt + 3_000 - Date.now()));
      // B1 live: the broker itself stops delivering B's position to Y1 (re-subscribed to ASSETS) and Y2
      // (unsubscribed). The raw frames are counted, since the SDK's typed-event gate would hide a delivery.
      const rawForB = (list: { at: number; tag: unknown }[]) =>
        list.filter((e) => e.at >= changedAt && e.tag === B);
      expect(rawForB(received.rawY1)).toHaveLength(0);
      expect(rawForB(received.rawY2)).toHaveLength(0);
      expect(received.y1.filter((e) => e.at >= changedAt)).toHaveLength(0);
      expect(received.y2.filter((e) => e.at >= changedAt)).toHaveLength(0);
    }, 45_000);
    it('teardown: sockets closed, positions counted, no asset record created', async (ctx) => {
      if (skipReason !== null) skipTest(ctx, skipReason);
      // 1. every socket closed
      await cleanupSockets();
      expect(
        socketsSince(mark).filter((r) => (r.socket as { readyState?: number }).readyState !== 3)
      ).toEqual([]);
      // 2. the positions counter of this file (1 when LT-S1 aborted on the zone check)
      const spent = activeHarness().processCounts.positions - positionsBefore;
      recordFact('websocket.publisher.positions', spent);
      expect(spent).toBe(s1Aborted ? 1 : 2);
      // 3. no asset record for the test MACs; on 200 the delete is registered (the sweeper covers the range)
      const created: string[] = [];
      for (const mac of [A, B]) {
        const asset = await rawRequest('GET', `/assets/{ns}/${mac}`);
        recordFact(`websocket.publisher.assetCreated.${mac.slice(-2)}`, asset.status === 200);
        if (asset.status === 200) {
          created.push(mac);
          registerCleanup({
            label: `websocket test asset ${mac.slice(-2)}`,
            request: { method: 'DELETE', path: `/assets/{ns}/${mac}` },
            verify: { path: `/assets/{ns}/${mac}` },
          });
        }
      }
      expect(created).toEqual([]);
    }, 45_000);
  },
  { ruleEngine: true, positions: 'publish', requires: ['W'] }
);
