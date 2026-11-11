import { describe, it, expect, beforeAll } from 'vitest';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import {
  buildModules,
  checkSnippets,
  extractBlocks,
  formatSnippetFinding,
  main,
  parseDirective,
} from '../../../scripts/docs/snippets.mjs';
import { preludeLines } from '../../../scripts/docs/preludes.mjs';

// A hermetic workspace: a tiny fake SDK and its own tsconfig.snippets.json, so these tests do not depend on
// the real SDK surface (which P1–P8 rewrite). One test at the end uses the repository's real configuration.
const FAKE_SDK = `
export interface RtlsClientOptions { apiKey: string; namespace?: string }
export class RtlsClient {
  constructor(readonly options: RtlsClientOptions) {}
  health(): Promise<{ status: string }> { return Promise.resolve({ status: 'OK' }); }
  readonly assets = { list: async (): Promise<{ user_udid: string }[]> => [] };
}
export function createRtlsClient(options: RtlsClientOptions): RtlsClient { return new RtlsClient(options); }
export class RtlsError extends Error {}
export class RtlsWebSocketSubscriber { subscribe(): void {} }
export class RtlsWebSocketPublisher { publish(): void {} }
export const filters = { equals: (field: string, value: string): string => field + ':' + value };
export function combineFilters(...parts: string[]): string { return parts.join(','); }
export type Asset = { user_udid: string };
`;
const FAKE_HARNESS = `export function describeLive(tier: 'R' | 'W', name: string, fn: () => void): void { void tier; void name; fn(); }\n`;
const SNIPPETS_CONFIG = {
  compilerOptions: {
    target: 'ES2022',
    module: 'ESNext',
    moduleResolution: 'bundler',
    lib: ['ES2022', 'DOM'],
    strict: true,
    skipLibCheck: true,
    noEmit: true,
    moduleDetection: 'force',
    types: [],
    paths: { 'ubudu-rtls-sdk': ['./src/index.ts'], '../harness': ['./harness/index.ts'] },
  },
  files: [],
};

let ws: string;

function write(rel: string, text: string) {
  const abs = join(ws, rel);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, text);
}

function check(docs: Record<string, string>) {
  return checkSnippets({
    cwd: ws,
    files: Object.keys(docs),
    read: (f: string) => docs[f] as string,
  });
}

function where(findings: { file: string; line?: number; code?: string }[]) {
  return findings.map((f) => `${f.file}:${f.line} ${f.code}`);
}

beforeAll(() => {
  ws = mkdtempSync(join(tmpdir(), 'snippets-'));
  write('tsconfig.snippets.json', JSON.stringify(SNIPPETS_CONFIG));
  write('src/index.ts', FAKE_SDK);
  write('harness/index.ts', FAKE_HARNESS);
});

describe('docs:snippets extraction (P0 §6.4)', () => {
  it('extracts ts/typescript/js/javascript/mjs blocks with their fence lines, ignores other languages', () => {
    const text = [
      '# Title', //                         1
      '', //                                2
      '```ts', //                           3
      'const a = 1;', //                    4
      '```', //                             5
      '```bash', //                         6
      'npm i', //                           7
      '```', //                             8
      '- item', //                          9
      '  ```javascript', //                10  (inside a list item)
      '  const b = 2;', //                 11
      '  ```', //                          12
      '~~~mjs', //                         13
      'const c = 3;', //                   14
      '~~~', //                            15
      '```typescript title="x"', //        16
      'const d = 4;', //                   17
      '```', //                            18
    ].join('\n');
    const { blocks, findings } = extractBlocks(text, 'docs/x.md');
    expect(findings).toEqual([]);
    expect(blocks.map((b) => [b.lang, b.fenceLine, b.lines])).toEqual([
      ['ts', 3, ['const a = 1;']],
      ['js', 10, ['const b = 2;']],
      ['js', 13, ['const c = 3;']],
      ['ts', 16, ['const d = 4;']],
    ]);
  });

  it('maps a diagnostic to the document line of the offending code line', () => {
    const doc = [
      '# Doc',
      '',
      'Text.',
      '',
      '```ts',
      'const ok = 1;',
      'const n: number = "x";',
      '```',
    ].join('\n');
    const { findings } = check({ 'docs/guides/map.md': doc });
    expect(where(findings)).toEqual(['docs/guides/map.md:7 TS2322']);
    expect(findings[0]?.column).toBe(7);
  });

  it('a skipped block is not compiled and is counted; --list-skips lists it', async () => {
    const doc = [
      '<!-- snippet: skip -->',
      '```ts',
      'client.assets.list(options?) => Promise<Asset[]>',
      '```',
    ].join('\n');
    const result = check({ 'docs/skip.md': doc });
    expect(result.findings).toEqual([]);
    expect(result.skipped.map((b) => `${b.file}:${b.fenceLine}`)).toEqual(['docs/skip.md:2']);
    expect(result.modules).toHaveLength(0);
    // Without the directive the same block fails.
    expect(
      check({ 'docs/skip.md': doc.replace('<!-- snippet: skip -->', '') }).findings.length
    ).toBeGreaterThan(0);

    write('docs/skip.md', doc);
    const out: string[] = [];
    const code = await main(['docs/skip.md', '--list-skips'], {
      cwd: ws,
      baselinePath: join(ws, 'baseline.json'),
      log: (l: string) => out.push(l),
      error: (l: string) => out.push(l),
    });
    expect(code).toBe(0);
    expect(out).toContain('docs/skip.md:2: skip');
    expect(out.join('\n')).toContain('1 blocks (0 checked in 0 modules, 1 skipped)');
  });

  it('prelude=client,subscriber,publisher declares ambient objects; an unknown prelude is reported', () => {
    const body = [
      '```ts',
      'await client.health();',
      'subscriber.subscribe();',
      'publisher.publish();',
      '```',
    ];
    const without = check({ 'docs/p.md': body.join('\n') });
    expect(without.findings.map((f) => f.message)).toEqual([
      "Cannot find name 'client'.",
      "Cannot find name 'subscriber'.",
      "Cannot find name 'publisher'.",
    ]);
    const withPrelude = check({
      'docs/p.md': ['<!-- snippet: prelude=client,subscriber,publisher -->', ...body].join('\n'),
    });
    expect(withPrelude.findings).toEqual([]);
    const bad = check({
      'docs/p.md': ['<!-- snippet: prelude=client,robot -->', ...body].join('\n'),
    });
    expect(bad.findings.map((f) => `${f.line} ${f.code} ${f.message}`)).toEqual([
      '1 SNIPPET unknown prelude "robot"',
      "4 TS2304 Cannot find name 'subscriber'.",
      "5 TS2304 Cannot find name 'publisher'.",
    ]);
    expect(preludeLines(['client'], 'ts')).toEqual([
      "declare const client: import('ubudu-rtls-sdk').RtlsClient;",
    ]);
  });

  it('continue puts a block into the module of the previous checked block', () => {
    const first = ['```ts', "const c = createRtlsClient({ apiKey: 'k' });", '```'];
    const second = ['```ts', 'await c.health();', '```'];
    const joined = check({
      'docs/c.md': [...first, '<!-- snippet: continue -->', ...second].join('\n'),
    });
    expect(joined.findings).toEqual([]);
    expect(joined.modules).toHaveLength(1);
    const separate = check({ 'docs/c.md': [...first, '', ...second].join('\n') });
    // Lines: 1–3 first block, 4 blank, 5 fence, 6 `await c.health();`.
    expect(where(separate.findings)).toEqual(['docs/c.md:6 TS2304']);
    expect(separate.modules).toHaveLength(2);
    const orphan = check({ 'docs/c.md': ['<!-- snippet: continue -->', ...second].join('\n') });
    expect(orphan.findings.map((f) => f.message)).toContain(
      'continue without a previous checked block in this document'
    );
  });

  it('auto-imports only the SDK names a block references and does not declare', () => {
    const doc = [
      '```ts',
      'const filters = { mine: true };',
      "const client = createRtlsClient({ apiKey: 'k' });",
      'let failure: RtlsError | null = null;',
      'const asset: Asset = { user_udid: "x" };',
      'void [filters, client, failure, asset];',
      '```',
    ].join('\n');
    const { findings, modules } = check({ 'docs/a.md': doc });
    expect(findings).toEqual([]);
    const importLine = modules[0]?.text.split('\n')[0];
    expect(importLine).toBe("import { Asset, RtlsError, createRtlsClient } from 'ubudu-rtls-sdk';");
    // A block that imports from the SDK itself gets nothing added.
    const explicit = check({
      'docs/b.md': [
        '```ts',
        "import { createRtlsClient } from 'ubudu-rtls-sdk';",
        "createRtlsClient({ apiKey: 'k' });",
        '```',
      ].join('\n'),
    });
    expect(explicit.findings).toEqual([]);
    expect(explicit.modules[0]?.text.split('\n')[0]).toBe(
      "import { createRtlsClient } from 'ubudu-rtls-sdk';"
    );
    // In JavaScript only value exports are imported (a type cannot be imported there).
    const built = buildModules(
      extractBlocks(
        ['```js', 'createRtlsClient(); /** @type {Asset} */ let a;', '```'].join('\n'),
        'docs/j.md'
      ).blocks,
      { sdkValues: new Set(['createRtlsClient']), sdkTypes: new Set(['Asset']), cwd: ws }
    );
    expect(built.modules[0]?.text.split('\n')[0]).toBe(
      "import { createRtlsClient } from 'ubudu-rtls-sdk';"
    );
  });

  it('a wrong method name is an error at doc:line, printed as `<doc>:<line>: TSxxxx message`', () => {
    const doc = [
      'Intro',
      '```typescript',
      "const client = createRtlsClient({ apiKey: 'k' });",
      'await client.assets.lst();',
      '```',
    ].join('\n');
    const { findings } = check({ 'docs/guides/m.md': doc });
    expect(findings).toHaveLength(1);
    expect(formatSnippetFinding(findings[0]!)).toMatch(
      /^docs\/guides\/m\.md:4: TS2551 Property 'lst' does not exist on type /
    );
  });

  it('`@ubudu/rtls-sdk` does not resolve', () => {
    const doc = [
      '```ts',
      "import { createRtlsClient } from '@ubudu/rtls-sdk';",
      "createRtlsClient({ apiKey: 'k' });",
      '```',
    ].join('\n');
    const { findings } = check({ 'docs/u.md': doc });
    expect(findings.map((f) => `${f.line} ${f.code} ${f.message}`)).toEqual([
      "2 TS2307 Cannot find module '@ubudu/rtls-sdk' or its corresponding type declarations.",
    ]);
  });

  it('JavaScript blocks are checked with checkJs and noImplicitAny off (ESM and require)', () => {
    const doc = [
      '```js',
      'function echo(x) { return x; }',
      'const client = createRtlsClient({ apiKey: 42 });',
      'echo(client);',
      '```',
      '```javascript',
      "const { createRtlsClient: make } = require('ubudu-rtls-sdk');",
      'make({ apiKey: false });',
      '```',
    ].join('\n');
    const { findings, modules } = check({ 'docs/js.md': doc });
    expect(where(findings)).toEqual(['docs/js.md:3 TS2322', 'docs/js.md:8 TS2322']);
    expect(modules.map((m) => m.ext)).toEqual(['.mjs', '.cjs']);
  });

  it('relative keys of tsconfig.snippets.json paths resolve from any document (../harness)', () => {
    const doc = [
      '```ts',
      "import { describeLive } from '../harness';",
      "describeLive('R', 'x', () => {});",
      "describeLive('Q', 'x', () => {});",
      '```',
    ].join('\n');
    const { findings } = check({ 'docs/guides/h.md': doc });
    expect(where(findings)).toEqual(['docs/guides/h.md:4 TS2345']);
  });

  it('directive parsing: malformed and unknown directives are reported', () => {
    expect(parseDirective('<!-- snippet: skip continue prelude=client -->')).toEqual({
      directives: { skip: true, continue: true, prelude: ['client'] },
      errors: [],
    });
    expect(parseDirective('<!-- snippet skip -->')?.errors).toEqual([
      'malformed snippet directive (expected <!-- snippet: … -->)',
    ]);
    expect(parseDirective('<!-- snippet: compile-me -->')?.errors).toEqual([
      'unknown snippet directive "compile-me"',
    ]);
    expect(parseDirective('Plain text')).toBeNull();
  });

  it('the CLI applies the baseline: a finding fails, a baselined one is tolerated, --phase rejects own files', async () => {
    write('README.md', ['```ts', 'const n: number = "x";', '```'].join('\n'));
    const baselinePath = join(ws, 'baseline-cli.json');
    const run = async (argv: string[]) => {
      const out: string[] = [];
      const code = await main(argv, {
        cwd: ws,
        baselinePath,
        log: (l: string) => out.push(l),
        error: (l: string) => out.push(l),
      });
      return { code, out: out.join('\n') };
    };
    writeFileSync(baselinePath, JSON.stringify({ version: 1, entries: [] }));
    const failing = await run(['README.md']);
    expect(failing.code).toBe(1);
    expect(failing.out).toContain(
      "README.md:2: TS2322 Type 'string' is not assignable to type 'number'."
    );
    writeFileSync(
      baselinePath,
      JSON.stringify({
        version: 1,
        entries: [
          {
            tool: 'docs',
            file: 'README.md',
            code: 'TS2322',
            message: "Type 'string' is not assignable to type 'number'.",
            count: 1,
            phase: 'P9',
          },
        ],
      })
    );
    expect((await run(['README.md'])).code).toBe(0);
    expect((await run(['README.md', '--phase', 'P9'])).code).toBe(1);
    expect((await run(['README.md', '--release'])).code).toBe(1);
    expect((await run(['README.md', '--phase', 'P99'])).code).toBe(2);
  });
});

describe('docs:snippets with the repository configuration', () => {
  it('compiles a block against src/index.ts and reports a wrong method name', () => {
    const docs: Record<string, string> = {
      'docs/guides/__probe__.md': [
        '```ts',
        "const client = createRtlsClient({ apiKey: 'key', namespace: 'ns' });",
        'const health = await client.health();',
        'await client.healthCheck();',
        'void health;',
        '```',
      ].join('\n'),
    };
    const { findings, modules } = checkSnippets({
      files: Object.keys(docs),
      read: (f: string) => docs[f] as string,
    });
    expect(modules[0]?.text.split('\n')[0]).toBe(
      "import { createRtlsClient } from 'ubudu-rtls-sdk';"
    );
    expect(findings.map((f) => `${f.line} ${f.code}`)).toEqual(['4 TS2339']);
  });
});
