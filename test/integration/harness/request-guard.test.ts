import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setActiveHarness } from './active';
import { createLiveClient } from './client';
import { guardedFetch, GuardViolation, guardViolationIn } from './guard';
import { denyAll, getOnly, withRequestGuard } from './request-guard';
import {
  apiUrl,
  getInit,
  inBlock,
  jsonInit,
  makeHarness,
  RUN_PREFIX,
  TEST_NS,
  useDefaultApi,
} from './unit-support';

beforeEach(() => useDefaultApi());
afterEach(() => setActiveHarness(null));

const guardViolationOf = guardViolationIn;

describe('withRequestGuard', () => {
  it('denyAll: the SDK error is returned, one rejected attempt with a body hash, nothing sent, RG recorded', async () => {
    const { h, calls } = makeHarness({ tiers: { W: true } });
    const client = createLiveClient();
    const guarded = await inBlock(h, 'W', () =>
      withRequestGuard(denyAll, () => client.dashboards.create({ name: `${RUN_PREFIX}dash` }))
    );
    expect(guarded.result).toBeUndefined();
    expect(guarded.error).toBeInstanceOf(Error);
    expect(guardViolationOf(guarded.error)?.rule).toBe('RG');
    expect(guarded.attempts).toHaveLength(1);
    expect(guarded.attempts[0]).toEqual({
      method: 'POST',
      path: '/dashboards',
      template: '/dashboards',
      query: {},
      bodyHash: expect.stringMatching(/^[0-9a-f]{64}$/),
      allowed: false,
    });
    expect(calls).toHaveLength(0);
    expect(h.violations()).toEqual([{ rule: 'RG', method: 'POST', template: '/dashboards' }]);
  });

  it('getOnly admits a GET and rejects a POST', async () => {
    const { h, calls } = makeHarness({ tiers: { W: true } });
    const guarded = await inBlock(h, 'W', () =>
      withRequestGuard(getOnly, async () => {
        const read = await guardedFetch(apiUrl('/dashboards'), getInit());
        await guardedFetch(apiUrl('/dashboards'), jsonInit('POST', { name: `${RUN_PREFIX}d` }));
        return read.status;
      })
    );
    expect(guarded.result).toBeUndefined();
    expect(guardViolationOf(guarded.error)?.rule).toBe('RG');
    expect(guarded.attempts.map((a) => [a.method, a.allowed, a.bodyHash === null])).toEqual([
      ['GET', true, true],
      ['POST', false, false],
    ]);
    expect(calls.map((c) => c.method)).toEqual(['GET']);
  });

  it('returns the result when fn succeeds', async () => {
    makeHarness();
    const guarded = await withRequestGuard(getOnly, async () =>
      (await guardedFetch(apiUrl('/health'), getInit())).json()
    );
    expect(guarded).toEqual({
      result: { status: 'OK' },
      error: undefined,
      attempts: [
        expect.objectContaining({
          method: 'GET',
          path: '/health',
          template: '/health',
          allowed: true,
        }),
      ],
    });
  });

  it('nested guards reject what either rejects', async () => {
    const { h, calls } = makeHarness({ tiers: { W: true } });
    const notHealth = (r: { path: string }): boolean => r.path !== '/health';
    const outcomes: string[] = [];
    let innerAllowed: boolean[] = [];
    await inBlock(h, 'W', () =>
      withRequestGuard(getOnly, async () => {
        const inner = await withRequestGuard(notHealth, async () => {
          for (const attempt of [
            () => guardedFetch(apiUrl('/health'), getInit()),
            () => guardedFetch(apiUrl('/dashboards'), jsonInit('POST', { name: `${RUN_PREFIX}d` })),
            () => guardedFetch(apiUrl('/dashboards'), getInit()),
          ]) {
            // every outcome is recorded and asserted below (sent or rejected)
            const [result] = await Promise.allSettled([attempt()]);
            outcomes.push(
              result?.status === 'fulfilled'
                ? `sent ${result.value.status}`
                : `rejected ${(result?.reason as GuardViolation).rule}`
            );
          }
        });
        innerAllowed = inner.attempts.map((a) => a.allowed);
      })
    );
    expect(innerAllowed).toEqual([false, false, true]);
    expect(outcomes).toEqual(['rejected RG', 'rejected RG', 'sent 200']);
    expect(calls).toHaveLength(1);
  });

  it('no body or query value appears in any message or in violations.jsonl', async () => {
    const { h } = makeHarness({ tiers: { W: true } });
    const secret = 'QUERY-AND-BODY-SECRET-77';
    const guarded = await inBlock(h, 'W', () =>
      withRequestGuard(denyAll, () =>
        guardedFetch(
          apiUrl(`/dashboards?token-like=${secret}`),
          jsonInit('POST', { name: `${RUN_PREFIX}d`, secret })
        )
      )
    );
    const message = (guarded.error as Error).message;
    expect(message).toBe('GuardViolation RG: POST /dashboards: rejected by a request guard');
    for (const text of [
      message,
      readFileSync(h.violationsPath, 'utf8'),
      JSON.stringify(guarded.attempts.map((a) => a.bodyHash)),
    ]) {
      expect(text).not.toContain(secret);
      expect(text).not.toContain(TEST_NS);
    }
  });
});
