// MSW handlers of the spatial half of the positions-spatial domain (P3 group B), aggregated by
// test/mocks/handlers/positions-spatial.ts. Default 2xx answers come from the fixtures of
// test/fixtures/positions-spatial (the live-shaped ones; tests swap in the `.server-code` variants with
// server.use()). The error bodies below are constants for server.use() in the tests.
// Handlers only answer: request assertions use recordRequests() from test/mocks/server.ts.
import { http, HttpResponse, type HttpHandler } from 'msw';
import { fixtureResponse, loadFixture } from '../../../contract/fixtures';

export const SPATIAL_BASE_URL = 'https://rtls.ubudu.com/api';

/** A fresh MSW response for a fixture of this domain. */
export function spatialFixture(name: string): Response {
  return fixtureResponse(loadFixture('positions-spatial', name));
}

/** A JSON error answer. */
export function jsonError(status: number, body: Record<string, unknown>): Response {
  return HttpResponse.json(body, { status });
}

// server-code: GET /spatial/zones/{namespace}/within-radius (400, radius_meters <= 0)
export const ZONES_RADIUS_NOT_POSITIVE = { error: 'Radius must be positive' };
// server-code: zone routes, GET and POST (500, out-of-range coordinates)
export const ZONES_INVALID_COORDINATES = { error: 'Invalid coordinates' };
// server-code: POST /spatial/zones/{namespace}/calculate-distances (400, zone_ids missing or [])
export const ZONES_IDS_REQUIRED = { error: 'Zone IDs array is required' };
// server-code: POST /spatial/zones|pois/{namespace}/analyze-custom and calculate-distances (400, lat or lon falsy)
export const REFERENCE_POINT_REQUIRED = { error: 'Reference point with lat and lon is required' };
// server-code: POST /spatial/zones/{namespace}/analyze-custom (500, custom_zones not a FeatureCollection)
export const ZONES_INVALID_FEATURE_COLLECTION = { error: 'Invalid GeoJSON FeatureCollection' };
// server-code: GET /spatial/pois/{namespace}/within-radius (400, lat, lon or radius_meters missing)
export const POIS_RADIUS_REQUIRED = { error: 'Latitude, longitude, and radius are required' };
// server-code: GET /spatial/pois/{namespace}/by-tag (400, tag missing or empty)
export const POIS_TAG_REQUIRED = { error: 'Tag is required' };
// server-code: GET /spatial/pois/{namespace}/statistics (500 {error}; the message text is illustrative)
export const POIS_STATISTICS_FAILED = { error: 'Failed to get POI statistics' };
// server-code: POST /spatial/pois/{namespace}/analyze-custom (400, operation missing)
export const POIS_OPERATION_REQUIRED = {
  error: 'Operation is required (nearest or within-radius)',
};
// server-code: POST /spatial/pois/{namespace}/analyze-custom (500, operation outside the enum)
export const POIS_UNKNOWN_OPERATION = { error: 'Unknown operation: x' };
// server-code: GET /spatial/assets/{namespace}/nearest-to-point and nearest-realtime (400, limit outside 1–100)
export const ASSETS_LIMIT_RANGE = { error: 'Limit must be between 1 and 100' };
// server-code: GET /spatial/assets/{namespace}/nearest-to-point and nearest-realtime (500 {error, details})
export const ASSETS_FAILED = { error: 'Failed to retrieve nearest assets', details: 'boom' };

/** Route of each default handler and the fixture it serves. */
export const SPATIAL_ROUTES = {
  zonesContaining: [
    'get',
    '/spatial/zones/:namespace/containing-point',
    'spatial-zones-containing',
  ],
  zonesNearest: ['get', '/spatial/zones/:namespace/nearest-to-point', 'spatial-zones-nearest'],
  zonesWithin: ['get', '/spatial/zones/:namespace/within-radius', 'spatial-zones-within'],
  zonesDistances: [
    'post',
    '/spatial/zones/:namespace/calculate-distances',
    'spatial-zones-distances',
  ],
  zonesAnalyze: ['post', '/spatial/zones/:namespace/analyze-custom', 'spatial-zones-analyze'],
  poisNearest: ['get', '/spatial/pois/:namespace/nearest-to-point', 'spatial-pois-nearest'],
  poisWithin: ['get', '/spatial/pois/:namespace/within-radius', 'spatial-pois-within'],
  poisByTag: ['get', '/spatial/pois/:namespace/by-tag', 'spatial-pois-by-tag'],
  poisStatistics: ['get', '/spatial/pois/:namespace/statistics', 'spatial-pois-statistics'],
  poisAnalyze: ['post', '/spatial/pois/:namespace/analyze-custom', 'spatial-pois-analyze'],
  assetsNearest: ['get', '/spatial/assets/:namespace/nearest-to-point', 'spatial-assets-nearest'],
  assetsRealtime: ['get', '/spatial/assets/:namespace/nearest-realtime', 'spatial-assets-realtime'],
} as const;

export type SpatialRoute = keyof typeof SPATIAL_ROUTES;

/** A handler for one spatial route that answers with `respond` (for server.use() in the tests). */
export function spatialRoute(
  route: SpatialRoute,
  respond: () => Response | Promise<Response>
): HttpHandler {
  const [method, path] = SPATIAL_ROUTES[route];
  return http[method](`${SPATIAL_BASE_URL}${path}`, respond);
}

export const spatialHandlers: HttpHandler[] = (Object.keys(SPATIAL_ROUTES) as SpatialRoute[]).map(
  (route) => spatialRoute(route, () => spatialFixture(SPATIAL_ROUTES[route][2]))
);
