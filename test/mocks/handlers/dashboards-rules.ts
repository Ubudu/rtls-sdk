// MSW handlers of the dashboards-rules domain, owned by P5 (README §6, P5-T1): one default handler per wrapped
// operation, each answering with the 2xx fixture of test/fixtures/dashboards-rules/ (README §7.6: fixtures are
// evidence). `GET /health` stays in core.ts (P1). Tests of other answers override them with `server.use()`.
// Handlers only answer: request assertions use recordRequests() from test/mocks/server.ts.
import { http, type HttpHandler } from 'msw';
import { fixtureResponse, loadFixture } from '../../contract/fixtures';

const BASE_URL = 'https://rtls.ubudu.com/api';

const fixture = (name: string) => loadFixture('dashboards-rules', name);

const dashboard = fixture('dashboard');
const dashboardsList = fixture('dashboards-list');
const dashboardsCreated = fixture('dashboards-created');
const dashboardsShared = fixture('dashboards-shared');
const dashboardsSelected = fixture('dashboards-selected');
const dashboardCreated = fixture('dashboard-create-201');
const dashboardUpdated = fixture('dashboard-update-200');
const dashboardDeleted = fixture('dashboard-delete-204');
const dashboardShared = fixture('dashboard-share-200');
const dashboardUnshared = fixture('dashboard-unshare-200');
const alertRules = fixture('alert-rules');
const alertRulesPosted = fixture('alert-rules-post-200');
const settings = fixture('settings');
const alertEvents = fixture('alert-events');

export const handlers: HttpHandler[] = [
  // Dashboards: the fixed list routes come before `/dashboards/:id`.
  http.get(`${BASE_URL}/dashboards`, () => fixtureResponse(dashboardsList)),
  http.post(`${BASE_URL}/dashboards`, () => fixtureResponse(dashboardCreated)),
  http.get(`${BASE_URL}/dashboards/created`, () => fixtureResponse(dashboardsCreated)),
  http.get(`${BASE_URL}/dashboards/shared`, () => fixtureResponse(dashboardsShared)),
  http.get(`${BASE_URL}/dashboards/selected`, () => fixtureResponse(dashboardsSelected)),
  http.get(`${BASE_URL}/dashboards/:id`, () => fixtureResponse(dashboard)),
  http.put(`${BASE_URL}/dashboards/:id`, () => fixtureResponse(dashboardUpdated)),
  http.delete(`${BASE_URL}/dashboards/:id`, () => fixtureResponse(dashboardDeleted)),
  http.post(`${BASE_URL}/dashboards/:id/share`, () => fixtureResponse(dashboardShared)),
  http.post(`${BASE_URL}/dashboards/:id/unshare`, () => fixtureResponse(dashboardUnshared)),

  // Alert rules, settings, alert history
  http.get(`${BASE_URL}/alert_rules/:appNamespace`, () => fixtureResponse(alertRules)),
  http.post(`${BASE_URL}/alert_rules/:appNamespace`, () => fixtureResponse(alertRulesPosted)),
  http.get(`${BASE_URL}/settings/:appNamespace`, () => fixtureResponse(settings)),
  http.get(`${BASE_URL}/es/alerts/:appNamespace`, () => fixtureResponse(alertEvents)),
];
