// Run facts (P0 §5.2 U1–U9): observations a live test records for the phase report without printing anything
// (tests may not log, P0 §5.4). `recordFact(name, value)` merges one entry into `.state/<runId>/facts.json`, and
// global teardown copies the file into `report.json.facts`. Only values that cannot carry a credential, an
// identifier or a response body are accepted: booleans, finite numbers, null, and media-type strings
// (`text/plain; charset=utf-8`), never one that contains the configured key or namespace.
import { join } from 'node:path';
import { activeHarness } from './active';
import { readJsonFileSync, updateJsonFileSync } from './state-io.mjs';

export type FactValue = boolean | number | string | null;

const NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/;
const MEDIA_TYPE_RE =
  /^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+(?:\s*;\s*[a-z0-9_-]+=[a-z0-9_.-]+)*$/i;

export function factsPath(stateDir: string): string {
  return join(stateDir, 'facts.json');
}

/** Throws TypeError unless `value` is a boolean, a finite number, null or a media-type string. */
export function checkFactValue(value: unknown, secrets: readonly string[] = []): FactValue {
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('recordFact: number must be finite');
    return value;
  }
  if (typeof value === 'string') {
    if (value.length > 100 || !MEDIA_TYPE_RE.test(value))
      throw new TypeError('recordFact: a string value must be a media type');
    if (secrets.some((s) => s !== '' && value.includes(s)))
      throw new TypeError('recordFact: value refused');
    return value;
  }
  throw new TypeError('recordFact: value must be a boolean, a number, null or a media type');
}

/** Records one fact of the run (last write of a name wins). */
export function recordFact(name: string, value: FactValue): void {
  if (typeof name !== 'string' || !NAME_RE.test(name))
    throw new TypeError(`recordFact: name must match ${String(NAME_RE)}`);
  const h = activeHarness();
  const checked = checkFactValue(value, [h.env.apiKey, h.env.namespace]);
  updateJsonFileSync<Record<string, FactValue>>(factsPath(h.stateDir), {}, (current) => ({
    ...current,
    [name]: checked,
  }));
}

/** The facts recorded for a run (empty when none). */
export function readFacts(stateDir: string): Record<string, FactValue> {
  const value = readJsonFileSync<Record<string, FactValue> | null>(factsPath(stateDir), null);
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}
