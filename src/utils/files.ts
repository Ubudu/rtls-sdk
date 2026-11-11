/**
 * File helpers for multipart uploads and downloads.
 *
 * @module utils/files
 */
import { ValidationError } from '../errors';

/**
 * A file to upload: a `Blob` (a `File` keeps its own name), or bytes with an explicit filename and an optional
 * content type. A bare `Blob` without a name needs a fallback filename from the resource that uploads it: without
 * a filename the server sees the part as `blob` / `application/octet-stream`.
 */
export type UploadFile =
  Blob | { data: Blob | ArrayBuffer | ArrayBufferView; filename: string; contentType?: string };

function fileError(message: string): ValidationError {
  return new ValidationError(message, undefined, { status: 0, details: ['file'] });
}

function isFile(value: Blob): value is File {
  return typeof File !== 'undefined' && value instanceof File;
}

function bytesOf(data: ArrayBuffer | ArrayBufferView): Uint8Array<ArrayBuffer> {
  const view =
    data instanceof ArrayBuffer
      ? new Uint8Array(data)
      : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  // A copy: the Blob owns its bytes, whatever kind of buffer the caller passed.
  const copy = new Uint8Array(view.byteLength);
  copy.set(view);
  return copy;
}

/**
 * The `Blob` and filename of a multipart file part (`form.append('file', blob, filename)`).
 *
 * Filename, first match: the object form's `filename` (it wins over `data.name` when `data` is a `File`); a `File`'s
 * own `name`; for a bare `Blob`, `fallbackFilename`. `fallbackFilename` never overrides a `File`'s name: a caller
 * with an explicit name passes the object form. The object form's `contentType`, when set, becomes the Blob's type.
 *
 * @throws {ValidationError} status 0 for a bare `Blob` without a fallback filename, an empty filename, or a value
 *   that is not an {@link UploadFile}
 * @internal
 */
export function toFormFile(
  file: UploadFile,
  fallbackFilename?: string
): { blob: Blob; filename: string } {
  if (file instanceof Blob) {
    if (isFile(file) && file.name !== '') return { blob: file, filename: file.name };
    if (typeof fallbackFilename === 'string' && fallbackFilename !== '') {
      return { blob: file, filename: fallbackFilename };
    }
    throw fileError(
      'A Blob without a name needs a filename: pass { data, filename } (the server would see it as "blob")'
    );
  }
  if (typeof file !== 'object' || file === null) {
    throw fileError('file must be a Blob, a File or { data, filename, contentType? }');
  }
  const { data, filename, contentType } = file;
  if (typeof filename !== 'string' || filename === '') {
    throw fileError('file.filename must be a non-empty string');
  }
  if (contentType !== undefined && typeof contentType !== 'string') {
    throw fileError('file.contentType must be a string');
  }
  if (data instanceof Blob) {
    const blob = contentType === undefined ? data : new Blob([data], { type: contentType });
    return { blob, filename };
  }
  if (data instanceof ArrayBuffer || ArrayBuffer.isView(data)) {
    return { blob: new Blob([bytesOf(data)], { type: contentType ?? '' }), filename };
  }
  throw fileError('file.data must be a Blob, an ArrayBuffer or a typed array');
}

/** `name=value` parameters of a header value; a quoted value may contain `;`. Names are lower-cased. */
function headerParameters(value: string): Map<string, string> {
  const params = new Map<string, string>();
  const re = /;\s*([^\s=;]+)\s*=\s*("(?:[^"\\]|\\.)*"|[^;]*)/g;
  for (let m = re.exec(value); m; m = re.exec(value)) {
    const name = (m[1] as string).toLowerCase();
    let raw = (m[2] as string).trim();
    if (raw.startsWith('"')) raw = raw.slice(1, -1).replace(/\\(.)/g, '$1');
    if (!params.has(name)) params.set(name, raw);
  }
  return params;
}

/** RFC 5987 `charset'language'percent-encoded`; `undefined` when unreadable. */
function decodeExtValue(value: string): string | undefined {
  const m = /^([^']*)'[^']*'(.*)$/.exec(value);
  if (!m) return undefined;
  const charset = (m[1] as string).toLowerCase();
  const encoded = m[2] as string;
  try {
    if (charset === 'utf-8') return decodeURIComponent(encoded);
    if (charset === 'iso-8859-1') {
      return encoded.replace(/%([0-9a-f]{2})/gi, (_s, hex: string) =>
        String.fromCharCode(parseInt(hex, 16))
      );
    }
  } catch {
    return undefined;
  }
  return undefined;
}

/**
 * The filename of a `Content-Disposition` header: `filename*=UTF-8''…` (RFC 5987) wins, then a quoted `filename="…"`,
 * then a token `filename=…`. `undefined` when the header is missing or carries no readable filename. The name is
 * returned as sent; sanitise it before using it as a path.
 *
 * @example
 * ```typescript
 * parseContentDisposition('attachment; filename="report.pdf"'); // 'report.pdf'
 * parseContentDisposition("attachment; filename=x.pdf; filename*=UTF-8''r%C3%A9sum%C3%A9.pdf"); // 'résumé.pdf'
 * ```
 * @internal
 */
export function parseContentDisposition(value: string | null | undefined): string | undefined {
  if (typeof value !== 'string' || value.trim() === '') return undefined;
  // Skip the disposition type (`attachment`, `inline`); a header that starts with a parameter is read whole.
  const end = value.indexOf(';');
  const head = end === -1 ? value : value.slice(0, end);
  const params = headerParameters(head.includes('=') ? `;${value}` : value.slice(head.length));
  const extended = params.get('filename*');
  if (extended !== undefined) {
    const decoded = decodeExtValue(extended);
    if (decoded !== undefined && decoded !== '') return decoded;
  }
  const plain = params.get('filename');
  return plain === undefined || plain === '' ? undefined : plain;
}
