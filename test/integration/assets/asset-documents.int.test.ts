// P2 §9.3: live tests of client.assetDocuments. Tier R: the empty list of a never-used test MAC, an unknown job, and
// every local-validation case (the upload type-resolution branches are reached without a request because the tag
// check runs last). Tier W: the lifecycle on test MAC m5 with a 67-byte 1×1 PNG; the document's delete is registered
// after the asset's, so the registry removes it first. Metadata is asserted, never logged.
import { randomUUID } from 'node:crypto';
import { beforeAll } from 'vitest';
import {
  NotFoundError,
  ValidationError,
  type DocumentUploadInput,
  type RtlsClient,
} from '../../../src';
import {
  createLiveClient,
  denyAll,
  describeLive,
  expectKnownServerIssue,
  registerCleanup,
  requestLog,
  runId,
  testMac,
  testName,
  withRequestGuard,
} from '../harness';

/** A 67-byte 1×1 RGBA PNG. */
const PNG = Uint8Array.from(
  Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACklEQVR4nGMAAQAABQABDQottAAAAABJRU5ErkJggg==',
    'base64'
  )
);

async function expectLocalValidation(fn: () => Promise<unknown>): Promise<ValidationError> {
  const before = requestLog().length;
  const g = await withRequestGuard(denyAll, fn);
  expect(g.error).toBeInstanceOf(ValidationError);
  expect(g.attempts).toHaveLength(0);
  expect(requestLog()).toHaveLength(before);
  return g.error as ValidationError;
}

const bad = (v: unknown): never => v as never;

describeLive('R', 'asset documents reads', () => {
  let client: RtlsClient;

  beforeAll(() => {
    client = createLiveClient();
  });

  it('empty list of a never-used test MAC and an unknown job', async () => {
    const page = await client.assetDocuments.listPage(testMac(5));
    expect(page).toEqual({ items: [], total: 0, limit: 50, offset: 0 });
    await expect(client.assetDocuments.getJob(randomUUID())).rejects.toBeInstanceOf(NotFoundError);
  });

  it('local validation: every assetDocuments.* case refused before any request', async () => {
    const m = testMac(5);
    const docs = client.assetDocuments;
    const up = (input: Partial<DocumentUploadInput> & Record<string, unknown>): Promise<unknown> =>
      docs.upload(m, bad({ docType: 'sdk_test', ...input }));
    // upload checks 1–6 in order
    await expectLocalValidation(() =>
      docs.upload('zz', { file: PNG, filename: 'x.png', docType: 'sdk_test' })
    );
    await expectLocalValidation(() => up({ file: PNG, filename: 'x.png', docType: 'bad type' }));
    await expectLocalValidation(() =>
      up({ file: PNG, filename: 'x.png', docType: bad(undefined) })
    );
    await expectLocalValidation(() => up({ file: PNG, filename: 'x.txt' }));
    await expectLocalValidation(() => up({ file: PNG }));
    await expectLocalValidation(() => up({ file: PNG, filename: '' }));
    await expectLocalValidation(() => up({ file: PNG.buffer.slice(0), filename: 'x' }));
    await expectLocalValidation(() =>
      up({ file: PNG, filename: 'x.png', contentType: bad('text/plain') })
    );
    await expectLocalValidation(() =>
      up({ file: PNG, filename: 'x.png', contentType: 'application/pdf' })
    );
    await expectLocalValidation(() => up({ file: new Uint8Array(10_485_761), filename: 'x.png' }));
    await expectLocalValidation(() =>
      up({ file: new Blob([new Uint8Array(16 * 1024 * 1024)]), filename: 'x.pdf' })
    );
    await expectLocalValidation(() => up({ file: PNG, filename: 'x.png', tags: [''] }));
    await expectLocalValidation(() => docs.upload(m, bad(null)));
    await expectLocalValidation(() => up({ file: PNG, filename: 'x.png', tags: bad('a') }));
    await expectLocalValidation(() => up({ file: PNG, filename: 'x.png', description: bad(5) }));
    // type-resolution branches, refused by the last check (tags)
    const blobType = await expectLocalValidation(() =>
      up({ file: new Blob([PNG], { type: 'image/png' }), filename: 'x.png', tags: ['a,b'] })
    );
    expect(blobType.message).toMatch(/tag/i);
    const fileName = await expectLocalValidation(() =>
      up({ file: new File([PNG], 'x.png', { type: 'image/png' }), tags: ['a,b'] })
    );
    expect(fileName.message).toMatch(/tag/i);
    const override = await expectLocalValidation(() =>
      up({ file: PNG, filename: 'x.png', contentType: 'image/png', tags: ['a,b'] })
    );
    expect(override.message).toMatch(/tag/i);
    const fromExt = await expectLocalValidation(() =>
      up({ file: new Blob([PNG], { type: 'text/plain' }), filename: 'X.JPEG', tags: ['a,b'] })
    );
    expect(fromExt.message).toMatch(/tag/i);
    // jobs
    await expectLocalValidation(() => docs.getJob(''));
    await expectLocalValidation(() => docs.waitForJob(randomUUID(), { intervalMs: 100 }));
    await expectLocalValidation(() => docs.waitForJob(randomUUID(), { maxWaitMs: 0 }));
    await expectLocalValidation(() => docs.waitForJob(''));
    // listPage / list
    await expectLocalValidation(() => docs.listPage('zz'));
    await expectLocalValidation(() => docs.listPage(m, { limit: 0 }));
    await expectLocalValidation(() => docs.listPage(m, { limit: 501 }));
    await expectLocalValidation(() => docs.listPage(m, { limit: 1.5 }));
    await expectLocalValidation(() => docs.listPage(m, { offset: -1 }));
    await expectLocalValidation(() => docs.listPage(m, { docType: bad(5) }));
    await expectLocalValidation(() => docs.list(m, { maxItems: 0 }));
    await expectLocalValidation(() => docs.list('zz'));
    // get / download / delete
    await expectLocalValidation(() => docs.get('zz', 'doc-x'));
    await expectLocalValidation(() => docs.get(m, ''));
    await expectLocalValidation(() => docs.download('zz', 'doc-x'));
    await expectLocalValidation(() => docs.download(m, 'doc-x', { version: bad('huge') }));
    await expectLocalValidation(() => docs.download(m, ''));
    await expectLocalValidation(() => docs.delete('zz', 'doc-x'));
    await expectLocalValidation(() => docs.delete(m, ''));
  });
});

describeLive(
  'W',
  'asset documents lifecycle',
  () => {
    let client: RtlsClient;

    beforeAll(() => {
      client = createLiveClient();
    });

    it('upload, wait, list, get, download, reject, delete', async () => {
      const m5 = testMac(5);
      const filename = `${testName('doc')}.png`;
      const docs = client.assetDocuments;

      await expect(client.assets.get(m5)).rejects.toBeInstanceOf(NotFoundError);
      await client.assets.create(m5, {
        user_name: testName('a5'),
        model: 'sdk-test',
        tags: ['sdk-test'],
      });
      registerCleanup({
        label: `asset ${m5}`,
        request: { method: 'DELETE', path: `/assets/{ns}/${m5}` },
        verify: { path: `/assets/{ns}/${m5}`, goneStatus: [404] },
      });

      const created = await docs.upload(m5, {
        file: PNG,
        filename,
        docType: 'sdk_test',
        description: 'sdk-test',
        tags: ['sdk-test', runId()],
      });
      const docPath = `/assets/{ns}/${m5}/documents/${created.documentId}`;
      registerCleanup({
        label: `document ${created.documentId}`,
        request: { method: 'DELETE', path: docPath },
        verify: { path: docPath, goneStatus: [404] },
      });
      expect(created.status).toBe('pending');
      expect(created.documentId).toMatch(/^doc-/);

      const job = await docs.waitForJob(created.jobId, { maxWaitMs: 90_000 });
      if (job.status !== 'completed') {
        throw new Error(`upload job ${job.status}: ${job.error?.message ?? 'no message'}`);
      }
      expect(job.result?.availableVersions).toEqual(
        expect.arrayContaining(['original', 'medium', 'thumbnail'])
      );
      expect(['clean', 'unscanned']).toContain(job.result?.virus_scan_status);
      expect((await docs.getJob(created.jobId)).status).toBe('completed');

      const page = await docs.listPage(m5, { docType: 'sdk_test', limit: 1 });
      expect(page.items).toHaveLength(1);
      expect(page.total).toBe(1);
      const all = await docs.list(m5, { docType: 'sdk_test' });
      expect(all.map((d) => d.documentId)).toContain(created.documentId);

      const doc = await docs.get(m5, created.documentId);
      expect(doc.originalFilename).toBe(filename);
      expect(doc.sizeBytes).toBe(PNG.length);
      await expectKnownServerIssue('USI-P2-12', 'document metadata lacks virus_scan_*', () => {
        expect(doc).not.toHaveProperty('virus_scan_status');
        expect(doc.documentId).toBe(created.documentId);
      });

      const original = await docs.download(m5, created.documentId);
      expect(new Uint8Array(await original.data.arrayBuffer())).toEqual(PNG);
      expect(original.contentType).toBe('image/png');
      expect(original.filename).toBe(filename);
      const thumb = await docs.download(m5, created.documentId, { version: 'thumbnail' });
      expect(thumb.contentType).toBe('image/webp');

      // server-side rejection: PNG bytes declared as JPEG (magic-number mismatch), nothing stored
      await expect(
        docs.upload(m5, {
          file: PNG,
          filename: `${testName('x')}.jpg`,
          contentType: 'image/jpeg',
          docType: 'sdk_test',
        })
      ).rejects.toBeInstanceOf(ValidationError);
      expect((await docs.listPage(m5)).total).toBe(1);

      await expect(docs.delete(m5, created.documentId)).resolves.toMatchObject({
        documentId: created.documentId,
      });
      await expect(docs.get(m5, created.documentId)).rejects.toBeInstanceOf(NotFoundError);
      await expect(docs.delete(m5, created.documentId)).rejects.toBeInstanceOf(NotFoundError);
      expect((await docs.listPage(m5)).total).toBe(0);
      await expect(client.assets.delete(m5)).resolves.toBeUndefined();
    }, 180_000);
  },
  { ruleEngine: true }
);
