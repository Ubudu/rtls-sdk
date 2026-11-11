// assetDocuments (P2 §6.5, §8.1): the real request builders against MSW. Every answer comes from server.use(),
// the job handler is stateful per test; request assertions read recordRequests().
import { afterEach, describe, expect, it, vi } from 'vitest';
import { delay, http, HttpResponse } from 'msw';
import {
  AbortError,
  AuthenticationError,
  ContextError,
  createRtlsClient,
  NotFoundError,
  PayloadTooLargeError,
  ServerError,
  TimeoutError,
  UnsupportedMediaTypeError,
  ValidationError,
  type RtlsClient,
} from '../../../src';
import type {
  AssetDocumentSummary,
  DocumentUploadInput,
  DocumentUploadJob,
} from '../../../src/types/assets';
import { fixtureResponse, loadFixture, type FixtureEnvelope } from '../../contract/fixtures';
import { recordRequests, server, type RecordedRequest } from '../../mocks/server';

const API = 'https://rtls.test/api';
const MAC = '025d4b000001';
const DOC = 'doc-3a7e9c1d-5b2f-4e8a-9c6d-7f0e1a2b3c4d';
const JOB = '6f1c2a4e-8b3d-4c5e-9f7a-1b2c3d4e5f60';
const DOCS = `${API}/assets/:ns/:mac/documents`;
const ONE = `${API}/assets/:ns/:mac/documents/:doc`;
const JOBS = `${API}/assets/:ns/documents/jobs/:job`;
const DOWNLOAD = `${API}/assets/:ns/:mac/documents/:doc/download`;
const PNG = new Uint8Array(
  Buffer.from(loadFixture('assets', 'document-download-200').base64 as string, 'base64')
);

const client = (): RtlsClient =>
  createRtlsClient({ baseUrl: API, apiKey: 'test-api-key', namespace: 'test-ns' });
const noNamespace = (): RtlsClient => createRtlsClient({ baseUrl: API, apiKey: 'test-api-key' });

const envelope = (name: string): FixtureEnvelope => loadFixture('assets', name);
const fixture = (name: string): Response => fixtureResponse(envelope(name));
const job = (name: string): DocumentUploadJob => envelope(name).body as DocumentUploadJob;

function only(rec: { requests: readonly RecordedRequest[] }): RecordedRequest {
  expect(rec.requests).toHaveLength(1);
  return rec.requests[0] as RecordedRequest;
}

const htmlError = (status: number): Response =>
  new HttpResponse('<html><body><pre>Error: request failed</pre></body></html>', {
    status,
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });

const jsonError = (status: number, error: string): Response =>
  HttpResponse.json({ error }, { status });

/** Part names in order (FormData has no iterator without DOM.Iterable). */
function partNames(form: FormData): string[] {
  const names: string[] = [];
  form.forEach((_value, name) => names.push(name));
  return names;
}

async function filePart(request: RecordedRequest): Promise<File> {
  const part = (await request.formData()).get('file');
  expect(part).toBeInstanceOf(File);
  return part as File;
}

describe('assetDocuments.upload', () => {
  it('POST multipart: file part (name, type, bytes), docType, description, tags joined with ","', async () => {
    server.use(http.post(DOCS, () => fixture('document-upload-202')));
    const rec = recordRequests();
    const created = await client().assetDocuments.upload('02:5D:4B:00:00:01', {
      file: PNG,
      filename: 'sdk-test.png',
      docType: 'photo',
      description: 'Front view',
      tags: ['a', 'b'],
    });
    expect(created).toStrictEqual({
      jobId: JOB,
      documentId: DOC,
      status: 'pending',
      message: 'Document upload accepted for processing',
    });
    const request = only(rec);
    expect(request.method).toBe('POST');
    expect(request.url.href).toBe(`${API}/assets/test-ns/${MAC}/documents`);
    expect(request.headers.get('content-type')).toMatch(/^multipart\/form-data; boundary=.+/);
    expect(request.headers.get('x-api-key')).toBe('test-api-key');
    const form = await request.formData();
    expect(partNames(form)).toStrictEqual(['file', 'docType', 'description', 'tags']);
    expect(form.get('docType')).toBe('photo');
    expect(form.get('description')).toBe('Front view');
    expect(form.get('tags')).toBe('a,b');
    const file = form.get('file') as File;
    expect(file.name).toBe('sdk-test.png');
    expect(file.type).toBe('image/png');
    expect(new Uint8Array(await file.arrayBuffer())).toStrictEqual(PNG);
  });

  it('without description and with no tags only file and docType are sent', async () => {
    server.use(http.post(DOCS, () => fixture('document-upload-202')));
    const rec = recordRequests();
    await client().assetDocuments.upload(MAC, {
      file: PNG,
      filename: 'a.png',
      docType: 'photo',
      tags: [],
    });
    expect(partNames(await only(rec).formData())).toStrictEqual(['file', 'docType']);
  });

  it.each<[string, () => DocumentUploadInput['file'], string | undefined, string]>([
    ['Uint8Array + filename', () => PNG, 'u8.png', 'u8.png'],
    ['ArrayBuffer + filename', () => PNG.slice().buffer, 'ab.png', 'ab.png'],
    ['Blob + filename', () => new Blob([PNG]), 'blob.png', 'blob.png'],
    ['File (name from File.name)', () => new File([PNG], 'file.png'), undefined, 'file.png'],
    [
      'File with an explicit filename (filename wins)',
      () => new File([PNG], 'a.png'),
      'b.png',
      'b.png',
    ],
  ])('%s', async (_label, file, filename, expected) => {
    server.use(http.post(DOCS, () => fixture('document-upload-202')));
    const rec = recordRequests();
    await client().assetDocuments.upload(MAC, {
      file: file(),
      ...(filename !== undefined ? { filename } : {}),
      docType: 'photo',
    });
    const part = await filePart(only(rec));
    expect(part.name).toBe(expected);
    expect(part.type).toBe('image/png');
    expect(new Uint8Array(await part.arrayBuffer())).toStrictEqual(PNG);
  });

  it.each([
    ['x.jpg', 'image/jpeg'],
    ['x.JPEG', 'image/jpeg'],
    ['x.png', 'image/png'],
    ['x.gif', 'image/gif'],
    ['x.webp', 'image/webp'],
    ['x.pdf', 'application/pdf'],
  ])('type inferred from the extension: %s → %s', async (filename, type) => {
    server.use(http.post(DOCS, () => fixture('document-upload-202')));
    const rec = recordRequests();
    await client().assetDocuments.upload(MAC, { file: PNG, filename, docType: 'doc' });
    expect((await filePart(only(rec))).type).toBe(type);
  });

  it('contentType wins over Blob.type; an allowed Blob.type wins over the extension; another Blob.type does not', async () => {
    server.use(http.post(DOCS, () => fixture('document-upload-202')));
    const rec = recordRequests();
    const upload = (input: DocumentUploadInput): Promise<unknown> =>
      client().assetDocuments.upload(MAC, input);
    await upload({
      file: new Blob([PNG], { type: 'image/gif' }),
      filename: 'x.png',
      contentType: 'image/jpeg',
      docType: 'photo',
    });
    await upload({
      file: new Blob([PNG], { type: 'image/gif' }),
      filename: 'x.png',
      docType: 'photo',
    });
    await upload({
      file: new Blob([PNG], { type: 'application/octet-stream' }),
      filename: 'x.png',
      docType: 'photo',
    });
    expect(rec.requests).toHaveLength(3);
    const types = await Promise.all(rec.requests.map(async (r) => (await filePart(r)).type));
    expect(types).toStrictEqual(['image/jpeg', 'image/gif', 'image/png']);
  });

  it('the size limits are inclusive: a 10 485 760-byte image and a 15 728 640-byte PDF are sent', async () => {
    server.use(http.post(DOCS, () => fixture('document-upload-202')));
    const rec = recordRequests();
    await client().assetDocuments.upload(MAC, {
      file: new Uint8Array(10_485_760),
      filename: 'big.png',
      docType: 'photo',
    });
    await client().assetDocuments.upload(MAC, {
      file: new Uint8Array(15_728_640),
      filename: 'big.pdf',
      docType: 'manual',
    });
    expect(rec.requests).toHaveLength(2);
  });

  const valid: DocumentUploadInput = { file: PNG, filename: 'x.png', docType: 'photo' };
  it.each<[string, string, unknown]>([
    ['an invalid MAC', 'mac', { mac: 'zz' }],
    ["docType 'bad type'", 'docType', { ...valid, docType: 'bad type' }],
    ['a missing docType', 'docType', { file: PNG, filename: 'x.png' }],
    ['a .txt filename', 'filename', { ...valid, filename: 'notes.txt' }],
    ['no extension', 'filename', { ...valid, filename: 'photo' }],
    ['bytes without a filename', 'file', { file: PNG, docType: 'photo' }],
    ['an ArrayBuffer without a filename', 'file', { file: PNG.slice().buffer, docType: 'photo' }],
    ['a nameless Blob without a filename', 'file', { file: new Blob([PNG]), docType: 'photo' }],
    ['an empty filename', 'file', { ...valid, filename: '' }],
    ['a contentType outside the allow-list', 'contentType', { ...valid, contentType: 'image/bmp' }],
    ['.png with application/pdf', 'contentType', { ...valid, contentType: 'application/pdf' }],
    [
      '.pdf with image/png',
      'contentType',
      { ...valid, filename: 'x.pdf', contentType: 'image/png' },
    ],
    ['an image of 10 485 761 B', 'file', { ...valid, file: new Uint8Array(10_485_761) }],
    [
      'a PDF of 15 728 641 B',
      'file',
      { ...valid, filename: 'x.pdf', file: new Uint8Array(15_728_641) },
    ],
    ['a tag with ","', 'tags[1]', { ...valid, tags: ['ok', 'a,b'] }],
    ['an empty tag', 'tags[0]', { ...valid, tags: [''] }],
    ['tags not an array', 'tags', { ...valid, tags: 'a' }],
    ['a non-string description', 'description', { ...valid, description: 5 }],
  ])('%s → ValidationError status 0 (details %s), nothing sent', async (_label, field, input) => {
    const rec = recordRequests();
    const mac = (input as { mac?: string }).mac ?? MAC;
    const call = client().assetDocuments.upload(mac, input as DocumentUploadInput);
    await expect(call).rejects.toBeInstanceOf(ValidationError);
    await expect(call).rejects.toMatchObject({ status: 0, details: [field] });
    expect(rec.requests).toHaveLength(0);
  });

  it('checks run in the §6.5 order: docType first, tags last', async () => {
    const upload = (input: unknown): Promise<unknown> =>
      client().assetDocuments.upload(MAC, input as DocumentUploadInput);
    await expect(
      upload({ file: PNG, filename: 'x.txt', docType: 'bad type', tags: ['a,b'] })
    ).rejects.toMatchObject({ details: ['docType'] });
    await expect(
      upload({ file: new Uint8Array(10_485_761), filename: 'x.png', docType: 'ok', tags: ['a,b'] })
    ).rejects.toMatchObject({ details: ['file'] });
    await expect(
      upload({
        file: PNG,
        filename: 'x.png',
        contentType: 'image/bmp',
        docType: 'ok',
        tags: ['a,b'],
      })
    ).rejects.toMatchObject({ details: ['contentType'] });
  });

  it("400 { error: 'File is required' } → ValidationError with the server message", async () => {
    server.use(http.post(DOCS, () => jsonError(400, 'File is required')));
    const call = client().assetDocuments.upload(MAC, valid);
    await expect(call).rejects.toBeInstanceOf(ValidationError);
    await expect(call).rejects.toMatchObject({ status: 400, message: 'File is required' });
  });

  it.each([
    [413, 'File size exceeds maximum allowed size', PayloadTooLargeError],
    [415, 'Unsupported file type', UnsupportedMediaTypeError],
  ] as const)('%i → %o', async (status, message, type) => {
    server.use(http.post(DOCS, () => jsonError(status, message)));
    const call = client().assetDocuments.upload(MAC, valid);
    await expect(call).rejects.toBeInstanceOf(type);
    await expect(call).rejects.toMatchObject({ status, message });
  });

  it('500 HTML page → ServerError', async () => {
    server.use(http.post(DOCS, () => htmlError(500)));
    await expect(client().assetDocuments.upload(MAC, valid)).rejects.toBeInstanceOf(ServerError);
  });

  it('401 → AuthenticationError', async () => {
    server.use(http.post(DOCS, () => jsonError(401, 'Invalid API key')));
    await expect(client().assetDocuments.upload(MAC, valid)).rejects.toBeInstanceOf(
      AuthenticationError
    );
  });

  describe('timeout (§6.5)', () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    /** Starts an upload against a handler that never answers, on a client whose default timeout is 1 000 ms. */
    function hangingUpload(timeoutMs?: number): {
      outcome: Promise<PromiseSettledResult<unknown>[]>;
      settled: () => boolean;
    } {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      server.use(
        http.post(DOCS, async () => {
          await delay('infinite');
          return fixture('document-upload-202');
        })
      );
      const c = createRtlsClient({
        baseUrl: API,
        apiKey: 'test-api-key',
        namespace: 'test-ns',
        timeoutMs: 1000,
      });
      let done = false;
      // allSettled never rejects, so the timeout's rejection is observed without a dangling handler.
      const outcome = Promise.allSettled([
        c.assetDocuments.upload(MAC, valid, timeoutMs === undefined ? {} : { timeoutMs }),
      ]);
      void outcome.then(() => {
        done = true;
      });
      return { outcome, settled: () => done };
    }

    it('without timeoutMs: 120 000 ms, not the client default', async () => {
      const { outcome, settled } = hangingUpload();
      await vi.advanceTimersByTimeAsync(119_999);
      expect(settled()).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      expect(await outcome).toMatchObject([
        { status: 'rejected', reason: { name: 'TimeoutError', timeoutMs: 120_000 } },
      ]);
    });

    it('a per-call timeoutMs wins', async () => {
      const { outcome } = hangingUpload(500);
      await vi.advanceTimersByTimeAsync(500);
      expect(await outcome).toMatchObject([
        { status: 'rejected', reason: { name: 'TimeoutError', timeoutMs: 500 } },
      ]);
    });
  });
});

describe('assetDocuments.getJob', () => {
  it('GET /assets/<ns>/documents/jobs/<id> → the typed job', async () => {
    server.use(http.get(JOBS, () => fixture('document-job-completed')));
    const rec = recordRequests();
    const result = await client().assetDocuments.getJob(JOB);
    expect(result).toStrictEqual(job('document-job-completed'));
    expect(result.result?.availableVersions).toStrictEqual(['original', 'medium', 'thumbnail']);
    const request = only(rec);
    expect(request.method).toBe('GET');
    expect(request.url.href).toBe(`${API}/assets/test-ns/documents/jobs/${JOB}`);
    expect(request.headers.get('content-type')).toBeNull();
  });

  it('a failed job: error reduced to { message } (other fields dropped)', async () => {
    server.use(http.get(JOBS, () => fixture('document-job-failed')));
    const result = await client().assetDocuments.getJob(JOB);
    expect(result.status).toBe('failed');
    expect(result.error).toStrictEqual({ message: 'Virus scan failed: scanner unavailable' });
    expect(result.result).toBeNull();
  });

  it("404 { error: 'Job not found' } → NotFoundError; 500 → ServerError; empty id → ValidationError", async () => {
    server.use(
      http.get(`${API}/assets/:ns/documents/jobs/missing`, () => jsonError(404, 'Job not found')),
      http.get(JOBS, () => jsonError(500, 'Failed to get job status'))
    );
    const rec = recordRequests();
    await expect(client().assetDocuments.getJob('missing')).rejects.toMatchObject({
      status: 404,
      message: 'Job not found',
    });
    await expect(client().assetDocuments.getJob('missing')).rejects.toBeInstanceOf(NotFoundError);
    await expect(client().assetDocuments.getJob(JOB)).rejects.toMatchObject({
      status: 500,
      message: 'Failed to get job status',
    });
    await expect(client().assetDocuments.getJob(JOB)).rejects.toBeInstanceOf(ServerError);
    expect(rec.requests).toHaveLength(4);
    await expect(client().assetDocuments.getJob('')).rejects.toBeInstanceOf(ValidationError);
    expect(rec.requests).toHaveLength(4);
  });
});

describe('assetDocuments.waitForJob', () => {
  /** Answers the given fixtures in order (the last one repeats). */
  function sequence(...names: string[]): void {
    let call = 0;
    server.use(
      http.get(JOBS, () => {
        const name = names[Math.min(call, names.length - 1)] as string;
        call += 1;
        return fixture(name);
      })
    );
  }

  it('pending → processing → completed: resolves the completed job after 3 polls', async () => {
    sequence('document-job-pending', 'document-job-processing', 'document-job-completed');
    const rec = recordRequests();
    const result = await client().assetDocuments.waitForJob(JOB, {
      intervalMs: 250,
      namespace: 'other-ns',
    });
    expect(result.status).toBe('completed');
    expect(rec.requests).toHaveLength(3);
    expect(rec.requests.map((r) => r.url.pathname)).toStrictEqual(
      Array(3).fill(`/api/assets/other-ns/documents/jobs/${JOB}`)
    );
  });

  it('a failed job is returned, not thrown', async () => {
    sequence('document-job-pending', 'document-job-failed');
    const result = await client().assetDocuments.waitForJob(JOB, { intervalMs: 250 });
    expect(result.status).toBe('failed');
    expect(result.error).toStrictEqual({ message: 'Virus scan failed: scanner unavailable' });
  });

  it('never terminal → TimeoutError at maxWaitMs', async () => {
    sequence('document-job-pending');
    const started = Date.now();
    const call = client().assetDocuments.waitForJob(JOB, { intervalMs: 250, maxWaitMs: 600 });
    await expect(call).rejects.toBeInstanceOf(TimeoutError);
    expect(Date.now() - started).toBeGreaterThanOrEqual(550);
  });

  it('abort mid-wait → AbortError', async () => {
    sequence('document-job-pending');
    const controller = new AbortController();
    const rec = recordRequests();
    const call = client().assetDocuments.waitForJob(JOB, {
      intervalMs: 1000,
      signal: controller.signal,
    });
    setTimeout(() => controller.abort(), 100);
    await expect(call).rejects.toBeInstanceOf(AbortError);
    expect(rec.requests).toHaveLength(1);
  });

  it('404 on poll 2 → NotFoundError', async () => {
    let call = 0;
    server.use(
      http.get(JOBS, () => {
        call += 1;
        return call === 1 ? fixture('document-job-pending') : jsonError(404, 'Job not found');
      })
    );
    await expect(
      client().assetDocuments.waitForJob(JOB, { intervalMs: 250 })
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(call).toBe(2);
  });

  it.each<[string, Record<string, unknown>, string]>([
    ['intervalMs: 100', { intervalMs: 100 }, 'intervalMs'],
    ['intervalMs: 250.5', { intervalMs: 250.5 }, 'intervalMs'],
    ['maxWaitMs: 0', { maxWaitMs: 0 }, 'maxWaitMs'],
    ['maxWaitMs: -1', { maxWaitMs: -1 }, 'maxWaitMs'],
  ])('%s → ValidationError status 0, nothing sent', async (_label, options, field) => {
    const rec = recordRequests();
    const call = client().assetDocuments.waitForJob(JOB, options);
    await expect(call).rejects.toBeInstanceOf(ValidationError);
    await expect(call).rejects.toMatchObject({ status: 0, details: [field] });
    expect(rec.requests).toHaveLength(0);
  });
});

describe('assetDocuments.listPage', () => {
  it('sends exactly the given options (no sortBy); no options → empty query; typed OffsetPage', async () => {
    server.use(http.get(DOCS, () => fixture('documents-list')));
    const rec = recordRequests();
    const page = await client().assetDocuments.listPage('02-5d-4b-00-00-01', {
      docType: 'photo',
      limit: 20,
      offset: 40,
    });
    await client().assetDocuments.listPage(MAC);
    await client().assetDocuments.listPage(MAC, { offset: 0 });
    expect(page.total).toBe(2);
    expect(page.items[0]?.uploadedBy).toStrictEqual({ userId: 'test-user', username: 'test-user' });
    expect(page.items[0]?.description).toBeNull();
    expect(rec.requests.map((r) => `${r.method} ${r.url.pathname}${r.url.search}`)).toStrictEqual([
      `GET /api/assets/test-ns/${MAC}/documents?docType=photo&limit=20&offset=40`,
      `GET /api/assets/test-ns/${MAC}/documents`,
      `GET /api/assets/test-ns/${MAC}/documents?offset=0`,
    ]);
    expect(rec.requests[0]?.headers.get('content-type')).toBeNull();
  });

  it.each<[string, Record<string, unknown>, string]>([
    ['limit 0', { limit: 0 }, 'limit'],
    ['limit 501', { limit: 501 }, 'limit'],
    ['limit 1.5', { limit: 1.5 }, 'limit'],
    ['offset -1', { offset: -1 }, 'offset'],
    ['docType 5', { docType: 5 }, 'docType'],
  ])('%s → ValidationError status 0, nothing sent', async (_label, options, field) => {
    const rec = recordRequests();
    const call = client().assetDocuments.listPage(MAC, options);
    await expect(call).rejects.toMatchObject({ status: 0, details: [field] });
    await expect(call).rejects.toBeInstanceOf(ValidationError);
    expect(rec.requests).toHaveLength(0);
  });

  it("500 { error: 'Failed to list documents' } → ServerError", async () => {
    server.use(http.get(DOCS, () => jsonError(500, 'Failed to list documents')));
    const call = client().assetDocuments.listPage(MAC);
    await expect(call).rejects.toBeInstanceOf(ServerError);
    await expect(call).rejects.toMatchObject({ message: 'Failed to list documents' });
  });
});

describe('assetDocuments.list', () => {
  const summary = envelope('documents-list').body as { items: AssetDocumentSummary[] };
  /** A listing of `total` documents (`documentId` = `doc-<index>`). */
  function listing(total: number, reportTotal = true): void {
    server.use(
      http.get(DOCS, ({ request }) => {
        const url = new URL(request.url);
        const limit = Number(url.searchParams.get('limit'));
        const offset = Number(url.searchParams.get('offset'));
        const items = Array.from(
          { length: Math.max(0, Math.min(limit, total - offset)) },
          (_, i) => ({
            ...summary.items[0],
            documentId: `doc-${offset + i}`,
          })
        );
        return HttpResponse.json({
          items,
          ...(reportTotal ? { total } : {}),
          limit,
          offset,
        });
      })
    );
  }

  it('total 250 → 3 requests (offsets 0/100/200, limit=100), 250 documents in order', async () => {
    listing(250);
    const rec = recordRequests();
    const docs = await client().assetDocuments.list(MAC, { docType: 'photo' });
    expect(docs).toHaveLength(250);
    expect(docs[249]?.documentId).toBe('doc-249');
    expect(rec.requests.map((r) => r.url.search)).toStrictEqual([
      '?docType=photo&limit=100&offset=0',
      '?docType=photo&limit=100&offset=100',
      '?docType=photo&limit=100&offset=200',
    ]);
  });

  it('maxItems: 120 → 120 documents, 2 requests', async () => {
    listing(250);
    const rec = recordRequests();
    const docs = await client().assetDocuments.list(MAC, { maxItems: 120 });
    expect(docs).toHaveLength(120);
    expect(rec.requests).toHaveLength(2);
  });

  it('an empty page stops', async () => {
    listing(0);
    const rec = recordRequests();
    await expect(client().assetDocuments.list(MAC)).resolves.toStrictEqual([]);
    expect(rec.requests).toHaveLength(1);
  });

  it('maxItems 0 / 1.5 → ValidationError, nothing sent', async () => {
    const rec = recordRequests();
    await expect(client().assetDocuments.list(MAC, { maxItems: 0 })).rejects.toMatchObject({
      status: 0,
      details: ['maxItems'],
    });
    await expect(client().assetDocuments.list(MAC, { maxItems: 1.5 })).rejects.toBeInstanceOf(
      ValidationError
    );
    expect(rec.requests).toHaveLength(0);
  });

  it('500 → ServerError', async () => {
    server.use(http.get(DOCS, () => jsonError(500, 'Failed to list documents')));
    await expect(client().assetDocuments.list(MAC)).rejects.toBeInstanceOf(ServerError);
  });
});

describe('assetDocuments.get', () => {
  it('GET …/documents/<id> → typed document', async () => {
    server.use(http.get(ONE, () => fixture('document')));
    const rec = recordRequests();
    const doc = await client().assetDocuments.get('025D4B000001', DOC);
    expect(doc).toStrictEqual(envelope('document').body);
    expect(doc.mac_address).toBe(MAC);
    expect(doc).not.toHaveProperty('virus_scan_status');
    expect(only(rec).url.href).toBe(`${API}/assets/test-ns/${MAC}/documents/${DOC}`);
  });

  it('404 → NotFoundError; 500 → ServerError; invalid MAC / empty id → ValidationError', async () => {
    server.use(
      http.get(`${API}/assets/:ns/:mac/documents/doc-missing`, () => fixture('document-404')),
      http.get(ONE, () => jsonError(500, 'Failed to get document'))
    );
    const rec = recordRequests();
    await expect(client().assetDocuments.get(MAC, 'doc-missing')).rejects.toMatchObject({
      status: 404,
      message: 'Document not found',
    });
    await expect(client().assetDocuments.get(MAC, 'doc-missing')).rejects.toBeInstanceOf(
      NotFoundError
    );
    await expect(client().assetDocuments.get(MAC, DOC)).rejects.toBeInstanceOf(ServerError);
    expect(rec.requests).toHaveLength(3);
    await expect(client().assetDocuments.get('zz', DOC)).rejects.toBeInstanceOf(ValidationError);
    await expect(client().assetDocuments.get(MAC, '')).rejects.toBeInstanceOf(ValidationError);
    expect(rec.requests).toHaveLength(3);
  });
});

describe('assetDocuments.download', () => {
  it('default: no version sent; bytes, contentType and filename from the response', async () => {
    server.use(http.get(DOWNLOAD, () => fixture('document-download-200')));
    const rec = recordRequests();
    const result = await client().assetDocuments.download(MAC, DOC);
    expect(result.contentType).toBe('image/png');
    expect(result.filename).toBe('sdk-test.png');
    expect(new Uint8Array(await result.data.arrayBuffer())).toStrictEqual(PNG);
    const request = only(rec);
    expect(request.method).toBe('GET');
    expect(request.url.href).toBe(`${API}/assets/test-ns/${MAC}/documents/${DOC}/download`);
  });

  it("version: 'thumbnail' → ?version=thumbnail; a PDF thumbnail is application/pdf", async () => {
    server.use(http.get(DOWNLOAD, () => fixture('document-download-pdf-thumbnail')));
    const rec = recordRequests();
    const result = await client().assetDocuments.download(MAC, DOC, { version: 'thumbnail' });
    expect(only(rec).url.search).toBe('?version=thumbnail');
    expect(result.contentType).toBe('application/pdf');
    expect(result.filename).toBe('sdk-test.pdf');
    const bytes = Buffer.from(await result.data.arrayBuffer());
    expect(bytes.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  });

  it("version: 'medium' of an image → image/webp with the original filename", async () => {
    server.use(
      http.get(
        DOWNLOAD,
        () =>
          new HttpResponse(new Uint8Array([0x52, 0x49, 0x46, 0x46]), {
            headers: {
              'content-type': 'image/webp',
              'content-disposition': 'attachment; filename="sdk-test.png"',
            },
          })
      )
    );
    const result = await client().assetDocuments.download(MAC, DOC, { version: 'medium' });
    expect(result).toMatchObject({ contentType: 'image/webp', filename: 'sdk-test.png' });
  });

  it("version: 'huge' → ValidationError, nothing sent", async () => {
    const rec = recordRequests();
    await expect(
      client().assetDocuments.download(MAC, DOC, { version: 'huge' as 'original' })
    ).rejects.toMatchObject({ status: 0, details: ['version'] });
    expect(rec.requests).toHaveLength(0);
  });

  it.each([
    ['Document not found', 404, NotFoundError],
    ["Version 'medium' not available for this document", 404, NotFoundError],
    ['Invalid version: x', 400, ValidationError],
    ['Failed to download document', 500, ServerError],
  ] as const)('%s (%i) → %o', async (message, status, type) => {
    server.use(http.get(DOWNLOAD, () => jsonError(status, message)));
    const call = client().assetDocuments.download(MAC, DOC);
    await expect(call).rejects.toBeInstanceOf(type);
    await expect(call).rejects.toMatchObject({ status, message });
  });
});

describe('assetDocuments.delete', () => {
  it('DELETE …/documents/<id> → typed body', async () => {
    server.use(http.delete(ONE, () => fixture('document-delete')));
    const rec = recordRequests();
    await expect(client().assetDocuments.delete(MAC, DOC)).resolves.toStrictEqual({
      message: 'Document deleted successfully',
      documentId: DOC,
    });
    const request = only(rec);
    expect(request.method).toBe('DELETE');
    expect(request.url.href).toBe(`${API}/assets/test-ns/${MAC}/documents/${DOC}`);
    expect(request.headers.get('content-type')).toBeNull();
    await expect(request.text()).resolves.toBe('');
  });

  it('404 → NotFoundError; 500 → ServerError', async () => {
    server.use(
      http.delete(`${API}/assets/:ns/:mac/documents/doc-gone`, () => fixture('document-404')),
      http.delete(ONE, () => jsonError(500, 'Failed to delete document'))
    );
    await expect(client().assetDocuments.delete(MAC, 'doc-gone')).rejects.toBeInstanceOf(
      NotFoundError
    );
    await expect(client().assetDocuments.delete(MAC, DOC)).rejects.toBeInstanceOf(ServerError);
  });
});

describe('every assetDocuments method: context and abort', () => {
  const calls: Array<[string, (c: RtlsClient, o: { signal?: AbortSignal }) => Promise<unknown>]> = [
    [
      'upload',
      (c, o) => c.assetDocuments.upload(MAC, { file: PNG, filename: 'x.png', docType: 'p' }, o),
    ],
    ['getJob', (c, o) => c.assetDocuments.getJob(JOB, o)],
    ['waitForJob', (c, o) => c.assetDocuments.waitForJob(JOB, o)],
    ['listPage', (c, o) => c.assetDocuments.listPage(MAC, o)],
    ['list', (c, o) => c.assetDocuments.list(MAC, o)],
    ['get', (c, o) => c.assetDocuments.get(MAC, DOC, o)],
    ['download', (c, o) => c.assetDocuments.download(MAC, DOC, o)],
    ['delete', (c, o) => c.assetDocuments.delete(MAC, DOC, o)],
  ];

  it.each(calls)('%s: no namespace → ContextError, nothing sent', async (_name, call) => {
    const rec = recordRequests();
    await expect(call(noNamespace(), {})).rejects.toBeInstanceOf(ContextError);
    expect(rec.requests).toHaveLength(0);
  });

  it.each(calls)('%s: pre-aborted signal → AbortError, nothing sent', async (_name, call) => {
    const rec = recordRequests();
    await expect(call(client(), { signal: AbortSignal.abort() })).rejects.toBeInstanceOf(
      AbortError
    );
    expect(rec.requests).toHaveLength(0);
  });
});
