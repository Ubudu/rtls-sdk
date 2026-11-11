// Write section: tier W; budget positions=0 notifications=0 ble=0 etl=0; read skips none
/**
 * Example 14: dashboards.
 *
 * Read-only: lists the dashboards created by, shared with and selected by the API key's user in the namespace,
 * then all of them in one list and the first one by id.
 * With `--write`: creates a test dashboard, updates it, shares it with a fictitious user (view, then edit),
 * unshares it and deletes it. Dashboards belong to the API key's user and show in that user's product UI.
 *
 * Run through the guarded runner: `npm run examples:check -- 14` (read-only; this JavaScript twin always runs read-only there) or
 * `RTLS_IT_WRITES=1 npm run examples:check -- 14 --write`.
 */
import { runExample, testName } from '../shared/config.js';
/** @import { Dashboard } from 'ubudu-rtls-sdk' */

/**
 * One line per dashboard; the share count exists only in the creator's view.
 *
 * @param {Dashboard} d
 * @returns {string}
 */
function describe(d) {
  const widgets = Array.isArray(d.data) ? d.data.length : 'n/a';
  const shares = d.shared_with === undefined ? 'n/a' : d.shared_with.length;
  return `${d.name} (_id ${d._id}) can_edit=${d.can_edit} selected=${d.selected} widgets=${widgets} shares=${shares}`;
}

await runExample('14-dashboards', async ({ client, config, log, signal }) => {
  // ─── Read-only part ──────────────────────────────────────────────────────────
  const lists = {
    created: await client.dashboards.listCreated({ signal }),
    shared: await client.dashboards.listShared({ signal }),
    selected: await client.dashboards.listSelected({ signal }),
  };
  for (const [kind, dashboards] of Object.entries(lists)) {
    log(`${kind}: ${dashboards.length} dashboard(s)`);
    for (const d of dashboards) log(`  ${describe(d)}`);
  }
  // list() returns the created and the shared dashboards together; get() reads one by its `_id`.
  const all = await client.dashboards.list({ signal });
  log(`created or shared: ${all.length} dashboard(s)`);
  const firstId = all[0]?._id;
  if (firstId !== undefined) {
    const one = await client.dashboards.get(firstId, { signal });
    log(`by id: ${describe(one)}`);
  }

  if (!config.write) return;

  // ─── Write part (tier W) ─────────────────────────────────────────────────────
  const viewer = testName('ex14-viewer'); // fictitious: the server resolves no username and notifies nobody
  const created = await client.dashboards.create(
    { name: testName('ex14'), description: 'SDK example 14, safe to delete', data: [] },
    { signal }
  );
  log(`created ${created._id}`);
  try {
    const updated = await client.dashboards.update(
      created._id,
      { description: 'SDK example 14, updated' },
      { signal }
    );
    log(`updated description: ${updated.description ?? ''}`);

    // Membership grants view; 'view' itself is not sent.
    let shared = await client.dashboards.share(created._id, { username: viewer }, { signal });
    log(`shared as view: ${JSON.stringify(shared.shared_with)}`);
    shared = await client.dashboards.share(
      created._id,
      { username: viewer, permissions: ['edit'] },
      { signal }
    );
    log(`shared as edit: ${JSON.stringify(shared.shared_with)}`);

    const unshared = await client.dashboards.unshare(created._id, viewer, { signal });
    log(`after unshare: ${unshared.shared_with?.length ?? 0} share(s)`);
  } finally {
    await client.dashboards.delete(created._id);
    log(`deleted ${created._id}`);
  }
});
