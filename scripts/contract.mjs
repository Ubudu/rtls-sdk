#!/usr/bin/env node
// `npm run test:contract` (P0 §6.1, README §8):
//   1. the contract tests (`vitest run -c vitest.contract.config.ts`): fixture contract and tooling tests;
//   2. the manifest checks of scripts/manifest/check.mjs (base.json and every phase manifest).
//
//   node scripts/contract.mjs [--phase Pn] [--release]
//
//   --phase Pn   (P1…P8) the phase manifest must be `complete` and fully consistent; for P0, P9 and P10 (no
//                manifest) the contract tests and the merged-manifest checks run with no status requirement
//   --release    every phase manifest must be complete, and a fixture reported as "override possibly
//                unnecessary" by the contract test (.cache/contract/fixtures-report.json) fails
// Exit codes: 0 pass, 1 fail, 2 usage error.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { UsageError, parseArgs, parsePhase } from './lib/cli.mjs';
import { REPO_ROOT } from './lib/git.mjs';
import { runManifestChecks } from './manifest/check.mjs';

export const FIXTURE_REPORT = join(REPO_ROOT, '.cache', 'contract', 'fixtures-report.json');

/**
 * @returns {number}
 */
function runVitestDefault() {
  const bin = join(REPO_ROOT, 'node_modules', 'vitest', 'vitest.mjs');
  const res = spawnSync(process.execPath, [bin, 'run', '-c', 'vitest.contract.config.ts'], {
    cwd: REPO_ROOT,
    stdio: 'inherit',
  });
  return res.status ?? 1;
}

/**
 * @param {readonly string[]} argv
 * @param {{ root?: string; runVitest?: () => number; fixtureReport?: string;
 *   checks?: Parameters<typeof runManifestChecks>[0] }} [deps]
 * @returns {number}
 */
export function main(argv, deps = {}) {
  const { root = REPO_ROOT, runVitest = runVitestDefault, fixtureReport = FIXTURE_REPORT } = deps;
  /** @type {string | undefined} */
  let phase;
  /** @type {boolean} */
  let release;
  try {
    const args = parseArgs(argv, { flags: ['release'], options: ['phase'] });
    if (args.positionals.length) throw new UsageError(`unexpected argument ${args.positionals[0]}`);
    phase = parsePhase(args.options.phase);
    release = args.flags.release;
  } catch (err) {
    console.error(`test:contract: ${/** @type {Error} */ (err).message}`);
    return 2;
  }

  const status = runVitest();
  if (status !== 0) {
    console.error(`test:contract: contract tests failed (vitest exit ${status})`);
    return 1;
  }

  const result = runManifestChecks({ root, phase, release, ...deps.checks });
  const errors = [...result.errors];
  if (release) {
    if (!existsSync(fixtureReport))
      errors.push('fixture report missing (contract tests did not write it)');
    else {
      const report = JSON.parse(readFileSync(fixtureReport, 'utf8'));
      for (const f of report.overrideUnnecessary ?? [])
        errors.push(
          `${f}: live/server-code fixture validates against the spec (override possibly unnecessary)`
        );
    }
  }
  for (const w of result.warnings) console.warn(`test:contract: warning: ${w}`);
  for (const e of errors) console.error(`test:contract: FAIL ${e}`);
  const t = result.totals;
  const manifests = Object.entries(result.statuses)
    .map(([p, s]) => `${p} ${s}`)
    .join(', ');
  const mode = release ? ' --release' : phase ? ` --phase ${phase}` : '';
  console.log(
    `test:contract${mode}: base ${t ? `${t.operations} operations, ${t.wrap} wrap, ${t.exclude} exclude` : 'unreadable'}; ` +
      `manifests ${manifests || 'none'}; ${errors.length} problem(s)`
  );
  return errors.length ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.exitCode = main(process.argv.slice(2));
}
