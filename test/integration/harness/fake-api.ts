// In-memory namespace behind MSW for the harness unit tests (P0 §8.1): the reads of global setup, the snapshot
// and the sweeper, and the removals of the sweeper and the cleanup registry, with the live shapes of P0 §5.2
// (hand-made bodies, no recorded data, no real identifiers). Every request that reaches it is logged.
import { http, HttpResponse } from 'msw';
import { server } from '../../mocks/server';
import { SELF_USER, TEST_BASE_URL, TEST_NS } from './unit-support';

type Obj = Record<string, unknown>;

export interface FakeRequest {
  method: string;
  /** path below the base path, query excluded */
  path: string;
  query: Record<string, string>;
  body: unknown;
}

/** Status overrides by route name (`health`, `alertRules`, `tenantConfig`, `recipientMappings`, …). */
export type FakeRoute =
  | 'health'
  | 'alertRules'
  | 'assets'
  | 'cleanupPolicy'
  | 'tenantConfig'
  | 'settings'
  | 'dashboards'
  | 'unreadCount'
  | 'notificationRules'
  | 'savedViews'
  | 'connections'
  | 'recipientMappings'
  | 'etlProfiles'
  | 'documents'
  | 'notifications';

export class FakeApi {
  assets: Obj[] = [];
  documents = new Map<string, Obj[]>();
  dashboards: (Obj & { created?: boolean })[] = [];
  notifications: Obj[] = [];
  notificationRules: Obj[] = [];
  savedViews: Obj[] = [];
  connections: Obj[] = [];
  recipientMappings: Obj[] = [];
  etlProfiles: Obj[] = [];
  alertRules: unknown = { name: 'Demo rules', rules: [] };
  cleanupPolicy: unknown = {
    app_namespace: TEST_NS,
    user_id: SELF_USER,
    auto_archive_days: 30,
    auto_purge_days: 180,
  };
  tenantConfig: unknown = { app_namespace: TEST_NS };
  settings: unknown = { map: { zoom: 18 }, features: ['alerts'] };
  status: Partial<Record<FakeRoute, number>> = {};
  /** alert-rule writes answered with a different stored value (restore mismatch tests) */
  alertRulesWriteTransform: ((body: unknown) => unknown) | null = null;
  readonly log: FakeRequest[] = [];
  /** number of entities created through a collection POST (id suffix) */
  private created = 0;
  /** answer the inbox list without applying `q` (tests of the sweeper's own selection) */
  searchIgnoresQuery = false;
  /** called for every request before it is answered (state checks while a CLI runs) */
  onRequest: ((r: FakeRequest) => void) | null = null;

  constructor(readonly baseUrl: string = TEST_BASE_URL) {}

  /** Requests other than GET. */
  writes(): FakeRequest[] {
    return this.log.filter((r) => r.method !== 'GET' && r.method !== 'HEAD');
  }

  install(): this {
    server.use(http.all(`${this.baseUrl}/*`, async ({ request }) => this.answer(request)));
    return this;
  }

  private overridden(route: FakeRoute): Response | null {
    const status = this.status[route];
    if (status === undefined || status === 200) return null;
    return HttpResponse.json({ error: 'overridden' }, { status });
  }

  private async answer(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const base = new URL(this.baseUrl).pathname.replace(/\/+$/, '');
    const path = decodeURIComponent(url.pathname.slice(base.length));
    const text = request.method === 'GET' ? '' : await request.text();
    let body: unknown = undefined;
    if (text !== '') {
      try {
        body = JSON.parse(text);
      } catch {
        body = text;
      }
    }
    const entry: FakeRequest = {
      method: request.method,
      path,
      query: Object.fromEntries(url.searchParams),
      body,
    };
    this.log.push(entry);
    this.onRequest?.(entry);
    return this.route(entry);
  }

  private route(r: FakeRequest): Response {
    const ns = TEST_NS;
    const seg = r.path.split('/').filter((s) => s !== '');
    const json = (value: unknown, status = 200): Response =>
      HttpResponse.json(value as never, { status });
    const notFound = (): Response => json({ error: 'Not found' }, 404);
    const remove = (list: Obj[], id: string, key: '_id' | 'id' = '_id'): Response => {
      const i = list.findIndex((x) => String(x[key] ?? x._id ?? x.id) === id);
      if (i < 0) return notFound();
      list.splice(i, 1);
      return new Response(null, { status: 204 });
    };
    const on = (route: FakeRoute, fn: () => Response): Response => this.overridden(route) ?? fn();

    if (r.path === '/health') return on('health', () => json({ status: 'OK' }));
    if (r.path === `/alert_rules/${ns}`) {
      return on('alertRules', () => {
        if (r.method === 'GET') return json(this.alertRules);
        this.alertRules = this.alertRulesWriteTransform
          ? this.alertRulesWriteTransform(r.body)
          : r.body;
        return new Response('OK', { status: 200 });
      });
    }
    if (r.path === `/settings/${ns}`) return on('settings', () => json(this.settings));
    if (r.path === '/dashboards') return on('dashboards', () => json(this.dashboards.map(strip)));
    if (r.path === '/dashboards/created') {
      return on('dashboards', () => json(this.dashboards.filter((d) => d.created).map(strip)));
    }
    if (seg[0] === 'dashboards' && seg.length === 2 && r.method === 'DELETE') {
      return remove(this.dashboards, seg[1] as string);
    }
    if (r.path === '/etl/mapping-profiles') return on('etlProfiles', () => json(this.etlProfiles));
    if (
      seg[0] === 'etl' &&
      seg[1] === 'mapping-profiles' &&
      seg.length === 3 &&
      r.method === 'DELETE'
    ) {
      return remove(this.etlProfiles, seg[2] as string);
    }
    if (seg[0] === 'assets' && seg[1] === ns) return this.assetRoute(r, seg.slice(2));
    if (seg[0] === 'notifications' && seg[1] === ns)
      return this.notificationRoute(r, seg.slice(2), on);
    return json({ error: `fake: no route for ${r.method} ${r.path}` }, 501);
  }

  private assetRoute(r: FakeRequest, rest: string[]): Response {
    const json = (value: unknown, status = 200): Response =>
      HttpResponse.json(value as never, { status });
    if (rest.length === 0) {
      return this.overridden('assets') ?? json(this.assets);
    }
    const mac = rest[0] as string;
    const index = this.assets.findIndex((a) => a.user_udid === mac);
    if (rest.length === 1) {
      if (r.method === 'GET')
        return index < 0 ? new Response(null, { status: 404 }) : json(this.assets[index]);
      if (r.method === 'POST') {
        const record = { ...(r.body as Obj) };
        // A bare string body without Content-Type, as the server answers (P0 §5.2).
        const bare = (text: string, status: number): Response =>
          new Response(new TextEncoder().encode(text), { status });
        if (index < 0) {
          this.assets.push(record);
          return bare('Created', 201);
        }
        this.assets[index] = record;
        return bare('Updated', 200);
      }
      if (r.method === 'DELETE') {
        if (index < 0) return new Response('404 Not Found\r\n', { status: 404 });
        this.assets.splice(index, 1);
        return new Response(null, { status: 200 });
      }
    }
    if (rest[1] === 'documents') {
      const docs = this.documents.get(mac) ?? [];
      if (rest.length === 2 && r.method === 'GET') {
        return (
          this.overridden('documents') ??
          json({ items: docs, total: docs.length, limit: 0, offset: 0 })
        );
      }
      if (rest.length === 3 && r.method === 'DELETE') {
        const i = docs.findIndex((d) => d.documentId === rest[2]);
        if (i < 0) return json({ error: 'Document not found' }, 404);
        docs.splice(i, 1);
        return json({ message: 'Document deleted successfully', documentId: rest[2] });
      }
    }
    return json({ error: 'fake: unsupported asset route' }, 501);
  }

  private notificationRoute(
    r: FakeRequest,
    rest: string[],
    on: (route: FakeRoute, fn: () => Response) => Response
  ): Response {
    const json = (value: unknown, status = 200): Response =>
      HttpResponse.json(value as never, { status });
    const lists: Record<string, [FakeRoute, Obj[], '_id' | 'id']> = {
      rules: ['notificationRules', this.notificationRules, '_id'],
      'saved-views': ['savedViews', this.savedViews, '_id'],
      connections: ['connections', this.connections, '_id'],
      'recipient-mappings': ['recipientMappings', this.recipientMappings, 'id'],
    };
    const head = rest[0];
    if (head === undefined) {
      return on('notifications', () => {
        const q = this.searchIgnoresQuery ? '' : (r.query.q ?? '').replace(/"/g, '').toLowerCase();
        const matching = this.notifications.filter((n) =>
          q === ''
            ? true
            : String(n.title ?? '')
                .toLowerCase()
                .includes(q)
        );
        const limit = Math.min(Math.max(Number(r.query.limit ?? 50) || 50, 1), 200);
        const offset = Math.max(Number(r.query.offset ?? 0) || 0, 0);
        return HttpResponse.json(matching.slice(offset, offset + limit) as never, {
          headers: { 'X-Total-Count': String(matching.length) },
        });
      });
    }
    if (head === 'unread_count')
      return on('unreadCount', () => json({ unread: 0, needs_action: 0 }));
    if (head === 'cleanup-policy') {
      return on('cleanupPolicy', () => {
        if (r.method === 'GET') return json(this.cleanupPolicy);
        this.cleanupPolicy = r.body;
        return json(r.body);
      });
    }
    if (head === 'tenant-config') {
      return on('tenantConfig', () => {
        if (r.method === 'GET') return json(this.tenantConfig);
        this.tenantConfig = r.body;
        return json(r.body);
      });
    }
    if (head === 'bulk' && r.method === 'POST') {
      const ids = new Set(((r.body as Obj)?.ids as string[]) ?? []);
      const before = this.notifications.length;
      this.notifications = this.notifications.filter((n) => !ids.has(String(n._id)));
      return json({
        matched: before - this.notifications.length,
        modified: before - this.notifications.length,
      });
    }
    const list = lists[head];
    if (list) {
      const [route, items, key] = list;
      if (rest.length === 1 && r.method === 'GET') return on(route, () => json(items));
      if (rest.length === 1 && r.method === 'POST') {
        this.created += 1;
        const created = {
          ...(r.body as Obj),
          [key]: key === 'id' ? `map_${this.created}_1` : `${head}-${this.created}`,
        };
        items.push(created);
        return json(created, 201);
      }
      if (rest.length === 2 && r.method === 'DELETE') {
        const i = items.findIndex((x) => String(x[key] ?? x._id ?? x.id) === rest[1]);
        if (i < 0) return json({ error: 'not_found' }, 404);
        items.splice(i, 1);
        return new Response(null, { status: 204 });
      }
    }
    return json({ error: 'fake: unsupported notification route' }, 501);
  }
}

function strip(d: Obj & { created?: boolean }): Obj {
  const { created: _created, ...rest } = d;
  return rest;
}

/** A self-sent inbox item (P6 §5.4 shape) titled `title`. */
export function selfItem(id: string, title: string, extra: Obj = {}): Obj {
  return {
    _id: id,
    app_namespace: TEST_NS,
    user_id: SELF_USER,
    source_ref: `user:${SELF_USER}`,
    kind: 'direct_message',
    title,
    thread_key: `dm:${id}`,
    ...extra,
  };
}
