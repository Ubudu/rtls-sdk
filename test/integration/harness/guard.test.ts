import { existsSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { server } from '../../mocks/server';
import { setActiveHarness } from './active';
import { BudgetExceeded } from './budgets';
import { createUnreachableClient } from './client';
import { validateChange } from './config-resources';
import type { Harness } from './context';
import type { Tier } from './env';
import {
  expectGuardViolation,
  guardedFetch,
  GuardViolation,
  runWithGuardScope,
  trackCreated,
  type GuardScope,
} from './guard';
import {
  DUMMY_API_KEY,
  UNREACHABLE_BASE_URLS,
  type DomainKey,
  type PreflightVerdicts,
} from './policy';
import {
  apiUrl,
  FOREIGN_MAC,
  getInit,
  inBlock,
  jsonInit,
  makeHarness,
  RUN_PREFIX,
  SAFE_PREFLIGHT,
  SELF_USER,
  TEST_KEY,
  TEST_MAC,
  TEST_NS,
  useDefaultApi,
} from './unit-support';

const ALL_TIERS = { W: true, C: true, S: true } as const;
const MAC2 = '02:5D:4B:3F:A9:02';
const NOW = 1_700_000_000_000;
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

beforeEach(() => useDefaultApi());
afterEach(() => {
  setActiveHarness(null);
  vi.useRealTimers();
});

const post = (path: string, body: unknown, key?: string): Promise<Response> =>
  guardedFetch(apiUrl(path), jsonInit('POST', body, key));
const send = (method: string, path: string, body?: unknown): Promise<Response> =>
  guardedFetch(
    apiUrl(path),
    body === undefined ? { method, headers: { 'X-API-Key': TEST_KEY } } : jsonInit(method, body)
  );
const get = (path: string, key?: string): Promise<Response> =>
  guardedFetch(apiUrl(path), getInit(key));

function used(h: Harness): Record<string, number> {
  const report = h.budgetReport();
  return Object.fromEntries(Object.entries(report).map(([k, v]) => [k, v.used]));
}

/** A mapping profile id the ETL tests track as created by this run, and its server copy. */
const ETL_PROFILE = '64b0000000000000000000e1';
const etlProfile = (patch: Record<string, unknown> = {}): Record<string, unknown> => ({
  _id: ETL_PROFILE,
  name: `${RUN_PREFIX}profile`,
  applicationId: TEST_NS,
  keyColumns: ['MAC'],
  mappings: { user_udid: { sourceColumn: 'MAC' }, user_name: { sourceColumn: 'Name' } },
  ...patch,
});
/** Serves the profile read of a writing upload (GET /etl/mapping-profiles/{id}). */
function serveProfile(profile: Record<string, unknown> | null): void {
  server.use(
    http.get(apiUrl(`/etl/mapping-profiles/${ETL_PROFILE}`), () =>
      profile === null
        ? HttpResponse.json({ error: 'Mapping profile not found' }, { status: 404 })
        : HttpResponse.json(profile)
    )
  );
}

function etlForm(
  content: BlobPart,
  fileName: string,
  type: string,
  debug: boolean,
  profileIds: string[] = [ETL_PROFILE]
): FormData {
  const form = new FormData();
  form.append('mappingProfileIds', JSON.stringify(profileIds));
  form.append('debugMode', debug ? 'true' : 'false');
  form.append('file', new Blob([content], { type }), fileName);
  return form;
}
const upload = (form: FormData): Promise<Response> =>
  guardedFetch(apiUrl('/etl/upload'), {
    method: 'POST',
    headers: { 'X-API-Key': TEST_KEY },
    body: form,
  });

const unsafe = (patch: Partial<PreflightVerdicts>): PreflightVerdicts => ({
  ...SAFE_PREFLIGHT,
  ...patch,
});

const alertRulesDoc = {
  name: 'rules',
  rules: [
    {
      id: 'real-rule-1',
      conditions: { all: [{ fact: 'user_udid', operator: 'equal', value: FOREIGN_MAC }] },
      event: { type: 'message', params: {} },
    },
  ],
};

function configScope(h: Harness, before: unknown, lockHeld = true): GuardScope {
  return {
    kind: 'config',
    resource: 'alert-rules',
    before,
    mode: 'cycle',
    validate: (body) => validateChange('alert-rules', before, body, { runId: h.runId }),
    lockHeld: () => lockHeld,
  };
}

describe('G1 host', () => {
  it('rejects a foreign host or base path and admits the configured base URL', async () => {
    const { calls } = makeHarness();
    await expectGuardViolation('G1', () => guardedFetch('https://evil.test/api/health', getInit()));
    await expectGuardViolation('G1', () =>
      guardedFetch('https://rtls.test/other/health', getInit())
    );
    expect(calls).toHaveLength(0);
    expect((await get('/health')).status).toBe(200);
    expect(calls).toHaveLength(1);
  });

  it('admits each unreachable URL with the dummy key or no credential', async () => {
    const { h, calls } = makeHarness();
    for (const base of Object.values(UNREACHABLE_BASE_URLS)) {
      expect((await guardedFetch(`${base}/health`, getInit(DUMMY_API_KEY))).status).toBe(200);
      expect((await guardedFetch(`${base}/health`)).status).toBe(200);
    }
    expect(calls).toHaveLength(6);
    expect(h.violations()).toEqual([]);
  });

  it('rejects an unreachable URL carrying the configured key (header, bearer or query)', async () => {
    const { calls } = makeHarness();
    const base = UNREACHABLE_BASE_URLS.blackhole;
    await expectGuardViolation('G1', () => guardedFetch(`${base}/health`, getInit(TEST_KEY)));
    await expectGuardViolation('G1', () =>
      guardedFetch(`${base}/health`, { headers: { Authorization: `Bearer ${TEST_KEY}` } })
    );
    await expectGuardViolation('G1', () => guardedFetch(`${base}/health?apiKey=${TEST_KEY}`));
    expect(calls).toHaveLength(0);
    expect((await guardedFetch(`${base}/health`, getInit(DUMMY_API_KEY))).status).toBe(200);
  });

  it('matches unreachable URLs by origin: http://127.0.0.1:9/ without /api and another key is rejected', async () => {
    const { calls } = makeHarness();
    await expectGuardViolation('G1', () =>
      guardedFetch('http://127.0.0.1:9/', getInit('another-key'))
    );
    await expectGuardViolation('G1', () =>
      guardedFetch('http://127.0.0.1:9/x/y', getInit(TEST_KEY))
    );
    expect(calls).toHaveLength(0);
    expect((await guardedFetch('http://127.0.0.1:9/', getInit(DUMMY_API_KEY))).status).toBe(200);
  });

  it('with RTLS_BASE_URL unreachable and RTLS_API_KEY the dummy key, a GET and a POST pass in both modes', async () => {
    for (const mode of ['integration', 'example'] as const) {
      const { h, calls } = makeHarness({
        baseUrl: UNREACHABLE_BASE_URLS.refused,
        apiKey: DUMMY_API_KEY,
        mode,
      });
      const base = UNREACHABLE_BASE_URLS.refused;
      expect((await guardedFetch(`${base}/health`, getInit(DUMMY_API_KEY))).status).toBe(200);
      expect(
        (await guardedFetch(`${base}/dashboards`, jsonInit('POST', { name: 'x' }, DUMMY_API_KEY)))
          .status
      ).toBe(201);
      expect(calls).toHaveLength(2);
      expect(h.violations()).toEqual([]);
    }
  });

  it('createUnreachableClient() sends the dummy key to the RFC 5737 URL; a POST there passes G14', async () => {
    const { h, calls } = makeHarness();
    const client = createUnreachableClient();
    await expect(client.health()).resolves.toEqual({ status: 'OK' });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(`${UNREACHABLE_BASE_URLS.blackhole}/health`);
    expect(calls[0]?.headers.get('x-api-key')).toBe(DUMMY_API_KEY);
    const response = await guardedFetch(
      `${UNREACHABLE_BASE_URLS.blackhole}/dashboards`,
      jsonInit('POST', { name: 'x' }, DUMMY_API_KEY)
    );
    expect(response.status).toBe(201);
    expect(h.violations()).toEqual([]);
  });

  it('createUnreachableClient({ retry, fetch }) keeps the dummy key and the run namespace', async () => {
    const { calls } = makeHarness();
    const wrapper = vi.fn((input: RequestInfo | URL, init?: RequestInit) =>
      guardedFetch(input, init)
    );
    const options = { retry: false, fetch: wrapper as typeof fetch, target: 'refused' as const };
    const client = createUnreachableClient(options);
    expect(client.namespace).toBe(TEST_NS);
    await expect(client.health()).resolves.toEqual({ status: 'OK' });
    expect(wrapper).toHaveBeenCalledTimes(1);
    expect(calls[0]?.url).toBe(`${UNREACHABLE_BASE_URLS.refused}/health`);
    expect(calls[0]?.headers.get('x-api-key')).toBe(DUMMY_API_KEY);
  });
});

describe('G1 redirects (never followed)', () => {
  it('a 3xx answer is a G1 violation; the second hop is never sent (MSW)', async () => {
    const { h, calls } = makeHarness({ tiers: { W: true } });
    let secondHop = 0;
    server.use(
      http.post(apiUrl(`/assets/{ns}/${TEST_MAC}`), () =>
        HttpResponse.text('', {
          status: 307,
          headers: { Location: apiUrl(`/assets/other-ns/${FOREIGN_MAC}`) },
        })
      ),
      http.get(apiUrl('/health'), () =>
        HttpResponse.text('', { status: 302, headers: { Location: 'https://evil.test/x' } })
      ),
      http.all(apiUrl(`/assets/other-ns/${FOREIGN_MAC}`), () => {
        secondHop += 1;
        return HttpResponse.json({ ok: true });
      }),
      http.all('https://evil.test/*', () => {
        secondHop += 1;
        return HttpResponse.json({ ok: true });
      })
    );
    await inBlock(h, 'W', () =>
      expectGuardViolation('G1', () =>
        post(`/assets/{ns}/${TEST_MAC}`, { user_udid: TEST_MAC, user_name: `${RUN_PREFIX}a` })
      )
    );
    await expectGuardViolation('G1', () => get('/health'));
    expect(calls.map((c) => [c.method, c.redirect])).toEqual([
      ['POST', 'manual'],
      ['GET', 'manual'],
    ]);
    expect(secondHop).toBe(0);
    expect(h.violations().map((v) => [v.rule, v.method, v.template])).toEqual([
      ['G1', 'POST', '/assets/{ns}/{mac_address}'],
      ['G1', 'GET', '/health'],
    ]);
  });

  it('loopback: a 307 to another origin never reaches it, with or without the key (real fetch)', async () => {
    let hopsB = 0;
    const b = createServer((_req, res) => {
      hopsB += 1;
      res.writeHead(201, { 'content-type': 'application/json' });
      res.end('{}');
    });
    await new Promise<void>((resolve) => b.listen(0, '127.0.0.1', resolve));
    const portB = (b.address() as AddressInfo).port;
    const a = createServer((_req, res) => {
      res.writeHead(307, {
        Location: `http://127.0.0.1:${portB}/api/assets/other-ns/${FOREIGN_MAC}`,
      });
      res.end();
    });
    await new Promise<void>((resolve) => a.listen(0, '127.0.0.1', resolve));
    const portA = (a.address() as AddressInfo).port;
    try {
      const { h } = makeHarness({ tiers: { W: true }, baseUrl: `http://127.0.0.1:${portA}/api` });
      await inBlock(h, 'W', () =>
        expectGuardViolation('G1', () =>
          guardedFetch(
            `http://127.0.0.1:${portA}/api/assets/${TEST_NS}/${TEST_MAC}`,
            jsonInit('POST', { user_udid: TEST_MAC, user_name: `${RUN_PREFIX}a` })
          )
        )
      );
      const request = new Request(`http://127.0.0.1:${portA}/api/health`, {
        headers: { 'X-API-Key': TEST_KEY },
        redirect: 'follow',
      });
      await expectGuardViolation('G1', () => guardedFetch(request));
      expect(hopsB).toBe(0);
    } finally {
      await new Promise((resolve) => a.close(resolve));
      await new Promise((resolve) => b.close(resolve));
    }
  });
});

describe('G2 never', () => {
  it('rejects /admin/x and the never-called routes; admits an ordinary read', async () => {
    const { h, calls } = makeHarness({ tiers: ALL_TIERS });
    const never: [string, string][] = [
      ['GET', '/admin/x'],
      ['GET', '/internal/svc/{ns}/config'],
      ['GET', '/esl/config/pdi-event-tracking'],
      ['GET', '/ai-agent/{ns}/status'],
      ['GET', '/ai/{ns}/config'],
      ['GET', '/status/db'],
      ['POST', '/settings/{ns}'],
      ['POST', '/assets_library/{ns}'],
      ['POST', '/data_filters_taxonomy/{ns}'],
      ['DELETE', '/venues/cache/invalidate/1'],
      ['POST', '/notifications/{ns}/item-1/mute'],
    ];
    await inBlock(h, 'W', async () => {
      for (const [method, path] of never) {
        await expectGuardViolation('G2', () =>
          send(method, path, method === 'GET' || method === 'DELETE' ? undefined : {})
        );
      }
    });
    expect(calls).toHaveLength(0);
    expect(h.violations().map((v) => v.rule)).toEqual(Array(never.length).fill('G2'));
    expect((await get('/venues/{ns}')).status).toBe(200);
    expect(calls).toHaveLength(1);
  });

  it('rejects POST …/accessible-path in every tier', async () => {
    for (const tier of ['R', 'W', 'C', 'S'] as Tier[]) {
      const { h, calls } = makeHarness({ tiers: ALL_TIERS });
      await inBlock(h, tier, () =>
        expectGuardViolation('G2', () =>
          post('/spatial/navigate/{ns}/accessible-path', { from: 1, to: 2 })
        )
      );
      expect(calls).toHaveLength(0);
    }
  });

  it('rejects every excluded operation, reads included (/venues/cache/stats)', async () => {
    const { calls } = makeHarness();
    for (const path of [
      '/venues/cache/stats',
      '/spatial/navigate/{ns}/statistics',
      '/spatial/navigate/{ns}/graph-analysis',
      '/spatial/navigate/{ns}/graph-quality',
      '/asset_stats/{ns}/0/1',
      '/universal-filtering/documentation',
      '/venues/{ns}/1/maps/2',
      '/etl/check-mappings',
    ]) {
      await expectGuardViolation('G2', () => get(path));
    }
    expect(calls).toHaveLength(0);
  });
});

describe('G3 namespace pin', () => {
  it('rejects a foreign namespace in the path, the query, the body and an array item', async () => {
    const { h, calls } = makeHarness({ tiers: { W: true } });
    await expectGuardViolation('G3', () => get('/assets/other-ns'));
    await expectGuardViolation('G3', () => get('/assets/sdk-test-foreign'));
    await expectGuardViolation('G3', () => get('/etl/mappings?applicationId=other-ns'));
    await inBlock(h, 'W', async () => {
      await expectGuardViolation('G3', () =>
        post('/dashboards', { name: `${RUN_PREFIX}d`, application_namespace: 'other-ns' })
      );
      await expectGuardViolation('G3', () =>
        post('/assets/{ns}', [
          { user_udid: TEST_MAC, user_name: `${RUN_PREFIX}a`, app_namespace: 'other-ns' },
        ])
      );
      await expectGuardViolation('G3', () =>
        post('/etl/mapping-profiles', {
          name: `${RUN_PREFIX}p`,
          items: [{ applicationId: 'other-ns' }],
        })
      );
    });
    expect(calls).toHaveLength(0);
    expect((await get(`/etl/mappings?applicationId=${TEST_NS}`)).status).toBe(200);
    expect((await get('/assets/{ns}')).status).toBe(200);
  });

  it('targetApplications is a list of namespaces: every entry must be APP_NAMESPACE (body, items, query, form, publish)', async () => {
    const { h, calls } = makeHarness({ tiers: { W: true, S: true } });
    const asset = (targets: unknown): Record<string, unknown> => ({
      user_udid: TEST_MAC,
      user_name: `${RUN_PREFIX}a`,
      targetApplications: targets,
    });
    await expectGuardViolation('G3', () => get('/assets/{ns}?targetApplications=other-ns'));
    await expectGuardViolation('G3', () => get('/assets/{ns}?targetApplications[]=other-ns'));
    await inBlock(h, 'W', async () => {
      for (const targets of [['other-ns'], [TEST_NS, 'other-ns'], 'other-ns', [{}], { a: 1 }])
        await expectGuardViolation('G3', () => post(`/assets/{ns}/${TEST_MAC}`, asset(targets)));
      await expectGuardViolation('G3', () => post('/assets/{ns}', [asset(['other-ns'])]));
      await expectGuardViolation('G3', () =>
        post('/assets/{ns}', { assets: [asset(['other-ns'])] })
      );
      const form = new FormData();
      form.append('targetApplications[]', 'other-ns');
      form.append('file', new Blob(['x'], { type: 'text/plain' }), 'a.txt');
      await expectGuardViolation('G3', () =>
        guardedFetch(apiUrl(`/assets/{ns}/${TEST_MAC}/documents`), {
          method: 'POST',
          headers: { 'X-API-Key': TEST_KEY },
          body: form,
        })
      );
    });
    await inBlock(h, 'S', () =>
      expectGuardViolation('G3', () =>
        post('/publisher/{ns}', [{ user_uuid: TEST_MAC, targetApplications: ['other-ns'] }])
      )
    );
    expect(calls).toHaveLength(0);
    await inBlock(h, 'W', async () => {
      for (const targets of [[TEST_NS], TEST_NS, [], null])
        await post(`/assets/{ns}/${TEST_MAC}`, asset(targets));
    });
    expect(calls).toHaveLength(4);
  });

  it('rejects a namespace query key written with brackets or a dot (qs syntax)', async () => {
    const { calls } = makeHarness();
    for (const query of [
      'applicationId[]=other-ns',
      'applicationId%5B%5D=other-ns',
      'applicationId[0]=other-ns',
      'app_namespace[x]=other-ns',
      'namespace.x=other-ns',
      '%5BapplicationId%5D=other-ns',
      '[applicationId]x=other-ns',
      '[namespace]=other-ns',
      '.app_namespace=other-ns',
    ]) {
      await expectGuardViolation('G3', () => get(`/etl/mappings?${query}`));
    }
    expect(calls).toHaveLength(0);
    expect((await get(`/etl/mappings?applicationId[]=${TEST_NS}`)).status).toBe(200);
    expect(calls).toHaveLength(1);
  });

  it('rejects an unknown path', async () => {
    const { calls } = makeHarness();
    await expectGuardViolation('G3', () => get('/nope/{ns}'));
    await expectGuardViolation('G3', () => get('/assets/{ns}/a/b/c'));
    expect(calls).toHaveLength(0);
  });

  it('matches the Express-style spec path for /spatial/assets/{ns}/nearest-to-point', async () => {
    const { calls } = makeHarness();
    expect((await get('/spatial/assets/{ns}/nearest-to-point?lat=1&lng=2')).status).toBe(200);
    await expectGuardViolation('G3', () => get('/spatial/assets/other-ns/nearest-to-point'));
    expect(calls).toHaveLength(1);
  });
});

describe('G4 tier methods', () => {
  it('teardown applies the run tier flags: no write in an R-only run, never an S-class request', async () => {
    const asset = { user_udid: TEST_MAC, user_name: `${RUN_PREFIX}a` };
    const rOnly = makeHarness();
    await runWithGuardScope({ kind: 'teardown' }, async () => {
      await expectGuardViolation('G4', () => post(`/assets/{ns}/${TEST_MAC}`, asset));
      await expectGuardViolation('G4', () => post('/dashboards', { name: `${RUN_PREFIX}d` }));
      await expectGuardViolation('G4', () => send('DELETE', `/assets/{ns}/${TEST_MAC}`));
      expect((await get('/dashboards')).status).toBe(200);
    });
    expect(rOnly.calls.map((c) => c.method)).toEqual(['GET']);
    const all = makeHarness({ tiers: ALL_TIERS });
    await runWithGuardScope({ kind: 'teardown' }, async () => {
      await expectGuardViolation('G4', () => post('/publisher/{ns}', { user_udid: TEST_MAC }));
      await send('DELETE', `/assets/{ns}/${TEST_MAC}`);
    });
    expect(all.calls.map((c) => c.method)).toEqual(['DELETE']);
  });

  it('a replayed cleanup only removes: DELETE, bulk-clear-declared, a bulk delete, a PATCH to enabled: false', async () => {
    const { h, calls } = makeHarness({ tiers: ALL_TIERS });
    trackCreated('rule-1');
    trackCreated('item-1');
    const replay = (fn: () => Promise<unknown>): Promise<unknown> =>
      runWithGuardScope({ kind: 'teardown', replay: true }, fn);
    await replay(async () => {
      await expectGuardViolation('G4', () =>
        post(`/assets/{ns}/${TEST_MAC}`, { user_udid: TEST_MAC, user_name: `${RUN_PREFIX}a` })
      );
      await expectGuardViolation('G4', () =>
        send('PATCH', '/notifications/{ns}/rules/rule-1', {
          name: `${RUN_PREFIX}r`,
          enabled: false,
        })
      );
      await expectGuardViolation('G4', () =>
        post('/notifications/{ns}/bulk', { ids: ['item-1'], action: 'archive' })
      );
      await send('DELETE', `/assets/{ns}/${TEST_MAC}`);
      await post('/assets/{ns}/bulk-clear-declared', { mac_addresses: [TEST_MAC] });
      await post('/notifications/{ns}/bulk', { ids: ['item-1'], action: 'delete' });
      await send('PATCH', '/notifications/{ns}/rules/rule-1', { enabled: false });
    });
    // a block's replay (scope cleanup) follows the same rule under the block's tiers
    await inBlock(h, 'W', () =>
      runWithGuardScope({ kind: 'cleanup' }, () =>
        expectGuardViolation('G4', () => post('/dashboards', { name: `${RUN_PREFIX}d` }))
      )
    );
    expect(calls.map((c) => c.method)).toEqual(['DELETE', 'POST', 'POST', 'PATCH']);
  });

  it('rejects a POST in R and outside any block; admits GETs outside any block', async () => {
    const { h, calls } = makeHarness({ tiers: ALL_TIERS });
    await inBlock(h, 'R', () =>
      expectGuardViolation('G4', () => post('/dashboards', { name: `${RUN_PREFIX}d` }))
    );
    await expectGuardViolation('G4', () => post('/dashboards', { name: `${RUN_PREFIX}d` }));
    await expectGuardViolation('G4', () =>
      post('/spatial/zones/{ns}/analyze-custom', { zones: [] })
    );
    expect(calls).toHaveLength(0);
    expect((await get('/dashboards')).status).toBe(200);
  });

  it('admits each READ_ONLY_POSTS operation in R', async () => {
    const { h, calls } = makeHarness();
    await inBlock(h, 'R', async () => {
      await post('/es/query/{ns}/positions', {
        size: 10,
        query: { range: { timestamp: { gte: 1 } } },
      });
      await post('/spatial/zones/{ns}/analyze-custom', { zones: [] });
      await post('/spatial/zones/{ns}/calculate-distances', { points: [] });
      await post('/spatial/pois/{ns}/analyze-custom', { pois: [] });
      await post('/spatial/navigate/{ns}/shortest-path', { venueId: 1 });
      await post('/spatial/navigate/{ns}/multi-stop', { venueId: 1 });
      const form = new FormData();
      form.append('file', new Blob(['a,b\n'], { type: 'text/csv' }), 'h.csv');
      await guardedFetch(apiUrl('/etl/parse-excel-headers'), {
        method: 'POST',
        headers: { 'X-API-Key': TEST_KEY },
        body: form,
      });
    });
    expect(calls.map((c) => c.method)).toEqual(Array(7).fill('POST'));
    expect(h.violations()).toEqual([]);
  });

  it('rejects a W write inside an S block unless RTLS_IT_WRITES=1', async () => {
    const off = makeHarness({ tiers: { S: true } });
    await inBlock(off.h, 'S', () =>
      expectGuardViolation('G4', () => post('/dashboards', { name: `${RUN_PREFIX}d` }))
    );
    expect(off.calls).toHaveLength(0);
    const on = makeHarness({ tiers: { S: true, W: true } });
    await inBlock(on.h, 'S', () => post('/dashboards', { name: `${RUN_PREFIX}d` }));
    expect(on.calls).toHaveLength(1);
  });

  it('a C block admits no W write', async () => {
    const { h, calls } = makeHarness({ tiers: ALL_TIERS });
    await inBlock(h, 'C', () =>
      expectGuardViolation('G4', () => post('/dashboards', { name: `${RUN_PREFIX}d` }))
    );
    expect(calls).toHaveLength(0);
  });
});

describe('G5 test entities', () => {
  it('admits a create with the run prefix and a PUT on its auto-tracked id; rejects a PUT on an untracked id', async () => {
    const { h, calls } = makeHarness({ tiers: { W: true } });
    await inBlock(h, 'W', async () => {
      const created = await post('/dashboards', { name: `${RUN_PREFIX}dash`, data: [] });
      expect(created.status).toBe(201);
      expect(h.isTracked('created-id-1')).toBe(true);
      const createdFile = JSON.parse(readFileSync(h.createdPath, 'utf8'));
      expect(createdFile.ids).toContain('created-id-1');
      expect(
        (await send('PUT', '/dashboards/created-id-1', { name: `${RUN_PREFIX}dash` })).status
      ).toBe(201);
      await expectGuardViolation('G5', () =>
        send('PUT', '/dashboards/untracked-id', { name: 'x' })
      );
      await expectGuardViolation('G5', () =>
        post('/dashboards', { name: 'sdk-test-0000aaaa-other' })
      );
    });
    expect(calls).toHaveLength(2);
  });

  it('rejects a saved-view create with a blank or unprefixed name', async () => {
    const { h, calls } = makeHarness({ tiers: { W: true } });
    await inBlock(h, 'W', async () => {
      await expectGuardViolation('G5', () =>
        post('/notifications/{ns}/saved-views', { name: '   ' })
      );
      await expectGuardViolation('G5', () =>
        post('/notifications/{ns}/saved-views', { name: 'x' })
      );
      await post('/notifications/{ns}/saved-views', { name: `${RUN_PREFIX}view` });
    });
    expect(calls).toHaveLength(1);
  });

  it('(c) holds only for the create collections: a prefixed name never admits an action on a foreign entity', async () => {
    const { h, calls } = makeHarness({ tiers: { W: true } });
    const FOREIGN_ID = '64b0000000000000000000ff';
    await inBlock(h, 'W', async () => {
      await expectGuardViolation('G5', () =>
        post(`/dashboards/${FOREIGN_ID}/share`, {
          users: [{ username: 'someone-else', permissions: ['view', 'edit'] }],
          name: `${RUN_PREFIX}x`,
        })
      );
      await expectGuardViolation('G5', () =>
        post(`/notifications/{ns}/${FOREIGN_ID}/archive`, { title: `${RUN_PREFIX}x` })
      );
      // the spec declares no POST on tenant-config: the method is not admitted whatever the body
      await expectGuardViolation('G3', () =>
        post('/notifications/{ns}/tenant-config', { name: `${RUN_PREFIX}x` })
      );
      await expectGuardViolation('G3', () =>
        send('PATCH', '/notifications/{ns}/rules', { name: `${RUN_PREFIX}x`, enabled: false })
      );
      for (const path of [
        '/dashboards',
        '/notifications/{ns}/rules',
        '/notifications/{ns}/saved-views',
        '/etl/mapping-profiles',
      ]) {
        await post(path, { name: `${RUN_PREFIX}c`, enabled: false, applicationId: TEST_NS });
      }
    });
    expect(calls.map((c) => new URL(c.url).pathname)).toEqual([
      '/api/dashboards',
      `/api/notifications/${TEST_NS}/rules`,
      `/api/notifications/${TEST_NS}/saved-views`,
      '/api/etl/mapping-profiles',
    ]);
    expect(h.isTracked(FOREIGN_ID)).toBe(false);
    expect(
      (
        await guardedFetch(apiUrl('/health'), {
          method: 'HEAD',
          headers: { 'X-API-Key': TEST_KEY },
        })
      ).status
    ).toBe(200);
  });

  it('response ids are tracked only for a create or a request on an entity of this run', async () => {
    const { h } = makeHarness({ tiers: { W: true } });
    server.use(
      http.delete(apiUrl('/dashboards/000000000000000000000000'), () =>
        HttpResponse.json({ _id: 'foreign-from-made-up' })
      ),
      http.put(apiUrl('/dashboards/created-id-1'), () =>
        HttpResponse.json({ _id: 'created-id-1', id: 'second-id' })
      )
    );
    await inBlock(h, 'W', async () => {
      await send('DELETE', '/dashboards/000000000000000000000000');
      await post('/dashboards', { name: `${RUN_PREFIX}d`, data: [] });
      await send('PUT', '/dashboards/created-id-1', { name: `${RUN_PREFIX}d` });
    });
    expect(h.isTracked('foreign-from-made-up')).toBe(false);
    expect([h.isTracked('created-id-1'), h.isTracked('second-id')]).toEqual([true, true]);
    expect(JSON.parse(readFileSync(h.createdPath, 'utf8')).ids).not.toContain(
      'foreign-from-made-up'
    );
  });

  it('sweeper and teardown requests track nothing (no stray runs/<id>.created.json)', async () => {
    const { h } = makeHarness({ tiers: { W: true } });
    server.use(
      http.post(apiUrl('/notifications/{ns}/bulk'), () =>
        HttpResponse.json({ affected: 1, undo_token: 'u-1' })
      ),
      http.delete(apiUrl('/dashboards/manual-id'), () => HttpResponse.json({ _id: 'x-new' }))
    );
    const bulk = `POST /notifications/${TEST_NS}/bulk`;
    await runWithGuardScope({ kind: 'sweeper', paths: new Set([bulk]) }, () =>
      post('/notifications/{ns}/bulk', { ids: ['item-1'], action: 'delete' })
    );
    expect(existsSync(h.createdPath)).toBe(false);
    trackCreated('manual-id');
    await runWithGuardScope({ kind: 'teardown' }, () => send('DELETE', '/dashboards/manual-id'));
    expect([h.isTracked('u-1'), h.isTracked('x-new')]).toEqual([false, false]);
    expect(JSON.parse(readFileSync(h.createdPath, 'utf8')).ids).toEqual(['manual-id']);
  });

  it('sweeper and teardown removals of a test asset or document record no test MAC', async () => {
    const { h, calls } = makeHarness({ tiers: { W: true } });
    const asset = `/assets/${TEST_NS}/${TEST_MAC}`;
    const doc = `${asset}/documents/doc-1`;
    const paths = new Set([`DELETE ${asset}`, `DELETE ${doc}`]);
    await runWithGuardScope({ kind: 'sweeper', paths }, async () => {
      await send('DELETE', `/assets/{ns}/${TEST_MAC}`);
      await send('DELETE', `/assets/{ns}/${TEST_MAC}/documents/doc-1`);
    });
    await runWithGuardScope({ kind: 'teardown' }, () => send('DELETE', `/assets/{ns}/${TEST_MAC}`));
    expect(calls).toHaveLength(3);
    expect(existsSync(h.createdPath)).toBe(false);
  });

  it('admits path ids with the run prefix or all zeros, and trackCreated ids', async () => {
    const { h, calls } = makeHarness({ tiers: { W: true } });
    await inBlock(h, 'W', async () => {
      await send('DELETE', `/dashboards/${RUN_PREFIX}missing`);
      await send('DELETE', '/dashboards/000000000000000000000000');
      trackCreated('manual-id');
      await send('DELETE', '/dashboards/manual-id');
      await expectGuardViolation('G5', () => send('DELETE', '/dashboards/foreign-id'));
    });
    expect(calls).toHaveLength(3);
  });

  it('made-up ids never admit a write keyed by the path: asset upsert, asset patch, document upload', async () => {
    const { h, calls } = makeHarness({ tiers: { W: true } });
    const zero = '000000000000000000000000';
    const asset = { user_udid: TEST_MAC, user_name: 'plain-name' };
    const pdf = (): RequestInit => {
      const form = new FormData();
      form.append('file', new Blob(['%PDF-1.4'], { type: 'application/pdf' }), 'a.pdf');
      return { method: 'POST', headers: { 'X-API-Key': TEST_KEY }, body: form };
    };
    await inBlock(
      h,
      'W',
      async () => {
        await expectGuardViolation('G5', () => post(`/assets/{ns}/${zero}`, asset));
        await expectGuardViolation('G5', () => post(`/assets/{ns}/${RUN_PREFIX}x`, asset));
        await expectGuardViolation('G5', () =>
          send('PATCH', `/assets/{ns}/${zero}`, { color: '#000000' })
        );
        await expectGuardViolation('G5', () =>
          guardedFetch(apiUrl(`/assets/{ns}/${RUN_PREFIX}x/documents`), pdf())
        );
        await expectGuardViolation('G5', () =>
          guardedFetch(apiUrl(`/assets/{ns}/${zero}/documents`), pdf())
        );
        // the "unknown id → 404" shapes stay admitted
        await send('DELETE', `/assets/{ns}/${zero}`);
        await get(`/assets/{ns}/${zero}`);
        await guardedFetch(apiUrl(`/assets/{ns}/${TEST_MAC}/documents`), pdf());
      },
      'assets'
    );
    expect(calls.map((c) => `${c.method} ${new URL(c.url).pathname}`)).toEqual([
      `DELETE /api/assets/${TEST_NS}/${zero}`,
      `GET /api/assets/${TEST_NS}/${zero}`,
      `POST /api/assets/${TEST_NS}/${TEST_MAC}/documents`,
    ]);
  });
});

describe('G6 MAC scan', () => {
  it('rejects a non-test MAC anywhere in a mutating body and admits test MACs', async () => {
    const { h, calls } = makeHarness({ tiers: { W: true } });
    await inBlock(h, 'W', async () => {
      await expectGuardViolation('G6', () =>
        post('/dashboards', { name: `${RUN_PREFIX}d`, data: [{ x: FOREIGN_MAC }] })
      );
      await expectGuardViolation('G6', () =>
        post('/dashboards', { name: `${RUN_PREFIX}d`, mac: 'AA:BB:CC:DD:EE:FF' })
      );
      await expectGuardViolation('G6', () =>
        post('/dashboards', { name: `${RUN_PREFIX}d`, mac_addresses: [TEST_MAC, FOREIGN_MAC] })
      );
      await post('/dashboards', { name: `${RUN_PREFIX}d`, data: [{ mac: TEST_MAC, other: MAC2 }] });
    });
    expect(calls).toHaveLength(1);
    expect(JSON.parse(readFileSync(h.createdPath, 'utf8')).macs).toEqual(
      expect.arrayContaining([TEST_MAC, '025d4b3fa902'])
    );
  });

  it('rejects a tag-action item with a non-test MAC (no real-tag exception)', async () => {
    const { h, calls } = makeHarness({ tiers: { S: true } });
    await inBlock(
      h,
      'S',
      async () => {
        await expectGuardViolation('G6', () =>
          post('/tag-actions/{ns}', [{ macAddress: FOREIGN_MAC, action: 'ptlGreen', duration: 2 }])
        );
        await post('/tag-actions/{ns}', [{ macAddress: TEST_MAC, action: 'ptlBlue' }]);
      },
      'assets'
    );
    expect(calls).toHaveLength(1);
    expect(used(h).bleActions).toBe(1);
  });
});

describe('G6 bodies the guard cannot inspect (fail closed)', () => {
  const streamOf = (text: string): ReadableStream<Uint8Array> =>
    new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(text));
        controller.close();
      },
    });
  const raw = (body: unknown, contentType = 'application/json'): RequestInit =>
    ({
      method: 'POST',
      headers: { 'X-API-Key': TEST_KEY, 'Content-Type': contentType },
      body,
      duplex: 'half',
    }) as RequestInit;

  it('a stream or async-iterable body is read once, checked, counted and sent as the same bytes', async () => {
    const { h, calls } = makeHarness({ tiers: { S: true } });
    const publish = JSON.stringify({ user_udid: TEST_MAC, lat: 1, lon: 2 });
    await inBlock(
      h,
      'S',
      async () => {
        await guardedFetch(apiUrl('/publisher/{ns}'), raw(streamOf(publish)));
        await expectGuardViolation('G6', () =>
          guardedFetch(
            apiUrl('/publisher/{ns}'),
            raw(streamOf(JSON.stringify({ user_udid: FOREIGN_MAC, lat: 1, lon: 2 })))
          )
        );
        async function* chunks(): AsyncGenerator<Uint8Array> {
          yield new TextEncoder().encode(publish);
        }
        await guardedFetch(apiUrl('/publisher/{ns}'), raw(chunks()));
      },
      'positions-spatial'
    );
    expect(calls).toHaveLength(2);
    expect(await calls[0]?.text()).toBe(publish);
    expect(await calls[1]?.text()).toBe(publish);
    expect(used(h).positions).toBe(2);
  });

  it('a JSON body sent as application/octet-stream is parsed as JSON (G6, G7 counting)', async () => {
    const { h, calls } = makeHarness({ tiers: { S: true } });
    const bytes = (value: unknown): Uint8Array => new TextEncoder().encode(JSON.stringify(value));
    await inBlock(
      h,
      'S',
      async () => {
        await expectGuardViolation('G6', () =>
          guardedFetch(
            apiUrl('/publisher/{ns}'),
            raw(bytes({ user_udid: FOREIGN_MAC }), 'application/octet-stream')
          )
        );
        await guardedFetch(
          apiUrl('/publisher/{ns}'),
          raw(bytes({ user_udid: TEST_MAC }), 'application/octet-stream')
        );
      },
      'positions-spatial'
    );
    expect(calls).toHaveLength(1);
    expect(used(h).positions).toBe(1);
  });

  it('a declared_location in a stream body is a declared write (tier S + W, G18 declaredPositionSafe)', async () => {
    const body = (): ReadableStream<Uint8Array> =>
      streamOf(
        JSON.stringify({
          user_udid: TEST_MAC,
          user_name: `${RUN_PREFIX}a`,
          declared_location: { lat: 1, lng: 2, level: 0 },
        })
      );
    const path = apiUrl(`/assets/{ns}/${TEST_MAC}`);
    const w = makeHarness({ tiers: { W: true } });
    await inBlock(w.h, 'W', () =>
      expectGuardViolation('G4', () => guardedFetch(path, raw(body())))
    );
    const s = makeHarness({
      tiers: { W: true, S: true },
      preflight: { ...SAFE_PREFLIGHT, declaredPositionSafe: false },
    });
    await inBlock(s.h, 'S', () =>
      expectGuardViolation('G18', () => guardedFetch(path, raw(body())))
    );
    expect([w.calls.length, s.calls.length]).toEqual([0, 0]);
  });

  it('a binary or unreadable body on a mutating request is rejected; a GET is not affected', async () => {
    const { h, calls } = makeHarness({ tiers: { W: true } });
    const failing = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.error(new Error('broken stream'));
      },
    });
    await inBlock(h, 'W', async () => {
      await expectGuardViolation('G6', () =>
        guardedFetch(
          apiUrl('/dashboards'),
          raw(new Uint8Array([0xff, 0xfe, 0x00, 0x41]), 'application/octet-stream')
        )
      );
      await expectGuardViolation('G6', () => guardedFetch(apiUrl('/dashboards'), raw(failing)));
      expect((await get('/dashboards')).status).toBe(200);
    });
    expect(calls.map((c) => c.method)).toEqual(['GET']);
    expect(h.violations().map((v) => v.rule)).toEqual(['G6', 'G6']);
  });
});

describe('G6 body encoding (fail closed): only plain UTF-8 JSON, or a multipart form on an upload', () => {
  const utf16 = (text: string, bigEndian: boolean): Uint8Array<ArrayBuffer> => {
    const out = new Uint8Array(text.length * 2);
    for (let i = 0; i < text.length; i += 1) {
      const code = text.charCodeAt(i);
      out[i * 2 + (bigEndian ? 1 : 0)] = code & 0xff;
      out[i * 2 + (bigEndian ? 0 : 1)] = code >> 8;
    }
    return out;
  };
  const encoded = (
    path: string,
    method: string,
    body: BodyInit,
    contentType = 'application/json'
  ): Promise<Response> =>
    guardedFetch(apiUrl(path), {
      method,
      headers: { 'X-API-Key': TEST_KEY, 'Content-Type': contentType },
      body,
    });
  /** every encoding that a body parser may still read as the same JSON */
  const variants = (json: string): [BodyInit, string][] => [
    [`\uFEFF${json}`, 'application/json'],
    [utf16(json, false), 'application/json; charset=utf-16le'],
    [utf16(json, true), 'application/json; charset=UTF-16BE'],
    [utf16(json, false), 'application/json'],
    [json, 'application/json; charset=latin1'],
  ];

  it('a connection with credentials, a declared_location write, an enabling rule PATCH and a foreign MAC never pass encoded', async () => {
    const { h, calls } = makeHarness({ tiers: { W: true, S: true } });
    trackCreated('rule-1');
    const cases: [string, string, string, DomainKey][] = [
      [
        'POST',
        '/notifications/{ns}/connections',
        JSON.stringify({ channel: 'email', credentials: { address: 'a@example.com' } }),
        'positions-spatial',
      ],
      [
        'POST',
        `/assets/{ns}/${TEST_MAC}`,
        JSON.stringify({
          user_udid: TEST_MAC,
          user_name: `${RUN_PREFIX}a`,
          declared_location: { lat: 1, lng: 2 },
        }),
        'assets',
      ],
      ['PATCH', '/notifications/{ns}/rules/rule-1', JSON.stringify({ enabled: true }), 'harness'],
      [
        'POST',
        `/assets/{ns}/${TEST_MAC}`,
        JSON.stringify({ user_udid: TEST_MAC, user_name: `${RUN_PREFIX}a`, x: FOREIGN_MAC }),
        'assets',
      ],
    ];
    for (const [method, path, json, domain] of cases) {
      await inBlock(
        h,
        'S',
        async () => {
          for (const [body, type] of variants(json)) {
            await expectGuardViolation('G6', () => encoded(path, method, body, type));
          }
        },
        domain
      );
    }
    expect(calls).toHaveLength(0);
    expect(used(h).positions).toBe(0);
  });

  it('a text, urlencoded or misplaced multipart body is rejected; JSON with charset=utf-8 and an upload form pass', async () => {
    const { h, calls } = makeHarness({ tiers: { W: true } });
    await inBlock(h, 'W', async () => {
      await expectGuardViolation('G6', () =>
        encoded(
          '/notifications/{ns}/connections',
          'POST',
          new URLSearchParams({ channel: 'email', 'credentials[address]': 'a@example.com' }),
          'application/x-www-form-urlencoded'
        )
      );
      await expectGuardViolation('G6', () =>
        encoded('/dashboards', 'POST', `name=${RUN_PREFIX}d`, 'text/plain')
      );
      const form = new FormData();
      form.append('name', `${RUN_PREFIX}d`);
      await expectGuardViolation('G6', () =>
        guardedFetch(apiUrl('/dashboards'), {
          method: 'POST',
          headers: { 'X-API-Key': TEST_KEY },
          body: form,
        })
      );
      await encoded(
        '/dashboards',
        'POST',
        JSON.stringify({ name: `${RUN_PREFIX}d` }),
        'application/json; charset=UTF-8'
      );
      const upload = new FormData();
      upload.append('file', new Blob(['%PDF-1.4\u0000'], { type: 'application/pdf' }), 'a.pdf');
      await guardedFetch(apiUrl(`/assets/{ns}/${TEST_MAC}/documents`), {
        method: 'POST',
        headers: { 'X-API-Key': TEST_KEY },
        body: upload,
      });
    });
    expect(calls.map((c) => c.method)).toEqual(['POST', 'POST']);
  });

  it('G10: outside the guard a connection POST needs a string channel the server does not know', async () => {
    const { h, calls } = makeHarness({ tiers: { W: true } });
    await inBlock(h, 'W', async () => {
      await expectGuardViolation('G10', () => post('/notifications/{ns}/connections', {}));
      await expectGuardViolation('G10', () =>
        post('/notifications/{ns}/connections', { channel: ['email'] })
      );
      await expectGuardViolation('G10', () =>
        post('/notifications/{ns}/connections', { channel: ' Email ' })
      );
      await expectGuardViolation('G10', () => post('/notifications/{ns}/connections', []));
      await post('/notifications/{ns}/connections', { channel: 'fax' });
    });
    expect(calls).toHaveLength(1);
  });
});

describe('the guard sends the snapshot it checked (no change after the call reaches the wire)', () => {
  it('a URL object changed after the call: the checked host and query are sent', async () => {
    const { calls } = makeHarness();
    const health = new URL(apiUrl('/health'));
    const pending = guardedFetch(health, getInit());
    health.host = 'other-host.example.invalid';
    expect((await pending).status).toBe(200);
    const es = new URL(apiUrl('/es/position_history/{ns}'));
    es.searchParams.set('timestampFrom', String(NOW - HOUR));
    es.searchParams.set('timestampTo', String(NOW));
    const read = guardedFetch(es, getInit());
    es.searchParams.set('timestampFrom', '0');
    es.searchParams.set('timestampTo', '99999999999999');
    await read;
    expect(calls.map((c) => new URL(c.url).host)).toEqual(['rtls.test', 'rtls.test']);
    expect(new URL(calls[1]?.url ?? '').searchParams.get('timestampFrom')).toBe(String(NOW - HOUR));
  });

  it('init.body and init.headers changed after the call: the checked body and headers are sent', async () => {
    const { h, calls } = makeHarness({ tiers: { W: true } });
    const fax = JSON.stringify({ channel: 'fax' });
    const headers = new Headers({ 'X-API-Key': TEST_KEY, 'Content-Type': 'application/json' });
    const init: RequestInit = { method: 'POST', headers, body: fax };
    await inBlock(h, 'W', async () => {
      const pending = guardedFetch(apiUrl('/notifications/{ns}/connections'), init);
      init.body = JSON.stringify({ channel: 'email', credentials: { address: 'a@example.com' } });
      headers.set('X-API-Key', 'another-key');
      init.method = 'DELETE';
      await pending;
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.method).toBe('POST');
    expect(calls[0]?.headers.get('x-api-key')).toBe(TEST_KEY);
    expect(await calls[0]?.text()).toBe(fax);
  });

  it('a FormData or a Uint8Array changed after the call: the checked bytes are sent', async () => {
    const { h, calls } = makeHarness({ tiers: { W: true, S: true } });
    const form = new FormData();
    form.append('mappingProfileIds', JSON.stringify([`${RUN_PREFIX}profile`]));
    form.append('debugMode', 'true');
    form.append('file', new Blob([`MAC\n${TEST_MAC}\n`], { type: 'text/csv' }), 'a.csv');
    const encode = (value: unknown): Uint8Array<ArrayBuffer> =>
      new TextEncoder().encode(JSON.stringify(value));
    const bytes = encode({ user_udid: TEST_MAC });
    await inBlock(
      h,
      'S',
      async () => {
        const dry = upload(form);
        form.set('debugMode', 'false');
        form.set('file', new Blob([`MAC\n${FOREIGN_MAC}\n`], { type: 'text/csv' }), 'a.csv');
        await dry;
        const publish = guardedFetch(apiUrl('/publisher/{ns}'), {
          method: 'POST',
          headers: { 'X-API-Key': TEST_KEY, 'Content-Type': 'application/json' },
          body: bytes,
        });
        bytes.set(encode({ user_udid: FOREIGN_MAC }));
        await publish;
      },
      'positions-spatial'
    );
    expect(calls).toHaveLength(2);
    const sentForm = await calls[0]?.formData();
    expect(sentForm?.get('debugMode')).toBe('true');
    expect(await (sentForm?.get('file') as Blob).text()).toBe(`MAC\n${TEST_MAC}\n`);
    expect(await calls[1]?.text()).toBe(JSON.stringify({ user_udid: TEST_MAC }));
    expect(used(h)).toEqual({ positions: 1, notifications: 0, bleActions: 0, etlWrites: 0 });
  });
});

describe('G7 side effects and budgets', () => {
  it('counts publishes per item with a MAC; a MAC-less publish is allowed and not counted', async () => {
    const { h, calls } = makeHarness({ tiers: { S: true } });
    await inBlock(
      h,
      'S',
      async () => {
        await post('/publisher/{ns}', {});
        expect(used(h).positions).toBe(0);
        await post('/publisher/{ns}', { user_udid: TEST_MAC, lat: 1, lon: 2 });
        expect(used(h).positions).toBe(1);
      },
      'positions-spatial'
    );
    expect(calls).toHaveLength(2);
  });

  it('admits patch_asset_data=true with a test MAC and rejects it with a non-test MAC', async () => {
    const { h, calls } = makeHarness({ tiers: { S: true } });
    await inBlock(
      h,
      'S',
      async () => {
        await post('/publisher/{ns}?patch_asset_data=true', {
          user_udid: MAC2,
          user_uuid: '02-5d-4b-3f-a9-02',
        });
        await expectGuardViolation('G6', () =>
          post('/publisher/{ns}?patch_asset_data=true', { user_udid: FOREIGN_MAC })
        );
      },
      'positions-spatial'
    );
    expect(calls).toHaveLength(1);
    expect(new URL(calls[0]?.url ?? '').searchParams.get('patch_asset_data')).toBe('true');
  });

  it('a patching publish is an asset write: linkedNamespaceSafe applies; a declared_location adds a counted declared position (S + W, declaredPositionSafe)', async () => {
    const declared = { user_udid: TEST_MAC, lat: 1, lon: 2, declared_location: { lat: 1, lng: 2 } };
    const plain = { user_udid: TEST_MAC, lat: 1, lon: 2 };
    // linkedNamespaceSafe false: a patching publish is rejected, a plain publish passes
    {
      const { h, calls } = makeHarness({
        tiers: { S: true, W: true },
        preflight: unsafe({ linkedNamespaceSafe: false }),
      });
      await inBlock(
        h,
        'S',
        async () => {
          await expectGuardViolation('G18', () =>
            post('/publisher/{ns}?patch_asset_data=True', plain)
          );
          await post('/publisher/{ns}', plain);
        },
        'positions-spatial'
      );
      expect(calls).toHaveLength(1);
    }
    // declaredPositionSafe false: a patching publish with a declared_location is rejected
    {
      const { h, calls } = makeHarness({
        tiers: { S: true, W: true },
        preflight: unsafe({ declaredPositionSafe: false }),
      });
      await inBlock(
        h,
        'S',
        () =>
          expectGuardViolation('G18', () => post('/publisher/{ns}?patch_asset_data=1', declared)),
        'positions-spatial'
      );
      expect(calls).toHaveLength(0);
      expect(used(h).positions).toBe(0);
    }
    // S without W: rejected (a declared_location write needs both); S + W: two positions counted
    {
      const { h, calls } = makeHarness({ tiers: { S: true } });
      await inBlock(
        h,
        'S',
        () =>
          expectGuardViolation('G4', () => post('/publisher/{ns}?patch_asset_data=true', declared)),
        'positions-spatial'
      );
      expect(calls).toHaveLength(0);
    }
    {
      const { h, calls } = makeHarness({ tiers: { S: true, W: true } });
      await inBlock(
        h,
        'S',
        () => post('/publisher/{ns}?patch_asset_data=TRUE', declared),
        'positions-spatial'
      );
      expect(used(h).positions).toBe(2);
      // without patch_asset_data the declared_location is not written: one position
      await inBlock(h, 'S', () => post('/publisher/{ns}', declared), 'websocket');
      expect(calls).toHaveLength(2);
      expect(used(h).positions).toBe(3);
    }
  });

  it('counts bulk-declare as assets.length; external-id items need the run prefix; no virtual assets', async () => {
    const { h, calls } = makeHarness({ tiers: { S: true } });
    await inBlock(
      h,
      'S',
      async () => {
        await post('/assets/{ns}/bulk-declare', {
          assets: [{ mac_address: TEST_MAC }, { mac_address: MAC2 }],
        });
        expect(used(h).positions).toBe(2);
      },
      'assets'
    );
    const second = makeHarness({ tiers: { S: true } });
    await inBlock(
      second.h,
      'S',
      async () => {
        await expectGuardViolation('G7', () =>
          post('/assets/{ns}/bulk-declare', { assets: [{ external_id: 'other' }] })
        );
        await expectGuardViolation('G7', () =>
          post('/assets/{ns}/bulk-declare', { assets: [{ mac_address: FOREIGN_MAC }] })
        );
        await expectGuardViolation('G7', () =>
          post('/assets/{ns}/bulk-declare', {
            assets: [{ mac_address: TEST_MAC }],
            auto_create_virtual_assets: true,
          })
        );
        await post('/assets/{ns}/bulk-declare', { assets: [{ external_id: `${RUN_PREFIX}ext` }] });
        expect(used(second.h).positions).toBe(1);
      },
      'assets'
    );
    expect(calls).toHaveLength(1);
    // the external-id item: the asset list is read first (G18 e; no asset names it here), then the declare
    expect(second.calls.map((c) => `${c.method} ${new URL(c.url).pathname}`)).toEqual([
      `GET /api/assets/${TEST_NS}`,
      `POST /api/assets/${TEST_NS}/bulk-declare`,
    ]);
  });

  it('counts one position for an asset POST with a declared_location', async () => {
    const { h, calls } = makeHarness({ tiers: { S: true, W: true } });
    await inBlock(
      h,
      'S',
      async () => {
        await post(`/assets/{ns}/${TEST_MAC}`, {
          user_udid: TEST_MAC,
          user_name: `${RUN_PREFIX}a`,
        });
        expect(used(h).positions).toBe(0);
        await post(`/assets/{ns}/${TEST_MAC}`, {
          user_udid: TEST_MAC,
          user_name: `${RUN_PREFIX}a`,
          declared_location: { lat: 1, lng: 2, level: 0 },
        });
        expect(used(h).positions).toBe(1);
      },
      'assets'
    );
    expect(calls).toHaveLength(2);
  });

  it('send: in-app only, exactly one recipient, the key’s own user', async () => {
    const { h, calls } = makeHarness({ tiers: { S: true, W: true } });
    const self = { target_type: 'user', id: SELF_USER };
    await inBlock(
      h,
      'S',
      async () => {
        await expectGuardViolation('G7', () =>
          post('/notifications/{ns}/send', { recipients: [self], title: 't', channels: ['email'] })
        );
        await expectGuardViolation('G7', () =>
          post('/notifications/{ns}/send', {
            recipients: [{ target_type: 'user', id: 'someone-else' }],
            title: 't',
          })
        );
        await expectGuardViolation('G7', () =>
          post('/notifications/{ns}/send', { recipients: [self, self], title: 't' })
        );
        await expectGuardViolation('G7', () =>
          post('/notifications/{ns}/send', {
            recipients: [{ target_type: 'role', id: SELF_USER }],
            title: 't',
          })
        );
        const sent = await post('/notifications/{ns}/send', {
          recipients: [self],
          title: `${RUN_PREFIX}t`,
          channels: [],
        });
        expect(sent.status).toBe(201);
        expect(used(h).notifications).toBe(1);
        // per-item PATCH on the id the send returned (array auto-tracking); a foreign id is rejected
        await send('PATCH', '/notifications/{ns}/sent-item-1', { read: true });
        await expectGuardViolation('G5', () =>
          send('PATCH', '/notifications/{ns}/foreign-item', { read: true })
        );
      },
      'notifications'
    );
    expect(calls.map((c) => `${c.method} ${new URL(c.url).pathname}`)).toEqual([
      `GET /api/notifications/${TEST_NS}/cleanup-policy`,
      `POST /api/notifications/${TEST_NS}/send`,
      `PATCH /api/notifications/${TEST_NS}/sent-item-1`,
    ]);
  });

  it('send: the self-id read follows no redirect; a 3xx means no self id and the send is rejected', async () => {
    const { h, calls } = makeHarness({ tiers: { S: true, W: true } });
    let secondHop = 0;
    server.use(
      http.get(apiUrl('/notifications/{ns}/cleanup-policy'), () =>
        HttpResponse.text('', { status: 302, headers: { Location: 'https://evil.test/policy' } })
      ),
      http.all('https://evil.test/*', () => {
        secondHop += 1;
        return HttpResponse.json({ user_id: SELF_USER });
      })
    );
    await inBlock(
      h,
      'S',
      () =>
        expectGuardViolation('G7', () =>
          post('/notifications/{ns}/send', {
            recipients: [{ target_type: 'user', id: SELF_USER }],
            title: `${RUN_PREFIX}t`,
          })
        ),
      'notifications'
    );
    expect(secondHop).toBe(0);
    expect(calls.map((c) => [c.method, new URL(c.url).pathname, c.redirect])).toEqual([
      ['GET', `/api/notifications/${TEST_NS}/cleanup-policy`, 'manual'],
    ]);
    expect(used(h).notifications).toBe(0);
  });
});

describe('G8 bulk', () => {
  it('admits tracked ids or this run’s thread_key; rejects filters, untracked ids and other runs', async () => {
    const { h, calls } = makeHarness({ tiers: { W: true } });
    server.use(
      http.post(apiUrl('/notifications/{ns}/bulk'), () =>
        HttpResponse.json({ affected: 1, undo_token: 'undo-1' })
      )
    );
    await inBlock(h, 'W', async () => {
      await expectGuardViolation('G8', () =>
        post('/notifications/{ns}/bulk', { filter: {}, action: 'read' })
      );
      await expectGuardViolation('G8', () =>
        post('/notifications/{ns}/bulk', { filter: { state: 'unread' }, action: 'read' })
      );
      await expectGuardViolation('G8', () =>
        post('/notifications/{ns}/bulk', { ids: ['untracked'], action: 'read' })
      );
      await expectGuardViolation('G8', () =>
        post('/notifications/{ns}/bulk', { thread_key: 'dm:sdk-test-0000aaaa-dm', action: 'read' })
      );
      await expectGuardViolation('G8', () =>
        post('/notifications/{ns}/bulk', {
          thread_key: 'dm:other',
          filter: { thread_key: `dm:${RUN_PREFIX}dm` },
          action: 'read',
        })
      );
      await post('/notifications/{ns}/bulk', { thread_key: `dm:${RUN_PREFIX}dm`, action: 'read' });
      await post('/notifications/{ns}/bulk', {
        filter: { thread_key: `mission:${RUN_PREFIX}m` },
        action: 'archive',
      });
      trackCreated('item-a');
      await post('/notifications/{ns}/bulk', { ids: ['item-a'], action: 'pin' });
      await expectGuardViolation('G5', () =>
        post('/notifications/{ns}/bulk/undo', { undo_token: 'untracked-token' })
      );
      await post('/notifications/{ns}/bulk/undo', { undo_token: 'undo-1' });
    });
    expect(calls).toHaveLength(4);
  });
});

describe('G9 config', () => {
  it('rejects config writes outside a cycle and admits them inside one that holds the lock', async () => {
    const { h, calls } = makeHarness({ tiers: { C: true } });
    await inBlock(h, 'C', async () => {
      await expectGuardViolation('G9', () => post('/alert_rules/{ns}', alertRulesDoc));
      await expectGuardViolation('G9', () =>
        send('PUT', '/notifications/{ns}/cleanup-policy', { auto_archive_days: 1 })
      );
      await expectGuardViolation('G9', () =>
        send('PUT', '/notifications/{ns}/tenant-config', { inapp: {} })
      );
      await runWithGuardScope(configScope(h, alertRulesDoc, false), () =>
        expectGuardViolation('G9', () => post('/alert_rules/{ns}', alertRulesDoc))
      );
      await runWithGuardScope(configScope(h, alertRulesDoc), () =>
        post('/alert_rules/{ns}', alertRulesDoc)
      );
    });
    expect(calls).toHaveLength(1);
  });

  it('exempts the before-image of an alert-rule write-back from G6 and scans an added rule', async () => {
    const { h, calls } = makeHarness({ tiers: { C: true } });
    const added = (mac: string, disabled = true): unknown => ({
      ...alertRulesDoc,
      rules: [
        ...alertRulesDoc.rules,
        {
          id: `${RUN_PREFIX}rule`,
          disabled,
          conditions: { all: [{ fact: 'user_udid', operator: 'equal', value: mac }] },
          event: { type: 'message', params: {} },
        },
      ],
    });
    await inBlock(h, 'C', async () => {
      await expectGuardViolation('G9', () => post('/alert_rules/{ns}', alertRulesDoc));
      await runWithGuardScope(configScope(h, alertRulesDoc), async () => {
        await post('/alert_rules/{ns}', alertRulesDoc);
        await post('/alert_rules/{ns}', added(TEST_MAC));
        await expectGuardViolation('G6', () => post('/alert_rules/{ns}', added(FOREIGN_MAC)));
        await expectGuardViolation('G9', () => post('/alert_rules/{ns}', added(TEST_MAC, false)));
      });
    });
    expect(calls).toHaveLength(2);
  });

  it('rejects an added disabled rule that holds a mustache tag', async () => {
    const { h, calls } = makeHarness({ tiers: { C: true } });
    const templated = {
      ...alertRulesDoc,
      rules: [
        ...alertRulesDoc.rules,
        {
          id: `${RUN_PREFIX}x`,
          conditions: { all: [{ fact: 'user_udid', operator: 'notEqual', value: '' }] },
          event: { type: 'post_to_email', params: { a: '{{#nofact}}' } },
          disabled: true,
          b: { c: { d: '{{/nofact}}' } },
        },
      ],
    };
    await inBlock(h, 'C', () =>
      runWithGuardScope(configScope(h, alertRulesDoc), () =>
        expectGuardViolation('G9', () => post('/alert_rules/{ns}', templated))
      )
    );
    const example = makeHarness({
      mode: 'example',
      exampleWrite: true,
      tiers: { C: true },
      configGate: (resource, body) =>
        Promise.resolve({
          admitted: validateChange(resource, alertRulesDoc, body, { runId: example.h.runId }),
          before: alertRulesDoc,
        }),
    });
    await expectGuardViolation('G9', () => post('/alert_rules/{ns}', templated));
    expect([calls, example.calls]).toEqual([[], []]);
  });
});

describe('G10 upsert keys', () => {
  it('connections: guard-only upserts, no credentials, state-free calls outside the guard', async () => {
    const { h, calls } = makeHarness({ tiers: { W: true } });
    await inBlock(h, 'W', async () => {
      await expectGuardViolation('G10', () =>
        post('/notifications/{ns}/connections', { channel: 'email' })
      );
      await post('/notifications/{ns}/connections', { channel: 'fax' });
      await expectGuardViolation('G10', () =>
        post('/notifications/{ns}/connections', { channel: 'fax', credentials: { address: 'x' } })
      );
      await send('DELETE', '/notifications/{ns}/connections/000000000000000000000000');
      await expectGuardViolation('G10', () =>
        send('DELETE', '/notifications/{ns}/connections/real-id')
      );
      await post('/notifications/{ns}/connections/000000000000000000000000/test', {});
      await expectGuardViolation('G10', () =>
        post('/notifications/{ns}/connections/real-id/test', {})
      );
      await runWithGuardScope(
        { kind: 'existing-entity', entity: 'notification-connections', lockHeld: () => false },
        async () => {
          await post('/notifications/{ns}/connections', {
            channel: 'email',
            credentials: { address: '' },
          });
          await expectGuardViolation('G10', () =>
            post('/notifications/{ns}/connections', {
              channel: 'email',
              credentials: { address: 'a@example.invalid' },
            })
          );
          await send('DELETE', '/notifications/{ns}/connections/created-id-1');
        }
      );
    });
    expect(calls).toHaveLength(5);
  });

  it('recipient mappings: G5 (e) ids in W, stored state only in C inside the guard with the lock', async () => {
    const { h, calls } = makeHarness({ tiers: { W: true, C: true } });
    await inBlock(h, 'W', async () => {
      await send('PATCH', `/notifications/{ns}/recipient-mappings/${RUN_PREFIX}missing`, {
        enabled: false,
      });
      await send('DELETE', '/notifications/{ns}/recipient-mappings/000000000000000000000000');
      await expectGuardViolation('G10', () =>
        post('/notifications/{ns}/recipient-mappings', {
          enabled: false,
          match: { event_types: ['x'] },
        })
      );
      await expectGuardViolation('G10', () =>
        send('DELETE', '/notifications/{ns}/recipient-mappings/map_1_1')
      );
    });
    await inBlock(h, 'C', async () => {
      const scope = (held: boolean): GuardScope => ({
        kind: 'existing-entity',
        entity: 'recipient-mappings',
        lockHeld: () => held,
      });
      await runWithGuardScope(scope(false), () =>
        expectGuardViolation('G10', () =>
          post('/notifications/{ns}/recipient-mappings', { enabled: false })
        )
      );
      await runWithGuardScope(scope(true), async () => {
        await post('/notifications/{ns}/recipient-mappings', {
          enabled: false,
          match: { event_types: ['x'] },
        });
        await send('DELETE', '/notifications/{ns}/recipient-mappings/map_1_1');
      });
    });
    expect(calls).toHaveLength(4);
  });
});

describe('G11 inert subscriptions', () => {
  it('rules and mappings are created with enabled: false and never patched to anything else', async () => {
    const { h, calls } = makeHarness({ tiers: { W: true } });
    await inBlock(h, 'W', async () => {
      await expectGuardViolation('G11', () =>
        post('/notifications/{ns}/rules', { name: `${RUN_PREFIX}r` })
      );
      await expectGuardViolation('G11', () =>
        post('/notifications/{ns}/rules', { name: `${RUN_PREFIX}r`, enabled: true })
      );
      await post('/notifications/{ns}/rules', { name: `${RUN_PREFIX}r`, enabled: false });
      await expectGuardViolation('G11', () =>
        send('PATCH', '/notifications/{ns}/rules/created-id-1', { enabled: true })
      );
      await send('PATCH', '/notifications/{ns}/rules/created-id-1', {
        enabled: false,
        name: `${RUN_PREFIX}r2`,
      });
      await expectGuardViolation('G11', () =>
        send('PATCH', `/notifications/{ns}/recipient-mappings/${RUN_PREFIX}missing`, {
          enabled: 'yes',
        })
      );
    });
    expect(calls).toHaveLength(2);
  });
});

describe('G12 bounded reads', () => {
  it('ES range reads need numeric timestamps with 0 < span ≤ 7 d', async () => {
    const { calls } = makeHarness();
    await expectGuardViolation('G12', () => get('/es/position_history/{ns}'));
    await expectGuardViolation('G12', () =>
      get(`/es/zone_presence/{ns}?timestampFrom=${NOW - 8 * DAY}&timestampTo=${NOW}`)
    );
    await expectGuardViolation('G12', () =>
      get(`/es/last_positions/{ns}?timestampFrom=${NOW}&timestampTo=${NOW}`)
    );
    await expectGuardViolation('G12', () =>
      get(`/es/last_positions/{ns}?timestampFrom=abc&timestampTo=${NOW}`)
    );
    await get(`/es/position_history/{ns}?timestampFrom=${NOW - 7 * DAY}&timestampTo=${NOW}`);
    expect(calls).toHaveLength(1);
  });

  it('/es/alerts needs an integer size 1–100, with the two narrow extensions', async () => {
    const { calls } = makeHarness();
    const alerts = (span: number, size?: number): Promise<Response> =>
      get(
        `/es/alerts/{ns}?timestampFrom=${NOW - span}&timestampTo=${NOW}${size === undefined ? '' : `&size=${size}`}`
      );
    await expectGuardViolation('G12', () => get('/es/alerts/{ns}'));
    await expectGuardViolation('G12', () => alerts(HOUR));
    await expectGuardViolation('G12', () => alerts(DAY, 500));
    await expectGuardViolation('G12', () => alerts(32 * DAY, 10));
    await expectGuardViolation('G12', () => alerts(8 * DAY, 11));
    await expectGuardViolation('G12', () => alerts(HOUR, 0));
    await expectGuardViolation('G12', () => alerts(2 * HOUR, 10_001));
    await expectGuardViolation('G12', () => alerts(31 * DAY, 11));
    await alerts(HOUR, 10);
    await alerts(7 * DAY, 100);
    await alerts(HOUR, 10_001);
    await alerts(30 * DAY, 10);
    expect(calls).toHaveLength(4);
  });

  it('/asset_history needs numeric start_time and end_time; /es/query a size ≤ 100 and a range', async () => {
    const { h, calls } = makeHarness();
    await get(`/asset_history/{ns}/${FOREIGN_MAC}?start_time=0&end_time=${NOW}`);
    await expectGuardViolation('G12', () => get(`/asset_history/{ns}/${FOREIGN_MAC}?start_time=0`));
    await inBlock(h, 'R', async () => {
      await expectGuardViolation('G12', () =>
        post('/es/query/{ns}/positions', { size: 10, query: { match_all: {} } })
      );
      await expectGuardViolation('G12', () =>
        post('/es/query/{ns}/positions', { size: 500, query: { range: { t: { gte: 1 } } } })
      );
      await expectGuardViolation('G12', () =>
        post('/es/query/{ns}/positions', { query: { range: {} } })
      );
    });
    expect(calls).toHaveLength(1);
  });
});

describe('G13 streams', () => {
  it('rejects a stream request without a signal and admits one with a signal', async () => {
    const { calls } = makeHarness();
    await expectGuardViolation('G13', () => get('/notifications/{ns}/stream'));
    await expectGuardViolation('G13', () =>
      guardedFetch(apiUrl('/notifications/{ns}'), {
        headers: { 'X-API-Key': TEST_KEY, Accept: 'text/event-stream' },
      })
    );
    const controller = new AbortController();
    const response = await guardedFetch(apiUrl('/notifications/{ns}/stream'), {
      headers: { 'X-API-Key': TEST_KEY, Accept: 'text/event-stream' },
      signal: controller.signal,
    });
    expect(response.status).toBe(200);
    expect(calls).toHaveLength(1);
    // the caller's signal is combined with the 120 s deadline, not replaced
    expect(calls[0]?.signal.aborted).toBe(false);
    controller.abort();
    expect(calls[0]?.signal.aborted).toBe(true);
  });

  it('decides on the matched template and a case-insensitive Accept: trailing slash, encoded segment, Text/Event-Stream', async () => {
    const { calls } = makeHarness();
    await expectGuardViolation('G13', () => get('/notifications/{ns}/stream/'));
    await expectGuardViolation('G13', () => get('/notifications/{ns}/strea%6D'));
    await expectGuardViolation('G13', () =>
      guardedFetch(apiUrl('/notifications/{ns}'), {
        headers: { 'X-API-Key': TEST_KEY, Accept: 'Text/Event-Stream' },
      })
    );
    expect(calls).toHaveLength(0);
    // with a signal the trailing-slash stream is admitted; the caller's signal still reaches the request
    const controller = new AbortController();
    await guardedFetch(apiUrl('/notifications/{ns}/stream/'), {
      headers: { 'X-API-Key': TEST_KEY },
      signal: controller.signal,
    });
    expect(calls).toHaveLength(1);
    controller.abort();
    expect(calls[0]?.signal.aborted).toBe(true);
  });

  it('a Request input counts only init.signal: without it a stream request is rejected (G13)', async () => {
    const { calls } = makeHarness();
    const headers = { 'X-API-Key': TEST_KEY, Accept: 'text/event-stream' };
    const stream = apiUrl('/notifications/{ns}/stream');
    await expectGuardViolation('G13', () => guardedFetch(new Request(stream, { headers })));
    const own = new AbortController();
    await expectGuardViolation('G13', () =>
      guardedFetch(new Request(stream, { headers, signal: own.signal }))
    );
    expect(calls).toHaveLength(0);
    const controller = new AbortController();
    const response = await guardedFetch(new Request(stream, { headers }), {
      signal: controller.signal,
    });
    expect(response.status).toBe(200);
    expect(calls).toHaveLength(1);
  });
});

describe('G14 credentials', () => {
  it('admits a GET with a foreign key or none and rejects any other method', async () => {
    const { h, calls } = makeHarness({ tiers: { W: true } });
    await get('/health', 'wrong-key');
    await guardedFetch(apiUrl('/health'));
    await inBlock(h, 'W', async () => {
      await expectGuardViolation('G14', () =>
        post('/dashboards', { name: `${RUN_PREFIX}d` }, 'wrong-key')
      );
      await expectGuardViolation('G14', () =>
        guardedFetch(apiUrl('/dashboards'), {
          method: 'POST',
          body: JSON.stringify({ name: `${RUN_PREFIX}d` }),
        })
      );
      await expectGuardViolation('G14', () =>
        guardedFetch(apiUrl('/health'), { method: 'HEAD', headers: { 'X-API-Key': 'wrong-key' } })
      );
    });
    expect(calls).toHaveLength(2);
  });
});

describe('G15 rate', () => {
  it('bucket of 5 refilled at 5/s: 11 requests take at least 1.2 s and wait instead of failing', async () => {
    vi.useFakeTimers();
    const { h } = makeHarness({ realSleep: true, fetchImpl: async () => new Response('{}') });
    const start = Date.now();
    const done: number[] = [];
    const all = Array.from({ length: 11 }, () =>
      get('/health').then(() => done.push(Date.now() - start))
    );
    await vi.advanceTimersByTimeAsync(900);
    expect(done).toHaveLength(5);
    await vi.advanceTimersByTimeAsync(200);
    expect(done).toHaveLength(10);
    await vi.advanceTimersByTimeAsync(1_000);
    await Promise.all(all);
    expect(done).toHaveLength(11);
    expect(Math.max(...done)).toBeGreaterThanOrEqual(1_200);
    // LIVE-TESTING §2.6: never more than 5 sends in any sliding second (a token bucket would let 9–10 through)
    const busiest = Math.max(
      ...done.map((t) => done.filter((u) => u > t - 1_000 && u <= t).length)
    );
    expect(busiest).toBe(5);
    expect(h.bucket.peak).toBe(5);
  });
});

describe('G18 rule-engine reach', () => {
  it('rejects an asset PATCH when the preflight is unsafe; admits a teardown DELETE of a test asset', async () => {
    const { h, calls } = makeHarness({
      tiers: { W: true },
      preflight: unsafe({ ruleEngineSafe: false }),
    });
    await inBlock(h, 'W', () =>
      expectGuardViolation('G18', () =>
        send('PATCH', `/assets/{ns}/${TEST_MAC}`, { color: '#000000' })
      )
    );
    await runWithGuardScope({ kind: 'teardown' }, () => send('DELETE', `/assets/{ns}/${TEST_MAC}`));
    expect(calls).toHaveLength(1);
    const none = makeHarness({ tiers: { W: true }, preflight: null });
    await inBlock(none.h, 'W', () =>
      expectGuardViolation('G18', () =>
        post(`/assets/{ns}/${TEST_MAC}`, { user_udid: TEST_MAC, user_name: `${RUN_PREFIX}a` })
      )
    );
    expect(none.calls).toHaveLength(0);
  });

  it('positionSafe false: publish and bulk-declare rejected, an asset create without declared_location passes', async () => {
    const { h, calls } = makeHarness({
      tiers: { S: true, W: true },
      preflight: unsafe({ positionSafe: false, declaredPositionSafe: false }),
    });
    await inBlock(
      h,
      'S',
      async () => {
        await expectGuardViolation('G18', () => post('/publisher/{ns}', { user_udid: TEST_MAC }));
        await expectGuardViolation('G18', () =>
          post('/assets/{ns}/bulk-declare', { assets: [{ mac_address: TEST_MAC }] })
        );
        await post(`/assets/{ns}/${TEST_MAC}`, {
          user_udid: TEST_MAC,
          user_name: `${RUN_PREFIX}a`,
        });
      },
      'assets'
    );
    expect(calls).toHaveLength(1);
    expect(used(h).positions).toBe(0);
  });

  for (const mode of ['integration', 'example'] as const) {
    it(`by shape in ${mode} mode: declaredPositionSafe false and linkedNamespaceSafe false`, async () => {
      const opts = { tiers: { S: true, W: true }, mode, exampleWrite: true };
      const declared = makeHarness({ ...opts, preflight: unsafe({ declaredPositionSafe: false }) });
      await inBlock(
        declared.h,
        'S',
        async () => {
          await expectGuardViolation('G18', () =>
            post('/assets/{ns}/bulk-declare', { assets: [{ mac_address: TEST_MAC }] })
          );
          await expectGuardViolation('G18', () =>
            post(`/assets/{ns}/${TEST_MAC}`, {
              user_udid: TEST_MAC,
              declared_location: { lat: 1, lng: 2 },
            })
          );
          await post('/publisher/{ns}', { user_udid: TEST_MAC });
        },
        'positions-spatial'
      );
      expect(declared.calls).toHaveLength(1);

      const linked = makeHarness({ ...opts, preflight: unsafe({ linkedNamespaceSafe: false }) });
      trackCreated(ETL_PROFILE);
      await inBlock(
        linked.h,
        'S',
        async () => {
          await expectGuardViolation('G18', () =>
            post(`/assets/{ns}/${TEST_MAC}`, { user_udid: TEST_MAC, user_name: `${RUN_PREFIX}a` })
          );
          await expectGuardViolation('G18', () =>
            post('/assets/{ns}/bulk-clear-declared', { mac_addresses: [TEST_MAC] })
          );
          await expectGuardViolation('G18', () =>
            upload(etlForm(`mac\n${TEST_MAC}\n`, 'a.csv', 'text/csv', false))
          );
          await post('/publisher/{ns}', { user_udid: TEST_MAC });
        },
        'positions-spatial'
      );
      expect(linked.calls).toHaveLength(1);
    });
  }

  // review round 2: the ledger check of the time_in_zone leaf is keyed by the run id's first four hex digits, so a
  // run's positions must go to `025d4b` + those digits (LIVE-TESTING §2.7)
  const OTHER_RANGE_MAC = '025d4b222201';
  // review round 3: MACs one digit away from the run's range (TEST_RUN_ID 3fa9c0de → 025d4b3fa9…): the same first
  // three run-id digits with another fourth, and the four digits at another offset
  const NEAR_RANGE_MACS = ['025d4b3fa801', '02:5d:4b:3f:a8:01', '025d4b013fa9'];

  it('G18 (e): a publish, a declared location or a bulk-declare item on a test MAC of another run’s range is rejected', async () => {
    for (const mode of ['integration', 'example'] as const) {
      const { h, calls } = makeHarness({ tiers: { S: true, W: true }, mode, exampleWrite: true });
      await inBlock(
        h,
        'S',
        async () => {
          await expectGuardViolation('G18', () =>
            post('/publisher/{ns}', { user_udid: OTHER_RANGE_MAC, lat: 1, lon: 2 })
          );
          for (const mac of NEAR_RANGE_MACS) {
            await expectGuardViolation('G18', () =>
              post('/publisher/{ns}', { user_udid: mac, lat: 1, lon: 2 })
            );
            await expectGuardViolation('G18', () =>
              post('/assets/{ns}/bulk-declare', { assets: [{ mac_address: mac }] })
            );
          }
          await expectGuardViolation('G18', () =>
            post('/publisher/{ns}', [
              { user_uuid: TEST_MAC, lat: 1, lon: 2 },
              { user_uuid: '02:5D:4B:22:22:01', lat: 1, lon: 2 },
            ])
          );
          await expectGuardViolation('G18', () =>
            post('/publisher/{ns}?patch_asset_data=true', {
              user_udid: OTHER_RANGE_MAC,
              declared_location: { lat: 1, lng: 2 },
            })
          );
          await expectGuardViolation('G18', () =>
            post('/assets/{ns}/bulk-declare', {
              assets: [{ mac_address: TEST_MAC }, { mac_address: OTHER_RANGE_MAC }],
            })
          );
          await expectGuardViolation('G18', () =>
            post(`/assets/{ns}/${OTHER_RANGE_MAC}`, {
              user_udid: OTHER_RANGE_MAC,
              declared_location: { lat: 1, lng: 2 },
            })
          );
          await expectGuardViolation('G18', () =>
            post('/assets/{ns}', [
              { user_udid: OTHER_RANGE_MAC, declared_location: { lat: 1, lng: 2 } },
            ])
          );
          expect(calls).toHaveLength(0);
          expect(used(h).positions).toBe(0);
          // the run's own range passes; an asset write that sends no position is not range-bound
          await post('/publisher/{ns}', { user_udid: TEST_MAC, lat: 1, lon: 2 });
          await post(`/assets/{ns}/${OTHER_RANGE_MAC}`, {
            user_udid: OTHER_RANGE_MAC,
            user_name: `${RUN_PREFIX}a`,
          });
          expect(calls).toHaveLength(2);
          expect(used(h).positions).toBe(1);
        },
        'assets'
      );
    }
  });

  it('G18 (e): a bulk-declare by external id is sent only when every asset it resolves to is in this run’s range', async () => {
    const ext = `${RUN_PREFIX}ext`;
    const serveAssets = (answer: Response | unknown[]): void => {
      server.use(
        http.get(apiUrl('/assets/{ns}'), () =>
          answer instanceof Response ? answer : HttpResponse.json(answer)
        )
      );
    };
    const declare = async (): Promise<{ calls: Request[]; positions: number }> => {
      const { h, calls } = makeHarness({ tiers: { S: true } });
      await inBlock(
        h,
        'S',
        () => post('/assets/{ns}/bulk-declare', { assets: [{ external_id: ext }] }),
        'assets'
      );
      return { calls, positions: used(h).positions ?? 0 };
    };
    const rejected = async (): Promise<void> => {
      const { h, calls } = makeHarness({ tiers: { S: true } });
      await inBlock(
        h,
        'S',
        () =>
          expectGuardViolation('G18', () =>
            post('/assets/{ns}/bulk-declare', { assets: [{ external_id: ext }] })
          ),
        'assets'
      );
      expect(calls.map((c) => c.method)).toEqual(['GET']);
      expect(used(h).positions).toBe(0);
    };
    // resolves (case-insensitively, as the server does) to an asset of another run's range, or one of two does
    serveAssets([{ user_udid: OTHER_RANGE_MAC, external_id: ext }]);
    await rejected();
    serveAssets([
      { user_udid: TEST_MAC, external_id: ext },
      { user_udid: '025d4b2222ff', external_id: ext.toUpperCase() },
    ]);
    await rejected();
    serveAssets([{ user_udid: FOREIGN_MAC, external_id: ext }]);
    await rejected();
    // the asset list cannot be read
    serveAssets(HttpResponse.json({ error: 'x' }, { status: 500 }));
    await rejected();
    serveAssets(new HttpResponse('not json', { status: 200 }));
    await rejected();
    // the run's own asset, another external id, an asset without MAC (the server skips it): sent and counted
    serveAssets([
      { user_udid: '02:5d:4b:3f:a9:06', external_id: ext.toUpperCase() },
      { user_udid: OTHER_RANGE_MAC, external_id: `${ext}-2` },
      { user_udid: '', external_id: ext },
      { user_udid: OTHER_RANGE_MAC },
    ]);
    const sent = await declare();
    expect(sent.calls.map((c) => c.method)).toEqual(['GET', 'POST']);
    expect(sent.positions).toBe(1);
  });

  it('a time-limited position verdict (the time_in_zone leaf) admits positions before its end only', async () => {
    const limited = (until: string | null | undefined): PreflightVerdicts => ({
      ...SAFE_PREFLIGHT,
      timeLimited: ['declaredPositionSafe'],
      ...(until === undefined ? {} : { timeLimitedUntil: until }),
    });
    const later = new Date(Date.now() + HOUR).toISOString();
    const earlier = new Date(Date.now() - 1_000).toISOString();
    {
      const { h, calls } = makeHarness({ tiers: { S: true }, preflight: limited(later) });
      await inBlock(
        h,
        'S',
        () => post('/assets/{ns}/bulk-declare', { assets: [{ mac_address: TEST_MAC }] }),
        'assets'
      );
      expect(calls).toHaveLength(1);
    }
    for (const until of [earlier, null, undefined, 'not a time']) {
      const { h, calls } = makeHarness({ tiers: { S: true }, preflight: limited(until) });
      await inBlock(
        h,
        'S',
        async () => {
          await expectGuardViolation('G18', () =>
            post('/assets/{ns}/bulk-declare', { assets: [{ mac_address: TEST_MAC }] })
          );
          // positionSafe is not time-limited here: a publish still passes
          await post('/publisher/{ns}', { user_udid: TEST_MAC, lat: 1, lon: 2 });
        },
        'assets'
      );
      expect(calls).toHaveLength(1);
    }
  });
});

describe('ETL uploads (G4, G7)', () => {
  it('a dry run is admitted in W and not counted; a writing upload is rejected in W', async () => {
    const { h, calls } = makeHarness({ tiers: { W: true } });
    trackCreated(ETL_PROFILE);
    await inBlock(
      h,
      'W',
      async () => {
        await upload(etlForm(`mac\n${FOREIGN_MAC}\n`, 'a.xlsx', 'application/octet-stream', true));
        await expectGuardViolation('G4', () =>
          upload(etlForm(`mac\n${TEST_MAC}\n`, 'a.csv', 'text/csv', false))
        );
      },
      'etl'
    );
    expect(calls).toHaveLength(1);
    expect(used(h).etlWrites).toBe(0);
  });

  it('a writing upload must be a small CSV whose MACs are test MACs; it is counted', async () => {
    const { h, calls } = makeHarness({ tiers: { S: true } });
    trackCreated(ETL_PROFILE);
    serveProfile(etlProfile());
    await inBlock(
      h,
      'S',
      async () => {
        await expectGuardViolation('G7', () =>
          upload(
            etlForm(`mac,name\n${TEST_MAC},a\nAA:BB:CC:DD:EE:FF,b\n`, 'a.csv', 'text/csv', false)
          )
        );
        const xlsx = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0, 0, 0x14, 0]);
        await expectGuardViolation('G7', () =>
          upload(
            etlForm(
              xlsx,
              'a.xlsx',
              'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
              false
            )
          )
        );
        await expectGuardViolation('G7', () =>
          upload(etlForm('x'.repeat(64 * 1024 + 1), 'big.csv', 'text/csv', false))
        );
        await upload(etlForm(`MAC,Name\n${TEST_MAC},a\n`, 'a.csv', 'text/csv', false));
        expect(used(h).etlWrites).toBe(1);
      },
      'etl'
    );
    // the profile read of the writing upload, then the upload
    expect(calls.map((c) => `${c.method} ${new URL(c.url).pathname}`)).toEqual([
      `GET /api/etl/mapping-profiles/${ETL_PROFILE}`,
      'POST /api/etl/upload',
    ]);
  });

  it('debugMode, mappingProfileIds and file appear once under their exact names (duplicates, debugMode[])', async () => {
    const { h, calls } = makeHarness({ tiers: { W: true, S: true } });
    trackCreated(ETL_PROFILE);
    const form = (parts: [string, string][]): FormData => {
      const f = new FormData();
      for (const [name, value] of parts) f.append(name, value);
      f.append('file', new Blob([`MAC\n${TEST_MAC}\n`], { type: 'text/csv' }), 'a.csv');
      return f;
    };
    const ids = JSON.stringify([ETL_PROFILE]);
    await inBlock(
      h,
      'S',
      async () => {
        for (const parts of [
          [
            ['mappingProfileIds', ids],
            ['debugMode', 'true'],
            ['debugMode', 'false'],
          ],
          [
            ['mappingProfileIds', ids],
            ['debugMode', 'false'],
            ['debugMode', 'true'],
          ],
          [
            ['mappingProfileIds', ids],
            ['debugMode[]', 'true'],
          ],
          [
            ['mappingProfileIds', ids],
            ['mappingProfileIds', ids],
            ['debugMode', 'true'],
          ],
          [
            ['mappingProfileIds[0]', ETL_PROFILE],
            ['debugMode', 'true'],
          ],
        ] as [string, string][][]) {
          await expectGuardViolation('G7', () => upload(form(parts)));
        }
        const twoFiles = form([
          ['mappingProfileIds', ids],
          ['debugMode', 'true'],
        ]);
        twoFiles.append('file', new Blob(['x'], { type: 'text/csv' }), 'b.csv');
        await expectGuardViolation('G7', () => upload(twoFiles));
      },
      'etl'
    );
    expect(calls).toHaveLength(0);
    expect(used(h).etlWrites).toBe(0);
  });

  it('mappingProfileIds: a JSON array of profiles this run created (dry run: also made-up ids)', async () => {
    const { h, calls } = makeHarness({ tiers: { W: true } });
    trackCreated(ETL_PROFILE);
    const csv = `MAC\n${TEST_MAC}\n`;
    await inBlock(
      h,
      'W',
      async () => {
        await expectGuardViolation('G7', () =>
          upload(etlForm(csv, 'a.csv', 'text/csv', true, ['64b00000000000000000aaaa']))
        );
        const notJson = etlForm(csv, 'a.csv', 'text/csv', true);
        notJson.set('mappingProfileIds', ETL_PROFILE);
        await expectGuardViolation('G7', () => upload(notJson));
        const missing = etlForm(csv, 'a.csv', 'text/csv', true);
        missing.delete('mappingProfileIds');
        await expectGuardViolation('G7', () => upload(missing));
        await upload(etlForm(csv, 'a.csv', 'text/csv', true));
        await upload(etlForm(csv, 'a.csv', 'text/csv', true, ['000000000000000000000000']));
        await upload(etlForm(csv, 'a.csv', 'text/csv', true, [`${RUN_PREFIX}missing`]));
      },
      'etl'
    );
    expect(calls).toHaveLength(3);
  });

  it('a writing upload: tracked profiles only, each read first: this namespace, keyed on user_udid only, nothing under declared_location', async () => {
    const { h, calls } = makeHarness({ tiers: { W: true, S: true } });
    trackCreated(ETL_PROFILE);
    const csv = `MAC,Name\n${TEST_MAC},renamed\n`;
    const write = (ids?: string[]): Promise<Response> =>
      upload(etlForm(csv, 'a.csv', 'text/csv', false, ids));
    await inBlock(
      h,
      'S',
      async () => {
        // an id this run did not create (another namespace's profile): rejected before any request
        await expectGuardViolation('G7', () => write(['64b00000000000000000aaaa']));
        await expectGuardViolation('G7', () => write([]));
        expect(calls).toHaveLength(0);
        for (const profile of [
          etlProfile({ applicationId: 'other-ns' }),
          etlProfile({ applicationId: undefined }),
          etlProfile({
            keyColumns: ['Name'],
            mappings: { user_name: { sourceColumn: 'Name' } },
          }),
          etlProfile({
            keyColumns: ['MAC'],
            mappings: { user_udid: { sourceColumn: 'MAC' }, external_id: { sourceColumn: 'MAC' } },
          }),
          etlProfile({ keyColumns: [] }),
          etlProfile({
            mappings: {
              user_udid: { sourceColumn: 'MAC' },
              'declared_location.lat': { sourceColumn: 'Lat' },
            },
          }),
          etlProfile({ defaults: { declared_location: { value: { lat: 1, lng: 2 } } } }),
          etlProfile({
            mappings: {
              user_udid: { sourceColumn: 'MAC' },
              targetApplications: { sourceColumn: 'Apps' },
            },
          }),
          etlProfile({
            mappings: {
              user_udid: { sourceColumn: 'MAC' },
              'targetApplications[0]': { sourceColumn: 'Apps' },
            },
          }),
          etlProfile({ defaults: { targetApplications: { value: ['other-ns'] } } }),
          null,
        ]) {
          serveProfile(profile);
          await expectGuardViolation('G7', () => write());
        }
        serveProfile(etlProfile());
        expect((await write()).status).toBe(201);
      },
      'etl'
    );
    expect(calls.filter((c) => c.method === 'POST')).toHaveLength(1);
    expect(calls.filter((c) => c.method === 'GET')).toHaveLength(12);
    expect(used(h).etlWrites).toBe(1);
  });
});

describe('violations', () => {
  it('expectGuardViolation counts as an assertion on its own (expect.hasAssertions in the setup file)', async () => {
    makeHarness();
    await expectGuardViolation('G3', () => get('/assets/other-ns'));
  });

  it('a violation is recorded in violations.jsonl even when the test catches it; messages hold no body text', async () => {
    const { h } = makeHarness({ tiers: { W: true } });
    const secret = 'BODY-SECRET-VALUE-42';
    await inBlock(h, 'W', () =>
      expect(
        post('/dashboards', { name: `${RUN_PREFIX}d`, note: secret, x: FOREIGN_MAC })
      ).rejects.toBeInstanceOf(GuardViolation)
    );
    await expect(get('/assets/other-ns')).rejects.toThrow(/G3/);
    const violations = h.violations();
    expect(violations).toEqual([
      { rule: 'G6', method: 'POST', template: '/dashboards' },
      { rule: 'G3', method: 'GET', template: '/assets/{ns}' },
    ]);
    expect(h.unexpectedViolations()).toHaveLength(2);
    expect(h.failureReasons()).toEqual(['2 guard violation(s)']);
    const text = readFileSync(h.violationsPath, 'utf8');
    for (const value of [secret, FOREIGN_MAC, 'other-ns', TEST_KEY])
      expect(text).not.toContain(value);
    const attempt = inBlock(h, 'W', () =>
      post('/dashboards', { name: `${RUN_PREFIX}d`, note: secret, x: FOREIGN_MAC })
    );
    await expect(attempt).rejects.toBeInstanceOf(GuardViolation);
    await expect(attempt).rejects.toHaveProperty(
      'message',
      'GuardViolation G6: POST /dashboards: a MAC outside the test range in the body'
    );
  });

  it('expectGuardViolation marks its violations expected and fails on a missing or different rule', async () => {
    const { h } = makeHarness();
    await expectGuardViolation('G3', () => get('/assets/other-ns'));
    expect(h.violations()).toEqual([
      { rule: 'G3', method: 'GET', template: '/assets/{ns}', expected: true },
    ]);
    expect(h.unexpectedViolations()).toEqual([]);
    await expect(expectGuardViolation('G3', () => get('/health'))).rejects.toThrow(
      /expected GuardViolation G3/
    );
    await expect(expectGuardViolation('G2', () => get('/assets/other-ns'))).rejects.toThrow(
      /got G3/
    );
  });

  it('a violation raised after expectGuardViolation returned (a timer started inside it) is unexpected', async () => {
    const { h, calls } = makeHarness({ tiers: { W: true } });
    let late: Promise<unknown> = Promise.resolve();
    let fired!: () => void;
    const done = new Promise<void>((resolve) => {
      fired = resolve;
    });
    await inBlock(h, 'W', async () => {
      await expectGuardViolation('G3', async () => {
        setTimeout(() => {
          late = send('PUT', '/dashboards/untracked-id', { name: 'x' });
          fired();
        }, 5);
        await get('/assets/other-ns');
      });
      await done;
      await expect(late).rejects.toBeInstanceOf(GuardViolation);
    });
    expect(calls).toHaveLength(0);
    expect(h.violations()).toEqual([
      { rule: 'G3', method: 'GET', template: '/assets/{ns}', expected: true },
      { rule: 'G5', method: 'PUT', template: '/dashboards/{id}' },
    ]);
    expect(h.unexpectedViolations()).toEqual([
      { rule: 'G5', method: 'PUT', template: '/dashboards/{id}' },
    ]);
  });

  it('BudgetExceeded is thrown before the request leaves', async () => {
    const { h, calls } = makeHarness({ tiers: { S: true } });
    await inBlock(
      h,
      'S',
      async () => {
        await post('/publisher/{ns}', { user_udid: TEST_MAC });
        await post('/publisher/{ns}', { user_udid: TEST_MAC });
        await expect(post('/publisher/{ns}', { user_udid: TEST_MAC })).rejects.toBeInstanceOf(
          BudgetExceeded
        );
      },
      'positions-spatial'
    );
    expect(calls).toHaveLength(2);
    expect(used(h).positions).toBe(2);
    expect(h.failureReasons()).toEqual(['1 budget refusal(s)']);
  });
});
