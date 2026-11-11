// Write section: tier none; budget positions=0 notifications=0 ble=0 etl=0; read skips none
// args: --seconds 5
/**
 * 17 - Notifications stream: a live badge console
 *
 * Opens the caller's notification stream for `--seconds` (default 30; Ctrl-C stops earlier), prints each event's
 * type and id (never titles or bodies) and re-fetches the unread badge whenever an event can change it. Read-only.
 */
import type { RtlsClient } from 'ubudu-rtls-sdk';
import { getArg, runExample } from '../shared/config.js';

type Log = (...a: unknown[]) => void;

async function printBadge(client: RtlsClient, log: Log): Promise<void> {
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
  const stop = (): void => controller.abort();
  process.once('SIGINT', stop);
  signal.addEventListener('abort', stop, { once: true });

  await printBadge(client, log);
  const stream = client.notifications
    .stream({ signal: controller.signal })
    .on('error', (error, { fatal }) => log(`${fatal ? 'stopped' : 'retrying'}: ${error.name}`));
  try {
    for await (const event of stream) {
      switch (event.type) {
        case 'open':
          log('open: connected');
          break;
        case 'item':
          log(`item: ${event.data._id ?? event.data.event_id}`);
          await printBadge(client, log);
          break;
        case 'state':
          log(`state: ${event.data.id}`);
          await printBadge(client, log);
          break;
        case 'unread_count':
          log(`unread_count: ${event.data.action} affected ${event.data.affected}`);
          await printBadge(client, log);
          break;
        case 'reconnected':
          log(`reconnected after ${event.data.attempt} failure(s)`);
          await printBadge(client, log);
          break;
      }
    }
  } finally {
    clearTimeout(timer);
    process.off('SIGINT', stop);
    signal.removeEventListener('abort', stop);
  }
  const end = await stream.done;
  if (end.reason === 'error') throw end.error;
  log(`stream ended: ${end.reason}`);
});
