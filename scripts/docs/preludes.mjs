// Snippet preludes of `docs:snippets` (P0 §6.4): `<!-- snippet: prelude=client,subscriber,publisher -->`
// above a fence gives the block ambient, already constructed objects, so a guide can show one call without
// repeating the client set-up. New preludes are requested by handoff to P0 (P0 §12.2, P9 row).

/** Prelude name → the SDK type of the ambient constant of that name. */
export const PRELUDES = Object.freeze({
  client: 'RtlsClient',
  subscriber: 'RtlsWebSocketSubscriber',
  publisher: 'RtlsWebSocketPublisher',
});

/** @typedef {keyof typeof PRELUDES} PreludeName */

/**
 * @param {string} name
 * @returns {name is PreludeName}
 */
export function isPrelude(name) {
  return Object.prototype.hasOwnProperty.call(PRELUDES, name);
}

/**
 * The declaration lines of the given preludes: `declare const <name>: import('ubudu-rtls-sdk').<Type>;` in
 * TypeScript, and a JSDoc-typed constant in JavaScript (no `declare` there).
 *
 * @param {readonly string[]} names
 * @param {'ts' | 'js'} lang
 * @returns {string[]}
 */
export function preludeLines(names, lang) {
  return names.map((name) => {
    if (!isPrelude(name)) throw new Error(`unknown prelude ${JSON.stringify(name)}`);
    const type = `import('ubudu-rtls-sdk').${PRELUDES[name]}`;
    return lang === 'ts'
      ? `declare const ${name}: ${type};`
      : `const ${name} = /** @type {${type}} */ (/** @type {unknown} */ (undefined));`;
  });
}
