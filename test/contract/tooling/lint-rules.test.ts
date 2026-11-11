import { describe, it, expect } from 'vitest';
import { ESLint, RuleTester } from 'eslint';
import { resolve } from 'node:path';
import tseslint from 'typescript-eslint';
import plugin from '../../../scripts/eslint/plugin.mjs';

RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

const REPO = resolve(__dirname, '..', '..', '..');
const tester = new RuleTester({
  languageOptions: { parser: tseslint.parser, ecmaVersion: 2023, sourceType: 'module' },
});
const rules = plugin.rules;

describe('rtls-test/no-swallowed-catch', () => {
  tester.run('no-swallowed-catch', rules['no-swallowed-catch'], {
    valid: [
      'try { run(); } catch (e) { cleanup(); throw e; }',
      'try { run(); } catch { throw new Error("wrapped"); }',
      'p.catch((e) => { log(e); throw e; });',
      'p.catch(function (e) { throw e; });',
      'function rethrow(e) { throw new Error("wrapped", { cause: e }); } p.catch(rethrow);',
      'const rethrow = (e) => { throw e; }; await run().catch(rethrow);',
      'p.then(ok);',
      'p.then(ok, (e) => { throw e; });',
      'p.then(ok, undefined);',
      'p.catch();',
      'obj["catch"](() => {});',
    ],
    invalid: [
      { code: 'try { run(); } catch {}', errors: [{ messageId: 'clause' }] },
      { code: 'try { run(); } catch (e) { console.log(e); }', errors: [{ messageId: 'clause' }] },
      {
        code: 'try { run(); } catch (e) { const f = () => { throw e; }; }',
        errors: [{ messageId: 'clause' }],
      },
      { code: 'p.catch(() => {});', errors: [{ messageId: 'callback' }] },
      { code: 'p.catch((e) => null);', errors: [{ messageId: 'callback' }] },
      {
        code: 'await run().catch(function () { return 1; });',
        errors: [{ messageId: 'callback' }],
      },
      // handlers passed by reference: only a local function that throws is accepted
      { code: 'p.catch(handler);', errors: [{ messageId: 'reference' }] },
      {
        code: 'const ignore = () => undefined; await client.assets.delete(mac).catch(ignore);',
        errors: [{ messageId: 'reference' }],
      },
      {
        code: 'function noop() {} await run().catch(noop);',
        errors: [{ messageId: 'reference' }],
      },
      { code: 'p.catch(helpers.ignore);', errors: [{ messageId: 'reference' }] },
      {
        code: 'let h = (e) => { throw e; }; h = () => {}; p.catch(h);',
        errors: [{ messageId: 'reference' }],
      },
      // the rejection handler of .then(onFulfilled, onRejected)
      { code: 'await run().then(undefined, () => {});', errors: [{ messageId: 'rejection' }] },
      { code: 'p.then(ok, (e) => null);', errors: [{ messageId: 'rejection' }] },
      { code: 'p.then(ok, noop);', errors: [{ messageId: 'reference' }] },
    ],
  });
});

describe('rtls-test/no-weak-only-assertions', () => {
  tester.run('no-weak-only-assertions', rules['no-weak-only-assertions'], {
    valid: [
      // weak + strong
      'it("a", () => { expect(x).toBeDefined(); expect(x.id).toBe(3); });',
      'it("b", () => { expect(x).toEqual({ a: 1 }); });',
      'it("c", async () => { await expect(p).rejects.toThrow("boom"); });',
      'it("d", () => { expect(x).not.toBeDefined(); });',
      'it("e", () => { expect(x).not.toBeTruthy(); });',
      'it("f", async () => { await expectKnownServerIssue("USI-P1-1", "d", () => { expect(res.status).toBe(415); }); });',
      'it("f2", async () => { await expectKnownServerIssue("USI-P1-1", "d", () => { expect(x).toBeDefined(); expect(x.id).toBe(1); }); });',
      'it("f3", async () => { await expectGuardViolation("G3", () => run()); });',
      'it("f4", () => { assert.deepEqual(a, { id: 1 }); });',
      'it("g", () => { assert.equal(a, 1); expect(a).toBeDefined(); });',
      'it("h", () => { expect(typeof x).toBe("string"); });',
      'it("i", () => { run(); });',
      'it.each([1, 2])("j %s", (n) => { expect(n).toBeGreaterThan(0); });',
      'describe("k", () => { expect(x).toBeDefined(); });',
      'it("l", () => { items.forEach((i) => expect(i).toMatchObject({ ok: true })); });',
    ],
    invalid: [
      { code: 'it("a", () => { expect(x).toBeDefined(); });', errors: [{ messageId: 'weakOnly' }] },
      {
        code: 'test("b", () => { expect(x).toBeTruthy(); expect(y).not.toBeUndefined(); });',
        errors: [{ messageId: 'weakOnly' }],
      },
      {
        code: 'it("c", () => { expect(x).not.toBeNull(); expect(y).not.toBeFalsy(); });',
        errors: [{ messageId: 'weakOnly' }],
      },
      {
        code: 'it("d", () => { expect(typeof client.list).toBe("function"); });',
        errors: [{ messageId: 'weakOnly' }],
      },
      {
        code: 'it("e", async () => { expect.hasAssertions(); await expect(p).resolves.toBeDefined(); });',
        errors: [{ messageId: 'weakOnly' }],
      },
      {
        code: 'it.each([1])("f %s", (n) => { expect(n).toBeTruthy(); });',
        errors: [{ messageId: 'weakOnly' }],
      },
      {
        code: 'it("g", () => { list.forEach((i) => expect(i).toBeDefined()); });',
        errors: [{ messageId: 'weakOnly' }],
      },
      // expectKnownServerIssue is transparent: its own call is no assertion, its callback must hold a strong one
      {
        code: 'it("h", async () => { await expectKnownServerIssue("USI-P1-1", "d", () => {}); expect(x).toBeTruthy(); });',
        errors: [{ messageId: 'weakOnly' }, { messageId: 'knownIssueWeak' }],
      },
      {
        code: 'it("i", async () => { await expectKnownServerIssue("USI-P2-1", "text/plain body", () => { expect(res).toBeDefined(); }); });',
        errors: [{ messageId: 'weakOnly' }, { messageId: 'knownIssueWeak' }],
      },
      {
        code: 'it("j", async () => { await expectKnownServerIssue("USI-P2-1", "d", current); expect(a).toBe(1); });',
        errors: [{ messageId: 'knownIssueWeak' }],
      },
      { code: 'it("k", () => { assert.ok(run()); });', errors: [{ messageId: 'weakOnly' }] },
      {
        code: 'it("l", () => { assert(x); assert.exists(y); assert.isDefined(z); assert.isOk(w); });',
        errors: [{ messageId: 'weakOnly' }],
      },
    ],
  });
});

describe('rtls-test/require-describe-live', () => {
  tester.run('require-describe-live', rules['require-describe-live'], {
    valid: [
      "describeLive('R', 'reads', () => { it('x', () => {}); });",
      "describeLive('W', 'w', () => {}); describeLive('C', 'c', () => {}); describeLive('S', 's', () => {});",
      "import { describeLive } from '../harness'; const t = 1; describeLive('R', 'r', () => { describe('inner', () => {}); });",
      "describeLive('R', 'r', () => { ['a', 'b'].forEach((n) => it(`case ${n}`, () => {})); });",
      "describeLive('W', 'w', () => { function cases() { it('helper inside the block', () => {}); } cases(); });",
    ],
    invalid: [
      {
        code: "describe('context', () => { it('x', () => {}); });",
        errors: [{ messageId: 'topLevel' }, { messageId: 'missing' }],
      },
      {
        code: "describeLive('R', 'ok', () => {}); it('stray', () => {});",
        errors: [{ messageId: 'topLevel' }],
      },
      {
        code: "describeLive('R', 'ok', () => {}); describe.each([1])('x %s', () => {});",
        errors: [{ messageId: 'topLevel' }],
      },
      { code: "describeLive('X', 'bad tier', () => {});", errors: [{ messageId: 'tier' }] },
      {
        code: "const tier = 'R'; describeLive(tier, 'not a literal', () => {});",
        errors: [{ messageId: 'tier' }],
      },
      { code: 'const nothing = 1;', errors: [{ messageId: 'missing' }] },
      { code: "suite('s', () => {}); test('t', () => {});", errors: 3 },
      {
        code: "describeLive('R', 'x', () => { it('a', () => {}); }); ['a'].forEach((n) => { it(`stray ${n}`, () => {}); });",
        errors: [{ messageId: 'topLevel' }],
      },
      {
        code: "describeLive('R', 'x', () => {}); (() => { describe('outside', () => { it('a', () => {}); }); })();",
        errors: [{ messageId: 'topLevel' }],
      },
      {
        code: "function cases() { it('helper at module scope', () => {}); } describeLive('R', 'x', () => { cases(); });",
        errors: [{ messageId: 'topLevel' }],
      },
    ],
  });
});

describe('eslint.config.js wiring (P0 §5.4)', () => {
  const eslint = new ESLint({ cwd: REPO });
  const lint = async (code: string, filePath: string) => {
    const [result] = await eslint.lintText(code, { filePath: resolve(REPO, filePath) });
    return (result?.messages ?? []).map((m) => m.ruleId);
  };

  it('applies the vitest and local rules to test/**/*.test.ts', async () => {
    const file = 'test/unit/core/sample-lint.test.ts';
    expect(await lint("import { it } from 'vitest';\nit('x', () => { run(); });\n", file)).toEqual([
      'vitest/expect-expect',
    ]);
    expect(
      await lint(
        "import { it, expect } from 'vitest';\nit('x', async () => { await expectKnownServerIssue('USI-P1-1', 'd', () => { expect(1).toBe(1); }); });\n",
        file
      )
    ).toEqual([]);
    expect(
      await lint(
        "import { it } from 'vitest';\nit('x', async () => { await expectKnownServerIssue('USI-P1-1', 'd', () => {}); });\n",
        file
      )
    ).toEqual(['rtls-test/no-weak-only-assertions']);
    expect(
      await lint(
        "import { it, expect } from 'vitest';\nit.only('x', () => { expect(1).toBe(1); });\n",
        file
      )
    ).toEqual(['vitest/no-focused-tests']);
    expect(
      await lint(
        "import { it, expect } from 'vitest';\nit.skip('x', () => { expect(1).toBe(1); });\n",
        file
      )
    ).toEqual(['vitest/no-disabled-tests']);
    expect(
      await lint(
        "import { it, expect } from 'vitest';\nit('x', async () => { expect(Promise.resolve(1)).resolves.toBe(1); });\n",
        file
      )
    ).toEqual(['vitest/valid-expect']);
    expect(
      await lint(
        "import { it, expect } from 'vitest';\nit('x', () => { if (Math.random()) { expect(1).toBe(1); } });\n",
        file
      )
    ).toEqual(['vitest/no-conditional-expect']);
    expect(
      await lint(
        "import { describe, expect } from 'vitest';\ndescribe('d', () => { expect(1).toBe(1); });\n",
        file
      )
    ).toEqual(['vitest/no-standalone-expect']);
    expect(
      await lint(
        "import { it, expect } from 'vitest';\nit('x', () => { try { run(); } catch { /* ignored */ } expect(1).toBe(1); });\n",
        file
      )
    ).toEqual(['rtls-test/no-swallowed-catch']);
    expect(
      await lint(
        "import { it, expect } from 'vitest';\nit('x', () => { expect(run()).toBeDefined(); });\n",
        file
      )
    ).toEqual(['rtls-test/no-weak-only-assertions']);
    expect(
      await lint(
        "import { it, expect } from 'vitest';\nit('x', () => { console.log(1); expect(1).toBe(1); });\n",
        file
      )
    ).toEqual(['no-console']);
  });

  it('applies the core recommended rules to TS files: a finally that ends control flow is an error', async () => {
    const finallyReturn =
      "import { it, expect } from 'vitest';\nit('x', () => { try { expect(1).toBe(2); } finally { return; } });\n";
    const finallyThrow =
      "import { it, expect } from 'vitest';\nit('x', async () => { try { await expect(Promise.reject(new Error('a'))).rejects.toThrow('b'); } finally { throw new Error('cleanup'); } });\n";
    expect(await lint(finallyReturn, 'test/unit/core/sample-lint.test.ts')).toEqual([
      'no-unsafe-finally',
    ]);
    expect(await lint(finallyThrow, 'test/contract/tooling/sample-lint.test.ts')).toEqual([
      'no-unsafe-finally',
    ]);
    const live = `import { describeLive } from '../harness';\nimport { it, expect } from 'vitest';\ndescribeLive('R', 'r', () => { it('x', () => { try { expect(1).toBe(2); } finally { return; } }); });\n`;
    expect(await lint(live, 'test/integration/core/sample-lint.int.test.ts')).toEqual([
      'no-unsafe-finally',
    ]);
    // TS rules still own what the compiler checks: an undeclared global is not a lint finding in TS
    expect(
      await lint(
        "import { it, expect } from 'vitest';\nit('x', () => { expect(undeclared()).toBe(1); });\n",
        'test/unit/core/sample-lint.test.ts'
      )
    ).toEqual([]);
  });

  it('requires describeLive in *.int.test.ts only', async () => {
    const live = 'test/integration/core/sample-lint.int.test.ts';
    expect(await lint("import { it } from 'vitest';\nit('x', () => {});\n", live)).toEqual(
      expect.arrayContaining(['rtls-test/require-describe-live'])
    );
    const unit = 'test/unit/core/sample-lint.test.ts';
    expect(
      await lint(
        "import { it, expect } from 'vitest';\nit('x', () => { expect(1).toBe(1); });\n",
        unit
      )
    ).toEqual([]);
  });

  it('allows console in the three harness CLIs and nowhere else under test/', async () => {
    const code = 'console.log("summary");\nexport {};\n';
    expect(await lint(code, 'test/integration/harness/sweep-cli.ts')).toEqual([]);
    expect(await lint(code, 'test/integration/harness/scan-cli.ts')).toEqual([]);
    expect(await lint(code, 'test/integration/harness/snapshot-cli.ts')).toEqual([]);
    expect(await lint(code, 'test/integration/harness/guard.ts')).toEqual(['no-console']);
    expect(await lint(code, 'scripts/quality-sample.mjs')).toEqual([]);
  });

  it('rejects SDK imports other than ubudu-rtls-sdk in examples', async () => {
    const ts = 'examples/typescript/99-sample.ts';
    expect(
      await lint(
        "import { createRtlsClient } from '@ubudu/rtls-sdk';\nvoid createRtlsClient;\n",
        ts
      )
    ).toEqual(['no-restricted-imports']);
    expect(
      await lint("import { createRtlsClient } from '../../src';\nvoid createRtlsClient;\n", ts)
    ).toEqual(['no-restricted-imports']);
    expect(
      await lint(
        "import { createRtlsClient } from '../../src/index';\nvoid createRtlsClient;\n",
        ts
      )
    ).toEqual(['no-restricted-imports']);
    expect(
      await lint("import { createRtlsClient } from 'ubudu-rtls-sdk';\nvoid createRtlsClient;\n", ts)
    ).toEqual([]);
    const js = 'examples/javascript/99-sample.js';
    expect(
      await lint(
        "import { createRtlsClient } from '@ubudu/rtls-sdk';\nvoid createRtlsClient;\n",
        js
      )
    ).toEqual(['no-restricted-imports']);
  });
});
