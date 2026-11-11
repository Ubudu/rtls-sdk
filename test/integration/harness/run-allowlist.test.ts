import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setActiveHarness } from './active';
import type { Harness } from './context';
import { activateRunAllowlist, dynamicAllowlistPath } from './run-allowlist';
import { makeHarness } from './unit-support';

let h: Harness;

const lineEntry = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  file: 'src/resources/notifications/index.ts',
  lines: [10, 12],
  match: 'connections',
  category: 'unreachable-live',
  reason: 'existing entry for this key in the namespace',
  unitTest: 'test/resources/notifications/index.test.ts',
  ...extra,
});

beforeEach(() => {
  h = makeHarness().h;
  mkdirSync(h.allowlistDir, { recursive: true });
  writeFileSync(
    join(h.allowlistDir, 'P6.json'),
    JSON.stringify({
      phase: 'P6',
      entries: [lineEntry('P6-1', { runScoped: true }), lineEntry('P6-2')],
    })
  );
  writeFileSync(
    join(h.allowlistDir, 'P7.json'),
    JSON.stringify([lineEntry('P7-4', { runScoped: true })])
  );
});
afterEach(() => setActiveHarness(null));

const lines = (): unknown[] =>
  readFileSync(dynamicAllowlistPath(h.stateDir), 'utf8')
    .trim()
    .split('\n')
    .map((l) => JSON.parse(l) as unknown);

describe('activateRunAllowlist', () => {
  it('writes { allowlistId, test, kind: run-scoped, reason } for a runScoped entry (both fragment forms)', () => {
    activateRunAllowlist('P6-1', 'connection exists for the email channel');
    activateRunAllowlist('P7-4', 'ETL feature absent');
    expect(lines()).toEqual([
      {
        allowlistId: 'P6-1',
        test: expect.stringContaining('writes { allowlistId, test, kind: run-scoped, reason }'),
        kind: 'run-scoped',
        reason: 'connection exists for the email channel',
      },
      {
        allowlistId: 'P7-4',
        test: expect.stringContaining('activateRunAllowlist'),
        kind: 'run-scoped',
        reason: 'ETL feature absent',
      },
    ]);
  });

  it('an id that is not a runScoped entry, or no entry at all → throws, nothing written', () => {
    expect(() => activateRunAllowlist('P6-2', 'not run-scoped')).toThrow(/not runScoped/);
    expect(() => activateRunAllowlist('P6-99', 'unknown')).toThrow(/no allowlist entry P6-99/);
    expect(() => activateRunAllowlist('P6-1', '  ')).toThrow(TypeError);
    expect(existsSync(dynamicAllowlistPath(h.stateDir))).toBe(false);
  });
});
