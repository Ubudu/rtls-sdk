import { describe, it, expect, vi, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import {
  anchorsOf,
  checkLinks,
  extractLinks,
  main,
  slugify,
} from '../../../scripts/docs/links.mjs';
import { isLinkDoc, isSnippetDoc } from '../../../scripts/docs/markdown.mjs';

function workspace(files: Record<string, string>) {
  const dir = mkdtempSync(join(tmpdir(), 'links-'));
  for (const [rel, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, rel)), { recursive: true });
    writeFileSync(join(dir, rel), text);
  }
  return dir;
}

const TARGET = [
  '# Getting Started',
  '',
  '## Install & Configure',
  '',
  '## Install & Configure',
  '',
  'Setext Heading',
  '--------------',
  '',
  '<a id="custom-anchor"></a>',
  '',
  '```md',
  '# Not A Heading',
  '```',
].join('\n');

function codes(files: Record<string, string>, docs: string[]) {
  const cwd = workspace(files);
  return checkLinks({ cwd, files: docs }).findings.map(
    (f) => `${f.file}:${f.line} ${f.code} ${f.message}`
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('docs:links (P0 §6.1)', () => {
  it('reports a broken relative link with its line; an existing file or directory passes', () => {
    const files = {
      'docs/guides/target.md': TARGET,
      'docs/README.md': [
        '# Docs',
        '[ok](guides/target.md) and [dir](guides/)',
        '',
        'See [missing](guides/nope.md) and ![img](images/none.png).',
      ].join('\n'),
    };
    expect(codes(files, ['docs/README.md'])).toEqual([
      'docs/README.md:4 broken-link broken relative link: guides/nope.md',
      'docs/README.md:4 broken-link broken relative link: images/none.png',
    ]);
  });

  it('reports a missing anchor, in the same file and in another file; GitHub slugs and ids pass', () => {
    expect([...anchorsOf(TARGET)].sort()).toEqual(
      [
        'custom-anchor',
        'getting-started',
        'install--configure',
        'install--configure-1',
        'setext-heading',
      ].sort()
    );
    expect(slugify('Error Handling: `RtlsError` (v0.3)')).toBe('error-handling-rtlserror-v03');
    const files = {
      'docs/guides/target.md': TARGET,
      'README.md': [
        '# Readme',
        '[a](docs/guides/target.md#install--configure-1)',
        '[b](docs/guides/target.md#custom-anchor) [c](#readme)',
        '[d](docs/guides/target.md#not-a-heading)',
        '[e](#nowhere)',
      ].join('\n'),
    };
    expect(codes(files, ['README.md'])).toEqual([
      'README.md:4 missing-anchor missing anchor #not-a-heading in docs/guides/target.md',
      'README.md:5 missing-anchor missing anchor #nowhere in README.md',
    ]);
  });

  it('maps https://github.com/ubudu/rtls-sdk/blob/main/<path> to the local file', () => {
    const files = {
      'docs/guides/target.md': TARGET,
      'CHANGELOG.md': [
        '[ok](https://github.com/ubudu/rtls-sdk/blob/main/docs/guides/target.md#getting-started)',
        '[dir](https://github.com/ubudu/rtls-sdk/tree/main/docs/guides)',
        '[gone](https://github.com/ubudu/rtls-sdk/blob/main/docs/guides/removed.md)',
        '[anchor](https://github.com/ubudu/rtls-sdk/blob/main/docs/guides/target.md#absent)',
      ].join('\n'),
    };
    expect(codes(files, ['CHANGELOG.md'])).toEqual([
      'CHANGELOG.md:3 broken-link broken relative link: https://github.com/ubudu/rtls-sdk/blob/main/docs/guides/removed.md',
      'CHANGELOG.md:4 missing-anchor missing anchor #absent in docs/guides/target.md',
    ]);
  });

  it('fails any link into docs/workpackages/, relative or through the GitHub URL, even when it exists', () => {
    const files = {
      'docs/workpackages/WP/README.md': '# WP',
      'docs/README.md': [
        '[wp](workpackages/WP/README.md)',
        '[wp-dir](./workpackages/)',
        '[wp-gh](https://github.com/ubudu/rtls-sdk/blob/main/docs/workpackages/WP/README.md)',
      ].join('\n'),
    };
    const found = codes(files, ['docs/README.md']);
    expect(found).toHaveLength(3);
    for (const f of found) expect(f).toContain('workpackages-link');
  });

  it('fails a link into docs/workpackages/ when the folder does not exist (the rule is a path pattern)', () => {
    const files = {
      'README.md': [
        '[wp](docs/workpackages/WP/README.md)',
        '[wp-root](/docs/workpackages)',
        '[wp-gh](https://github.com/ubudu/rtls-sdk/tree/main/docs/workpackages/WP)',
        '[near](docs/workpackages-notes.md)',
      ].join('\n'),
    };
    expect(codes(files, ['README.md'])).toEqual([
      'README.md:1 workpackages-link link into docs/workpackages/ (not part of the published docs): docs/workpackages/WP/README.md',
      'README.md:2 workpackages-link link into docs/workpackages/ (not part of the published docs): /docs/workpackages',
      'README.md:3 workpackages-link link into docs/workpackages/ (not part of the published docs): https://github.com/ubudu/rtls-sdk/tree/main/docs/workpackages/WP',
      'README.md:4 broken-link broken relative link: docs/workpackages-notes.md',
    ]);
  });

  it('never fetches an external URL: it is counted and skipped', () => {
    const fetchSpy = vi.fn(() => {
      throw new Error('network used');
    });
    vi.stubGlobal('fetch', fetchSpy);
    const cwd = workspace({
      'README.md': [
        '[npm](https://www.npmjs.com/package/ubudu-rtls-sdk) <https://example.invalid/x>',
        '[mail](mailto:someone@example.invalid) [other repo](https://github.com/other/repo/blob/main/x.md)',
      ].join('\n'),
    });
    const result = checkLinks({ cwd, files: ['README.md'] });
    expect(result.findings).toEqual([]);
    expect(result.stats).toMatchObject({ links: 3, checked: 0, external: 3 });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('ignores links in fenced code, inline code and HTML comments; checks reference definitions and HTML', () => {
    const text = [
      '```md',
      '[in fence](nope-1.md)',
      '```',
      'Use `[in code](nope-2.md)` here. <!-- [in comment](nope-3.md) -->',
      '[ref]: nope-4.md',
      '<img src="nope-5.png"> <a href="nope-6.md">x</a>',
    ].join('\n');
    expect(extractLinks(text).map((l) => `${l.line} ${l.url}`)).toEqual([
      '5 nope-4.md',
      '6 nope-5.png',
      '6 nope-6.md',
    ]);
  });

  it('the CLI exits 1 on a finding, 0 when the baseline lists it, 1 again with --phase of the owner', async () => {
    const cwd = workspace({
      'README.md': '[x](missing.md)\n',
      'notes/other.md': '[y](missing.md)\n',
    });
    // The default document set comes from the git listing (tracked + untracked, not ignored).
    execFileSync('git', ['init', '-q'], { cwd });
    const baselinePath = join(cwd, 'baseline.json');
    const run = async (argv: string[]) => {
      const out: string[] = [];
      const code = await main(argv, {
        cwd,
        baselinePath,
        log: (l: string) => out.push(l),
        error: (l: string) => out.push(l),
      });
      return { code, out: out.join('\n') };
    };
    writeFileSync(baselinePath, JSON.stringify({ version: 1, entries: [] }));
    const failing = await run([]);
    expect(failing.code).toBe(1);
    // Column 5: the URL starts at the fifth character of `[x](missing.md)`.
    expect(failing.out).toContain(
      'README.md:1:5 links broken-link broken relative link: missing.md [owner P9]'
    );
    // notes/other.md is outside the default set and is not checked.
    expect(failing.out).not.toContain('notes/other.md');
    expect(failing.out).toContain('1 documents');
    writeFileSync(
      baselinePath,
      JSON.stringify({
        version: 1,
        entries: [
          {
            tool: 'links',
            file: 'README.md',
            code: 'broken-link',
            message: 'broken relative link: missing.md',
            count: 1,
            phase: 'P9',
          },
        ],
      })
    );
    expect((await run([])).code).toBe(0);
    expect((await run(['--phase', 'P9'])).code).toBe(1);
    expect((await run(['nope.md'])).code).toBe(2);
  });

  it('document sets: links cover README, CHANGELOG, CLAUDE, docs/** and examples/README', () => {
    for (const f of [
      'README.md',
      'CHANGELOG.md',
      'CLAUDE.md',
      'docs/guides/websocket.md',
      'docs/api/reference/x.md',
      'examples/README.md',
    ])
      expect(isLinkDoc(f)).toBe(true);
    for (const f of ['test/contract/README.md', 'examples/typescript/README.md'])
      expect(isLinkDoc(f)).toBe(false);
    expect(isSnippetDoc('docs/api/reference/x.md')).toBe(false);
    for (const f of [
      'spec/manifest/README.md',
      'test/contract/README.md',
      'test/integration/harness/README.md',
      'docs/guides/websocket.md',
    ])
      expect(isSnippetDoc(f)).toBe(true);
  });
});
