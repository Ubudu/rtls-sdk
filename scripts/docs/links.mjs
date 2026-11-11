#!/usr/bin/env node
// `docs:links` (P0 §6.1): relative links and `#anchors` in README.md, CHANGELOG.md, CLAUDE.md, docs/**
// and examples/README.md. Offline: external URLs are counted, never fetched.
//
//   node scripts/docs/links.mjs [files…] [--phase Pn] [--release]
//
// Checked: inline links and images `[t](url)`, reference definitions `[id]: url`, HTML `href`/`src`.
//   - `#anchor`               a heading (GitHub slug) or an explicit `id`/`name` anchor of the same file
//   - relative or `/`-rooted  the file or directory exists; `file.md#anchor` → the anchor exists in it
//   - https://github.com/ubudu/rtls-sdk/blob/main/<path> (also /tree/main/) → checked as the local <path>
//   - any link into docs/workpackages/ fails, whether the folder exists or not: internal work-package
//     documents never go to the public mirror, so a public document never links there
// Links inside fenced code blocks, inline code and HTML comments are ignored.
// Findings carry tool `links` and go through the quality baseline (P0 §5.5.5), like `quality.mjs links`.
// Exit codes: 0 pass, 1 findings not tolerated, 2 usage error.
import { existsSync, statSync } from 'node:fs';
import { posix, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { REPO_ROOT } from '../lib/git.mjs';
import { codeLineMask, isLinkDoc, readDoc, runDocsCli, selectDocs } from './markdown.mjs';

/** @typedef {import('../lib/baseline.mjs').Finding} Finding */
/** @typedef {{ url: string; line: number; column: number }} Link */

/** Never a valid link target: the internal work-package folder stays off the public mirror. */
export const WORKPACKAGES = 'docs/workpackages/';

export const GITHUB_PREFIXES = Object.freeze([
  'https://github.com/ubudu/rtls-sdk/blob/main/',
  'https://github.com/ubudu/rtls-sdk/tree/main/',
]);

/**
 * GitHub's heading anchor: lower case, punctuation removed (letters, digits, `_`, `-` and spaces kept),
 * spaces → `-`.
 *
 * @param {string} text  heading text with inline Markdown already removed
 */
export function slugify(text) {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\p{Pc} -]/gu, '')
    .replace(/ /g, '-');
}

/**
 * Inline Markdown of a heading reduced to its text (links, images, emphasis, code, HTML tags).
 *
 * @param {string} heading
 */
function headingText(heading) {
  return heading
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\[[^\]]*\]/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/(\*\*|__|\*|_|~~)(?=\S)([^*_~]*?\S)\1/g, '$2')
    .replace(/\s+#+\s*$/, '');
}

/**
 * Anchors a Markdown file defines: GitHub heading slugs (ATX and Setext, with `-1`, `-2` suffixes for
 * repeats) and explicit HTML `id`/`name` attributes.
 *
 * @param {string} text
 * @returns {Set<string>}
 */
export function anchorsOf(text) {
  const lines = text.split(/\r?\n/);
  const mask = codeLineMask(text);
  /** @type {Map<string, number>} */
  const used = new Map();
  /** @type {Set<string>} */
  const anchors = new Set();
  const add = (/** @type {string} */ heading) => {
    const base = slugify(headingText(heading));
    const n = used.get(base) ?? 0;
    used.set(base, n + 1);
    anchors.add(n === 0 ? base : `${base}-${n}`);
  };
  for (let i = 0; i < lines.length; i++) {
    if (mask[i]) continue;
    const line = /** @type {string} */ (lines[i]);
    const atx = /^ {0,3}#{1,6}\s+(.*?)\s*$/.exec(line);
    if (atx) add(/** @type {string} */ (atx[1]));
    else if (
      i + 1 < lines.length &&
      !mask[i + 1] &&
      line.trim() !== '' &&
      /^ {0,3}(=+|-+)\s*$/.test(/** @type {string} */ (lines[i + 1])) &&
      !/^ {0,3}([-*_])(\s*\1){2,}\s*$/.test(line)
    )
      add(line);
    for (const m of line.matchAll(/<[a-z][^>]*\s(?:id|name)\s*=\s*["']([^"']+)["']/gi))
      anchors.add(/** @type {string} */ (m[1]));
  }
  return anchors;
}

/**
 * Link targets of a Markdown text, outside fenced code, inline code and HTML comments.
 *
 * @param {string} text
 * @returns {Link[]}
 */
export function extractLinks(text) {
  const mask = codeLineMask(text);
  const lines = blankComments(text).split(/\r?\n/);
  /** @type {Link[]} */
  const links = [];
  lines.forEach((raw, i) => {
    if (mask[i]) return;
    // Inline code spans become blanks of the same length, so columns stay right.
    const line = raw.replace(/(`+)([\s\S]*?)\1/g, (m) => ' '.repeat(m.length));
    const push = (/** @type {string} */ url, /** @type {number} */ index) =>
      links.push({ url, line: i + 1, column: index + 1 });
    for (const m of line.matchAll(
      /\]\(\s*(<[^>]*>|[^\s)]+)(?:\s+(?:"[^"]*"|'[^']*'|\([^)]*\)))?\s*\)/g
    )) {
      const url = /** @type {string} */ (m[1]).replace(/^<|>$/g, '');
      push(url, /** @type {number} */ (m.index) + 2);
    }
    const def = /^ {0,3}\[([^\]]+)\]:\s*(<[^>]*>|\S+)/.exec(line);
    if (def)
      push(
        /** @type {string} */ (def[2]).replace(/^<|>$/g, ''),
        line.indexOf(/** @type {string} */ (def[2]))
      );
    for (const m of line.matchAll(
      /<(?:a|img|source)\b[^>]*\s(?:href|src)\s*=\s*["']([^"']+)["']/gi
    ))
      push(/** @type {string} */ (m[1]), /** @type {number} */ (m.index));
  });
  return links;
}

/**
 * HTML comments replaced by spaces (line breaks kept).
 *
 * @param {string} text
 */
function blankComments(text) {
  return text.replace(/<!--[\s\S]*?-->/g, (m) => m.replace(/[^\n]/g, ' '));
}

/**
 * @param {string} url
 */
function isExternal(url) {
  return /^[a-z][a-z0-9+.-]*:/i.test(url) || url.startsWith('//');
}

/**
 * @param {string} value
 */
function safeDecode(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/**
 * Checks the links of the given documents.
 *
 * @param {{ cwd?: string; files: readonly string[] }} options
 * @returns {{ findings: Finding[]; stats: { documents: number; links: number; checked: number; external: number } }}
 */
export function checkLinks({ cwd = REPO_ROOT, files }) {
  /** @type {Finding[]} */
  const findings = [];
  /** @type {Map<string, Set<string>>} */
  const anchorCache = new Map();
  const anchorsFor = (/** @type {string} */ path) => {
    let set = anchorCache.get(path);
    if (!set) {
      set = anchorsOf(readDoc(cwd, path));
      anchorCache.set(path, set);
    }
    return set;
  };
  const stats = { documents: files.length, links: 0, checked: 0, external: 0 };
  for (const file of files) {
    const text = readDoc(cwd, file);
    for (const link of extractLinks(text)) {
      stats.links++;
      /** @param {string} code @param {string} message */
      const report = (code, message) =>
        findings.push({ tool: 'links', file, line: link.line, column: link.column, code, message });
      let url = link.url;
      const github = GITHUB_PREFIXES.find((p) => url.startsWith(p));
      if (github) url = `/${url.slice(github.length)}`;
      else if (isExternal(url)) {
        stats.external++;
        continue;
      }
      stats.checked++;
      const hash = url.indexOf('#');
      const pathPart = safeDecode(hash === -1 ? url : url.slice(0, hash)).replace(/\?.*$/, '');
      const anchor = hash === -1 ? null : safeDecode(url.slice(hash + 1));
      const target =
        pathPart === ''
          ? file
          : pathPart.startsWith('/')
            ? posix.normalize(pathPart.slice(1))
            : posix.normalize(posix.join(posix.dirname(file), pathPart));
      if (target === '..' || target.startsWith('../')) {
        report('broken-link', `link leaves the repository: ${link.url}`);
        continue;
      }
      const targetDir = target.replace(/\/+$/, '');
      if (`${targetDir}/`.startsWith(WORKPACKAGES) || targetDir === WORKPACKAGES.slice(0, -1)) {
        report(
          'workpackages-link',
          `link into docs/workpackages/ (not part of the published docs): ${link.url}`
        );
        continue;
      }
      const abs = resolve(cwd, targetDir || '.');
      if (!existsSync(abs)) {
        report('broken-link', `broken relative link: ${link.url}`);
        continue;
      }
      if (anchor === null || anchor === '') continue;
      if (!statSync(abs).isFile() || !/\.md$/i.test(targetDir)) continue;
      const anchors = anchorsFor(targetDir);
      if (!anchors.has(anchor) && !anchors.has(anchor.toLowerCase()))
        report('missing-anchor', `missing anchor #${anchor} in ${targetDir}`);
    }
  }
  return { findings, stats };
}

/**
 * Findings of the default document set (or of the given files, filtered to that set); used by
 * `scripts/quality.mjs links`.
 *
 * @param {{ cwd?: string; files?: readonly string[]; phase?: string }} [options]
 * @returns {Promise<Finding[]>}
 */
export async function collectFindings({ cwd = REPO_ROOT, files } = {}) {
  return checkLinks({ cwd, files: selectDocs(isLinkDoc, { cwd, files }) }).findings;
}

/**
 * @param {readonly string[]} argv
 * @param {{ cwd?: string; baselinePath?: string; log?: (line: string) => void; error?: (line: string) => void }} [env]
 */
export function main(argv, env = {}) {
  return runDocsCli({
    tool: 'links',
    name: 'docs:links',
    argv,
    ...env,
    collect: async ({ cwd, files }) => {
      const docs = files ? files.filter((f) => /\.md$/i.test(f)) : selectDocs(isLinkDoc, { cwd });
      const { findings, stats } = checkLinks({ cwd, files: docs });
      return {
        findings,
        summary: `${stats.documents} documents, ${stats.links} links (${stats.checked} checked, ${stats.external} external, not fetched)`,
      };
    },
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).then(
    (code) => {
      process.exitCode = code;
    },
    (err) => {
      console.error(
        `docs:links: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`
      );
      process.exitCode = 2;
    }
  );
}
