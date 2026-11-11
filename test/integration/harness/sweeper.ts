// Sweeper (LIVE-TESTING §2.5, P0 §6.2 sweeper table, §5.5.7). Finds the residue of earlier, crashed or the
// current run and, outside `check` mode, removes it in a fixed order (asset documents before assets). Residue is
// recognised by test MACs (`025d4b…`), `sdk-test-` names and the ids and MACs of every `runs/*.created.json` in
// the main checkout, whichever worktree the run started in. A run whose registry entry is active (pid alive) is
// skipped unless `force`; a crashed run (dead pid) is swept like an earlier run. A run's created record, and a
// crashed run's registry entry, are deleted only after a fresh find confirms that none of that run's residue is
// left.
//
// Removal needs `RTLS_IT_WRITES=1` and the run lock held with the caller's token; recipient mappings also need
// `RTLS_IT_CONFIG=1` and the config lock; alert rules are changed only with `fixConfig` and `RTLS_IT_CONFIG=1`,
// through the internal config cycle (saved before-image, one write of the document minus its disabled
// `sdk-test-` rules, read back, restore on failure). Mutating requests run in the guard's sweeper scope, which
// admits only the paths registered here. Output holds targets and ids only, never content.
//
// Every listing read must succeed (200 with the expected shape): a failed read is recorded in `readFailures`, never
// taken as "no residue", so `--check` fails and a removal pass keeps every created record and registry entry when
// its confirming find could not read a listing.
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { activeHarness } from './active';
import {
  configValuesEqual,
  holdConfigLock,
  readConfig,
  restoreConfig,
  saveBeforeImage,
  writeConfig,
  type ConfigLockOptions,
} from './config-core';
import type { Harness } from './context';
import { HarnessPrecondition } from './env';
import { runWithGuardScope } from './guard';
import {
  deleteCreatedRecord,
  deregisterRun,
  holdsLock,
  isRunActive,
  listRuns,
  lockPaths,
} from './lock.mjs';
import { isTestMac, normalizeMacLike } from './names';
import { isPlainObject } from './policy';
import { rawRequest } from './raw';
import { CHECKOUT_ROOT, readJsonFileSync } from './state-io.mjs';

export type SweepTarget =
  | 'asset-documents'
  | 'assets'
  | 'assets-outside-test-range'
  | 'dashboards'
  | 'notification-items'
  | 'notification-rules'
  | 'saved-views'
  | 'recipient-mappings'
  | 'connections'
  | 'etl-mapping-profiles'
  | 'alert-rules';

export interface Residue {
  target: SweepTarget;
  id: string;
}

export interface SweepOptions {
  check: boolean;
  runId?: string;
  force?: boolean;
  fixConfig?: boolean;
  /** @internal the caller's lock token (default `RTLS_IT_INTERNAL_LOCK_TOKEN`) */
  lockToken?: string;
  /** @internal folder of the allowlist fragments (default `test/integration/allowlist`) */
  allowlistDir?: string;
  /** @internal config lock wait (default: wait, 5 s polls, 15 min) */
  configLockWait?: Omit<ConfigLockOptions, 'token'>;
}

/** A listing the sweeper could not read (status 0: the body was not the expected shape). */
export interface ReadFailure {
  target: SweepTarget | 'cleanup-policy';
  status: number;
}

export interface SweepResult {
  /** residue left (check mode: found) in scope, outside skipped runs and accepted entries */
  residue: Residue[];
  /** listings that could not be read: the namespace is not confirmed clean (a failure, like residue) */
  readFailures: ReadFailure[];
  removed: number;
  accepted: { kind: string; match: string }[];
  /** registry entries whose pid is dead */
  crashedRuns: string[];
  /** active runs whose residue was not touched (no `force`) */
  skippedRuns: string[];
}

export const SWEEP_ORDER: readonly SweepTarget[] = [
  'asset-documents',
  'assets',
  'assets-outside-test-range',
  'dashboards',
  'notification-items',
  'notification-rules',
  'saved-views',
  'recipient-mappings',
  'connections',
  'etl-mapping-profiles',
  'alert-rules',
];

const NAME_RUN_RE = /^sdk-test-([0-9a-f]{8})-/;
const BULK_CHUNK = 500;
const PAGE_LIMIT = 200;
const MAX_PAGES = 50;

interface Candidate extends Residue {
  /** run ids the entity belongs to (by created record, name prefix); empty = unattributed */
  runs: Set<string>;
  /** first four run-id characters of a test MAC (`025d4b<4 hex>…`) */
  macRun?: string;
  /** removal request (path with `{ns}`), absent for report-only targets */
  remove?: { method: 'DELETE'; path: string; verifyGone?: boolean };
}

interface RunInfo {
  runId: string;
  active: boolean;
  crashed: boolean;
  createdIds: Set<string>;
  createdMacs: Set<string>;
}

const enc = encodeURIComponent;

function runOfName(name: unknown): string | null {
  if (typeof name !== 'string') return null;
  return NAME_RUN_RE.exec(name)?.[1] ?? null;
}

function idOf(item: Record<string, unknown>, primary: '_id' | 'id' = '_id'): string | null {
  const raw = item[primary] ?? item[primary === '_id' ? 'id' : '_id'];
  return typeof raw === 'string' || typeof raw === 'number' ? String(raw) : null;
}

/** A listing (200 with a JSON array); anything else is recorded in `failures` and gives null. */
async function getList(
  failures: ReadFailure[],
  target: ReadFailure['target'],
  path: string,
  query?: Record<string, string | number>
): Promise<unknown[] | null> {
  const response = await rawRequest('GET', path, query ? { query } : {});
  if (response.status !== 200 || !Array.isArray(response.json)) {
    failures.push({ target, status: response.status === 200 ? 0 : response.status });
    return null;
  }
  return response.json;
}

/** The rules of an alert-rule document (`{ rules }`, `{ decisions }` or an array); null when unreadable. */
function alertRuleList(json: unknown): unknown[] | null {
  if (Array.isArray(json)) return json;
  if (!isPlainObject(json)) return null;
  if (Array.isArray(json.rules)) return json.rules;
  if (Array.isArray(json.decisions)) return json.decisions;
  return json.rules === undefined && json.decisions === undefined ? [] : null;
}

/** Path below the base path as the guard sees it (`{ns}` expanded and encoded). */
function relPath(h: Harness, path: string): string {
  const expanded = path.replaceAll('{ns}', enc(h.env.namespace));
  return new URL(`${h.env.baseUrl}${expanded}`).pathname.slice(h.env.basePath.length);
}

/** Accepted `residue` entries of the allowlist fragments (object form, P0 §5.5.4). */
export function acceptedResidue(dir: string): { kind: string; match: string }[] {
  let names: string[];
  try {
    names = readdirSync(dir).filter((n) => n.endsWith('.json'));
  } catch {
    return [];
  }
  const out: { kind: string; match: string }[] = [];
  for (const name of names.sort()) {
    const file = readJsonFileSync<unknown>(join(dir, name), null);
    const residue = isPlainObject(file) && Array.isArray(file.residue) ? file.residue : [];
    for (const r of residue) {
      if (isPlainObject(r) && typeof r.kind === 'string' && typeof r.match === 'string') {
        out.push({ kind: r.kind, match: r.match });
      }
    }
  }
  return out;
}

function runInfos(h: Harness): RunInfo[] {
  return listRuns({ stateDir: h.mainStateDir }).map((r) => ({
    runId: r.runId,
    active: r.entry !== null && isRunActive(r.entry),
    crashed: r.entry !== null && !isRunActive(r.entry),
    createdIds: new Set(r.created?.ids ?? []),
    createdMacs: new Set((r.created?.macs ?? []).map(normalizeMacLike)),
  }));
}

interface Found {
  candidates: Candidate[];
  readFailures: ReadFailure[];
}

/** Finds every candidate (all runs; scope and skips are applied by the caller) and every failed read. */
async function find(h: Harness, runs: RunInfo[]): Promise<Found> {
  const ns = h.env.namespace;
  const out: Candidate[] = [];
  const failures: ReadFailure[] = [];
  const runsListing = (id: string): Set<string> =>
    new Set(runs.filter((r) => r.createdIds.has(id)).map((r) => r.runId));
  const withName = (set: Set<string>, name: unknown): Set<string> => {
    const run = runOfName(name);
    if (run) set.add(run);
    return set;
  };
  const allCreatedIds = new Set(runs.flatMap((r) => [...r.createdIds]));

  // Assets (test range) and documents (test-range assets and every recorded MAC, also of a deleted asset).
  const assets = (await getList(failures, 'assets', '/assets/{ns}')) ?? [];
  const testMacs = new Set<string>();
  for (const a of assets.filter(isPlainObject)) {
    const udid = typeof a.user_udid === 'string' ? a.user_udid : '';
    if (isTestMac(udid)) {
      testMacs.add(udid);
    } else if (
      [a.user_name, a.external_id].some((v) => typeof v === 'string' && v.startsWith('sdk-test-'))
    ) {
      out.push({
        target: 'assets-outside-test-range',
        id: udid,
        runs: withName(withName(new Set(), a.user_name), a.external_id),
      });
    }
  }
  const docMacs = new Set([...testMacs, ...runs.flatMap((r) => [...r.createdMacs])]);
  for (const mac of [...docMacs].sort()) {
    const response = await rawRequest('GET', `/assets/{ns}/${enc(mac)}/documents`, {
      query: { limit: 0 },
    });
    if (
      response.status !== 200 ||
      !isPlainObject(response.json) ||
      !Array.isArray(response.json.items)
    ) {
      failures.push({
        target: 'asset-documents',
        status: response.status === 200 ? 0 : response.status,
      });
      continue;
    }
    for (const d of response.json.items.filter(isPlainObject)) {
      const documentId = typeof d.documentId === 'string' ? d.documentId : null;
      if (!documentId) continue;
      out.push({
        target: 'asset-documents',
        id: `${mac}/${documentId}`,
        runs: new Set(
          runs.filter((r) => r.createdMacs.has(normalizeMacLike(mac))).map((r) => r.runId)
        ),
        macRun: normalizeMacLike(mac).slice(6, 10),
        remove: { method: 'DELETE', path: `/assets/{ns}/${enc(mac)}/documents/${enc(documentId)}` },
      });
    }
  }
  for (const mac of [...testMacs].sort()) {
    out.push({
      target: 'assets',
      id: mac,
      runs: new Set(
        runs.filter((r) => r.createdMacs.has(normalizeMacLike(mac))).map((r) => r.runId)
      ),
      macRun: normalizeMacLike(mac).slice(6, 10),
      remove: { method: 'DELETE', path: `/assets/{ns}/${enc(mac)}`, verifyGone: true },
    });
  }

  // Dashboards of the key's user in this namespace.
  for (const d of ((await getList(failures, 'dashboards', '/dashboards/created')) ?? []).filter(
    isPlainObject
  )) {
    const id = idOf(d);
    if (id === null || d.application_namespace !== ns) continue;
    const named = typeof d.name === 'string' && d.name.startsWith('sdk-test-');
    if (!named && !allCreatedIds.has(id)) continue;
    out.push({
      target: 'dashboards',
      id,
      runs: withName(runsListing(id), d.name),
      remove: { method: 'DELETE', path: `/dashboards/${enc(id)}` },
    });
  }

  // Notifications: inbox items the key's own user sent to itself titled `sdk-test-`; rules, saved views,
  // recipient mappings and connections.
  const policy = await rawRequest('GET', '/notifications/{ns}/cleanup-policy');
  const self =
    policy.status === 200 && isPlainObject(policy.json) && typeof policy.json.user_id === 'string'
      ? policy.json.user_id
      : null;
  // Without the self id the inbox items cannot be selected: not "none left", a failed read.
  if (self === null)
    failures.push({ target: 'cleanup-policy', status: policy.status === 200 ? 0 : policy.status });
  if (self !== null) {
    for (let page = 0; page < MAX_PAGES; page += 1) {
      const items = await getList(failures, 'notification-items', '/notifications/{ns}', {
        group_by: 'flat',
        state: 'all',
        q: '"sdk-test"',
        limit: PAGE_LIMIT,
        offset: page * PAGE_LIMIT,
      });
      if (items === null) break;
      for (const n of items.filter(isPlainObject)) {
        const id = idOf(n);
        const selfSent = n.user_id === self && n.source_ref === `user:${self}`;
        if (
          id === null ||
          !selfSent ||
          typeof n.title !== 'string' ||
          !n.title.startsWith('sdk-test-')
        )
          continue;
        out.push({ target: 'notification-items', id, runs: withName(runsListing(id), n.title) });
      }
      if (items.length < PAGE_LIMIT) break;
    }
  }
  const lists: [SweepTarget, string, '_id' | 'id', (i: Record<string, unknown>) => boolean][] = [
    [
      'notification-rules',
      'rules',
      '_id',
      (i) =>
        typeof i.name === 'string' &&
        (i.name.startsWith('sdk-test-') || i.name.startsWith('sdk-example-')),
    ],
    [
      'saved-views',
      'saved-views',
      '_id',
      (i) =>
        typeof i.name === 'string' &&
        (i.name.startsWith('sdk-test-') || i.name.startsWith('sdk-example-')),
    ],
    [
      'recipient-mappings',
      'recipient-mappings',
      'id',
      (i) => {
        const types =
          isPlainObject(i.match) && Array.isArray(i.match.event_types) ? i.match.event_types : [];
        return types.some((t) => typeof t === 'string' && t.startsWith('sdk-test-'));
      },
    ],
    ['connections', 'connections', '_id', () => false],
  ];
  for (const [target, segment, key, matches] of lists) {
    const items = await getList(failures, target, `/notifications/{ns}/${segment}`);
    for (const i of (items ?? []).filter(isPlainObject)) {
      const id = idOf(i, key);
      if (id === null || (!matches(i) && !allCreatedIds.has(id))) continue;
      const runsOf = runsListing(id);
      if (
        target === 'recipient-mappings' &&
        isPlainObject(i.match) &&
        Array.isArray(i.match.event_types)
      ) {
        for (const t of i.match.event_types) {
          const m = typeof t === 'string' ? /^sdk-test-([0-9a-f]{8})(?:-|$)/.exec(t) : null;
          if (m) runsOf.add(m[1] as string);
        }
      } else withName(runsOf, i.name);
      out.push({
        target,
        id,
        runs: runsOf,
        remove: { method: 'DELETE', path: `/notifications/{ns}/${segment}/${enc(id)}` },
      });
    }
  }

  // ETL mapping profiles of this namespace.
  for (const p of (
    (await getList(failures, 'etl-mapping-profiles', '/etl/mapping-profiles')) ?? []
  ).filter(isPlainObject)) {
    const id = idOf(p);
    if (id === null) continue;
    const named =
      typeof p.name === 'string' && p.name.startsWith('sdk-test-') && p.applicationId === ns;
    if (!named && !allCreatedIds.has(id)) continue;
    out.push({
      target: 'etl-mapping-profiles',
      id,
      runs: withName(runsListing(id), p.name),
      remove: { method: 'DELETE', path: `/etl/mapping-profiles/${enc(id)}` },
    });
  }

  // Alert rules whose id starts `sdk-test-` (ids only, never content).
  const rules = await rawRequest('GET', '/alert_rules/{ns}');
  const ruleList = rules.status === 200 ? alertRuleList(rules.json) : null;
  if (ruleList === null)
    failures.push({ target: 'alert-rules', status: rules.status === 200 ? 0 : rules.status });
  for (const r of (ruleList ?? []).filter(isPlainObject)) {
    if (typeof r.id !== 'string' || !r.id.startsWith('sdk-test-')) continue;
    out.push({ target: 'alert-rules', id: r.id, runs: withName(new Set(), r.id) });
  }
  return { candidates: out, readFailures: failures };
}

function mergeFailures(...lists: ReadFailure[][]): ReadFailure[] {
  const seen = new Map<string, ReadFailure>();
  for (const f of lists.flat()) seen.set(`${f.target} ${f.status}`, f);
  return [...seen.values()];
}

function belongsTo(c: Candidate, runId: string): boolean {
  return c.runs.has(runId) || c.macRun === runId.slice(0, 4);
}

/** One write of the alert-rule document minus its disabled `sdk-test-` rules (P0 §6.2 sweeper, alert rules). */
async function fixAlertRules(h: Harness, ids: string[], lock: ConfigLockOptions): Promise<number> {
  return holdConfigLock(h, lock, async (lockHeld) => {
    const current = await readConfig('alert-rules');
    const doc = current.value;
    if (
      current.status !== 200 ||
      !isPlainObject(doc) ||
      typeof doc.name !== 'string' ||
      !Array.isArray(doc.rules)
    )
      return 0;
    const isTest = (r: unknown): boolean =>
      isPlainObject(r) && typeof r.id === 'string' && r.id.startsWith('sdk-test-');
    const testRules = doc.rules.filter(isTest);
    const sameSet =
      testRules.length === ids.length &&
      testRules.every((r) => ids.includes(String((r as Record<string, unknown>).id)));
    if (
      testRules.length === 0 ||
      !sameSet ||
      !testRules.every((r) => (r as Record<string, unknown>).disabled === true)
    )
      return 0;
    const dir = join(h.stateDir, 'sweeper');
    saveBeforeImage(dir, 'alert-rules', doc, current.text);
    const next = { ...doc, rules: doc.rules.filter((r) => !isTest(r)) };
    const written = await writeConfig(h, 'alert-rules', doc, next, { mode: 'sweeper', lockHeld });
    const after = await readConfig('alert-rules');
    if (
      written.status >= 200 &&
      written.status < 300 &&
      after.status === 200 &&
      configValuesEqual(after.value, next)
    )
      return testRules.length;
    await restoreConfig(h, 'alert-rules', doc, { lockHeld, stateDir: dir });
    return 0;
  });
}

export async function sweep(options: SweepOptions): Promise<SweepResult> {
  const h = activeHarness();
  const token = options.lockToken ?? process.env.RTLS_IT_INTERNAL_LOCK_TOKEN ?? '';
  if (!options.check) {
    if (!h.env.tiers.W) {
      throw new HarnessPrecondition('sweeper removal needs RTLS_IT_WRITES=1', ['RTLS_IT_WRITES']);
    }
    if (!holdsLock(lockPaths(h.mainStateDir).run, token)) {
      throw new HarnessPrecondition('sweeper removal needs the run lock held with this token');
    }
  }
  const accepted = acceptedResidue(
    options.allowlistDir ?? join(CHECKOUT_ROOT, 'test', 'integration', 'allowlist')
  );
  const runs = runInfos(h);
  const crashedRuns = runs.filter((r) => r.crashed).map((r) => r.runId);
  const skipRuns = runs.filter((r) => r.active && !options.force).map((r) => r.runId);
  const inScope = (c: Candidate): boolean => (options.runId ? belongsTo(c, options.runId) : true);
  const skipped = (c: Candidate): boolean => skipRuns.some((runId) => belongsTo(c, runId));
  const isAccepted = (c: Candidate): boolean =>
    accepted.some((a) => a.kind === c.target && c.id.includes(a.match));
  const select = (all: Candidate[]): Candidate[] =>
    all
      .filter((c) => inScope(c) && !skipped(c) && !isAccepted(c))
      .sort((a, b) => SWEEP_ORDER.indexOf(a.target) - SWEEP_ORDER.indexOf(b.target));
  const toResidue = (list: Candidate[]): Residue[] =>
    list.map(({ target, id }) => ({ target, id }));
  const result = (
    residue: Candidate[],
    removed: number,
    readFailures: ReadFailure[]
  ): SweepResult => ({
    residue: toResidue(residue),
    readFailures,
    removed,
    accepted,
    crashedRuns,
    skippedRuns: [...skipRuns].sort(),
  });

  const first = await find(h, runs);
  const found = select(first.candidates);
  if (options.check) return result(found, 0, first.readFailures);

  // Removal, in SWEEP_ORDER, inside the sweeper scope (only the paths registered here mutate).
  let removed = 0;
  const removable = found.filter((c) => c.remove !== undefined);
  const paths = new Set<string>(
    removable.map((c) => `DELETE ${relPath(h, (c.remove as { path: string }).path)}`)
  );
  const items = found.filter((c) => c.target === 'notification-items');
  if (items.length > 0) paths.add(`POST ${relPath(h, '/notifications/{ns}/bulk')}`);
  const lock: ConfigLockOptions = { token, ...(options.configLockWait ?? { wait: true }) };
  await runWithGuardScope({ kind: 'sweeper', paths }, async () => {
    const del = async (c: Candidate): Promise<void> => {
      const r = c.remove as NonNullable<Candidate['remove']>;
      try {
        const response = await rawRequest(r.method, r.path);
        if (response.status < 200 || response.status >= 300) return;
        if (r.verifyGone && (await rawRequest('GET', r.path)).status !== 404) return;
        removed += 1;
      } catch {
        // left in place: the confirming find reports it
      }
    };
    for (const target of SWEEP_ORDER) {
      const group = found.filter((c) => c.target === target);
      if (group.length === 0) continue;
      if (target === 'notification-items') {
        const ids = group.map((c) => c.id);
        for (let i = 0; i < ids.length; i += BULK_CHUNK) {
          const chunk = ids.slice(i, i + BULK_CHUNK);
          try {
            const response = await rawRequest('POST', '/notifications/{ns}/bulk', {
              body: { ids: chunk, action: 'delete' },
            });
            if (response.status >= 200 && response.status < 300) removed += chunk.length;
          } catch {
            // left in place
          }
        }
      } else if (target === 'recipient-mappings') {
        if (!h.env.tiers.C) continue;
        await holdConfigLock(h, lock, async () => {
          for (const c of group) await del(c);
        });
      } else if (target === 'alert-rules') {
        if (!options.fixConfig || !h.env.tiers.C) continue;
        removed += await fixAlertRules(
          h,
          group.map((c) => c.id),
          lock
        );
      } else {
        for (const c of group.filter((x) => x.remove)) await del(c);
      }
    }
  });

  // Confirm with a fresh find; delete a run's created record (and a crashed run's entry) only when none of that
  // run's residue is left. An active run keeps its record (its other processes read it for G5 b), except the own
  // run swept with `force` at its end. A confirming find that could not read a listing confirms nothing: every
  // record and entry stays for the next pass.
  const confirm = await find(h, runs);
  const after = confirm.candidates.filter((c) => !isAccepted(c));
  const left = select(after);
  const readFailures = mergeFailures(first.readFailures, confirm.readFailures);
  for (const run of runs) {
    if (confirm.readFailures.length > 0) break;
    if (options.runId && run.runId !== options.runId) continue;
    if (run.active && !(options.force && options.runId === run.runId)) continue;
    if (after.some((c) => belongsTo(c, run.runId))) continue;
    deleteCreatedRecord(run.runId, { stateDir: h.mainStateDir });
    if (run.crashed) deregisterRun(run.runId, { stateDir: h.mainStateDir });
  }
  return result(left, removed, readFailures);
}
