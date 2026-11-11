// Write section: tier W; budget positions=0 notifications=0 ble=0 etl=0; read skips none
/**
 * Example 02: assets.
 *
 * Read-only: counts the assets of the namespace, filters, sorts and pages them locally (the server returns the whole
 * list), looks one up with the server-side `key`/`value` match, reads it, reads its audit history of the last 24 h,
 * and summarises the asset tree and the data-model fields.
 * With `--write`: creates a test asset, updates it, waits for its audit entries, saves two more in one batch and
 * deletes all three. Asset writes reach the alert-rule engine, so the section first runs the rule preflight.
 * With `--write --tag <mac>` (your own tag, in your own run only, with `RTLS_IT_SIDE_EFFECTS=1` on the command
 * line): sends one `ptlGreen` action for 2 s and prints `BUDGET … ble=<n>`. The guarded write pass passes no
 * `--tag`, so the header budget (`ble=0`) counts no BLE action. A BLE action to a MAC that is not an ESL asset is
 * broadcast through every BLE gateway of the namespace.
 *
 * Run through the guarded runner: `npm run examples:check -- 02` (read-only; this JavaScript twin always runs
 * read-only there) or `RTLS_IT_WRITES=1 npm run examples:check -- 02 --write`.
 */
import { NotFoundError } from 'ubudu-rtls-sdk';
import {
  getArg,
  preflightAllows,
  preflightRules,
  reportBudget,
  runExample,
  skip,
  testMac,
  testName,
} from '../shared/config.js';

/**
 * Test MACs of this example's block whose asset does not exist yet (`get` answers 404).
 *
 * @param {import('ubudu-rtls-sdk').RtlsClient} client
 * @param {number} count
 * @param {AbortSignal} signal
 * @returns {Promise<number[]>}
 */
async function freeMacs(client, count, signal) {
  /** @type {number[]} */
  const free = [];
  for (let n = 60; n <= 64 && free.length < count; n += 1) {
    try {
      await client.assets.get(testMac(n), { signal });
    } catch (err) {
      if (err instanceof NotFoundError) free.push(n);
      else throw err;
    }
  }
  if (free.length < count) skip('no-fixture', 'not enough free test MACs (60-64)');
  return free;
}

/**
 * @param {import('ubudu-rtls-sdk').AssetTreeNode[]} nodes
 * @returns {number}
 */
function countNodes(nodes) {
  return nodes.reduce((sum, n) => sum + 1 + countNodes(n.families ?? []), 0);
}

await runExample('02-assets', async ({ client, config, log, signal }) => {
  // ─── Read-only part ──────────────────────────────────────────────────────────
  const assets = await client.assets.list({ signal });
  log(`assets in the namespace: ${assets.length}`);

  // Local filter + sort + page (the server ignores these keys, the SDK applies them to the full list).
  const page = await client.assets.list({
    'user_name:exists': true,
    sort: 'user_name:asc',
    page: 1,
    limit: 5,
    signal,
  });
  log(`first ${page.length} asset(s) by name: ${page.map((a) => a.user_udid).join(', ')}`);

  const first = assets[0];
  if (first !== undefined) {
    const match = await client.assets.list({ key: 'user_udid', value: first.user_udid, signal });
    log(`key/value lookup of ${first.user_udid}: ${match.length} asset(s)`);
    const asset = await client.assets.get(first.user_udid, { signal });
    log(`get ${asset.user_udid}: model=${asset.model ?? 'n/a'} tags=${(asset.tags ?? []).length}`);
    const history = await client.assets.getHistory(first.user_udid, { signal });
    log(`audit entries of the last 24 h: ${history.length} (newest first, at most 1000)`);
  }

  const tree = await client.assetTree.get({ signal });
  log(`asset tree: ${tree.length} root(s), ${countNodes(tree)} node(s)`);
  const fields = await client.dataModels.get({ signal });
  log(`data-model fields: ${fields.map((f) => f.key).join(', ')}`);

  if (!config.write) return;

  // ─── Write part (tier W) ─────────────────────────────────────────────────────
  const pf = await preflightRules(client);
  if (!preflightAllows(pf, 'assets')) {
    skip('preflight', 'asset writes could fire an alert rule or reach a linked namespace');
  }
  const [n0, n1, n2] = await freeMacs(client, 3, signal);
  const mac = testMac(n0);
  const batch = [testMac(n1), testMac(n2)];
  /** @type {string[]} */
  const created = [];
  let ble = 0;
  try {
    const startedAt = Date.now();
    const asset = await client.assets.create(
      mac,
      { user_name: testName(`ex02-${n0}`), model: 'sdk-test', tags: ['sdk-test'] },
      { signal }
    );
    created.push(mac);
    log(`created ${asset.user_udid} (createdBy set by the server: ${typeof asset.createdBy})`);

    const updated = await client.assets.update(mac, { color: '#00ff00' }, { signal });
    log(`updated color: ${updated.color ?? ''}`);

    // Audit entries are indexed asynchronously: poll for up to 30 s.
    let entries = await client.assets.getHistory(mac, { startTime: startedAt - 60_000, signal });
    for (let i = 0; i < 15 && entries.length < 2; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      entries = await client.assets.getHistory(mac, { startTime: startedAt - 60_000, signal });
    }
    log(`audit entries of ${mac}: ${entries.map((e) => e.action).join(', ') || 'not indexed yet'}`);

    const saved = await client.assets.batchSave(
      [
        { user_udid: batch[0], user_name: testName(`ex02-${n1}`), model: 'sdk-test' },
        { user_udid: batch[1], user_name: testName(`ex02-${n2}`), model: 'sdk-test' },
      ],
      { signal }
    );
    created.push(...batch);
    log(`batch saved ${saved.length} asset(s)`);

    const removed = await client.assets.batchDelete(batch, { signal });
    log(`batch deleted ${removed.deleted.length}, not found ${removed.not_found.length}`);
    created.splice(1);

    await client.assets.delete(mac, { signal });
    created.splice(0);
    log(`deleted ${mac}`);

    const tag = getArg('tag', '');
    if (tag === '') {
      log(
        'tag action: not sent (pass --tag <mac> of your own tag; BLE actions reach every gateway)'
      );
    } else if (process.env.RTLS_IT_SIDE_EFFECTS !== '1') {
      log(
        'tag action: not sent (a BLE action is a side effect: --tag needs RTLS_IT_SIDE_EFFECTS=1)'
      );
    } else {
      const r = await client.tagActions.send(
        [{ macAddress: tag, action: 'ptlGreen', duration: 2 }],
        { signal }
      );
      ble = r.tagCount;
      for (const x of r.results) {
        log(`tag action ${x.action}: success=${x.success} status=${x.statusCode} ${x.error ?? ''}`);
      }
    }
  } finally {
    for (const m of created) {
      await client.assets.delete(m).catch((err) => {
        if (!(err instanceof NotFoundError)) throw err;
      });
    }
  }
  reportBudget({ positions: 0, notifications: 0, ble, etl: 0 });
});
