// Write section: tier W; budget positions=0 notifications=0 ble=0 etl=0; read skips no-fixture
/**
 * Example 11: asset documents.
 *
 * Read-only: lists the first page of documents of `--mac <mac>` (default: the first asset) and prints their metadata.
 * With `--write`: creates a test asset, uploads a generated 1×1 PNG, waits for the processing job, downloads the
 * WebP thumbnail into the OS temp folder, lists the documents, deletes the document and the asset. The asset write
 * reaches the alert-rule engine, so the section first runs the rule preflight.
 *
 * Run through the guarded runner: `npm run examples:check -- 11` (read-only) or
 * `RTLS_IT_WRITES=1 npm run examples:check -- 11 --write`.
 */
import { writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NotFoundError, type RtlsClient } from 'ubudu-rtls-sdk';
import {
  getArg,
  preflightAllows,
  preflightRules,
  reportBudget,
  runExample,
  skip,
  testMac,
  testName,
} from '../shared/config.js';

/** A 67-byte 1×1 PNG. */
const PNG = Uint8Array.from(
  Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACklEQVR4nGMAAQAABQABDQottAAAAABJRU5ErkJggg==',
    'base64'
  )
);

/** The first test MAC of this example's block (65-69) whose asset does not exist yet. */
async function freeMac(client: RtlsClient, signal: AbortSignal): Promise<number> {
  for (let n = 65; n <= 69; n += 1) {
    try {
      await client.assets.get(testMac(n), { signal });
    } catch (err) {
      if (err instanceof NotFoundError) return n;
      throw err;
    }
  }
  return skip('no-fixture', 'no free test MAC (65-69)');
}

await runExample('11-asset-documents', async ({ client, config, log, signal }) => {
  // ─── Read-only part ──────────────────────────────────────────────────────────
  const mac = getArg('mac', '') || (await client.assets.list({ limit: 1, signal }))[0]?.user_udid;
  if (mac === undefined) skip('no-fixture', 'no asset in the namespace');
  const page = await client.assetDocuments.listPage(mac, { signal });
  log(`documents of ${mac}: ${page.total ?? page.items.length} (first page ${page.items.length})`);
  for (const d of page.items) {
    log(
      `  ${d.documentId} ${d.docType} ${d.contentType} ${d.sizeBytes} B versions=${d.availableVersions.join('/')}`
    );
  }

  if (!config.write) return;

  // ─── Write part (tier W) ─────────────────────────────────────────────────────
  const pf = await preflightRules(client);
  if (!preflightAllows(pf, 'assets')) {
    skip('preflight', 'asset writes could fire an alert rule or reach a linked namespace');
  }
  const n = await freeMac(client, signal);
  const assetMac = testMac(n);
  let assetCreated = false;
  let documentId: string | undefined;
  try {
    await client.assets.create(
      assetMac,
      { user_name: testName(`ex11-${n}`), model: 'sdk-test', tags: ['sdk-test'] },
      { signal }
    );
    assetCreated = true;

    const job = await client.assetDocuments.upload(
      assetMac,
      {
        file: PNG,
        filename: `${testName(`ex11-${n}`)}.png`,
        docType: 'sdk_test',
        tags: ['sdk-test'],
      },
      { signal }
    );
    documentId = job.documentId;
    log(`upload accepted: job ${job.jobId}, document ${job.documentId}`);

    const done = await client.assetDocuments.waitForJob(job.jobId, { maxWaitMs: 90_000, signal });
    if (done.status === 'failed')
      throw new Error(`processing failed: ${done.error?.message ?? ''}`);
    log(`processed: versions ${done.result?.availableVersions.join('/') ?? ''}`);

    const thumb = await client.assetDocuments.download(assetMac, job.documentId, {
      version: 'thumbnail',
      signal,
    });
    const file = join(tmpdir(), `${job.documentId}-thumbnail.webp`);
    await writeFile(file, new Uint8Array(await thumb.data.arrayBuffer()));
    log(`thumbnail (${thumb.contentType ?? 'unknown type'}) saved to ${file}`);

    const all = await client.assetDocuments.list(assetMac, { signal });
    log(`documents of the test asset: ${all.length}`);

    const deleted = await client.assetDocuments.delete(assetMac, job.documentId, { signal });
    documentId = undefined;
    log(`deleted document ${deleted.documentId}`);
  } finally {
    if (documentId !== undefined) {
      await client.assetDocuments.delete(assetMac, documentId).catch((err: unknown) => {
        if (!(err instanceof NotFoundError)) throw err;
      });
    }
    if (assetCreated) {
      await client.assets.delete(assetMac).catch((err: unknown) => {
        if (!(err instanceof NotFoundError)) throw err;
      });
      log(`deleted asset ${assetMac}`);
    }
  }
  reportBudget({ positions: 0, notifications: 0, ble: 0, etl: 0 });
});
