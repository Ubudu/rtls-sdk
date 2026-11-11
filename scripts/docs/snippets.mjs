#!/usr/bin/env node
// `docs:snippets` (P0 §6.4): every TypeScript and JavaScript code block of the documentation compiles
// against the SDK sources.
//
//   node scripts/docs/snippets.mjs [files…] [--phase Pn] [--release] [--list-skips]
//
// Fences `ts`, `typescript` compile strict; `js`, `javascript`, `mjs` compile with checkJs and
// `noImplicitAny: false` (tsconfig.snippets.json; the unused-code and index-access extras of the src project
// are off, snippets show fragments). Every block is its own module (top-level await allowed). Directives,
// in an HTML comment on the line directly above the fence:
//   <!-- snippet: skip -->                         pseudo-code, not compiled; counted (--list-skips lists them)
//   <!-- snippet: prelude=client,subscriber,publisher -->   ambient constants (scripts/docs/preludes.mjs)
//   <!-- snippet: continue -->                     same module as the previous checked block of the file
// A block without an import from `ubudu-rtls-sdk` gets a named import of every SDK export it references
// and does not declare. `ubudu-rtls-sdk` resolves to src/index.ts; `@ubudu/rtls-sdk` does not resolve.
// The modules are compiled in memory, each placed beside its document, so relative imports resolve as in a
// file next to it; relative keys of tsconfig.snippets.json `paths` (`../harness`) resolve from anywhere.
// Default file set: the docs:links set minus docs/api/reference/**, plus P0's developer READMEs.
// Errors print `<doc>:<line>: TSxxxx message`; findings (tool `docs`) go through the quality baseline.
// Exit codes: 0 pass, 1 findings not tolerated, 2 usage or configuration error.
import { existsSync } from 'node:fs';
import { basename, dirname, posix, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
import { normalizeMessage } from '../lib/baseline.mjs';
import { UsageError } from '../lib/cli.mjs';
import { REPO_ROOT } from '../lib/git.mjs';
import { isSnippetDoc, readDoc, runDocsCli, scanFences, selectDocs } from './markdown.mjs';
import { isPrelude, preludeLines } from './preludes.mjs';

/** @typedef {import('../lib/baseline.mjs').Finding} Finding */

export const SNIPPETS_TSCONFIG = 'tsconfig.snippets.json';
export const SDK_SPECIFIER = 'ubudu-rtls-sdk';
const TS_LANGS = new Set(['ts', 'typescript']);
const JS_LANGS = new Set(['js', 'javascript', 'mjs']);
/** Config diagnostics of an intentionally empty `files` list (the modules are supplied in memory). */
const IGNORED_CONFIG_CODES = new Set([18002, 18003]);

/**
 * @typedef {{ skip: boolean; continue: boolean; prelude: string[] }} Directives
 * @typedef {{
 *   file: string; index: number; lang: 'ts' | 'js'; fenceLine: number; lines: string[];
 *   directives: Directives;
 * }} Block
 * @typedef {{ file: string; line: number }} Origin
 * @typedef {{
 *   file: string; id: number; lang: 'ts' | 'js'; ext: '.ts' | '.mjs' | '.cjs'; path: string;
 *   text: string; origins: Origin[]; blocks: Block[];
 * }} SnippetModule
 */

/**
 * Parses the directive comment on the line above a fence. Returns null when there is none.
 *
 * @param {string | null} line
 * @returns {{ directives: Directives; errors: string[] } | null}
 */
export function parseDirective(line) {
  if (line === null || !/<!--\s*snippet\b/i.test(line)) return null;
  const m = /^\s*<!--\s*snippet:\s*(.*?)\s*-->\s*$/.exec(line);
  /** @type {Directives} */
  const directives = { skip: false, continue: false, prelude: [] };
  if (!m)
    return { directives, errors: ['malformed snippet directive (expected <!-- snippet: … -->)'] };
  /** @type {string[]} */
  const errors = [];
  for (const token of /** @type {string} */ (m[1]).split(/[\s;]+/).filter(Boolean)) {
    if (token === 'skip') directives.skip = true;
    else if (token === 'continue') directives.continue = true;
    else if (token.startsWith('prelude=')) {
      for (const name of token.slice('prelude='.length).split(',').filter(Boolean)) {
        if (isPrelude(name)) directives.prelude.push(name);
        else errors.push(`unknown prelude "${name}"`);
      }
    } else errors.push(`unknown snippet directive "${token}"`);
  }
  return { directives, errors };
}

/**
 * TypeScript and JavaScript blocks of a document, with their directives. Fences of other languages are
 * ignored.
 *
 * @param {string} text
 * @param {string} file  repository-relative path of the document
 * @returns {{ blocks: Block[]; findings: Finding[] }}
 */
export function extractBlocks(text, file) {
  /** @type {Block[]} */
  const blocks = [];
  /** @type {Finding[]} */
  const findings = [];
  for (const fence of scanFences(text)) {
    const lang = TS_LANGS.has(fence.lang) ? 'ts' : JS_LANGS.has(fence.lang) ? 'js' : null;
    if (!lang) continue;
    const parsed = parseDirective(fence.above);
    for (const message of parsed?.errors ?? [])
      findings.push({ tool: 'docs', file, line: fence.fenceLine - 1, code: 'SNIPPET', message });
    if (fence.closeLine === null)
      findings.push({
        tool: 'docs',
        file,
        line: fence.fenceLine,
        code: 'SNIPPET',
        message: 'unterminated code fence',
      });
    blocks.push({
      file,
      index: blocks.length,
      lang,
      fenceLine: fence.fenceLine,
      lines: fence.lines,
      directives: parsed?.directives ?? { skip: false, continue: false, prelude: [] },
    });
  }
  return { blocks, findings };
}

/**
 * Names a block declares and references, and whether it imports the SDK itself. Purely syntactic.
 *
 * @param {string} code
 * @param {'ts' | 'js'} lang
 * @returns {{ declared: Set<string>; referenced: Set<string>; importsSdk: boolean; usesRequire: boolean; hasEsm: boolean }}
 */
export function analyzeNames(code, lang) {
  const sf = ts.createSourceFile(
    lang === 'ts' ? 'block.ts' : 'block.js',
    code,
    ts.ScriptTarget.Latest,
    true,
    lang === 'ts' ? ts.ScriptKind.TS : ts.ScriptKind.JS
  );
  /** @type {Set<string>} */
  const declared = new Set();
  /** @type {Set<string>} */
  const referenced = new Set();
  let importsSdk = false;
  let usesRequire = false;
  let hasEsm = false;
  /** @param {ts.Node} node */
  const visit = (node) => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node) || ts.isExportAssignment(node))
      hasEsm = true;
    if (
      ts.isImportDeclaration(node) &&
      ts.isStringLiteral(node.moduleSpecifier) &&
      node.moduleSpecifier.text === SDK_SPECIFIER
    )
      importsSdk = true;
    if (ts.isCallExpression(node) && node.arguments.length === 1) {
      const arg = node.arguments[0];
      const isRequire = ts.isIdentifier(node.expression) && node.expression.text === 'require';
      const isDynamic = node.expression.kind === ts.SyntaxKind.ImportKeyword;
      if (isRequire) usesRequire = true;
      if ((isRequire || isDynamic) && arg && ts.isStringLiteral(arg) && arg.text === SDK_SPECIFIER)
        importsSdk = true;
    }
    if (ts.isIdentifier(node)) {
      if (isDeclarationName(node)) declared.add(node.text);
      else if (isReference(node)) referenced.add(node.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return { declared, referenced, importsSdk, usesRequire, hasEsm };
}

/** @param {ts.Identifier} node */
function isDeclarationName(node) {
  const p = node.parent;
  if (!p) return false;
  if (
    (ts.isVariableDeclaration(p) ||
      ts.isParameter(p) ||
      ts.isFunctionDeclaration(p) ||
      ts.isFunctionExpression(p) ||
      ts.isClassDeclaration(p) ||
      ts.isClassExpression(p) ||
      ts.isInterfaceDeclaration(p) ||
      ts.isTypeAliasDeclaration(p) ||
      ts.isEnumDeclaration(p) ||
      ts.isModuleDeclaration(p) ||
      ts.isTypeParameterDeclaration(p) ||
      ts.isImportClause(p) ||
      ts.isImportSpecifier(p) ||
      ts.isNamespaceImport(p) ||
      ts.isImportEqualsDeclaration(p)) &&
    p.name === node
  )
    return true;
  return ts.isBindingElement(p) && p.name === node;
}

/** @param {ts.Identifier} node */
function isReference(node) {
  const p = node.parent;
  if (!p) return true;
  if (ts.isPropertyAccessExpression(p) && p.name === node) return false;
  if (ts.isQualifiedName(p) && p.right === node) return false;
  if (
    (ts.isPropertyAssignment(p) ||
      ts.isPropertyDeclaration(p) ||
      ts.isPropertySignature(p) ||
      ts.isMethodDeclaration(p) ||
      ts.isMethodSignature(p) ||
      ts.isGetAccessorDeclaration(p) ||
      ts.isSetAccessorDeclaration(p) ||
      ts.isEnumMember(p) ||
      ts.isPropertyAccessExpression(p)) &&
    p.name === node
  )
    return false;
  if ((ts.isImportSpecifier(p) || ts.isExportSpecifier(p)) && p.propertyName === node) return false;
  if (ts.isExportSpecifier(p)) return true;
  if (ts.isBindingElement(p) && p.propertyName === node) return false;
  if (ts.isLabeledStatement(p) || ts.isBreakOrContinueStatement(p)) return false;
  if (ts.isMetaProperty(p)) return false;
  if (ts.isJsxAttribute(p)) return false;
  return true;
}

/**
 * Assembles the blocks of one document into modules: one per block, except that a `continue` block joins
 * the module of the previous checked block. Adds preludes and the SDK auto-import, and keeps the origin
 * (document line) of every generated line.
 *
 * @param {readonly Block[]} blocks
 * @param {{ sdkValues: ReadonlySet<string>; sdkTypes: ReadonlySet<string>; cwd?: string }} sdk
 * @returns {{ modules: SnippetModule[]; skipped: Block[]; findings: Finding[] }}
 */
export function buildModules(blocks, { sdkValues, sdkTypes, cwd = REPO_ROOT }) {
  /** @type {SnippetModule[]} */
  const modules = [];
  /** @type {Block[]} */
  const skipped = [];
  /** @type {Finding[]} */
  const findings = [];
  /** @typedef {{ module: SnippetModule; lines: string[]; declared: Set<string> }} Draft */
  /** @type {Draft | null} */
  let current = null;
  /** @type {Draft[]} */
  const drafts = [];

  for (const block of blocks) {
    if (block.directives.skip) {
      skipped.push(block);
      continue;
    }
    const code = block.lines.join('\n');
    const names = analyzeNames(code, block.lang);
    /** @type {Draft | null} */
    let draft = current;
    if (block.directives.continue) {
      if (!draft) {
        findings.push({
          tool: 'docs',
          file: block.file,
          line: block.fenceLine,
          code: 'SNIPPET',
          message: 'continue without a previous checked block in this document',
        });
      } else if (draft.module.lang !== block.lang) {
        findings.push({
          tool: 'docs',
          file: block.file,
          line: block.fenceLine,
          code: 'SNIPPET',
          message: 'continue joins a block of another language',
        });
        draft = null;
      }
    } else draft = null;
    if (!draft) {
      const id = modules.length;
      /** @type {SnippetModule} */
      const module = {
        file: block.file,
        id,
        lang: block.lang,
        ext: '.ts',
        path: '',
        text: '',
        origins: [],
        blocks: [],
      };
      modules.push(module);
      draft = { module, lines: [], declared: new Set() };
      drafts.push(draft);
    }
    const { module } = draft;
    module.blocks.push(block);
    /** @param {string} line @param {number} docLine */
    const emit = (line, docLine) => {
      draft.lines.push(line);
      module.origins.push({ file: block.file, line: docLine });
    };
    const header = { file: block.file, line: block.fenceLine };
    for (const line of preludeLines(block.directives.prelude, block.lang)) emit(line, header.line);
    for (const name of block.directives.prelude) draft.declared.add(name);
    for (const name of names.declared) draft.declared.add(name);
    if (!names.importsSdk) {
      const pool = block.lang === 'ts' ? new Set([...sdkValues, ...sdkTypes]) : sdkValues;
      const wanted = [...names.referenced]
        .filter((n) => pool.has(n) && !draft.declared.has(n))
        .sort();
      if (wanted.length) {
        const cjs = block.lang === 'js' && names.usesRequire && !names.hasEsm;
        emit(
          cjs
            ? `const { ${wanted.join(', ')} } = require('${SDK_SPECIFIER}');`
            : `import { ${wanted.join(', ')} } from '${SDK_SPECIFIER}';`,
          header.line
        );
        for (const n of wanted) draft.declared.add(n);
      }
    }
    block.lines.forEach((line, k) => emit(line, block.fenceLine + 1 + k));
    if (block.lang === 'js') {
      const all = module.blocks.map((/** @type {Block} */ b) =>
        analyzeNames(b.lines.join('\n'), 'js')
      );
      const cjs = all.some((a) => a.usesRequire) && !all.some((a) => a.hasEsm);
      module.ext = cjs ? '.cjs' : '.mjs';
    }
    current = draft;
  }
  for (const { module, lines } of drafts) {
    // Generated lines may not end with a newline; a final newline keeps diagnostics at end-of-file inside.
    module.text = lines.join('\n') + '\n';
    const dir = posix.dirname(module.file);
    const base = basename(module.file).replace(/\.md$/i, '');
    module.path = resolve(cwd, dir, `__snippet__.${base}.${module.id + 1}${module.ext}`);
  }
  return { modules, skipped, findings };
}

/**
 * Compiler options of tsconfig.snippets.json, for TypeScript or JavaScript blocks, plus the relative keys
 * of its `paths` (which TypeScript itself applies to bare specifiers only).
 *
 * @param {string} cwd
 * @returns {{ ts: ts.CompilerOptions; js: ts.CompilerOptions; relativePaths: Map<string, string> }}
 */
export function loadSnippetOptions(cwd) {
  const configPath = resolve(cwd, SNIPPETS_TSCONFIG);
  if (!existsSync(configPath)) throw new UsageError(`${SNIPPETS_TSCONFIG} not found`);
  /** @type {ts.Diagnostic[]} */
  const errors = [];
  const parsed = ts.getParsedCommandLineOfConfigFile(
    configPath,
    {},
    {
      ...ts.sys,
      onUnRecoverableConfigFileDiagnostic: (d) => {
        errors.push(d);
      },
    }
  );
  const fatal = [...errors, ...(parsed?.errors ?? [])].filter(
    (d) => !IGNORED_CONFIG_CODES.has(d.code)
  );
  if (!parsed || fatal.length)
    throw new UsageError(
      `${SNIPPETS_TSCONFIG}: ${fatal.map((d) => ts.flattenDiagnosticMessageText(d.messageText, ' ')).join('; ')}`
    );
  const options = { ...parsed.options, noEmit: true };
  /** @type {Map<string, string>} */
  const relativePaths = new Map();
  // `paths` entries resolve against the directory of the config that declares them (TypeScript keeps it in
  // the internal `pathsBasePath` option).
  const internal = /** @type {Record<string, unknown>} */ (/** @type {unknown} */ (options));
  const base =
    typeof internal.pathsBasePath === 'string' ? internal.pathsBasePath : dirname(configPath);
  for (const [key, targets] of Object.entries(options.paths ?? {})) {
    if ((key.startsWith('./') || key.startsWith('../')) && targets[0])
      relativePaths.set(key, resolve(base, targets[0]));
  }
  return {
    ts: { ...options, allowJs: false, checkJs: false },
    js: { ...options, allowJs: true, checkJs: true, noImplicitAny: false },
    relativePaths,
  };
}

/**
 * A compiler host that serves the in-memory modules, shares parsed source files between programs and
 * applies the relative `paths` keys.
 *
 * @param {ts.CompilerOptions} options
 * @param {Map<string, string>} virtual  absolute path → text
 * @param {Map<string, string>} relativePaths
 * @param {Map<string, ts.SourceFile>} cache
 * @returns {ts.CompilerHost}
 */
function createHost(options, virtual, relativePaths, cache) {
  const host = ts.createCompilerHost(options, true);
  const baseGetSourceFile = host.getSourceFile.bind(host);
  const baseFileExists = host.fileExists.bind(host);
  const baseReadFile = host.readFile.bind(host);
  host.fileExists = (f) => virtual.has(resolve(f)) || baseFileExists(f);
  host.readFile = (f) => virtual.get(resolve(f)) ?? baseReadFile(f);
  host.getSourceFile = (fileName, languageVersion, onError, shouldCreate) => {
    const text = virtual.get(resolve(fileName));
    if (text !== undefined) return ts.createSourceFile(fileName, text, languageVersion, true);
    const key = `${fileName}\0${JSON.stringify(languageVersion)}`;
    let sf = cache.get(key);
    if (!sf) {
      sf = baseGetSourceFile(fileName, languageVersion, onError, shouldCreate);
      if (sf) cache.set(key, sf);
    }
    return sf;
  };
  const moduleCache = ts.createModuleResolutionCache(
    host.getCurrentDirectory(),
    (x) => host.getCanonicalFileName(x),
    options
  );
  host.resolveModuleNameLiterals = (literals, containingFile, redirectedReference, opts) =>
    literals.map((literal) => {
      const alias = relativePaths.get(literal.text);
      const name = alias ? alias.replace(/\.(?:d\.)?[cm]?[tj]s$/, '') : literal.text;
      return ts.resolveModuleName(
        name,
        containingFile,
        opts,
        host,
        moduleCache,
        redirectedReference
      );
    });
  return host;
}

/**
 * Value and type export names of the SDK entry point (`src/index.ts`).
 *
 * @param {ts.Program} program
 * @param {string} indexPath
 */
function sdkExports(program, indexPath) {
  const checker = program.getTypeChecker();
  const sf = program.getSourceFile(indexPath);
  const symbol = sf && checker.getSymbolAtLocation(sf);
  if (!symbol) throw new UsageError(`cannot read the exports of ${indexPath}`);
  /** @type {Set<string>} */
  const values = new Set();
  /** @type {Set<string>} */
  const types = new Set();
  for (const s of checker.getExportsOfModule(symbol)) {
    const target = s.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(s) : s;
    if (target.flags & ts.SymbolFlags.Value) values.add(s.getName());
    else types.add(s.getName());
  }
  return { values, types };
}

/**
 * Compiles the snippets of the given documents.
 *
 * @param {{ cwd?: string; files: readonly string[]; read?: (file: string) => string }} options
 *   `read` supplies a document's text (default: the file under `cwd`).
 * @returns {{ findings: Finding[]; skipped: Block[]; modules: SnippetModule[]; blocks: number }}
 */
export function checkSnippets({ cwd = REPO_ROOT, files, read = (file) => readDoc(cwd, file) }) {
  const options = loadSnippetOptions(cwd);
  const indexPath = resolve(cwd, 'src', 'index.ts');
  /** @type {Map<string, ts.SourceFile>} */
  const cache = new Map();
  /** @type {Finding[]} */
  const findings = [];
  /** @type {{ file: string; blocks: Block[] }[]} */
  const docs = [];
  let blockCount = 0;
  for (const file of files) {
    const extracted = extractBlocks(read(file), file);
    findings.push(...extracted.findings);
    blockCount += extracted.blocks.length;
    if (extracted.blocks.length) docs.push({ file, blocks: extracted.blocks });
  }
  /** @type {SnippetModule[]} */
  const modules = [];
  /** @type {Block[]} */
  const skipped = [];
  if (!docs.length) return { findings, skipped, modules, blocks: blockCount };

  const empty = new Map();
  const sdkProgram = ts.createProgram({
    rootNames: [indexPath],
    options: options.ts,
    host: createHost(options.ts, empty, options.relativePaths, cache),
  });
  const sdk = sdkExports(sdkProgram, indexPath);
  for (const doc of docs) {
    const built = buildModules(doc.blocks, { sdkValues: sdk.values, sdkTypes: sdk.types, cwd });
    modules.push(...built.modules);
    skipped.push(...built.skipped);
    findings.push(...built.findings);
  }

  for (const lang of /** @type {const} */ (['ts', 'js'])) {
    const group = modules.filter((m) => m.lang === lang);
    if (!group.length) continue;
    const compilerOptions = options[lang];
    const virtual = new Map(group.map((m) => [m.path, m.text]));
    const program = ts.createProgram({
      rootNames: group.map((m) => m.path),
      options: compilerOptions,
      host: createHost(compilerOptions, virtual, options.relativePaths, cache),
      oldProgram: lang === 'ts' ? sdkProgram : undefined,
    });
    const global = [...program.getOptionsDiagnostics(), ...program.getGlobalDiagnostics()].filter(
      (d) => d.category === ts.DiagnosticCategory.Error
    );
    if (global.length)
      throw new UsageError(
        `${SNIPPETS_TSCONFIG} (${lang}): ${global.map((d) => ts.flattenDiagnosticMessageText(d.messageText, ' ')).join('; ')}`
      );
    for (const module of group) {
      const sf = program.getSourceFile(module.path);
      if (!sf) throw new UsageError(`snippet module ${module.path} was not compiled`);
      const diagnostics = [
        ...program.getSyntacticDiagnostics(sf),
        ...program.getSemanticDiagnostics(sf),
      ];
      for (const d of diagnostics) {
        if (d.category !== ts.DiagnosticCategory.Error) continue;
        const pos = sf.getLineAndCharacterOfPosition(d.start ?? 0);
        const origin = module.origins[pos.line] ?? module.origins[module.origins.length - 1];
        findings.push({
          tool: 'docs',
          file: origin?.file ?? module.file,
          line: origin?.line,
          column: pos.character + 1,
          code: `TS${d.code}`,
          message: ts.flattenDiagnosticMessageText(d.messageText, '\n'),
        });
      }
    }
  }
  return { findings, skipped, modules, blocks: blockCount };
}

/**
 * Findings of the default document set (or of the given files, filtered to that set); used by
 * `scripts/quality.mjs docs`.
 *
 * @param {{ cwd?: string; files?: readonly string[]; phase?: string }} [options]
 * @returns {Promise<Finding[]>}
 */
export async function collectFindings({ cwd = REPO_ROOT, files } = {}) {
  return checkSnippets({ cwd, files: selectDocs(isSnippetDoc, { cwd, files }) }).findings;
}

/**
 * `<doc>:<line>: TSxxxx message` (P0 §6.4).
 *
 * @param {Finding} f
 */
export function formatSnippetFinding(f) {
  return `${f.file}:${f.line ?? 1}: ${f.code ?? 'TS'} ${normalizeMessage(f.message)}`;
}

/**
 * @param {readonly string[]} argv
 * @param {{ cwd?: string; baselinePath?: string; log?: (line: string) => void; error?: (line: string) => void }} [env]
 */
export function main(argv, env = {}) {
  return runDocsCli({
    tool: 'docs',
    name: 'docs:snippets',
    argv,
    flags: /** @type {const} */ (['list-skips']),
    format: formatSnippetFinding,
    ...env,
    collect: async ({ cwd, files, flags }) => {
      const docs = files
        ? files.filter((f) => /\.md$/i.test(f))
        : selectDocs(isSnippetDoc, { cwd });
      const result = checkSnippets({ cwd, files: docs });
      const extra = flags['list-skips']
        ? result.skipped.map((b) => `${b.file}:${b.fenceLine}: skip`)
        : [];
      const checked = result.modules.reduce((n, m) => n + m.blocks.length, 0);
      return {
        findings: result.findings,
        summary: `${docs.length} documents, ${result.blocks} blocks (${checked} checked in ${result.modules.length} modules, ${result.skipped.length} skipped)`,
        extra,
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
        `docs:snippets: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`
      );
      process.exitCode = 2;
    }
  );
}
