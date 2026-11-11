import { afterEach, describe, it, expect, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { recordRequests, server, type RecordedRequest } from '../../mocks/server';
import {
  createRtlsClient,
  NotFoundError,
  PayloadTooLargeError,
  ServerError,
  ServiceUnavailableError,
  ValidationError,
  type RtlsClientOptions,
} from '../../../src';
import { toFormFile } from '../../../src/utils/files';
import { coreFixture, fixtureHttpResponse } from './support/core-fixtures';
import { CONTENT_DISPOSITION_CASES } from './support/content-disposition';

const BASE = 'https://files.test/api';
const UPLOAD = `${BASE}/assets/:ns/:mac/documents`;
const DOWNLOAD = `${BASE}/assets/:ns/:mac/documents/:doc/download`;
const MAC = '025d4b0000f1';

function transport(options: RtlsClientOptions = {}) {
  return createRtlsClient({ baseUrl: BASE, apiKey: 'k', ...options }).transport;
}

function only(rec: { requests: readonly RecordedRequest[] }): RecordedRequest {
  expect(rec.requests).toHaveLength(1);
  return rec.requests[0] as RecordedRequest;
}

function form(): FormData {
  const data = new FormData();
  const { blob, filename } = toFormFile({
    data: new TextEncoder().encode('name,mac\nx,025d4b0000f1\n'),
    filename: 'assets.csv',
    contentType: 'text/csv',
  });
  data.append('file', blob, filename);
  data.append('title', 'sdk-test-doc');
  return data;
}

const uploadParams = { namespace: 'ns', mac_address: MAC };
const downloadParams = { namespace: 'ns', mac_address: MAC, documentId: 'd1' };

describe('Transport.upload and Transport.download (P1 §6.3 steps 3 and 9)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('upload', () => {
    it('multipart/form-data with a boundary; the file part keeps .name and .type; string fields kept', async () => {
      server.use(http.post(UPLOAD, () => HttpResponse.json({ _id: 'd1' }, { status: 201 })));
      const rec = recordRequests();
      const result = await transport().upload<{ _id: string }>(
        '/assets/{namespace}/{mac_address}/documents',
        form(),
        { params: uploadParams }
      );
      expect(result).toEqual({ _id: 'd1' });
      const req = only(rec);
      expect(req.method).toBe('POST');
      expect(req.url.pathname).toBe(`/api/assets/ns/${MAC}/documents`);
      expect(req.headers.get('content-type')).toMatch(/^multipart\/form-data; boundary=/);
      expect(req.headers.get('x-api-key')).toBe('k');
      const sent = await req.formData();
      const file = sent.get('file');
      expect(file).toBeInstanceOf(File);
      expect((file as File).name).toBe('assets.csv');
      expect((file as File).type).toBe('text/csv');
      expect(await (file as File).text()).toBe('name,mac\nx,025d4b0000f1\n');
      expect(sent.get('title')).toBe('sdk-test-doc');
    });

    it('a client-level Content-Type: application/json header is removed', async () => {
      server.use(http.post(UPLOAD, () => HttpResponse.json({})));
      const rec = recordRequests();
      await transport({ headers: { 'Content-Type': 'application/json', 'X-Trace': 't' } }).upload(
        '/assets/{namespace}/{mac_address}/documents',
        form(),
        { params: uploadParams }
      );
      const req = only(rec);
      expect(req.headers.get('content-type')).toMatch(/^multipart\/form-data; boundary=/);
      expect(req.headers.get('x-trace')).toBe('t');
    });

    it('a per-call content-type (any case) is removed', async () => {
      server.use(http.post(UPLOAD, () => HttpResponse.json({})));
      const rec = recordRequests();
      await transport().upload('/assets/{namespace}/{mac_address}/documents', form(), {
        params: uploadParams,
        headers: { 'CONTENT-TYPE': 'application/json', 'x-extra': '1' },
      });
      const req = only(rec);
      expect(req.headers.get('content-type')).toMatch(/^multipart\/form-data; boundary=/);
      expect(req.headers.get('x-extra')).toBe('1');
    });

    it('a body passed by a JavaScript caller is ignored: the form is sent', async () => {
      server.use(http.post(UPLOAD, () => HttpResponse.json({})));
      const rec = recordRequests();
      await transport().upload('/assets/{namespace}/{mac_address}/documents', form(), {
        params: uploadParams,
        body: { a: 1 },
      } as never);
      expect(only(rec).headers.get('content-type')).toMatch(/^multipart\/form-data/);
    });

    it('413 → PayloadTooLargeError', async () => {
      server.use(http.post(UPLOAD, () => fixtureHttpResponse(coreFixture('error-e10-413'))));
      const call = transport().upload('/assets/{namespace}/{mac_address}/documents', form(), {
        params: uploadParams,
      });
      await expect(call).rejects.toBeInstanceOf(PayloadTooLargeError);
      await expect(call).rejects.toMatchObject({ status: 413, code: 'PAYLOAD_TOO_LARGE' });
    });

    it('500 HTML → ServerError with the first <pre> line as message', async () => {
      server.use(
        http.post(
          UPLOAD,
          () =>
            new HttpResponse(
              '<!DOCTYPE html><html><body><pre>Error: File too large<br> &nbsp; &nbsp;at x (y)</pre></body></html>',
              { status: 500, headers: { 'content-type': 'text/html; charset=utf-8' } }
            )
        )
      );
      const call = transport().upload('/assets/{namespace}/{mac_address}/documents', form(), {
        params: uploadParams,
      });
      await expect(call).rejects.toBeInstanceOf(ServerError);
      await expect(call).rejects.toMatchObject({ status: 500, message: 'Error: File too large' });
    });

    it('one attempt with retry: true (an upload is never retried)', async () => {
      server.use(http.post(UPLOAD, () => HttpResponse.json({ error: 'busy' }, { status: 503 })));
      const rec = recordRequests();
      await expect(
        transport({ retry: { methods: ['GET', 'POST'] } }).upload(
          '/assets/{namespace}/{mac_address}/documents',
          form(),
          { params: uploadParams }
        )
      ).rejects.toBeInstanceOf(ServiceUnavailableError);
      expect(rec.requests).toHaveLength(1);
    });

    it('a body that is not a FormData → ValidationError with status 0, no request', async () => {
      server.use(http.post(UPLOAD, () => HttpResponse.json({})));
      const rec = recordRequests();
      const call = transport().upload(
        '/assets/{namespace}/{mac_address}/documents',
        { file: 'x' } as never,
        { params: uploadParams }
      );
      await expect(call).rejects.toBeInstanceOf(ValidationError);
      await expect(call).rejects.toMatchObject({ status: 0, details: ['formData'] });
      expect(rec.requests).toHaveLength(0);
    });

    it('a text 2xx answer is parsed by the auto rules', async () => {
      server.use(
        http.post(
          UPLOAD,
          () => new HttpResponse(new TextEncoder().encode('Created'), { status: 201 })
        )
      );
      await expect(
        transport().upload('/assets/{namespace}/{mac_address}/documents', form(), {
          params: uploadParams,
        })
      ).resolves.toBe('Created');
    });
  });

  describe('download', () => {
    const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]);

    function answer(headers: Record<string, string>, status = 200): void {
      server.use(http.get(DOWNLOAD, () => new HttpResponse(pdf, { status, headers })));
    }

    it('the Blob bytes equal the body; contentType from the header; a GET without content-type', async () => {
      answer({
        'content-type': 'application/pdf',
        'content-disposition': 'attachment; filename="a b.pdf"',
      });
      const rec = recordRequests();
      const file = await transport().download(
        '/assets/{namespace}/{mac_address}/documents/{documentId}/download',
        {
          params: downloadParams,
        }
      );
      expect(file.data).toBeInstanceOf(Blob);
      expect(new Uint8Array(await file.data.arrayBuffer())).toEqual(pdf);
      expect(file.contentType).toBe('application/pdf');
      expect(file.filename).toBe('a b.pdf');
      const req = only(rec);
      expect(req.method).toBe('GET');
      expect(req.url.pathname).toBe(`/api/assets/ns/${MAC}/documents/d1/download`);
      expect(req.headers.has('content-type')).toBe(false);
      expect(req.headers.get('x-api-key')).toBe('k');
    });

    it('a JSON content type is still returned as a Blob (never parsed)', async () => {
      server.use(http.get(DOWNLOAD, () => HttpResponse.json({ a: 1 })));
      const file = await transport().download(
        '/assets/{namespace}/{mac_address}/documents/{documentId}/download',
        {
          params: downloadParams,
        }
      );
      expect(file.data).toBeInstanceOf(Blob);
      expect(await file.data.text()).toBe('{"a":1}');
      expect(file.contentType).toBe('application/json');
    });

    it.each(CONTENT_DISPOSITION_CASES)(
      'Content-Disposition $name → filename $filename',
      async ({ header, filename }) => {
        answer(
          header === null
            ? { 'content-type': 'application/pdf' }
            : { 'content-disposition': header }
        );
        const file = await transport().download(
          '/assets/{namespace}/{mac_address}/documents/{documentId}/download',
          {
            params: downloadParams,
          }
        );
        expect(file.filename).toBe(filename);
      }
    );

    it('no Content-Type header → contentType undefined', async () => {
      answer({});
      const file = await transport().download(
        '/assets/{namespace}/{mac_address}/documents/{documentId}/download',
        {
          params: downloadParams,
        }
      );
      expect(file.contentType).toBeUndefined();
      expect(file.filename).toBeUndefined();
      expect(file.data.size).toBe(pdf.byteLength);
    });

    it('204 → an empty Blob', async () => {
      server.use(http.get(DOWNLOAD, () => new HttpResponse(null, { status: 204 })));
      const file = await transport().download(
        '/assets/{namespace}/{mac_address}/documents/{documentId}/download',
        {
          params: downloadParams,
        }
      );
      expect(file.data).toBeInstanceOf(Blob);
      expect(file.data.size).toBe(0);
    });

    it("a Blob of another implementation (a custom fetch's blob()) is returned as is, not emptied", async () => {
      // node-fetch v3 (fetch-blob) and DOM test realms return a Blob that is not an instance of the global Blob.
      const foreign = { size: 3, type: 'application/pdf', text: async () => 'pdf' };
      const customFetch = async (): Promise<Response> => {
        const response = new Response('pdf', {
          headers: {
            'content-type': 'application/pdf',
            'content-disposition': 'attachment; filename="a.pdf"',
          },
        });
        Object.defineProperty(response, 'blob', { value: async () => foreign });
        return response;
      };
      const file = await transport({ fetch: customFetch }).download(
        '/assets/{namespace}/{mac_address}/documents/{documentId}/download',
        { params: downloadParams }
      );
      expect(file.data).toBe(foreign);
      expect(file.filename).toBe('a.pdf');
      expect(file.contentType).toBe('application/pdf');
    });

    it('404 → NotFoundError', async () => {
      server.use(
        http.get(DOWNLOAD, () =>
          HttpResponse.json({ error: 'Document not found' }, { status: 404 })
        )
      );
      const call = transport().download(
        '/assets/{namespace}/{mac_address}/documents/{documentId}/download',
        {
          params: downloadParams,
        }
      );
      await expect(call).rejects.toBeInstanceOf(NotFoundError);
      await expect(call).rejects.toMatchObject({ status: 404, message: 'Document not found' });
    });

    it('a download is a GET: the client policy retries it', async () => {
      vi.spyOn(Math, 'random').mockReturnValue(0);
      let n = 0;
      server.use(
        http.get(DOWNLOAD, () => {
          n += 1;
          return n === 1
            ? HttpResponse.json({ error: 'busy' }, { status: 503 })
            : new HttpResponse(pdf, { headers: { 'content-type': 'application/pdf' } });
        })
      );
      const rec = recordRequests();
      const file = await transport({ retry: true }).download(
        '/assets/{namespace}/{mac_address}/documents/{documentId}/download',
        { params: downloadParams }
      );
      expect(file.data.size).toBe(pdf.byteLength);
      expect(rec.requests).toHaveLength(2);
    });

    it('a parseAs passed by a JavaScript caller is ignored: the body stays a Blob', async () => {
      server.use(http.get(DOWNLOAD, () => HttpResponse.text('plain')));
      const file = await transport().download(
        '/assets/{namespace}/{mac_address}/documents/{documentId}/download',
        {
          params: downloadParams,
          parseAs: 'text',
        } as never
      );
      expect(file.data).toBeInstanceOf(Blob);
      expect(await file.data.text()).toBe('plain');
    });
  });
});
