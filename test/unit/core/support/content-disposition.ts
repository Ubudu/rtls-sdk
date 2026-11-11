// Content-Disposition vectors shared by files.test.ts (parseContentDisposition) and transport.upload-download.test.ts
// (download), so both check the same rules (P1 §6.7: filename*=UTF-8'' wins, then quoted, then token).
export interface ContentDispositionCase {
  name: string;
  /** Header value; `null` = no header. */
  header: string | null;
  filename: string | undefined;
}

export const CONTENT_DISPOSITION_CASES: readonly ContentDispositionCase[] = [
  { name: 'quoted with a space', header: 'attachment; filename="a b.pdf"', filename: 'a b.pdf' },
  {
    name: "filename*=UTF-8'' beats filename=",
    header: `attachment; filename="resume.pdf"; filename*=UTF-8''r%C3%A9sum%C3%A9.pdf`,
    filename: 'résumé.pdf',
  },
  {
    name: "filename*=UTF-8'' wins when it comes first",
    header: `attachment; filename*=UTF-8''r%C3%A9sum%C3%A9.pdf; filename="resume.pdf"`,
    filename: 'résumé.pdf',
  },
  { name: 'token form', header: 'attachment; filename=report.csv', filename: 'report.csv' },
  { name: 'no header', header: null, filename: undefined },
  { name: 'an empty header', header: '', filename: undefined },
  { name: 'no filename parameter', header: 'attachment', filename: undefined },
  { name: 'a ; inside the quotes', header: 'inline; filename="a;b.txt"', filename: 'a;b.txt' },
  {
    name: 'escaped quotes inside the quotes',
    header: 'attachment; filename="say \\"hi\\".txt"',
    filename: 'say "hi".txt',
  },
  {
    name: 'parameter names are case-insensitive',
    header: 'attachment; FILENAME="UP.TXT"',
    filename: 'UP.TXT',
  },
  {
    name: 'an ISO-8859-1 extended value',
    header: `attachment; filename*=iso-8859-1'en'%A3rates.txt`,
    filename: '£rates.txt',
  },
  {
    name: 'a malformed extended value falls back to filename',
    header: `attachment; filename*=UTF-8''%E0%A4%A; filename="fallback.txt"`,
    filename: 'fallback.txt',
  },
  {
    name: 'an unknown charset falls back to filename',
    header: `attachment; filename*=x-unknown''abc; filename=plain.txt`,
    filename: 'plain.txt',
  },
  {
    name: 'an extended value without quotes marks falls back',
    header: 'attachment; filename*=plain; filename=other.txt',
    filename: 'other.txt',
  },
  { name: 'an empty quoted filename', header: 'attachment; filename=""', filename: undefined },
  {
    name: 'a header that starts with the parameter',
    header: 'filename="bare.txt"',
    filename: 'bare.txt',
  },
];
