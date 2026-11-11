// rtls-test/no-weak-only-assertions (P0 §5.4): a test whose every assertion is weak cannot detect a wrong
// value. Weak: `toBeDefined()`, `toBeTruthy()`, `not.toBeUndefined()`, `not.toBeNull()`, `not.toBeFalsy()`,
// `expect(typeof x).toBe('function')`, and the existence checks of node:assert / chai (`assert(x)`, `assert.ok`,
// `assert.exists`, `assert.isDefined`, `assert.isOk`, `assert.isNotNull`, `assert.isNotUndefined`). Strong: any
// other `expect(…)` matcher, any other `assert.<x>(…)`, and calls of `expect<Name>(…)` / `assert<Name>(…)` helpers
// (`expectGuardViolation` throws when nothing is raised, `expectDeepEqualRedacted`, …).
//
// `expectKnownServerIssue(id, description, currentBehaviour)` is transparent: the call itself counts for nothing,
// the matchers of its callback count as the test's own, and a call whose callback holds no strong assertion (or
// is not an inline function, so its assertions cannot be seen) is reported. Such a callback keeps passing once
// the server is fixed, so the README §7.8 "fails when the behaviour no longer holds" guarantee never triggers.
// `expect.assertions()` / `expect.hasAssertions()` are not assertions of a value. A test without any assertion is
// `vitest/expect-expect`'s finding, not this rule's.
import { calleeRoot, isFunction, walk } from './util.mjs';

const TEST_ROOTS = new Set(['it', 'test']);
const WEAK_PLAIN = new Set(['toBeDefined', 'toBeTruthy']);
const WEAK_NEGATED = new Set(['toBeUndefined', 'toBeNull', 'toBeFalsy']);
const HELPER = /^(?:expect[A-Z]\w*|assert\w+)$/;
const KNOWN_ISSUE = 'expectKnownServerIssue';
const WEAK_ASSERT_MEMBERS = new Set([
  'ok',
  'exists',
  'isDefined',
  'isOk',
  'isNotNull',
  'isNotUndefined',
]);

/**
 * If `node` is the matcher call of an `expect(…)` chain, returns its description.
 *
 * @param {any} node
 * @returns {{ matcher: string; negated: boolean; subject: any; args: any[] } | null}
 */
function matcherCall(node) {
  const callee = node.callee;
  if (callee?.type !== 'MemberExpression' || callee.computed) return null;
  if (callee.property?.type !== 'Identifier') return null;
  let negated = false;
  let c = callee.object;
  while (c?.type === 'MemberExpression' && !c.computed && c.property?.type === 'Identifier') {
    if (c.property.name === 'not') negated = true;
    c = c.object;
  }
  if (c?.type !== 'CallExpression') return null;
  const root = c.callee;
  const isExpect =
    (root?.type === 'Identifier' && root.name === 'expect') ||
    (root?.type === 'MemberExpression' &&
      root.object?.type === 'Identifier' &&
      root.object.name === 'expect' &&
      root.property?.type === 'Identifier' &&
      (root.property.name === 'soft' || root.property.name === 'poll'));
  if (!isExpect) return null;
  return { matcher: callee.property.name, negated, subject: c.arguments[0], args: node.arguments };
}

/**
 * @param {{ matcher: string; negated: boolean; subject: any; args: any[] }} m
 */
function isWeak(m) {
  if (!m.negated && WEAK_PLAIN.has(m.matcher)) return true;
  if (m.negated && WEAK_NEGATED.has(m.matcher)) return true;
  const typeofSubject = m.subject?.type === 'UnaryExpression' && m.subject.operator === 'typeof';
  const fnLiteral = m.args[0]?.type === 'Literal' && m.args[0].value === 'function';
  return !m.negated && m.matcher === 'toBe' && typeofSubject && fnLiteral;
}

/**
 * Kind of an assertion call that is not an `expect(…)` matcher chain.
 *
 * @param {any} node
 * @returns {'strong' | 'weak' | 'known-issue' | null}
 */
function helperKind(node) {
  const callee = node.callee;
  if (callee?.type === 'Identifier') {
    if (callee.name === KNOWN_ISSUE) return 'known-issue';
    if (callee.name === 'assert') return 'weak';
    return HELPER.test(callee.name) ? 'strong' : null;
  }
  if (
    callee?.type === 'MemberExpression' &&
    !callee.computed &&
    callee.object?.type === 'Identifier' &&
    callee.object.name === 'assert' &&
    callee.property?.type === 'Identifier'
  ) {
    return WEAK_ASSERT_MEMBERS.has(callee.property.name) ? 'weak' : 'strong';
  }
  return null;
}

/**
 * Counts the strong and weak assertions under `root` (nested callbacks included).
 *
 * @param {any} root
 * @param {Record<string, readonly string[]>} visitorKeys
 * @returns {{ strong: number; weak: number }}
 */
function countAssertions(root, visitorKeys) {
  let strong = 0;
  let weak = 0;
  walk(root, visitorKeys, (n) => {
    if (n.type !== 'CallExpression') return true;
    const m = matcherCall(n);
    if (m) {
      if (isWeak(m)) weak++;
      else strong++;
      return true;
    }
    const kind = helperKind(n);
    if (kind === 'strong') strong++;
    else if (kind === 'weak') weak++;
    // 'known-issue': transparent, its callback's matchers are visited below
    return true;
  });
  return { strong, weak };
}

/** @type {import('eslint').Rule.RuleModule} */
const rule = {
  meta: {
    type: 'problem',
    docs: { description: 'disallow tests whose every assertion is a weak existence check' },
    messages: {
      weakOnly:
        'every assertion of this test is weak (toBeDefined, toBeTruthy, not.toBeUndefined, not.toBeNull, ' +
        "not.toBeFalsy, typeof … 'function', assert(x), assert.ok/exists/isDefined/isOk): assert on the value",
      knownIssueWeak:
        'the current-behaviour callback of expectKnownServerIssue needs an inline strong assertion: ' +
        'without one it keeps passing once the server is fixed',
    },
    schema: [],
  },
  create(context) {
    const visitorKeys = /** @type {Record<string, readonly string[]>} */ (
      context.sourceCode.visitorKeys
    );
    return {
      /** @param {any} node */
      CallExpression(node) {
        if (node.callee?.type === 'Identifier' && node.callee.name === KNOWN_ISSUE) {
          const callback = node.arguments[2];
          const strong = isFunction(callback)
            ? countAssertions(callback.body, visitorKeys).strong
            : 0;
          if (strong === 0) context.report({ node, messageId: 'knownIssueWeak' });
          return;
        }
        if (!TEST_ROOTS.has(calleeRoot(node.callee) ?? '')) return;
        const fns = node.arguments.filter(isFunction);
        const fn = fns[fns.length - 1];
        if (!fn) return;
        const { strong, weak } = countAssertions(fn.body, visitorKeys);
        if (weak > 0 && strong === 0) context.report({ node, messageId: 'weakOnly' });
      },
    };
  },
};

export default rule;
