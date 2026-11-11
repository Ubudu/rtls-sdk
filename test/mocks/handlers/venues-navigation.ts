// MSW handlers of the venues-navigation domain, owned by P4 (README §6). Each answers with the 2xx fixture of its
// operation in test/fixtures/venues-navigation (live captures for the venue and zone-presence routes, server-code
// bodies for navigation, P4 §8.6), built by P0's fixtureResponse. Quirk variants (paging envelope, errors, delays)
// are set per test with server.use(). Handlers only answer: request assertions use recordRequests() from
// test/mocks/server.ts.
import { http, type HttpHandler } from 'msw';
import { fixtureResponse, loadFixture } from '../../contract/fixtures';

const BASE_URL = 'https://rtls.ubudu.com/api';
const DOMAIN = 'venues-navigation';

const fixture = (name: string): (() => Response) => {
  const f = loadFixture(DOMAIN, name);
  return () => fixtureResponse(f);
};

export const handlers: HttpHandler[] = [
  // Venues (V1–V3, V5–V9)
  http.get(`${BASE_URL}/venues/:namespace`, fixture('venues-list')),
  http.get(`${BASE_URL}/venues/:namespace/:venueId`, fixture('venue-details-opening-hours')),
  http.get(`${BASE_URL}/venues/:namespace/:venueId/maps`, fixture('maps')),
  http.get(`${BASE_URL}/venues/:namespace/:venueId/zones`, fixture('zones')),
  http.get(`${BASE_URL}/venues/:namespace/:venueId/pois`, fixture('pois')),
  http.get(`${BASE_URL}/venues/:namespace/:venueId/paths`, fixture('paths')),
  http.get(`${BASE_URL}/venues/:namespace/:venueId/maps/:mapId/zones`, fixture('map-zones')),
  http.get(`${BASE_URL}/venues/:namespace/:venueId/maps/:mapId/pois`, fixture('map-pois')),
  // Zone presence (E1)
  http.get(`${BASE_URL}/es/zone_presence/:appNamespace`, fixture('zone-presence')),
  // Navigation (N1–N5)
  http.post(`${BASE_URL}/spatial/navigate/:namespace/shortest-path`, fixture('shortest-path')),
  http.post(`${BASE_URL}/spatial/navigate/:namespace/accessible-path`, fixture('accessible-path')),
  http.post(`${BASE_URL}/spatial/navigate/:namespace/multi-stop`, fixture('multi-stop')),
  http.get(`${BASE_URL}/spatial/navigate/:namespace/nearest-poi/:nodeId`, fixture('nearest-poi')),
  http.get(`${BASE_URL}/spatial/navigate/:namespace/evacuation/:nodeId`, fixture('evacuation')),
];
