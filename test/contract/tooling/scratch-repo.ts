// Scratch repository for the manifest-check tests: a five-operation spec, its base.json, the real manifest
// schema, phase manifests, test files, fixtures and allowlists in a temp folder.
import { copyFileSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

const REPO = resolve(__dirname, '..', '..', '..');

export const SAMPLE_OPS = [
  { id: 'DELETE /widgets/{ns}/{id}', tag: 'ETL' },
  { id: 'GET /admin/x', tag: 'Internal Service Auth' },
  { id: 'GET /health', tag: 'Health' },
  { id: 'GET /widgets/{ns}', tag: 'ETL' },
  { id: 'POST /widgets/{ns}', tag: 'ETL' },
];

export const SAMPLE_BASE = {
  specVersion: '1.0.0-sample',
  operations: [
    {
      id: 'DELETE /widgets/{ns}/{id}',
      tag: 'ETL',
      phase: 'P7',
      decision: 'exclude',
      reason: 'Legacy alias.',
    },
    {
      id: 'GET /admin/x',
      tag: 'Internal Service Auth',
      phase: 'none',
      decision: 'exclude',
      reason: 'Operator.',
    },
    { id: 'GET /health', tag: 'Health', phase: 'P5', decision: 'wrap' },
    { id: 'GET /widgets/{ns}', tag: 'ETL', phase: 'P7', decision: 'wrap' },
    { id: 'POST /widgets/{ns}', tag: 'ETL', phase: 'P7', decision: 'wrap' },
  ],
};

export const UNIT = 'test/resources/etl/widgets.test.ts';
export const LIVE = 'test/integration/etl/read.int.test.ts';

/** A complete, consistent P7 manifest for the sample. */
export function completeP7(): Record<string, unknown> {
  return {
    phase: 'P7',
    domain: 'etl',
    status: 'complete',
    operations: [
      {
        op: 'GET /widgets/{ns}',
        decision: 'wrap',
        sdk: 'etl.list',
        unit: UNIT,
        live: LIVE,
        tier: 'R',
      },
      {
        op: 'POST /widgets/{ns}',
        decision: 'wrap',
        sdk: ['etl.create'],
        unit: UNIT,
        allowlist: 'P7-1',
      },
      { op: 'DELETE /widgets/{ns}/{id}', decision: 'exclude', reason: 'Legacy alias.' },
    ],
    sdkMethods: [{ name: 'ETL_VERSION', unit: UNIT, live: LIVE, tier: 'R' }],
  };
}

export const SAMPLE_SURFACE = {
  items: [
    { name: 'etl.list', file: 'src/resources/etl.ts', line: 3 },
    { name: 'etl.create', file: 'src/resources/etl.ts', line: 7 },
    { name: 'client.health', file: 'src/client/index.ts', line: 5 },
    { name: 'RtlsWebSocketSubscriber.subscribe', file: 'src/websocket/subscriber.ts', line: 9 },
  ],
  values: [{ name: 'ETL_VERSION', file: 'src/resources/etl.ts', line: 12 }],
};

const DOMAINS: Record<string, string> = {
  P1: 'core',
  P2: 'assets',
  P3: 'positions-spatial',
  P4: 'venues-navigation',
  P5: 'dashboards-rules',
  P6: 'notifications',
  P7: 'etl',
  P8: 'websocket',
};

export interface ScratchOptions {
  base?: unknown;
  /** Manifests by phase; `null` removes the seed. Seeds are written for the phases not given. */
  manifests?: Record<string, unknown | null>;
  /** Extra or replaced files; `null` drops a default file. */
  files?: Record<string, string | null>;
}

function write(root: string, rel: string, content: string) {
  const file = join(root, rel);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
}

/** Creates the scratch repository and returns its root. */
export function scratchRepo({
  base = SAMPLE_BASE,
  manifests = {},
  files,
}: ScratchOptions = {}): string {
  const root = mkdtempSync(join(tmpdir(), 'manifest-'));
  const paths: Record<string, Record<string, { responses: object; tags: string[] }>> = {};
  for (const { id, tag } of SAMPLE_OPS) {
    const [method, path] = id.split(' ') as [string, string];
    (paths[path] ??= {})[method.toLowerCase()] = {
      tags: [tag],
      responses: { 200: { description: 'ok' } },
    };
  }
  write(
    root,
    'spec/rtls-api.swagger.json',
    JSON.stringify({ openapi: '3.0.0', info: { version: '1.0.0-sample' }, paths })
  );
  mkdirSync(join(root, 'spec', 'manifest'), { recursive: true });
  copyFileSync(
    join(REPO, 'spec', 'manifest', 'schema.json'),
    join(root, 'spec', 'manifest', 'schema.json')
  );
  write(root, 'spec/manifest/base.json', JSON.stringify(base, null, 2));
  for (const [phase, domain] of Object.entries(DOMAINS)) {
    const m =
      phase in manifests
        ? manifests[phase]
        : { phase, domain, status: 'draft', operations: [], nonHttp: [], sdkMethods: [] };
    if (m !== null) write(root, `spec/manifest/${phase}.json`, JSON.stringify(m, null, 2));
  }
  const defaults: Record<string, string> = {
    [UNIT]: "import { it, expect } from 'vitest';\nit('x', () => expect(1).toBe(1));\n",
    [LIVE]: "describeLive('R', 'widgets', () => {});\n",
    'test/integration/allowlist/P7.json': JSON.stringify([
      { id: 'P7-1', op: 'POST /widgets/{ns}' },
    ]),
    'test/fixtures/etl/list.json': JSON.stringify({
      _source: 'spec',
      _operation: 'GET /widgets/{ns}',
      body: [],
    }),
    'test/fixtures/etl/create.json': JSON.stringify({
      _source: 'live',
      _note: 'text body',
      _operation: 'POST /widgets/{ns}',
      status: 201,
      text: 'Created',
    }),
  };
  for (const [rel, content] of Object.entries({ ...defaults, ...(files ?? {}) }))
    if (content !== null) write(root, rel, content);
  return root;
}
