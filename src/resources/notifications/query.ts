/**
 * Internal helpers of the notifications resources: the wire form of an inbox filter and the client
 * guards on ids, page bounds and bulk filters. Not exported from the package.
 *
 * @module resources/notifications/query
 * @internal
 */
import { ValidationError } from '../../errors';
import type {
  NotificationFilter,
  NotificationKind,
  NotificationSeverity,
  NotificationState,
} from '../../types/notifications';
import { toEpochMs } from '../../utils/time';

const STATES: readonly NotificationState[] = [
  'unread',
  'read',
  'needs_action',
  'archived',
  'muted',
  'snoozed',
  'pinned',
  'all',
];
const KINDS: readonly NotificationKind[] = ['alert', 'direct_message', 'mission'];
const SEVERITIES: readonly NotificationSeverity[] = ['info', 'warning', 'critical'];
const OBJECT_ID = /^[0-9a-f]{24}$/i;
/** Tokens of `q` as the server splits them: quoted phrases or runs of non-space characters. */
const Q_TOKENS = /"[^"]*"|\S+/g;
/** A scoped `q` term (`zone:`, `tag:`, `from:`, `severity:`); it does not narrow a bulk selection on its own. */
const SCOPED_TERM = /^(zone|tag|from|severity):.+$/i;
/** Wire keys that narrow a bulk selection on their own. */
const SELECTIVE_KEYS = ['thread_key', 'kind', 'severity', 'zone', 'asset'] as const;

/** A client guard: `ValidationError` status 0 (no HTTP exchange), `details` = the argument name. */
export function invalidArgument(message: string, name: string): ValidationError {
  return new ValidationError(message, undefined, { status: 0, details: [name] });
}

function shown(value: unknown): string {
  return typeof value === 'string' ? JSON.stringify(value.slice(0, 40)) : String(value);
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], name: string): T {
  if (typeof value !== 'string' || !(allowed as readonly string[]).includes(value)) {
    throw invalidArgument(
      `${name} must be one of ${allowed.join(', ')}, not ${shown(value)}`,
      name
    );
  }
  return value as T;
}

function stringValue(value: unknown, name: string): string {
  if (typeof value !== 'string') {
    throw invalidArgument(`${name} must be a string, not ${shown(value)}`, name);
  }
  return value;
}

/**
 * `asset` / `thread_key`: trimmed; a blank value is refused rather than sent (USI-P6-4).
 */
function selectorValue(value: unknown, name: 'asset' | 'thread_key'): string {
  const text = stringValue(value, name).trim();
  if (text === '') {
    throw invalidArgument(`${name} must be a non-empty string, not ${shown(value)}`, name);
  }
  return text;
}

function timeValue(value: unknown, name: 'from' | 'to'): string {
  try {
    return String(toEpochMs(value as Date | number | string));
  } catch {
    throw invalidArgument(
      `${name} must be a valid Date, a finite number of epoch milliseconds or a date string, not ${shown(value)}`,
      name
    );
  }
}

/**
 * The wire form of an inbox filter (query string of list/facets/export and the bulk `filter` body): every present
 * value becomes a string; `undefined`/`null` keys, an empty `q` and `pinned: false` are omitted; `q`, `asset` and
 * `thread_key` are trimmed; `from`/`to` become epoch milliseconds. Keys that are not filter keys are ignored.
 *
 * @throws {ValidationError} status 0 when the filter is not an object, `state`/`kind`/`severity` is outside its
 *   enum, `zone` is not an integer, `from`/`to` is not a valid time, `q`/`asset`/`thread_key` is not a string,
 *   `asset`/`thread_key` is blank, or `pinned` is neither `true` nor `false`
 */
export function toWireFilter(filter: NotificationFilter | undefined): Record<string, string> {
  const wire: Record<string, string> = {};
  if (filter === undefined || filter === null) return wire;
  if (typeof filter !== 'object' || Array.isArray(filter)) {
    throw invalidArgument('The notification filter must be an object', 'filter');
  }
  const { q, state, kind, severity, zone, asset, thread_key, pinned, from, to } = filter as Record<
    keyof NotificationFilter,
    unknown
  >;
  const present = (value: unknown): boolean => value !== undefined && value !== null;
  if (present(q)) {
    const text = stringValue(q, 'q').trim();
    if (text !== '') wire.q = text;
  }
  if (present(state)) wire.state = oneOf(state, STATES, 'state');
  if (present(kind)) wire.kind = oneOf(kind, KINDS, 'kind');
  if (present(severity)) wire.severity = oneOf(severity, SEVERITIES, 'severity');
  if (present(zone)) {
    if (typeof zone !== 'number' || !Number.isInteger(zone)) {
      throw invalidArgument(`zone must be an integer zone id, not ${shown(zone)}`, 'zone');
    }
    wire.zone = String(zone);
  }
  if (present(asset)) wire.asset = selectorValue(asset, 'asset');
  if (present(thread_key)) wire.thread_key = selectorValue(thread_key, 'thread_key');
  if (present(pinned)) {
    if (pinned !== true && pinned !== false) {
      throw invalidArgument(`pinned must be true, not ${shown(pinned)}`, 'pinned');
    }
    if (pinned) wire.pinned = 'true';
  }
  if (present(from)) wire.from = timeValue(from, 'from');
  if (present(to)) wire.to = timeValue(to, 'to');
  return wire;
}

/** `true` when `q` holds at least one free-text token (every token that is not a scoped term). */
function hasFreeText(q: string): boolean {
  return Array.from(q.matchAll(Q_TOKENS), ([token]) => token).some(
    (token) => !SCOPED_TERM.test(token)
  );
}

/**
 * Bulk only: the wire filter must hold at least one selective key (USI-P6-4). Selective: `thread_key`, `kind`,
 * `severity`, `zone`, `asset`, `pinned`, `state` other than `'all'`, or a `q` with free text. Not selective alone:
 * `{}`, `{ state: 'all' }`, `from`/`to`, scoped-only `q`.
 *
 * @throws {ValidationError} status 0 when the filter is not selective
 */
export function assertSelectiveFilter(wire: Record<string, string>): void {
  const selective =
    SELECTIVE_KEYS.some((key) => wire[key] !== undefined) ||
    wire.pinned === 'true' ||
    (wire.state !== undefined && wire.state !== 'all') ||
    (wire.q !== undefined && hasFreeText(wire.q));
  if (!selective) {
    throw invalidArgument(
      'A bulk filter must narrow the selection: set thread_key, kind, severity, zone, asset, pinned, a state ' +
        "other than 'all', or free text in q (an empty or time-only filter would select the whole inbox)",
      'filter'
    );
  }
}

/**
 * The id must be a 24-hex ObjectId (also keeps `get('stream')` off the SSE route).
 * @throws {ValidationError} status 0 otherwise
 */
export function assertObjectId(id: unknown, name = 'id'): asserts id is string {
  if (typeof id !== 'string' || !OBJECT_ID.test(id)) {
    throw invalidArgument(`${name} must be a 24-hex ObjectId, not ${shown(id)}`, name);
  }
}

/**
 * Page bounds: `limit` an integer 1..200 (the server clamps silently), `offset` an integer >= 0.
 * @throws {ValidationError} status 0 otherwise
 */
export function assertLimit(query: { limit?: unknown; offset?: unknown }): void {
  const { limit, offset } = query;
  if (
    limit !== undefined &&
    (typeof limit !== 'number' || !Number.isInteger(limit) || limit < 1 || limit > 200)
  ) {
    throw invalidArgument(`limit must be an integer from 1 to 200, not ${shown(limit)}`, 'limit');
  }
  if (
    offset !== undefined &&
    (typeof offset !== 'number' || !Number.isInteger(offset) || offset < 0)
  ) {
    throw invalidArgument(`offset must be an integer >= 0, not ${shown(offset)}`, 'offset');
  }
}

/**
 * A string that is not empty after trimming (undo token, recipient-mapping id, thread key).
 * @throws {ValidationError} status 0 otherwise
 */
export function assertNonEmptyString(value: unknown, name: string): asserts value is string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw invalidArgument(`${name} must be a non-empty string, not ${shown(value)}`, name);
  }
}
