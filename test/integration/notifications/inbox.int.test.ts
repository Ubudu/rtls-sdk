/**
 * Notifications inbox, tiers S + W (P6 §9.3): three self-sends (budget 3 of 5, in-app only, no channels), then
 * every read, triage, bulk and undo path on those items only, with the live stream watching. Each step is one
 * test; a failing step skips the rest (step 9 excepted: it settles UNVERIFIED-5 and leaves no state), and step 23
 * always runs the cleanup. Bulk selections are the run's ids or thread keys (`dm:` / `mission:` +
 * `sdk-test-<runId>-…`). Item content is never logged.
 */
import { afterAll, beforeAll, beforeEach } from 'vitest';
import {
  ConflictError,
  NotFoundError,
  ValidationError,
  type NotificationItem,
  type NotificationStream,
  type NotificationStreamEvent,
  type RtlsClient,
} from '../../../src';
import {
  budgetReport,
  createLiveClient,
  describeLive,
  expectKnownServerIssue,
  recordFact,
  registerCleanup,
  requestLog,
  runCleanup,
  runId,
  testName,
} from '../harness';
import type { SkipContext } from '../harness';

/** Skips the running test with its reason (guard skips, no undo store, no admin role, a cap that would clamp). */
function skipStep(ctx: SkipContext, reason: string): void {
  ctx.skip(reason);
}

type EventOf<T extends NotificationStreamEvent['type']> = Extract<
  NotificationStreamEvent,
  { type: T }
>;

const CSV_HEADER =
  '_id,created_at,kind,severity,title,read,acknowledged,archived,thread_key,zone_name,asset_name';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function ids(items: readonly { _id: string }[]): string[] {
  return items.map((i) => i._id).sort();
}

function bulkDeleteCleanup(label: string, id: string): void {
  registerCleanup({
    label: `notification ${label}`,
    request: {
      method: 'POST',
      path: '/notifications/{ns}/bulk',
      body: { ids: [id], action: 'delete' },
    },
    verify: { path: `/notifications/{ns}/${id}` },
  });
}

function posts(suffix: string): number {
  return requestLog().filter((e) => e.method === 'POST' && e.path.endsWith(suffix)).length;
}

describeLive(
  'S',
  'notifications inbox',
  () => {
    describe.sequential('inbox', () => {
      let client: RtlsClient;
      let selfId: string;
      let DM: string;
      let MISSION: string;
      let usedAtStart: number;
      let dmA: NotificationItem;
      let dmB: NotificationItem;
      let m: NotificationItem;
      let broken = false;
      let stream: NotificationStream | undefined;
      const events: NotificationStreamEvent[] = [];
      const controller = new AbortController();
      let deadline: ReturnType<typeof setTimeout> | undefined;

      /** The first event of `type` at index ≥ `from` that `match` accepts, polled every 100 ms up to `ms`. */
      async function waitForEvent<T extends NotificationStreamEvent['type']>(
        type: T,
        match: (event: EventOf<T>) => boolean,
        from: number,
        ms: number
      ): Promise<EventOf<T> | undefined> {
        const end = Date.now() + ms;
        for (;;) {
          const found = events
            .slice(from)
            .find((e): e is EventOf<T> => e.type === type && match(e as EventOf<T>));
          if (found !== undefined || Date.now() >= end) return found;
          await sleep(100);
        }
      }

      beforeAll(async () => {
        client = createLiveClient();
        selfId = (await client.notifications.cleanupPolicy.get()).user_id;
        DM = testName('dm');
        MISSION = testName('mission');
        usedAtStart = budgetReport().notifications.used;
      });

      beforeEach((ctx) => {
        const always = ctx.task.name.startsWith('23 ');
        if (broken && !always) {
          skipStep(ctx, 'an earlier step failed');
          return;
        }
        const blocking = !ctx.task.name.startsWith('9 ');
        ctx.onTestFailed(() => {
          if (blocking) broken = true;
        });
      });

      afterAll(() => {
        if (deadline !== undefined) clearTimeout(deadline);
        controller.abort();
      });

      it('0 opens the stream', { timeout: 30_000 }, async () => {
        deadline = setTimeout(() => controller.abort(), 120_000);
        stream = client.notifications.stream({ signal: controller.signal });
        for (const type of ['open', 'item', 'state', 'unread_count', 'reconnected'] as const) {
          stream.on(type, (event) => {
            events.push(event);
          });
        }
        const open = await waitForEvent('open', () => true, 0, 10_000);
        expect(open?.type).toBe('open');
      });

      it('1 sendToSelf() a direct message', { timeout: 30_000 }, async () => {
        dmA = await client.notifications.sendToSelf({
          kind: 'direct_message',
          title: testName('dm-a'),
          body: 'SDK integration test',
          severity: 'info',
          conversation_id: DM,
        });
        bulkDeleteCleanup('dm-a', dmA._id);
        expect(dmA.user_id).toBe(selfId);
        expect(dmA.thread_key).toBe(`dm:${DM}`);
        expect(dmA.read).toBe(false);
        expect(dmA.pinned).toBe(false);
        expect(dmA.snooze_until).toBeNull();
        await expectKnownServerIssue('USI-P6-1', 'sent items carry source operator', () =>
          expect(dmA.source).toBe('operator')
        );
        expect(budgetReport().notifications.used - usedAtStart).toBe(1);
      });

      it('2 the stream delivers the item (UNVERIFIED-6)', { timeout: 30_000 }, async () => {
        const event = await waitForEvent('item', (e) => e.data._id === dmA._id, 0, 15_000);
        recordFact('notifications.stream.itemDelivered', event !== undefined);
        expect(event?.data._id).toBe(dmA._id);
      });

      it('3 send() a mission to self', { timeout: 30_000 }, async () => {
        const created = await client.notifications.send({
          kind: 'mission',
          recipients: [{ target_type: 'user', id: selfId }],
          title: testName('mission'),
          mission: { status: 'open', due: Date.now() + 3_600_000 },
          mission_id: MISSION,
        });
        for (const item of created) bulkDeleteCleanup('mission', item._id);
        expect(created).toHaveLength(1);
        m = created[0] as NotificationItem;
        expect(m.thread_key).toBe(`mission:${MISSION}`);
        expect(m.mission?.status).toBe('open');
        expect(typeof m.mission?.due).toBe('number');
        expect(budgetReport().notifications.used - usedAtStart).toBe(2);
      });

      it(
        '4 a second sendToSelf() reuses the cached identity and the thread',
        { timeout: 30_000 },
        async () => {
          dmB = await client.notifications.sendToSelf({
            title: testName('dm-b'),
            conversation_id: DM,
          });
          bulkDeleteCleanup('dm-b', dmB._id);
          expect(dmB.thread_key).toBe(dmA.thread_key);
          const lookups = requestLog().filter(
            (e) => e.method === 'GET' && e.path.endsWith('/cleanup-policy')
          );
          expect(lookups).toHaveLength(0);
          expect(budgetReport().notifications.used - usedAtStart).toBe(3);
        }
      );

      it('5 get() returns the sent item', { timeout: 30_000 }, async () => {
        const item = await client.notifications.get(dmA._id);
        const pick = (i: NotificationItem) => ({
          _id: i._id,
          kind: i.kind,
          title: i.title,
          thread_key: i.thread_key,
          created_at: i.created_at,
        });
        expect(pick(item)).toEqual(pick(dmA));
      });

      it('6 list() and listPage() of the thread', { timeout: 30_000 }, async () => {
        const items = await client.notifications.list({ thread_key: `dm:${DM}`, state: 'all' });
        expect(ids(items)).toEqual(ids([dmA, dmB]));
        expect(items.every((i) => typeof i._id === 'string' && !('group_key' in i))).toBe(true);
        const page = await client.notifications.listPage({
          thread_key: `dm:${DM}`,
          state: 'all',
          limit: 1,
        });
        expect(page.items).toHaveLength(1);
        expect(page.total).toBe(2);
      });

      it(
        '7 iterate() de-duplicates a page shifted by a pin and misses the moved item',
        { timeout: 30_000 },
        async () => {
          const it7 = client.notifications.iterate({
            thread_key: `dm:${DM}`,
            state: 'all',
            limit: 1,
          });
          const yielded: string[] = [];
          const first = await it7.next();
          if (!first.done) yielded.push(first.value._id);
          await client.notifications.pin(dmA._id);
          for (let next = await it7.next(); !next.done; next = await it7.next()) {
            yielded.push(next.value._id);
          }
          await client.notifications.unpin(dmA._id);
          expect(yielded).toEqual([dmB._id]);
        }
      );

      it('8 listGroups() by thread and by type', { timeout: 30_000 }, async () => {
        const byThread = await client.notifications.listGroups({
          thread_key: `dm:${DM}`,
          state: 'all',
        });
        expect(byThread).toHaveLength(1);
        expect(byThread[0]?.group_key).toBe(`dm:${DM}`);
        expect(byThread[0]?.count).toBe(2);
        expect(byThread[0]?.item_ids).toEqual(expect.arrayContaining([dmA._id, dmB._id]));
        const byType = await client.notifications.listGroups({
          group_by: 'type',
          thread_key: `mission:${MISSION}`,
          state: 'all',
        });
        expect(byType.map((g) => g.group_key)).toEqual(['mission']);
      });

      it(
        '9 full-text search finds the items by the run id (UNVERIFIED-5)',
        { timeout: 30_000 },
        async () => {
          let qIds: string[] = [];
          for (let attempt = 0; attempt < 3; attempt += 1) {
            qIds = (await client.notifications.list({ q: runId(), state: 'all' })).map(
              (i) => i._id
            );
            if (qIds.includes(dmA._id) && qIds.includes(dmB._id)) break;
            await sleep(1000);
          }
          recordFact(
            'notifications.search.runToken',
            qIds.includes(dmA._id) && qIds.includes(dmB._id)
          );
          expect(qIds).toEqual(expect.arrayContaining([dmA._id, dmB._id]));
        }
      );

      it('10 facets() of the thread', { timeout: 30_000 }, async () => {
        const facets = await client.notifications.facets({ thread_key: `dm:${DM}`, state: 'all' });
        expect(facets.kind.direct_message).toBe(2);
        expect(facets.state.unread).toBe(2);
      });

      it('11 export() of the thread as CSV and JSON', { timeout: 30_000 }, async () => {
        const csv = await client.notifications.export({
          format: 'csv',
          thread_key: `dm:${DM}`,
          state: 'all',
        });
        expect(csv.split('\n')[0]).toBe(CSV_HEADER);
        expect(csv).toContain(dmA._id);
        expect(csv).toContain(dmB._id);
        const json = await client.notifications.export({
          format: 'json',
          thread_key: `dm:${DM}`,
          state: 'all',
        });
        expect(ids(json)).toEqual(ids([dmA, dmB]));
      });

      it(
        '12 markRead() twice re-stamps read_at and emits a state event',
        { timeout: 30_000 },
        async () => {
          const from = events.length;
          const r1 = await client.notifications.markRead(dmA._id);
          const r2 = await client.notifications.markRead(dmA._id);
          expect(r1.read).toBe(true);
          expect(r2.read).toBe(true);
          expect(typeof r1.read_at).toBe('number');
          expect(r2.read_at ?? 0).toBeGreaterThanOrEqual(r1.read_at ?? Infinity);
          const event = await waitForEvent('state', (e) => e.data.id === dmA._id, from, 10_000);
          expect(event?.data).toMatchObject({ id: dmA._id, read: true });
        }
      );

      it(
        '13 acknowledge(): a direct message is not actionable, a mission is',
        { timeout: 30_000 },
        async () => {
          const refused = client.notifications.acknowledge(dmA._id);
          await expect(refused).rejects.toBeInstanceOf(ConflictError);
          await expect(refused).rejects.toMatchObject({ status: 409, apiCode: 'not_actionable' });
          const acked = await client.notifications.acknowledge(m._id);
          expect(acked.acknowledged).toBe(true);
          expect(acked.acked_by).toBe(selfId);
        }
      );

      it(
        '14 updateMission() statuses, a non-mission and a bad status',
        { timeout: 30_000 },
        async () => {
          expect(
            (await client.notifications.updateMission(m._id, 'in_progress')).mission?.status
          ).toBe('in_progress');
          expect((await client.notifications.updateMission(m._id, 'done')).mission?.status).toBe(
            'done'
          );
          const notMission = client.notifications.updateMission(dmA._id, 'done');
          await expect(notMission).rejects.toBeInstanceOf(ConflictError);
          await expect(notMission).rejects.toMatchObject({ apiCode: 'not_a_mission' });
          const bad = client.notifications.updateMission(m._id, 'bogus' as never);
          await expect(bad).rejects.toBeInstanceOf(ValidationError);
          await expect(bad).rejects.toMatchObject({ status: 400 });
        }
      );

      it('15 pin() and unpin()', { timeout: 30_000 }, async () => {
        expect((await client.notifications.pin(dmB._id)).pinned).toBe(true);
        expect((await client.notifications.unpin(dmB._id)).pinned).toBe(false);
      });

      it(
        '16 snooze() is a marker: the item stays in the default list',
        { timeout: 30_000 },
        async () => {
          await client.notifications.snooze(dmB._id, Date.now() + 600_000);
          const snoozed = await client.notifications.list({
            state: 'snoozed',
            thread_key: `dm:${DM}`,
          });
          expect(snoozed.map((i) => i._id)).toContain(dmB._id);
          const defaultIds = (await client.notifications.list({ thread_key: `dm:${DM}` })).map(
            (i) => i._id
          );
          await expectKnownServerIssue('USI-P6-5', 'snoozed items stay in the default list', () =>
            expect(defaultIds).toContain(dmB._id)
          );
          await client.notifications.snooze(dmB._id, 0);
          const after = await client.notifications.list({
            state: 'snoozed',
            thread_key: `dm:${DM}`,
          });
          expect(after.map((i) => i._id)).not.toContain(dmB._id);
        }
      );

      it(
        '17 bulk archive by ids, undo, and a used token (UNVERIFIED-3)',
        { timeout: 30_000 },
        async () => {
          const r = await client.notifications.bulk({ ids: [dmA._id, dmB._id], action: 'archive' });
          expect(r.affected).toBe(2);
          recordFact('notifications.undo.available', typeof r.undo_token === 'string');
          const token = r.undo_token;
          // UNVERIFIED-3 holds (the server keeps an undo store): a bulk change without a token is a failure.
          if (token === undefined) throw new Error('bulk returned no undo_token (UNVERIFIED-3)');
          expect((await client.notifications.undo(token)).restored).toBe(2);
          expect(
            await client.notifications.list({ state: 'archived', thread_key: `dm:${DM}` })
          ).toEqual([]);
          const again = client.notifications.undo(token);
          await expect(again).rejects.toBeInstanceOf(NotFoundError);
          await expect(again).rejects.toMatchObject({ apiCode: 'undo_unavailable' });
        }
      );

      it(
        '18 bulk read by thread_key; the stream reports the action, not counts',
        { timeout: 30_000 },
        async () => {
          const from = events.length;
          const r = await client.notifications.bulk({ thread_key: `dm:${DM}`, action: 'read' });
          expect(r.affected).toBe(2);
          expect(
            await client.notifications.list({ state: 'unread', thread_key: `dm:${DM}` })
          ).toEqual([]);
          const event = await waitForEvent(
            'unread_count',
            (e) => e.data.action === 'read',
            from,
            10_000
          );
          expect(event?.type).toBe('unread_count');
          await expectKnownServerIssue(
            'USI-P6-3',
            'the stream unread_count event carries the bulk action and the changed count, not unread counts',
            () => expect(event?.data).toEqual({ action: 'read', affected: 2 })
          );
        }
      );

      it(
        '19 bulk pin by filter, snooze, mute and acknowledge by ids',
        { timeout: 30_000 },
        async () => {
          const pinned = await client.notifications.bulk({
            filter: { thread_key: `mission:${MISSION}`, state: 'all' },
            action: 'pin',
          });
          expect(pinned.affected).toBe(1);
          const snoozed = await client.notifications.bulk({
            ids: [m._id],
            action: 'snooze',
            snooze_until: Date.now() + 60_000,
          });
          expect(snoozed.affected).toBe(1);
          expect((await client.notifications.bulk({ ids: [m._id], action: 'mute' })).affected).toBe(
            1
          );
          const acked = await client.notifications.bulk({
            ids: [dmA._id, dmB._id],
            action: 'acknowledge',
          });
          expect(acked.affected).toBe(0);
        }
      );

      it(
        '20 bulk guards refuse non-selective and oversized selections locally',
        { timeout: 30_000 },
        async () => {
          await expect(
            client.notifications.bulk({ filter: {}, action: 'mute' } as never)
          ).rejects.toBeInstanceOf(ValidationError);
          await expect(
            client.notifications.bulk({ filter: { state: 'all' }, action: 'mute' })
          ).rejects.toBeInstanceOf(ValidationError);
          await expect(
            client.notifications.bulk({ ids: [], action: 'read' })
          ).rejects.toBeInstanceOf(ValidationError);
          await expect(
            client.notifications.bulk({ ids: Array<string>(1000).fill(dmA._id), action: 'read' })
          ).rejects.toBeInstanceOf(ValidationError);
          expect(posts('/bulk')).toBe(0);
        }
      );

      it('21 archive() one item', { timeout: 30_000 }, async () => {
        expect((await client.notifications.archive(dmB._id)).archived).toBe(true);
      });

      it('22 bulk delete, undo, delete again', { timeout: 30_000 }, async () => {
        const all = [dmA._id, dmB._id, m._id];
        const d = await client.notifications.bulk({ ids: all, action: 'delete' });
        expect(d.affected).toBe(3);
        await expect(client.notifications.get(dmA._id)).rejects.toBeInstanceOf(NotFoundError);
        const token = d.undo_token;
        if (token === undefined) throw new Error('bulk returned no undo_token (UNVERIFIED-3)');
        expect((await client.notifications.undo(token)).restored).toBe(3);
        expect((await client.notifications.get(dmA._id))._id).toBe(dmA._id);
        expect((await client.notifications.bulk({ ids: all, action: 'delete' })).affected).toBe(3);
      });

      it(
        '23 cleanup: no run item is left and the stream ends aborted',
        { timeout: 60_000 },
        async () => {
          const cleanup = await runCleanup();
          expect(cleanup.failed).toEqual([]);
          controller.abort();
          const end = stream === undefined ? { reason: 'aborted' } : await stream.done;
          expect(end).toEqual({ reason: 'aborted' });
          expect(await client.notifications.list({ thread_key: `dm:${DM}`, state: 'all' })).toEqual(
            []
          );
          expect(
            await client.notifications.list({ thread_key: `mission:${MISSION}`, state: 'all' })
          ).toEqual([]);
          const left = (await client.notifications.list({ q: runId(), state: 'all' })).filter((i) =>
            (i.title ?? '').startsWith(`sdk-test-${runId()}`)
          );
          expect(left).toEqual([]);
        }
      );
    });
  },
  { requires: ['W'], feature: 'notifications' }
);
