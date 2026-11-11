// MSW handlers of the etl domain, owned by P7 (README §6): the default happy path of every wrapped ETL operation,
// answered with the fixtures of test/fixtures/etl (P7 §8.5) through P0's fixtureResponse. Tests of other answers
// (errors, other bodies) override them with `server.use()`. Handlers only answer: request assertions use
// recordRequests() from test/mocks/server.ts.
import { http, type HttpHandler } from 'msw';
import { fixtureResponse, loadFixture } from '../../contract/fixtures';

const BASE_URL = 'https://rtls.ubudu.com/api';

const fixture = (name: string): ReturnType<typeof loadFixture> => loadFixture('etl', name);

const profileList = fixture('mapping-profile-list');
const profileListAll = fixture('mapping-profile-list-all');
const profileGet = fixture('mapping-profile-get');
const profileCreated = fixture('mapping-profile');
const profileUpdated = fixture('mapping-profile-updated');
const profileDeleted = fixture('mapping-profile-delete-204');
const activitiesPage = fixture('activities-page');
const uploadDryRun = fixture('upload-result-dry-run');
const uploadWrite = fixture('upload-result-write');
const previewCsv = fixture('sheet-preview-csv');
const previewXlsx = fixture('sheet-preview-xlsx');

/** The `file` part of a multipart request, or `null`. */
async function filePart(request: Request): Promise<File | null> {
  const part = (await request.formData()).get('file');
  return typeof part === 'string' ? null : part;
}

export const handlers: HttpHandler[] = [
  http.get(`${BASE_URL}/etl/mappings`, () => fixtureResponse(profileList)),
  http.get(`${BASE_URL}/etl/mapping-profiles`, () => fixtureResponse(profileListAll)),
  http.post(`${BASE_URL}/etl/mapping-profiles`, () => fixtureResponse(profileCreated)),
  http.get(`${BASE_URL}/etl/mapping-profiles/:id`, () => fixtureResponse(profileGet)),
  http.put(`${BASE_URL}/etl/mapping-profiles/:id`, () => fixtureResponse(profileUpdated)),
  http.delete(`${BASE_URL}/etl/mapping-profiles/:id`, () => fixtureResponse(profileDeleted)),
  http.get(`${BASE_URL}/etl/activities`, () => fixtureResponse(activitiesPage)),
  // A dry run (`debugMode` 'true') answers the dry-run body, anything else the writing-import body.
  http.post(`${BASE_URL}/etl/upload`, async ({ request }) => {
    const debugMode = (await request.formData()).get('debugMode');
    return fixtureResponse(debugMode === 'true' ? uploadDryRun : uploadWrite);
  }),
  // The server reads the part as CSV only when its MIME type is exactly text/csv (USI-P7-5).
  http.post(`${BASE_URL}/etl/parse-excel-headers`, async ({ request }) => {
    const file = await filePart(request);
    return fixtureResponse(file?.type === 'text/csv' ? previewCsv : previewXlsx);
  }),
];
