import { describe, it, expect, vi, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  checkBase,
  runManifestChecks,
  schemaValidators,
} from '../../../scripts/manifest/check.mjs';
import {
  baseTotals,
  loadBase,
  mergeOperations,
  loadPhaseManifests,
  specOperations,
} from '../../../scripts/manifest/load.mjs';
import { buildReport } from '../../../scripts/manifest/report.mjs';
import { main as contractMain } from '../../../scripts/contract.mjs';
import {
  LIVE,
  SAMPLE_BASE,
  SAMPLE_OPS,
  SAMPLE_SURFACE,
  UNIT,
  completeP7,
  scratchRepo,
} from './scratch-repo';

type Entry = Record<string, unknown>;
const run = (
  root: string,
  opts: { phase?: string; release?: boolean; surface?: typeof SAMPLE_SURFACE } = {}
) =>
  runManifestChecks({
    root,
    surface: () => opts.surface ?? SAMPLE_SURFACE,
    phase: opts.phase,
    release: opts.release,
  });
const withOps = (ops: Entry[]) => ({ ...completeP7(), operations: ops });
const P7_LIST = {
  op: 'GET /widgets/{ns}',
  decision: 'wrap',
  sdk: 'etl.list',
  unit: UNIT,
  live: LIVE,
  tier: 'R',
};
const P7_CREATE = {
  op: 'POST /widgets/{ns}',
  decision: 'wrap',
  sdk: 'etl.create',
  unit: UNIT,
  allowlist: 'P7-1',
};

describe('base.json checks (P0 §5.5.2)', () => {
  const validators = schemaValidators(
    join(__dirname, '..', '..', '..', 'spec', 'manifest', 'schema.json')
  );

  it('the committed base.json lists the 176 spec operations: 114 wrap, 62 exclude', () => {
    const base = loadBase();
    expect(checkBase(base, specOperations(), validators.base)).toEqual([]);
    expect(baseTotals(base)).toEqual({
      operations: 176,
      wrap: 114,
      exclude: 62,
      byPhase: {
        none: { wrap: 0, exclude: 44 },
        P2: { wrap: 19, exclude: 3 },
        P3: { wrap: 19, exclude: 0 },
        P4: { wrap: 14, exclude: 6 },
        P5: { wrap: 15, exclude: 3 },
        P6: { wrap: 38, exclude: 1 },
        P7: { wrap: 9, exclude: 5 },
      },
    });
  });

  it('a base with 175 operations fails', () => {
    const base = loadBase();
    const dropped = base.operations[17]!;
    const errors = checkBase(
      { ...base, operations: base.operations.filter((o) => o !== dropped) },
      specOperations()
    );
    expect(errors).toEqual([`base.json: spec operation ${dropped.id} has no decision`]);
  });

  it('an exclude without reason fails', () => {
    const base = loadBase();
    const operations = base.operations.map((o) =>
      o.id === 'GET /status/{component}' ? { ...o, reason: undefined } : o
    );
    const errors = checkBase(
      JSON.parse(JSON.stringify({ ...base, operations })),
      specOperations(),
      validators.base
    );
    expect(errors).toEqual([
      expect.stringMatching(
        /^base\.json: schema: \/operations\/\d+ must have required property 'reason'$/
      ),
    ]);
  });

  it('unknown, duplicated, unsorted, mistagged and phase-less wrapped operations fail', () => {
    const ops = [
      { id: 'GET /zz', tag: 'X', phase: 'P2', decision: 'wrap' },
      { id: 'GET /aa', tag: 'Wrong', phase: 'P2', decision: 'wrap' },
      { id: 'GET /aa', tag: 'Wrong', phase: 'none', decision: 'wrap' },
    ] as const;
    const errors = checkBase({ specVersion: 'x', operations: [...ops] }, [
      { id: 'GET /aa', tag: 'A' },
    ]);
    expect(errors).toEqual([
      'base.json: GET /zz is not an operation of the vendored spec',
      'base.json: GET /aa is out of order (sort by id)',
      'base.json: GET /aa tag "Wrong" differs from the spec\'s first tag "A"',
      'base.json: GET /aa listed twice',
      'base.json: GET /aa tag "Wrong" differs from the spec\'s first tag "A"',
      'base.json: GET /aa is wrapped by no phase (phase "none" needs decision "exclude")',
    ]);
  });
});

describe('phase manifest checks (P0 §5.5.3)', () => {
  it('a complete, consistent manifest passes, with --phase', () => {
    const root = scratchRepo({ manifests: { P7: completeP7() } });
    expect(run(root, { phase: 'P7' })).toMatchObject({ errors: [], warnings: [] });
  });

  it('a wrap over a base exclude fails', () => {
    const root = scratchRepo({
      manifests: {
        P7: withOps([
          P7_LIST,
          P7_CREATE,
          {
            op: 'DELETE /widgets/{ns}/{id}',
            decision: 'wrap',
            sdk: 'etl.list',
            unit: UNIT,
            allowlist: 'P7-1',
          },
        ]),
      },
    });
    expect(run(root).errors).toEqual([
      'P7.json: operations[2] (DELETE /widgets/{ns}/{id}): decision "wrap" differs from base.json "exclude" (ask the orchestrator)',
    ]);
  });

  it('an exclude over a base wrap fails', () => {
    const root = scratchRepo({
      manifests: {
        P7: withOps([
          P7_LIST,
          { op: 'POST /widgets/{ns}', decision: 'exclude', reason: 'not needed' },
        ]),
      },
    });
    // The entry still counts as listed; with no sdk left, etl.create is listed nowhere.
    expect(run(root).errors).toEqual([
      'P7.json: operations[1] (POST /widgets/{ns}): decision "exclude" differs from base.json "wrap" (ask the orchestrator)',
      'P7.json: surface item etl.create (src/resources/etl.ts:7) is not listed in any manifest',
    ]);
  });

  it('an unknown op, an op of another phase and a duplicate fail', () => {
    const root = scratchRepo({
      manifests: {
        P7: withOps([
          P7_LIST,
          P7_CREATE,
          P7_CREATE,
          { op: 'GET /nope', decision: 'wrap' },
          { op: 'GET /health', decision: 'wrap' },
        ]),
      },
    });
    expect(run(root).errors).toEqual([
      'P7.json: operations[2] (POST /widgets/{ns}): listed twice',
      'P7.json: operations[3] (GET /nope): not an operation of base.json',
      'P7.json: operations[4] (GET /health): owned by P5 in base.json, not P7',
    ]);
  });

  it('a missing referenced file fails', () => {
    const root = scratchRepo({
      manifests: {
        P7: withOps([{ ...P7_LIST, unit: 'test/resources/etl/missing.test.ts' }, P7_CREATE]),
      },
    });
    expect(run(root).errors).toEqual([
      'P7.json: operations[0] (GET /widgets/{ns}): file test/resources/etl/missing.test.ts not found',
    ]);
  });

  it('complete with an unmapped wrap op fails', () => {
    const root = scratchRepo({ manifests: { P7: withOps([P7_LIST]) } });
    expect(
      run(root, {
        surface: {
          ...SAMPLE_SURFACE,
          items: SAMPLE_SURFACE.items.filter((i) => i.name !== 'etl.create'),
        },
      }).errors
    ).toEqual(['P7.json: wrapped operation POST /widgets/{ns} is not listed']);
  });

  it('complete with a surface item of the phase that no manifest lists fails', () => {
    const root = scratchRepo({ manifests: { P7: completeP7() } });
    const surface = {
      ...SAMPLE_SURFACE,
      items: [...SAMPLE_SURFACE.items, { name: 'etl.extra', file: 'src/types/etl.ts', line: 2 }],
    };
    expect(run(root, { surface }).errors).toEqual([
      'P7.json: surface item etl.extra (src/types/etl.ts:2) is not listed in any manifest',
    ]);
  });

  it('complete with a listed name that is not in the surface fails', () => {
    const root = scratchRepo({
      manifests: {
        P7: {
          ...withOps([{ ...P7_LIST, sdk: ['etl.list', 'etl.typo'] }, P7_CREATE]),
          sdkMethods: [{ name: 'NOPE', unit: UNIT, live: LIVE, tier: 'R' }],
        },
      },
    });
    expect(run(root).errors).toEqual([
      'P7.json: name etl.typo is not in the public surface',
      'P7.json: sdkMethods name NOPE is not exported',
    ]);
  });

  it('an empty live list without allowlist fails', () => {
    const root = scratchRepo({
      manifests: { P7: withOps([{ ...P7_LIST, live: [], tier: undefined }, P7_CREATE]) },
    });
    expect(run(root).errors).toEqual([
      'P7.json: operations[0] (GET /widgets/{ns}): live is empty and no allowlist is given',
      'P7.json: operations[0] (GET /widgets/{ns}): live test (with tier) or allowlist required',
    ]);
  });

  it('a tier that no describeLive of the live file declares fails, and live without tier fails', () => {
    const wrongTier = scratchRepo({
      manifests: { P7: withOps([{ ...P7_LIST, tier: 'W' }, P7_CREATE]) },
    });
    expect(run(wrongTier).errors).toEqual([
      `P7.json: operations[0] (GET /widgets/{ns}): no describeLive('W', …) in ${LIVE}`,
    ]);
    const noTier = scratchRepo({
      manifests: { P7: withOps([{ ...P7_LIST, tier: undefined }, P7_CREATE]) },
    });
    expect(run(noTier).errors).toEqual([
      'P7.json: operations[0] (GET /widgets/{ns}): tier is required when live is given',
    ]);
  });

  it('an allowlist id that the phase allowlist does not hold fails', () => {
    const root = scratchRepo({
      manifests: { P7: withOps([P7_LIST, { ...P7_CREATE, allowlist: 'P7-9' }]) },
    });
    expect(run(root).errors).toEqual([
      'P7.json: operations[1] (POST /widgets/{ns}): allowlist id P7-9 not found in test/integration/allowlist/P7.json',
    ]);
  });

  it('a draft tolerates gaps (unlisted ops, no sdk, no fixture, unlisted surface items)', () => {
    const draft = {
      phase: 'P7',
      domain: 'etl',
      status: 'draft',
      operations: [{ op: 'GET /widgets/{ns}', decision: 'wrap' }],
    };
    const root = scratchRepo({
      manifests: { P7: draft },
      files: { 'test/fixtures/etl/list.json': null },
    });
    const surface = vi.fn(() => SAMPLE_SURFACE);
    const result = runManifestChecks({ root, surface });
    expect(result.errors).toEqual([]);
    expect(surface).not.toHaveBeenCalled();
    expect(run(root, { phase: 'P7' }).errors).toContain(
      'P7.json: status is "draft"; this check requires "complete"'
    );
  });

  it('phase and domain must match the file name; the schema is strict', () => {
    const root = scratchRepo({
      manifests: {
        P6: { phase: 'P7', domain: 'etl', status: 'draft', operations: [] },
        P5: {
          phase: 'P5',
          domain: 'dashboards-rules',
          status: 'draft',
          operations: [{ op: 'GET /health', decision: 'wrap', sdkMethod: 'x' }],
        },
      },
    });
    expect(run(root).errors).toEqual([
      'P5.json: schema: /operations/0 must NOT have additional properties',
      'P6.json: phase "P7" does not match the file name (P6)',
      'P6.json: domain "etl" is not the domain of P6 (notifications)',
    ]);
  });

  it('nonHttp, sdkMethods, aliases and localMethods are accepted', () => {
    const p8 = {
      phase: 'P8',
      domain: 'websocket',
      status: 'complete',
      operations: [],
      nonHttp: [
        {
          id: 'WS-C1',
          kind: 'ws-command',
          decision: 'wrap',
          sdk: 'RtlsWebSocketSubscriber.subscribe',
          unit: UNIT,
          live: LIVE,
          tier: 'R',
        },
        { id: 'WS-C7', kind: 'ws-command', decision: 'wrap', unit: UNIT, live: LIVE, tier: 'R' },
        {
          id: 'WS-X1',
          kind: 'ws-command',
          decision: 'exclude',
          reason: 'Destructive operator command.',
        },
      ],
      sdkMethods: [{ name: 'ETL_VERSION', unit: UNIT, live: LIVE, tier: 'R', deprecated: true }],
    };
    const p1 = {
      phase: 'P1',
      domain: 'core',
      status: 'draft',
      operations: [],
      aliases: [{ sdk: 'client.health', op: 'GET /health', unit: UNIT, live: LIVE, tier: 'R' }],
      localMethods: ['client.forNamespace'],
    };
    const root = scratchRepo({ manifests: { P7: completeP7(), P8: p8, P1: p1 } });
    expect(run(root, { phase: 'P8' }).errors).toEqual([]);
    const badAlias = scratchRepo({
      manifests: {
        P1: {
          ...p1,
          aliases: [{ sdk: 'client.health', op: 'GET /gone', unit: UNIT, allowlist: 'P1-1' }],
        },
      },
    });
    expect(run(badAlias).errors).toEqual([
      'P1.json: aliases[0] (client.health): op GET /gone is not an operation of base.json',
      'P1.json: aliases[0] (client.health): allowlist id P1-1 not found in test/integration/allowlist/P1.json',
    ]);
  });

  it('P9 without a manifest passes; a missing P1–P8 manifest is a warning, an error with --release', () => {
    const root = scratchRepo({ manifests: { P7: null } });
    const plain = run(root, { phase: 'P9' });
    expect(plain.errors).toEqual([]);
    expect(plain.warnings).toEqual(['spec/manifest/P7.json is missing']);
    expect(run(root, { release: true }).errors).toContain('spec/manifest/P7.json is missing');
  });

  it('--release requires every phase manifest to be complete', () => {
    const root = scratchRepo({ manifests: { P7: completeP7() } });
    const errors = run(root, { release: true }).errors;
    expect(errors.filter((e) => e.includes('requires "complete"'))).toHaveLength(7);
    expect(errors.some((e) => e.startsWith('P7.json'))).toBe(false);
  });

  it('the merged table joins base operations with their phase entries', () => {
    const root = scratchRepo({ manifests: { P7: completeP7() } });
    const rows = mergeOperations(loadBase(root), loadPhaseManifests(root));
    expect(
      rows.map((r) => [r.op, r.phase, r.decision, r.sdk, r.tier ?? r.allowlist ?? null])
    ).toEqual([
      ['DELETE /widgets/{ns}/{id}', 'P7', 'exclude', [], null],
      ['GET /admin/x', 'none', 'exclude', [], null],
      ['GET /health', 'P5', 'wrap', [], null],
      ['GET /widgets/{ns}', 'P7', 'wrap', ['etl.list'], 'R'],
      ['POST /widgets/{ns}', 'P7', 'wrap', ['etl.create'], 'P7-1'],
    ]);
    const report = buildReport({ root });
    expect(report.totals).toEqual({
      operations: 5,
      wrap: 3,
      exclude: 2,
      byPhase: {
        P7: { wrap: 2, exclude: 1 },
        none: { wrap: 0, exclude: 1 },
        P5: { wrap: 1, exclude: 0 },
      },
    });
    expect(report.manifests.P7).toEqual({ domain: 'etl', status: 'complete' });
    expect(SAMPLE_BASE.operations.map((o) => o.id)).toEqual(SAMPLE_OPS.map((o) => o.id));
  });
});

describe('test:contract driver (scripts/contract.mjs)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });
  const quiet = () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    return vi.spyOn(console, 'error').mockImplementation(() => {});
  };

  it.each(['P0', 'P9', 'P10'])(
    '--phase %s (no manifest) runs the contract tests and the merged checks with no status requirement',
    (phase) => {
      quiet();
      const root = scratchRepo();
      const runVitest = vi.fn(() => 0);
      expect(
        contractMain(['--phase', phase], {
          root,
          runVitest,
          checks: { surface: () => SAMPLE_SURFACE },
        })
      ).toBe(0);
      expect(runVitest).toHaveBeenCalledTimes(1);
    }
  );

  it('--phase P7 needs the P7 manifest complete; a failing contract test run fails first', () => {
    quiet();
    const draft = scratchRepo();
    expect(
      contractMain(['--phase', 'P7'], {
        root: draft,
        runVitest: () => 0,
        checks: { surface: () => SAMPLE_SURFACE },
      })
    ).toBe(1);
    const complete = scratchRepo({ manifests: { P7: completeP7() } });
    expect(
      contractMain(['--phase', 'P7'], {
        root: complete,
        runVitest: () => 0,
        checks: { surface: () => SAMPLE_SURFACE },
      })
    ).toBe(0);
    const runChecks = vi.fn(() => 1);
    expect(contractMain([], { root: complete, runVitest: runChecks })).toBe(1);
    expect(contractMain(['--phase', 'P12'], { root: complete, runVitest: () => 0 })).toBe(2);
  });

  it('--release fails on an "override possibly unnecessary" fixture report', () => {
    const err = quiet();
    const root = scratchRepo({
      manifests: Object.fromEntries(
        ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P8'].map((p) => [p, null])
      ),
    });
    const reportDir = mkdtempSync(join(tmpdir(), 'contract-report-'));
    const fixtureReport = join(reportDir, 'fixtures-report.json');
    writeFileSync(
      fixtureReport,
      JSON.stringify({ fixtures: 1, overrideUnnecessary: ['test/fixtures/etl/list.json'] })
    );
    const deps = {
      root,
      runVitest: () => 0,
      fixtureReport,
      checks: { surface: () => SAMPLE_SURFACE },
    };
    expect(contractMain(['--release'], deps)).toBe(1);
    expect(err.mock.calls.flat().join('\n')).toContain('override possibly unnecessary');
  });
});
