// Unit tests of the example catalogue (examples/catalogue.json) and its checks in examples/run-all.mjs
// (P9 §6.3, §6.4 step 1, §8). The real-tree cases read the repository; the others build scratch trees with
// fs.mkdtemp. No network, no .env.
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  checkParity,
  entryHeaderProblem,
  loadCatalogue,
  renderIndex,
  sumBudgets,
  writeSectionCalls,
  type Catalogue,
  type CatalogueEntry,
} from '../../examples/run-all.mjs';
import { EXAMPLES_SHARE } from '../integration/harness/ledger.mjs';

const REPO = join(__dirname, '..', '..');
const EXAMPLES = join(REPO, 'examples');
const P9_IDS = ['01', '05', '06', '07', '20', '21', '22', '23', '24'];

function sources(): { file: string; text: string }[] {
  const out: { file: string; text: string }[] = [];
  for (const dir of ['typescript', 'javascript']) {
    for (const n of readdirSync(join(EXAMPLES, dir)).sort()) {
      if (!/^\d{2}-.+\.(ts|js)$/.test(n)) continue;
      out.push({ file: `${dir}/${n}`, text: readFileSync(join(EXAMPLES, dir, n), 'utf8') });
    }
  }
  return out;
}

/** The argument text of every `<name>(` call (balanced parentheses). */
function callArguments(text: string, name: string): string[] {
  const out: string[] = [];
  const re = new RegExp(`\\b${name}\\s*\\(`, 'g');
  for (const m of text.matchAll(re)) {
    let depth = 1;
    let i = (m.index ?? 0) + m[0].length;
    const start = i;
    while (i < text.length && depth > 0) {
      if (text[i] === '(') depth += 1;
      else if (text[i] === ')') depth -= 1;
      i += 1;
    }
    out.push(text.slice(start, i - 1));
  }
  return out;
}

const WRITE_TS = [
  '// Write section: tier S; budget positions=0 notifications=1 ble=0 etl=0; read skips none',
  "import { runExample, reportBudget, skip } from '../shared/config.js';",
  "await runExample('31-w', async ({ config, client }) => {",
  '  await client.zones.list();',
  '  if (!config.write) return;',
  "  const id: string = 'x';",
  '  // client.notifications.ignored(',
  '  const sent = await client.notifications.send<unknown>({ title: id });',
  '  reportBudget({ notifications: 1 });',
  "  if (!sent) skip('feature-off', 'off');",
  '  await client.notifications.bulk({ ids: [id] });',
  '});',
  '',
].join('\n');
const WRITE_JS = WRITE_TS.replace("const id: string = 'x';", "const id = 'x';").replace(
  'send<unknown>(',
  'send('
);

function scratchTree(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'rtls-catalogue-'));
  mkdirSync(join(dir, 'typescript'), { recursive: true });
  mkdirSync(join(dir, 'javascript'), { recursive: true });
  for (const [path, text] of Object.entries(files)) writeFileSync(join(dir, path), text);
  return dir;
}

const entry = (over: Partial<CatalogueEntry>): CatalogueEntry => ({
  id: '30',
  name: 'r',
  title: 'R',
  summary: 's',
  owner: 'P9',
  guide: 'docs/guides/getting-started.md',
  readAllowedSkips: [],
  write: null,
  ...over,
});
const writeEntry = entry({
  id: '31',
  name: 'w',
  write: {
    tier: 'S',
    budget: { positions: 0, notifications: 1, bleActions: 0, etlWrites: 0 },
    creates: 'one notification',
  },
});
const scratchCatalogue: Catalogue = { examples: [entry({}), writeEntry] };
const READ_FILE =
  '// Write section: tier none; budget positions=0 notifications=0 ble=0 etl=0; read skips none\n';

describe('catalogue: the real file', () => {
  it('loads; ids unique and two-digit; names kebab-case; every P9 id present', () => {
    const c = loadCatalogue();
    const ids = c.examples.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => /^\d{2}$/.test(id))).toBe(true);
    expect(c.examples.every((e) => /^[a-z0-9]+(-[a-z0-9]+)*$/.test(e.name))).toBe(true);
    expect(P9_IDS.filter((id) => !ids.includes(id))).toEqual([]);
    expect(
      c.examples.filter((e) => e.owner === 'P9').every((e) => e.readAllowedSkips.length === 0)
    ).toBe(true);
  });

  it('every entry has both files, and its guide and recipe exist', () => {
    const missing: string[] = [];
    for (const e of loadCatalogue().examples) {
      for (const p of [
        `examples/typescript/${e.id}-${e.name}.ts`,
        `examples/javascript/${e.id}-${e.name}.js`,
        e.guide,
        ...(e.recipe ? [e.recipe] : []),
      ])
        if (!existsSync(join(REPO, p))) missing.push(p);
    }
    expect(missing).toEqual([]);
  });

  it('checkParity on the real tree → []', () => {
    expect(checkParity(loadCatalogue(), EXAMPLES)).toEqual([]);
  });

  it('every example source imports ubudu-rtls-sdk, never @ubudu/rtls-sdk or ../src', () => {
    const bad = sources().filter(
      (s) =>
        !/from ['"]ubudu-rtls-sdk['"]/.test(s.text) ||
        /['"]@ubudu\/rtls-sdk['"]|['"](\.\.\/)+src(\/[^'"]*)?['"]/.test(s.text)
    );
    expect(bad.map((s) => s.file)).toEqual([]);
  });

  it('every first line equals its catalogue entry (CONVENTIONS §9 header, H-DOM-3)', () => {
    const problems: string[] = [];
    for (const e of loadCatalogue().examples) {
      for (const f of [`typescript/${e.id}-${e.name}.ts`, `javascript/${e.id}-${e.name}.js`]) {
        const path = join(EXAMPLES, f);
        if (!existsSync(path)) continue;
        const p = entryHeaderProblem(e, readFileSync(path, 'utf8').split('\n')[0] ?? '');
        if (p !== null) problems.push(`${f}: ${p}`);
      }
    }
    expect(problems).toEqual([]);
  });

  it('the write budgets fit the examples share', () => {
    const sum = sumBudgets(loadCatalogue().examples);
    expect(sum.positions).toBeLessThanOrEqual(EXAMPLES_SHARE.positions);
    expect(sum.notifications).toBeLessThanOrEqual(EXAMPLES_SHARE.notifications);
    expect(sum.bleActions).toBeLessThanOrEqual(EXAMPLES_SHARE.bleActions);
    expect(sum.etlWrites).toBeLessThanOrEqual(EXAMPLES_SHARE.etlWrites);
    expect(EXAMPLES_SHARE).toEqual({ positions: 4, notifications: 2, bleActions: 0, etlWrites: 0 });
  });

  it('renderIndex() equals the block of examples/README.md', () => {
    const readme = readFileSync(join(EXAMPLES, 'README.md'), 'utf8');
    const block = /<!-- catalogue:start -->\n([\s\S]*?)<!-- catalogue:end -->/.exec(readme)?.[1];
    expect(block).toBe(renderIndex(loadCatalogue()));
  });

  it('static scan: no channels in send(), no /userinfo, no filter in bulk(); no P9 source calls accessiblePath(', () => {
    const hits: string[] = [];
    const p9 = new Set(P9_IDS);
    for (const s of sources()) {
      if (callArguments(s.text, 'send').some((a) => /\bchannels\s*:/.test(a)))
        hits.push(`${s.file}: channels in send()`);
      if (s.text.includes('/userinfo')) hits.push(`${s.file}: /userinfo`);
      if (callArguments(s.text, 'bulk').some((a) => /\bfilter\s*:/.test(a)))
        hits.push(`${s.file}: filter in bulk()`);
      const id = s.file.split('/')[1]?.slice(0, 2) ?? '';
      if (p9.has(id) && /\baccessiblePath\s*\(/.test(s.text))
        hits.push(`${s.file}: accessiblePath(`);
    }
    expect(hits).toEqual([]);
  });
});

describe('catalogue: validation and parity on scratch trees', () => {
  it('a write block with a lang key, an unknown entry key or a bad id is rejected by loadCatalogue', () => {
    const dir = mkdtempSync(join(tmpdir(), 'rtls-catalogue-file-'));
    const file = join(dir, 'catalogue.json');
    const withLang = { examples: [{ ...writeEntry, write: { ...writeEntry.write, lang: 'ts' } }] };
    writeFileSync(file, JSON.stringify(withLang));
    expect(() => loadCatalogue(file)).toThrow(/write has an unknown key lang/);
    writeFileSync(file, JSON.stringify({ examples: [{ ...entry({}), extra: 1 }] }));
    expect(() => loadCatalogue(file)).toThrow(/unknown key extra/);
    writeFileSync(
      file,
      JSON.stringify({ examples: [entry({ id: '7' }), entry({ name: 'Not_Kebab' })] })
    );
    expect(() => loadCatalogue(file)).toThrow(
      /id must be two digits[\s\S]*name must be kebab-case/
    );
    writeFileSync(file, JSON.stringify(scratchCatalogue));
    expect(loadCatalogue(file).examples.map((e) => e.id)).toEqual(['30', '31']);
  });

  it('agreeing twins → []; an extra javascript/99-x.js → one problem', () => {
    const base = {
      'typescript/30-r.ts': READ_FILE,
      'javascript/30-r.js': READ_FILE,
      'typescript/31-w.ts': WRITE_TS,
      'javascript/31-w.js': WRITE_JS,
    };
    expect(checkParity(scratchCatalogue, scratchTree(base))).toEqual([]);
    expect(
      checkParity(scratchCatalogue, scratchTree({ ...base, 'javascript/99-x.js': READ_FILE }))
    ).toEqual(['javascript/99-x.js is not in the catalogue']);
  });

  it('a JS write twin missing one client call, or with a different first line → one problem each', () => {
    const base = {
      'typescript/30-r.ts': READ_FILE,
      'javascript/30-r.js': READ_FILE,
      'typescript/31-w.ts': WRITE_TS,
    };
    const lessCalls = WRITE_JS.replace('  await client.notifications.bulk({ ids: [id] });\n', '');
    expect(
      checkParity(scratchCatalogue, scratchTree({ ...base, 'javascript/31-w.js': lessCalls }))
    ).toHaveLength(1);
    const otherLine = WRITE_JS.replace('notifications=1', 'notifications=2');
    expect(
      checkParity(scratchCatalogue, scratchTree({ ...base, 'javascript/31-w.js': otherLine }))
    ).toEqual(['31: the TypeScript and JavaScript first lines differ']);
  });

  it('writeSectionCalls lists the calls after config.write, ignoring comments and type arguments', () => {
    expect(writeSectionCalls(WRITE_TS)).toEqual([
      'client.notifications.send(',
      'reportBudget(',
      'skip(',
      'client.notifications.bulk(',
    ]);
    expect(writeSectionCalls(WRITE_JS)).toEqual(writeSectionCalls(WRITE_TS));
    expect(writeSectionCalls('await client.zones.list();')).toBeNull();
  });

  it('a first line without the read skips clause, or not a Write section header, is a problem', () => {
    expect(entryHeaderProblem(entry({}), READ_FILE.trim())).toBeNull();
    expect(
      entryHeaderProblem(
        entry({}),
        '// Write section: tier none; budget positions=0 notifications=0 ble=0 etl=0'
      )
    ).toMatch(/malformed/);
    expect(entryHeaderProblem(entry({}), '/**')).toMatch(/not a `\/\/ Write section:` header/);
    expect(entryHeaderProblem(writeEntry, WRITE_TS.split('\n')[0] ?? '')).toBeNull();
    expect(entryHeaderProblem(writeEntry, READ_FILE.trim())).toBe(
      'the header says tier none, the catalogue S'
    );
    expect(entryHeaderProblem(entry({ readAllowedSkips: ['feature-off'] }), READ_FILE.trim())).toBe(
      'the header read skips differ from the catalogue readAllowedSkips'
    );
  });

  it('sumBudgets adds the write budgets of the entries', () => {
    expect(sumBudgets([writeEntry, writeEntry, entry({})])).toEqual({
      positions: 0,
      notifications: 2,
      bleActions: 0,
      etlWrites: 0,
    });
  });

  it('renderIndex: one row per entry with both twins and the write cell', () => {
    const index = renderIndex(scratchCatalogue);
    expect(index.split('\n').filter((l) => l.startsWith('| 3'))).toEqual([
      '| 30 | R | s | [getting-started.md](../docs/guides/getting-started.md) | [30-r.ts](typescript/30-r.ts) | [30-r.js](javascript/30-r.js) | read-only |',
      '| 31 | R | s | [getting-started.md](../docs/guides/getting-started.md) | [31-w.ts](typescript/31-w.ts) | [31-w.js](javascript/31-w.js) | `--write` tier S (notifications 1) |',
    ]);
  });
});
