// MSW handlers of the core domain (P1, README §6): `GET /health` answers with the fixture
// test/fixtures/core/health-200.json, built by P0's fixtureResponse (README §7.6: fixtures are evidence). Tests of other
// answers (503, errors) override it with `server.use()`. Handlers only answer: request assertions use
// recordRequests() from test/mocks/server.ts.
import { http, type HttpHandler } from 'msw';
import { fixtureResponse, loadFixture } from '../../contract/fixtures';

const BASE_URL = 'https://rtls.ubudu.com/api';

/** `{ status: 'OK' }`: the body of a ready API (P1 §5.2). */
const health200 = loadFixture('core', 'health-200');

export const handlers: HttpHandler[] = [
  http.get(`${BASE_URL}/health`, () => fixtureResponse(health200)),
];
