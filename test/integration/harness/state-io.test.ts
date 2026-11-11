import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync as realReadFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { tempDir } from './unit-support';

// The race of two contenders on one stale lock: contender B judges the lock stale, and before B acts on that
// judgement contender A takes the stale lock over and holds a fresh one. The hook runs A's takeover right after
// B's first read of the stale content, so the interleaving is deterministic.
const race = vi.hoisted(() => ({
  hook: null as null | ((path: string, text: string) => void),
}));

vi.mock('node:fs', async (importOriginal) => {
  const fs = await importOriginal<typeof import('node:fs')>();
  const readFileSync = ((...args: Parameters<typeof fs.readFileSync>) => {
    const out = fs.readFileSync(...args);
    const hook = race.hook;
    if (hook && typeof args[0] === 'string') {
      race.hook = null;
      hook(args[0], String(out));
    }
    return out;
  }) as typeof fs.readFileSync;
  return { ...fs, default: { ...fs, readFileSync }, readFileSync };
});

const { withFileLockSync, updateJsonFileSync } = await import('./state-io.mjs');

/** A pid that is not alive (above the usual pid_max). */
const DEAD_PID = 2 ** 22 + 12_345;

afterEach(() => {
  race.hook = null;
});

describe('withFileLockSync stale takeover (two contenders)', () => {
  it('a contender that judged the lock stale never removes the fresh lock another contender took meanwhile', () => {
    const dir = tempDir('state-io');
    const lock = join(dir, 'ledger.json.lock');
    const stale = JSON.stringify({ pid: DEAD_PID, at: '2026-01-01T00:00:00.000Z' });
    const fresh = JSON.stringify({ pid: process.pid, at: new Date().toISOString() });
    writeFileSync(lock, stale);
    // contender A: takes the stale lock over right after B read it, and keeps holding a fresh lock
    race.hook = (path, text) => {
      if (path === lock && text === stale) writeFileSync(lock, fresh);
    };
    let ran = false;
    expect(() =>
      withFileLockSync(
        lock,
        () => {
          ran = true;
        },
        { timeoutMs: 150 }
      )
    ).toThrow(/file lock not acquired/);
    expect(ran).toBe(false);
    expect(realReadFileSync(lock, 'utf8')).toBe(fresh);
    expect(existsSync(`${lock}.steal`)).toBe(false);
  });

  it('a stale lock that is still the one judged is taken over, and the steal lock is released', () => {
    const dir = tempDir('state-io');
    const counter = join(dir, 'budget.json');
    writeFileSync(
      `${counter}.lock`,
      JSON.stringify({ pid: DEAD_PID, at: '2026-01-01T00:00:00.000Z' })
    );
    expect(updateJsonFileSync(counter, { n: 0 }, (c: { n: number }) => ({ n: c.n + 1 }))).toEqual({
      n: 1,
    });
    expect([existsSync(`${counter}.lock`), existsSync(`${counter}.lock.steal`)]).toEqual([
      false,
      false,
    ]);
  });

  it('a stale lock whose steal lock a live process holds past the deadline throws instead of spinning', () => {
    const dir = tempDir('state-io');
    const lock = join(dir, 'ledger.json.lock');
    writeFileSync(lock, JSON.stringify({ pid: DEAD_PID, at: '2026-01-01T00:00:00.000Z' }));
    // the steal lock of a live process (this test worker) that never releases it
    writeFileSync(
      `${lock}.steal`,
      JSON.stringify({ pid: process.pid, at: new Date().toISOString() })
    );
    // a child process: a waiter that never returned would block this worker's thread for good
    const module = pathToFileURL(join(__dirname, 'state-io.mjs')).href;
    const script = [
      `const { withFileLockSync } = await import(${JSON.stringify(module)});`,
      'const started = Date.now();',
      'try {',
      `  withFileLockSync(${JSON.stringify(lock)}, () => 'held', { timeoutMs: 100 });`,
      "  console.log('held');",
      '} catch (e) {',
      '  console.log(JSON.stringify({ message: e.message, ms: Date.now() - started }));',
      '}',
    ].join('\n');
    const child = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
      encoding: 'utf8',
      timeout: 4_000,
    });
    expect([child.signal, child.status]).toEqual([null, 0]);
    const outcome = JSON.parse(child.stdout.trim()) as { message: string; ms: number };
    expect(outcome.message).toBe('file lock not acquired in 100 ms');
    expect(outcome.ms).toBeLessThan(3_000);
    // neither lock was touched: the dead holder's lock waits for the steal lock's live holder
    expect([existsSync(lock), existsSync(`${lock}.steal`)]).toEqual([true, true]);
  });

  it('a stale steal lock (dead holder) does not block a takeover', () => {
    const dir = tempDir('state-io');
    const lock = join(dir, 'x.lock');
    const dead = JSON.stringify({ pid: DEAD_PID, at: '2026-01-01T00:00:00.000Z' });
    writeFileSync(lock, dead);
    writeFileSync(`${lock}.steal`, dead);
    expect(withFileLockSync(lock, () => 'held', { timeoutMs: 2_000 })).toBe('held');
    expect([existsSync(lock), existsSync(`${lock}.steal`)]).toEqual([false, false]);
  });
});
