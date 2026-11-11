// client.alertRules against MSW with the real request builder (P5 §8.1 R1–R6).
import { describe, it, expect } from 'vitest';
import { http, HttpResponse } from 'msw';
import { recordRequests, server, type RecordedRequest } from '../../mocks/server';
import { fixtureResponse, loadFixture } from '../../contract/fixtures';
import {
  AuthenticationError,
  ContextError,
  createRtlsClient,
  ServerError,
  ValidationError,
  type AlertRule,
  type AlertRuleSet,
  type RtlsClient,
} from '../../../src';

const BASE = 'https://rtls.ubudu.com/api';
const RULES_URL = `${BASE}/alert_rules/:ns`;

const client = (): RtlsClient => createRtlsClient({ apiKey: 'test-key', namespace: 'test-ns' });
const bare = (): RtlsClient => createRtlsClient({ apiKey: 'test-key' });
const body = (name: string): unknown => loadFixture('dashboards-rules', name).body;
const clone = <T>(value: T): T => structuredClone(value);

type Recorder = { readonly requests: readonly RecordedRequest[] };

async function sent(rec: Recorder, i = 0) {
  const r = rec.requests[i] as RecordedRequest;
  const text = await r.text();
  return {
    method: r.method,
    path: r.url.pathname,
    search: r.url.search,
    apiKey: r.headers.get('x-api-key'),
    contentType: r.headers.get('content-type'),
    body: text === '' ? undefined : (JSON.parse(text) as unknown),
  };
}

/** Serves `stored` on GET and the empty 200 of the server on POST. */
function store(stored: unknown): void {
  server.use(
    http.get(RULES_URL, () => HttpResponse.json(stored as never)),
    http.post(RULES_URL, () =>
      fixtureResponse(loadFixture('dashboards-rules', 'alert-rules-post-200'))
    )
  );
}

const plainText = (status: number, text: string, contentType?: string) => () =>
  new Response(
    new TextEncoder().encode(text),
    contentType ? { status, headers: { 'Content-Type': contentType } } : { status }
  );

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

const INVALID_ENABLED_RULE = {
  id: 'rule-bad',
  conditions: { all: [{ fact: 'zone_name', operator: 'equal' }] },
  event: { type: 'message', params: { title: 't', coalescence: 1, coalescence_group: 'g' } },
} as unknown as AlertRule;

describe('alertRules.get (R1)', () => {
  it('GET /alert_rules/{ns} with the default namespace and the API key; canonical document returned as is', async () => {
    store(body('alert-rules'));
    const rec = recordRequests();
    const set = await client().alertRules.get();
    const req = await sent(rec);
    expect([req.method, req.path, req.search, req.apiKey]).toStrictEqual([
      'GET',
      '/api/alert_rules/test-ns',
      '',
      'test-key',
    ]);
    expect(set).toStrictEqual(body('alert-rules'));
  });

  it('honours options.namespace (encoded) and request options', async () => {
    store(body('alert-rules'));
    const rec = recordRequests();
    await client().alertRules.get({ namespace: 'x/y', headers: { 'X-Trace': '1' } });
    expect(rec.requests[0]?.url.pathname).toBe('/api/alert_rules/x%2Fy');
    expect(rec.requests[0]?.headers.get('x-trace')).toBe('1');
  });

  it('no namespace → ContextError, no request', async () => {
    const rec = recordRequests();
    await expect(bare().alertRules.get()).rejects.toBeInstanceOf(ContextError);
    expect(rec.requests).toHaveLength(0);
  });

  const r = (body('alert-rules-legacy') as { decisions: AlertRule[] }).decisions;
  const rows: Array<[string, string, unknown]> = [
    ['N1', 'alert-rules-empty', { name: '', rules: [] }],
    ['N2', 'alert-rules-extra-keys', body('alert-rules-extra-keys')],
    ['N3', 'alert-rules-legacy', { name: 'Example legacy', rules: r }],
    [
      'N3 edge (rules [] + decisions)',
      'alert-rules-empty-rules-legacy',
      { name: 'Example legacy', rules: r },
    ],
    ['N4', 'alert-rules-array', { name: '', rules: body('alert-rules-array') }],
    ['N5', 'alert-rules-name-only', { name: 'n', rules: [] }],
    ['N6', 'alert-rules-string', { name: '', rules: [] }],
  ];
  it.each(rows)('normalises row %s (%s)', async (_row, fixture, expected) => {
    store(body(fixture));
    expect(await client().alertRules.get()).toStrictEqual(expected);
  });

  it('N2 variants: a non-string name becomes "", decisions next to non-empty rules are kept', async () => {
    store({ name: 7, rules: [RULE], decisions: [] });
    expect(await client().alertRules.get()).toStrictEqual({
      name: '',
      rules: [RULE],
      decisions: [],
    });
    store({ rules: [RULE], decisions: [INVALID_ENABLED_RULE] });
    expect(await client().alertRules.get()).toStrictEqual({
      name: '',
      rules: [RULE],
      decisions: [INVALID_ENABLED_RULE],
    });
  });

  it('N5 variant: rules not an array is dropped, other keys kept', async () => {
    store({ name: 'n', rules: { a: 1 }, extra: true, decisions: [] });
    expect(await client().alertRules.get()).toStrictEqual({
      name: 'n',
      extra: true,
      decisions: [],
      rules: [],
    });
  });

  it('N6 variants: number, boolean, null and an empty body never throw', async () => {
    for (const stored of [42, true, null]) {
      store(stored);
      expect(await client().alertRules.get()).toStrictEqual({ name: '', rules: [] });
    }
    server.use(http.get(RULES_URL, () => new Response(null, { status: 200 })));
    expect(await client().alertRules.get()).toStrictEqual({ name: '', rules: [] });
  });

  it('500 offload_handler_error → ServerError; 401 → AuthenticationError', async () => {
    server.use(
      http.get(RULES_URL, () =>
        HttpResponse.json({ error: 'offload_handler_error', flag: 'ALERT_RULES' }, { status: 500 })
      )
    );
    await expect(client().alertRules.get()).rejects.toSatisfy(
      (e) => e instanceof ServerError && e.status === 500 && e.message === 'offload_handler_error'
    );
    server.use(
      http.get(RULES_URL, () =>
        HttpResponse.json({ error: 'Failed to authenticate user' }, { status: 401 })
      )
    );
    await expect(client().alertRules.get()).rejects.toBeInstanceOf(AuthenticationError);
  });
});

describe('alertRules.replace (R2)', () => {
  const SET = body('alert-rules-extra-keys') as AlertRuleSet;

  it('POST /alert_rules/{ns}, JSON body unchanged, empty 200 (Content-Length 0) → undefined', async () => {
    store({});
    const rec = recordRequests();
    const result = await client().alertRules.replace(clone(SET));
    const req = await sent(rec);
    expect(result).toBeUndefined();
    expect([req.method, req.path, req.apiKey, req.contentType]).toStrictEqual([
      'POST',
      '/api/alert_rules/test-ns',
      'test-key',
      'application/json',
    ]);
    expect(req.body).toStrictEqual(SET);
    expect(Array.isArray(req.body)).toBe(false);
  });

  it('empty 200 without Content-Length → undefined; options.namespace honoured', async () => {
    server.use(http.post(RULES_URL, () => new Response(null, { status: 200 })));
    const rec = recordRequests();
    await expect(
      client().alertRules.replace(clone(SET), { namespace: 'other' })
    ).resolves.toBeUndefined();
    expect(rec.requests[0]?.url.pathname).toBe('/api/alert_rules/other');
  });

  it.each([
    ['an array', [RULE], 'SET_NOT_OBJECT'],
    ['null', null, 'SET_NOT_OBJECT'],
    ['missing rules', { name: '' }, 'SET_RULES_NOT_ARRAY'],
    ['numeric name', { name: 1, rules: [] }, 'SET_NAME_NOT_STRING'],
  ])('top-level error (%s) → ValidationError status 0, no request', async (_l, set, code) => {
    const rec = recordRequests();
    await expect(client().alertRules.replace(set as never)).rejects.toSatisfy(
      (e) =>
        e instanceof ValidationError &&
        e.status === 0 &&
        e.message === 'Alert rule set is invalid: 1 error(s)' &&
        (e.details as string[]).some((d) => d.includes(code))
    );
    expect(rec.requests).toHaveLength(0);
  });

  it('one enabled-rule error → ValidationError whose details name the path and code, no request', async () => {
    const rec = recordRequests();
    await expect(
      client().alertRules.replace({ name: '', rules: [RULE, INVALID_ENABLED_RULE] })
    ).rejects.toSatisfy(
      (e) =>
        e instanceof ValidationError &&
        (e.details as string[])[0] ===
          'rules[1].conditions.all[0] CONDITION_VALUE_MISSING: the condition has no "value" key (required even for empty / notEmpty; null is fine)'
    );
    expect(rec.requests).toHaveLength(0);
  });

  it('a whole-document template error has no path prefix in details', async () => {
    const bad = clone(RULE);
    (bad.event.params as { text: string }).text = '{{#zone_name}} open';
    await expect(client().alertRules.replace({ name: '', rules: [bad] })).rejects.toSatisfy(
      (e) =>
        e instanceof ValidationError &&
        ((e.details as string[])[0] as string).startsWith('TEMPLATE_UNBALANCED: ')
    );
  });

  it('warnings only → the request is sent', async () => {
    store({});
    const rec = recordRequests();
    const set = { name: '', rules: [{ ...clone(RULE), event: { type: 'send_sms', params: {} } }] };
    await client().alertRules.replace(set as never);
    expect((await sent(rec)).body).toStrictEqual(set);
  });

  it('skipValidation: true sends an invalid set verbatim (backup restore)', async () => {
    store({});
    const rec = recordRequests();
    const set = { name: '', rules: [INVALID_ENABLED_RULE] };
    await client().alertRules.replace(set, { skipValidation: true });
    const req = await sent(rec);
    expect(req.body).toStrictEqual(set);
    expect(Array.isArray(req.body)).toBe(false);
  });

  it('400 "Invalid alert rules" without any Content-Type and with text/plain → ValidationError', async () => {
    for (const contentType of [undefined, 'text/plain']) {
      server.use(http.post(RULES_URL, plainText(400, 'Invalid alert rules', contentType)));
      const rec = recordRequests();
      await expect(client().alertRules.replace(clone(SET))).rejects.toSatisfy(
        (e) =>
          e instanceof ValidationError && e.status === 400 && e.message === 'Invalid alert rules'
      );
      const req = await sent(rec);
      expect(Array.isArray(req.body)).toBe(false);
      rec.stop();
    }
  });

  it('500 "JSON error: x" and "Redis error: x" without Content-Type → ServerError with the text', async () => {
    for (const text of ['JSON error: x', 'Redis error: x']) {
      server.use(http.post(RULES_URL, plainText(500, text)));
      await expect(client().alertRules.replace(clone(SET))).rejects.toSatisfy(
        (e) => e instanceof ServerError && e.status === 500 && e.message.includes(text)
      );
    }
  });
});

describe('alertRules.upsertRule (R3)', () => {
  const STORED = body('alert-rules-extra-keys') as AlertRuleSet;

  it('appends a new id; other rules, name and extra keys unchanged; returns the written set', async () => {
    store(clone(STORED));
    const rec = recordRequests();
    const written = await client().alertRules.upsertRule(clone(RULE));
    const expected = { ...STORED, rules: [...STORED.rules, RULE] };
    expect(rec.requests.map((r) => r.method)).toStrictEqual(['GET', 'POST']);
    const post = await sent(rec, 1);
    expect(post.path).toBe('/api/alert_rules/test-ns');
    expect(post.contentType).toBe('application/json');
    expect(post.body).toStrictEqual(expected);
    expect(Array.isArray(post.body)).toBe(false);
    expect(written).toStrictEqual(expected);
  });

  it('replaces an existing id at its index', async () => {
    store(clone(STORED));
    const rec = recordRequests();
    const replacement = { ...clone(RULE), id: 'example-rule-1' };
    await client().alertRules.upsertRule(replacement);
    const post = await sent(rec, 1);
    expect(post.body).toStrictEqual({ ...STORED, rules: [replacement, STORED.rules[1]] });
  });

  it('drops decisions of a canonical document', async () => {
    store({ ...clone(STORED), decisions: [] });
    const rec = recordRequests();
    await client().alertRules.upsertRule(clone(RULE));
    expect((await sent(rec, 1)).body).toStrictEqual({ ...STORED, rules: [...STORED.rules, RULE] });
  });

  it('stored {} → body { name: "", rules: [rule] }', async () => {
    store({});
    const rec = recordRequests();
    await client().alertRules.upsertRule(clone(RULE));
    expect((await sent(rec, 1)).body).toStrictEqual({ name: '', rules: [RULE] });
  });

  it.each([
    ['alert-rules-array', 'array'],
    ['alert-rules-legacy', 'legacy-decisions'],
    ['alert-rules-string', 'other'],
    ['alert-rules-name-only', 'other'],
  ])('stored %s → ValidationError naming %s, GET only', async (fixture, shape) => {
    store(body(fixture));
    const rec = recordRequests();
    await expect(client().alertRules.upsertRule(clone(RULE))).rejects.toSatisfy(
      (e) =>
        e instanceof ValidationError &&
        e.status === 0 &&
        (e.details as string[])[0] ===
          `stored alert rules are not in the {name, rules} format (${shape}); inspect with alertRules.get() and write the intended set with replace()`
    );
    expect(rec.requests.map((r) => r.method)).toStrictEqual(['GET']);
  });

  it.each([
    ['no id', { ...RULE, id: undefined }],
    ['empty id', { ...RULE, id: '' }],
    ['not an object', null],
  ])('rule with %s → ValidationError, no request at all', async (_l, rule) => {
    const rec = recordRequests();
    await expect(client().alertRules.upsertRule(rule as never)).rejects.toSatisfy(
      (e) => e instanceof ValidationError && (e.details as string[])[0] === 'rule.id'
    );
    expect(rec.requests).toHaveLength(0);
  });

  it('resulting set invalid (including an untouched stored rule) → ValidationError, GET only', async () => {
    store({ name: '', rules: [INVALID_ENABLED_RULE] });
    const rec = recordRequests();
    await expect(client().alertRules.upsertRule(clone(RULE))).rejects.toSatisfy(
      (e) =>
        e instanceof ValidationError &&
        (e.details as string[]).some((d) => d.startsWith('rules[0].conditions.all[0] '))
    );
    expect(rec.requests.map((r) => r.method)).toStrictEqual(['GET']);
  });
});

describe('alertRules.removeRule (R4)', () => {
  const STORED = body('alert-rules-extra-keys') as AlertRuleSet;

  it('removes the rule and writes the rest', async () => {
    store(clone(STORED));
    const rec = recordRequests();
    const written = await client().alertRules.removeRule('example-rule-1');
    const expected = { ...STORED, rules: [STORED.rules[1]] };
    expect((await sent(rec, 1)).body).toStrictEqual(expected);
    expect(written).toStrictEqual(expected);
  });

  it('unknown id → ValidationError, GET only', async () => {
    store(clone(STORED));
    const rec = recordRequests();
    await expect(client().alertRules.removeRule('absent')).rejects.toSatisfy(
      (e) => e instanceof ValidationError && (e.details as string[])[0] === 'ruleId'
    );
    expect(rec.requests.map((r) => r.method)).toStrictEqual(['GET']);
  });

  it('non-canonical stored document → refusal, GET only', async () => {
    store(body('alert-rules-array'));
    const rec = recordRequests();
    await expect(client().alertRules.removeRule('example-rule-1')).rejects.toBeInstanceOf(
      ValidationError
    );
    expect(rec.requests.map((r) => r.method)).toStrictEqual(['GET']);
  });

  it('empty or non-string id → ValidationError, no request', async () => {
    const rec = recordRequests();
    for (const id of ['', 5]) {
      await expect(client().alertRules.removeRule(id as never)).rejects.toBeInstanceOf(
        ValidationError
      );
    }
    expect(rec.requests).toHaveLength(0);
  });

  it('a null entry among stored rules is skipped when looking up the id, and blocks the write', async () => {
    store({ name: '', rules: [null, clone(RULE)] });
    const rec = recordRequests();
    await expect(client().alertRules.removeRule('rule-new')).rejects.toSatisfy(
      (e) =>
        e instanceof ValidationError &&
        (e.details as string[]).some((d) => d.startsWith('rules[0] RULE_NOT_OBJECT'))
    );
    expect(rec.requests.map((r) => r.method)).toStrictEqual(['GET']);
  });
});

describe('alertRules.setRuleEnabled (R5)', () => {
  const STORED = body('alert-rules-extra-keys') as AlertRuleSet;

  it('false → disabled: true', async () => {
    store(clone(STORED));
    const rec = recordRequests();
    const written = await client().alertRules.setRuleEnabled('example-rule-1', false);
    const expected = clone(STORED);
    (expected.rules[0] as AlertRule).disabled = true;
    expect((await sent(rec, 1)).body).toStrictEqual(expected);
    expect(written).toStrictEqual(expected);
  });

  it('true → the disabled key is deleted (not false)', async () => {
    store(clone(STORED));
    const rec = recordRequests();
    await client().alertRules.setRuleEnabled('example-rule-2', true);
    const post = (await sent(rec, 1)).body as AlertRuleSet;
    expect('disabled' in (post.rules[1] as object)).toBe(false);
    const { disabled: _d, ...enabled } = STORED.rules[1] as AlertRule;
    expect(post).toStrictEqual({ ...STORED, rules: [STORED.rules[0], enabled] });
  });

  it('already disabled + false → POST still sent with an identical document', async () => {
    store(clone(STORED));
    const rec = recordRequests();
    await client().alertRules.setRuleEnabled('example-rule-2', false);
    expect(rec.requests.map((r) => r.method)).toStrictEqual(['GET', 'POST']);
    expect((await sent(rec, 1)).body).toStrictEqual(STORED);
  });

  it('unknown id → ValidationError, GET only', async () => {
    store(clone(STORED));
    const rec = recordRequests();
    await expect(client().alertRules.setRuleEnabled('absent', true)).rejects.toBeInstanceOf(
      ValidationError
    );
    expect(rec.requests.map((r) => r.method)).toStrictEqual(['GET']);
  });

  it('enabling a rule whose leaf lacks value → ValidationError, GET only', async () => {
    store({ name: '', rules: [{ ...INVALID_ENABLED_RULE, disabled: true }] });
    const rec = recordRequests();
    await expect(client().alertRules.setRuleEnabled('rule-bad', true)).rejects.toSatisfy(
      (e) =>
        e instanceof ValidationError &&
        (e.details as string[]).some((d) => d.includes('CONDITION_VALUE_MISSING'))
    );
    expect(rec.requests.map((r) => r.method)).toStrictEqual(['GET']);
  });

  it('enabled not boolean, or empty id → ValidationError, no request', async () => {
    const rec = recordRequests();
    await expect(
      client().alertRules.setRuleEnabled('example-rule-1', 'yes' as never)
    ).rejects.toSatisfy(
      (e) => e instanceof ValidationError && (e.details as string[])[0] === 'enabled'
    );
    await expect(client().alertRules.setRuleEnabled('', false)).rejects.toSatisfy(
      (e) => e instanceof ValidationError && (e.details as string[])[0] === 'ruleId'
    );
    expect(rec.requests).toHaveLength(0);
  });
});

describe('namespace resolution of every method (R6)', () => {
  const STORED = body('alert-rules-extra-keys') as AlertRuleSet;
  const calls: Array<[string, (c: RtlsClient, o?: { namespace: string }) => Promise<unknown>]> = [
    ['get', (c, o) => c.alertRules.get(o)],
    ['replace', (c, o) => c.alertRules.replace(clone(STORED), o)],
    ['upsertRule', (c, o) => c.alertRules.upsertRule(clone(RULE), o)],
    ['removeRule', (c, o) => c.alertRules.removeRule('example-rule-1', o)],
    ['setRuleEnabled', (c, o) => c.alertRules.setRuleEnabled('example-rule-1', false, o)],
  ];

  it.each(calls)('%s uses the default namespace and options.namespace', async (_m, call) => {
    store(clone(STORED));
    const rec = recordRequests();
    await call(client());
    await call(client(), { namespace: 'other' });
    await call(bare(), { namespace: 'bare' });
    const paths = rec.requests.map((r) => r.url.pathname);
    expect(new Set(paths)).toStrictEqual(
      new Set(['/api/alert_rules/test-ns', '/api/alert_rules/other', '/api/alert_rules/bare'])
    );
  });

  it.each(calls)('%s without any namespace → ContextError, no request', async (_m, call) => {
    const rec = recordRequests();
    await expect(call(bare())).rejects.toBeInstanceOf(ContextError);
    expect(rec.requests).toHaveLength(0);
  });

  const methods: Record<string, string[]> = {
    get: ['GET'],
    replace: ['POST'],
    upsertRule: ['GET', 'POST'],
    removeRule: ['GET', 'POST'],
    setRuleEnabled: ['GET', 'POST'],
  };

  it.each(calls)('%s forwards request options to every request it sends', async (m, call) => {
    store(clone(STORED));
    const rec = recordRequests();
    await call(client(), { namespace: 'test-ns', headers: { 'X-Trace': 't' } } as never);
    expect(rec.requests.map((r) => r.method)).toStrictEqual(methods[m]);
    expect(rec.requests.map((r) => r.headers.get('x-trace'))).toStrictEqual(
      (methods[m] as string[]).map(() => 't')
    );
  });
});
