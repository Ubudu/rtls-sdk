// MSW handlers of the positions half of the positions-spatial domain (P3 group A), aggregated by
// test/mocks/handlers/positions-spatial.ts. Default 2xx answers come from the fixtures of
// test/fixtures/positions-spatial; the error bodies below are constants for server.use() in the tests.
// Handlers only answer: request assertions use recordRequests() from test/mocks/server.ts.
import { http, type HttpHandler } from 'msw';
import { fixtureResponse, loadFixture } from '../../../contract/fixtures';

export const BASE_URL = 'https://rtls.ubudu.com/api';

/** A fresh MSW response for a fixture of this domain. */
export function positionsFixture(name: string): Response {
  return fixtureResponse(loadFixture('positions-spatial', name));
}

/** A text body without any `Content-Type` header (the publisher's error and success framing). */
export function bareText(status: number, text: string, headers?: Record<string, string>): Response {
  return new Response(text === '' ? null : new TextEncoder().encode(text), { status, headers });
}

// server-code: POST /publisher/{app_namespace} (400 text, no Content-Type)
export const PUBLISHER_MISSING_MAC = 'Missing MAC address (user_uuid or user_udid)';
// server-code: POST /publisher/{app_namespace} (400 text, body null)
export const PUBLISHER_INVALID_DATA = 'Invalid position data';
// server-code: POST /publisher/{app_namespace} (400 text, malformed JSON)
export const PUBLISHER_JSON_ERROR = 'JSON error: Unexpected token';
// server-code: POST /publisher/{app_namespace} (400 JSON, data.sensor_ils_* with patch_asset_data)
export const PUBLISHER_RESERVED_FIELD = {
  error: 'reserved_field_namespace',
  message: 'Fields under data.sensor_ils_ are reserved',
  fields: ['data.sensor_ils_foo'],
};
// server-code: POST /publisher/{app_namespace} (413 text, body over 8 MB)
export const PUBLISHER_413 = 'JSON error: request entity too large';
// server-code: POST /publisher/{app_namespace} (415 text, any Content-Encoding)
export const PUBLISHER_415 = 'JSON error: content encoding unsupported';
// server-code: POST /publisher/{app_namespace} (503 text, position not published)
export const PUBLISHER_503 = 'Service temporarily unavailable - Redis error';

// server-code: GET /asset_last_position/{app_namespace}/{mac_address} (404 text of the C++ path)
export const LAST_POSITION_NOT_FOUND = 'Last asset position not found';
// server-code: GET /cache/{app_namespace}/positions (500 when a stored value is malformed)
export const CACHE_500 = { error: 'Internal server error' };

// server-code: GET /es/position_history/{appNamespace} (400 without value)
export const HISTORY_VALUE_REQUIRED = { error: 'value parameter is required' };

// server-code: POST /es/query/{appNamespace}/{dataType} (400 guard: size -1)
export const ES_GUARD_SIZE = {
  error: 'unbounded size (-1) is not permitted',
  violations: ['size=-1'],
};
// server-code: POST /es/query/{appNamespace}/{dataType} (400 guard: aggregations nested deeper than 3)
export const ES_GUARD_AGG_DEPTH = {
  error: 'aggregation nesting deeper than 3 is not permitted',
  violations: ['aggDepth=4'],
};
// server-code: POST /es/query/{appNamespace}/{dataType} (500 for a dataType outside the enum, USI-P3-9)
export const ES_INVALID_DATATYPE = { error: 'Invalid dataType: nope' };
// server-code: POST /es/query/{appNamespace}/{dataType} (413 Express HTML page, JSON body over 100 kB)
export const ES_413_HTML =
  '<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<title>Error</title>\n</head>\n<body>\n' +
  '<pre>PayloadTooLargeError: request entity too large<br> &nbsp; &nbsp;at readStream (&lt;anonymous&gt;)</pre>\n' +
  '</body>\n</html>\n';

export const positionsHandlers: HttpHandler[] = [
  http.get(`${BASE_URL}/cache/:namespace/positions`, () => positionsFixture('cache-positions')),
  http.get(`${BASE_URL}/cache/:namespace/positions/:mac`, () => positionsFixture('cache-position')),
  http.get(`${BASE_URL}/asset_last_position/:namespace/:mac`, () =>
    positionsFixture('asset-last-position')
  ),
  http.get(`${BASE_URL}/es/last_positions/:namespace`, () => positionsFixture('es-last-positions')),
  http.get(`${BASE_URL}/es/position_history/:namespace`, () =>
    positionsFixture('es-position-history')
  ),
  http.post(`${BASE_URL}/es/query/:namespace/:dataType`, () => positionsFixture('es-query-hits')),
  http.post(`${BASE_URL}/publisher/:namespace`, () => positionsFixture('publisher-201')),
];
