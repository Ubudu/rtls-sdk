import { http, HttpResponse } from 'msw';

const BASE_URL = 'https://rtls.ubudu.com/api';

export const handlers = [
  // Health check
  http.get(`${BASE_URL}/health`, () => {
    return HttpResponse.json({ status: 'healthy', version: '2.5.5' });
  }),

  // Assets list
  http.get(`${BASE_URL}/assets/:namespace`, ({ request }) => {
    const url = new URL(request.url);
    const page = Number(url.searchParams.get('page') ?? 1);
    const limit = Number(url.searchParams.get('limit') ?? 20);

    return HttpResponse.json({
      data: [
        { mac_address: 'AABBCCDDEEFF', name: 'Asset 1' },
        { mac_address: '112233445566', name: 'Asset 2' },
      ],
      page,
      limit,
      total: 2,
      totalPages: 1,
      hasNext: false,
      hasPrev: false,
    });
  }),

  // Asset get
  http.get(`${BASE_URL}/assets/:namespace/:mac`, ({ params }) => {
    return HttpResponse.json({
      mac_address: params.mac,
      name: 'Test Asset',
    });
  }),

  // Asset create
  http.post(`${BASE_URL}/assets/:namespace/:mac`, async ({ request }) => {
    const body = await request.json();
    return HttpResponse.json(body, { status: 201 });
  }),

  // Asset update
  http.patch(`${BASE_URL}/assets/:namespace/:mac`, async ({ request, params }) => {
    const body = await request.json() as Record<string, unknown>;
    return HttpResponse.json({
      mac_address: params.mac,
      ...body,
    });
  }),

  // Asset delete
  http.delete(`${BASE_URL}/assets/:namespace/:mac`, () => {
    return new HttpResponse(null, { status: 204 });
  }),

  // Positions
  http.get(`${BASE_URL}/cache/:namespace/positions`, () => {
    return HttpResponse.json([
      { mac_address: 'AABBCCDDEEFF', lat: 48.8566, lon: 2.3522 },
    ]);
  }),

  http.get(`${BASE_URL}/cache/:namespace/positions/:mac`, ({ params }) => {
    return HttpResponse.json({
      mac_address: params.mac,
      lat: 48.8566,
      lon: 2.3522,
    });
  }),

  // Venues
  http.get(`${BASE_URL}/venues/:namespace`, () => {
    return HttpResponse.json({
      data: [{ id: 'venue-1', name: 'Test Venue' }],
      page: 1,
      limit: 20,
      total: 1,
      totalPages: 1,
      hasNext: false,
      hasPrev: false,
    });
  }),

  http.get(`${BASE_URL}/venues/:namespace/:venueId`, ({ params }) => {
    return HttpResponse.json({
      id: params.venueId,
      name: 'Test Venue',
    });
  }),

  // Zones
  http.get(`${BASE_URL}/venues/:namespace/:venueId/zones`, () => {
    return HttpResponse.json({
      data: [{ id: 'zone-1', name: 'Test Zone' }],
      page: 1,
      limit: 20,
      total: 1,
      totalPages: 1,
      hasNext: false,
      hasPrev: false,
    });
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
