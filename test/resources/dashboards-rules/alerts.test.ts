// client.alerts against MSW with the real request builder (P5 §8.1 A1–A7). Also holds the cases of the 0.2.0
// alerts-context test (default namespace, legacy explicit namespace for getRules / saveRules / list), which mocked
// the client and is deleted.
import { afterEach, describe, it, expect, vi } from 'vitest';
import { delay, http, HttpResponse } from 'msw';
import { recordRequests, server, type RecordedRequest } from '../../mocks/server';
import { fixtureResponse, loadFixture } from '../../contract/fixtures';
import {
  AlertsResource,
  ContextError,
  createRtlsClient,
  ServerError,
  TimeoutError,
  ValidationError,
  type AlertEvent,
  type AlertRule,
  type AlertRuleSet,
  type RtlsClient,
} from '../../../src';

const BASE = 'https://rtls.ubudu.com/api';
const ALERTS_URL = `${BASE}/es/alerts/:ns`;
const RULES_URL = `${BASE}/alert_rules/:ns`;
const DAY = 86_400_000;

const client = (): RtlsClient => createRtlsClient({ apiKey: 'test-key', namespace: 'test-ns' });
const bare = (): RtlsClient => createRtlsClient({ apiKey: 'test-key' });
const body = (name: string): unknown => loadFixture('dashboards-rules', name).body;
const clone = <T>(value: T): T => structuredClone(value);

type Recorder = { readonly requests: readonly RecordedRequest[] };

async function sentBody(rec: Recorder, i: number): Promise<unknown> {
  return JSON.parse(await (rec.requests[i] as RecordedRequest).text()) as unknown;
}

const query = (rec: Recorder, i = 0): Record<string, string> => {
  const out: Record<string, string> = {};
  (rec.requests[i] as RecordedRequest).url.searchParams.forEach((v, k) => {
    out[k] = v;
  });
  return out;
};

function serveAlerts(): void {
  server.use(
    http.get(ALERTS_URL, () => fixtureResponse(loadFixture('dashboards-rules', 'alert-events')))
  );
}

function store(stored: unknown): void {
  server.use(
    http.get(RULES_URL, () => HttpResponse.json(stored as never)),
    http.post(RULES_URL, () =>
      fixtureResponse(loadFixture('dashboards-rules', 'alert-rules-post-200'))
    )
  );
}

const RULE: AlertRule = {
  id: 'rule-new',
  disabled: true,
  conditions: { all: [{ fact: 'user_udid', operator: 'equal', value: 'never' }] },
  event: {
    type: 'message',
    params: {
      title: 'New',
      text: 'New rule',
      style: 'info',
      duration: 1000,
      coalescence: 60,
      coalescence_group: 'new',
    },
  },
};

afterEach(() => {
  vi.useRealTimers();
});

describe('alerts.list (A1–A5)', () => {
  it('A1 GET /es/alerts/{ns} with timestampFrom, timestampTo and size as decimal strings', async () => {
    serveAlerts();
    const rec = recordRequests();
    await client().alerts.list({ timestampFrom: 1000, timestampTo: 2000, size: 10 });
    const r = rec.requests[0] as RecordedRequest;
    expect([r.method, r.url.pathname, r.url.search, r.headers.get('x-api-key')]).toStrictEqual([
      'GET',
      '/api/es/alerts/test-ns',
      '?timestampFrom=1000&timestampTo=2000&size=10',
      'test-key',
    ]);
  });

  it('A1 Date and ISO string bounds go through toEpochMs', async () => {
    serveAlerts();
    const rec = recordRequests();
    await client().alerts.list({
      timestampFrom: new Date('2024-06-21T15:16:50Z'),
      timestampTo: '2024-06-22T15:16:50Z',
    });
    expect(query(rec)).toStrictEqual({
      timestampFrom: '1718983010000',
      timestampTo: String(1718983010000 + DAY),
    });
  });

  it('A2 default range: last 24 h, no size; only from → to = now; only to → from = to − 24 h', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const T = 1_700_000_000_000;
    vi.setSystemTime(T);
    serveAlerts();
    const rec = recordRequests();
    await client().alerts.list();
    await client().alerts.list({ timestampFrom: T - 5000 });
    await client().alerts.list({ timestampTo: 5_000_000_000 });
    expect([query(rec, 0), query(rec, 1), query(rec, 2)]).toStrictEqual([
      { timestampFrom: String(T - DAY), timestampTo: String(T) },
      { timestampFrom: String(T - 5000), timestampTo: String(T) },
      { timestampFrom: String(5_000_000_000 - DAY), timestampTo: '5000000000' },
    ]);
  });

  it.each([0, -1, 1.5, 10_001, '10' as never, Number.NaN])(
    'A3 size %s → ValidationError status 0, no request',
    async (size) => {
      const rec = recordRequests();
      await expect(client().alerts.list({ size })).rejects.toSatisfy(
        (e) =>
          e instanceof ValidationError && e.status === 0 && (e.details as string[])[0] === 'size'
      );
      expect(rec.requests).toHaveLength(0);
    }
  );

  it('A3 size 1 and 10000 are sent; size null counts as not given', async () => {
    serveAlerts();
    const rec = recordRequests();
    await client().alerts.list({ timestampFrom: 1, timestampTo: 2, size: 1 });
    await client().alerts.list({ timestampFrom: 1, timestampTo: 2, size: 10_000 });
    await client().alerts.list({ timestampFrom: 1, timestampTo: 2, size: null as never });
    expect(rec.requests.map((r) => r.url.searchParams.get('size'))).toStrictEqual([
      '1',
      '10000',
      null,
    ]);
  });

  it('A3 from > to → ValidationError from resolveTimeRange (details ["from"]), no request', async () => {
    const rec = recordRequests();
    await expect(
      client().alerts.list({ timestampFrom: 2000, timestampTo: 1000 })
    ).rejects.toSatisfy(
      (e) => e instanceof ValidationError && e.status === 0 && (e.details as string[])[0] === 'from'
    );
    expect(rec.requests).toHaveLength(0);
  });

  it('A4 legacy list("ns", {…}, requestOptions), options.namespace override, ContextError', async () => {
    serveAlerts();
    const rec = recordRequests();
    await client().alerts.list('explicit-ns', { timestampFrom: 1000, timestampTo: 2000 });
    await client().alerts.list('explicit-ns', undefined, { headers: { 'X-Legacy': '1' } });
    await client().alerts.list({ namespace: 'override', timestampFrom: 1, timestampTo: 2 });
    expect(rec.requests.map((r) => r.url.pathname)).toStrictEqual([
      '/api/es/alerts/explicit-ns',
      '/api/es/alerts/explicit-ns',
      '/api/es/alerts/override',
    ]);
    expect(query(rec, 0)).toStrictEqual({ timestampFrom: '1000', timestampTo: '2000' });
    expect(rec.requests[1]?.headers.get('x-legacy')).toBe('1');
    rec.stop();
    const none = recordRequests();
    await expect(bare().alerts.list({ size: 5 })).rejects.toBeInstanceOf(ContextError);
    expect(none.requests).toHaveLength(0);
  });

  it('A4 0.2.0 two-object form list({…}, { timeoutMs }) honours the trailing request options', async () => {
    server.use(
      http.get(ALERTS_URL, async () => {
        await delay(500);
        return HttpResponse.json([]);
      })
    );
    await expect(
      client().alerts.list({ timestampFrom: 1, timestampTo: 2 }, { timeoutMs: 30 })
    ).rejects.toBeInstanceOf(TimeoutError);
    await expect(client().alerts.list(undefined, { timeoutMs: 30 })).rejects.toBeInstanceOf(
      TimeoutError
    );
  });

  it('A5 returns the AlertEvent[] of the fixture unchanged', async () => {
    serveAlerts();
    const events: AlertEvent[] = await client().alerts.list({ size: 3 });
    expect(events).toStrictEqual(body('alert-events'));
    expect(events[0]?.zone.name).toBe('Example Zone');
    expect(events[1]?.event.style).toBeNull();
  });

  it('A5 400 required-parameters → ValidationError; 500 {error} → ServerError', async () => {
    server.use(
      http.get(ALERTS_URL, () =>
        HttpResponse.json(
          { error: 'timestampFrom and timestampTo are required parameters' },
          { status: 400 }
        )
      )
    );
    await expect(client().alerts.list()).rejects.toSatisfy(
      (e) =>
        e instanceof ValidationError &&
        e.status === 400 &&
        e.message === 'timestampFrom and timestampTo are required parameters'
    );
    server.use(http.get(ALERTS_URL, () => HttpResponse.json({ error: 'x' }, { status: 500 })));
    await expect(client().alerts.list()).rejects.toSatisfy(
      (e) => e instanceof ServerError && e.message === 'x'
    );
  });
});

describe('alerts.getRules (A6, deprecated)', () => {
  it('same GET and normalisation as alertRules.get()', async () => {
    store(body('alert-rules-array'));
    const rec = recordRequests();
    const viaAlerts = await client().alerts.getRules();
    const viaRules = await client().alertRules.get();
    expect(viaAlerts).toStrictEqual(viaRules);
    expect(viaAlerts).toStrictEqual({ name: '', rules: body('alert-rules-array') });
    expect(rec.requests.map((r) => [r.method, r.url.pathname])).toStrictEqual([
      ['GET', '/api/alert_rules/test-ns'],
      ['GET', '/api/alert_rules/test-ns'],
    ]);
  });

  it('getRules("ns", requestOptions) and getRules({ namespace }) target that namespace', async () => {
    store(body('alert-rules'));
    const rec = recordRequests();
    await client().alerts.getRules('explicit-ns', { headers: { 'X-Legacy': '1' } });
    await client().alerts.getRules({ namespace: 'x' });
    expect(rec.requests.map((r) => r.url.pathname)).toStrictEqual([
      '/api/alert_rules/explicit-ns',
      '/api/alert_rules/x',
    ]);
    expect(rec.requests[0]?.headers.get('x-legacy')).toBe('1');
  });

  it('no namespace → ContextError, no request', async () => {
    const rec = recordRequests();
    await expect(bare().alerts.getRules()).rejects.toBeInstanceOf(ContextError);
    expect(rec.requests).toHaveLength(0);
  });

  it('a resource built directly from a client keeps working (0.2.0 construction)', async () => {
    store(body('alert-rules'));
    const resource = new AlertsResource(client());
    expect(await resource.getRules()).toStrictEqual(body('alert-rules'));
  });
});

describe('alerts.saveRules (A7, deprecated): regression for the 0.2.0 outage', () => {
  const STORED = body('alert-rules-extra-keys') as AlertRuleSet;

  it('saveRules([r]) → GET, then POST { ...stored, name: <stored name>, rules: [r] }; never an array', async () => {
    store(clone(STORED));
    const rec = recordRequests();
    await expect(client().alerts.saveRules([clone(RULE)])).resolves.toBeUndefined();
    expect(rec.requests.map((r) => [r.method, r.url.pathname])).toStrictEqual([
      ['GET', '/api/alert_rules/test-ns'],
      ['POST', '/api/alert_rules/test-ns'],
    ]);
    const posted = await sentBody(rec, 1);
    expect(Array.isArray(posted)).toBe(false);
    expect(posted).toStrictEqual({ ...STORED, name: 'Example rules', rules: [RULE] });
    expect(rec.requests[1]?.headers.get('content-type')).toBe('application/json');
  });

  it.each([
    ['a bare array', 'alert-rules-array', { name: '', rules: [RULE] }],
    [
      'a legacy document (decisions dropped)',
      'alert-rules-legacy',
      { name: 'Example legacy', rules: [RULE] },
    ],
    ['a string', 'alert-rules-string', { name: '', rules: [RULE] }],
    ['{}', 'alert-rules-empty', { name: '', rules: [RULE] }],
    ['a name only', 'alert-rules-name-only', { name: 'n', rules: [RULE] }],
  ])('stored %s → POST %j', async (_l, fixture, expected) => {
    store(body(fixture));
    const rec = recordRequests();
    await client().alerts.saveRules([clone(RULE)]);
    const posted = await sentBody(rec, 1);
    expect(Array.isArray(posted)).toBe(false);
    expect(posted).toStrictEqual(expected);
  });

  it('stored extra keys kept, decisions dropped, a non-string name becomes ""', async () => {
    store({ name: 3, rules: [], decisions: [RULE], editorMeta: { v: 1 } });
    const rec = recordRequests();
    await client().alerts.saveRules([clone(RULE)]);
    const posted = await sentBody(rec, 1);
    expect(Array.isArray(posted)).toBe(false);
    expect(posted).toStrictEqual({ name: '', rules: [RULE], editorMeta: { v: 1 } });
  });

  it('saveRules("ns", [r]) and saveRules([r], { namespace }) target that namespace', async () => {
    store({});
    const rec = recordRequests();
    await client().alerts.saveRules('explicit-ns', [clone(RULE)], { headers: { 'X-Legacy': '1' } });
    await client().alerts.saveRules([clone(RULE)], { namespace: 'x' });
    expect(rec.requests.map((r) => [r.method, r.url.pathname])).toStrictEqual([
      ['GET', '/api/alert_rules/explicit-ns'],
      ['POST', '/api/alert_rules/explicit-ns'],
      ['GET', '/api/alert_rules/x'],
      ['POST', '/api/alert_rules/x'],
    ]);
    expect(rec.requests[1]?.headers.get('x-legacy')).toBe('1');
    for (const i of [1, 3]) {
      const posted = await sentBody(rec, i);
      expect(Array.isArray(posted)).toBe(false);
      expect(posted).toStrictEqual({ name: '', rules: [RULE] });
    }
  });

  it('saveRules(set) and saveRules("ns", set) → POST the set unchanged, no GET', async () => {
    store({});
    const rec = recordRequests();
    await client().alerts.saveRules(clone(STORED));
    await client().alerts.saveRules('explicit-ns', clone(STORED));
    expect(rec.requests.map((r) => [r.method, r.url.pathname])).toStrictEqual([
      ['POST', '/api/alert_rules/test-ns'],
      ['POST', '/api/alert_rules/explicit-ns'],
    ]);
    for (const i of [0, 1]) {
      const posted = await sentBody(rec, i);
      expect(Array.isArray(posted)).toBe(false);
      expect(posted).toStrictEqual(STORED);
    }
  });

  it('an invalid rule → ValidationError after the GET only; validation cannot be skipped', async () => {
    store(clone(STORED));
    const rec = recordRequests();
    const bad = {
      ...clone(RULE),
      disabled: false,
      conditions: { all: [{ fact: 'x', operator: 'equal' }] },
    };
    await expect(client().alerts.saveRules([bad as never])).rejects.toBeInstanceOf(ValidationError);
    expect(rec.requests.map((r) => r.method)).toStrictEqual(['GET']);
    rec.stop();
    const none = recordRequests();
    await expect(
      client().alerts.saveRules({ name: '', rules: [bad as never] }, {
        skipValidation: true,
      } as never)
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(client().alerts.saveRules({ rules: 'x' } as never)).rejects.toBeInstanceOf(
      ValidationError
    );
    expect(none.requests).toHaveLength(0);
  });

  it('no namespace → ContextError, no request', async () => {
    const rec = recordRequests();
    await expect(bare().alerts.saveRules([clone(RULE)])).rejects.toBeInstanceOf(ContextError);
    await expect(bare().alerts.saveRules(clone(STORED))).rejects.toBeInstanceOf(ContextError);
    expect(rec.requests).toHaveLength(0);
  });
});
