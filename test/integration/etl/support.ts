/**
 * Shared helpers of the ETL live tests (P7 §8.5): the pre-scrub applied to every recorded body before
 * `recordFixture`, because the harness scrub keeps ids, the run id and the run's test MACs.
 */

/**
 * A pre-scrub bound to the run id given by `getRunId` (read on every call). It replaces, at any depth of a value
 * (keys included):
 * - standalone 24-hex ids by `64b0000000000000000000NN`, in order of first appearance; a longer hex value (the
 *   namespace) is left whole for the harness scrub;
 * - `sdk-test-<runId>` by `sdk-test-000000`;
 * - the run's test MACs `025d4b<runId[0..4]>NN` by `025d4b0000NN`.
 *
 * Each call of `createPreScrub` keeps its own id numbering.
 */
export function createPreScrub(getRunId: () => string): <T>(value: T) => T {
  const scrubbedIds = new Map<string, string>();
  const idOf = (hex: string): string => {
    let out = scrubbedIds.get(hex);
    if (out === undefined) {
      out = `64b0000000000000000000${String(scrubbedIds.size + 1).padStart(2, '0')}`;
      scrubbedIds.set(hex, out);
    }
    return out;
  };
  return <T>(value: T): T => {
    const id = getRunId();
    const macRe = new RegExp(`025d4b${id.slice(0, 4)}([0-9a-f]{2})`, 'g');
    const walk = (v: unknown): unknown => {
      if (typeof v === 'string') {
        return v
          .replace(/(?<![0-9a-f])[0-9a-f]{24}(?![0-9a-f])/g, idOf)
          .replaceAll(`sdk-test-${id}`, 'sdk-test-000000')
          .replace(macRe, '025d4b0000$1');
      }
      if (Array.isArray(v)) return v.map(walk);
      if (v !== null && typeof v === 'object') {
        return Object.fromEntries(Object.entries(v).map(([k, x]) => [walk(k) as string, walk(x)]));
      }
      return v;
    };
    return walk(value) as T;
  };
}
