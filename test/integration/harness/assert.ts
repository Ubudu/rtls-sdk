// Redacted deep equality (P0 §6.2 assert.ts, P5 H-P0-2). Key-order-insensitive, arrays order-sensitive. On
// failure the message is `<label>: <n> differences` and up to 20 lines `<path> <missing|extra|type|value>`;
// never a value and never a diff of values (the error carries no actual/expected for a reporter to print).
import { countAssertion } from './assertion-count';
import { isPlainObject } from './policy';

export type DifferenceKind = 'missing' | 'extra' | 'type' | 'value';
export interface Difference {
  path: string;
  kind: DifferenceKind;
}

/** Assertion failure without values. */
export class RedactedAssertionError extends Error {
  readonly differences: readonly Difference[];
  constructor(message: string, differences: readonly Difference[]) {
    super(message);
    this.name = 'AssertionError';
    this.differences = differences;
  }
}

type Segment = string | number;

function parsePattern(pattern: string): string[] {
  const parts: string[] = [];
  for (const piece of pattern.split('.')) {
    const re = /([^[\]]+)|\[([^\]]*)\]/g;
    for (let m = re.exec(piece); m; m = re.exec(piece)) {
      if (m[1] !== undefined) parts.push(m[1]);
      else parts.push(`[${m[2] as string}]`);
    }
  }
  return parts;
}

function segmentText(segment: Segment): string {
  return typeof segment === 'number' ? `[${segment}]` : segment;
}

function matches(pattern: string[], path: Segment[]): boolean {
  if (pattern.length !== path.length) return false;
  return pattern.every((p, i) => p === '*' || p === '[*]' || p === segmentText(path[i] as Segment));
}

export function formatPath(path: readonly Segment[]): string {
  let out = '';
  for (const segment of path) {
    if (typeof segment === 'number') out += `[${segment}]`;
    else out += out === '' ? segment : `.${segment}`;
  }
  return out === '' ? '<root>' : out;
}

function typeOf(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

/** Differences between `actual` and `expected` (paths and kinds only). */
export function diffRedacted(
  actual: unknown,
  expected: unknown,
  options: { ignorePaths?: string[] } = {}
): Difference[] {
  const ignore = (options.ignorePaths ?? []).map(parsePattern);
  const out: Difference[] = [];
  const ignored = (path: Segment[]): boolean => ignore.some((p) => matches(p, path));
  const walk = (a: unknown, e: unknown, path: Segment[]): void => {
    if (ignored(path)) return;
    const ta = typeOf(a);
    const te = typeOf(e);
    if (ta !== te) {
      out.push({ path: formatPath(path), kind: 'type' });
      return;
    }
    if (Array.isArray(a) && Array.isArray(e)) {
      const n = Math.max(a.length, e.length);
      for (let i = 0; i < n; i += 1) {
        const p = [...path, i];
        if (ignored(p)) continue;
        if (i >= a.length) out.push({ path: formatPath(p), kind: 'missing' });
        else if (i >= e.length) out.push({ path: formatPath(p), kind: 'extra' });
        else walk(a[i], e[i], p);
      }
      return;
    }
    if (isPlainObject(a) && isPlainObject(e)) {
      const keys = new Set([...Object.keys(a), ...Object.keys(e)]);
      for (const key of [...keys].sort()) {
        const p = [...path, key];
        if (ignored(p)) continue;
        const inA = Object.hasOwn(a, key) && a[key] !== undefined;
        const inE = Object.hasOwn(e, key) && e[key] !== undefined;
        if (!inA && inE) out.push({ path: formatPath(p), kind: 'missing' });
        else if (inA && !inE) out.push({ path: formatPath(p), kind: 'extra' });
        else if (inA && inE) walk(a[key], e[key], p);
      }
      return;
    }
    if (!Object.is(a, e)) out.push({ path: formatPath(path), kind: 'value' });
  };
  walk(actual, expected, []);
  return out;
}

export function expectDeepEqualRedacted(
  actual: unknown,
  expected: unknown,
  label: string,
  options: { ignorePaths?: string[] } = {}
): void {
  const differences = diffRedacted(actual, expected, options);
  if (differences.length === 0) {
    countAssertion();
    return;
  }
  const lines = differences.slice(0, 20).map((d) => `${d.path} ${d.kind}`);
  throw new RedactedAssertionError(
    `${label}: ${differences.length} differences\n${lines.join('\n')}`,
    differences
  );
}
