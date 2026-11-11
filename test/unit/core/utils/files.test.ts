import { describe, it, expect } from 'vitest';
import { parseContentDisposition, toFormFile } from '../../../../src/utils/files';
import { ValidationError } from '../../../../src/errors';
import { CONTENT_DISPOSITION_CASES } from '../support/content-disposition';

const bytesOf = async (blob: Blob): Promise<number[]> => [
  ...new Uint8Array(await blob.arrayBuffer()),
];

describe('file helpers (P1 §6.7, src/utils/files.ts)', () => {
  describe('toFormFile', () => {
    it('a File keeps its name, type and bytes', async () => {
      const file = new File(['hello'], 'a.png', { type: 'image/png' });
      const part = toFormFile(file);
      expect(part.filename).toBe('a.png');
      expect(part.blob.type).toBe('image/png');
      expect(part.blob).toBe(file);
      expect(await part.blob.text()).toBe('hello');
    });

    it('{ data: Uint8Array, filename, contentType } → a Blob with that type and those bytes', async () => {
      const part = toFormFile({
        data: new Uint8Array([1, 2, 3]),
        filename: 'raw.bin',
        contentType: 'application/x-test',
      });
      expect(part.filename).toBe('raw.bin');
      expect(part.blob).toBeInstanceOf(Blob);
      expect(part.blob.type).toBe('application/x-test');
      expect(await bytesOf(part.blob)).toEqual([1, 2, 3]);
    });

    it('a typed-array view keeps only its own bytes (byteOffset / byteLength)', async () => {
      const buffer = new Uint8Array([9, 9, 4, 5, 6, 9]);
      const part = toFormFile({ data: buffer.subarray(2, 5), filename: 'view.bin' });
      expect(await bytesOf(part.blob)).toEqual([4, 5, 6]);
      expect(part.blob.type).toBe('');
    });

    it('an ArrayBuffer and a DataView are accepted', async () => {
      const ab = new Uint8Array([7, 8]).buffer;
      expect(await bytesOf(toFormFile({ data: ab, filename: 'ab.bin' }).blob)).toEqual([7, 8]);
      const dv = new DataView(new Uint8Array([0, 1, 2, 3]).buffer, 1, 2);
      expect(await bytesOf(toFormFile({ data: dv, filename: 'dv.bin' }).blob)).toEqual([1, 2]);
    });

    it("{ data: new File([…], 'a.png'), filename: 'b.png' } → filename b.png (the object form wins)", () => {
      const part = toFormFile({
        data: new File(['x'], 'a.png', { type: 'image/png' }),
        filename: 'b.png',
      });
      expect(part.filename).toBe('b.png');
      expect(part.blob.type).toBe('image/png');
    });

    it('the object form contentType replaces the type of a Blob', async () => {
      const part = toFormFile({
        data: new Blob(['a,b'], { type: 'text/plain' }),
        filename: 'x.csv',
        contentType: 'text/csv',
      });
      expect(part.blob.type).toBe('text/csv');
      expect(await part.blob.text()).toBe('a,b');
    });

    it("toFormFile(new File([…], 'a.png'), 'c.png') → a.png (the fallback applies to a bare Blob only)", () => {
      expect(toFormFile(new File(['x'], 'a.png'), 'c.png').filename).toBe('a.png');
    });

    it('a bare Blob takes the fallback filename', () => {
      const blob = new Blob(['x'], { type: 'text/plain' });
      const part = toFormFile(blob, 'fallback.txt');
      expect(part).toEqual({ blob, filename: 'fallback.txt' });
    });

    it('a File with an empty name takes the fallback filename', () => {
      expect(toFormFile(new File(['x'], ''), 'named.txt').filename).toBe('named.txt');
    });

    it.each<[string, () => unknown]>([
      ['a bare Blob without a fallback', () => toFormFile(new Blob(['x']))],
      ['a bare Blob with an empty fallback', () => toFormFile(new Blob(['x']), '')],
      ['an empty filename', () => toFormFile({ data: new Blob(['x']), filename: '' })],
      ['a missing filename', () => toFormFile({ data: new Blob(['x']) } as never)],
      [
        'a non-string contentType',
        () => toFormFile({ data: new Blob(['x']), filename: 'a', contentType: 1 } as never),
      ],
      ['data of the wrong kind', () => toFormFile({ data: 'text', filename: 'a.txt' } as never)],
      ['null', () => toFormFile(null as never)],
      ['a string', () => toFormFile('file.txt' as never)],
    ])('%s → ValidationError with status 0', (_name, call) => {
      expect(call).toThrow(ValidationError);
      expect(call).toThrow(
        expect.objectContaining({ status: 0, code: 'VALIDATION_ERROR', details: ['file'] })
      );
    });
  });

  describe('parseContentDisposition', () => {
    it.each(CONTENT_DISPOSITION_CASES)('$name → $filename', ({ header, filename }) => {
      expect(parseContentDisposition(header)).toBe(filename);
    });

    it('undefined → undefined', () => {
      expect(parseContentDisposition(undefined)).toBeUndefined();
    });
  });
});
