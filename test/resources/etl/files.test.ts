// Unit tests of client.etl.parseHeaders and client.etl.upload (P7 §8.2, F1–F22): the file part builder, the form
// layout, default timeouts and error mapping, through the real transport against MSW. Expected bodies come from
// the loaded fixtures, so that a live re-recording (--record) does not break them.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { recordRequests, server, type RecordedRequest } from '../../mocks/server';
import { FIXTURES_ROOT, fixtureResponse, loadFixture } from '../../contract/fixtures';
import {
  AuthorizationError,
  createRtlsClient,
  NotFoundError,
  ServiceUnavailableError,
  ValidationError,
  type EtlFileInput,
  type EtlSheetPreview,
  type EtlUploadResult,
  type RtlsClient,
  type RtlsClientOptions,
  type RtlsError,
} from '../../../src';

const BASE = 'https://rtls.ubudu.com/api';
const UPLOAD = `${BASE}/etl/upload`;
const PARSE = `${BASE}/etl/parse-excel-headers`;
const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const XLS = 'application/vnd.ms-excel';
const ID = '64b000000000000000000001';
const CSV = 'MAC,Name\n025d4b000040,sdk-test-000000-etl-asset\n';
const BOM = [0xef, 0xbb, 0xbf];
const SAMPLE_XLSX = new Uint8Array(readFileSync(resolve(FIXTURES_ROOT, 'etl/inputs/sample.xlsx')));
const fx = (name: string) => loadFixture('etl', name);
const csvFile: EtlFileInput = { data: CSV, filename: 'a.csv' };

function client(options: RtlsClientOptions = {}): RtlsClient {
  return createRtlsClient({ apiKey: 'test-key', namespace: 'ns-a', ...options });
}

function only(rec: { requests: readonly RecordedRequest[] }): RecordedRequest {
  expect(rec.requests).toHaveLength(1);
  return rec.requests[0] as RecordedRequest;
}

/** The rejection of `p` (fails the test when it resolves). */
async function expectRejection(p: Promise<unknown>): Promise<RtlsError> {
  const [outcome] = await Promise.allSettled([p]);
  expect(outcome?.status).toBe('rejected');
  return (outcome as PromiseRejectedResult).reason as RtlsError;
}

/** The part names of a form, in order. */
function partNames(form: FormData): string[] {
  const names: string[] = [];
  form.forEach((_value, name) => names.push(name));
  return names;
}

/** The `file` part of a sent form: name, type and bytes. */
async function sentFile(form: FormData): Promise<{ name: string; type: string; bytes: number[] }> {
  const part = form.get('file');
  expect(part).toBeInstanceOf(Blob);
  const file = part as File;
  return {
    name: file.name,
    type: file.type,
    bytes: [...new Uint8Array(await file.arrayBuffer())],
  };
}

/** The file part `parseHeaders` sends for `file`. */
async function partOf(
  file: EtlFileInput
): Promise<{ name: string; type: string; bytes: number[] }> {
  const rec = recordRequests();
  await client().etl.parseHeaders(file);
  const part = await sentFile(await only(rec).formData());
  rec.stop();
  return part;
}

const utf8 = (s: string): number[] => [...new TextEncoder().encode(s)];

afterEach(() => {
  vi.restoreAllMocks();
});

describe('the ETL file part (P7 §6 steps 1–5)', () => {
  it('F1 CSV text: part name kept, type text/csv, UTF-8 bytes', async () => {
    expect(await partOf(csvFile)).toEqual({ name: 'a.csv', type: 'text/csv', bytes: utf8(CSV) });
  });

  it('F2 .xlsx and .xls: MIME types from the table', async () => {
    const xlsx = await partOf({ data: SAMPLE_XLSX, filename: 'sample.xlsx' });
    expect(xlsx).toEqual({ name: 'sample.xlsx', type: XLSX, bytes: [...SAMPLE_XLSX] });
    const xls = await partOf({ data: new Uint8Array([0xd0, 0xcf, 0x11, 0xe0]), filename: 'b.xls' });
    expect(xls).toEqual({ name: 'b.xls', type: XLS, bytes: [0xd0, 0xcf, 0x11, 0xe0] });
  });

  it('F3 the extension is lower-cased in the name and picks the MIME type', async () => {
    const upper = await partOf({ data: SAMPLE_XLSX, filename: 'Report.XLSX' });
    expect([upper.name, upper.type]).toEqual(['Report.xlsx', XLSX]);
    const csv = await partOf({ data: CSV, filename: 'a.CSV' });
    expect([csv.name, csv.type]).toEqual(['a.csv', 'text/csv']);
    const dotted = await partOf({ data: CSV, filename: 'my.report.Csv' });
    expect(dotted.name).toBe('my.report.csv');
  });

  it("F4 a File keeps its name; its own type is replaced by the extension's", async () => {
    const part = await partOf(new File([CSV], 'x.csv', { type: 'text/plain' }));
    expect(part).toEqual({ name: 'x.csv', type: 'text/csv', bytes: utf8(CSV) });
  });

  it('F4b the object form ignores contentType and accepts Blob data', async () => {
    const part = await partOf({
      data: new Blob([CSV], { type: 'application/octet-stream' }),
      filename: 'blob.csv',
      contentType: 'text/plain',
    });
    expect(part).toEqual({ name: 'blob.csv', type: 'text/csv', bytes: utf8(CSV) });
  });

  it('F4c a Blob carrying a name property counts as named (no instanceof File check)', async () => {
    const named = Object.assign(new Blob([CSV]), { name: 'named.csv' });
    expect((await partOf(named)).name).toBe('named.csv');
  });

  it('F5 an unnamed Blob, an unsupported or missing extension, bad inputs → ValidationError, no request', async () => {
    const rec = recordRequests();
    const etl = client().etl;
    const bad: unknown[] = [
      new Blob(['x']),
      Object.assign(new Blob(['x']), { name: '' }),
      { data: CSV, filename: 'a.txt' },
      { data: CSV, filename: 'noext' },
      { data: CSV, filename: 'a.' },
      { data: CSV, filename: '' },
      { data: CSV },
      { data: 5, filename: 'a.csv' },
      null,
      'a.csv',
    ];
    const details: unknown[] = [];
    for (const file of bad) {
      const err = await expectRejection(etl.parseHeaders(file as EtlFileInput));
      expect(err).toBeInstanceOf(ValidationError);
      details.push(err.details);
    }
    expect(details).toEqual(bad.map(() => ['file']));
    await expect(etl.upload(new Blob(['x']), ID)).rejects.toMatchObject({ status: 0 });
    expect(rec.requests).toHaveLength(0);
  });

  it('F6 a leading UTF-8 BOM is dropped from CSV (string, bytes, File); the rest is byte-equal', async () => {
    const parts = [
      await partOf({ data: `\uFEFF${CSV}`, filename: 'a.csv' }),
      await partOf({ data: new Uint8Array([...BOM, ...utf8(CSV)]), filename: 'b.csv' }),
      await partOf(new File([new Uint8Array([...BOM, ...utf8(CSV)])], 'c.csv')),
    ];
    expect(parts.map((p) => p.bytes)).toEqual([utf8(CSV), utf8(CSV), utf8(CSV)]);
  });

  it('F6b a CSV with a blank line and ; delimiters is sent byte-for-byte', async () => {
    const text = 'MAC;Name\n\n025d4b000040;x\n\n';
    expect((await partOf({ data: text, filename: 'a.csv' })).bytes).toEqual(utf8(text));
  });

  it('F6c a CSV shorter than a BOM, or starting with only part of one, is unchanged', async () => {
    expect((await partOf({ data: new Uint8Array([0xef, 0xbb]), filename: 'a.csv' })).bytes).toEqual(
      [0xef, 0xbb]
    );
    expect((await partOf({ data: '', filename: 'e.csv' })).bytes).toEqual([]);
  });

  it('F7 xlsx bytes that start like a BOM are not touched', async () => {
    const bytes = new Uint8Array([...BOM, 0x50, 0x4b]);
    expect((await partOf({ data: bytes, filename: 'a.xlsx' })).bytes).toEqual([...bytes]);
  });

  it('F8 ArrayBuffer, Uint8Array and an offset view are byte-equal on the wire', async () => {
    const backing = new Uint8Array([0, 0, ...utf8(CSV), 0]);
    const view = backing.subarray(2, 2 + utf8(CSV).length);
    const parts = [
      await partOf({ data: new Uint8Array(utf8(CSV)).buffer, filename: 'a.csv' }),
      await partOf({ data: new Uint8Array(utf8(CSV)), filename: 'b.csv' }),
      await partOf({ data: view, filename: 'c.csv' }),
    ];
    expect(parts.map((p) => p.bytes)).toEqual([utf8(CSV), utf8(CSV), utf8(CSV)]);
  });
});

describe('client.etl.parseHeaders (POST /etl/parse-excel-headers)', () => {
  it('F9 multipart POST with only a file part; returns the typed preview', async () => {
    const rec = recordRequests();
    const preview: EtlSheetPreview = await client().etl.parseHeaders(csvFile);
    const r = only(rec);
    expect(r.method).toBe('POST');
    expect(r.url.pathname).toBe('/api/etl/parse-excel-headers');
    expect(r.url.search).toBe('');
    expect(r.headers.get('x-api-key')).toBe('test-key');
    expect(r.headers.get('content-type')).toMatch(/^multipart\/form-data; boundary=/);
    expect(partNames(await r.formData())).toEqual(['file']);
    expect(preview).toEqual(fx('sheet-preview-csv').body);
  });

  it('F9b an xlsx part answers the xlsx preview', async () => {
    const preview = await client().etl.parseHeaders({ data: SAMPLE_XLSX, filename: 'sample.xlsx' });
    expect(preview).toEqual(fx('sheet-preview-xlsx').body);
  });

  it('F10 a client-level JSON Content-Type does not leak into multipart calls', async () => {
    const rec = recordRequests();
    const c = client({ headers: { 'Content-Type': 'application/json' } });
    await c.etl.parseHeaders(csvFile);
    await c.etl.upload(csvFile, ID);
    expect(rec.requests).toHaveLength(2);
    const types = rec.requests.map((r) => r.headers.get('content-type'));
    for (const type of types) expect(type).toMatch(/^multipart\/form-data; boundary=/);
  });

  it('F11 default timeout 120000; explicit 5000 and 0 pass through; signal and headers forwarded', async () => {
    const c = client();
    const spy = vi.spyOn(c.transport, 'upload');
    const signal = new AbortController().signal;
    await c.etl.parseHeaders(csvFile);
    await c.etl.parseHeaders(csvFile, { timeoutMs: 5000 });
    await c.etl.parseHeaders(csvFile, { timeoutMs: 0, signal, headers: { 'X-Trace': 't' } });
    expect(spy.mock.calls.map((call) => call[0])).toEqual([
      '/etl/parse-excel-headers',
      '/etl/parse-excel-headers',
      '/etl/parse-excel-headers',
    ]);
    expect(spy.mock.calls.map((call) => call[2]?.timeoutMs)).toEqual([120000, 5000, 0]);
    expect(spy.mock.calls[2]?.[2]).toEqual({ timeoutMs: 0, signal, headers: { 'X-Trace': 't' } });
  });

  it('F12 400 CSV file contains no data → ValidationError with the message', async () => {
    server.use(http.post(PARSE, () => fixtureResponse(fx('error-parse-no-data'))));
    const err = await expectRejection(client().etl.parseHeaders(csvFile));
    expect(err).toBeInstanceOf(ValidationError);
    expect(err).toMatchObject({ status: 400, message: 'CSV file contains no data' });
    expect(err.body).toEqual(fx('error-parse-no-data').body);
  });

  it('F21 a pre-aborted signal → AbortError, no request', async () => {
    const rec = recordRequests();
    const controller = new AbortController();
    controller.abort();
    await expect(
      client().etl.parseHeaders(csvFile, { signal: controller.signal })
    ).rejects.toMatchObject({ name: 'AbortError', status: 0 });
    expect(rec.requests).toHaveLength(0);
  });
});

describe('client.etl.upload (POST /etl/upload)', () => {
  it('F13 one id: parts mappingProfileIds, debugMode false, file, in that order', async () => {
    const rec = recordRequests();
    const result: EtlUploadResult = await client().etl.upload(csvFile, 'id1');
    const r = only(rec);
    expect(r.method).toBe('POST');
    expect(r.url.pathname).toBe('/api/etl/upload');
    expect(r.url.search).toBe('');
    expect(r.headers.get('x-api-key')).toBe('test-key');
    expect(r.headers.get('content-type')).toMatch(/^multipart\/form-data; boundary=/);
    const form = await r.formData();
    expect(partNames(form)).toEqual(['mappingProfileIds', 'debugMode', 'file']);
    expect(form.get('mappingProfileIds')).toBe('["id1"]');
    expect(form.get('debugMode')).toBe('false');
    expect(await sentFile(form)).toEqual({ name: 'a.csv', type: 'text/csv', bytes: utf8(CSV) });
    expect(result).toEqual(fx('upload-result-write').body);
  });

  it('F14 several ids are sent as a JSON array string', async () => {
    const rec = recordRequests();
    await client().etl.upload(csvFile, ['a', 'b']);
    expect((await only(rec).formData()).get('mappingProfileIds')).toBe('["a","b"]');
  });

  it('F15 dryRun true → debugMode true; dryRun false → false', async () => {
    const rec = recordRequests();
    const dry = await client().etl.upload(csvFile, ID, { dryRun: true });
    await client().etl.upload(csvFile, ID, { dryRun: false });
    const modes: unknown[] = [];
    for (const r of rec.requests) modes.push((await r.formData()).get('debugMode'));
    expect(modes).toEqual(['true', 'false']);
    expect(dry).toEqual(fx('upload-result-dry-run').body);
  });

  it('F16 empty ids → ValidationError, no request', async () => {
    const rec = recordRequests();
    const etl = client().etl;
    const details: unknown[] = [];
    for (const ids of [[], '', [''], [ID, ''], 5, null]) {
      const err = await expectRejection(etl.upload(csvFile, ids as never));
      expect(err).toBeInstanceOf(ValidationError);
      details.push(err.details);
    }
    expect(details).toEqual(Array.from({ length: 6 }, () => ['mappingProfileIds']));
    expect(rec.requests).toHaveLength(0);
  });

  it('F16b a non-boolean dryRun → ValidationError, no request (never a writing import)', async () => {
    const rec = recordRequests();
    const etl = client().etl;
    const details: unknown[] = [];
    for (const dryRun of ['true', 1, 0, null, {}]) {
      const err = await expectRejection(etl.upload(csvFile, ID, { dryRun } as never));
      expect(err).toBeInstanceOf(ValidationError);
      expect(err.status).toBe(0);
      details.push(err.details);
    }
    expect(details).toEqual(Array.from({ length: 5 }, () => ['dryRun']));
    expect(rec.requests).toHaveLength(0);
  });

  it('F17 default timeout 600000; an explicit value (0 included) passes through', async () => {
    const c = client();
    const spy = vi.spyOn(c.transport, 'upload');
    await c.etl.upload(csvFile, ID);
    await c.etl.upload(csvFile, ID, { timeoutMs: 1234 });
    await c.etl.upload(csvFile, ID, { timeoutMs: 0 });
    expect(spy.mock.calls.map((call) => [call[0], call[2]?.timeoutMs])).toEqual([
      ['/etl/upload', 600000],
      ['/etl/upload', 1234],
      ['/etl/upload', 0],
    ]);
  });

  it('F18 a 201 dry run and a 201 with per-profile errors resolve; errors are readable', async () => {
    server.use(http.post(UPLOAD, () => fixtureResponse(fx('upload-result-dry-run'))));
    const dry = await client().etl.upload(csvFile, ID, { dryRun: true });
    expect(dry).toEqual(fx('upload-result-dry-run').body);

    server.use(http.post(UPLOAD, () => fixtureResponse(fx('upload-result-profile-errors'))));
    const result = await client().etl.upload(csvFile, ID);
    const expected = fx('upload-result-profile-errors').body as EtlUploadResult;
    expect(result.success).toBe(true);
    expect(result.results.processedProfiles.map((p) => p.errors)).toEqual(
      expected.results.processedProfiles.map((p) => p.errors)
    );
    expect(result.results.processedProfiles.every((p) => p.errors.length > 0)).toBe(true);
  });

  it('F19 404 / 403 / 400 no file / 400 processing → NotFound / Authorization / Validation ×2', async () => {
    const cases = [
      ['error-not-found', NotFoundError, 404],
      ['error-namespace-access-denied', AuthorizationError, 403],
      ['error-no-file', ValidationError, 400],
      ['error-upload-processing-400', ValidationError, 400],
    ] as const;
    const classes: boolean[] = [];
    for (const [name, cls, status] of cases) {
      server.use(http.post(UPLOAD, () => fixtureResponse(fx(name))));
      const err = await expectRejection(client().etl.upload(csvFile, ID));
      classes.push(err instanceof cls);
      expect(err.status).toBe(status);
      expect(err.message).toBe((fx(name).body as { error: string }).error);
      expect(err.body).toEqual(fx(name).body);
    }
    expect(classes).toEqual([true, true, true, true]);
  });

  it('F20 never retried, even under a retry policy that lists POST and 503', async () => {
    server.use(
      http.post(UPLOAD, () => HttpResponse.json({ error: 'Service Unavailable' }, { status: 503 }))
    );
    const rec = recordRequests();
    const c = client({
      retry: { retries: 3, retryOn: [503], methods: ['GET', 'POST'], baseDelayMs: 0 },
    });
    const err = await expectRejection(c.etl.upload(csvFile, ID));
    expect(err).toBeInstanceOf(ServiceUnavailableError);
    expect(err.status).toBe(503);
    expect(rec.requests).toHaveLength(1);
  });

  it('F21 a pre-aborted signal → AbortError, no request', async () => {
    const rec = recordRequests();
    const controller = new AbortController();
    controller.abort();
    await expect(
      client().etl.upload(csvFile, ID, { signal: controller.signal, dryRun: true })
    ).rejects.toMatchObject({ name: 'AbortError', status: 0 });
    expect(rec.requests).toHaveLength(0);
  });

  it('F22 a per-call namespace adds nothing: exactly the three parts', async () => {
    const rec = recordRequests();
    await client().etl.upload(csvFile, ID, { namespace: 'ns-b' });
    const form = await only(rec).formData();
    expect(partNames(form)).toEqual(['mappingProfileIds', 'debugMode', 'file']);
    expect(form.get('mappingProfileIds')).toBe(JSON.stringify([ID]));
  });
});
