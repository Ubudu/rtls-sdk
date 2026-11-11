// P5 §9.5 L-A1…L-A5, L-S1, L-H1: alert history, settings and health read live (tier R). Alert items can hold
// e-mail receivers and callback URLs, settings can hold namespace identifiers: shape assertions, counts and
// recorded facts (booleans and numbers) only; documents are compared with the redacted deep-equality assertion.
// Every live alerts.list call passes `size` (harness rule G12).
import { ValidationError, type AlertEvent, type NamespaceSettings } from '../../../src';
import {
  createLiveClient,
  denyAll,
  describeLive,
  expectDeepEqualRedacted,
  getHarness,
  getOnly,
  rawRequest,
  recordFact,
  withRequestGuard,
} from '../harness';

const HOUR = 3_600_000;
const DAY = 86_400_000;

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Items outside [from, to], out of order, or not shaped like an AlertEvent (count only). */
function badItems(items: readonly AlertEvent[], from: number, to: number): number {
  let bad = 0;
  items.forEach((item, i) => {
    const previous = items[i - 1];
    const ok =
      typeof item.timestamp === 'number' &&
      item.timestamp >= from &&
      item.timestamp <= to &&
      (previous === undefined || previous.timestamp >= item.timestamp) &&
      isPlainObject(item.event) &&
      typeof item.event.type === 'string' &&
      item.event.type !== 'set_variable' &&
      typeof item.event.title === 'string' &&
      isPlainObject(item.user) &&
      isPlainObject(item.zone);
    if (!ok) bad += 1;
  });
  return bad;
}

const count = (items: readonly AlertEvent[], test: (item: AlertEvent) => boolean): number =>
  items.filter(test).length;

/** A `TagActionSetting`: a boolean, or an object whose `enabled` / `duration` (when present) have their types. */
function settingFits(value: unknown): boolean {
  return (
    typeof value === 'boolean' ||
    (isPlainObject(value) &&
      (value.enabled === undefined || typeof value.enabled === 'boolean') &&
      (value.duration === undefined || typeof value.duration === 'number'))
  );
}

/** U5 kind of a tagActions value: 1 boolean, 2 a setting object, 3 a per-service map, 4 anything else. */
function tagActionKind(value: unknown): number {
  if (typeof value === 'boolean') return 1;
  if (!isPlainObject(value)) return 4;
  if (Object.keys(value).every((k) => k === 'enabled' || k === 'duration')) {
    return settingFits(value) ? 2 : 4;
  }
  return Object.values(value).every(settingFits) ? 3 : 4;
}

describeLive('R', 'P5 alerts-settings-health', () => {
  it('L-A1 alerts.list over 7 days (30 days if empty) with size 10; record U6', async () => {
    const client = createLiveClient();
    const now = Date.now();
    let from = now - 7 * DAY;
    let items = await client.alerts.list({ timestampFrom: from, timestampTo: now, size: 10 });
    if (items.length === 0) {
      from = now - 30 * DAY;
      items = await client.alerts.list({ timestampFrom: from, timestampTo: now, size: 10 });
    }
    expect({
      fixture: 'LIVE-TESTING §7: Demo Factory holds at least one alert in the last 30 days',
      found: items.length > 0,
    }).toStrictEqual({
      fixture: 'LIVE-TESTING §7: Demo Factory holds at least one alert in the last 30 days',
      found: true,
    });
    expect(items.length).toBeLessThanOrEqual(10);
    expect(badItems(items, from, now)).toBe(0);
    recordFact('U6.events', items.length);
    recordFact(
      'U6.mapUuid',
      count(items, (i) => typeof i.map_uuid === 'string')
    );
    recordFact(
      'U6.zone.id',
      count(items, (i) => typeof i.zone.id === 'number')
    );
    recordFact(
      'U6.zone.name',
      count(items, (i) => typeof i.zone.name === 'string')
    );
    recordFact(
      'U6.zone.tags',
      count(items, (i) => Array.isArray(i.zone.tags))
    );
    recordFact(
      'U6.zone.color',
      count(items, (i) => typeof i.zone.color === 'string')
    );
    recordFact(
      'U6.zone.keys',
      items.reduce((n, i) => n + Object.keys(i.zone).length, 0)
    );
    recordFact(
      'U6.user.tags',
      count(items, (i) => Array.isArray(i.user.tags))
    );
    recordFact(
      'U6.user.data',
      count(items, (i) => isPlainObject(i.user.data))
    );
    recordFact(
      'U6.event.params.null',
      count(items, (i) => i.event.params === null)
    );
    recordFact(
      'U6.event.style.null',
      count(items, (i) => i.event.style === null)
    );
  });

  it('L-A2 alerts.list({ size: 5 }) requests exactly the last 24 hours (GET-only guard)', async () => {
    const client = createLiveClient();
    const { result, error, attempts } = await withRequestGuard(getOnly, () =>
      client.alerts.list({ size: 5 })
    );
    const after = Date.now();
    expect(error).toBeUndefined();
    expect(attempts).toHaveLength(1);
    const q = attempts[0]?.query ?? {};
    const from = Number(q.timestampFrom);
    const to = Number(q.timestampTo);
    expect(attempts.map((a) => [a.method, a.template, a.allowed])).toStrictEqual([
      ['GET', '/es/alerts/{appNamespace}', true],
    ]);
    expect(to - from).toBe(DAY);
    expect(after - to).toBeGreaterThanOrEqual(0);
    expect(after - to).toBeLessThan(5000);
    expect(q.size).toBe('5');
    const items = result ?? [];
    expect(items.length).toBeLessThanOrEqual(5);
    expect(badItems(items, from, to)).toBe(0);
  });

  it('L-A3 legacy list(namespace, {…}) and the 0.2.0 two-object form', async () => {
    const client = createLiveClient();
    const namespace = getHarness().env.namespace;
    const now = Date.now();
    const legacy = await client.alerts.list(namespace, {
      timestampFrom: now - HOUR,
      timestampTo: now,
      size: 1,
    });
    expect(legacy.length).toBeLessThanOrEqual(1);
    const twoObject = await client.alerts.list(
      { timestampFrom: now - HOUR, timestampTo: now, size: 1 },
      { timeoutMs: 30_000 }
    );
    expect(twoObject.length).toBeLessThanOrEqual(1);
  });

  it('L-A4 alerts.list({ size: 0 }) is refused client-side (deny-all guard)', async () => {
    const client = createLiveClient();
    const { error, attempts } = await withRequestGuard(denyAll, () =>
      client.alerts.list({ size: 0 })
    );
    expect(error).toBeInstanceOf(ValidationError);
    expect((error as ValidationError).details).toStrictEqual(['size']);
    expect(attempts).toHaveLength(0);
  });

  // U7 outcome (gate probe): the production cluster answers 200 for size 10001 over one hour, so the "oversized"
  // clause of USI-P5-11 is dropped and the SDK keeps its 10 000 bound as an SDK limit. Only this branch is kept.
  it('L-A5 U7: GET /es/alerts with size 10001 over one hour answers 200 (status only)', async () => {
    const now = Date.now();
    const res = await rawRequest('GET', '/es/alerts/{ns}', {
      query: { timestampFrom: now - HOUR, timestampTo: now, size: 10_001 },
    });
    recordFact('U7.status', res.status);
    expect(res.status).toBe(200);
  });

  it('L-S1 settings.get() types and defaults; record U5; delegates return the same document', async () => {
    const client = createLiveClient();
    const namespace = getHarness().env.namespace;
    const settings: NamespaceSettings = await client.settings.get();
    expect(Number.isInteger(settings.positionsExpirationPeriod)).toBe(true);
    expect(typeof settings.accuracy.accuracy_meter).toBe('number');
    expect(typeof settings.accuracy.show).toBe('boolean');
    const specTypes: Array<[string, (v: unknown) => boolean]> = [
      ['assetPermissions', isPlainObject],
      ['defaultSelectedModels', (v) => Array.isArray(v) && v.every((x) => typeof x === 'string')],
      ['lastPositions', isPlainObject],
      ['linkedApplications', (v) => Array.isArray(v) && v.every((x) => typeof x === 'string')],
      ['map', isPlainObject],
    ];
    const wrong = specTypes.filter(([k, ok]) => settings[k] !== undefined && !ok(settings[k]));
    expect(wrong.map(([k]) => k)).toStrictEqual([]);

    const tagActions: unknown = settings.tagActions;
    recordFact('U5.tagActions.present', tagActions !== undefined);
    recordFact('U5.tagActions.isPlainObject', isPlainObject(tagActions));
    const entries = isPlainObject(tagActions) ? Object.entries(tagActions) : [];
    recordFact('U5.tagActions.keys', entries.length);
    let fits = tagActions === undefined || isPlainObject(tagActions);
    for (const [key, value] of entries) {
      const kind = tagActionKind(value);
      if (kind === 4) fits = false;
      const safeKey = /^[A-Za-z0-9_]{1,40}$/.test(key) ? key : 'other';
      recordFact(`U5.tagActions.kind.${safeKey}`, kind);
    }
    recordFact('U5.tagActions.fits', fits);
    expect(fits).toBe(true);

    expectDeepEqualRedacted(
      await client.settings.get({ namespace }),
      settings,
      'L-S1 settings.get({ namespace })'
    );
    expectDeepEqualRedacted(await client.getSettings(), settings, 'L-S1 client.getSettings()');
    expectDeepEqualRedacted(
      await client.getSettings(namespace),
      settings,
      'L-S1 client.getSettings(namespace)'
    );
  });

  it('L-H1 client.health() is { status: "OK" }', async () => {
    expect(await createLiveClient().health()).toStrictEqual({ status: 'OK' });
  });
});
