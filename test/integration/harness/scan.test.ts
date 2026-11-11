import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { EnvSources } from './env';
import { scanCli } from './scan-cli';
import { tempDir } from './unit-support';

// Stand-ins for the configured values (not real credentials).
const KEY = 'unit-scan-key-1234+/=';
const NS = 'f0'.repeat(20);
const OTHER = 'other-secret-value';
const sources: EnvSources = {
  processEnv: { RTLS_API_KEY: KEY },
  dotenvText: [
    `APP_NAMESPACE=${NS}`,
    `OTHER_SECRET=${OTHER}`,
    'RTLS_BASE_URL=https://rtls.test/api',
    'SHORT=abc',
  ].join('\n'),
};

function workspace(): string {
  const dir = tempDir('scan');
  writeFileSync(join(dir, 'a.txt'), `clean line\nkey=${KEY}\n`);
  writeFileSync(
    join(dir, 'b.json'),
    `{"ns":"${NS}",\n"url":"https://rtls.test/api",\n"x":"${OTHER}","k":"${encodeURIComponent(KEY)}"}\n`
  );
  writeFileSync(join(dir, 'c.md'), 'abc nothing here\n');
  mkdirSync(join(dir, 'sub'));
  writeFileSync(join(dir, 'sub', 'd.ts'), `const n = '${NS}';\n`);
  writeFileSync(join(dir, 'bin.dat'), Buffer.from([0, 1, 2, ...Buffer.from(KEY)]));
  return dir;
}

async function run(argv: string[], deps: Parameters<typeof scanCli>[1] = {}) {
  const lines: string[] = [];
  const errors: string[] = [];
  const code = await scanCli(argv, {
    envSources: sources,
    out: (l) => lines.push(l),
    err: (l) => errors.push(l),
    ...deps,
  });
  return { code, lines, errors, all: [...lines, ...errors].join('\n') };
}

describe('scan CLI', () => {
  it('finds the key, the namespace and other env values as file:line class; prints no value', async () => {
    const dir = workspace();
    const r = await run(['a.txt', 'b.json', 'c.md', 'sub', 'bin.dat'], { cwd: dir });
    expect(r.code).toBe(1);
    expect(r.lines).toEqual([
      'a.txt:2 api-key',
      'b.json:1 namespace',
      'b.json:3 api-key',
      'b.json:3 env-value',
      'sub/d.ts:1 namespace',
      'scan: 4 file(s), 5 finding(s)',
    ]);
    for (const value of [KEY, NS, OTHER, encodeURIComponent(KEY)]) {
      expect(r.all.includes(value)).toBe(false);
    }
  });

  it('--tracked scans only the files git tracks; a clean set exits 0', async () => {
    const dir = workspace();
    execFileSync('git', ['init', '-q'], { cwd: dir });
    execFileSync('git', ['add', 'c.md'], { cwd: dir });
    const clean = await run(['--tracked'], { cwd: dir });
    expect([clean.code, clean.lines]).toEqual([0, ['scan: 1 file(s), 0 finding(s)']]);
    execFileSync('git', ['add', 'a.txt'], { cwd: dir });
    const dirty = await run(['--tracked'], { cwd: dir });
    expect(dirty.code).toBe(1);
    expect(dirty.lines).toContain('a.txt:2 api-key');
  });

  it('--stdin scans standard input', async () => {
    const r = await run(['--stdin'], { readStdin: async () => `x\ny ${NS}\n` });
    expect([r.code, r.lines]).toEqual([
      1,
      ['<stdin>:2 namespace', 'scan: 1 file(s), 1 finding(s)'],
    ]);
  });

  it('usage errors → 2; missing credentials → 3; a tier key in .env → 2', async () => {
    expect((await run([])).code).toBe(2);
    expect((await run(['--tracked', 'a.txt'])).code).toBe(2);
    expect((await run(['--bogus'])).code).toBe(2);
    expect(
      (await run(['--stdin'], { envSources: { processEnv: {}, dotenvText: null } })).code
    ).toBe(3);
    const tier = await run(['--stdin'], {
      envSources: {
        processEnv: { RTLS_API_KEY: KEY },
        dotenvText: `APP_NAMESPACE=${NS}\nRTLS_IT_WRITES=1`,
      },
      readStdin: async () => '',
    });
    expect(tier.code).toBe(2);
    expect(tier.all).toContain('RTLS_IT_WRITES');
    expect(tier.all.includes(NS)).toBe(false);
  });
});
