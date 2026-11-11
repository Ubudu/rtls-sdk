// Unit tests of the `test:integration` driver (scripts/integration.mjs, P0 §6.1). vitest itself is injected
// (`runVitest`), the state, lock and ledger folders are temporary, and nothing reads `.env` or sends a request.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  domainFilters,
  exitCodeFor,
  isUnreachableBaseUrl,
  main,
  parseDriverArgs,
  runIdOf,
  sourceHashes,
  tiersOf,
  UNREACHABLE_BASE_URLS,
} from '../../../scripts/integration.mjs';
import { abortExitCode } from '../../integration/harness/abort';
import { recordLedger } from '../../integration/harness/ledger.mjs';
import {
  acquireReadSlot,
  acquireRunLock,
  holdsLock,
  holdsReadSlot,
  lockPaths,
  newLockToken,
} from '../../integration/harness/lock.mjs';
import { UNREACHABLE_BASE_URLS as POLICY_UNREACHABLE } from '../../integration/harness/policy';

const RUN = 'c0ffee01';

function scratch() {
  const dir = mkdtempSync(join(tmpdir(), 'rtls-driver-'));
  const root = join(dir, 'repo');
  mkdirSync(join(root, 'src', 'utils'), { recursive: true });
  writeFileSync(join(root, 'src', 'index.ts'), 'export {};\n');
  writeFileSync(join(root, 'src', 'utils', 'a.ts'), 'export const a = 1;\n');
  return {
    root,
    stateRoot: join(dir, 'state'),
    lockStateDir: join(dir, 'main-state'),
    ledgerPath: join(dir, 'main-state', 'ledger.json'),
  };
}

interface VitestCall {
  args: string[];
  env: NodeJS.ProcessEnv;
  cwd: string;
  /** lock state while vitest ran */
  runLockHeld: boolean;
  readSlotHeld: boolean;
}

function driver(
  env: NodeJS.ProcessEnv,
  options: {
    report?: Record<string, unknown> | null;
    status?: number;
    s?: ReturnType<typeof scratch>;
  } = {}
) {
  const s = options.s ?? scratch();
  const calls: VitestCall[] = [];
  const lines: string[] = [];
  const run = (argv: string[]) =>
    main(argv, {
      root: s.root,
      env: { RTLS_IT_RUN_ID: RUN, ...env },
      stateRoot: s.stateRoot,
      lockStateDir: s.lockStateDir,
      ledgerPath: s.ledgerPath,
      lockWait: { wait: false },
      log: (l) => lines.push(l),
      error: (l) => lines.push(l),
      runVitest: async (args, childEnv, cwd) => {
        const token = childEnv.RTLS_IT_INTERNAL_LOCK_TOKEN;
        calls.push({
          args,
          env: childEnv,
          cwd,
          runLockHeld: holdsLock(lockPaths(s.lockStateDir).run, token),
          readSlotHeld: holdsReadSlot(token, { stateDir: s.lockStateDir }),
        });
        const report =
          options.report === undefined ? { runId: RUN, ok: true, abort: null } : options.report;
        if (report !== null) {
          mkdirSync(join(s.stateRoot, RUN), { recursive: true });
          writeFileSync(join(s.stateRoot, RUN, 'report.json'), JSON.stringify(report));
        }
        return options.status ?? 0;
      },
    });
  return { s, calls, lines, run };
}

describe('argument parsing and selection', () => {
  it('accepts domains, --phase, --record and --filter', () => {
    expect(parseDriverArgs([])).toEqual({ domains: [], record: false });
    expect(parseDriverArgs(['harness', 'core', 'harness'])).toEqual({
      domains: ['harness', 'core'],
      record: false,
    });
    expect(parseDriverArgs(['--phase', 'P0'])).toEqual({ domains: ['harness'], record: false });
    expect(parseDriverArgs(['--phase=P8', '--record', '--filter', 'LT-R1'])).toEqual({
      domains: ['websocket'],
      record: true,
      filter: 'LT-R1',
    });
  });

  it('refuses an unknown domain, a phase without a live domain, an empty filter and unknown options', () => {
    expect(() => parseDriverArgs(['nope'])).toThrow('unknown domain');
    expect(() => parseDriverArgs(['--phase', 'P9'])).toThrow('no live domain');
    expect(() => parseDriverArgs(['--phase', 'P11'])).toThrow('--phase');
    expect(() => parseDriverArgs(['--filter', ' '])).toThrow('--filter');
    expect(() => parseDriverArgs(['--write'])).toThrow('unknown option');
  });

  it('maps domains to test folders (websocket: both folders)', () => {
    expect(domainFilters([])).toEqual([]);
    expect(domainFilters(['harness', 'core'])).toEqual([
      'test/integration/harness/',
      'test/integration/core/',
    ]);
    expect(domainFilters(['websocket'])).toEqual([
      'test/integration/websocket/',
      'test/websocket/',
    ]);
  });

  it('reads tiers from the environment only (exactly "1")', () => {
    expect(tiersOf({})).toEqual({ R: true, W: false, C: false, S: false });
    expect(
      tiersOf({ RTLS_IT_WRITES: '1', RTLS_IT_CONFIG: 'true', RTLS_IT_SIDE_EFFECTS: '1' })
    ).toEqual({ R: true, W: true, C: false, S: true });
  });

  it('validates RTLS_IT_RUN_ID and draws a random id when it is absent', () => {
    expect(runIdOf({ RTLS_IT_RUN_ID: RUN })).toBe(RUN);
    expect(runIdOf({})).toMatch(/^[0-9a-f]{8}$/);
    expect(() => runIdOf({ RTLS_IT_RUN_ID: 'ABC' })).toThrow('RTLS_IT_RUN_ID');
  });

  it('recognises the unreachable base URLs by origin, with the values of policy.ts', () => {
    expect(UNREACHABLE_BASE_URLS).toEqual(POLICY_UNREACHABLE);
    expect(isUnreachableBaseUrl('http://192.0.2.1/other')).toBe(true);
    expect(isUnreachableBaseUrl('http://127.0.0.1:9/api')).toBe(true);
    expect(isUnreachableBaseUrl('https://rtls.invalid/api')).toBe(true);
    expect(isUnreachableBaseUrl('https://rtls.ubudu.com/api')).toBe(false);
    expect(isUnreachableBaseUrl(undefined)).toBe(false);
    expect(isUnreachableBaseUrl('not a url')).toBe(false);
  });
});

describe('exit codes', () => {
  it('maps report.json to the §6.1 exit codes, with the same table as abortExitCode', () => {
    for (const abort of [
      'no-credentials',
      'ledger-cap',
      'no-run-lock',
      'no-read-slot',
      'precondition',
      'restore-failed',
    ]) {
      expect(exitCodeFor({ ok: false, abort }, 0)).toBe(abortExitCode(abort));
    }
    expect(exitCodeFor({ ok: false, abort: 'health-check-failed' }, 0)).toBe(1);
    expect(exitCodeFor({ ok: false, abort: null }, 0)).toBe(1);
    expect(exitCodeFor({ ok: true, abort: null }, 0)).toBe(0);
    expect(exitCodeFor({ ok: true, abort: null }, 1)).toBe(1);
    expect(exitCodeFor(null, 0)).toBe(1);
    expect(exitCodeFor(null, 130)).toBe(130);
  });
});

describe('sources.json', () => {
  it('hashes every src file by repository-relative path', () => {
    const s = scratch();
    const hashes = sourceHashes(s.root);
    expect(Object.keys(hashes.files)).toEqual(['src/index.ts', 'src/utils/a.ts']);
    expect(hashes.version).toBe(1);
    expect(hashes.files['src/index.ts']).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('a run', () => {
  it('tier R only: holds a read slot with a fresh token while vitest runs, then releases it', async () => {
    const d = driver({ RTLS_IT_INTERNAL_LOCK_TOKEN: 'stale-token-from-outside-0000' });
    expect(await d.run(['harness'])).toBe(0);
    expect(d.calls).toHaveLength(1);
    const call = d.calls[0] as VitestCall;
    expect(call.readSlotHeld).toBe(true);
    expect(call.runLockHeld).toBe(false);
    expect(call.env.RTLS_IT_RUN_ID).toBe(RUN);
    expect(call.env.RTLS_IT_INTERNAL_LOCK_TOKEN).not.toBe('stale-token-from-outside-0000');
    expect(call.args).toEqual([
      'run',
      '--config',
      'vitest.integration.config.ts',
      'test/integration/harness/',
      '--coverage.enabled=true',
      `--coverage.reportsDirectory=coverage-live/${RUN}`,
    ]);
    expect(
      holdsReadSlot(call.env.RTLS_IT_INTERNAL_LOCK_TOKEN, { stateDir: d.s.lockStateDir })
    ).toBe(false);
    expect(JSON.parse(readFileSync(join(d.s.stateRoot, RUN, 'selection.json'), 'utf8'))).toEqual({
      domains: ['harness'],
    });
    const coverage = join(d.s.root, 'coverage-live', RUN);
    expect(JSON.parse(readFileSync(join(coverage, 'report.json'), 'utf8')).runId).toBe(RUN);
    expect(
      Object.keys(JSON.parse(readFileSync(join(coverage, 'sources.json'), 'utf8')).files)
    ).toEqual(['src/index.ts', 'src/utils/a.ts']);
    expect(d.lines.some((l) => l.includes(`label ${RUN}`))).toBe(true);
  });

  it('tier W: holds the run lock with the token passed to vitest, then releases it', async () => {
    const d = driver({ RTLS_IT_WRITES: '1' });
    expect(await d.run(['--phase', 'P0', '--filter', 'H-W1'])).toBe(0);
    const call = d.calls[0] as VitestCall;
    expect(call.runLockHeld).toBe(true);
    expect(call.readSlotHeld).toBe(false);
    expect(call.args).toContain('-t');
    expect(call.args).toContain('H-W1');
    expect(holdsLock(lockPaths(d.s.lockStateDir).run, call.env.RTLS_IT_INTERNAL_LOCK_TOKEN)).toBe(
      false
    );
  });

  it('a held run lock or two held read slots → exit 2 before vitest starts', async () => {
    const w = driver({ RTLS_IT_WRITES: '1' });
    expect(
      await acquireRunLock({ stateDir: w.s.lockStateDir, token: newLockToken(), wait: false })
    ).toBe(true);
    expect(await w.run(['harness'])).toBe(2);
    expect(w.calls).toHaveLength(0);
    expect(w.lines.some((l) => l.endsWith('no-run-lock'))).toBe(true);

    const r = driver({});
    for (let i = 0; i < 2; i += 1) {
      expect(
        await acquireReadSlot({ stateDir: r.s.lockStateDir, token: newLockToken(), wait: false })
      ).not.toBe(false);
    }
    expect(await r.run(['harness'])).toBe(2);
    expect(r.calls).toHaveLength(0);
    expect(r.lines.some((l) => l.endsWith('no-read-slot'))).toBe(true);
  });

  it('tier S: refused by the cumulative cap before any lock or vitest (exit 2)', async () => {
    const s = scratch();
    recordLedger(
      'aaaaaaaa',
      'integration',
      { R: true, W: true, C: false, S: true },
      { positions: 59 },
      {
        ledgerPath: s.ledgerPath,
      }
    );
    const d = driver({ RTLS_IT_SIDE_EFFECTS: '1', RTLS_IT_WRITES: '1' }, { s });
    expect(await d.run(['assets'])).toBe(2);
    expect(d.calls).toHaveLength(0);
    expect(existsSync(lockPaths(s.lockStateDir).run)).toBe(false);
    expect(d.lines.some((l) => l.includes('ledger-cap'))).toBe(true);
    // A selection whose share fits is not refused.
    expect(await d.run(['harness'])).toBe(0);
  });

  it('an unreachable base URL takes no read slot', async () => {
    const d = driver({ RTLS_BASE_URL: 'http://127.0.0.1:9/api' });
    expect(await d.run(['core'])).toBe(0);
    const call = d.calls[0] as VitestCall;
    expect(call.readSlotHeld).toBe(false);
    expect(call.env.RTLS_IT_INTERNAL_LOCK_TOKEN).toBeUndefined();
  });

  it('exits from report.json: 3 no-credentials, 4 restore-failed, 1 not ok, 1 without a report', async () => {
    expect(await driver({}, { report: { ok: false, abort: 'no-credentials' } }).run([])).toBe(3);
    expect(
      await driver({ RTLS_IT_CONFIG: '1' }, { report: { ok: false, abort: 'restore-failed' } }).run(
        []
      )
    ).toBe(4);
    expect(await driver({}, { report: { ok: false, abort: null } }).run([])).toBe(1);
    const none = driver({}, { report: null });
    expect(await none.run([])).toBe(1);
    expect(none.lines.some((l) => l.includes('no report.json'))).toBe(true);
  });

  it('prints the preflight warnings of report.json in the run summary (names only), none when empty', async () => {
    const warned = driver(
      {},
      {
        report: {
          runId: RUN,
          ok: true,
          abort: null,
          preflight: { warnings: ['message-rules-reach-notifications'] },
        },
      }
    );
    expect(await warned.run(['harness'])).toBe(0);
    expect(warned.lines).toContain(
      `test:integration: run ${RUN} preflight warning: message-rules-reach-notifications`
    );
    const quiet = driver(
      {},
      { report: { runId: RUN, ok: true, abort: null, preflight: { warnings: [] } } }
    );
    expect(await quiet.run(['harness'])).toBe(0);
    expect(quiet.lines.filter((l) => l.includes('preflight warning'))).toEqual([]);
  });

  it('writes the record marker with --record and rejects usage errors with exit 2', async () => {
    const d = driver({});
    expect(await d.run(['harness', '--record'])).toBe(0);
    expect(existsSync(join(d.s.stateRoot, RUN, 'record'))).toBe(true);
    expect(await driver({}).run(['nope'])).toBe(2);
    expect(await driver({ RTLS_IT_RUN_ID: 'XYZ' }).run([])).toBe(2);
  });
});
