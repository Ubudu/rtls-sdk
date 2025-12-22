import { http, HttpResponse } from 'msw';

const BASE_URL = 'https://rtls.ubudu.com/api';

export const handlers = [
  // Health check
  http.get(`${BASE_URL}/health`, () => {
    return HttpResponse.json({ status: 'healthy', version: '2.5.5' });
  }),

  // Assets list - returns direct array (not paginated)
  http.get(`${BASE_URL}/assets/:namespace`, () => {
    return HttpResponse.json([
      {
        user_udid: 'aa:bb:cc:dd:ee:ff',
        user_name: 'Asset 1',
        user_type: 'default',
        user_motion: 'default',
        color: '#FF0000',
        model: 'default',
        path: '/test/',
        tags: [],
        data: {},
        createdBy: 'test',
        dateCreated: Date.now(),
        targetApplications: [],
      },
      {
        user_udid: '11:22:33:44:55:66',
        user_name: 'Asset 2',
        user_type: 'default',
        user_motion: 'default',
        color: '#00FF00',
        model: 'default',
        path: '/test/',
        tags: [],
        data: {},
        createdBy: 'test',
        dateCreated: Date.now(),
        targetApplications: [],
      },
    ]);
  }),

  // Asset get
  http.get(`${BASE_URL}/assets/:namespace/:mac`, ({ params }) => {
    return HttpResponse.json({
      user_udid: params.mac,
      user_name: 'Test Asset',
      user_type: 'default',
    });
  }),

  // Asset create
  http.post(`${BASE_URL}/assets/:namespace/:mac`, async ({ request }) => {
    const body = await request.json();
    return HttpResponse.json(body, { status: 201 });
  }),

  // Asset update
  http.patch(`${BASE_URL}/assets/:namespace/:mac`, async ({ request, params }) => {
    const body = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json({
      user_udid: params.mac,
      ...body,
    });
  }),

  // Asset delete
  http.delete(`${BASE_URL}/assets/:namespace/:mac`, () => {
    return new HttpResponse(null, { status: 204 });
  }),

  // Positions
  http.get(`${BASE_URL}/cache/:namespace/positions`, () => {
    return HttpResponse.json([{ mac_address: 'AABBCCDDEEFF', lat: 48.8566, lon: 2.3522 }]);
  }),

  http.get(`${BASE_URL}/cache/:namespace/positions/:mac`, ({ params }) => {
    return HttpResponse.json({
      mac_address: params.mac,
      lat: 48.8566,
      lon: 2.3522,
    });
  }),

  // Venues - returns direct array (not paginated)
  http.get(`${BASE_URL}/venues/:namespace`, () => {
    return HttpResponse.json([{ id: 1, name: 'Test Venue', external_id: 'venue-1' }]);
  }),

  http.get(`${BASE_URL}/venues/:namespace/:venueId`, ({ params }) => {
    return HttpResponse.json({
      id: Number(params.venueId),
      name: 'Test Venue',
    });
  }),

  // Venue Maps - returns direct array
  http.get(`${BASE_URL}/venues/:namespace/:venueId/maps`, () => {
    return HttpResponse.json([{ id: 1, name: 'Floor 1', level: 0 }]);
  }),

  // Zones - returns GeoJSON FeatureCollection
  http.get(`${BASE_URL}/venues/:namespace/:venueId/zones`, () => {
    return HttpResponse.json({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [2.31, 48.88],
                [2.32, 48.88],
                [2.32, 48.89],
                [2.31, 48.89],
                [2.31, 48.88],
              ],
            ],
          },
          properties: {
            id: 1,
            name: 'Test Zone',
            level: 0,
            rgb_color: '#FF0000',
            tags: ['test'],
            type: 'map_zone',
          },
        },
      ],
      metadata: {
        type: 'zones',
        count: 1,
        timestamp: new Date().toISOString(),
      },
    });
  }),

  // Map Zones - returns GeoJSON FeatureCollection
  http.get(`${BASE_URL}/venues/:namespace/:venueId/maps/:mapId/zones`, () => {
    return HttpResponse.json({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [2.31, 48.88],
                [2.32, 48.88],
                [2.32, 48.89],
                [2.31, 48.89],
                [2.31, 48.88],
              ],
            ],
          },
          properties: {
            id: 1,
            name: 'Map Zone',
            level: 0,
            rgb_color: '#00FF00',
            tags: ['map'],
            type: 'map_zone',
          },
        },
      ],
      metadata: {
        type: 'zones',
        count: 1,
        timestamp: new Date().toISOString(),
      },
    });
  }),

  // POIs - returns GeoJSON FeatureCollection
  http.get(`${BASE_URL}/venues/:namespace/:venueId/pois`, () => {
    return HttpResponse.json({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: [2.31, 48.88],
          },
          properties: {
            id: 1,
            name: 'Test POI',
            description: 'A test POI',
            level: 0,
            color: '#00FF00',
            tags: ['test'],
            _id: 'abc123',
            coordinates: { lat: 48.88, lng: 2.31 },
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            externalId: 1,
            externalVenueId: 1,
            externalApplicationId: 1,
            index: 0,
          },
        },
      ],
      metadata: {
        type: 'pois',
        count: 1,
        timestamp: new Date().toISOString(),
      },
    });
  }),

  // Map POIs - returns GeoJSON FeatureCollection
  http.get(`${BASE_URL}/venues/:namespace/:venueId/maps/:mapId/pois`, () => {
    return HttpResponse.json({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: [2.32, 48.89],
          },
          properties: {
            id: 2,
            name: 'Map POI',
            description: 'A map POI',
            level: 1,
            color: '#0000FF',
            tags: ['map'],
            _id: 'def456',
            coordinates: { lat: 48.89, lng: 2.32 },
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            externalId: 2,
            externalVenueId: 1,
            externalApplicationId: 1,
            index: 1,
          },
        },
      ],
      metadata: {
        type: 'pois',
        count: 1,
        timestamp: new Date().toISOString(),
      },
    });
  }),

  // Paths - returns GeoJSON FeatureCollection with nodes and segments
  http.get(`${BASE_URL}/venues/:namespace/:venueId/paths`, () => {
    return HttpResponse.json({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [2.31, 48.88] },
          properties: {
            id: 1,
            external_id: 1,
            type: 'path_node',
            node_type: 'waypoint',
            name: 'Node 1',
            level: 0,
            is_active: true,
            cross_level_connections: [],
            tags: [],
          },
        },
        {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [2.32, 48.88] },
          properties: {
            id: 2,
            external_id: 2,
            type: 'path_node',
            node_type: 'waypoint',
            name: 'Node 2',
            level: 0,
            is_active: true,
            cross_level_connections: [],
            tags: [],
          },
        },
        {
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: [
              [2.31, 48.88],
              [2.32, 48.88],
            ],
          },
          properties: {
            id: 1,
            type: 'path_segment',
            start_node_id: 1,
            end_node_id: 2,
            is_bidirectional: true,
            weight: 1.0,
            level: 0,
          },
        },
      ],
      metadata: {
        type: 'paths',
        timestamp: new Date().toISOString(),
      },
    });
  }),

  // Spatial - zones containing point
  http.get(`${BASE_URL}/spatial/zones/:namespace/containing-point`, ({ request }) => {
    const url = new URL(request.url);
    const lat = parseFloat(url.searchParams.get('lat') || '0');
    const lon = parseFloat(url.searchParams.get('lon') || '0');

    return HttpResponse.json({
      reference_point: { lat, lon },
      level: null,
      containing_zones: [],
      total: 0,
    });
  }),

  // Spatial - nearest zones
  http.get(`${BASE_URL}/spatial/zones/:namespace/nearest-to-point`, ({ request }) => {
    const url = new URL(request.url);
    const lat = parseFloat(url.searchParams.get('lat') || '0');
    const lon = parseFloat(url.searchParams.get('lon') || '0');

    return HttpResponse.json({
      reference_point: { lat, lon },
      level: null,
      max_distance_meters: null,
      total_zones: 0,
      zones: [],
      hasMore: false,
    });
  }),

  // Spatial - zones within radius
  http.get(`${BASE_URL}/spatial/zones/:namespace/within-radius`, ({ request }) => {
    const url = new URL(request.url);
    const lat = parseFloat(url.searchParams.get('lat') || '0');
    const lon = parseFloat(url.searchParams.get('lon') || '0');
    const radiusMeters = parseFloat(url.searchParams.get('radius_meters') || '0');

    return HttpResponse.json({
      reference_point: { lat, lon },
      radius_meters: radiusMeters,
      level: null,
      total_zones: 0,
      zones: [],
    });
  }),

  // Spatial - nearest POIs
  http.get(`${BASE_URL}/spatial/pois/:namespace/nearest-to-point`, ({ request }) => {
    const url = new URL(request.url);
    const lat = parseFloat(url.searchParams.get('lat') || '0');
    const lon = parseFloat(url.searchParams.get('lon') || '0');

    return HttpResponse.json({
      reference_point: { lat, lon },
      level: null,
      max_distance_meters: null,
      total_pois: 0,
      pois: [],
      hasMore: false,
    });
  }),

  // Spatial - POIs within radius
  http.get(`${BASE_URL}/spatial/pois/:namespace/within-radius`, ({ request }) => {
    const url = new URL(request.url);
    const lat = parseFloat(url.searchParams.get('lat') || '0');
    const lon = parseFloat(url.searchParams.get('lon') || '0');
    const radiusMeters = parseFloat(url.searchParams.get('radius_meters') || '0');

    return HttpResponse.json({
      reference_point: { lat, lon },
      radius_meters: radiusMeters,
      level: null,
      total_pois: 0,
      pois: [],
    });
  }),

  // Spatial - analyze custom zones
  http.post(`${BASE_URL}/spatial/zones/:namespace/analyze-custom`, () => {
    return HttpResponse.json({
      analyzed: true,
      results: [],
    });
  }),

  // Spatial - analyze custom POIs
  http.post(`${BASE_URL}/spatial/pois/:namespace/analyze-custom`, () => {
    return HttpResponse.json({
      analyzed: true,
      results: [],
    });
  }),

  // Dashboards
  http.get(`${BASE_URL}/dashboards`, () => {
    return HttpResponse.json([{ id: 'dashboard-1', name: 'Test Dashboard' }]);
  }),

  http.post(`${BASE_URL}/dashboards`, async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json({ id: 'new-dashboard', ...body }, { status: 201 });
  }),

  // Error responses for testing
  http.get(`${BASE_URL}/test/error/401`, () => {
    return HttpResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }),

  http.get(`${BASE_URL}/test/error/404`, () => {
    return HttpResponse.json({ error: 'Not found' }, { status: 404 });
  }),

  http.get(`${BASE_URL}/test/error/500`, () => {
    return HttpResponse.json({ error: 'Internal server error' }, { status: 500 });
  }),
];
