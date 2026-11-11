// MSW handlers of the notifications domain, owned by P6 (README §6): one happy-path handler per wrapped operation (38,
// P6 §4), each answering with its 2xx fixture of test/fixtures/notifications/ through P0's fixtureResponse. Fixtures are
// loaded lazily inside the resolver, so a missing fixture fails only its own request. Static paths are declared before
// the `/:ns/:id` routes. Handlers only answer: request assertions use recordRequests() from test/mocks/server.ts; tests
// of other answers use server.use().
import { http, type HttpHandler } from 'msw';
import { fixtureResponse, loadFixture } from '../../contract/fixtures';

const BASE = 'https://rtls.ubudu.com/api/notifications/:ns';

/** A resolver answering with `test/fixtures/notifications/<name>.json`, read when the request arrives. */
function fixture(name: string): () => Response {
  return () => fixtureResponse(loadFixture('notifications', name));
}

/** `GET /notifications/{namespace}`: flat items for `group_by=flat`, group rows otherwise (server default thread). */
function listFixture(request: Request): Response {
  const groupBy = new URL(request.url).searchParams.get('group_by');
  const name =
    groupBy === 'flat'
      ? 'list.flat'
      : groupBy === 'type'
        ? 'list.groups.type'
        : 'list.groups.thread';
  return fixtureResponse(loadFixture('notifications', name));
}

/**
 * `GET /export`: CSV for `format=csv`, JSON for anything else (server rule). `export.json.json` is spelled with its
 * extension: loadFixture takes a name ending in `.json` as a file name.
 */
function exportFixture(request: Request): Response {
  const format = new URL(request.url).searchParams.get('format');
  return fixtureResponse(
    loadFixture('notifications', format === 'csv' ? 'export.csv' : 'export.json.json')
  );
}

export const handlers: HttpHandler[] = [
  // Static routes first: they would otherwise match `/:ns/:id`.
  http.get(`${BASE}/facets`, fixture('facets')),
  http.get(`${BASE}/export`, ({ request }) => exportFixture(request)),
  http.get(`${BASE}/unread_count`, fixture('unread-count')),
  http.get(`${BASE}/stream`, fixture('stream.frames')),
  http.post(`${BASE}/bulk/undo`, fixture('bulk.undo')),
  http.post(`${BASE}/bulk`, fixture('bulk.result')),
  http.post(`${BASE}/send`, fixture('send.created')),

  http.get(`${BASE}/rules`, fixture('rules.list')),
  http.post(`${BASE}/rules`, fixture('rule.created')),
  http.get(`${BASE}/rules/:id`, fixture('rule')),
  http.patch(`${BASE}/rules/:id`, fixture('rule.updated')),
  http.delete(`${BASE}/rules/:id`, fixture('rule.deleted')),

  http.get(`${BASE}/connections`, fixture('connections.list')),
  http.post(`${BASE}/connections`, fixture('connection.inapp')),
  http.post(`${BASE}/connections/:id/test`, fixture('connection.test-ok')),
  http.get(`${BASE}/connections/:id`, fixture('connection.get')),
  http.delete(`${BASE}/connections/:id`, fixture('connection.deleted')),

  http.get(`${BASE}/saved-views`, fixture('saved-views.list')),
  http.post(`${BASE}/saved-views`, fixture('saved-view.created')),
  http.get(`${BASE}/saved-views/:id`, fixture('saved-view')),
  http.delete(`${BASE}/saved-views/:id`, fixture('saved-view.deleted')),

  http.get(`${BASE}/cleanup-policy`, fixture('cleanup-policy.default')),
  http.put(`${BASE}/cleanup-policy`, fixture('cleanup-policy.replaced')),

  http.get(`${BASE}/tenant-config`, fixture('tenant-config.empty')),
  http.put(`${BASE}/tenant-config`, fixture('tenant-config.updated')),

  http.get(`${BASE}/recipient-mappings`, fixture('recipient-mappings.list')),
  http.post(`${BASE}/recipient-mappings`, fixture('recipient-mapping.created')),
  http.get(`${BASE}/recipient-mappings/:id`, fixture('recipient-mapping')),
  http.patch(`${BASE}/recipient-mappings/:id`, fixture('recipient-mapping.updated')),
  http.delete(`${BASE}/recipient-mappings/:id`, fixture('recipient-mapping.deleted')),

  // Inbox list and item routes.
  http.get(BASE, ({ request }) => listFixture(request)),
  http.post(`${BASE}/:id/read`, fixture('item.read')),
  http.post(`${BASE}/:id/acknowledge`, fixture('item.acknowledged')),
  http.post(`${BASE}/:id/archive`, fixture('item.archived')),
  http.post(`${BASE}/:id/pin`, fixture('item.pinned')),
  http.post(`${BASE}/:id/snooze`, fixture('item.snoozed')),
  http.get(`${BASE}/:id`, fixture('item.dm')),
  http.patch(`${BASE}/:id`, fixture('item.updated')),
];
