// Write section: tier S; budget positions=0 notifications=1 ble=0 etl=0; read skips none
/**
 * 21 - Recipe: geofence alert to notification
 *
 * Read-only by default: lists the zones, counts the alerts of the last 7 days by zone and title, reads the unread
 * notification count, listens to live zone entries/exits and alerts for a few seconds, picks the triggering event
 * and prints the notification it would send. With --write it sends that notification to the key's own user,
 * verifies it and deletes it again.
 *
 *   npm run ts -- typescript/21-geofence-alert-to-notification.ts [--seconds 5]      (from examples/)
 */
import { NotFoundError, SubscriptionType, type ZoneEntryExitMessage } from 'ubudu-rtls-sdk';
import { getArg, reportBudget, runExample, skip, testName } from '../shared/config.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_SECONDS = 30;

interface Trigger {
  source: 'live zone event' | 'stored alert' | 'synthetic';
  zoneId: number;
  zoneName: string;
  assetLabel: string;
}

await runExample('21-geofence-alert-to-notification', async ({ client, config, log }) => {
  const requested = Number(getArg('seconds', '5'));
  const seconds = Number.isFinite(requested)
    ? Math.min(MAX_SECONDS, Math.max(1, Math.trunc(requested)))
    : 5;

  // 1. Zones of the first venue: id → name.
  const [venue] = await client.venues.list();
  if (!venue) throw new Error('the namespace has no venue');
  client.setVenue(venue.id);
  const zones = await client.zones.listAsArray();
  const zoneNames = new Map(zones.map((z) => [z.id, z.name]));
  log(`zones: ${zones.length}`);

  // 2. Stored alerts of the last 7 days (newest first, at most 20), counted by zone and by event title.
  const now = Date.now();
  const alerts = await client.alerts.list({
    timestampFrom: now - 7 * DAY_MS,
    timestampTo: now,
    size: 20,
  });
  const byZone = new Map<string, number>();
  const byTitle = new Map<string, number>();
  for (const a of alerts) {
    const zone = a.zone.name ?? 'no zone';
    byZone.set(zone, (byZone.get(zone) ?? 0) + 1);
    byTitle.set(a.event.title, (byTitle.get(a.event.title) ?? 0) + 1);
  }
  log(`alerts (7 days, max 20): ${alerts.length}`);
  for (const [zone, n] of byZone) log(`  zone ${zone}: ${n}`);
  for (const [title, n] of byTitle) log(`  title ${title}: ${n}`);

  // 3. Unread notifications. A namespace without the notification feature answers 404 with a non-JSON body.
  try {
    const unread = await client.notifications.unreadCount();
    log(`unread notifications: ${unread.unread} (needs action: ${unread.needs_action})`);
  } catch (e) {
    if (e instanceof NotFoundError && typeof e.body === 'string')
      skip('feature-off', 'notifications are not enabled');
    throw e;
  }

  // 4. Live zone entries/exits and alerts for a few seconds. zone null = outside all zones.
  const zoneEvents: ZoneEntryExitMessage[] = [];
  let liveAlerts = 0;
  const ws = client.createWebSocket();
  ws.on('ZONES_ENTRIES_EVENTS', (m) => {
    zoneEvents.push(m);
    const id = m.zone?.properties.id ?? 0;
    log(
      `  ${m.event_type} ${id === 0 ? 'outside all zones' : (zoneNames.get(id) ?? `zone ${id}`)}`
    );
  });
  ws.on('ALERTS', () => {
    liveAlerts += 1;
  });
  try {
    await ws.connect({ subscriberOnly: true });
    await ws.subscribe([SubscriptionType.ZONES_ENTRIES_EVENTS, SubscriptionType.ALERTS]);
    await new Promise((resolve) => setTimeout(resolve, seconds * 1000));
  } finally {
    await ws.disconnect();
  }
  log(`live events in ${seconds} s: ${zoneEvents.length} zone event(s), ${liveAlerts} alert(s)`);

  // 5. The trigger: the newest live event with a zone, else the newest stored alert, else a synthetic event.
  let trigger: Trigger | undefined;
  for (const m of [...zoneEvents].reverse()) {
    const id = m.zone?.properties.id ?? 0;
    if (id !== 0) {
      trigger = {
        source: 'live zone event',
        zoneId: id,
        zoneName: zoneNames.get(id) ?? `zone ${id}`,
        assetLabel: m.user_name ?? 'an asset',
      };
      break;
    }
  }
  const stored = alerts.find((a) => typeof a.zone.id === 'number' && a.zone.id !== 0);
  if (!trigger && stored && stored.zone.id !== undefined) {
    trigger = {
      source: 'stored alert',
      zoneId: stored.zone.id,
      zoneName: stored.zone.name ?? `zone ${stored.zone.id}`,
      assetLabel: stored.user.name ?? 'an asset',
    };
  }
  const firstZone = zones[0];
  if (!trigger && firstZone) {
    trigger = {
      source: 'synthetic',
      zoneId: firstZone.id,
      zoneName: firstZone.name,
      assetLabel: 'an asset',
    };
  }
  if (!trigger) throw new Error('no zone to build a notification from');

  const title = `${testName('r21')} Zone entry: ${trigger.zoneName}`;
  const body = `${trigger.assetLabel} entered ${trigger.zoneName}`;
  const params = { zone_id: trigger.zoneId, zone_name: trigger.zoneName, source: 'sdk-recipe' };
  log(`trigger: ${trigger.source}`);
  log(`planned notification: kind alert, severity warning, title "${title}"`);
  log(`planned params: ${JSON.stringify(params)}`);

  if (!config.write) {
    log('read-only pass: nothing sent (start with --write to send it to your own user)');
    return;
  }

  // Write section (tier S): one notification to the key's own user, verified, then deleted. In your own code use
  // client.notifications.sendToSelf({ kind, title, body, severity, params }): it looks up and caches your user id
  // and returns the created item. The recipe uses the explicit send() form so that it also covers that call.
  const policy = await client.notifications.cleanupPolicy.get();
  const selfId = policy.user_id;
  if (!selfId) throw new Error('the cleanup policy carries no user id');

  const problems: string[] = [];
  let id: string | undefined;
  try {
    let sent;
    try {
      sent = await client.notifications.send({
        kind: 'alert',
        recipients: [{ target_type: 'user', id: selfId }],
        title,
        body,
        severity: 'warning',
        params,
      });
    } finally {
      reportBudget({ notifications: 1 });
    }
    if (sent.length !== 1 || typeof sent[0]?._id !== 'string')
      throw new Error('send did not return one item');
    id = sent[0]._id;
    log('sent: 1 notification');

    const item = await client.notifications.get(id);
    if (item.kind !== 'alert' || item.severity !== 'warning' || item.title !== title) {
      throw new Error('the stored notification differs from the sent one');
    }
    log('verified: kind, severity and title match');
  } finally {
    // Cleanup: delete the sent item by its id; without an id, look for an item of this run in the inbox.
    if (id !== undefined) {
      try {
        const deleted = await client.notifications.bulk({ ids: [id], action: 'delete' });
        if (deleted.affected !== 1) problems.push(`delete affected ${deleted.affected} item(s)`);
      } catch (e) {
        problems.push(`delete failed: ${e instanceof Error ? e.name : 'error'}`);
      }
      try {
        await client.notifications.get(id);
        problems.push('the notification still exists after the delete');
      } catch (e) {
        if (!(e instanceof NotFoundError))
          problems.push(`check failed: ${e instanceof Error ? e.name : 'error'}`);
      }
    } else {
      try {
        const recent = await client.notifications.list({ limit: 50 });
        const residue = recent.filter((n) => n.title?.startsWith(testName('r21'))).length;
        if (residue > 0)
          problems.push(`${residue} notification(s) of this run remain; the sweeper removes them`);
      } catch (e) {
        problems.push(`inbox check failed: ${e instanceof Error ? e.name : 'error'}`);
      }
    }
    for (const p of problems) log(`cleanup problem: ${p}`);
  }
  if (problems.length > 0) throw new Error('cleanup incomplete');
  log('cleanup: notification deleted');
});
