// Write section: tier none; budget positions=0 notifications=0 ble=0 etl=0; read skips none
// args: --seconds 5
/**
 * 17 - Notifications stream: a live badge console
 *
 * Opens the caller's notification stream for `--seconds` (default 30; Ctrl-C stops earlier), prints each event's
 * type and id (never titles or bodies) and re-fetches the unread badge whenever an event can change it. Read-only.
 */
import { getArg, runExample } from '../shared/config.js';
/** @import { RtlsClient } from 'ubudu-rtls-sdk' */

/**
 * @param {RtlsClient} client
 * @param {(...a: unknown[]) => void} log
 */
async function printBadge(client, log) {
  const badge = await client.notifications.unreadCount();
  log(`badge: ${badge.unread} unread, ${badge.needs_action} to acknowledge`);
}

await runExample('17-notifications-stream', async ({ client, log, signal }) => {
  const seconds = Number(getArg('seconds', '30'));
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    (Number.isFinite(seconds) ? seconds : 30) * 1000
  );
  const stop = () => controller.abort();
  process.once('SIGINT', stop);
  signal.addEventListener('abort', stop, { once: true });

  /** @type {Error | undefined} */
  let badgeError;
  const refresh = () => {
    printBadge(client, log).catch((error) => {
      badgeError = error;
      controller.abort();
    });
  };

  await printBadge(client, log);
  const stream = client.notifications
    .stream({ signal: controller.signal })
    .on('open', () => log('open: connected'))
    .on('item', (event) => {
      log(`item: ${event.data._id ?? event.data.event_id}`);
      refresh();
    })
    .on('state', (event) => {
      log(`state: ${event.data.id}`);
      refresh();
    })
    .on('unread_count', (event) => {
      log(`unread_count: ${event.data.action} affected ${event.data.affected}`);
      refresh();
    })
    .on('reconnected', (event) => {
      log(`reconnected after ${event.data.attempt} failure(s)`);
      refresh();
    })
    .on('error', (error, { fatal }) => log(`${fatal ? 'stopped' : 'retrying'}: ${error.name}`));

  const end = await stream.done;
  clearTimeout(timer);
  process.off('SIGINT', stop);
  signal.removeEventListener('abort', stop);
  if (badgeError !== undefined) throw badgeError;
  if (end.reason === 'error') throw end.error;
  log(`stream ended: ${end.reason}`);
});
