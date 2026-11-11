/**
 * Asset documents (`client.assetDocuments`): files attached to an asset — upload, follow the processing
 * job, list, read, download and delete.
 *
 * @module resources/asset-documents
 */
import type { RequestOptions } from '../client/base';
import { ResourceBase } from '../client/resource';
import type { DownloadResult } from '../client/transport';
import type { CallContext } from '../context';
import { ValidationError } from '../errors';
import type { OffsetPage } from '../types';
import type {
  AssetDocument,
  AssetDocumentSummary,
  DocumentContentType,
  DocumentDeleteResult,
  DocumentUploadInput,
  DocumentUploadJob,
  DocumentUploadJobCreated,
  DocumentVersion,
  ListDocumentsOptions,
  ListDocumentsPageOptions,
  WaitForJobOptions,
} from '../types/assets';
import { splitCallOptions } from '../utils/args';
import { toFormFile } from '../utils/files';
import { normalizeMac } from '../utils/mac';
import { collectAll, paginateOffset } from '../utils/pagination';
import { pollUntil } from '../utils/poll';

const DOC_TYPE = /^[A-Za-z0-9_-]+$/;
const EXTENSION_TYPES: Readonly<Record<string, DocumentContentType>> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  pdf: 'application/pdf',
};
const CONTENT_TYPES: readonly string[] = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/pdf',
];
const VERSIONS: readonly string[] = ['original', 'medium', 'thumbnail'];
/** Server limit for images. */
const MAX_IMAGE_BYTES = 10_485_760;
/** SDK limit for PDFs, below the ≈16 MiB the server can really process (USI-P2-13). */
const MAX_PDF_BYTES = 15_728_640;
const UPLOAD_TIMEOUT_MS = 120_000;
const LIST_PAGE_SIZE = 100;
const MIN_INTERVAL_MS = 250;

function invalid(message: string, field: string): ValidationError {
  return new ValidationError(message, undefined, { status: 0, details: [field] });
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value) as unknown;
  return proto === Object.prototype || proto === null;
}

function isInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value);
}

function checkId(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw invalid(`${name} must be a non-empty string`, name);
  }
  return value;
}

function isPdf(type: string): boolean {
  return type === 'application/pdf';
}

/** The multipart `file` part (bytes, name and type) after the file name, content type and size checks. */
function fileFor(input: DocumentUploadInput): { blob: Blob; filename: string } {
  const { file, filename } = input;
  // Bytes without a filename become a nameless Blob, which toFormFile rejects with a ValidationError.
  const bytes = file instanceof ArrayBuffer || ArrayBuffer.isView(file);
  const resolved = toFormFile(
    filename !== undefined
      ? { data: file, filename }
      : bytes
        ? new Blob([file as BlobPart])
        : (file as Blob)
  );
  const name = resolved.filename;
  const dot = name.lastIndexOf('.');
  const extension = dot === -1 ? '' : name.slice(dot + 1).toLowerCase();
  const fromExtension = EXTENSION_TYPES[extension];
  if (fromExtension === undefined) {
    throw invalid(
      `The file name ${JSON.stringify(name)} must end with .jpg, .jpeg, .png, .gif, .webp or .pdf`,
      'filename'
    );
  }
  let type: string;
  if (input.contentType !== undefined) {
    if (!CONTENT_TYPES.includes(input.contentType)) {
      throw invalid(
        `contentType must be one of ${CONTENT_TYPES.join(', ')}, received ${JSON.stringify(input.contentType)}`,
        'contentType'
      );
    }
    type = input.contentType;
  } else if (CONTENT_TYPES.includes(resolved.blob.type)) {
    type = resolved.blob.type;
  } else {
    type = fromExtension;
  }
  if (isPdf(type) !== isPdf(fromExtension)) {
    throw invalid(
      `The content type ${type} does not match the extension .${extension}`,
      'contentType'
    );
  }
  const max = isPdf(type) ? MAX_PDF_BYTES : MAX_IMAGE_BYTES;
  if (resolved.blob.size > max) {
    throw invalid(
      `The file has ${resolved.blob.size} bytes; the limit is ${max} bytes for ${isPdf(type) ? 'a PDF' : 'an image'}`,
      'file'
    );
  }
  return { blob: new Blob([resolved.blob], { type }), filename: name };
}

/** The job with `error` reduced to `{ message }`. */
function reduceJob(job: DocumentUploadJob): DocumentUploadJob {
  if (!isPlainObject(job) || !isPlainObject(job.error)) return job;
  const { message } = job.error as { message?: unknown };
  return { ...job, error: { message: typeof message === 'string' ? message : String(message) } };
}

/** Upload, list, download and delete the documents attached to assets. */
export class AssetDocumentsResource extends ResourceBase {
  /**
   * Uploads a document (`POST /assets/{namespace}/{mac_address}/documents`, multipart) and returns the processing
   * job. The server checks the file asynchronously (virus scan, renditions): follow it with {@link waitForJob}.
   *
   * Local checks, in this order: `docType` matches `^[A-Za-z0-9_-]+$`; a filename (`filename`, else `File.name`)
   * ending in `.jpg`, `.jpeg`, `.png`, `.gif`, `.webp` or `.pdf`; the content type (`contentType`, else the Blob's
   * type when allowed, else from the extension) is an image type for an image extension and `application/pdf` for
   * `.pdf`; at most 10 485 760 bytes for an image and 15 728 640 bytes for a PDF (the server cannot process larger
   * files although it documents 50 MB, USI-P2-13); tags are non-empty strings without `,`.
   *
   * The asset does not need to exist. The default `timeoutMs` is 120 000.
   *
   * @param macAddress the asset's MAC address (normalised)
   * @param input the file (`Blob`, `File`, `ArrayBuffer` or `Uint8Array`), its `filename`, `docType`, optional
   *   `contentType`, `description` and `tags`
   * @param options per-call `namespace` (else the client default) and request options
   * @returns the job (`status: 'pending'`) and the future `documentId`
   * @throws {ValidationError} status 0 for a local check (nothing is sent); status 400 for a server check
   *   (`File is required`, `MIME type not allowed: …`, content that does not match the type)
   * @throws {PayloadTooLargeError} 413 when the server's size limit fires
   * @throws {UnsupportedMediaTypeError} 415
   * @throws {ContextError} when no namespace is given or set (nothing is sent)
   * @example
   * ```typescript
   * import { readFile } from 'node:fs/promises';
   *
   * const job = await client.assetDocuments.upload('aabbccddeeff', {
   *   file: await readFile('manual.pdf'),
   *   filename: 'manual.pdf',
   *   docType: 'manual',
   *   tags: ['maintenance'],
   * });
   * const done = await client.assetDocuments.waitForJob(job.jobId);
   * console.log(done.status, done.result?.availableVersions);
   * ```
   */
  async upload(
    macAddress: string,
    input: DocumentUploadInput,
    options?: CallContext & RequestOptions
  ): Promise<DocumentUploadJobCreated> {
    const mac = normalizeMac(macAddress);
    if (!isPlainObject(input)) throw invalid('upload needs an input object', 'input');
    if (typeof input.docType !== 'string' || !DOC_TYPE.test(input.docType)) {
      throw invalid(
        `docType must match ${String(DOC_TYPE)}, received ${JSON.stringify(input.docType)}`,
        'docType'
      );
    }
    const part = fileFor(input);
    const { tags, description } = input;
    if (tags !== undefined) {
      if (!Array.isArray(tags)) throw invalid('tags must be an array of strings', 'tags');
      tags.forEach((tag: unknown, i) => {
        if (typeof tag !== 'string' || tag === '' || tag.includes(',')) {
          throw invalid(`tags[${i}] must be a non-empty string without ","`, `tags[${i}]`);
        }
      });
    }
    if (description !== undefined && typeof description !== 'string') {
      throw invalid('description must be a string', 'description');
    }
    const { ctx, request } = splitCallOptions(options);
    const namespace = this.ns(ctx);
    const form = new FormData();
    form.append('file', part.blob, part.filename);
    form.append('docType', input.docType);
    if (description !== undefined) form.append('description', description);
    if (tags !== undefined && tags.length > 0) form.append('tags', tags.join(','));
    return await this.transport.upload<DocumentUploadJobCreated>(
      '/assets/{namespace}/{mac_address}/documents',
      form,
      {
        params: { namespace, mac_address: mac },
        ...request,
        timeoutMs: request.timeoutMs ?? UPLOAD_TIMEOUT_MS,
      }
    );
  }

  /**
   * Reads an upload job (`GET /assets/{namespace}/documents/jobs/{jobId}`). `error` is reduced to `{ message }`.
   * Finished jobs are deleted 24 h after their creation.
   *
   * @param jobId the `jobId` returned by {@link upload}
   * @param options per-call `namespace` (else the client default) and request options
   * @throws {NotFoundError} `Job not found` (unknown or expired job)
   * @throws {ServerError} `Failed to get job status`
   * @throws {ValidationError} status 0 when `jobId` is empty (nothing is sent)
   * @example
   * ```typescript
   * const job = await client.assetDocuments.getJob(jobId);
   * console.log(job.status, job.progress);
   * ```
   */
  async getJob(jobId: string, options?: CallContext & RequestOptions): Promise<DocumentUploadJob> {
    const id = checkId(jobId, 'jobId');
    const { ctx, request } = splitCallOptions(options);
    const job = await this.transport.request<DocumentUploadJob>(
      'GET',
      '/assets/{namespace}/documents/jobs/{jobId}',
      { params: { namespace: this.ns(ctx), jobId: id }, ...request }
    );
    return reduceJob(job);
  }

  /**
   * Polls {@link getJob} every `intervalMs` (default 1 000, at least 250) until the job is `completed` or `failed`,
   * for at most `maxWaitMs` (default 120 000). A `failed` job is returned, not thrown: read `error.message`.
   * `timeoutMs` applies to each poll and `signal` to the whole wait.
   *
   * @param jobId the `jobId` returned by {@link upload}
   * @param options `intervalMs`, `maxWaitMs`, per-call `namespace` and request options
   * @returns the job in its final state
   * @throws {TimeoutError} when the job is still running after `maxWaitMs`
   * @throws {AbortError} when `signal` aborts
   * @throws {NotFoundError} when the job disappears (unknown or expired)
   * @throws {ValidationError} status 0 for `intervalMs` below 250 or `maxWaitMs` not above 0 (nothing is sent)
   * @example
   * ```typescript
   * const job = await client.assetDocuments.waitForJob(created.jobId, { maxWaitMs: 60_000 });
   * if (job.status === 'failed') console.log(job.error?.message);
   * ```
   */
  async waitForJob(
    jobId: string,
    options?: WaitForJobOptions & CallContext & RequestOptions
  ): Promise<DocumentUploadJob> {
    const { ctx, request, rest } = splitCallOptions(options);
    const intervalMs = rest.intervalMs ?? 1000;
    const maxWaitMs = rest.maxWaitMs ?? UPLOAD_TIMEOUT_MS;
    if (!isInteger(intervalMs) || intervalMs < MIN_INTERVAL_MS) {
      throw invalid(
        `intervalMs must be an integer >= ${MIN_INTERVAL_MS}, received ${String(intervalMs)}`,
        'intervalMs'
      );
    }
    if (!isInteger(maxWaitMs) || maxWaitMs <= 0) {
      throw invalid(`maxWaitMs must be an integer > 0, received ${String(maxWaitMs)}`, 'maxWaitMs');
    }
    checkId(jobId, 'jobId');
    const namespace = this.ns(ctx);
    return await pollUntil(
      () => this.getJob(jobId, { ...request, namespace }),
      (job) => job.status === 'completed' || job.status === 'failed',
      {
        intervalMs,
        maxIntervalMs: intervalMs,
        backoff: 1,
        timeoutMs: maxWaitMs,
        signal: request.signal,
      }
    );
  }

  /**
   * One page of an asset's documents (`GET /assets/{namespace}/{mac_address}/documents`), newest first, pending
   * uploads included. Only the options that are set are sent.
   *
   * @param macAddress the asset's MAC address (normalised)
   * @param options `docType`, `limit` (1..500, server default 50), `offset` (default 0), per-call `namespace` and
   *   request options
   * @returns `{ items, total, limit, offset }`
   * @throws {ValidationError} status 0 for an invalid `limit` or `offset` (nothing is sent)
   * @throws {ServerError} `Failed to list documents`
   * @example
   * ```typescript
   * const page = await client.assetDocuments.listPage('aabbccddeeff', { docType: 'manual', limit: 20 });
   * console.log(`${page.items.length} of ${page.total}`);
   * ```
   */
  async listPage(
    macAddress: string,
    options?: ListDocumentsPageOptions & CallContext & RequestOptions
  ): Promise<OffsetPage<AssetDocumentSummary>> {
    const mac = normalizeMac(macAddress);
    const { ctx, request, rest } = splitCallOptions(options);
    const { docType, limit, offset } = rest;
    if (limit !== undefined && (!isInteger(limit) || limit < 1 || limit > 500)) {
      throw invalid(`limit must be an integer from 1 to 500, received ${String(limit)}`, 'limit');
    }
    if (offset !== undefined && (!isInteger(offset) || offset < 0)) {
      throw invalid(`offset must be an integer >= 0, received ${String(offset)}`, 'offset');
    }
    if (docType !== undefined && typeof docType !== 'string') {
      throw invalid('docType must be a string', 'docType');
    }
    const query: Record<string, string | number> = {};
    if (docType !== undefined) query.docType = docType;
    if (limit !== undefined) query.limit = limit;
    if (offset !== undefined) query.offset = offset;
    return await this.transport.request<OffsetPage<AssetDocumentSummary>>(
      'GET',
      '/assets/{namespace}/{mac_address}/documents',
      { params: { namespace: this.ns(ctx), mac_address: mac }, query, ...request }
    );
  }

  /**
   * Every document of an asset, newest first, read in pages of 100 through {@link listPage}.
   *
   * @param macAddress the asset's MAC address (normalised)
   * @param options `docType`, `maxItems` (stop after that many), per-call `namespace` and request options
   * @throws {ValidationError} status 0 for a `maxItems` that is not a positive integer (nothing is sent)
   * @throws {ServerError} `Failed to list documents`
   * @example
   * ```typescript
   * const docs = await client.assetDocuments.list('aabbccddeeff', { docType: 'photo' });
   * ```
   */
  async list(
    macAddress: string,
    options?: ListDocumentsOptions & CallContext & RequestOptions
  ): Promise<AssetDocumentSummary[]> {
    const mac = normalizeMac(macAddress);
    const { ctx, request, rest } = splitCallOptions(options);
    const { docType, maxItems } = rest;
    if (maxItems !== undefined && (!isInteger(maxItems) || maxItems < 1)) {
      throw invalid(
        `maxItems must be a positive integer, received ${String(maxItems)}`,
        'maxItems'
      );
    }
    const namespace = this.ns(ctx);
    const pages = paginateOffset<AssetDocumentSummary>(
      (offset, limit) =>
        this.listPage(mac, {
          ...(docType !== undefined ? { docType } : {}),
          limit,
          offset,
          ...request,
          namespace,
        }),
      { limit: LIST_PAGE_SIZE, signal: request.signal }
    );
    return await collectAll(pages, maxItems !== undefined ? { maxItems } : undefined);
  }

  /**
   * The metadata of one document (`GET /assets/{namespace}/{mac_address}/documents/{documentId}`).
   *
   * @param macAddress the asset's MAC address (normalised)
   * @param documentId the document id (`doc-…`)
   * @param options per-call `namespace` (else the client default) and request options
   * @throws {NotFoundError} `Document not found`
   * @throws {ServerError} `Failed to get document`
   * @example
   * ```typescript
   * const doc = await client.assetDocuments.get('aabbccddeeff', documentId);
   * console.log(doc.originalFilename, doc.availableVersions);
   * ```
   */
  async get(
    macAddress: string,
    documentId: string,
    options?: CallContext & RequestOptions
  ): Promise<AssetDocument> {
    const mac = normalizeMac(macAddress);
    const id = checkId(documentId, 'documentId');
    const { ctx, request } = splitCallOptions(options);
    return await this.transport.request<AssetDocument>(
      'GET',
      '/assets/{namespace}/{mac_address}/documents/{documentId}',
      { params: { namespace: this.ns(ctx), mac_address: mac, documentId: id }, ...request }
    );
  }

  /**
   * Downloads a document (`GET …/documents/{documentId}/download`): the bytes as a `Blob`, the filename from
   * `Content-Disposition` and the content type. `version` is `original` (default, not sent), `medium` (800 px WebP,
   * images only) or `thumbnail` (200 px WebP for an image; for a PDF its first page as a one-page PDF, USI-P2-15).
   * `filename` keeps the original name and extension even for a WebP rendition. Pass a larger `timeoutMs` for
   * large files.
   *
   * @param macAddress the asset's MAC address (normalised)
   * @param documentId the document id (`doc-…`)
   * @param options `version`, per-call `namespace` and request options
   * @throws {NotFoundError} `Document not found`, or `Version 'x' not available for this document`
   * @throws {ValidationError} status 0 for an unknown `version` (nothing is sent); status 400 from the server
   * @throws {ServerError} `Failed to download document`
   * @example
   * ```typescript
   * const file = await client.assetDocuments.download('aabbccddeeff', documentId, { version: 'thumbnail' });
   * console.log(file.filename, file.contentType, file.data.size);
   * ```
   */
  async download(
    macAddress: string,
    documentId: string,
    options?: { version?: DocumentVersion } & CallContext & RequestOptions
  ): Promise<DownloadResult> {
    const mac = normalizeMac(macAddress);
    const id = checkId(documentId, 'documentId');
    const { ctx, request, rest } = splitCallOptions(options);
    const { version } = rest;
    if (version !== undefined && !VERSIONS.includes(version)) {
      throw invalid(
        `version must be one of ${VERSIONS.join(', ')}, received ${JSON.stringify(version)}`,
        'version'
      );
    }
    return await this.transport.download(
      '/assets/{namespace}/{mac_address}/documents/{documentId}/download',
      {
        params: { namespace: this.ns(ctx), mac_address: mac, documentId: id },
        ...(version !== undefined ? { query: { version } } : {}),
        ...request,
      }
    );
  }

  /**
   * Deletes a document (`DELETE …/documents/{documentId}`). The server keeps the files for 30 days but the
   * document is no longer listed or readable.
   *
   * @param macAddress the asset's MAC address (normalised)
   * @param documentId the document id (`doc-…`)
   * @param options per-call `namespace` (else the client default) and request options
   * @returns `{ message, documentId }`
   * @throws {NotFoundError} `Document not found` (also on a second delete)
   * @throws {ServerError} `Failed to delete document`
   * @example
   * ```typescript
   * await client.assetDocuments.delete('aabbccddeeff', documentId);
   * ```
   */
  async delete(
    macAddress: string,
    documentId: string,
    options?: CallContext & RequestOptions
  ): Promise<DocumentDeleteResult> {
    const mac = normalizeMac(macAddress);
    const id = checkId(documentId, 'documentId');
    const { ctx, request } = splitCallOptions(options);
    return await this.transport.request<DocumentDeleteResult>(
      'DELETE',
      '/assets/{namespace}/{mac_address}/documents/{documentId}',
      { params: { namespace: this.ns(ctx), mac_address: mac, documentId: id }, ...request }
    );
  }
}
