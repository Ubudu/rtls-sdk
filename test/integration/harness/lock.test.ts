import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  acquireConfigLock,
  acquireReadSlot,
  acquireRunLock,
  deregisterRun,
  holdsLock,
  holdsReadSlot,
  isRunActive,
  listRuns,
  lockPaths,
  mainCheckoutFromGitCommonDir,
  newLockToken,
  registerRun,
  releaseConfigLock,
  releaseReadSlot,
  releaseRunLock,
} from './lock.mjs';
import { tempDir } from './unit-support';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const LOCK_URL = pathToFileURL(join(HERE, 'lock.mjs')).href;
const FAST = { pollMs: 20, maxWaitMs: 200 };
const TIERS = { R: true, W: true, C: false, S: false };

/** A pid that belonged to a process that has exited. */
function deadPid(): number {
  const child = spawnSync(process.execPath, ['-e', '0']);
  return child.pid as number;
}

/** Writes a lock file held by `pid` (a token hash that no test token has). */
function writeForeignLock(path: string, pid: number): void {
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(
    path,
    JSON.stringify({
      pid,
      startedAt: new Date().toISOString(),
      holder: 'other',
      tokenHash: 'f'.repeat(64),
    })
  );
}

function setup(): { stateDir: string; paths: ReturnType<typeof lockPaths> } {
  const stateDir = join(tempDir('lock'), 'state');
  return { stateDir, paths: lockPaths(stateDir) };
}

describe('lock.mjs from plain node', () => {
  it('acquires and releases the run lock and the config lock with a token, without tsx', () => {
    const { stateDir } = setup();
    const script = `
      import { acquireRunLock, acquireConfigLock, holdsLock, lockPaths, newLockToken, releaseConfigLock, releaseRunLock } from ${JSON.stringify(LOCK_URL)};
      const stateDir = process.argv[1];
      if (!stateDir) throw new Error('no state dir');
      const p = lockPaths(stateDir);
      const token = newLockToken();
      const out = [];
      out.push(await acquireRunLock({ token, stateDir }), holdsLock(p.run, token));
      out.push(await acquireConfigLock({ token, stateDir }), holdsLock(p.config, token));
      out.push(await releaseConfigLock(token, { stateDir }), await releaseRunLock(token, { stateDir }));
      out.push(holdsLock(p.run, token), token.length, p.run.startsWith(stateDir));
      process.stdout.write(JSON.stringify(out));
    `;
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', script, stateDir], {
      encoding: 'utf8',
      env: { PATH: process.env.PATH ?? '' },
    });
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual([
      true,
      true,
      true,
      true,
      true,
      true,
      false,
      32,
      true,
    ]);
    expect(existsSync(join(stateDir, 'locks'))).toBe(true);
  });
});

describe('run lock and config lock', () => {
  it('acquire/release with a token; `wait: false` on a held lock → false', async () => {
    const { stateDir, paths } = setup();
    const a = newLockToken();
    const b = newLockToken();
    expect(await acquireRunLock({ token: a, stateDir })).toBe(true);
    expect(await acquireRunLock({ token: b, stateDir, wait: false })).toBe(false);
    // the holder's own token re-acquires (it already holds the lock)
    expect(await acquireRunLock({ token: a, stateDir })).toBe(true);
    expect(await releaseRunLock(b, { stateDir })).toBe(false);
    expect(holdsLock(paths.run, a)).toBe(true);
    expect(await releaseRunLock(a, { stateDir })).toBe(true);
    expect(existsSync(paths.run)).toBe(false);
  });

  it('a second waiter proceeds after the release', async () => {
    const { stateDir, paths } = setup();
    const a = newLockToken();
    const b = newLockToken();
    await acquireRunLock({ token: a, stateDir });
    const waiting = acquireRunLock({
      token: b,
      stateDir,
      wait: true,
      pollMs: 20,
      maxWaitMs: 5_000,
    });
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(holdsLock(paths.run, b)).toBe(false);
    await releaseRunLock(a, { stateDir });
    expect(await waiting).toBe(true);
    expect(holdsLock(paths.run, b)).toBe(true);
  });

  it('a stale lock whose holder pid is dead is stolen', async () => {
    const { stateDir, paths } = setup();
    writeForeignLock(paths.run, deadPid());
    const token = newLockToken();
    expect(await acquireRunLock({ token, stateDir, wait: false })).toBe(true);
    expect(holdsLock(paths.run, token)).toBe(true);
    writeForeignLock(paths.config, deadPid());
    expect(await acquireConfigLock({ token, stateDir, wait: false })).toBe(true);
  });

  it('a live holder → false after the wait', async () => {
    const { stateDir, paths } = setup();
    writeForeignLock(paths.run, process.pid);
    const started = Date.now();
    expect(await acquireRunLock({ token: newLockToken(), stateDir, wait: true, ...FAST })).toBe(
      false
    );
    expect(Date.now() - started).toBeGreaterThanOrEqual(150);
  });

  it('holdsLock is true only for the right token and a live pid; the file never holds the token', async () => {
    const { stateDir, paths } = setup();
    const token = newLockToken();
    await acquireRunLock({ token, stateDir });
    expect(holdsLock(paths.run, token)).toBe(true);
    expect(holdsLock(paths.run, newLockToken())).toBe(false);
    expect(holdsLock(paths.run, undefined)).toBe(false);
    const text = readFileSync(paths.run, 'utf8');
    expect(text).not.toContain(token);
    expect(Object.keys(JSON.parse(text)).sort()).toEqual([
      'holder',
      'pid',
      'startedAt',
      'tokenHash',
    ]);
    // the same token hash with a dead pid does not hold
    const content = JSON.parse(text);
    writeFileSync(paths.run, JSON.stringify({ ...content, pid: deadPid() }));
    expect(holdsLock(paths.run, token)).toBe(false);
  });

  it('the config lock is refused unless the run lock is held with the same token', async () => {
    const { stateDir, paths } = setup();
    const a = newLockToken();
    expect(await acquireConfigLock({ token: a, stateDir, wait: true, ...FAST })).toBe(false);
    expect(existsSync(paths.config)).toBe(false);
    await acquireRunLock({ token: a, stateDir });
    expect(await acquireConfigLock({ token: newLockToken(), stateDir })).toBe(false);
    expect(await acquireConfigLock({ token: a, stateDir })).toBe(true);
    expect(holdsLock(paths.config, a)).toBe(true);
    expect(readFileSync(paths.config, 'utf8')).not.toContain(a);
    expect(await releaseConfigLock(a, { stateDir })).toBe(true);
  });

  it('a token shorter than 16 characters is rejected', async () => {
    const { stateDir } = setup();
    await expect(acquireRunLock({ token: 'short', stateDir })).rejects.toThrow(TypeError);
  });
});

describe('main checkout path', () => {
  it('is the parent of the git common dir, relative to cwd or absolute', () => {
    const root = realpathSync(tempDir('git'));
    const main = join(root, 'main');
    mkdirSync(join(main, '.git'), { recursive: true });
    mkdirSync(join(root, 'worktree'), { recursive: true });
    expect(mainCheckoutFromGitCommonDir('.git\n', main)).toBe(main);
    expect(mainCheckoutFromGitCommonDir(`${join(main, '.git')}\n`, join(root, 'worktree'))).toBe(
      main
    );
    expect(lockPaths(join(main, 'test', 'integration', '.state')).run).toBe(
      join(main, 'test', 'integration', '.state', 'locks', 'run.lock')
    );
  });
});

describe('run registry', () => {
  it('registerRun/deregisterRun write and remove runs/<runId>.json with the caller pid', () => {
    const { stateDir, paths } = setup();
    const entry = registerRun('0a1b2c3d', { domain: 'harness', tiers: TIERS }, { stateDir });
    const file = join(paths.runsDir, '0a1b2c3d.json');
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual({
      pid: process.pid,
      startedAt: entry.startedAt,
      domain: 'harness',
      tiers: TIERS,
    });
    expect(isRunActive(entry)).toBe(true);
    expect(listRuns({ stateDir })).toEqual([{ runId: '0a1b2c3d', entry, created: null }]);
    deregisterRun('0a1b2c3d', { stateDir });
    expect(existsSync(file)).toBe(false);
    expect(() => registerRun('NOT-HEX', { domain: 'x', tiers: TIERS }, { stateDir })).toThrow(
      TypeError
    );
  });

  it('isRunActive is false for a dead pid and for a missing entry', () => {
    expect(isRunActive({ pid: deadPid(), startedAt: '', domain: 'x', tiers: TIERS })).toBe(false);
    expect(isRunActive(null)).toBe(false);
  });
});

describe('read slots', () => {
  it('two tokens take read-1 and read-2; a third gets false, and with wait proceeds after a release', async () => {
    const { stateDir, paths } = setup();
    const [a, b, c] = [newLockToken(), newLockToken(), newLockToken()];
    expect(await acquireReadSlot({ token: a, stateDir })).toBe(paths.readSlots[0]);
    expect(await acquireReadSlot({ token: b, stateDir })).toBe(paths.readSlots[1]);
    expect(await acquireReadSlot({ token: c, stateDir, wait: false })).toBe(false);
    const waiting = acquireReadSlot({
      token: c,
      stateDir,
      wait: true,
      pollMs: 20,
      maxWaitMs: 5_000,
    });
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(await releaseReadSlot(a, { stateDir })).toBe(true);
    expect(await waiting).toBe(paths.readSlots[0]);
    expect(holdsReadSlot(c, { stateDir })).toBe(true);
    expect(holdsReadSlot(a, { stateDir })).toBe(false);
  });

  it('a slot whose holder pid is dead is stolen', async () => {
    const { stateDir, paths } = setup();
    writeForeignLock(paths.readSlots[0], deadPid());
    writeForeignLock(paths.readSlots[1], process.pid);
    const token = newLockToken();
    expect(await acquireReadSlot({ token, stateDir, wait: false })).toBe(paths.readSlots[0]);
  });

  it('holdsReadSlot is true only for the right token and a live pid; a slot file never holds the token', async () => {
    const { stateDir, paths } = setup();
    const token = newLockToken();
    await acquireReadSlot({ token, stateDir });
    expect(holdsReadSlot(token, { stateDir })).toBe(true);
    expect(holdsReadSlot(newLockToken(), { stateDir })).toBe(false);
    const text = readFileSync(paths.readSlots[0], 'utf8');
    expect(text).not.toContain(token);
    writeFileSync(paths.readSlots[0], JSON.stringify({ ...JSON.parse(text), pid: deadPid() }));
    expect(holdsReadSlot(token, { stateDir })).toBe(false);
  });

  it('a run-lock holder and two slot holders coexist; a fourth live process waits', async () => {
    const { stateDir, paths } = setup();
    const [run, r1, r2] = [newLockToken(), newLockToken(), newLockToken()];
    expect(await acquireRunLock({ token: run, stateDir })).toBe(true);
    expect(await acquireReadSlot({ token: r1, stateDir })).not.toBe(false);
    expect(await acquireReadSlot({ token: r2, stateDir })).not.toBe(false);
    expect([
      holdsLock(paths.run, run),
      holdsReadSlot(r1, { stateDir }),
      holdsReadSlot(r2, { stateDir }),
    ]).toEqual([true, true, true]);
    expect(await acquireReadSlot({ token: newLockToken(), stateDir, wait: true, ...FAST })).toBe(
      false
    );
  });
});
