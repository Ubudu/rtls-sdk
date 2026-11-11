// Context and error matrix of client.notifications (P6 §8.1 X1–X5): one entry per public method (43 entries covering
// the 38 wrapped operations), each run through the real resource code against MSW.
import { describe, it, expect } from 'vitest';
import { http, HttpResponse } from 'msw';
import { recordRequests, server, type RecordedRequest } from '../../mocks/server';
import {
  AuthenticationError,
  ContextError,
  createRtlsClient,
  ServerError,
  type CallContext,
  type RtlsClient,
} from '../../../src';

const ITEM = '65f000000000000000000001';
const RULE = '65a000000000000000000001';
const CONNECTION = '65b000000000000000000003';
const VIEW = '65c000000000000000000001';
const MAPPING = 'map_1_1';
const ALL = 'https://rtls.ubudu.com/api/notifications/*';

type Run = (client: RtlsClient, ctx: CallContext) => Promise<unknown>;

interface Entry {
  name: string;
  run: Run;
  /** Requests of one successful call (default 1). */
  requests?: number;
}

/** `iterate`: the first `next()` sends the first page request. */
const iterateFirst: Run = async (c, ctx) => {
  const iterator = c.notifications.iterate(undefined, ctx);
  const first = await iterator.next();
  await iterator.return?.();
  return first;
};

/** `stream` with `reconnect: false`: an error end becomes a rejection so that every entry is asserted alike. */
const streamDone: Run = async (c, ctx) => {
  const end = await c.notifications.stream({
    ...ctx,
    signal: new AbortController().signal,
    reconnect: false,
  }).done;
  if (end.reason === 'error') throw end.error;
  return end;
};

const ENTRIES: Entry[] = [
  { name: 'list', run: (c, o) => c.notifications.list(undefined, o) },
  { name: 'listPage', run: (c, o) => c.notifications.listPage(undefined, o) },
  { name: 'iterate', run: iterateFirst },
  { name: 'listGroups', run: (c, o) => c.notifications.listGroups(undefined, o) },
  { name: 'facets', run: (c, o) => c.notifications.facets(undefined, o) },
  { name: 'unreadCount', run: (c, o) => c.notifications.unreadCount(o) },
  { name: 'export', run: (c, o) => c.notifications.export({ format: 'csv' }, o) },
  { name: 'get', run: (c, o) => c.notifications.get(ITEM, o) },
  { name: 'markRead', run: (c, o) => c.notifications.markRead(ITEM, o) },
  { name: 'acknowledge', run: (c, o) => c.notifications.acknowledge(ITEM, o) },
  { name: 'archive', run: (c, o) => c.notifications.archive(ITEM, o) },
  { name: 'pin', run: (c, o) => c.notifications.pin(ITEM, o) },
  { name: 'unpin', run: (c, o) => c.notifications.unpin(ITEM, o) },
  { name: 'snooze', run: (c, o) => c.notifications.snooze(ITEM, 0, o) },
  { name: 'updateMission', run: (c, o) => c.notifications.updateMission(ITEM, 'done', o) },
  { name: 'bulk', run: (c, o) => c.notifications.bulk({ ids: [ITEM], action: 'read' }, o) },
  { name: 'undo', run: (c, o) => c.notifications.undo('u', o) },
  {
    name: 'send',
    run: (c, o) =>
      c.notifications.send({ recipients: [{ target_type: 'user', id: 'u1' }], title: 't' }, o),
  },
  { name: 'sendToSelf', run: (c, o) => c.notifications.sendToSelf({ title: 't' }, o), requests: 2 },
  { name: 'stream', run: streamDone },
  { name: 'rules.list', run: (c, o) => c.notifications.rules.list(o) },
  { name: 'rules.get', run: (c, o) => c.notifications.rules.get(RULE, o) },
  { name: 'rules.create', run: (c, o) => c.notifications.rules.create({ enabled: false }, o) },
  { name: 'rules.update', run: (c, o) => c.notifications.rules.update(RULE, { name: 'm' }, o) },
  { name: 'rules.delete', run: (c, o) => c.notifications.rules.delete(RULE, o) },
  { name: 'connections.list', run: (c, o) => c.notifications.connections.list(o) },
  { name: 'connections.get', run: (c, o) => c.notifications.connections.get(CONNECTION, o) },
  {
    name: 'connections.upsert',
    run: (c, o) => c.notifications.connections.upsert({ channel: 'inapp' }, o),
  },
  { name: 'connections.test', run: (c, o) => c.notifications.connections.test(CONNECTION, o) },
  {
    name: 'connections.delete',
    run: (c, o) => c.notifications.connections.delete(CONNECTION, o),
  },
  { name: 'savedViews.list', run: (c, o) => c.notifications.savedViews.list(o) },
  { name: 'savedViews.get', run: (c, o) => c.notifications.savedViews.get(VIEW, o) },
  { name: 'savedViews.create', run: (c, o) => c.notifications.savedViews.create({ name: 'v' }, o) },
  { name: 'savedViews.delete', run: (c, o) => c.notifications.savedViews.delete(VIEW, o) },
  { name: 'cleanupPolicy.get', run: (c, o) => c.notifications.cleanupPolicy.get(o) },
  {
    name: 'cleanupPolicy.replace',
    run: (c, o) =>
      c.notifications.cleanupPolicy.replace({ auto_archive_days: 30, auto_purge_days: 180 }, o),
  },
  { name: 'admin.tenantConfig.get', run: (c, o) => c.notifications.admin.tenantConfig.get(o) },
  {
    name: 'admin.tenantConfig.update',
    run: (c, o) =>
      c.notifications.admin.tenantConfig.update({ cleanup_cap: { max_purge_days: 365 } }, o),
  },
  {
    name: 'admin.recipientMappings.list',
    run: (c, o) => c.notifications.admin.recipientMappings.list(o),
  },
  {
    name: 'admin.recipientMappings.get',
    run: (c, o) => c.notifications.admin.recipientMappings.get(MAPPING, o),
  },
  {
    name: 'admin.recipientMappings.create',
    run: (c, o) => c.notifications.admin.recipientMappings.create({ enabled: false }, o),
  },
  {
    name: 'admin.recipientMappings.update',
    run: (c, o) => c.notifications.admin.recipientMappings.update(MAPPING, { enabled: false }, o),
  },
  {
    name: 'admin.recipientMappings.delete',
    run: (c, o) => c.notifications.admin.recipientMappings.delete(MAPPING, o),
  },
];

/** A fresh client per test: sendToSelf caches the caller's id per namespace on the resource. */
const withNamespace = (): RtlsClient => createRtlsClient({ apiKey: 'k', namespace: 'ns-test' });

function expectNamespace(requests: readonly RecordedRequest[], count: number, ns: string): void {
  expect(requests).toHaveLength(count);
  for (const r of requests) {
    expect(r.url.pathname.startsWith(`/api/notifications/${ns}`)).toBe(true);
    expect(r.url.pathname.split('/')[3]).toBe(ns);
  }
}

describe('notifications context and error matrix', () => {
  it('covers 43 public methods', () => {
    expect(ENTRIES).toHaveLength(43);
    expect(new Set(ENTRIES.map((e) => e.name)).size).toBe(43);
  });

  describe.each(ENTRIES)('$name', ({ run, requests = 1 }) => {
    it('X1 the default namespace is in the path', async () => {
      const rec = recordRequests();
      await run(withNamespace(), {});
      expectNamespace(rec.requests, requests, 'ns-test');
    });

    it('X2 { namespace: "other" } overrides it', async () => {
      const rec = recordRequests();
      await run(withNamespace(), { namespace: 'other' });
      expectNamespace(rec.requests, requests, 'other');
    });

    it('X3 no namespace at all → ContextError, no request', async () => {
      const rec = recordRequests();
      await expect(run(createRtlsClient({ apiKey: 'k' }), {})).rejects.toBeInstanceOf(ContextError);
      expect(rec.requests).toHaveLength(0);
    });

    it('X4 500 internal_error → ServerError', async () => {
      server.use(
        http.all(ALL, () => HttpResponse.json({ error: 'internal_error' }, { status: 500 }))
      );
      const p = run(withNamespace(), {});
      await expect(p).rejects.toBeInstanceOf(ServerError);
      await expect(p).rejects.toMatchObject({ status: 500, apiCode: 'internal_error' });
    });

    it('X5 401 without credentials → AuthenticationError', async () => {
      server.use(
        http.all(ALL, () =>
          HttpResponse.json({ error: 'No authentication credentials provided' }, { status: 401 })
        )
      );
      const p = run(withNamespace(), {});
      await expect(p).rejects.toBeInstanceOf(AuthenticationError);
      await expect(p).rejects.toMatchObject({ status: 401 });
    });
  });
});
