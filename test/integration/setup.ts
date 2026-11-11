// Setup file of the integration run (P0 §5.8). Runs in the forked worker before each test file:
// - installGuards(): `globalThis.fetch` and `globalThis.WebSocket` go through the guard (G1–G18);
// - `vi.mock('ws', …)`: the `ws` module resolves to the guarded class (G16; P0 U4, H-R9);
// - before each test: `expect.hasAssertions()` (a test without an assertion fails) and a fresh request log;
// - after each file: `guard/<pid>.json` (this process's counts, requests and peak rate, P0 §5.5.7).
// Credentials stay in the harness (env.ts reads `.env`); nothing here reads or prints them.
import { afterAll, beforeEach, expect, vi } from 'vitest';
import { installGuards, resetRequestLog } from './harness';
import { peekActiveHarness } from './harness/active';
import { mergeProcessStats } from './harness/report';

vi.mock('ws', async (importOriginal) => {
  const { guardedWsModule } = await import('./harness/ws-guard');
  return guardedWsModule(importOriginal);
});

installGuards();

beforeEach(() => {
  expect.hasAssertions();
  if (peekActiveHarness()) resetRequestLog();
});

afterAll(() => {
  const h = peekActiveHarness();
  if (h) mergeProcessStats(h);
});
