// Write section: tier W; budget positions=0 notifications=0 ble=0 etl=0; read skips role
/**
 * 18 - ETL import: bulk-update existing assets from a CSV file
 *
 * Read-only part: the mapping profiles of the namespace and how many have no key column, one profile read by id, a
 * header preview of a small CSV whose MAC cells are normalised, one page of the activity log, the same log through
 * paginatePages(), and the counters of the last five uploads.
 *
 * Write part (`--write`): creates one mapping profile, edits it with the optimistic lock (and shows the refusal of
 * a stale edit), runs a DRY-RUN upload through it (no asset is read or written), and deletes the profile. It never
 * runs a writing upload; the guide shows that call.
 */
import {
  AuthorizationError,
  collectAll,
  ConflictError,
  normalizeMac,
  paginatePages,
} from 'ubudu-rtls-sdk';
import { reportBudget, runExample, skip, testName } from '../shared/config.js';

/** Key cells must match the stored form exactly: 12 lower-case hex characters. */
const SAMPLE_CSV =
  'MAC,Name\n' +
  `${normalizeMac('02:5D:4B:00:00:01')},Forklift 1\n` +
  `${normalizeMac('02-5d-4b-00-00-02')},Forklift 2\n`;

/**
 * @param {import('ubudu-rtls-sdk').RtlsClient} client
 * @param {string} namespace
 * @param {(...a: unknown[]) => void} log
 */
async function readOnly(client, namespace, log) {
  const profiles = (await client.etl.mappingProfiles.list()).filter(
    (p) => p.applicationId === namespace
  );
  log(`Mapping profiles of the namespace: ${profiles.length}`);
  for (const p of profiles) log(`  ${p.name} (key columns: ${p.keyColumns.join(', ') || 'none'})`);
  const withoutKey = profiles.filter((p) => p.keyColumns.length === 0);
  log(`Profiles without a key column (they match no asset): ${withoutKey.length}`);
  const everyProfile = await client.etl.mappingProfiles.listAll();
  log(`Mapping profiles of every applicationId: ${everyProfile.length}`);
  const firstProfile = profiles[0];
  if (firstProfile !== undefined) {
    const one = await client.etl.mappingProfiles.get(firstProfile._id);
    log(`Read by id: ${one.name}, ${Object.keys(one.mappings).length} mapped field(s)`);
  }

  const preview = await client.etl.parseHeaders({ data: SAMPLE_CSV, filename: 'etl-example.csv' });
  log(
    `Preview columns: ${preview.columns.join(', ')}; first row: ${JSON.stringify(preview.sampleData[0])}`
  );

  // One page of the activity log with its totals, then the same pages through paginatePages() (the helper
  // behind activities.iterate()), bounded to two pages.
  const page = await client.etl.activities.listPage({ page: 1, limit: 5 });
  log(`Activity log: ${page.pagination.total} entries, ${page.pagination.totalPages} page(s) of 5`);
  const twoPages = await collectAll(
    paginatePages((n, limit) => client.etl.activities.listPage({ page: n, limit }), {
      limit: 5,
      maxPages: 2,
    }),
    { maxItems: 10 }
  );
  log(`First two pages through paginatePages(): ${twoPages.length} entries`);

  const uploads = await collectAll(
    client.etl.activities.iterate({ action: 'upload', resourceType: 'file', pageSize: 10 }),
    { maxItems: 5 }
  );
  log(`Last uploads: ${uploads.length}`);
  for (const a of uploads) {
    if (a.action !== 'upload') continue;
    const s = a.details.processingStats;
    log(
      `  ${a.timestamp}: ${s ? `rows ${s.totalRows}, changed ${s.totalChanged}, errors ${s.totalErrors}` : 'no stats'}`
    );
  }
}

/**
 * Deletes the example's profile; a failure ends the run with exit 1 and names the profile id.
 *
 * @param {import('ubudu-rtls-sdk').RtlsClient} client
 * @param {string} id
 * @param {(...a: unknown[]) => void} log
 */
async function deleteProfile(client, id, log) {
  try {
    await client.etl.mappingProfiles.delete(id);
  } catch (error) {
    throw new Error(`could not delete ETL mapping profile ${id}`, { cause: error });
  }
  log('Deleted the profile.');
}

/**
 * @param {import('ubudu-rtls-sdk').RtlsClient} client
 * @param {(...a: unknown[]) => void} log
 */
async function writeSection(client, log) {
  const profile = await client.etl.mappingProfiles.create({
    name: testName('etl-example'),
    description: 'example 18',
    mappings: {
      user_udid: { sourceColumn: 'MAC' },
      user_name: { sourceColumn: 'Name', transformation: 'trim', required: true },
    },
    keyColumns: ['MAC'],
  });
  log(`Created profile ${profile.name} for namespace ${profile.applicationId ?? '(none)'}`);
  try {
    const edited = await client.etl.mappingProfiles.update(profile._id, {
      description: 'example 18, edited',
      updated_at: profile.updated_at,
    });
    log(`Edited with the lock: ${edited.description ?? ''}`);

    try {
      await client.etl.mappingProfiles.update(profile._id, {
        description: 'stale edit',
        updated_at: profile.updated_at,
      });
      throw new Error('a stale edit was accepted');
    } catch (error) {
      if (!(error instanceof ConflictError)) throw error;
      const current = /** @type {import('ubudu-rtls-sdk').EtlStaleWriteBody} */ (error.body)
        .current;
      log(`Stale edit refused (409); stored version is from ${current.updated_at}`);
    }

    const dry = await client.etl.upload(
      { data: SAMPLE_CSV, filename: `${testName('etl-example')}.csv` },
      profile._id,
      { dryRun: true }
    );
    log('Dry run (counters count rows that passed validation; no asset was matched or written):');
    for (const p of dry.results.processedProfiles) {
      log(
        `  ${p.profileName}: processed ${p.rowsProcessed}, would change ${p.rowsChanged}, skipped ${p.rowsSkipped}, errors ${p.errors.length}`
      );
      for (const e of p.errors) log(`    row ${e.rowIndex ?? '-'}: ${e.message}`);
    }
  } finally {
    await deleteProfile(client, profile._id, log);
  }
  reportBudget({});
}

await runExample('18-etl-import', async ({ client, config, log }) => {
  try {
    await readOnly(client, config.namespace, log);
  } catch (error) {
    if (error instanceof AuthorizationError && error.apiCode === 'insufficient_role') {
      skip('role', 'API key lacks access_data_import; create a new key after the role is granted');
    }
    throw error;
  }
  if (config.write) await writeSection(client, log);
  else log('Write section not run (pass --write).');
});
