// Write section: tier S; budget positions=0 notifications=1 ble=0 etl=0; read skips none
/**
 * 16 - Notifications: shift-start triage for an operator dashboard
 *
 * Read-only part: the unread badge, the items waiting for an acknowledgement, a first inbox page with its total
 * and a bounded iteration, the inbox rolled up by kind, the facets, the first lines of a CSV export of the last
 * 24 h, the caller's rules / connections / saved views, and (with the manage_api_keys role) the tenant channels and
 * recipient mappings.
 *
 * Write part (`--write`): sends ONE mission to yourself (no external channels), works it through read →
 * in progress → done → acknowledged, pins, unpins and snoozes it, archives it with undo, creates a disabled rule
 * and a saved view, and removes everything it created. Connection tests and the administration writes are left
 * out on purpose: they reach external channels or change the tenant configuration.
 */
import { AuthorizationError, collectAll } from 'ubudu-rtls-sdk';
import { reportBudget, runExample, testName } from '../shared/config.js';

/**
 * @param {import('ubudu-rtls-sdk').RtlsClient} client
 * @param {(...a: unknown[]) => void} log
 */
async function readOnly(client, log) {
  const badge = await client.notifications.unreadCount();
  log(`Unread: ${badge.unread}, needing action: ${badge.needs_action}`);

  const pending = await client.notifications.list({ state: 'needs_action', limit: 10 });
  log(`Waiting for acknowledgement (${pending.length}):`);
  for (const item of pending) log(`  [${item.severity}] ${item.title ?? '(no title)'}`);

  // listPage() returns one offset page with its total; iterate() walks the pages lazily, so bound it.
  const page = await client.notifications.listPage({ limit: 5 });
  log(`Inbox: ${page.items.length} item(s) on the first page, total ${page.total ?? 'unknown'}`);
  const recent = await collectAll(client.notifications.iterate({ limit: 10 }), { maxItems: 20 });
  log(`Iterated: ${recent.length} item(s) (at most 20)`);

  const byKind = await client.notifications.listGroups({ group_by: 'type' });
  for (const g of byKind) log(`Kind ${g.group_key}: ${g.count} (${g.unread_count} unread)`);

  const facets = await client.notifications.facets();
  log(
    `Facets: unread ${facets.state.unread}, pinned ${facets.state.pinned}, snoozed ${facets.state.snoozed}`
  );

  const csv = await client.notifications.export({ format: 'csv', from: Date.now() - 86_400_000 });
  const lines = csv.split('\n').filter((l) => l !== '');
  log(`Export of the last 24 h: ${Math.max(lines.length - 1, 0)} rows; header: ${lines[0] ?? ''}`);

  const [rules, connections, views] = await Promise.all([
    client.notifications.rules.list(),
    client.notifications.connections.list(),
    client.notifications.savedViews.list(),
  ]);
  log(`Rules: ${rules.length}, connections: ${connections.length}, saved views: ${views.length}`);

  try {
    const config = await client.notifications.admin.tenantConfig.get();
    const channels = /** @type {const} */ ([
      'email',
      'slack',
      'telegram',
      'teams',
      'whatsapp',
    ]).filter((c) => config[c] !== undefined);
    log(`Tenant channels configured: ${channels.length > 0 ? channels.join(', ') : 'none'}`);
    const mappings = await client.notifications.admin.recipientMappings.list();
    log(`Recipient mappings: ${mappings.length}`);
  } catch (error) {
    if (!(error instanceof AuthorizationError)) throw error;
    log('Administration needs the manage_api_keys role; skipped for this key.');
  }
}

/**
 * @param {import('ubudu-rtls-sdk').RtlsClient} client
 * @param {(...a: unknown[]) => void} log
 */
async function writeSection(client, log) {
  const X = testName('ex16');
  /** @type {import('ubudu-rtls-sdk').NotificationItem | undefined} */
  let item;
  /** @type {string | undefined} */
  let ruleId;
  /** @type {string | undefined} */
  let viewId;
  try {
    item = await client.notifications.sendToSelf({
      kind: 'mission',
      title: `${X} check the cold room`,
      mission_id: X,
      mission: { status: 'open', due: Date.now() + 3_600_000 },
    });
    reportBudget({ notifications: 1 });
    log(`Sent mission ${item._id} on thread ${item.thread_key}`);

    await client.notifications.markRead(item._id);
    await client.notifications.updateMission(item._id, 'in_progress');
    const done = await client.notifications.updateMission(item._id, 'done');
    log(`Mission status: ${done.mission?.status ?? '?'}`);
    const acked = await client.notifications.acknowledge(item._id);
    log(`Acknowledged: ${acked.acknowledged}`);

    const pinned = await client.notifications.pin(item._id);
    const unpinned = await client.notifications.unpin(item._id);
    log(`Pinned: ${pinned.pinned}, then unpinned: ${!unpinned.pinned}`);
    const snoozed = await client.notifications.snooze(item._id, Date.now() + 600_000);
    await client.notifications.snooze(item._id, 0);
    log(`Snoozed for 10 min: ${snoozed.snooze_until !== null}, then cleared`);

    const archived = await client.notifications.bulk({ ids: [item._id], action: 'archive' });
    log(`Archived ${archived.affected}`);
    if (archived.undo_token !== undefined) {
      const undone = await client.notifications.undo(archived.undo_token);
      log(`Undo restored ${undone.restored}`);
    }

    const rule = await client.notifications.rules.create({
      enabled: false,
      name: `${X}-rule`,
      match: { event_types: [X] },
      channels: ['inapp'],
    });
    ruleId = rule._id;
    const view = await client.notifications.savedViews.create({
      name: `${X}-view`,
      query: { thread_key: `mission:${X}`, state: 'all' },
    });
    viewId = view._id;
    const rules = await client.notifications.rules.list();
    const views = await client.notifications.savedViews.list();
    log(
      `Created rule (listed: ${rules.some((r) => r._id === ruleId)}) and view (listed: ${views.some((v) => v._id === viewId)})`
    );
    await client.notifications.rules.delete(rule._id);
    ruleId = undefined;
    await client.notifications.savedViews.delete(view._id);
    viewId = undefined;
  } finally {
    if (item !== undefined) await client.notifications.bulk({ ids: [item._id], action: 'delete' });
    if (ruleId !== undefined) await client.notifications.rules.delete(ruleId);
    if (viewId !== undefined) await client.notifications.savedViews.delete(viewId);
  }
  log('Cleaned up the mission, the rule and the view.');
}

await runExample('16-notifications', async ({ client, config, log }) => {
  await readOnly(client, log);
  if (config.write) await writeSection(client, log);
  else log('Write section not run (pass --write).');
});
