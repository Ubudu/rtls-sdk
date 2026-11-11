// MSW handlers of the assets domain, owned by P2 (README §6, P2 §8.2): one default handler per wrapped operation
// (19), each answering the 2xx fixture of test/fixtures/assets named in P2 §8.3. Fixtures are loaded lazily inside
// the callbacks, so a missing file fails only the tests that reach it. Handlers only answer: request assertions use
// recordRequests() from test/mocks/server.ts; per-test answers use server.use(...).
import { http, HttpResponse, type HttpHandler } from 'msw';
import { fixtureResponse, loadFixture } from '../../contract/fixtures';

const BASE_URL = 'https://rtls.ubudu.com/api';

/**
 * The response of `test/fixtures/assets/<name>.json`. A fixture whose `contentType` is `""` (the server sends no
 * Content-Type) is served from bytes, so that no type is added: its `text` as UTF-8 bytes, or an empty body.
 */
export function assetFixture(name: string): Response {
  const f = loadFixture('assets', name);
  if (f.contentType === '') {
    const payload = typeof f.text === 'string' ? new TextEncoder().encode(f.text) : null;
    return new HttpResponse(payload, { status: f.status ?? 200, headers: f.headers });
  }
  return fixtureResponse(f);
}

/** A plain-text body without any Content-Type header, as the asset routes send their text answers. */
export function textWithoutType(text: string, status: number): Response {
  return new HttpResponse(new TextEncoder().encode(text), { status });
}

// Text constants the server sends without Content-Type (_source: server-code).
export const SERVER_TEXT = {
  created: 'Created',
  updated: 'Updated',
  notFound: '404 Not Found\r\n',
  udidRequired: 'Error: user_udid is required, must be a string, and cannot be empty',
  nameRequired: 'Error: user_name is required, must be a string, and cannot be empty',
  invalidData: 'Error: Invalid asset data',
  notAnArray: 'Error: The payload must be an array of assets',
  macArrayRequired: 'Request body must be an array of MAC addresses',
  jsonError: 'JSON error: [json.exception.parse_error.101] parse error: unexpected end of input',
} as const;

export const handlers: HttpHandler[] = [
  // 1 · GET /assets_library/{app_namespace}
  http.get(`${BASE_URL}/assets_library/:namespace`, () => assetFixture('asset-tree')),
  // 13 · GET /data_filters_taxonomy/{app_namespace}
  http.get(`${BASE_URL}/data_filters_taxonomy/:namespace`, () => assetFixture('data-models')),
  // 10 · GET /asset_history/{app_namespace}/{mac_address}
  http.get(`${BASE_URL}/asset_history/:namespace/:mac`, () => assetFixture('asset-history')),
  // 12 · POST /tag-actions/{appNamespace}
  http.post(`${BASE_URL}/tag-actions/:namespace`, () => assetFixture('tag-actions-200-empty')),

  // 15, 16 · before POST /assets/:namespace/:mac, which would otherwise take 'bulk-declare' as a MAC
  http.post(`${BASE_URL}/assets/:namespace/bulk-declare`, () => assetFixture('bulk-declare-200')),
  http.post(`${BASE_URL}/assets/:namespace/bulk-clear-declared`, () =>
    assetFixture('bulk-clear-200')
  ),

  // 19 · GET /assets/{namespace}/documents/jobs/{jobId}
  http.get(`${BASE_URL}/assets/:namespace/documents/jobs/:jobId`, () =>
    assetFixture('document-job-completed')
  ),
  // 22 · GET /assets/{namespace}/{mac_address}/documents/{documentId}/download
  http.get(`${BASE_URL}/assets/:namespace/:mac/documents/:documentId/download`, () =>
    assetFixture('document-download-200')
  ),
  // 20 · GET /assets/{namespace}/{mac_address}/documents/{documentId}
  http.get(`${BASE_URL}/assets/:namespace/:mac/documents/:documentId`, () =>
    assetFixture('document')
  ),
  // 21 · DELETE /assets/{namespace}/{mac_address}/documents/{documentId}
  http.delete(`${BASE_URL}/assets/:namespace/:mac/documents/:documentId`, () =>
    assetFixture('document-delete')
  ),
  // 17 · POST /assets/{namespace}/{mac_address}/documents
  http.post(`${BASE_URL}/assets/:namespace/:mac/documents`, () =>
    assetFixture('document-upload-202')
  ),
  // 18 · GET /assets/{namespace}/{mac_address}/documents
  http.get(`${BASE_URL}/assets/:namespace/:mac/documents`, () => assetFixture('documents-list')),

  // 3 · GET /assets/{app_namespace}: a bare array (other phases' tests rely on it)
  http.get(`${BASE_URL}/assets/:namespace`, () => assetFixture('assets-list')),
  // 4 · POST /assets/{app_namespace}
  http.post(`${BASE_URL}/assets/:namespace`, () => assetFixture('assets-batch-save')),
  // 5 · DELETE /assets/{app_namespace}
  http.delete(`${BASE_URL}/assets/:namespace`, () => assetFixture('assets-batch-delete')),

  // 6 · GET /assets/{app_namespace}/{mac_address}
  http.get(`${BASE_URL}/assets/:namespace/:mac`, () => assetFixture('asset')),
  // 7 · POST /assets/{app_namespace}/{mac_address}: 201 'Created' without Content-Type
  http.post(`${BASE_URL}/assets/:namespace/:mac`, () => assetFixture('asset-create-201')),
  // 8 · PATCH /assets/{app_namespace}/{mac_address}
  http.patch(`${BASE_URL}/assets/:namespace/:mac`, () => assetFixture('asset-patched')),
  // 9 · DELETE /assets/{app_namespace}/{mac_address}: 200 empty, no Content-Type
  http.delete(`${BASE_URL}/assets/:namespace/:mac`, () => assetFixture('asset-delete-200')),
];
