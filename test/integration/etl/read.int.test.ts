/**
 * ETL live read tests (tier R, P7 §9.1): R1–R4, R6–R10, R12, R13.
 *
 * The only non-GET requests are the two parseHeaders calls (R6, R7), which store nothing and write no activity
 * entry. R7 asserts USI-P7-21 (the sample workbook cannot be previewed) instead of the preview of P7 §9.1 until
 * that issue is resolved. No upload is sent from this file. Bodies of listAll() and activities are never logged;
 * entries the run did not create are checked for shape only.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll } from 'vitest';
import {
  AuthorizationError,
  collectAll,
  ContextError,
  NotFoundError,
  ServerError,
  ValidationError,
  type EtlActivity,
  type EtlMappingProfile,
  type RtlsClient,
} from '../../../src';
import {
  createLiveClient,
  describeLive,
  expectKnownServerIssue,
  getHarness,
  recordFact,
  recordFixture,
  requestLog,
  runId,
  testMac,
  testName,
} from '../harness';
import { createPreScrub } from './support';

const HEX24 = /^[0-9a-f]{24}$/;
const ACTIONS = ['create', 'update', 'delete', 'upload'];
const SAMPLE_XLSX = resolve(__dirname, '../../fixtures/etl/inputs/sample.xlsx');

/** A well-formed ObjectId that no profile has (random, never hard-coded). */
function randomObjectId(): string {
  let out = '';
  for (let i = 0; i < 24; i += 1) out += Math.floor(Math.random() * 16).toString(16);
  return out;
}

/** Pre-scrub of every recorded body (§8.5, `./support`). */
const preScrub = createPreScrub(runId);

/** Records the body of the last request of the test as an ETL fixture (`--record` runs only). */
async function recordLast(
  name: string,
  operation: string,
  body: unknown,
  note: string
): Promise<void> {
  const last = requestLog().at(-1);
  if (last?.status === undefined) throw new Error(`recordLast(${name}): no answered request`);
  await recordFixture(
    'etl',
    name,
    {
      operation,
      status: last.status,
      headers: last.responseHeaders ? new Headers(last.responseHeaders) : undefined,
      body: preScrub(body),
    },
    note
  );
}

function expectProfileShape(p: EtlMappingProfile): void {
  expect(p._id).toMatch(HEX24);
  expect(typeof p.name).toBe('string');
  expect(typeof p.mappings).toBe('object');
  expect(p.mappings).not.toBeNull();
  expect(Array.isArray(p.keyColumns)).toBe(true);
  expect(Array.isArray(p.requiredFields)).toBe(true);
  expect(p.defaults === undefined || (typeof p.defaults === 'object' && p.defaults !== null)).toBe(
    true
  );
  expect(Number.isNaN(Date.parse(p.created_at))).toBe(false);
  expect(Number.isNaN(Date.parse(p.updated_at))).toBe(false);
}

function expectActivityShape(a: EtlActivity): void {
  expect(a._id).toMatch(HEX24);
  expect(ACTIONS).toContain(a.action);
  expect(Number.isNaN(Date.parse(a.timestamp))).toBe(false);
}

describeLive(
  'R',
  'etl read',
  () => {
    let client: RtlsClient;
    let NAMESPACE: string;

    beforeAll(() => {
      client = createLiveClient();
      NAMESPACE = getHarness().env.namespace;
    });

    it('R1 listAll returns well-formed profiles', async () => {
      const all = await client.etl.mappingProfiles.listAll();
      expect(Array.isArray(all)).toBe(true);
      for (const p of all) expectProfileShape(p);
      recordFact('etl.listAll.count', all.length);
    });

    it('R2 list filters by applicationId on the server', async () => {
      const scoped = await client.etl.mappingProfiles.list();
      const all = await client.etl.mappingProfiles.listAll();
      expect(Array.isArray(scoped)).toBe(true);
      expect(scoped.every((p) => p.applicationId === NAMESPACE)).toBe(true);
      const expected = all
        .filter((p) => p.applicationId === NAMESPACE)
        .map((p) => p._id)
        .sort();
      expect(scoped.map((p) => p._id).sort()).toEqual(expected);
      recordFact('etl.list.count', scoped.length);
    });

    it('R3 get of an unknown id is NotFoundError', async () => {
      const call = client.etl.mappingProfiles.get(randomObjectId());
      let caught: unknown;
      await expect(call).rejects.toSatisfy((e: unknown) => {
        caught = e;
        return e instanceof NotFoundError;
      });
      expect(caught).toMatchObject({ status: 404, message: 'Mapping profile not found' });
      await recordLast(
        'error-not-found',
        'GET /etl/mapping-profiles/{id}',
        (caught as NotFoundError).body,
        '404 of a get with an absent or invisible id (recorded live, R3). The spec declares no 404 for this route.'
      );
    });

    it('R4 get of a non-ObjectId id answers 500 (USI-P7-8)', async () => {
      await expectKnownServerIssue(
        'USI-P7-8',
        'non-ObjectId profile id answers 500 instead of 404',
        async () => {
          const call = client.etl.mappingProfiles.get('not-an-id');
          await expect(call).rejects.toBeInstanceOf(ServerError);
          await expect(call).rejects.toMatchObject({ status: 500 });
        }
      );
    });

    it('R6 parseHeaders strips the CSV BOM and lower-cases the extension', async () => {
      const mac = testMac(44);
      const preview = await client.etl.parseHeaders({
        data: '﻿MAC,Name\n' + mac + ',x\n',
        filename: `${testName('etl-headers')}.CSV`,
      });
      expect(preview.columns).toEqual(['MAC', 'Name']);
      expect(preview.sampleData).toEqual([{ MAC: mac, Name: 'x' }]);
      await recordLast(
        'sheet-preview-csv',
        'POST /etl/parse-excel-headers',
        preview,
        'Header preview of a two-column CSV (recorded live, R6): columns from the header row, sampleData as strings. The spec declares no response schema for this route.'
      );
    });

    it('R7 parseHeaders of the sample workbook is refused (USI-P7-21)', async () => {
      const bytes = readFileSync(SAMPLE_XLSX);
      const file = new File([new Uint8Array(bytes)], `${testName('etl-headers')}.xlsx`);
      // P7 §9.1 R7 expects columns ['MAC', 'Name'] and the sample row; restore that once USI-P7-21 is resolved
      // (the recorded sheet-preview-xlsx fixture stays the server-code one until then).
      await expectKnownServerIssue(
        'USI-P7-21',
        'the preview of the sample workbook is refused',
        async () => {
          const call = client.etl.parseHeaders(file);
          await expect(call).rejects.toBeInstanceOf(AuthorizationError);
          await expect(call).rejects.toSatisfy(
            (e: AuthorizationError) =>
              e.status === 403 && typeof e.body === 'string' && e.apiCode === undefined
          );
        }
      );
      recordFact('etl.xlsxPreview.status', requestLog().at(-1)?.status ?? null);
    });

    it('R8 activities.listPage normalises the page envelope', async () => {
      const page = await client.etl.activities.listPage({ limit: 5 });
      expect(page.data.length).toBeLessThanOrEqual(5);
      expect(page.pagination.limit).toBe(5);
      expect(page.pagination.page).toBe(1);
      expect(page.pagination.totalPages).toBe(Math.ceil(page.pagination.total / 5));
      expect(page.pagination.hasPrev).toBe(false);
      expect(page.pagination.hasNext).toBe(page.pagination.totalPages > 1);
      for (const a of page.data) expectActivityShape(a);
      recordFact('etl.activities.total', page.pagination.total);
    });

    it('R9 activities.iterate walks pages in ascending order', async () => {
      const first = await client.etl.activities.listPage({ limit: 1 });
      const items = await collectAll(
        client.etl.activities.iterate({ pageSize: 2, sortOrder: 'asc' }),
        { maxItems: 5 }
      );
      expect(items).toHaveLength(Math.min(5, first.pagination.total));
      expect(new Set(items.map((a) => a._id)).size).toBe(items.length);
      const times = items.map((a) => Date.parse(a.timestamp));
      expect(times.every((t, i) => i === 0 || t >= (times[i - 1] as number))).toBe(true);
    });

    it('R10 activities search with special characters answers a page', async () => {
      const page = await client.etl.activities.listPage({ search: 'sdk-test.(', limit: 5 });
      expect(Array.isArray(page.data)).toBe(true);
      expect(page.pagination.page).toBe(1);
      expect(page.data.length).toBeLessThanOrEqual(5);
    });

    it('R12 local validation sends no request', async () => {
      const before = requestLog().length;
      const etl = client.etl;
      await expect(etl.parseHeaders(new Blob(['x']))).rejects.toBeInstanceOf(ValidationError);
      await expect(etl.parseHeaders({ data: 'x', filename: 'a.txt' })).rejects.toBeInstanceOf(
        ValidationError
      );
      await expect(
        etl.upload({ data: 'MAC,Name\n', filename: 'a.csv' }, [])
      ).rejects.toBeInstanceOf(ValidationError);
      await expect(etl.activities.listPage({ limit: 0 })).rejects.toBeInstanceOf(ValidationError);
      await expect(etl.activities.iterate({ pageSize: 0 }).next()).rejects.toBeInstanceOf(
        ValidationError
      );
      await expect(etl.mappingProfiles.create({ name: ' ', mappings: {} })).rejects.toBeInstanceOf(
        ValidationError
      );
      await expect(etl.mappingProfiles.get('')).rejects.toBeInstanceOf(ValidationError);
      await expect(
        etl.mappingProfiles.update(randomObjectId(), { updated_at: 'nope' })
      ).rejects.toBeInstanceOf(ValidationError);
      // The remaining local checks of §6, one call each (no request either).
      await expect(etl.parseHeaders({ data: 'x', filename: '' })).rejects.toMatchObject({
        details: ['file'],
      });
      await expect(etl.parseHeaders('a.csv' as never)).rejects.toMatchObject({
        details: ['file'],
      });
      await expect(
        etl.upload({ data: 'MAC,Name\n', filename: 'a.csv' }, [''])
      ).rejects.toMatchObject({ details: ['mappingProfileIds'] });
      await expect(
        etl.upload({ data: 'MAC,Name\n', filename: 'a.csv' }, [randomObjectId()], {
          dryRun: 'true',
        } as never)
      ).rejects.toMatchObject({ details: ['dryRun'] });
      await expect(etl.mappingProfiles.create(null as never)).rejects.toMatchObject({
        details: ['input'],
      });
      await expect(
        etl.mappingProfiles.create({ name: testName('etl-local'), mappings: [] as never })
      ).rejects.toMatchObject({ details: ['mappings'] });
      await expect(
        etl.mappingProfiles.update(randomObjectId(), null as never)
      ).rejects.toMatchObject({ details: ['changes'] });
      await expect(
        etl.mappingProfiles.update(randomObjectId(), { updated_at: 1e20 })
      ).rejects.toMatchObject({ details: ['updated_at'] });
      await expect(
        etl.mappingProfiles.update(randomObjectId(), { name: ' ' })
      ).rejects.toMatchObject({ details: ['name'] });
      expect(requestLog().length).toBe(before);
    });

    it('R13 namespace-less client gives ContextError without a request', async () => {
      const bare = createLiveClient({ namespace: null });
      const before = requestLog().length;
      await expect(bare.etl.mappingProfiles.list()).rejects.toBeInstanceOf(ContextError);
      await expect(
        bare.etl.mappingProfiles.create({ name: testName('etl-ctx'), mappings: {} })
      ).rejects.toBeInstanceOf(ContextError);
      expect(requestLog().length).toBe(before);
    });
  },
  { feature: 'etl' }
);
