/**
 * Notifications, tier R (P6 §9.1): every read of the domain once, the serializer on an impossible selection, the
 * client guards whose request is excluded live (cleanup-policy and tenant-config PUTs), and the engine-item shape
 * check of UNVERIFIED-4. Response bodies are never logged; observations go to the run facts.
 */
import { beforeAll } from 'vitest';
import {
  AuthorizationError,
  NotFoundError,
  RtlsError,
  ValidationError,
  type NotificationTenantConfig,
  type RtlsClient,
} from '../../../src';
import {
  createLiveClient,
  describeLive,
  getHarness,
  recordFact,
  requestLog,
  runId,
} from '../harness';

const ZERO_ID = '000000000000000000000000';
const SECRET_PATHS = [
  ['email', 'auth', 'pass'],
  ['slack', 'bot_token'],
  ['telegram', 'bot_token'],
  ['whatsapp', 'cloud_api', 'access_token'],
  ['teams', 'azure_app', 'client_secret'],
] as const;

type Settled<T> = { ok: true; value: T } | { ok: false; error: RtlsError };

/** The value, or the SDK error the call rejected with (any other error is rethrown). */
async function settle<T>(promise: Promise<T>): Promise<Settled<T>> {
  try {
    return { ok: true, value: await promise };
  } catch (error) {
    if (error instanceof RtlsError) return { ok: false, error };
    throw error;
  }
}

function at(value: unknown, path: readonly string[]): unknown {
  let current: unknown = value;
  for (const key of path) {
    if (typeof current !== 'object' || current === null) return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

function isRedacted(value: unknown): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as Record<string, unknown>).set === true &&
    typeof (value as Record<string, unknown>).fingerprint === 'string'
  );
}

function isCount(n: unknown): boolean {
  return typeof n === 'number' && Number.isInteger(n) && n >= 0;
}

describeLive(
  'R',
  'notifications read',
  () => {
    describe.sequential('reads', () => {
      let client: RtlsClient;
      let NS: string;
      let MARK: string;
      let adminAvailable = true;

      beforeAll(() => {
        client = createLiveClient();
        NS = getHarness().env.namespace;
        MARK = `sdk-test-${runId()}`;
      });

      it('1 unreadCount() returns two non-negative integers', { timeout: 30_000 }, async () => {
        const count = await client.notifications.unreadCount();
        expect(isCount(count.unread)).toBe(true);
        expect(isCount(count.needs_action)).toBe(true);
      });

      it(
        '2 cleanupPolicy.get() names the caller and the namespace',
        { timeout: 30_000 },
        async () => {
          const policy = await client.notifications.cleanupPolicy.get();
          expect(policy.app_namespace).toBe(NS);
          expect(typeof policy.user_id).toBe('string');
          expect(policy.user_id.length).toBeGreaterThan(0);
          expect(isCount(policy.auto_archive_days)).toBe(true);
          expect(isCount(policy.auto_purge_days)).toBe(true);
          recordFact('notifications.cleanupPolicy.stored', '_id' in policy);
        }
      );

      it('3 facets() has the five groups and seven state counts', { timeout: 30_000 }, async () => {
        const facets = await client.notifications.facets();
        expect(Object.keys(facets)).toEqual(
          expect.arrayContaining(['channel', 'kind', 'severity', 'state', 'zone'])
        );
        expect(Object.keys(facets.state).sort()).toEqual([
          'archived',
          'muted',
          'needs_action',
          'pinned',
          'read',
          'snoozed',
          'unread',
        ]);
        expect(Object.values(facets.state).every(isCount)).toBe(true);
      });

      it('4 list, listPage and listGroups return one page', { timeout: 30_000 }, async () => {
        const items = await client.notifications.list({ limit: 1 });
        expect(Array.isArray(items)).toBe(true);
        expect(items.length).toBeLessThanOrEqual(1);
        expect(items.every((i) => typeof i._id === 'string' && !('group_key' in i))).toBe(true);

        const page = await client.notifications.listPage({ limit: 1 });
        expect(page.items.length).toBeLessThanOrEqual(1);
        expect(page).toMatchObject({ limit: 1, offset: 0 });
        // UNVERIFIED-1 holds (P6-T1 probe): the edge passes X-Total-Count.
        expect(isCount(page.total)).toBe(true);
        recordFact('notifications.totalCount.present', page.total !== undefined);

        const groups = await client.notifications.listGroups({ limit: 1 });
        expect(Array.isArray(groups)).toBe(true);
        expect(groups.length).toBeLessThanOrEqual(1);
        expect(
          groups.every((g) => typeof g.group_key === 'string' && g.group_by === 'thread')
        ).toBe(true);
      });

      it(
        '5 list() with every filter key on an impossible selection is empty',
        { timeout: 30_000 },
        async () => {
          const items = await client.notifications.list({
            zone: -1,
            asset: MARK,
            kind: 'alert',
            severity: 'critical',
            pinned: true,
            from: Date.now() - 3_600_000,
            to: Date.now(),
            state: 'all',
            q: MARK,
          });
          expect(items).toEqual([]);
        }
      );

      it(
        '6 rules, connections and saved views are lists; secrets are redacted',
        { timeout: 30_000 },
        async () => {
          const [rules, connections, views] = await Promise.all([
            client.notifications.rules.list(),
            client.notifications.connections.list(),
            client.notifications.savedViews.list(),
          ]);
          expect(Array.isArray(rules)).toBe(true);
          expect(Array.isArray(views)).toBe(true);
          expect(Array.isArray(connections)).toBe(true);
          const tokens = connections.map((c) => c.credentials?.bot_token);
          expect(tokens.every((t) => t === undefined || isRedacted(t))).toBe(true);
          recordFact('notifications.rules.count', rules.length);
          recordFact('notifications.connections.count', connections.length);
          recordFact('notifications.savedViews.count', views.length);
        }
      );

      it(
        '7 admin.tenantConfig.get() is redacted, or the key has no admin role',
        { timeout: 30_000 },
        async () => {
          const r = await settle(client.notifications.admin.tenantConfig.get());
          expect(r.ok || r.error instanceof AuthorizationError).toBe(true);
          adminAvailable = r.ok;
          recordFact('notifications.admin.available', r.ok);
          const config: NotificationTenantConfig = r.ok ? r.value : { app_namespace: NS };
          expect(config.app_namespace).toBe(NS);
          const secrets = SECRET_PATHS.map((p) => at(config, p));
          expect(secrets.every((s) => s === undefined || isRedacted(s))).toBe(true);
          recordFact('notifications.tenantConfig.stored', '_id' in config);
        }
      );

      it('8 admin.recipientMappings.list() is a list', { timeout: 30_000 }, async () => {
        const r = await settle(client.notifications.admin.recipientMappings.list());
        expect(r.ok ? Array.isArray(r.value) : r.error instanceof AuthorizationError).toBe(true);
        expect(r.ok).toBe(adminAvailable);
        recordFact('notifications.recipientMappings.count', r.ok ? r.value.length : null);
      });

      it('9 get() of an unknown id is NotFoundError not_found', { timeout: 30_000 }, async () => {
        const p = client.notifications.get(ZERO_ID);
        await expect(p).rejects.toBeInstanceOf(NotFoundError);
        await expect(p).rejects.toMatchObject({ status: 404, apiCode: 'not_found' });
      });

      it(
        '10 client guards throw ValidationError and send nothing',
        { timeout: 30_000 },
        async () => {
          const before = requestLog().length;
          await expect(client.notifications.list({ limit: 0 })).rejects.toBeInstanceOf(
            ValidationError
          );
          await expect(
            client.notifications.list({ kind: 'bogus' } as never)
          ).rejects.toBeInstanceOf(ValidationError);
          await expect(client.notifications.listGroups({ q: 'x' } as never)).rejects.toBeInstanceOf(
            ValidationError
          );
          await expect(client.notifications.get('stream')).rejects.toBeInstanceOf(ValidationError);
          await expect(
            client.notifications.cleanupPolicy.replace({ auto_archive_days: 0, auto_purge_days: 0 })
          ).rejects.toBeInstanceOf(ValidationError);
          await expect(client.notifications.admin.tenantConfig.update({})).rejects.toBeInstanceOf(
            ValidationError
          );
          expect(requestLog().length).toBe(before);
        }
      );

      it(
        '11 engine-produced alerts, if any, have the documented references (UNVERIFIED-4)',
        { timeout: 30_000 },
        async () => {
          const items = await client.notifications.list({ state: 'all', kind: 'alert', limit: 5 });
          expect(Array.isArray(items)).toBe(true);
          expect(items.every((i) => typeof i._id === 'string')).toBe(true);
          expect(
            items.every(
              (i) =>
                i.zone === undefined ||
                (typeof i.zone === 'object' && typeof i.zone.id === 'number')
            )
          ).toBe(true);
          expect(
            items.every(
              (i) =>
                i.asset === undefined ||
                (typeof i.asset === 'object' && typeof i.asset.udid === 'string')
            )
          ).toBe(true);
          recordFact('notifications.engineItems.present', items.length);
        }
      );

      // LIVE-TESTING §6: every argument guard of the domain runs live. None of these calls sends a request; a
      // regressed guard would send a request that the harness rejects (tier R admits no write).
      it(
        '12 every other argument guard throws before any request',
        { timeout: 30_000 },
        async () => {
          const n = client.notifications;
          const Z = '000000000000000000000000';
          const before = requestLog().length;
          const refused = [
            () => n.list({ asset: 12 } as never),
            () => n.list({ thread_key: true } as never),
            // A blank selector is refused locally and never sent (USI-P6-4).
            () => n.list({ asset: '  ' }),
            () => n.facets({ thread_key: '' }),
            () => n.bulk({ filter: { thread_key: ' ' }, action: 'read' }),
            () => n.list({ zone: 1.5 }),
            () => n.list({ pinned: 'yes' } as never),
            () => n.list({ from: 'not a date' }),
            () => n.list({ offset: -1 }),
            () => n.facets('state=all' as never),
            () => n.listGroups({ group_by: 'flat' } as never),
            () => n.export({ format: 'xml' } as never),
            () => n.undo(''),
            () => n.send(null as never),
            () => n.send({ recipients: [] }),
            () =>
              n.send({ recipients: [{ target_type: 'user', id: Z }], mission: 'open' as never }),
            () => n.sendToSelf(null as never),
            () => n.bulk('read' as never),
            () => n.bulk({ ids: [Z], thread_key: 'dm:x', action: 'read' } as never),
            () => n.bulk({ thread_key: '  ', action: 'read' }),
            () => n.bulk({ ids: [Z], action: 'nope' } as never),
            () => n.bulk({ ids: [Z], action: 'snooze' } as never),
            () => n.bulk({ filter: { q: 'zone:3 severity:critical' }, action: 'mute' }),
            () => n.bulk({ filter: { from: 0 }, action: 'mute' }),
            () => n.savedViews.create({ name: 'x', query: 'unread' as never }),
            () => n.admin.tenantConfig.update(null as never),
            () => n.admin.recipientMappings.get(''),
          ];
          for (const call of refused) {
            await expect(call()).rejects.toBeInstanceOf(ValidationError);
          }
          expect(requestLog().length).toBe(before);
        }
      );
    });
  },
  { feature: 'notifications' }
);
