import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  DUMMY_API_KEY,
  ExampleSkip,
  UNREACHABLE_BASE_URL,
  _resetConfigForTesting,
  createExampleClient,
  getArg,
  hasFlag,
  isTestMac,
  preflightAllows,
  preflightRules,
  reportBudget,
  resolveConfig,
  resolveRunId,
  runExample,
  runId,
  skip,
  testMac,
  testName,
  unreachableConfig,
  type PreflightVerdicts,
} from '../../../examples/shared/config.js';

// Never the real .env: every test that needs loadConfig() uses a temporary file with dummy values.
const FAKE_KEY = 'fake-key-0123456789';
function useTempEnv(text: string) {
  const dir = mkdtempSync(join(tmpdir(), 'examples-config-'));
  const file = join(dir, '.env');
  writeFileSync(file, text);
  _resetConfigForTesting({ envPath: file });
}

describe('examples/shared/config resolveConfig (P0 §6.3)', () => {
  const base = { argv: [] as string[], runId: 'abcdef01' };

  it('process environment wins over .env; .env fills the rest; base URL default without trailing slash', () => {
    const r = resolveConfig({
      ...base,
      env: { RTLS_API_KEY: 'from-env', APP_NAMESPACE: '' },
      dotenvText: 'RTLS_API_KEY=from-file\nAPP_NAMESPACE=ns-from-file\n',
      argv: ['--write'],
    });
    expect(r).toEqual({
      ok: true,
      config: {
        apiKey: 'from-env',
        namespace: 'ns-from-file',
        baseUrl: 'https://rtls.ubudu.com/api',
        write: true,
        runId: 'abcdef01',
      },
    });
    const custom = resolveConfig({
      ...base,
      env: { RTLS_API_KEY: 'k', APP_NAMESPACE: 'n', RTLS_BASE_URL: 'http://127.0.0.1:9/api/' },
    });
    expect(custom.ok && custom.config.baseUrl).toBe('http://127.0.0.1:9/api');
    expect(custom.ok && custom.config.write).toBe(false);
  });

  it('a tier key or an RTLS_IT_INTERNAL_ key in .env is exit 2, naming the keys only', () => {
    const r = resolveConfig({
      ...base,
      env: {},
      dotenvText: `RTLS_API_KEY=${FAKE_KEY}\nAPP_NAMESPACE=n\nRTLS_IT_WRITES=1\nRTLS_IT_INTERNAL_LOCK_TOKEN=tok-999\n`,
    });
    expect(r).toEqual({
      ok: false,
      code: 2,
      message: 'CONFIG INVALID: RTLS_IT_WRITES, RTLS_IT_INTERNAL_LOCK_TOKEN',
    });
    for (const key of ['RTLS_IT_CONFIG', 'RTLS_IT_SIDE_EFFECTS']) {
      const one = resolveConfig({ ...base, env: {}, dotenvText: `${key}=1\n` });
      expect(one).toEqual({ ok: false, code: 2, message: `CONFIG INVALID: ${key}` });
    }
    // In the process environment a tier flag is legitimate (set on the command line).
    const fromEnv = resolveConfig({
      ...base,
      env: { RTLS_API_KEY: 'k', APP_NAMESPACE: 'n', RTLS_IT_WRITES: '1' },
    });
    expect(fromEnv.ok).toBe(true);
  });

  it('missing credentials are exit 3 with the names only', () => {
    const r = resolveConfig({
      ...base,
      env: {},
      dotenvText: 'RTLS_BASE_URL=http://x.invalid/api\n',
    });
    expect(r).toEqual({
      ok: false,
      code: 3,
      message: 'CONFIG MISSING: RTLS_API_KEY, APP_NAMESPACE',
    });
    const keyOnly = resolveConfig({ ...base, env: { RTLS_API_KEY: FAKE_KEY } });
    expect(keyOnly).toEqual({ ok: false, code: 3, message: 'CONFIG MISSING: APP_NAMESPACE' });
    expect(JSON.stringify(keyOnly)).not.toContain(FAKE_KEY);
  });

  it('resolveRunId: valid override kept, ABC rejected (exit 2), absent → random 8 hex', () => {
    expect(resolveRunId({ RTLS_IT_RUN_ID: '3fa9c0de' })).toEqual({ ok: true, runId: '3fa9c0de' });
    expect(resolveRunId({ RTLS_IT_RUN_ID: 'ABC' })).toEqual({
      ok: false,
      code: 2,
      message: 'CONFIG INVALID: RTLS_IT_RUN_ID',
    });
    const random = resolveRunId({});
    expect(random.ok && random.runId).toMatch(/^[0-9a-f]{8}$/);
  });
});

describe('examples/shared/config names, MACs, flags, budget, skip', () => {
  it('testName and testMac follow the harness scheme', () => {
    expect(runId).toMatch(/^[0-9a-f]{8}$/);
    expect(testName('ex14')).toBe(`sdk-test-${runId}-ex14`);
    expect(() => testName('Bad Label')).toThrow(TypeError);
    expect(() => testName('-x')).toThrow(TypeError);
    expect(() => testName('a'.repeat(41))).toThrow(TypeError);
    expect(testMac(0)).toBe(`025d4b${runId.slice(0, 4)}00`);
    expect(testMac(255)).toBe(`025d4b${runId.slice(0, 4)}ff`);
    expect(testMac(75)).toMatch(/^025d4b[0-9a-f]{4}4b$/);
    for (const bad of [256, -1, 1.5, Number.NaN]) expect(() => testMac(bad)).toThrow(RangeError);
  });

  it('isTestMac ignores separators and case, and accepts only the 025d4b prefix', () => {
    expect(isTestMac('02:5D:4B:3F:A9:01')).toBe(true);
    expect(isTestMac('02-5d-4b-3f-a9-01')).toBe(true);
    expect(isTestMac(testMac(60))).toBe(true);
    expect(isTestMac('aabbccddeeff')).toBe(false);
    expect(isTestMac('025d4b3fa9')).toBe(false);
    expect(isTestMac('025d4b3fa9010')).toBe(false);
    expect(isTestMac(undefined as unknown as string)).toBe(false);
  });

  it('hasFlag and getArg read --name, --name=v and --name v', () => {
    const argv = ['--write', '--map=12', '--lat', '48.8', '--tag'];
    expect(hasFlag('write', argv)).toBe(true);
    expect(hasFlag('wri', argv)).toBe(false);
    expect(getArg('map', 'x', argv)).toBe('12');
    expect(getArg('lat', 'x', argv)).toBe('48.8');
    expect(getArg('tag', 'none', argv)).toBe('none');
    expect(getArg('lon', '2.3', argv)).toBe('2.3');
  });

  it('reportBudget prints the BUDGET line with zero defaults; skip throws ExampleSkip', () => {
    const lines: string[] = [];
    const spy = vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => {
      lines.push(a.join(' '));
    });
    reportBudget({ positions: 1, notifications: 2 });
    reportBudget({});
    spy.mockRestore();
    expect(lines).toEqual([
      'BUDGET positions=1 notifications=2 ble=0 etl=0',
      'BUDGET positions=0 notifications=0 ble=0 etl=0',
    ]);
    expect(() => reportBudget({ ble: -1 })).toThrow(RangeError);
    expect(() => skip('tier', 'RTLS_IT_WRITES not set')).toThrow(ExampleSkip);
    expect(() => skip('tier', 'x')).toThrow(
      expect.objectContaining({ category: 'tier', text: 'x' })
    );
    expect(() => skip('nope' as 'tier', 'x')).toThrow(TypeError);
  });

  it('preflightAllows applies the G18 rule per shape', () => {
    const all: PreflightVerdicts = {
      ruleEngineSafe: true,
      positionSafe: true,
      declaredPositionSafe: true,
      linkedNamespaceSafe: true,
      linkedCount: 0,
      blocking: [],
    };
    const shapes = ['assets', 'publish', 'declared'] as const;
    const row = (v: Partial<PreflightVerdicts>) =>
      shapes.map((s) => preflightAllows({ ...all, ...v }, s));
    expect(row({})).toEqual([true, true, true]);
    expect(row({ ruleEngineSafe: false })).toEqual([false, false, false]);
    expect(row({ linkedNamespaceSafe: false })).toEqual([false, true, false]);
    expect(row({ positionSafe: false })).toEqual([true, false, true]);
    expect(row({ declaredPositionSafe: false })).toEqual([true, true, false]);
    expect(() => preflightAllows(all, 'other' as 'assets')).toThrow(TypeError);
  });

  // review round 2 (LIVE-TESTING §2.7): a verdict that holds only through the time_in_zone leaf ends at its limit
  it('preflightAllows applies the time limit of a verdict listed in timeLimited', () => {
    const base: PreflightVerdicts = {
      ruleEngineSafe: true,
      positionSafe: true,
      declaredPositionSafe: true,
      linkedNamespaceSafe: true,
      linkedCount: 0,
      blocking: [],
    };
    const shapes = ['assets', 'publish', 'declared'] as const;
    const later = new Date(Date.now() + 3_600_000).toISOString();
    const earlier = new Date(Date.now() - 1).toISOString();
    const row = (v: Partial<PreflightVerdicts>) =>
      shapes.map((s) => preflightAllows({ ...base, ...v }, s));
    expect(row({ timeLimited: ['declaredPositionSafe'], timeLimitedUntil: later })).toEqual([
      true,
      true,
      true,
    ]);
    expect(row({ timeLimited: ['declaredPositionSafe'], timeLimitedUntil: earlier })).toEqual([
      true,
      true,
      false,
    ]);
    expect(
      row({ timeLimited: ['positionSafe', 'declaredPositionSafe'], timeLimitedUntil: earlier })
    ).toEqual([true, false, false]);
    for (const until of [null, undefined, 'not a time'])
      expect(row({ timeLimited: ['positionSafe'], timeLimitedUntil: until })).toEqual([
        true,
        false,
        true,
      ]);
  });
});

// review round 3: a declaring example reads preflight.json through preflightRules(); the time limit must survive
// that reader (a temporary state root, never the repository's run state)
describe('examples/shared/config preflightRules reads the time limit of preflight.json', () => {
  const verdicts: PreflightVerdicts = {
    ruleEngineSafe: true,
    positionSafe: true,
    declaredPositionSafe: true,
    linkedNamespaceSafe: true,
    linkedCount: 0,
    blocking: [],
  };
  const fromFile = async (content: Record<string, unknown>): Promise<PreflightVerdicts> => {
    const root = mkdtempSync(join(tmpdir(), 'examples-state-'));
    mkdirSync(join(root, runId), { recursive: true });
    writeFileSync(join(root, runId, 'preflight.json'), JSON.stringify(content));
    _resetConfigForTesting({ stateRoot: root });
    vi.stubEnv('RTLS_IT_RUN_ID', runId);
    return preflightRules();
  };

  afterEach(() => {
    vi.unstubAllEnvs();
    _resetConfigForTesting();
  });

  it('a listed verdict past its end is refused, a non-listed one admitted', async () => {
    const past = new Date(Date.now() - 1_000).toISOString();
    const pf = await fromFile({
      ...verdicts,
      timeLimited: ['declaredPositionSafe'],
      timeLimitedUntil: past,
    });
    expect(pf).toEqual({
      ...verdicts,
      timeLimited: ['declaredPositionSafe'],
      timeLimitedUntil: past,
    });
    expect(preflightAllows(pf, 'declared')).toBe(false);
    expect(preflightAllows(pf, 'publish')).toBe(true);
    expect(preflightAllows(pf, 'assets')).toBe(true);
  });

  it('a listed verdict before its end is admitted', async () => {
    const future = new Date(Date.now() + 3_600_000).toISOString();
    const pf = await fromFile({
      ...verdicts,
      timeLimited: ['positionSafe', 'declaredPositionSafe'],
      timeLimitedUntil: future,
    });
    expect([preflightAllows(pf, 'publish'), preflightAllows(pf, 'declared')]).toEqual([true, true]);
  });

  it('a timeLimited that is not an array fails both position verdicts; a missing end refuses at once', async () => {
    const future = new Date(Date.now() + 3_600_000).toISOString();
    for (const timeLimited of ['declaredPositionSafe', { 0: 'declaredPositionSafe' }, null]) {
      const pf = await fromFile({ ...verdicts, timeLimited, timeLimitedUntil: future });
      expect([pf.positionSafe, pf.declaredPositionSafe]).toEqual([false, false]);
      expect(preflightAllows(pf, 'publish')).toBe(false);
      expect(preflightAllows(pf, 'declared')).toBe(false);
      expect(preflightAllows(pf, 'assets')).toBe(true);
    }
    const noEnd = await fromFile({ ...verdicts, timeLimited: ['declaredPositionSafe'] });
    expect(noEnd.timeLimitedUntil).toBeNull();
    expect(preflightAllows(noEnd, 'declared')).toBe(false);
    // the literal form keeps the same rule
    expect(
      preflightAllows(
        { ...verdicts, timeLimited: 'positionSafe' as unknown as ['positionSafe'] },
        'publish'
      )
    ).toBe(false);
  });
});

describe('examples/shared/config clients and runExample', () => {
  let lines: string[];
  let exits: number[];

  beforeEach(() => {
    vi.stubEnv('RTLS_API_KEY', FAKE_KEY);
    vi.stubEnv('APP_NAMESPACE', 'test-ns');
    vi.stubEnv('RTLS_BASE_URL', 'https://rtls.test/api');
    useTempEnv('# dummy\n');
    lines = [];
    exits = [];
    vi.spyOn(process.stdout, 'write').mockImplementation(((chunk: unknown, ...rest: unknown[]) => {
      lines.push(String(chunk));
      const cb = rest.find((r) => typeof r === 'function') as (() => void) | undefined;
      cb?.();
      return true;
    }) as typeof process.stdout.write);
    vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      exits.push(code ?? 0);
    }) as typeof process.exit);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.useRealTimers();
    _resetConfigForTesting();
  });

  it('createExampleClient uses the loaded configuration and lets overrides win', async () => {
    const seen: { url: string; key: string | null }[] = [];
    const fakeFetch = (async (input: Request | string | URL, init?: RequestInit) => {
      const req = new Request(input, init);
      seen.push({ url: req.url, key: req.headers.get('X-API-Key') });
      return new Response(JSON.stringify({ status: 'OK' }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }) as typeof fetch;
    await expect(createExampleClient({ fetch: fakeFetch }).health()).resolves.toEqual({
      status: 'OK',
    });
    await createExampleClient({
      fetch: fakeFetch,
      baseUrl: 'https://other.test/api',
      apiKey: 'k2',
    }).health();
    expect(seen).toEqual([
      { url: 'https://rtls.test/api/health', key: FAKE_KEY },
      { url: 'https://other.test/api/health', key: 'k2' },
    ]);
  });

  it('unreachableConfig gives the RFC 5737 address, the dummy key and the configured namespace', () => {
    expect(unreachableConfig()).toEqual({
      baseUrl: UNREACHABLE_BASE_URL,
      apiKey: DUMMY_API_KEY,
      namespace: 'test-ns',
    });
    expect(UNREACHABLE_BASE_URL).toBe('http://192.0.2.1/api');
    expect(DUMMY_API_KEY).toBe('sdk-test-dummy-key');
  });

  it('success prints DONE <id> as the last line and exits 0', async () => {
    let seenNamespace = '';
    const logged = vi.spyOn(console, 'log').mockImplementation(() => {});
    await runExample('99-sample', async ({ config, log }) => {
      seenNamespace = config.namespace;
      log('working', 2);
    });
    expect(seenNamespace).toBe('test-ns');
    expect(logged).toHaveBeenCalledWith('working', 2);
    expect(lines.at(-1)).toBe('DONE 99-sample\n');
    expect(exits).toEqual([0]);
  });

  it('skip() prints SKIPPED: <category> <text> and exits 0', async () => {
    await runExample('99-sample', async () => skip('feature-off', 'notifications disabled'));
    expect(lines.at(-1)).toBe('SKIPPED: feature-off notifications disabled\n');
    expect(exits).toEqual([0]);
  });

  it('an error prints one FAILED line without stack or credential and exits 1', async () => {
    await runExample('99-sample', async () => {
      throw new TypeError(`bad call with ${FAKE_KEY}\n    at somewhere (file.js:1:1)`);
    });
    expect(lines.at(-1)).toBe(
      'FAILED 99-sample: TypeError: bad call with <redacted> at somewhere (file.js:1:1)\n'
    );
    expect(lines.join('')).not.toContain(FAKE_KEY);
    expect(exits).toEqual([1]);
  });

  it('the 120 s deadline aborts the signal and fails the run', async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    const done = runExample('99-sample', async (ctx) => {
      signal = ctx.signal;
      await new Promise(() => {});
    });
    await vi.advanceTimersByTimeAsync(119_000);
    expect(exits).toEqual([]);
    await vi.advanceTimersByTimeAsync(1_000);
    await done;
    expect(signal?.aborted).toBe(true);
    expect(lines.at(-1)).toBe(
      'FAILED 99-sample: TimeoutError: example deadline of 120 s exceeded\n'
    );
    expect(exits).toEqual([1]);
  });
});
