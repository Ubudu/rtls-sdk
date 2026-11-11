/**
 * ETL live lifecycle (tiers W and S, ordered; P7 §9.2): W0–W3, W5–W14 incl. W12b, and S1–S5 nested between W11
 * and W12.
 *
 * W steps write ETL profiles and dry-run activity entries only; they never read or write assets. The S block holds
 * the run's single writing upload (S2, counted by the guard, G7) on an asset the run created (S1) and deletes it
 * (S5). Its afterAll replays only its own cleanups, so W1's profile stays until W12 deletes it. Nothing is retried.
 * Bodies of listAll() and activities are never logged; entries the run did not create are checked for shape only.
 */
import { beforeAll } from 'vitest';
import {
  ConflictError,
  NotFoundError,
  type EtlActivity,
  type EtlMappingProfile,
  type EtlProfileActivity,
  type EtlStaleWriteBody,
  type EtlUploadActivity,
  type EtlUploadResult,
  type RtlsClient,
} from '../../../src';
import { pollUntil } from '../../../src/utils/poll';
import {
  budgetReport,
  createLiveClient,
  createTestAsset,
  describeLive,
  getHarness,
  rawRequest,
  recordFact,
  recordFixture,
  registerCleanup,
  requestLog,
  runId,
  testMac,
  testName,
} from '../harness';
import { createPreScrub } from './support';

const HEX24 = /^[0-9a-f]{24}$/;
const ROW_ERROR = "Required field 'user_name' has invalid or empty value";

/** Pre-scrub of every recorded body (§8.5, `./support`); the profile is id 01. */
const preScrub = createPreScrub(runId);

/** Records a body of the run's own entities as an ETL fixture (`--record` runs only). */
async function record(
  name: string,
  operation: string,
  body: unknown,
  note: string,
  status?: number
): Promise<void> {
  const last = requestLog().at(-1);
  const answered = status ?? last?.status;
  if (answered === undefined) throw new Error(`record(${name}): no answered request`);
  await recordFixture(
    'etl',
    name,
    {
      operation,
      status: answered,
      headers:
        status === undefined && last?.responseHeaders
          ? new Headers(last.responseHeaders)
          : undefined,
      body: preScrub(body),
    },
    note
  );
}

/** Status of the last request of the test (the SDK resolves bodies only). */
function lastStatus(): number | undefined {
  return requestLog().at(-1)?.status;
}

async function expectRejection<E extends Error>(
  call: Promise<unknown>,
  cls: new (...args: never[]) => E
): Promise<E> {
  let caught: unknown;
  await expect(call).rejects.toSatisfy((e: unknown) => {
    caught = e;
    return e instanceof cls;
  });
  return caught as E;
}

function isUpload(a: EtlActivity): a is EtlUploadActivity {
  return a.action === 'upload';
}

describeLive(
  'W',
  'etl lifecycle',
  () => {
    let client: RtlsClient;
    let NAMESPACE: string;
    const P = testName('etl-profile');
    const runStart = Date.now();
    /** Local tally of the activity-producing calls (W13). */
    const tally = { profileEntries: 0, uploadFilenames: [] as string[] };
    /** W0: updated_at of every profile the run did not create. */
    const foreign = new Map<string, string>();
    let w1: EtlMappingProfile;
    let id = '';
    let w9: EtlUploadResult | undefined;
    let w10: EtlUploadResult | undefined;
    let s2: EtlUploadResult | undefined;
    let profileEntry: EtlProfileActivity | undefined;

    beforeAll(async () => {
      client = createLiveClient();
      NAMESPACE = getHarness().env.namespace;
      // W0: in-memory image of the profiles the run did not create (never logged).
      for (const p of await client.etl.mappingProfiles.listAll()) {
        if (!p.name.startsWith('sdk-test-')) foreign.set(p._id, p.updated_at);
      }
    });

    it('W1 create sends the namespace as applicationId', async () => {
      const created = await client.etl.mappingProfiles.create({
        name: P,
        description: 'sdk-test',
        mappings: {
          user_udid: { sourceColumn: 'MAC' },
          user_name: { sourceColumn: 'Name', transformation: 'trim', required: true },
          'data.sdk_test_note': { sourceColumn: 'Note' },
        },
        keyColumns: ['MAC'],
      });
      const status = lastStatus();
      id = created._id;
      registerCleanup({
        label: `etl profile ${P}`,
        request: { method: 'DELETE', path: `/etl/mapping-profiles/${id}` },
        verify: { path: `/etl/mapping-profiles/${id}`, goneStatus: [404] },
      });
      w1 = created;
      tally.profileEntries += 1;
      expect(status).toBe(201);
      expect(created._id).toMatch(HEX24);
      expect(created.name).toBe(P);
      expect(created.description).toBe('sdk-test');
      expect(created.applicationId).toBe(NAMESPACE);
      expect(created.sourceType).toBe('excel');
      expect(created.keyColumns).toEqual(['MAC']);
      expect(created.requiredFields).toEqual([]);
      expect('defaults' in created).toBe(false);
      expect(typeof created.userId).toBe('string');
      expect(created.userId).not.toBe('');
      const createdAt = Date.parse(created.created_at);
      const updatedAt = Date.parse(created.updated_at);
      expect(Number.isNaN(createdAt)).toBe(false);
      expect(updatedAt).toBeGreaterThanOrEqual(createdAt);
      await record(
        'mapping-profile',
        'POST /etl/mapping-profiles',
        created,
        '201 body of a create (recorded live, W1): stored profile with server-assigned _id, userId, created_at, updated_at and __v 0; no defaults key (empty objects are dropped). The spec MappingProfile schema is wrong (USI-P7-1).'
      );
    });

    it('W2 get returns the created profile', async () => {
      const got = await client.etl.mappingProfiles.get(id);
      expect(got).toEqual(w1);
      await record(
        'mapping-profile-get',
        'GET /etl/mapping-profiles/{id}',
        got,
        '200 body of a get by id (recorded live, W2): same document as the create answer. The spec MappingProfile schema is wrong (USI-P7-1).'
      );
    });

    it('W3 list and listAll both contain the profile', async () => {
      const scoped = await client.etl.mappingProfiles.list();
      const all = await client.etl.mappingProfiles.listAll();
      expect(scoped.map((p) => p._id)).toContain(id);
      expect(all.map((p) => p._id)).toContain(id);
      expect(scoped.map((p) => p._id).sort()).toEqual(
        all
          .filter((p) => p.applicationId === NAMESPACE)
          .map((p) => p._id)
          .sort()
      );
      await record(
        'mapping-profile-list',
        'GET /etl/mappings',
        scoped.filter((p) => p._id === id),
        '200 body of the namespace listing GET /etl/mappings?applicationId= (recorded live, W3), narrowed to the run profile. The spec MappingProfile schema is wrong (USI-P7-1).',
        200
      );
    });

    it('W5 update with the current updated_at changes the profile', async () => {
      const updated = await client.etl.mappingProfiles.update(id, {
        description: 'sdk-test updated',
        updated_at: w1.updated_at,
      });
      tally.profileEntries += 1;
      expect(updated._id).toBe(id);
      expect(updated.description).toBe('sdk-test updated');
      expect(Date.parse(updated.updated_at)).toBeGreaterThan(Date.parse(w1.updated_at));
      await record(
        'mapping-profile-updated',
        'PUT /etl/mapping-profiles/{id}',
        updated,
        '200 body of an update with a matching updated_at (recorded live, W5): the stored profile after the write. The spec MappingProfile schema is wrong (USI-P7-1).'
      );
    });

    it('W6 update with a stale updated_at is ConflictError and writes nothing', async () => {
      const err = await expectRejection(
        client.etl.mappingProfiles.update(id, {
          description: 'stale',
          updated_at: new Date(w1.updated_at),
        }),
        ConflictError
      );
      expect(err).toMatchObject({ status: 409, apiCode: 'stale_write' });
      const body = err.body as EtlStaleWriteBody;
      expect(body.current._id).toBe(id);
      expect(body.current.description).toBe('sdk-test updated');
      await record(
        'error-stale-write',
        'PUT /etl/mapping-profiles/{id}',
        body,
        '409 of an update whose updated_at differs from the stored one (recorded live, W6): code-like error plus the stored profile under current; nothing is written. The spec declares no 409.'
      );
      expect((await client.etl.mappingProfiles.get(id)).description).toBe('sdk-test updated');
    });

    it('W7 update without a lock replaces mappings wholesale', async () => {
      const updated = await client.etl.mappingProfiles.update(id, {
        mappings: {
          user_udid: { sourceColumn: 'MAC' },
          user_name: { sourceColumn: 'Name', transformation: 'trim', required: true },
        },
      });
      tally.profileEntries += 1;
      expect(Object.keys(updated.mappings).sort()).toEqual(['user_name', 'user_udid']);
    });

    it('W8 activities list one create and two updates of the profile', async () => {
      const page = await client.etl.activities.listPage({
        resourceType: 'mapping',
        search: P,
        limit: 50,
      });
      const mine = page.data.filter((a) => a.resourceId === id);
      expect(mine).toHaveLength(3);
      expect(mine.map((a) => a.action).sort()).toEqual(['create', 'update', 'update']);
      for (const a of mine) {
        expect(a.resourceType).toBe('mapping');
        expect(a.details).toMatchObject({ name: P, applicationId: NAMESPACE });
      }
      profileEntry = mine.find((a): a is EtlProfileActivity => a.action === 'create');
    });

    it('W9 dry run of a CSV string with a BOM', async () => {
      const result = await client.etl.upload(
        {
          data:
            '﻿MAC,Name,Note\n' +
            `${testMac(42)},${testName('etl-row1')},first\n` +
            `${testMac(43)},,second\n`,
          filename: `${testName('etl-dry')}.csv`,
        },
        id,
        { dryRun: true }
      );
      w9 = result;
      tally.uploadFilenames.push(result.filename);
      expect(lastStatus()).toBe(201);
      expect(result._id).toMatch(HEX24);
      expect(result.debugMode).toBe(true);
      expect(result.results.debugMode).toBe(true);
      expect(result.status).toBe('completed');
      expect(result.results.totalRows).toBe(2);
      expect(result.results.processedProfiles).toHaveLength(1);
      expect(result.results.processedProfiles[0]).toMatchObject({
        profileId: id,
        rowsProcessed: 2,
        rowsChanged: 1,
        rowsSkipped: 0,
        unassociated: 0,
      });
      expect(result.results.processedProfiles[0]?.errors).toEqual([
        { rowIndex: 2, message: ROW_ERROR },
      ]);
      await record(
        'upload-result-dry-run',
        'POST /etl/upload',
        result,
        '201 body of a dry run (debugMode true) with one valid row and one row whose required field is empty (recorded live, W9): success is always true; row errors appear only per profile (USI-P7-2, USI-P7-11). The spec UploadResult schema is wrong (USI-P7-1).'
      );
    });

    it('W10 dry run of CSV bytes with an upper-case extension and an explicit timeout', async () => {
      // P7 §9.2 sends sample.xlsx here; the sample workbook is refused (USI-P7-21, R7), so the bytes form, the
      // upper-case extension and the explicit timeout are exercised with CSV bytes instead.
      const bytes = new TextEncoder().encode(`MAC,Name\n${testMac(46)},${testName('etl-row2')}\n`);
      const result = await client.etl.upload(
        { data: bytes, filename: `${testName('etl-dry2')}.CSV` },
        [id],
        { dryRun: true, timeoutMs: 120_000 }
      );
      w10 = result;
      tally.uploadFilenames.push(result.filename);
      expect(result.debugMode).toBe(true);
      expect(result.filename).toBe(`${testName('etl-dry2')}.csv`);
      expect(result.results.processedProfiles[0]).toMatchObject({
        profileId: id,
        rowsProcessed: 1,
        rowsChanged: 1,
        errors: [],
      });
    });

    it('W11 activities list the two dry-run uploads', async () => {
      const ids = [w9?._id, w10?._id];
      expect(ids.every((x) => typeof x === 'string')).toBe(true);
      // The entry is completed when the upload answers; a short bounded poll absorbs a late completion.
      const entries = await pollUntil(
        async () =>
          (
            await client.etl.activities.listPage({
              action: 'upload',
              resourceType: 'file',
              limit: 20,
            })
          ).data,
        (data) =>
          ids.every((x) =>
            data.some((a) => a.resourceId === x && isUpload(a) && a.details.status !== 'processing')
          ),
        { intervalMs: 1000, backoff: 1, timeoutMs: 10_000 }
      );
      for (const result of [w9, w10] as EtlUploadResult[]) {
        const entry = entries.find((a) => a.resourceId === result._id);
        expect(entry?.action).toBe('upload');
        expect(entry?.resourceType).toBe('file');
        const details = (entry as EtlUploadActivity).details;
        const profile = result.results.processedProfiles[0];
        expect(details.debugMode).toBe(true);
        expect(details.status).toBe('completed');
        expect(details.processingStats?.totalChanged).toBe(profile?.rowsChanged);
        expect(details.processingStats?.totalErrors).toBe(profile?.errors.length);
      }
      const uploadEntry = entries.find((a) => a.resourceId === w9?._id);
      expect(profileEntry?.resourceId).toBe(id);
      await record(
        'activities-page',
        'GET /etl/activities',
        {
          activities: [profileEntry, uploadEntry],
          pagination: { total: 2, page: 1, limit: 10, pages: 1 },
        },
        '200 body of the activity log (recorded live, W8 + W11): the run profile create entry and the W9 dry-run upload entry, re-wrapped in one page with recomputed pagination. The spec activity enums are wrong (USI-P7-1, USI-P7-10).',
        200
      );
    });

    describeLive(
      'S',
      'etl write',
      () => {
        let assetReady = false;
        const mac = testMac(41);
        const renamed = testName('etl-renamed');

        it('S1 creates the run test asset', async () => {
          const asset = await createTestAsset(41, 'etl-asset');
          expect(asset.mac).toBe(mac);
          expect(asset.mac).toMatch(/^025d4b[0-9a-f]{6}$/);
          assetReady = true;
        });

        it('S2 writing upload renames the run asset (the only writing upload)', async () => {
          expect(assetReady).toBe(true);
          expect(budgetReport().etlWrites.used).toBe(0);
          const result = await client.etl.upload(
            new File([`MAC,Name\n${mac},${renamed}\n`], `${testName('etl-write')}.csv`, {
              type: 'text/plain',
            }),
            id
          );
          s2 = result;
          tally.uploadFilenames.push(result.filename);
          expect(result.debugMode).toBe(false);
          expect(result.results.processedProfiles[0]).toMatchObject({
            profileId: id,
            rowsProcessed: 1,
            rowsChanged: 1,
            rowsSkipped: 0,
            unassociated: 0,
            errors: [],
          });
          expect(budgetReport().etlWrites.used).toBe(1);
          recordFact(
            'etl.s2.unassociated',
            result.results.processedProfiles[0]?.unassociated ?? null
          );
          await record(
            'upload-result-write',
            'POST /etl/upload',
            result,
            '201 body of a writing upload (debugMode false) that updated one existing asset (recorded live, S2): success is always true; counters per profile (USI-P7-2). The spec UploadResult schema is wrong (USI-P7-1).'
          );
        });

        it('S3 the asset carries the imported name', async () => {
          expect(s2?.debugMode).toBe(false);
          const asset = await pollUntil(
            async () =>
              (await rawRequest('GET', `/assets/{ns}/${mac}`)).json as
                Record<string, unknown> | undefined,
            (a) => a?.user_name === renamed,
            { intervalMs: 1000, backoff: 1, timeoutMs: 10_000 }
          );
          expect(asset?.user_name).toBe(renamed);
          expect(asset?.user_udid).toBe(mac);
        });

        it('S4 the activity log holds the writing upload', async () => {
          // Same bounded poll as W11: one request when the entry is already completed.
          const data = await pollUntil(
            async () =>
              (
                await client.etl.activities.listPage({
                  action: 'upload',
                  resourceType: 'file',
                  limit: 20,
                })
              ).data,
            (d) =>
              d.some(
                (a) => a.resourceId === s2?._id && isUpload(a) && a.details.status !== 'processing'
              ),
            { intervalMs: 1000, backoff: 1, timeoutMs: 10_000 }
          );
          const entry = data.find((a) => a.resourceId === s2?._id);
          expect(entry?.action).toBe('upload');
          const details = (entry as EtlUploadActivity).details;
          expect(details.debugMode).toBe(false);
          expect(details.processingStats?.totalChanged).toBe(1);
          expect(details.applicationId).toBe(NAMESPACE);
        });

        it('S5 deletes the run test asset', async () => {
          const del = await rawRequest('DELETE', `/assets/{ns}/${mac}`);
          expect(del.status).toBe(200);
          expect((await rawRequest('GET', `/assets/{ns}/${mac}`)).status).toBe(404);
        });
      },
      { requires: ['W'], ruleEngine: true, feature: 'etl' }
    );

    it('W12 delete removes the profile; a second delete is NotFoundError', async () => {
      await expect(client.etl.mappingProfiles.delete(id)).resolves.toBeUndefined();
      tally.profileEntries += 1;
      expect(lastStatus()).toBe(204);
      await record(
        'mapping-profile-delete-204',
        'DELETE /etl/mapping-profiles/{id}',
        null,
        '204 of a delete by the creator (recorded live, W12): empty body. The spec declares no 204 body shape.'
      );
      const gone = await expectRejection(client.etl.mappingProfiles.get(id), NotFoundError);
      expect(gone.status).toBe(404);
      const again = await expectRejection(client.etl.mappingProfiles.delete(id), NotFoundError);
      expect(again.status).toBe(404);
    });

    it('W12b an upload through the deleted profile is rejected before any work', async () => {
      const err = await expectRejection(
        client.etl.upload(
          { data: `MAC,Name\n${testMac(45)},x\n`, filename: `${testName('etl-rejected')}.csv` },
          id,
          { dryRun: true }
        ),
        NotFoundError
      );
      expect(err).toMatchObject({ status: 404, message: 'Mapping profile not found' });
    });

    it('W13 residue audit: activity entries equal the local tally', async () => {
      const page = await client.etl.activities.listPage({
        resourceType: 'mapping',
        search: P,
        limit: 50,
      });
      const profileEntries = page.data.filter((a) => a.resourceId === id);
      expect(profileEntries.map((a) => a.action).sort()).toEqual([
        'create',
        'delete',
        'update',
        'update',
      ]);
      expect(profileEntries).toHaveLength(tally.profileEntries);

      const prefix = testName('etl');
      const cutoff = runStart - 5 * 60_000;
      const filenames: string[] = [];
      for await (const a of client.etl.activities.iterate({
        action: 'upload',
        resourceType: 'file',
        sortOrder: 'desc',
        pageSize: 20,
      })) {
        if (Date.parse(a.timestamp) < cutoff) break;
        if (isUpload(a) && a.details.filename.startsWith(prefix))
          filenames.push(a.details.filename);
      }
      expect([2, 3]).toContain(filenames.length);
      expect(filenames.some((f) => f.startsWith(testName('etl-rejected')))).toBe(false);
      expect([...filenames].sort()).toEqual([...tally.uploadFilenames].sort());
      recordFact('etl.residue.activityEntries', profileEntries.length + filenames.length);
    });

    it('W14 profiles the run did not create are unchanged', async () => {
      const all = await client.etl.mappingProfiles.listAll();
      const after = new Map<string, string>();
      for (const p of all) if (!p.name.startsWith('sdk-test-')) after.set(p._id, p.updated_at);
      expect([...after.entries()].sort()).toEqual([...foreign.entries()].sort());
      recordFact(
        'etl.sdkTestProfilesAfterRun',
        all.filter((p) => p.name.startsWith('sdk-test-')).length
      );
    });
  },
  { feature: 'etl' }
);
