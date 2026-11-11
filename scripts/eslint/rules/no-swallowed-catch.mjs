// rtls-test/no-swallowed-catch (P0 §5.4): a `catch` clause, a `.catch(handler)` callback or the rejection handler
// of `.then(onFulfilled, onRejected)`, whose body has no `throw` statement swallows the error, so the test can
// pass while the code under test fails. A `throw` inside a nested function does not count (it does not rethrow
// from the handler). A handler passed by reference counts only when scope analysis resolves it to a function
// declared in the file whose body throws (`function rethrow(e) { throw e; }`, `const rethrow = (e) => { throw e;
// }`); an import, a parameter, a member (`helpers.ignore`) or anything else that cannot be resolved is reported.
import { isFunction, walk } from './util.mjs';

/**
 * @param {any} body
 * @param {Record<string, readonly string[]>} visitorKeys
 */
function containsThrow(body, visitorKeys) {
  let found = false;
  walk(body, visitorKeys, (n) => {
    if (found) return false;
    if (n.type === 'ThrowStatement') {
      found = true;
      return false;
    }
    if (n !== body && isFunction(n)) return false;
    return true;
  });
  return found;
}

/**
 * @param {any} fn a function node
 * @param {Record<string, readonly string[]>} visitorKeys
 */
function functionRethrows(fn, visitorKeys) {
  return fn.body?.type === 'BlockStatement' && containsThrow(fn.body, visitorKeys);
}

/**
 * The function an identifier names, through the scope chain: a function declaration, or a `const`/`let`/`var`
 * whose initialiser is a function (never reassigned). Null when it cannot be resolved.
 *
 * @param {any} identifier
 * @param {any} scope
 * @returns {any}
 */
function resolveFunction(identifier, scope) {
  for (let s = scope; s; s = s.upper) {
    const variable = s.set?.get(identifier.name);
    if (!variable) continue;
    if (variable.defs.length !== 1) return null;
    const def = variable.defs[0];
    if (def.type === 'FunctionName' && isFunction(def.node)) return def.node;
    if (def.type === 'Variable' && def.node?.type === 'VariableDeclarator') {
      const reassigned = variable.references.some(
        (/** @type {any} */ r) => r.isWrite() && r.writeExpr !== def.node.init
      );
      if (!reassigned && isFunction(def.node.init)) return def.node.init;
    }
    return null;
  }
  return null;
}

/** @type {import('eslint').Rule.RuleModule} */
const rule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'disallow catch clauses, .catch() callbacks and .then() rejection handlers in tests that do not rethrow',
    },
    messages: {
      clause:
        'catch clause without a throw statement: the error is swallowed and the test cannot fail',
      callback:
        '.catch() callback without a throw statement: the error is swallowed and the test cannot fail',
      rejection:
        '.then() rejection handler without a throw statement: the error is swallowed and the test cannot fail',
      reference:
        'rejection handler passed by reference that does not resolve to a local function with a throw ' +
        'statement: the error may be swallowed and the test cannot fail',
    },
    schema: [],
  },
  create(context) {
    const visitorKeys = /** @type {Record<string, readonly string[]>} */ (
      context.sourceCode.visitorKeys
    );
    /**
     * @param {any} handler
     * @param {'callback' | 'rejection'} messageId
     */
    const check = (handler, messageId) => {
      if (handler == null || handler.type === 'SpreadElement') return;
      if (handler.type === 'Identifier' && handler.name === 'undefined') return;
      if (handler.type === 'Literal' && handler.value === null) return;
      if (isFunction(handler)) {
        if (!functionRethrows(handler, visitorKeys)) context.report({ node: handler, messageId });
        return;
      }
      const resolved =
        handler.type === 'Identifier'
          ? resolveFunction(handler, context.sourceCode.getScope(handler))
          : null;
      if (resolved === null || !functionRethrows(resolved, visitorKeys))
        context.report({ node: handler, messageId: 'reference' });
    };
    return {
      /** @param {any} node */
      CatchClause(node) {
        if (!containsThrow(node.body, visitorKeys)) context.report({ node, messageId: 'clause' });
      },
      /** @param {any} node */
      CallExpression(node) {
        const callee = node.callee;
        if (callee?.type !== 'MemberExpression' || callee.computed) return;
        if (callee.property?.type !== 'Identifier') return;
        if (callee.property.name === 'catch') check(node.arguments[0], 'callback');
        else if (callee.property.name === 'then' && node.arguments.length >= 2)
          check(node.arguments[1], 'rejection');
      },
    };
  },
};

export default rule;
