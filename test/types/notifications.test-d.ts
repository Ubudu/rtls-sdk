// Type-level tests of the notifications domain (P6 §8.2). Not collected by vitest (the unit config excludes
// test/types/**); `npm run typecheck` compiles this file, so every `expectTypeOf` and every `@ts-expect-error` below
// is checked by the compiler. Everything sits in `typeOnly`, which nothing calls: importing this file sends nothing.
import { expectTypeOf } from 'vitest';
import type {
  NotificationConnectionTestResult,
  NotificationExportQuery,
  NotificationItem,
  NotificationRule,
  NotificationStreamEnd,
  NotificationStreamEvent,
  OffsetPage,
  RtlsClient,
  RtlsError,
} from '../../src';

export function typeOnly(client: RtlsClient): void {
  const n = client.notifications;
  const a = '65f000000000000000000001';
  const signal = new AbortController().signal;

  // listGroups: no free text (it forces flat results) and no 'flat'.
  // @ts-expect-error q is not part of NotificationGroupQuery
  void n.listGroups({ q: 'x' });
  // @ts-expect-error 'flat' is not a group_by of listGroups
  void n.listGroups({ group_by: 'flat' });
  void n.listGroups({ group_by: 'zone', state: 'unread' });

  // bulk: snooze needs snooze_until; one selector only.
  // @ts-expect-error snooze without snooze_until
  void n.bulk({ ids: [a], action: 'snooze' });
  // @ts-expect-error ids and thread_key together
  void n.bulk({ ids: [a], thread_key: 'x', action: 'read' });
  void n.bulk({ ids: [a], action: 'snooze', snooze_until: new Date() });
  void n.bulk({ filter: { state: 'unread' }, action: 'read' });

  // rules.create: enabled is required.
  // @ts-expect-error enabled is missing
  void n.rules.create({ name: 'n' });
  expectTypeOf(n.rules.create({ enabled: false })).resolves.toEqualTypeOf<NotificationRule>();

  // send: only user recipients are resolved by the server.
  // @ts-expect-error role recipients are not exposed
  void n.send({ recipients: [{ target_type: 'role', id: 'r' }] });

  // connections.upsert: email needs credentials.
  // @ts-expect-error email without credentials
  void n.connections.upsert({ channel: 'email' });
  void n.connections.upsert({ channel: 'email', credentials: { address: 'a' } });
  expectTypeOf(n.connections.test(a)).resolves.toEqualTypeOf<NotificationConnectionTestResult>();

  // stream: signal is required.
  // @ts-expect-error signal is missing
  n.stream({});

  // cleanupPolicy.replace: both fields are required.
  // @ts-expect-error auto_purge_days is missing
  void n.cleanupPolicy.replace({ auto_archive_days: 1 });

  // export overloads.
  expectTypeOf(n.export({ format: 'csv' })).resolves.toEqualTypeOf<string>();
  expectTypeOf(n.export({ format: 'json' })).resolves.toEqualTypeOf<NotificationItem[]>();
  expectTypeOf(n.export()).resolves.toEqualTypeOf<NotificationItem[]>();
  // A format chosen at run time (the exported NotificationExportQuery) resolves to the union.
  const exportQuery: NotificationExportQuery = { format: Math.random() > 0.5 ? 'csv' : 'json' };
  expectTypeOf(n.export(exportQuery)).resolves.toEqualTypeOf<string | NotificationItem[]>();

  expectTypeOf(n.listPage()).resolves.toEqualTypeOf<OffsetPage<NotificationItem>>();
  expectTypeOf(n.sendToSelf({ title: 't' })).resolves.toEqualTypeOf<NotificationItem>();
  expectTypeOf(n.rules.delete(a)).resolves.toEqualTypeOf<void>();

  // The stream: typed listeners, the iterator and done.
  const stream = n.stream({ signal });
  stream.on('item', (event) => {
    expectTypeOf(event).toEqualTypeOf<Extract<NotificationStreamEvent, { type: 'item' }>>();
    expectTypeOf(event.data.event_id).toEqualTypeOf<string>();
  });
  stream.on('reconnected', (event) => {
    expectTypeOf(event.data.attempt).toEqualTypeOf<number>();
  });
  stream.on('error', (error, info) => {
    expectTypeOf(error).toEqualTypeOf<RtlsError>();
    expectTypeOf(info.fatal).toEqualTypeOf<boolean>();
  });
  expectTypeOf(stream.done).resolves.toEqualTypeOf<NotificationStreamEnd>();
  expectTypeOf(stream).toMatchTypeOf<AsyncIterable<NotificationStreamEvent>>();
}
