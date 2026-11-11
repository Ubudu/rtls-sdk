// AST helpers shared by the local test rules (P0 §5.4).

const FUNCTION_TYPES = new Set([
  'FunctionDeclaration',
  'FunctionExpression',
  'ArrowFunctionExpression',
]);

/**
 * @param {any} node
 * @returns {boolean}
 */
export function isFunction(node) {
  return node != null && FUNCTION_TYPES.has(node.type);
}

/**
 * Root identifier name of a callee chain: `it` for `it.each(table)('x', fn)`, `describe` for
 * `describe.skip`, `expect` for `expect(x).not.toBe`.
 *
 * @param {any} callee
 * @returns {string | null}
 */
export function calleeRoot(callee) {
  let c = callee;
  for (;;) {
    if (c?.type === 'MemberExpression') c = c.object;
    else if (c?.type === 'CallExpression') c = c.callee;
    else if (c?.type === 'TSNonNullExpression' || c?.type === 'ChainExpression') c = c.expression;
    else break;
  }
  return c?.type === 'Identifier' ? c.name : null;
}

/**
 * Child nodes of an AST node, using the parser's visitor keys.
 *
 * @param {any} node
 * @param {Record<string, readonly string[]>} visitorKeys
 * @returns {any[]}
 */
export function childNodes(node, visitorKeys) {
  const keys = visitorKeys[node.type] ?? Object.keys(node).filter((k) => k !== 'parent');
  /** @type {any[]} */
  const out = [];
  for (const key of keys) {
    const value = node[key];
    if (Array.isArray(value)) {
      for (const v of value) if (v && typeof v.type === 'string') out.push(v);
    } else if (value && typeof value.type === 'string') out.push(value);
  }
  return out;
}

/**
 * Depth-first walk. `visit` returns `false` to skip a node's children.
 *
 * @param {any} node
 * @param {Record<string, readonly string[]>} visitorKeys
 * @param {(n: any) => boolean | void} visit
 */
export function walk(node, visitorKeys, visit) {
  const stack = [node];
  while (stack.length) {
    const n = stack.pop();
    if (visit(n) === false) continue;
    const children = childNodes(n, visitorKeys);
    for (let i = children.length - 1; i >= 0; i--) stack.push(children[i]);
  }
}
