// Wire message types, the classifier and the guards (P8-T6, §8.2 M1–M6). M4 is type-level (expectTypeOf),
// checked by `npm run typecheck`.
import {
  RtlsWebSocketSubscriber as RootSubscriber,
  WS_CLOSE_CODES as ROOT_CLOSE_CODES,
  isValidMacAddress as rootIsValidMacAddress,
  normalizeMacAddress as rootNormalizeMacAddress,
  type SubscribeMessage as RootSubscribeMessage,
  type TagLostMessage as RootTagLostMessage,
  type WebSocketPublishPositionData as RootPublishData,
} from '../../src/index';
import { isValidMac, normalizeMac } from '../../src/utils/mac';
import {
  RtlsWebSocketSubscriber,
  WS_CLOSE_CODES,
  classifyMessage,
  isAlertMessage,
  isAssetMessage,
  isPositionMessage,
  isSubscriptionConfirmation,
  isValidMacAddress,
  isZoneEntryExitMessage,
  isZoneStatsMessage,
  normalizeMacAddress,
  type AlertMessage,
  type PositionMessage,
  type PublishPositionData,
  type SubscribeMessage,
  type SubscriberEventMap,
  type TagLostMessage,
  type WebSocketMessageKind,
  type WebSocketPublishPositionData,
  type WsPositionZone,
  type ZoneEntryExitMessage,
  type ZoneStatsMessage,
} from '../../src/websocket';
import { WS_FIXTURES, loadWsFixture, validateMessage } from './support/validators';

const GUARDS: Record<string, (msg: unknown) => boolean> = {
  POSITIONS: isPositionMessage,
  ZONES_ENTRIES_EVENTS: isZoneEntryExitMessage,
  ZONE_STATS_EVENTS: isZoneStatsMessage,
  ALERTS: isAlertMessage,
  ASSETS: isAssetMessage,
  CONFIRMATION: isSubscriptionConfirmation,
};
const OPERATION_ROWS = new Set(Array.from({ length: 14 }, (_, i) => `WS-M${i + 1}`));

describe('classifyMessage and the guards', () => {
  it.each(WS_FIXTURES.map((f) => [f.file, f.kind] as const))(
    'M1: %s → %s; at most its own guard is true',
    (file, kind) => {
      const body = loadWsFixture(file).body;
      expect(classifyMessage(body)).toBe(kind);
      const trueGuards = Object.entries(GUARDS)
        .filter(([, guard]) => guard(body))
        .map(([name]) => name);
      expect(trueGuards).toStrictEqual(kind in GUARDS ? [kind] : []);
    }
  );

  it('M1: every kind of WebSocketMessageKind except UNKNOWN has a fixture', () => {
    const kinds = new Set(WS_FIXTURES.map((f) => f.kind));
    const all: WebSocketMessageKind[] = [
      'CONFIRMATION',
      'POSITIONS',
      'ZONES_ENTRIES_EVENTS',
      'ZONE_STATS_EVENTS',
      'ALERTS',
      'ASSETS',
      'TAG_LOST',
      'ALERT_RULES_CHANGED',
      'ASSETS_LIBRARY_CHANGED',
      'DATA_MODELS_CHANGED',
      'SETTINGS_CHANGED',
      'MAP_DATA_CHANGED',
      'UNKNOWN',
    ];
    expect(all.filter((k) => !kinds.has(k))).toStrictEqual([]);
  });

  it('M2: negatives are UNKNOWN or not POSITIONS', () => {
    const position = loadWsFixture('position.json').body;
    const { user_uuid: _dropped, ...withoutUser } = position;
    const cases: unknown[] = [
      { ...position, lat: '48.8' },
      withoutUser,
      { ...position, action: 'notifyEvent' },
      { ...position, action: 7 },
      null,
      [position],
      'POSITIONS',
      42,
      undefined,
    ];
    expect(cases.map(classifyMessage)).toStrictEqual(Array(cases.length).fill('UNKNOWN'));
    expect(cases.some(isPositionMessage)).toBe(false);
  });

  it('M3: fictional discriminators of 0.2.0 are UNKNOWN', () => {
    const cases = [
      { action: 'notifyEvent', event_type: 'CLEAR_ALERT', app_namespace: 'ns' },
      { action: 'notifyEvent', event_type: 'UPDATE_TIME_IN_ZONE', app_namespace: 'ns' },
      { asset_id: 'x' },
      { type: 'POSITIONS', lat: 1, lon: 2 },
      { type: 'ALERT', alert_type: 'x' },
      { type: 'SUBSCRIPTION_CONFIRMATION', types: ['POSITIONS'] },
      { action: 'constructor', app_namespace: 'ns' },
      { action: 'notifyEvent', event_type: 'toString' },
    ];
    expect(cases.map(classifyMessage)).toStrictEqual(Array(cases.length).fill('UNKNOWN'));
    expect(isAlertMessage(cases[0])).toBe(false);
  });
});

describe('types (M4, checked by npm run typecheck) and root exports', () => {
  it('M4: wire field types', () => {
    expectTypeOf<ZoneStatsMessage['total_tags']>().toEqualTypeOf<number>();
    expectTypeOf<ZoneEntryExitMessage['user_udid']>().toEqualTypeOf<string>();
    // @ts-expect-error zone events carry user_udid, not user_uuid
    expectTypeOf<ZoneEntryExitMessage['user_uuid']>().toBeUnknown();
    expectTypeOf<AlertMessage['user_udid']>().toEqualTypeOf<string | undefined>();
    expectTypeOf<SubscriberEventMap['TAG_LOST']>().toEqualTypeOf<TagLostMessage>();
    expectTypeOf<PositionMessage['zone']>().toEqualTypeOf<WsPositionZone>();
    expectTypeOf<SubscribeMessage>().not.toHaveProperty('map_uuid');
    expectTypeOf<SubscribeMessage['uuids']>().toEqualTypeOf<string[] | undefined>();
    expectTypeOf<PublishPositionData>().toEqualTypeOf<WebSocketPublishPositionData>();
    expectTypeOf<RootPublishData>().toEqualTypeOf<PublishPositionData>();
    expectTypeOf<RootTagLostMessage>().toEqualTypeOf<TagLostMessage>();
    expectTypeOf<RootSubscribeMessage>().toEqualTypeOf<SubscribeMessage>();
    expect(classifyMessage({ action: 'subscribeEvent', app_namespace: 'ns' })).toBe('CONFIRMATION');
  });

  it('M4: root runtime exports are the barrel objects; the MAC aliases delegate to P1', () => {
    expect(RootSubscriber).toBe(RtlsWebSocketSubscriber);
    expect(ROOT_CLOSE_CODES).toBe(WS_CLOSE_CODES);
    expect(WS_CLOSE_CODES).toStrictEqual({
      NORMAL_CLOSURE: 1000,
      GOING_AWAY: 1001,
      PROTOCOL_ERROR: 1002,
      NO_STATUS: 1005,
      ABNORMAL_CLOSURE: 1006,
    });
    expect([rootNormalizeMacAddress, rootIsValidMacAddress]).toStrictEqual([
      normalizeMac,
      isValidMac,
    ]);
    expect([
      normalizeMacAddress('AA:BB:CC:DD:EE:FF'),
      isValidMacAddress('aabbccddeef'),
    ]).toStrictEqual(['aabbccddeeff', false]);
  });
});

describe('fixtures (M5, M6)', () => {
  it.each(WS_FIXTURES.map((f) => [f.file, f.kind, f.nonHttp] as const))(
    'M5: %s has the envelope and validates as %s',
    (file, kind, nonHttp) => {
      const fixture = loadWsFixture(file);
      expect(['server-code', 'live']).toContain(fixture._source);
      expect(fixture._note.length).toBeGreaterThan(10);
      expect(fixture._nonHttp).toBe(nonHttp);
      expect(OPERATION_ROWS.has(fixture._nonHttp)).toBe(true);
      expect(validateMessage(kind, fixture.body)).toStrictEqual([]);
    }
  );

  it('M6: mutated fixtures are reported', () => {
    const { total_tags: _gone, ...counter } = loadWsFixture('zone-counter.json').body;
    expect(validateMessage('ZONE_STATS_EVENTS', counter).length).toBeGreaterThan(0);
    const { user_udid: udid, ...zone } = loadWsFixture('zone-enter.json').body;
    expect(
      validateMessage('ZONES_ENTRIES_EVENTS', { ...zone, user_uuid: udid }).length
    ).toBeGreaterThan(0);
  });
});
