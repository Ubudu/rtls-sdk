#!/usr/bin/env node
// `npm run manifest:report` (P0 §6.1): the merged operation table (op, tag, phase, decision, sdk,
// tier/allowlist, reason) as markdown, or with `--json` as JSON — the input of P9's endpoint-coverage
// generator. The JSON also carries the totals (176 operations, wrap/exclude per phase), the status of each
// phase manifest and the non-HTTP entries (P8).
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { UsageError, parseArgs } from '../lib/cli.mjs';
import { REPO_ROOT } from '../lib/git.mjs';
import { baseTotals, loadBase, loadPhaseManifests, mergeOperations, toList } from './load.mjs';

/**
 * @param {{ root?: string }} [options]
 */
export function buildReport({ root = REPO_ROOT } = {}) {
  const base = loadBase(root);
  const phases = loadPhaseManifests(root);
  return {
    specVersion: base.specVersion,
    totals: baseTotals(base),
    manifests: Object.fromEntries(
      Object.values(phases).map(({ phase, data }) => [
        phase,
        { domain: data.domain, status: data.status },
      ])
    ),
    operations: mergeOperations(base, phases),
    nonHttp: Object.values(phases).flatMap(({ phase, data }) =>
      (data.nonHttp ?? []).map((e) => ({
        phase,
        ...e,
        sdk: toList(e.sdk),
        unit: toList(e.unit),
        live: toList(e.live),
      }))
    ),
    sdkMethods: Object.values(phases).flatMap(({ phase, data }) =>
      (data.sdkMethods ?? []).map((e) => ({
        phase,
        ...e,
        unit: toList(e.unit),
        live: toList(e.live),
      }))
    ),
    aliases: Object.values(phases).flatMap(({ phase, data }) =>
      (data.aliases ?? []).map((e) => ({ phase, ...e, unit: toList(e.unit), live: toList(e.live) }))
    ),
    localMethods: Object.values(phases).flatMap(({ phase, data }) =>
      (data.localMethods ?? []).map((name) => ({ phase, name }))
    ),
  };
}

/**
 * @param {string} s
 */
const cell = (s) => s.replace(/\|/g, '\\|');

/**
 * @param {ReturnType<typeof buildReport>} report
 * @returns {string}
 */
export function reportMarkdown(report) {
  const t = report.totals;
  const lines = [
    `# Operation manifest (${report.specVersion})`,
    '',
    `${t.operations} operations: ${t.wrap} wrap, ${t.exclude} exclude.`,
    '',
    '| Phase | Wrap | Exclude | Manifest |',
    '|---|---|---|---|',
    ...Object.entries(t.byPhase)
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(
        ([p, c]) =>
          `| ${p} | ${c.wrap} | ${c.exclude} | ${/** @type {Record<string, { status: string }>} */ (report.manifests)[p]?.status ?? '—'} |`
      ),
    '',
    '| Operation | Tag | Phase | Decision | SDK | Tier / allowlist | Reason |',
    '|---|---|---|---|---|---|---|',
    ...report.operations.map((o) => {
      const tier = [o.tier, o.allowlist ? `allowlist ${o.allowlist}` : undefined]
        .filter(Boolean)
        .join(', ');
      return `| \`${cell(o.op)}\` | ${cell(o.tag)} | ${o.phase} | ${o.decision} | ${cell(o.sdk.join(', ')) || '—'} | ${tier || '—'} | ${cell(o.reason ?? '')} |`;
    }),
  ];
  return lines.join('\n') + '\n';
}

/**
 * @param {readonly string[]} argv
 * @returns {number}
 */
export function main(argv) {
  /** @type {ReturnType<typeof parseArgs<'json', never>>} */
  let args;
  try {
    args = parseArgs(argv, { flags: ['json'] });
    if (args.positionals.length) throw new UsageError(`unexpected argument ${args.positionals[0]}`);
  } catch (err) {
    console.error(`manifest:report: ${/** @type {Error} */ (err).message}`);
    return 2;
  }
  const report = buildReport();
  process.stdout.write(
    args.flags.json ? JSON.stringify(report, null, 2) + '\n' : reportMarkdown(report)
  );
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.exitCode = main(process.argv.slice(2));
}
