// Fixture recorder (P0 §6.2 recorder.ts, §5.5.1; CONVENTIONS §6). In a run started with `--record` (the driver
// writes the marker `.state/<runId>/record`), `recordFixture(domain, name, response, note?)` writes
// `test/fixtures/<domain>/<name>.json` in the fixture envelope: exactly one of `body` (JSON, or null for a 204 or
// an empty body), `text` (a string body whose content type is not JSON, with that `contentType`) or `base64`
// (bytes). The body is scrubbed (scrub.ts) first. A body the vendored spec accepts is stored as `_source: 'spec'`;
// any other needs a note and is stored as `_source: 'live'`. The recorder refuses every operation under
// `/spatial/navigate/` (graph diagnostics and routes are never stored, LIVE-TESTING §5; P4 writes those fixtures
// as `server-code`) and any output that still holds the key, the namespace or a hygiene finding of the fixture
// contract, in the scrubbed text or in the bytes of a binary body (which cannot be scrubbed). Refusal messages carry
// labels only, never a value.
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { format, resolveConfig } from 'prettier';
import { activeHarness } from './active';
import { residualSecrets, scrubText, scrubWith } from './scrub';
import {
  checkFixture,
  FIXTURE_DOMAINS,
  type FixtureEnvelope,
  type LoadedFixture,
} from '../../contract/fixtures';
import { specValidator } from '../../contract/spec';
import type { DomainKey } from './policy';

export interface RecordedResponse {
  /** "METHOD path" exactly as in base.json */
  operation: string;
  status: number;
  headers?: Headers;
  body: unknown;
}

/** The recorder refused to store a response (the message names the reason, never a value). */
export class RecorderRefusal extends Error {
  constructor(message: string) {
    super(`recordFixture: ${message}`);
    this.name = 'RecorderRefusal';
  }
}

const NAME_RE = /^[a-z0-9][a-z0-9._-]{0,99}$/;
/** Response headers kept in a fixture besides the content type (scrubbed). */
const KEPT_HEADERS = ['x-total-count', 'content-disposition', 'retry-after'];

export function recordMarkerPath(stateDir: string): string {
  return join(stateDir, 'record');
}

function isJsonType(contentType: string | undefined): boolean {
  return contentType !== undefined && /[/+]json\b/i.test(contentType);
}

type BodyPart = Pick<FixtureEnvelope, 'body' | 'text' | 'base64' | 'contentType'>;

/** Exactly one of body / text / base64, chosen from the response (P0 §6.2 recorder). */
function bodyPart(response: RecordedResponse, contentType: string | undefined): BodyPart {
  const { body, status } = response;
  if (status === 204 || body === undefined || body === null || body === '') return { body: null };
  if (body instanceof ArrayBuffer || ArrayBuffer.isView(body)) {
    const bytes =
      body instanceof ArrayBuffer
        ? new Uint8Array(body)
        : new Uint8Array(body.buffer, body.byteOffset, body.byteLength);
    return {
      base64: Buffer.from(bytes).toString('base64'),
      ...(contentType ? { contentType } : {}),
    };
  }
  if (typeof body === 'string') {
    if (isJsonType(contentType)) {
      try {
        return withJsonType({ body: JSON.parse(body) as unknown }, contentType);
      } catch {
        // a JSON content type with a body that is not JSON: stored as text
      }
    }
    return { text: body, ...(contentType ? { contentType } : {}) };
  }
  return withJsonType({ body }, contentType);
}

function withJsonType(part: BodyPart, contentType: string | undefined): BodyPart {
  const base = contentType?.split(';')[0]?.trim().toLowerCase();
  return base && base !== 'application/json' ? { ...part, contentType } : part;
}

function keptHeaders(headers: Headers | undefined): Record<string, string> | undefined {
  if (!headers) return undefined;
  const out: Record<string, string> = {};
  for (const name of KEPT_HEADERS) {
    const value = headers.get(name);
    if (value !== null) out[name] = scrubText(value);
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

async function formatted(file: string, value: unknown): Promise<string> {
  const options = (await resolveConfig(file)) ?? {};
  return format(JSON.stringify(value), { ...options, parser: 'json', filepath: file });
}

/**
 * Writes the fixture `test/fixtures/<domain>/<name>.json` when the run was started with `--record`; returns
 * false (and writes nothing) otherwise. Throws RecorderRefusal for a navigation operation, a spec-invalid body
 * without a note, or an output that still holds a secret or a hygiene finding.
 */
export async function recordFixture(
  domain: DomainKey,
  name: string,
  response: RecordedResponse,
  note?: string
): Promise<boolean> {
  if (!(FIXTURE_DOMAINS as readonly string[]).includes(domain)) {
    throw new TypeError(`recordFixture: unknown domain ${String(domain)}`);
  }
  const base = typeof name === 'string' && name.endsWith('.json') ? name.slice(0, -5) : name;
  if (typeof base !== 'string' || !NAME_RE.test(base) || base.includes('..')) {
    throw new TypeError(`recordFixture: name must match ${String(NAME_RE)}`);
  }
  const m = /^([A-Z]+) (\/\S*)$/.exec(response?.operation ?? '');
  if (!m) throw new TypeError('recordFixture: operation must be "METHOD path"');
  if (!Number.isInteger(response.status)) throw new TypeError('recordFixture: status required');
  if ((m[2] as string).startsWith('/spatial/navigate/')) {
    throw new RecorderRefusal(
      'navigation graph diagnostics and routes are never stored (LIVE-TESTING §5; write a server-code fixture)'
    );
  }

  const h = activeHarness();
  if (!existsSync(recordMarkerPath(h.stateDir))) return false;

  const validator = specValidator();
  const contentType = response.headers?.get('content-type') ?? undefined;
  const part = bodyPart(response, contentType);
  const scrubbed: BodyPart = { ...part };
  if (part.body !== undefined && part.body !== null) scrubbed.body = scrubWith(part.body);
  if (part.text !== undefined) scrubbed.text = scrubText(part.text);
  if (part.base64 !== undefined) {
    // bytes cannot be scrubbed: any key, namespace or hygiene finding in them refuses the fixture
    const decoded = Buffer.from(part.base64, 'base64').toString('latin1');
    const leaked = residualSecrets(decoded);
    if (leaked.length > 0) throw new RecorderRefusal(`binary body holds ${leaked.join('; ')}`);
  }
  const headers = keptHeaders(response.headers);
  const recorded = { specVersion: validator.spec.info?.version ?? 'unknown', runId: h.runId };
  const envelope = (source: 'spec' | 'live'): FixtureEnvelope => ({
    _source: source,
    ...(note !== undefined ? { _note: note } : {}),
    _operation: response.operation,
    _recorded: recorded,
    status: response.status,
    ...(scrubbed.contentType !== undefined ? { contentType: scrubbed.contentType } : {}),
    ...(headers ? { headers } : {}),
    ...(scrubbed.base64 !== undefined
      ? { base64: scrubbed.base64 }
      : scrubbed.text !== undefined
        ? { text: scrubbed.text }
        : { body: scrubbed.body ?? null }),
  });
  const file = join(h.fixturesDir, domain, `${base}.json`);
  const check = async (data: FixtureEnvelope): Promise<{ raw: string; errors: string[] }> => {
    const raw = await formatted(file, data);
    const loaded: LoadedFixture = { domain, name: base, file, raw, data };
    return { raw, errors: checkFixture(loaded, validator).errors };
  };

  let result = await check(envelope('spec'));
  const residual = residualSecrets(result.raw);
  if (residual.length > 0) {
    throw new RecorderRefusal(`the scrubbed output still holds ${residual.join('; ')}`);
  }
  if (result.errors.length > 0) {
    if (typeof note !== 'string' || note.trim() === '') {
      throw new RecorderRefusal(
        `the body does not validate against the spec for ${response.operation} ${response.status}; pass a note (stored as _source live)`
      );
    }
    result = await check(envelope('live'));
  }
  if (result.errors.length > 0) {
    throw new RecorderRefusal(`the fixture breaks the contract: ${result.errors.join('; ')}`);
  }
  mkdirSync(join(h.fixturesDir, domain), { recursive: true });
  writeFileSync(file, result.raw);
  return true;
}
