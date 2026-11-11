import { readFileSync } from 'node:fs';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { server } from '../../mocks/server';
import { setActiveHarness } from './active';
import { cleanupLogPath, pendingCleanups, registerCleanup, runCleanup } from './cleanup';
import type { Harness } from './context';
import { trackCreated } from './guard';
import { testMac } from './names';
import { cleanupSummary } from './report';
import {
  describeLive,
  setLiveDecisionSourceForTesting,
  setSuiteApiForTesting,
  type SuiteApi,
} from './tiers';
import { inBlock, makeHarness, TEST_BASE_URL, TEST_NS } from './unit-support';

interface Call {
  method: string;
  path: string;
}
let calls: Call[];
/** status per `METHOD path` (default: 200 for DELETE, 404 for GET) */
let answers: Record<string, number>;

beforeEach(() => {
  calls = [];
  answers = {};
  server.use(
    http.all(`${TEST_BASE_URL}/*`, ({ request }) => {
      const path = new URL(request.url).pathname.slice('/api'.length);
      calls.push({ method: request.method, path });
      const status = answers[`${request.method} ${path}`] ?? (request.method === 'GET' ? 404 : 200);
      return status === 204 ? new Response(null, { status }) : HttpResponse.json({}, { status });
    })
  );
});
afterEach(() => {
  setActiveHarness(null);
  setSuiteApiForTesting(null);
  setLiveDecisionSourceForTesting(null);
});

const mac = (n: number): string => testMac(n);
const assetPath = (n: number): string => `/assets/{ns}/${mac(n)}`;
const wire = (n: number): string => `/assets/${TEST_NS}/${mac(n)}`;
const deleteAsset = (n: number, verify = false): Parameters<typeof registerCleanup>[0] => ({
  label: `asset ${n}`,
  request: { method: 'DELETE', path: assetPath(n) },
  ...(verify ? { verify: { path: assetPath(n) } } : {}),
});
const deletes = (): string[] => calls.filter((c) => c.method !== 'GET').map((c) => c.path);

describe('cleanup registry', () => {
  it('replays LIFO', async () => {
    const { h } = makeHarness({ tiers: { W: true } });
    await inBlock(h, 'W', async () => {
      for (const n of [1, 2, 3]) registerCleanup(deleteAsset(n));
      expect(await runCleanup()).toEqual({ done: 3, failed: [] });
    });
    expect(deletes()).toEqual([wire(3), wire(2), wire(1)]);
  });

  it('a 404 or 410 on the undo counts as done (already gone)', async () => {
    const { h } = makeHarness({ tiers: { W: true } });
    answers[`DELETE ${wire(1)}`] = 404;
    answers[`DELETE ${wire(2)}`] = 410;
    await inBlock(h, 'W', async () => {
      registerCleanup(deleteAsset(1));
      registerCleanup(deleteAsset(2));
      expect(await runCleanup()).toEqual({ done: 2, failed: [] });
    });
  });

  it('a failing undo does not stop the others and appears in the report', async () => {
    const { h, stateDir } = makeHarness({ tiers: { W: true } });
    answers[`DELETE ${wire(2)}`] = 500;
    await inBlock(h, 'W', async () => {
      for (const n of [1, 2, 3]) registerCleanup(deleteAsset(n));
      expect(await runCleanup()).toEqual({ done: 2, failed: [{ label: 'asset 2', status: 500 }] });
    });
    expect(deletes()).toEqual([wire(3), wire(2), wire(1)]);
    expect(cleanupSummary(stateDir)).toEqual({
      done: 2,
      failed: [{ label: 'asset 2', status: 500 }],
    });
  });

  it('a request the guard rejects is a failure without status, and the others still run', async () => {
    const { h } = makeHarness({ tiers: { W: true } });
    await inBlock(h, 'W', async () => {
      registerCleanup(deleteAsset(1));
      registerCleanup({
        label: 'foreign asset',
        request: { method: 'DELETE', path: '/assets/{ns}/aabbccddeeff' },
      });
      expect(await runCleanup()).toEqual({ done: 1, failed: [{ label: 'foreign asset' }] });
    });
    expect(deletes()).toEqual([wire(1)]);
    expect(h.unexpectedViolations().map((v) => v.rule)).toEqual(['G5']);
  });

  it('the verify step uses GET: gone → done, still present → failed with its status', async () => {
    const { h } = makeHarness({ tiers: { W: true } });
    answers[`GET ${wire(2)}`] = 200;
    await inBlock(h, 'W', async () => {
      registerCleanup(deleteAsset(1, true));
      registerCleanup(deleteAsset(2, true));
      expect(await runCleanup()).toEqual({ done: 1, failed: [{ label: 'asset 2', status: 200 }] });
    });
    expect(calls).toEqual([
      { method: 'DELETE', path: wire(2) },
      { method: 'GET', path: wire(2) },
      { method: 'DELETE', path: wire(1) },
      { method: 'GET', path: wire(1) },
    ]);
  });

  it('a replay of cleanup.jsonl runs only pending entries and is idempotent', async () => {
    const { h, stateDir } = makeHarness({ tiers: { W: true } });
    await inBlock(h, 'W', async () => {
      registerCleanup(deleteAsset(1));
      await runCleanup();
      registerCleanup(deleteAsset(2));
    });
    expect(pendingCleanups(stateDir).map((e) => e.label)).toEqual(['asset 2']);
    calls = [];
    expect(await runCleanup()).toEqual({ done: 1, failed: [] });
    expect(await runCleanup()).toEqual({ done: 0, failed: [] });
    expect(deletes()).toEqual([wire(2)]);
    const text = readFileSync(cleanupLogPath(stateDir), 'utf8');
    expect(
      text
        .trim()
        .split('\n')
        .map((l) => JSON.parse(l).type)
    ).toEqual(['register', 'done', 'register', 'done']);
    expect(text).not.toContain('unit-test-configured-key');
  });

  it('an entry records its innermost block; a block replays only its own entries; teardown replays the rest', async () => {
    const { h, stateDir } = makeHarness({ tiers: { W: true, S: true } });
    trackCreated('dash-outer');
    await inBlock(h, 'W', async () => {
      registerCleanup({
        label: 'outer',
        request: { method: 'DELETE', path: '/dashboards/dash-outer' },
      });
      await inBlock(h, 'S', async () => {
        registerCleanup(deleteAsset(5));
        expect(await runCleanup()).toEqual({ done: 1, failed: [] });
      });
      expect(pendingCleanups(stateDir).map((e) => e.label)).toEqual(['outer']);
    });
    registerCleanup({ label: 'module scope', request: { method: 'DELETE', path: assetPath(6) } });
    expect(new Set(pendingCleanups(stateDir).map((e) => e.block)).size).toBe(2);
    // global teardown (outside any block, teardown scope): every entry still pending
    expect(await runCleanup()).toEqual({ done: 2, failed: [] });
    expect(deletes()).toEqual([wire(5), wire(6), '/dashboards/dash-outer']);
  });

  it('outside a W, C or S block only a DELETE may be registered', async () => {
    const { h } = makeHarness({ tiers: { W: true } });
    const restore = {
      label: 'restore asset',
      request: { method: 'POST' as const, path: assetPath(7), body: { user_udid: mac(7) } },
    };
    expect(() => registerCleanup(restore)).toThrow(TypeError);
    await inBlock(h, 'R', async () => {
      expect(() => registerCleanup(restore)).toThrow(TypeError);
      registerCleanup(deleteAsset(7));
    });
    registerCleanup(deleteAsset(8));
    expect(pendingCleanups(h.stateDir).map((e) => e.label)).toEqual(['asset 7', 'asset 8']);
  });

  it('a replay never sends a registered create: global teardown fails it (G4) and runs the removals', async () => {
    const { h } = makeHarness({ tiers: { W: true } });
    await inBlock(h, 'W', async () => {
      registerCleanup(deleteAsset(1));
      registerCleanup({
        label: 'recreate asset',
        request: {
          method: 'POST',
          path: assetPath(2),
          body: { user_udid: mac(2), user_name: 'x' },
        },
      });
    });
    expect(await runCleanup()).toEqual({ done: 1, failed: [{ label: 'recreate asset' }] });
    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual([`DELETE ${wire(1)}`]);
    expect(h.unexpectedViolations().map((v) => v.rule)).toEqual(['G4']);
  });

  it('rejects an invalid registration', () => {
    makeHarness();
    expect(() => registerCleanup({ label: '', request: { method: 'DELETE', path: '/x' } })).toThrow(
      TypeError
    );
    expect(() =>
      registerCleanup({ label: 'x', request: { method: 'GET' as 'DELETE', path: '/x' } })
    ).toThrow(TypeError);
    expect(() => registerCleanup({ label: 'x', request: { method: 'DELETE', path: 'x' } })).toThrow(
      TypeError
    );
  });
});

describe('cleanup registry with describeLive (block-end hook)', () => {
  /** Minimal runner: suites run their beforeAll hooks, tests and afterAll hooks (stack order). */
  function runner(h: Harness) {
    interface Suite {
      skip: boolean;
      before: (() => unknown)[];
      after: (() => unknown)[];
      children: (Suite | (() => unknown))[];
    }
    const root: Suite = { skip: false, before: [], after: [], children: [] };
    let current = root;
    const open = (skip: boolean, fn: () => void): void => {
      const suite: Suite = { skip, before: [], after: [], children: [] };
      current.children.push(suite);
      const parent = current;
      current = suite;
      try {
        fn();
      } finally {
        current = parent;
      }
    };
    const api: SuiteApi = {
      describe: (_t, fn) => open(false, fn),
      describeSkip: (_t, fn) => open(true, fn),
      beforeAll: (fn) => current.before.push(fn),
      afterAll: (fn) => current.after.push(fn),
      beforeEach: () => undefined,
    };
    setSuiteApiForTesting(api);
    setLiveDecisionSourceForTesting({ hasCredentials: () => true, harness: () => h });
    const test = (fn: () => unknown): void => {
      current.children.push(fn);
    };
    const run = async (suite: Suite = root): Promise<void> => {
      if (suite.skip) return;
      for (const hook of suite.before) await hook();
      for (const child of suite.children) {
        if (typeof child === 'function') await child();
        else await run(child);
      }
      for (const hook of [...suite.after].reverse()) await hook();
    };
    return { test, run };
  }

  it('an S block (requires W) nested in a W block replays only its own entry at its end; the W block replays its own', async () => {
    const { h, stateDir } = makeHarness({ tiers: { W: true, S: true } });
    const r = runner(h);
    const order: string[] = [];
    describeLive('W', 'outer', () => {
      r.test(() => registerCleanup(deleteAsset(1)));
      describeLive(
        'S',
        'inner',
        () => {
          r.test(() => registerCleanup(deleteAsset(2)));
        },
        { requires: ['W'] }
      );
      r.test(() => {
        order.push(`after inner: ${deletes().join(',')}`);
        order.push(
          `pending: ${pendingCleanups(stateDir)
            .map((e) => e.label)
            .join(',')}`
        );
      });
    });
    await r.run();
    expect(order).toEqual([`after inner: ${wire(2)}`, 'pending: asset 1']);
    expect(deletes()).toEqual([wire(2), wire(1)]);
    expect(pendingCleanups(stateDir)).toEqual([]);
  });
});
