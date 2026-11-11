/**
 * Notification settings, tiers W and C (P6 §9.4). W: a disabled inert rule and a saved view (named with the run
 * prefix, removed by registered cleanups), the connection calls that cannot create state, an `email` connection
 * without address under the existing-entity guard (422 test path only, nothing is sent), and the recipient-mapping
 * calls that end in 404/403 before anything is written. C (config lock): one disabled inert recipient mapping
 * under the existing-entity guard, and the cleanup-policy and tenant-config rewrites inside `configCycle` (both
 * skip while nothing is stored). The connection and the mapping are deleted in their guarded body's `finally`,
 * never through `registerCleanup`.
 */
import { beforeAll } from 'vitest';
import {
  AuthorizationError,
  NotFoundError,
  RtlsError,
  ValidationError,
  type NotificationCleanupPolicy,
  type NotificationTenantConfig,
  type RtlsClient,
} from '../../../src';
import {
  configCycle,
  createLiveClient,
  describeLive,
  expectDeepEqualRedacted,
  expectKnownServerIssue,
  registerCleanup,
  requestLog,
  runId,
  testName,
  withConfigLock,
  withExistingEntityGuard,
} from '../harness';
import type { SkipContext } from '../harness';

/** Skips the running test with its reason (guard skips, no undo store, no admin role, a cap that would clamp). */
function skipStep(ctx: SkipContext, reason: string): void {
  ctx.skip(reason);
}

const Z = '000000000000000000000000';
const SECRET_PATHS = [
  ['email', 'auth', 'pass'],
  ['slack', 'bot_token'],
  ['telegram', 'bot_token'],
  ['whatsapp', 'cloud_api', 'access_token'],
  ['teams', 'azure_app', 'client_secret'],
] as const;

type Settled<T> = { ok: true; value: T } | { ok: false; error: RtlsError };

async function settle<T>(promise: Promise<T>): Promise<Settled<T>> {
  try {
    return { ok: true, value: await promise };
  } catch (error) {
    if (error instanceof RtlsError) return { ok: false, error };
    throw error;
  }
}

/** A 404 on a cleanup delete means the entity is already gone. */
function rethrowUnlessNotFound(error: unknown): void {
  if (error instanceof NotFoundError) return;
  throw error;
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

describeLive(
  'W',
  'notifications settings',
  () => {
    describe.sequential('settings', () => {
      let client: RtlsClient;
      let selfId: string;
      let DM: string;
      let MARK: string;
      let U: string;
      let adminAvailable = true;
      let connectionIdsBefore: string[] = [];

      beforeAll(async () => {
        client = createLiveClient();
        selfId = (await client.notifications.cleanupPolicy.get()).user_id;
        DM = testName('dm');
        MARK = `sdk-test-${runId()}`;
        U = testName('missing');
      });

      it('rules: create disabled, read, update, delete', { timeout: 60_000 }, async () => {
        const rules = client.notifications.rules;
        const name = testName('rule');
        const rule = await rules.create({
          enabled: false,
          name,
          match: { kinds: ['alert'], min_severity: 'critical', event_types: [MARK] },
          channels: ['inapp'],
          throttle: { coalesce_seconds: 0 },
        });
        registerCleanup({
          label: 'notification rule',
          request: { method: 'DELETE', path: `/notifications/{ns}/rules/${rule._id}` },
          verify: { path: `/notifications/{ns}/rules/${rule._id}` },
        });
        expect(rule).toMatchObject({ name, enabled: false, channels: ['inapp'] });
        expect(await rules.get(rule._id)).toEqual(rule);
        expect((await rules.list()).map((r) => r._id)).toContain(rule._id);

        const renamed = await rules.update(rule._id, {
          name: `${name}-renamed`,
          throttle: { coalesce_seconds: 60 },
        });
        expect(renamed).toMatchObject({
          name: `${name}-renamed`,
          enabled: false,
          throttle: { coalesce_seconds: 60 },
        });
        const r = await rules.update(rule._id, { channels: [] });
        await expectKnownServerIssue('USI-P6-9', 'rule PATCH ignores channels: []', () =>
          expect(r.channels).toEqual(['inapp'])
        );
        const invalid = rules.update(rule._id, { channels: ['fax'] as never });
        await expect(invalid).rejects.toBeInstanceOf(ValidationError);
        await expect(invalid).rejects.toMatchObject({ status: 400 });

        const before = requestLog().length;
        await expect(rules.create({ name: 'x' } as never)).rejects.toBeInstanceOf(ValidationError);
        expect(requestLog().length).toBe(before);

        await rules.delete(rule._id);
        await expect(rules.get(rule._id)).rejects.toBeInstanceOf(NotFoundError);
        await expect(rules.delete(rule._id)).rejects.toBeInstanceOf(NotFoundError);
      });

      it('saved views: create, read, blank-name guard, delete', { timeout: 60_000 }, async () => {
        const views = client.notifications.savedViews;
        const query = { state: 'unread', severity: 'critical', thread_key: `dm:${DM}` } as const;
        const view = await views.create({ name: testName('view'), query });
        registerCleanup({
          label: 'notification saved view',
          request: { method: 'DELETE', path: `/notifications/{ns}/saved-views/${view._id}` },
          verify: { path: `/notifications/{ns}/saved-views/${view._id}` },
        });
        expect(view.name).toBe(testName('view'));
        expect(view.query).toEqual(query);
        expect(await views.get(view._id)).toEqual(view);
        expect((await views.list()).map((v) => v._id)).toContain(view._id);

        const before = requestLog().length;
        await expect(views.create({ name: '   ' })).rejects.toBeInstanceOf(ValidationError);
        expect(requestLog().length).toBe(before);

        await views.delete(view._id);
        await expect(views.get(view._id)).rejects.toBeInstanceOf(NotFoundError);
      });

      it('connections: calls that cannot create state', { timeout: 60_000 }, async () => {
        const connections = client.notifications.connections;
        connectionIdsBefore = (await connections.list()).map((c) => c._id).sort();
        const invalid = connections.upsert({ channel: 'fax' } as never);
        await expect(invalid).rejects.toBeInstanceOf(ValidationError);
        await expect(invalid).rejects.toMatchObject({ status: 400, apiCode: 'bad_request' });
        await expect(connections.get(Z)).rejects.toBeInstanceOf(NotFoundError);
        await expect(connections.test(Z)).rejects.toBeInstanceOf(NotFoundError);
        await expect(connections.delete(Z)).rejects.toBeInstanceOf(NotFoundError);
      });

      it(
        'connections: an email connection without address, tested on the 422 path',
        { timeout: 60_000 },
        async (ctx) => {
          const connections = client.notifications.connections;
          await withExistingEntityGuard(
            ctx,
            'notification-connections',
            () => connections.list(),
            (c) => c.channel === 'email',
            async () => {
              let id: string | undefined;
              let deleted = false;
              try {
                const created = await connections.upsert({
                  channel: 'email',
                  credentials: {},
                } as never);
                id = created._id;
                expect(created.channel).toBe('email');
                expect(created.verified).toBe(false);
                expect(await connections.get(id)).toEqual(created);
                expect((await connections.list()).map((c) => c._id)).toContain(id);
                const result = await connections.test(id);
                expect(result).toMatchObject({
                  verified: false,
                  delivery: { channel: 'email', status: 'skipped', error: 'not_connected' },
                });
                expect((await connections.get(id)).verified).toBe(false);
                await connections.delete(id);
                deleted = true;
                await expect(connections.get(id)).rejects.toBeInstanceOf(NotFoundError);
              } finally {
                if (id !== undefined && !deleted) {
                  await connections.delete(id).catch(rethrowUnlessNotFound);
                }
              }
            }
          );
        }
      );

      it('connections: the list ends as it began', { timeout: 30_000 }, async () => {
        const after = (await client.notifications.connections.list()).map((c) => c._id).sort();
        expect(after).toEqual(connectionIdsBefore);
      });

      it(
        'recipient mappings: unknown ids and an invalid create write nothing',
        { timeout: 60_000 },
        async () => {
          const mappings = client.notifications.admin.recipientMappings;
          const listed = await settle(mappings.list());
          expect(listed.ok || listed.error instanceof AuthorizationError).toBe(true);
          adminAvailable = listed.ok;
          const expected = adminAvailable ? NotFoundError : AuthorizationError;
          await expect(mappings.get(U)).rejects.toBeInstanceOf(expected);
          await expect(mappings.update(U, { channels: ['inapp'] })).rejects.toBeInstanceOf(
            expected
          );
          await expect(mappings.delete(U)).rejects.toBeInstanceOf(expected);
          const before = requestLog().length;
          await expect(mappings.create({ match: {} } as never)).rejects.toBeInstanceOf(
            ValidationError
          );
          expect(requestLog().length).toBe(before);
        }
      );

      describeLive(
        'C',
        'notifications settings config',
        () => {
          it(
            'recipient mappings: one disabled inert entry, removed again',
            { timeout: 120_000 },
            async (ctx) => {
              const mappings = client.notifications.admin.recipientMappings;
              const access = await settle(mappings.list());
              expect(access.ok || access.error instanceof AuthorizationError).toBe(true);
              if (!access.ok) {
                skipStep(ctx, 'admin unavailable for this key');
                return;
              }
              await withConfigLock(() =>
                withExistingEntityGuard(
                  ctx,
                  'recipient-mappings',
                  () => mappings.list(),
                  () => true,
                  async () => {
                    let id: string | undefined;
                    let deleted = false;
                    try {
                      const created = await mappings.create({
                        enabled: false,
                        match: { kinds: ['alert'], event_types: [MARK] },
                        recipients: { user_ids: [selfId] },
                        channels: ['inapp'],
                      });
                      id = created.id;
                      expect(created.id).toMatch(/^map_\d+_\d+$/);
                      expect(created.enabled).toBe(false);
                      expect(await mappings.get(id)).toEqual(created);
                      expect(await mappings.list()).toEqual([created]);
                      const merged = await mappings.update(id, {
                        match: { kinds: ['alert'], min_severity: 'critical', event_types: [MARK] },
                      });
                      expect(merged).toMatchObject({
                        id,
                        enabled: false,
                        match: { kinds: ['alert'], min_severity: 'critical', event_types: [MARK] },
                        channels: ['inapp'],
                      });
                      const invalid = mappings.update(id, { channels: ['fax'] as never });
                      await expect(invalid).rejects.toBeInstanceOf(ValidationError);
                      await expect(invalid).rejects.toMatchObject({ status: 400 });
                      await mappings.delete(id);
                      deleted = true;
                      await expect(mappings.get(id)).rejects.toBeInstanceOf(NotFoundError);
                      expect(await mappings.list()).toEqual([]);
                    } finally {
                      if (id !== undefined && !deleted) {
                        await mappings.delete(id).catch(rethrowUnlessNotFound);
                      }
                    }
                  },
                  { onFailure: 'abort' }
                )
              );
            }
          );

          it(
            'cleanup policy: the stored values are written back unchanged',
            { timeout: 120_000 },
            async (ctx) => {
              const policy = client.notifications.cleanupPolicy;
              await configCycle<NotificationCleanupPolicy>(
                ctx,
                'notification-cleanup-policy',
                async (cycle) => {
                  const tenant = await settle(client.notifications.admin.tenantConfig.get());
                  const cap = tenant.ok ? tenant.value.cleanup_cap : undefined;
                  const clamps =
                    !tenant.ok ||
                    (cap?.max_archive_days !== undefined &&
                      cycle.before.auto_archive_days > cap.max_archive_days) ||
                    (cap?.max_purge_days !== undefined &&
                      cycle.before.auto_purge_days > cap.max_purge_days);
                  if (clamps) {
                    skipStep(ctx, 'tenant cap unreadable or it would clamp the stored values');
                    return;
                  }
                  await policy.replace({
                    auto_archive_days: cycle.before.auto_archive_days,
                    auto_purge_days: cycle.before.auto_purge_days,
                  });
                  const after = await policy.get();
                  expect([after.auto_archive_days, after.auto_purge_days]).toEqual([
                    cycle.before.auto_archive_days,
                    cycle.before.auto_purge_days,
                  ]);
                },
                {
                  restoreWith: async (b) => {
                    await policy.replace({
                      auto_archive_days: b.auto_archive_days,
                      auto_purge_days: b.auto_purge_days,
                    });
                  },
                }
              );
            }
          );

          it(
            'tenant config: the stored document is written back unchanged',
            { timeout: 120_000 },
            async (ctx) => {
              const tenantConfig = client.notifications.admin.tenantConfig;
              await configCycle<NotificationTenantConfig>(
                ctx,
                'notification-tenant-config',
                async (cycle) => {
                  const secrets = SECRET_PATHS.map((p) => at(cycle.before, p));
                  expect(secrets.every((s) => s === undefined || isRedacted(s))).toBe(true);
                  await tenantConfig.update(cycle.before);
                  expectDeepEqualRedacted(await tenantConfig.get(), cycle.before, 'tenant-config', {
                    ignorePaths: ['updated_at'],
                  });
                },
                {
                  restoreWith: async (b) => {
                    await tenantConfig.update(b);
                  },
                }
              );
            }
          );
        },
        { feature: 'notifications' }
      );
    });
  },
  { feature: 'notifications' }
);
