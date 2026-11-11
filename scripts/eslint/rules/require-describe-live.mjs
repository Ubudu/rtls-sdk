// rtls-test/require-describe-live (P0 §5.4), for `**/*.int.test.ts`: every live test runs inside
// `describeLive('<tier>', …)` so that the harness can gate it by tier. Errors:
//   - a `describe` / `it` / `test` / `suite` call that is not lexically inside a describeLive callback (at module
//     scope, in a module-level callback such as `cases.forEach(…)` or an IIFE, or in a helper function declared
//     outside every describeLive callback); only the outermost such call is reported;
//   - a file without any `describeLive(…)` call;
//   - a `describeLive` whose first argument is not one of the literals 'R', 'W', 'C', 'S'.
import { calleeRoot, isFunction } from './util.mjs';

const TOP_LEVEL_FORBIDDEN = new Set(['describe', 'it', 'test', 'suite']);
const TIERS = new Set(['R', 'W', 'C', 'S']);

/**
 * True when `node` lies inside a function passed as an argument to a `describeLive(…)` call, at any depth.
 *
 * @param {any} node
 */
function isInsideDescribeLive(node) {
  for (let p = node.parent; p; p = p.parent) {
    const call = p.parent;
    if (
      isFunction(p) &&
      call?.type === 'CallExpression' &&
      call.callee?.type === 'Identifier' &&
      call.callee.name === 'describeLive' &&
      call.arguments.includes(p)
    )
      return true;
  }
  return false;
}

/**
 * True when an enclosing call is itself a suite or test call (only the outermost offending call is reported).
 *
 * @param {any} node
 */
function insideForbiddenCall(node) {
  for (let p = node.parent; p; p = p.parent) {
    if (p.type === 'CallExpression') {
      const name = calleeRoot(p.callee);
      if (name && TOP_LEVEL_FORBIDDEN.has(name)) return true;
    }
  }
  return false;
}

/** @type {import('eslint').Rule.RuleModule} */
const rule = {
  meta: {
    type: 'problem',
    docs: { description: "require live tests to run inside describeLive('R'|'W'|'C'|'S', …)" },
    messages: {
      topLevel:
        "{{name}}() outside every describeLive callback in a live test file: declare it inside describeLive('<tier>', …)",
      missing: "live test file without describeLive('<tier>', …)",
      tier: "describeLive's first argument must be one of the literals 'R', 'W', 'C', 'S'",
    },
    schema: [],
  },
  create(context) {
    let hasDescribeLive = false;
    return {
      /** @param {any} node */
      CallExpression(node) {
        if (node.callee?.type === 'Identifier' && node.callee.name === 'describeLive') {
          hasDescribeLive = true;
          const tier = node.arguments[0];
          const ok =
            tier?.type === 'Literal' && typeof tier.value === 'string' && TIERS.has(tier.value);
          if (!ok) context.report({ node, messageId: 'tier' });
          return;
        }
        const name = calleeRoot(node.callee);
        if (!name || !TOP_LEVEL_FORBIDDEN.has(name)) return;
        // Report a chain such as describe.each(t)('x', fn) once, at its outermost call.
        if (node.parent?.type === 'CallExpression' && node.parent.callee === node) return;
        if (!isInsideDescribeLive(node) && !insideForbiddenCall(node))
          context.report({ node, messageId: 'topLevel', data: { name } });
      },
      /** @param {any} node */
      'Program:exit'(node) {
        if (!hasDescribeLive) context.report({ node, messageId: 'missing' });
      },
    };
  },
};

export default rule;
