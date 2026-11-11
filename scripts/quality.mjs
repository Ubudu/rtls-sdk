#!/usr/bin/env node
// Quality wrapper (P0 §5.5.5, §6.1): typecheck / lint / format / docs / links with the per-phase baseline.
//
//   node scripts/quality.mjs <tool> [--phase Pn] [--release] [--fix | --write] [--write-baseline] [files…]
//
//   typecheck  the projects of TYPECHECK_PROJECTS (TypeScript compiler API; same diagnostics as `tsc --noEmit`)
//   lint       ESLint (eslint.config.js) over `git ls-files` + untracked, not ignored files; `--fix` applies fixes
//   format     Prettier check over the same listing, *.{ts,mts,cts,js,mjs,cjs,json} minus .prettierignore;
//              `--write` formats
//   docs/links delegated to scripts/docs/{snippets,links}.mjs (`collectFindings()`), when present
//
// A finding is tolerated when the baseline lists it (P0 §5.5.5). `--phase Pn`: findings in files owned by Pn
// are never tolerated; findings elsewhere only as baselined. `--release`: nothing is tolerated. With
// `--phase`, `--fix`/`--write` only touch the phase's files (or the files given). `--write-baseline`
// rewrites the entries of one tool from the current findings and refuses findings on P0-owned files.
// Exit codes: 0 pass, 1 findings not tolerated (or refused baseline), 2 usage or precondition error.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  BASELINE_PATH,
  TOOLS,
  buildEntries,
  describeFinding,
  evaluate,
  loadBaseline,
  replaceToolEntries,
  saveBaseline,
} from './lib/baseline.mjs';
import { UsageError, parseArgs, parsePhase } from './lib/cli.mjs';
import { REPO_ROOT, listFiles } from './lib/git.mjs';
import { ownerOf } from './lib/ownership.mjs';

/** @typedef {import('./lib/baseline.mjs').Finding} Finding */
/** @typedef {import('./lib/baseline.mjs').Tool} Tool */

export const TYPECHECK_PROJECTS = Object.freeze([
  'tsconfig.json',
  'tsconfig.test.json',
  'tsconfig.scripts.json',
  'examples/tsconfig.json',
  'examples/tsconfig.js.json',
]);
export const LINT_FILE = /\.(?:js|mjs|cjs|ts|mts|cts)$/;
export const FORMAT_FILE = /\.(?:ts|mts|cts|js|mjs|cjs|json)$/;

/**
 * @param {string} cwd
 * @param {string} file
 */
function rel(cwd, file) {
  return relative(cwd, isAbsolute(file) ? file : resolve(cwd, file))
    .split('\\')
    .join('/');
}

/**
 * Type errors of the given projects, deduplicated (a `src` file seen by several projects counts once).
 *
 * @param {{ cwd?: string; projects?: readonly string[] }} [options]
 * @returns {Promise<Finding[]>}
 */
export async function collectTypecheck({ cwd = REPO_ROOT, projects = TYPECHECK_PROJECTS } = {}) {
  const ts = (await import('typescript')).default;
  /** @type {Map<string, Finding>} */
  const findings = new Map();
  for (const project of projects) {
    const configPath = resolve(cwd, project);
    if (!existsSync(configPath)) throw new UsageError(`typecheck project ${project} not found`);
    /** @type {import('typescript').Diagnostic[]} */
    const configErrors = [];
    const parsed = ts.getParsedCommandLineOfConfigFile(
      configPath,
      { noEmit: true },
      {
        ...ts.sys,
        onUnRecoverableConfigFileDiagnostic: (d) => {
          configErrors.push(d);
        },
      }
    );
    /** @type {readonly import('typescript').Diagnostic[]} */
    let diagnostics = configErrors;
    if (parsed) {
      const program = ts.createProgram({
        rootNames: parsed.fileNames,
        options: parsed.options,
        projectReferences: parsed.projectReferences,
        configFileParsingDiagnostics: parsed.errors,
      });
      // Same sequence as `tsc --noEmit`: config and syntax first, the rest only when those are clean.
      const all = [
        ...program.getConfigFileParsingDiagnostics(),
        ...program.getSyntacticDiagnostics(),
      ];
      if (all.length === 0) {
        all.push(...program.getOptionsDiagnostics(), ...program.getGlobalDiagnostics());
        if (all.length === 0) all.push(...program.getSemanticDiagnostics());
      }
      diagnostics = [...configErrors, ...all];
    }
    for (const d of diagnostics) {
      if (d.category !== ts.DiagnosticCategory.Error) continue;
      const message = ts.flattenDiagnosticMessageText(d.messageText, '\n');
      /** @type {Finding} */
      const finding = {
        tool: 'typecheck',
        file: rel(cwd, configPath),
        code: `TS${d.code}`,
        message,
      };
      if (d.file) {
        finding.file = rel(cwd, d.file.fileName);
        if (d.start !== undefined) {
          const pos = d.file.getLineAndCharacterOfPosition(d.start);
          finding.line = pos.line + 1;
          finding.column = pos.character + 1;
        }
      }
      const key = [finding.file, finding.line, finding.column, finding.code, message].join('\0');
      if (!findings.has(key)) findings.set(key, finding);
    }
  }
  return [...findings.values()];
}

/**
 * ESLint findings (errors and warnings) of the given files. Files that the config ignores or does not
 * match are skipped.
 *
 * @param {{ cwd?: string; files: readonly string[]; fixFiles?: readonly string[] }} options
 * @returns {Promise<Finding[]>}
 */
export async function collectLint({ cwd = REPO_ROOT, files, fixFiles = [] }) {
  const { ESLint } = await import('eslint');
  const configFile = join(cwd, 'eslint.config.js');
  if (!existsSync(configFile)) throw new UsageError('eslint.config.js not found');
  const plain = new ESLint({ cwd, errorOnUnmatchedPattern: false, warnIgnored: false });
  const fixer = new ESLint({ cwd, errorOnUnmatchedPattern: false, warnIgnored: false, fix: true });
  const toFix = new Set(fixFiles.map((f) => rel(cwd, f)));
  /** @type {string[]} */
  const lintNow = [];
  /** @type {string[]} */
  const fixNow = [];
  for (const f of files.map((x) => rel(cwd, x))) {
    if (!LINT_FILE.test(f)) continue;
    if (await plain.isPathIgnored(f)) continue;
    if ((await plain.calculateConfigForFile(f)) === undefined) continue;
    (toFix.has(f) ? fixNow : lintNow).push(f);
  }
  const results = [
    ...(lintNow.length ? await plain.lintFiles(lintNow) : []),
    ...(fixNow.length ? await fixer.lintFiles(fixNow) : []),
  ];
  if (fixNow.length) await ESLint.outputFixes(results);
  /** @type {Finding[]} */
  const findings = [];
  for (const result of results) {
    for (const m of result.messages) {
      findings.push({
        tool: 'lint',
        file: rel(cwd, result.filePath),
        line: m.line,
        column: m.column,
        code: m.ruleId ?? (m.fatal ? 'parse-error' : 'eslint'),
        message: m.message,
      });
    }
  }
  return findings;
}

/**
 * Prettier findings: one per file that is not formatted. `writeFiles` are formatted in place instead.
 *
 * @param {{ cwd?: string; files: readonly string[]; writeFiles?: readonly string[] }} options
 * @returns {Promise<Finding[]>}
 */
export async function collectFormat({ cwd = REPO_ROOT, files, writeFiles = [] }) {
  const prettier = await import('prettier');
  const ignorePath = join(cwd, '.prettierignore');
  const toWrite = new Set(writeFiles.map((f) => rel(cwd, f)));
  /** @type {Finding[]} */
  const findings = [];
  for (const f of files.map((x) => rel(cwd, x))) {
    if (!FORMAT_FILE.test(f)) continue;
    const abs = join(cwd, f);
    if (!existsSync(abs)) continue;
    const info = await prettier.getFileInfo(abs, {
      ignorePath: existsSync(ignorePath) ? ignorePath : undefined,
    });
    if (info.ignored || !info.inferredParser) continue;
    const options = { ...((await prettier.resolveConfig(abs)) ?? {}), filepath: abs };
    const source = readFileSync(abs, 'utf8');
    if (toWrite.has(f)) {
      const formatted = await prettier.format(source, options);
      if (formatted !== source) writeFileSync(abs, formatted);
      continue;
    }
    if (!(await prettier.check(source, options)))
      findings.push({ tool: 'format', file: f, code: 'prettier', message: 'not formatted' });
  }
  return findings;
}

/**
 * Findings of a delegated tool (docs, links) from scripts/docs/<name>.mjs `collectFindings()`.
 *
 * @param {'docs' | 'links'} tool
 * @param {{ cwd?: string; files?: readonly string[]; phase?: string }} options
 * @returns {Promise<Finding[]>}
 */
async function collectDelegated(tool, options) {
  const name = tool === 'docs' ? 'snippets' : 'links';
  const module = new URL(`./docs/${name}.mjs`, import.meta.url);
  if (!existsSync(module))
    throw new UsageError(`${tool}: scripts/docs/${name}.mjs is not available yet`);
  const mod = await import(module.href);
  if (typeof mod.collectFindings !== 'function')
    throw new UsageError(`${tool}: scripts/docs/${name}.mjs exports no collectFindings()`);
  return mod.collectFindings(options);
}

/**
 * @param {Tool} tool
 * @param {{ cwd: string; files: readonly string[]; changeFiles: readonly string[]; phase?: string }} ctx
 * @returns {Promise<Finding[]>}
 */
export async function collect(tool, { cwd, files, changeFiles, phase }) {
  switch (tool) {
    case 'typecheck':
      return collectTypecheck({ cwd });
    case 'lint':
      return collectLint({ cwd, files, fixFiles: changeFiles });
    case 'format':
      return collectFormat({ cwd, files, writeFiles: changeFiles });
    case 'docs':
    case 'links':
      return collectDelegated(tool, { cwd, files, phase });
  }
}

const USAGE =
  'usage: quality.mjs <typecheck|lint|format|docs|links> [--phase Pn] [--release] [--fix|--write] [--write-baseline] [files…]';

/**
 * @param {readonly string[]} argv
 * @param {{ cwd?: string; baselinePath?: string }} [env]
 * @returns {Promise<number>}
 */
export async function main(argv, { cwd = REPO_ROOT, baselinePath = BASELINE_PATH } = {}) {
  /** @type {ReturnType<typeof parseArgs<'release' | 'fix' | 'write' | 'write-baseline', 'phase'>>} */
  let args;
  /** @type {string | undefined} */
  let phase;
  try {
    args = parseArgs(argv, {
      flags: ['release', 'fix', 'write', 'write-baseline'],
      options: ['phase'],
    });
    phase = parsePhase(args.options.phase);
  } catch (err) {
    console.error(`quality: ${/** @type {Error} */ (err).message}\n${USAGE}`);
    return 2;
  }
  const [toolArg, ...paths] = args.positionals;
  if (!toolArg || !(/** @type {readonly string[]} */ (TOOLS).includes(toolArg))) {
    console.error(USAGE);
    return 2;
  }
  const tool = /** @type {Tool} */ (toolArg);
  const writeBaseline = args.flags['write-baseline'];
  const changing = args.flags.fix || args.flags.write;
  if (writeBaseline && (changing || phase || args.flags.release || paths.length)) {
    console.error('quality: --write-baseline takes no other option and no file list');
    return 2;
  }
  const files = paths.length ? paths.map((p) => rel(cwd, p)) : listFiles({ cwd });
  const changeFiles = changing ? (phase ? files.filter((f) => ownerOf(f) === phase) : files) : [];

  /** @type {Finding[]} */
  let findings;
  try {
    findings = await collect(tool, { cwd, files, changeFiles, phase });
  } catch (err) {
    if (err instanceof UsageError) {
      console.error(`quality ${tool}: ${err.message}`);
      return 2;
    }
    throw err;
  }

  if (writeBaseline) {
    const { entries, refused } = buildEntries(tool, findings);
    if (refused.length) {
      console.error(
        `quality ${tool}: refusing to baseline ${refused.length} finding(s) on P0-owned files:`
      );
      for (const f of refused) console.error(`  ${describeFinding(f)}`);
      return 1;
    }
    const next = replaceToolEntries(loadBaseline(baselinePath), tool, entries);
    saveBaseline(next, baselinePath);
    const total = entries.reduce((n, e) => n + (e.count ?? 1), 0);
    console.log(
      `quality ${tool}: wrote ${entries.length} baseline entr${entries.length === 1 ? 'y' : 'ies'} (${total} finding(s)) to ${rel(cwd, baselinePath)}`
    );
    return 0;
  }

  const result = evaluate(findings, loadBaseline(baselinePath), {
    tool,
    phase,
    release: args.flags.release,
    files: paths.length && tool !== 'typecheck' ? files : undefined,
  });
  for (const w of result.warnings) console.warn(`quality ${tool}: warning: ${w}`);
  for (const f of result.failures)
    console.error(`${describeFinding(f)} [owner ${ownerOf(f.file)}]`);
  const mode = args.flags.release ? ' --release' : phase ? ` --phase ${phase}` : '';
  console.log(
    `quality ${tool}${mode}: ${result.failures.length} failing, ${result.tolerated.length} tolerated by the baseline, ` +
      `${result.unowned.length} on unowned files`
  );
  return result.failures.length ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).then(
    (code) => {
      process.exitCode = code;
    },
    (err) => {
      console.error(`quality: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`);
      process.exitCode = 2;
    }
  );
}
