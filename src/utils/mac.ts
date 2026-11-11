/**
 * MAC address helpers. The API stores MAC addresses as 12 lowercase hex characters; the transport normalises
 * every `mac_address` path parameter with {@link normalizeMac}.
 *
 * @module utils/mac
 */
import { ValidationError } from '../errors';

const SEPARATORS = /[:.-]/g;
const TWELVE_HEX = /^[0-9a-f]{12}$/i;

function stripped(mac: unknown): string | undefined {
  if (typeof mac !== 'string') return undefined;
  const value = mac.replace(SEPARATORS, '');
  return TWELVE_HEX.test(value) ? value.toLowerCase() : undefined;
}

/**
 * The stored form of a MAC address: separators `:`, `-` and `.` removed, 12 hex characters, lowercase.
 *
 * @throws {ValidationError} status 0 when the value is not a MAC address
 *
 * @example
 * ```typescript
 * import { normalizeMac } from 'ubudu-rtls-sdk';
 *
 * normalizeMac('AA:BB:CC:DD:EE:FF'); // 'aabbccddeeff'
 * normalizeMac('aabb.ccdd.eeff');    // 'aabbccddeeff'
 * ```
 */
export function normalizeMac(mac: string): string {
  const value = stripped(mac);
  if (value === undefined) {
    const shown = typeof mac === 'string' ? JSON.stringify(mac.slice(0, 40)) : typeof mac;
    throw new ValidationError(
      `Invalid MAC address ${shown}: expected 12 hex characters, optionally separated by ':', '-' or '.'`,
      undefined,
      { status: 0, details: ['mac'] }
    );
  }
  return value;
}

/**
 * A MAC address for display: pairs joined by `separator` (default `':'`), uppercase unless `uppercase: false`.
 *
 * @throws {ValidationError} status 0 when the value is not a MAC address
 *
 * @example
 * ```typescript
 * import { formatMac } from 'ubudu-rtls-sdk';
 *
 * formatMac('aabbccddeeff');                       // 'AA:BB:CC:DD:EE:FF'
 * formatMac('aabbccddeeff', { separator: '-' });   // 'AA-BB-CC-DD-EE-FF'
 * formatMac('AA:BB:CC:DD:EE:FF', { separator: '', uppercase: false }); // 'aabbccddeeff'
 * ```
 */
export function formatMac(
  mac: string,
  options?: { separator?: ':' | '-' | ''; uppercase?: boolean }
): string {
  const value = normalizeMac(mac);
  const pairs = [0, 2, 4, 6, 8, 10].map((at) => value.slice(at, at + 2));
  const joined = pairs.join(options?.separator ?? ':');
  return options?.uppercase === false ? joined : joined.toUpperCase();
}

/**
 * `true` when the value is a string that {@link normalizeMac} accepts. Never throws.
 *
 * @example
 * ```typescript
 * import { isValidMac } from 'ubudu-rtls-sdk';
 *
 * isValidMac('aa-bb-cc-dd-ee-ff'); // true
 * isValidMac('aabbccddeef');       // false (11 hex characters)
 * ```
 */
export function isValidMac(mac: unknown): boolean {
  return stripped(mac) !== undefined;
}
