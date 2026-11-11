import { describe, it, expect } from 'vitest';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  BUN_FLAGS,
  BUN_MIN_VERSION,
  KNOWN_PATH,
  REPO_ROOT,
  attwChecks,
  bareSpecifiers,
  bunChecks,
  checkDistImports,
  checkTarballFiles,
  compareBunExports,
  compareExports,
  compareVersions,
  evaluateChecks,
  findBun,
  formatRow,
  loadKnown,
  main,
  parsePackJson,
  parseSmokeLine,
  parseVersion,
  publintChecks,
  readBunVersion,
} from '../../../scripts/pack-smoke.mjs';

type Result = { id: string; outcome: 'pass' | 'fail' | 'skip'; detail: string };
type RunOutput = {
  status: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
};
type Runtime = { cmd: string; args: readonly string[] };

const KNOWN = {
  'ws-no-global-esm': {
    owner: 'P8',
    reason: 'The ESM build turns require into a throwing shim; P8 fixes it.',
  },
  'publint:USE_TYPE': {
    owner: 'P1',
    reason: 'A finding that a later phase removes from the packed manifest.',
  },
};

function tempKnown(content: unknown): string {
  const dir = mkdtempSync(join(tmpdir(), 'pack-known-'));
  const path = join(dir, 'known.json');
  writeFileSync(path, typeof content === 'string' ? content : JSON.stringify(content));
  return path;
}

async function runMain(argv: string[], results: Result[], known: unknown = KNOWN) {
  const out: string[] = [];
  const err: string[] = [];
  const code = await main(argv, {
    checks: async () => results,
    knownPath: tempKnown(known),
    log: (l: string) => out.push(l),
    error: (l: string) => err.push(l),
  });
  return { code, out: out.join('\n'), err: err.join('\n') };
}

describe('pack-smoke known list (P0 §5.5.8)', () => {
  it('a known check that fails is reported as known and does not fail the run', async () => {
    const results: Result[] = [
      { id: 'esm', outcome: 'pass', detail: 'ok' },
      { id: 'ws-no-global-esm', outcome: 'fail', detail: 'Dynamic require of "ws"' },
    ];
    const evaluated = evaluateChecks(results, KNOWN);
    expect(evaluated.failed).toBe(false);
    expect(evaluated.rows.find((r) => r.id === 'ws-no-global-esm')).toMatchObject({
      status: 'known',
      known: { owner: 'P8' },
    });
    expect(evaluated.counts).toMatchObject({ known: 1, fail: 0 });
    const run = await runMain([], results);
    expect(run.code).toBe(0);
    expect(run.out).toMatch(/known\s+ws-no-global-esm .*known issue \(owner P8\)/);
  });

  it('a known check that passes prints "known issue no longer reproduces — request removal"', async () => {
    const results: Result[] = [{ id: 'ws-no-global-esm', outcome: 'pass', detail: 'confirmed' }];
    const evaluated = evaluateChecks(results, KNOWN);
    const row = evaluated.rows.find((r) => r.id === 'ws-no-global-esm');
    expect(row).toMatchObject({ status: 'pass', known: { fixed: true } });
    expect(formatRow(row!)).toContain('known issue no longer reproduces — request removal');
    const run = await runMain([], results);
    expect(run.code).toBe(0);
    expect(run.out).toContain('ws-no-global-esm');
    expect(run.out).toContain('known issue no longer reproduces — request removal');
  });

  it('a known finding id that no tool reports any more also asks for removal', () => {
    const evaluated = evaluateChecks([{ id: 'publint', outcome: 'pass', detail: '0' }], KNOWN);
    const row = evaluated.rows.find((r) => r.id === 'publint:USE_TYPE');
    expect(row).toMatchObject({ status: 'pass', known: { fixed: true, owner: 'P1' } });
    // A non-finding id that matched no check is only a warning.
    expect(evaluated.warnings).toEqual(['known entry ws-no-global-esm matches no check that ran']);
  });

  it('--strict ignores the known list: a known failing check fails the run', async () => {
    const results: Result[] = [
      { id: 'ws-no-global-esm', outcome: 'fail', detail: 'Dynamic require of "ws"' },
    ];
    const evaluated = evaluateChecks(results, KNOWN, { strict: true });
    expect(evaluated.failed).toBe(true);
    expect(evaluated.rows).toEqual([
      { id: 'ws-no-global-esm', status: 'fail', detail: 'Dynamic require of "ws"' },
    ]);
    const run = await runMain(['--strict'], results);
    expect(run.code).toBe(1);
    expect(run.err).toMatch(/fail\s+ws-no-global-esm/);
    expect(run.out).toContain('pack-smoke --strict: 0 passed, 0 known, 1 failed, 0 skipped');
    // Without --strict the same results pass.
    expect((await runMain([], results)).code).toBe(0);
  });

  it('--strict does not print the removal request for a known check that passes', () => {
    const evaluated = evaluateChecks(
      [{ id: 'ws-no-global-esm', outcome: 'pass', detail: 'ok' }],
      KNOWN,
      { strict: true }
    );
    expect(evaluated.rows).toEqual([{ id: 'ws-no-global-esm', status: 'pass', detail: 'ok' }]);
    expect(evaluated.warnings).toEqual([]);
  });

  it('an unknown failing check fails the run; a skipped check does not', async () => {
    const run = await runMain(
      [],
      [
        { id: 'cjs', outcome: 'fail', detail: 'exit 1' },
        { id: 'dist-smoke-esm', outcome: 'skip', detail: 'not present (P8)' },
      ]
    );
    expect(run.code).toBe(1);
    expect(run.out).toContain('1 failed, 1 skipped');
  });

  it('loadKnown validates the file and the committed list names owner and reason', () => {
    expect(() => loadKnown(tempKnown({ x: { reason: 'a reason long enough here' } }))).toThrow(
      'owner must be a phase'
    );
    expect(() => loadKnown(tempKnown({ x: { owner: 'P8', reason: 'short' } }))).toThrow(
      'reason must be a sentence'
    );
    expect(() =>
      loadKnown(tempKnown({ 'Bad Id': { owner: 'P8', reason: 'x'.repeat(30) } }))
    ).toThrow('invalid check id');
    expect(() => loadKnown(tempKnown([]))).toThrow('expected an object');
    const committed = loadKnown(KNOWN_PATH);
    // The two ws-no-global entries were removed once P8's build passed them (H-P8-I2).
    expect(Object.keys(committed)).toEqual([]);
  });

  it('usage errors and an invalid known file exit 2', async () => {
    expect((await runMain(['--bogus'], [])).code).toBe(2);
    expect((await runMain([], [], { x: { owner: 'nobody', reason: 'x'.repeat(30) } })).code).toBe(
      2
    );
  });
});

describe('pack-smoke checks (P0 §5.9)', () => {
  const GOOD = [
    'LICENSE',
    'README.md',
    'dist/index.cjs',
    'dist/index.cjs.map',
    'dist/index.d.cts',
    'dist/index.d.ts',
    'dist/index.js',
    'dist/index.js.map',
    'package.json',
  ];

  it('tarball: the exact dist + root files pass; src, .env, stray and missing files fail', () => {
    expect(checkTarballFiles(GOOD).outcome).toBe('pass');
    expect(checkTarballFiles([...GOOD, 'src/index.ts']).detail).toContain(
      'must not contain src/index.ts'
    );
    expect(checkTarballFiles([...GOOD, 'dist/.env']).detail).toContain(
      'must not contain dist/.env'
    );
    expect(checkTarballFiles([...GOOD, 'CHANGELOG.md']).detail).toContain(
      'unexpected CHANGELOG.md'
    );
    expect(checkTarballFiles(GOOD.filter((f) => f !== 'dist/index.d.cts')).detail).toBe(
      'missing dist/index.d.cts'
    );
  });

  it('dist-imports: undeclared bare specifiers fail, builtins and declared packages pass', () => {
    const text = [
      "import createClient from 'openapi-fetch';",
      "import { x } from './local.js';",
      'const ws = __require("ws");',
      "const fs = require('node:fs');",
      "const p = require('path');",
      "const sub = require('@scope/pkg/sub');",
      'for (const key of ["from", "to"]) {}',
      "for (const key of ['from', 'to']) {}",
    ].join('\n');
    expect(bareSpecifiers(text)).toEqual([
      '@scope/pkg/sub',
      'node:fs',
      'openapi-fetch',
      'path',
      'ws',
    ]);
    const pkg = { dependencies: { 'openapi-fetch': '1' }, peerDependencies: { ws: '8' } };
    expect(checkDistImports({ 'dist/index.js': text }, pkg)).toEqual({
      id: 'dist-imports',
      outcome: 'fail',
      detail: 'not in dependencies or peerDependencies: dist/index.js: @scope/pkg/sub',
    });
    expect(
      checkDistImports(
        { 'dist/index.js': text },
        { ...pkg, dependencies: { ...pkg.dependencies, '@scope/pkg': '1' } }
      ).outcome
    ).toBe('pass');
  });

  it('dist-imports: the own package name passes only when the package declares exports (self-reference)', () => {
    const text = [
      "import createClient from 'openapi-fetch';",
      '/**',
      " * import { createRtlsClient } from 'ubudu-rtls-sdk';",
      " * const { createRtlsClient } = require('ubudu-rtls-sdk');",
      ' */',
    ].join('\n');
    const deps = { dependencies: { 'openapi-fetch': '1' } };
    expect(
      checkDistImports(
        { 'dist/index.js': text },
        { ...deps, name: 'ubudu-rtls-sdk', exports: { '.': './dist/index.js' } }
      )
    ).toEqual({
      id: 'dist-imports',
      outcome: 'pass',
      detail: 'bare imports: openapi-fetch, ubudu-rtls-sdk',
    });
    expect(
      checkDistImports({ 'dist/index.js': text }, { ...deps, name: 'ubudu-rtls-sdk' })
    ).toEqual({
      id: 'dist-imports',
      outcome: 'fail',
      detail: 'not in dependencies or peerDependencies: dist/index.js: ubudu-rtls-sdk',
    });
    expect(
      checkDistImports(
        { 'dist/index.js': text },
        { ...deps, name: 'other-name', exports: { '.': './dist/index.js' } }
      ).outcome
    ).toBe('fail');
  });

  it('export-keys: equal sets with the required names pass; a difference or a missing name fails', () => {
    const keys = [
      'RtlsClient',
      'RtlsError',
      'RtlsWebSocketSubscriber',
      'createRtlsClient',
      'filters',
    ];
    expect(compareExports(keys, keys).outcome).toBe('pass');
    expect(compareExports(keys, keys.slice(0, 4)).detail).toBe('only in ESM: filters');
    expect(compareExports(keys.slice(1), keys.slice(1)).detail).toBe('missing RtlsClient');
    expect(compareExports(undefined, keys).outcome).toBe('fail');
  });

  it('consumer output: the last PACK-SMOKE line is parsed; none or invalid JSON gives null', () => {
    expect(parseSmokeLine('noise\nPACK-SMOKE {"ok":false}\nPACK-SMOKE {"ok":true}\n')).toEqual({
      ok: true,
    });
    expect(parseSmokeLine('nothing here')).toBeNull();
    expect(parseSmokeLine('PACK-SMOKE {not json')).toBeNull();
  });

  it('publint and attw findings become one failing check per code or kind', () => {
    expect(publintChecks([{ code: 'USE_TYPE', type: 'suggestion', text: 'use type' }])).toEqual([
      { id: 'publint:USE_TYPE', outcome: 'fail', detail: 'suggestion: use type' },
    ]);
    expect(
      attwChecks({
        analysis: {
          types: { kind: 'included' },
          problems: [{ kind: 'FalseCJS' }, { kind: 'FalseCJS' }],
        },
      })
    ).toEqual([{ id: 'attw:FalseCJS', outcome: 'fail', detail: '2 problem(s) of kind FalseCJS' }]);
    expect(attwChecks({ analysis: { types: { kind: 'included' }, problems: [] } })).toEqual([]);
    expect(attwChecks({ analysis: { types: false } })[0]?.id).toBe('attw:untyped');
  });
});

describe('pack-smoke Bun consumer runtime (P0 §5.9 step 7)', () => {
  const KEYS = [
    'RtlsClient',
    'RtlsError',
    'RtlsWebSocketSubscriber',
    'createRtlsClient',
    'filters',
  ];
  const BIN = '/opt/bun/bin/bun';
  const NOT_FOUND = 'skipped: bun not found (looked on PATH and at ~/.bun/bin/bun)';

  function smokeOutput(kind: string, extra: Record<string, unknown> = {}, status = 0): RunOutput {
    const line = JSON.stringify({
      kind,
      ok: true,
      health: { status: 'OK' },
      requests: ['GET /api/health'],
      exports: KEYS,
      ...extra,
    });
    return { status, signal: null, stdout: `noise\nPACK-SMOKE ${line}\n`, stderr: '' };
  }

  /** A fake Bun: `locate`, `versionOf` and `exec` record what pack-smoke asked of them. */
  function fakeBun(
    bin: string | null,
    version: string | null,
    outputs: Record<string, RunOutput> = {
      'esm.mjs': smokeOutput('esm'),
      'cjs.cjs': smokeOutput('cjs'),
    }
  ) {
    const versionCalls: string[] = [];
    const execCalls: Array<[string, Runtime]> = [];
    return {
      versionCalls,
      execCalls,
      deps: {
        locate: () => bin,
        versionOf: (b: string) => {
          versionCalls.push(b);
          return version;
        },
        exec: (script: string, runtime: Runtime) => {
          execCalls.push([script, runtime]);
          return outputs[script] ?? { status: 1, signal: null, stdout: '', stderr: 'no output' };
        },
        home: '/home/consumer',
      },
    };
  }

  async function runMainWith(argv: string[], deps: ReturnType<typeof fakeBun>['deps']) {
    const out: string[] = [];
    const err: string[] = [];
    const code = await main(argv, {
      checks: async ({ strict }) => bunChecks({ strict, nodeExports: KEYS, ...deps }),
      knownPath: tempKnown({}),
      log: (l: string) => out.push(l),
      error: (l: string) => err.push(l),
    });
    return { code, out: out.join('\n'), err: err.join('\n') };
  }

  it('present: a Bun >= the minimum runs both consumers with the offline flags and prints its version', async () => {
    const bun = fakeBun(BIN, BUN_MIN_VERSION);
    const rows = bunChecks({ nodeExports: KEYS, ...bun.deps });
    expect(rows).toEqual([
      {
        id: 'bun',
        outcome: 'pass',
        detail: `bun ${BUN_MIN_VERSION} at ${BIN} (minimum ${BUN_MIN_VERSION})`,
      },
      { id: 'bun-esm', outcome: 'pass', detail: 'health() → {"status":"OK"}; 5 export keys' },
      { id: 'bun-cjs', outcome: 'pass', detail: 'health() → {"status":"OK"}; 5 export keys' },
      {
        id: 'bun-export-keys',
        outcome: 'pass',
        detail: '5 keys, equal under Bun (ESM and CJS) and Node',
      },
    ]);
    expect(bun.versionCalls).toEqual([BIN]);
    expect(bun.execCalls).toEqual([
      ['esm.mjs', { cmd: BIN, args: ['--no-install', '--no-env-file'] }],
      ['cjs.cjs', { cmd: BIN, args: ['--no-install', '--no-env-file'] }],
    ]);
    expect(BUN_FLAGS).toEqual(['--no-install', '--no-env-file']);
    const run = await runMainWith([], bun.deps);
    expect(run.code).toBe(0);
    expect(run.out).toMatch(/pass\s+bun\s+bun 1\.4\.4 at \/opt\/bun\/bin\/bun \(minimum 1\.4\.4\)/);
    expect(run.out).toContain('pack-smoke: 4 passed, 0 known, 0 failed, 0 skipped');
    // A newer Bun is compared numerically (1.10.0 > 1.4.4), and a path under the home folder prints as ~.
    const newer = fakeBun('/home/consumer/.bun/bin/bun', '1.10.0');
    expect(bunChecks({ nodeExports: KEYS, ...newer.deps })[0]).toEqual({
      id: 'bun',
      outcome: 'pass',
      detail: `bun 1.10.0 at ~/.bun/bin/bun (minimum ${BUN_MIN_VERSION})`,
    });
  });

  it('present: a consumer that fails under Bun, or keys that differ from Node, fail the run', async () => {
    const broken = fakeBun(BIN, BUN_MIN_VERSION, {
      'esm.mjs': smokeOutput('esm', { ok: false, error: 'TypeError: x is not a function' }, 1),
      'cjs.cjs': smokeOutput('cjs', { requests: [] }),
    });
    const rows = bunChecks({ nodeExports: KEYS, ...broken.deps });
    expect(rows.slice(1)).toEqual([
      { id: 'bun-esm', outcome: 'fail', detail: 'TypeError: x is not a function' },
      { id: 'bun-cjs', outcome: 'fail', detail: 'the fake fetch saw no GET …/health ([])' },
      // The ESM keys are still reported by the failing consumer, so the key sets are compared.
      {
        id: 'bun-export-keys',
        outcome: 'pass',
        detail: '5 keys, equal under Bun (ESM and CJS) and Node',
      },
    ]);
    const run = await runMainWith([], broken.deps);
    expect(run.code).toBe(1);
    expect(run.err).toMatch(/fail\s+bun-esm\s+TypeError: x is not a function/);
    expect(run.out).toContain('2 failed');

    const crashed = fakeBun(BIN, BUN_MIN_VERSION, {
      'esm.mjs': { status: null, signal: 'SIGKILL', stdout: '', stderr: '' },
      'cjs.cjs': smokeOutput('cjs'),
    });
    expect(bunChecks({ nodeExports: KEYS, ...crashed.deps }).slice(1)).toEqual([
      { id: 'bun-esm', outcome: 'fail', detail: 'killed by SIGKILL' },
      { id: 'bun-cjs', outcome: 'pass', detail: 'health() → {"status":"OK"}; 5 export keys' },
      { id: 'bun-export-keys', outcome: 'fail', detail: 'export keys missing (esm)' },
    ]);

    expect(compareBunExports(KEYS, KEYS, [...KEYS, 'extra'])).toEqual({
      id: 'bun-export-keys',
      outcome: 'fail',
      detail: 'only under Node: extra',
    });
    expect(compareBunExports([...KEYS, 'bunOnly'], [...KEYS, 'bunOnly'], KEYS).detail).toBe(
      'only under Bun: bunOnly'
    );
    expect(compareBunExports(KEYS, KEYS.slice(1), KEYS).detail).toBe(
      'only in ESM: RtlsClient; missing RtlsClient'
    );
    expect(compareBunExports(KEYS, KEYS, undefined)).toEqual({
      id: 'bun-export-keys',
      outcome: 'fail',
      detail: 'Node export keys missing: nothing to compare with',
    });
  });

  it('absent: every Bun row is "skipped: bun not found", nothing runs, and the run passes', async () => {
    const bun = fakeBun(null, BUN_MIN_VERSION);
    expect(bunChecks({ nodeExports: KEYS, ...bun.deps })).toEqual([
      { id: 'bun', outcome: 'skip', detail: NOT_FOUND },
      { id: 'bun-esm', outcome: 'skip', detail: NOT_FOUND },
      { id: 'bun-cjs', outcome: 'skip', detail: NOT_FOUND },
      { id: 'bun-export-keys', outcome: 'skip', detail: NOT_FOUND },
    ]);
    expect(bun.versionCalls).toEqual([]);
    expect(bun.execCalls).toEqual([]);
    const run = await runMainWith([], bun.deps);
    expect(run.code).toBe(0);
    expect(run.out).toContain('pack-smoke: 0 passed, 0 known, 0 failed, 4 skipped');
  });

  it('too old or unreadable: the Bun rows are skipped with the reason and nothing runs', () => {
    const cases: Array<[string | null, string]> = [
      ['1.4.3', `bun 1.4.3 at ${BIN} is older than the minimum ${BUN_MIN_VERSION}`],
      ['1.3.99', `bun 1.3.99 at ${BIN} is older than the minimum ${BUN_MIN_VERSION}`],
      [
        `${BUN_MIN_VERSION}-canary.2+38afee6c8`,
        `bun ${BUN_MIN_VERSION}-canary.2+38afee6c8 at ${BIN} is older than the minimum ${BUN_MIN_VERSION}`,
      ],
      ['not a version', `bun at ${BIN} reported an unreadable version "not a version"`],
      [null, `bun at ${BIN} reported no version (bun --version)`],
    ];
    for (const [version, reason] of cases) {
      const bun = fakeBun(BIN, version);
      const rows = bunChecks({ nodeExports: KEYS, ...bun.deps });
      expect(rows.map((r) => [r.id, r.outcome, r.detail])).toEqual(
        ['bun', 'bun-esm', 'bun-cjs', 'bun-export-keys'].map((id) => [
          id,
          'skip',
          `skipped: ${reason}`,
        ])
      );
      expect(bun.execCalls).toEqual([]);
    }
  });

  it('--strict: a missing or too old Bun fails the run; a usable one passes', async () => {
    for (const [bin, version, reason] of [
      [null, BUN_MIN_VERSION, 'bun not found (looked on PATH and at ~/.bun/bin/bun)'],
      [BIN, '1.4.3', `bun 1.4.3 at ${BIN} is older than the minimum ${BUN_MIN_VERSION}`],
    ] as const) {
      const bun = fakeBun(bin, version);
      const strict = await runMainWith(['--strict'], bun.deps);
      expect(strict.code).toBe(1);
      expect(strict.err).toContain(
        `fail   bun                 ${reason}; --strict requires bun >= ${BUN_MIN_VERSION}`
      );
      expect(strict.out).toContain('pack-smoke --strict: 0 passed, 0 known, 1 failed, 3 skipped');
      expect(bun.execCalls).toEqual([]);
      // The same Bun without --strict only skips.
      expect((await runMainWith([], bun.deps)).code).toBe(0);
    }
    const good = await runMainWith(['--strict'], fakeBun(BIN, BUN_MIN_VERSION).deps);
    expect(good.code).toBe(0);
    expect(good.out).toContain('pack-smoke --strict: 4 passed, 0 known, 0 failed, 0 skipped');
  });

  it('findBun: the first executable bun on PATH, else ~/.bun/bin/bun, else null', () => {
    const root = mkdtempSync(join(tmpdir(), 'find-bun-'));
    const dir = (name: string) => {
      const path = join(root, name);
      mkdirSync(path, { recursive: true });
      return path;
    };
    const binary = (folder: string, mode: number) => {
      const path = join(folder, 'bun');
      writeFileSync(path, '#!/bin/sh\nexit 0\n');
      chmodSync(path, mode);
      return path;
    };
    const empty = dir('empty');
    const firstDir = dir('first');
    const firstBun = binary(firstDir, 0o755);
    const secondDir = dir('second');
    const secondBun = binary(secondDir, 0o755);
    const notExecutable = dir('not-executable');
    binary(notExecutable, 0o644);
    const folderNamedBun = dir('folder');
    mkdirSync(join(folderNamedBun, 'bun'));
    const home = dir('home');
    const homeBun = binary(dir('home/.bun/bin'), 0o755);
    const noHome = dir('no-home');
    const opts = { platform: 'linux' as const };
    const path = (...dirs: string[]) => dirs.join(':');

    expect(findBun({ ...opts, path: path(empty, firstDir, secondDir), home })).toBe(firstBun);
    expect(findBun({ ...opts, path: path(empty, secondDir, firstDir), home })).toBe(secondBun);
    expect(findBun({ ...opts, path: path(empty, notExecutable), home })).toBe(homeBun);
    expect(findBun({ ...opts, path: folderNamedBun, home })).toBe(homeBun);
    expect(findBun({ ...opts, path: '', home })).toBe(homeBun);
    expect(
      findBun({ ...opts, path: path(empty, notExecutable, folderNamedBun), home: noHome })
    ).toBeNull();
    expect(findBun({ ...opts, path: secondDir, home: noHome })).toBe(secondBun);
  });

  it('readBunVersion reads the first line of `bun --version`; a failing or missing binary gives null', () => {
    const root = mkdtempSync(join(tmpdir(), 'bun-version-'));
    const script = (name: string, body: string) => {
      const path = join(root, name);
      writeFileSync(path, `#!/bin/sh\n${body}\n`);
      chmodSync(path, 0o755);
      return path;
    };
    expect(readBunVersion(script('good', 'echo "1.4.4"'))).toBe('1.4.4');
    expect(readBunVersion(script('failing', 'echo "1.4.4"; exit 3'))).toBeNull();
    expect(readBunVersion(script('silent', 'exit 0'))).toBeNull();
    expect(readBunVersion(join(root, 'missing'))).toBeNull();
  });

  it('parseVersion and compareVersions compare numerically, a prerelease before its release', () => {
    const v = (text: string) => {
      const parsed = parseVersion(text);
      if (!parsed) throw new Error(`unparsed ${text}`);
      return parsed;
    };
    expect(parseVersion('v1.4.4')).toEqual({ major: 1, minor: 4, patch: 4, pre: '' });
    expect(parseVersion('1.4.5-canary.3+38afee6c8')).toEqual({
      major: 1,
      minor: 4,
      patch: 5,
      pre: 'canary.3',
    });
    expect(parseVersion('1.4')).toBeNull();
    expect(compareVersions(v('1.4.4'), v('1.4.4'))).toBe(0);
    expect(compareVersions(v('1.10.0'), v('1.4.4'))).toBeGreaterThan(0);
    expect(compareVersions(v('2.0.0'), v('1.4.4'))).toBeGreaterThan(0);
    expect(compareVersions(v('1.4.4-canary.1'), v('1.4.4'))).toBeLessThan(0);
    expect(compareVersions(v('1.4.5-canary.1'), v('1.4.4'))).toBeGreaterThan(0);
    expect(compareVersions(v('0.9.9'), v('1.4.4'))).toBeLessThan(0);
  });

  it('CI: both offline lanes install exactly the minimum Bun version; the release jobs do not', () => {
    const gitlab = readFileSync(join(REPO_ROOT, '.gitlab-ci.yml'), 'utf8');
    const github = readFileSync(join(REPO_ROOT, '.github', 'workflows', 'ci.yml'), 'utf8');
    /** The text from the `start` line up to the `end` line (or the end); both lines must exist. */
    const section = (text: string, start: string, end?: string) => {
      const from = text.indexOf(start);
      const to = end === undefined ? text.length : text.indexOf(end, from);
      if (from < 0 || to < 0) throw new Error(`section ${start} … ${end ?? 'end'} not found`);
      return text.slice(from, to);
    };
    const offline = section(gitlab, '\noffline:', '\nlive-readonly:');
    expect(offline).toContain(`BUN_VERSION: "${BUN_MIN_VERSION}"`);
    // The job runs its steps through the wrapper (Docker and shell executors alike); the steps are in a script.
    expect(offline).toContain(
      '- sh scripts/ci/in-container.sh "node:${NODE_VERSION}" sh scripts/ci/offline.sh\n'
    );
    const steps = readFileSync(join(REPO_ROOT, 'scripts', 'ci', 'offline.sh'), 'utf8');
    expect(steps).toMatch(
      /\nnpm ci [^\n]*\nnpm install --global [^\n]*"bun@\$BUN_VERSION"\n(?:[^\n]*\n)*?npm run ci:offline\n/
    );
    for (const release of ['publish.sh', 'push-mirror.sh'])
      expect(readFileSync(join(REPO_ROOT, 'scripts', 'ci', release), 'utf8')).not.toMatch(
        /\bbun\b/i
      );
    expect(section(gitlab, '\npush-to-github:')).not.toMatch(/\bbun\b/i);
    const build = section(github, '\n  build:', '\n  publish-dry-run:');
    expect(build).toMatch(
      new RegExp(
        `uses: oven-sh/setup-bun@v2\\n\\s+with:\\n\\s+bun-version: "${BUN_MIN_VERSION}"\\n`
      )
    );
    expect(build.indexOf('oven-sh/setup-bun@')).toBeLessThan(build.indexOf('npm run ci:offline'));
    expect(section(github, '\n  publish-dry-run:')).not.toMatch(/\bbun\b/i);
  });
});

describe('pack-smoke: the npm pack document', () => {
  const doc = [{ filename: 'ubudu-rtls-sdk-0.3.0.tgz', files: [{ path: 'package.json' }] }];
  const pretty = JSON.stringify(doc, null, 2);

  it('reads stdout that is the document alone', () => {
    expect(parsePackJson(pretty)).toEqual(doc);
    expect(parsePackJson(JSON.stringify(doc))).toEqual(doc);
  });

  it('reads the document after lifecycle script output on stdout (npm 10)', () => {
    const noisy = [
      '',
      '> ubudu-rtls-sdk@0.3.0 prepare',
      '> npm run generate',
      '',
      '[info] spec/rtls-api.swagger.json → src/generated/schema.ts [176ms]',
      pretty,
      '',
    ].join('\n');
    expect(parsePackJson(noisy)).toEqual(doc);
  });

  it('gives null when stdout holds no document', () => {
    expect(parsePackJson('')).toBeNull();
    expect(parsePackJson('> prepare\nnpm error something failed\n')).toBeNull();
    expect(parsePackJson('{"filename":"x"}')).toBeNull();
  });
});
