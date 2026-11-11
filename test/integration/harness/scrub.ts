// Scrubbing of recorded responses (LIVE-TESTING §2.2, README §7.9, P0 §6.2 scrub.ts). Keys that name a person,
// a credential or a recipient become '<redacted>'; in every string (object keys included) the API key becomes
// '<redacted>', the namespace 'test-namespace', a bearer credential or JWT-like token '<redacted-token>' and an
// e-mail address 'user@example.invalid'. `residualSecrets` lists what a scrubbed text still holds (the key, the
// namespace, and the fixture contract's hygiene findings), so the recorder can refuse it. Labels only: no
// function here returns or logs a value it found.
import { peekActiveHarness } from './active';
import { isPlainObject } from './policy';
import { hygieneProblems } from '../../contract/fixtures';

export const REDACTED = '<redacted>';
export const REDACTED_TOKEN = '<redacted-token>';
export const SCRUBBED_EMAIL = 'user@example.invalid';
export const SCRUBBED_NAMESPACE = 'test-namespace';

/** Keys whose value is replaced by '<redacted>' (exact names). */
export const SCRUB_KEYS: readonly string[] = [
  'user',
  'username',
  'user_id',
  'userId',
  'owner',
  'created_by',
  'createdBy',
  'updated_by',
  'email',
  'mail',
  'token',
  'access_token',
  'refresh_token',
  'api_key',
  'apiKey',
  'secret',
  'password',
  'authorization',
  'cookie',
  'phone',
  'receiver',
  'recipient',
  'recipients',
  'shared_with',
  'preferred_username',
];

export interface ScrubSecrets {
  apiKey?: string;
  namespace?: string;
}

const BEARER_RE = /Bearer\s+[A-Za-z0-9._~+/-]+=*/g;
const JWT_RE = /\beyJ[A-Za-z0-9_-]{8,}(?:\.[A-Za-z0-9_-]*){0,2}/g;
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

/** The configured key and namespace of the active harness, when one exists. */
export function activeSecrets(): ScrubSecrets {
  const h = peekActiveHarness();
  return h ? { apiKey: h.env.apiKey, namespace: h.env.namespace } : {};
}

function forms(value: string | undefined): string[] {
  if (typeof value !== 'string' || value === '') return [];
  const encoded = encodeURIComponent(value);
  return encoded === value ? [value] : [value, encoded];
}

/** The value replacements of one string. */
export function scrubText(text: string, secrets: ScrubSecrets = activeSecrets()): string {
  let out = text;
  for (const f of forms(secrets.apiKey)) out = out.split(f).join(REDACTED);
  for (const f of forms(secrets.namespace)) out = out.split(f).join(SCRUBBED_NAMESPACE);
  return out
    .replace(BEARER_RE, REDACTED_TOKEN)
    .replace(JWT_RE, REDACTED_TOKEN)
    .replace(EMAIL_RE, SCRUBBED_EMAIL);
}

/** Deep copy of `value` with the key and value replacements applied (pure form of `scrub`). */
export function scrubWith(
  value: unknown,
  options: { extraKeys?: readonly string[]; secrets?: ScrubSecrets } = {}
): unknown {
  const secrets = options.secrets ?? activeSecrets();
  const keys = new Set([...SCRUB_KEYS, ...(options.extraKeys ?? [])]);
  const walk = (v: unknown): unknown => {
    if (typeof v === 'string') return scrubText(v, secrets);
    if (Array.isArray(v)) return v.map(walk);
    if (isPlainObject(v)) {
      const out: Record<string, unknown> = {};
      for (const [k, item] of Object.entries(v)) {
        out[scrubText(k, secrets)] =
          keys.has(k) && item !== null && item !== undefined ? REDACTED : walk(item);
      }
      return out;
    }
    return v;
  };
  return walk(value);
}

/**
 * Scrubs a response body for a fixture: keys of SCRUB_KEYS (plus `extraKeys`) → '<redacted>'; e-mail →
 * 'user@example.invalid'; JWT-like or bearer token → '<redacted-token>'; the API key → '<redacted>'; APP_NAMESPACE
 * → 'test-namespace' (the key and namespace of the active harness).
 */
export function scrub(value: unknown, extraKeys?: string[]): unknown {
  return scrubWith(value, { extraKeys });
}

/**
 * What a (scrubbed) text still holds that must not be stored: `api-key`, `namespace`, and the hygiene findings
 * of the fixture contract (e-mail, JWT, bearer credential, 40-hex identifier, server references). Labels only.
 */
export function residualSecrets(text: string, secrets: ScrubSecrets = activeSecrets()): string[] {
  const found: string[] = [];
  if (forms(secrets.apiKey).some((f) => text.includes(f))) found.push('api-key');
  if (forms(secrets.namespace).some((f) => text.includes(f))) found.push('namespace');
  return [...found, ...hygieneProblems(text)];
}
