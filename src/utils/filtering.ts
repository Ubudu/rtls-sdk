/**
 * Filter builders, the two server filter grammars and the local evaluator.
 *
 * - The **universal** grammar (`field:op=value` query keys) is the one of the routes behind the server's universal
 *   filter middleware; `applyFilters` evaluates it locally with the same semantics.
 * - The **venue** grammar (`filters=<JSON array of {field, operator, value}>`) is the one of the venue, map, zone, POI
 *   and path routes; the SDK sends the filters of these routes in this grammar only (USI-P1-1).
 *
 * The builders keep typed values; `serializeFilters` validates them (one set of rules for both grammars) and writes
 * the wire form. A rejected filter throws `ValidationError` with status 0 before any request is sent.
 *
 * @module utils/filtering
 */
import { ValidationError } from '../errors';
import type {
  DeepPartial,
  FilterOperator,
  FilterOptions,
  FilterValue,
  LocalQuery,
  Page,
} from '../types';
import { applyUniversalQuery } from './filter-eval';

export type { DeepPartial, FilterOperator, FilterOptions, FilterValue, LocalQuery } from '../types';

/** `'universal'`: `field:op` query keys; `'venue'`: one `filters` key holding a JSON array. */
export type FilterGrammar = 'universal' | 'venue';

type FilterKey = `${string}:${FilterOperator}`;
type Scalar = string | number | boolean;
type ListElement = string | number;

const OPERATORS: readonly FilterOperator[] = [
  'eq',
  'ne',
  'gt',
  'gte',
  'lt',
  'lte',
  'contains',
  'starts',
  'ends',
  'regex',
  'in',
  'nin',
  'exists',
  'between',
  'size',
  'all',
  'elem',
];
const LIST_OPERATORS: readonly FilterOperator[] = ['in', 'nin', 'all', 'elem'];
/** Operators the venue grammar has no counterpart for. */
const NOT_IN_VENUE_GRAMMAR: readonly FilterOperator[] = ['size', 'all', 'elem'];

/** One validated filter: the scalar operators hold a scalar, the list operators a list, `between` two numbers. */
type CheckedFilter =
  | { key: string; field: string; operator: 'exists'; value: boolean }
  | { key: string; field: string; operator: 'between'; value: [number, number] }
  | { key: string; field: string; operator: 'in' | 'nin' | 'all' | 'elem'; value: ListElement[] }
  | {
      key: string;
      field: string;
      operator: Exclude<FilterOperator, 'exists' | 'between' | 'in' | 'nin' | 'all' | 'elem'>;
      value: Scalar;
    };

function invalid(message: string, detail: string): ValidationError {
  return new ValidationError(message, undefined, { status: 0, details: [detail] });
}

function kindOf(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'an array';
  if (value instanceof Date) return 'a Date';
  return typeof value;
}

/**
 * Builds one filter, keyed `'<field>:<operator>'`, keeping the typed value. A `RegExp` becomes its `source` (its flags
 * are dropped: the universal grammar always matches case-insensitively, the venue grammar case-sensitively).
 *
 * @example
 * ```typescript
 * import { filter } from 'ubudu-rtls-sdk';
 *
 * filter('battery', 'gte', 20);          // { 'battery:gte': 20 }
 * filter('user_name', 'regex', /^fork/); // { 'user_name:regex': '^fork' }
 * ```
 */
export function filter(
  field: string,
  operator: FilterOperator,
  value: FilterValue | RegExp
): FilterOptions {
  const key: FilterKey = `${field}:${operator}`;
  const result: FilterOptions = {};
  result[key] = value instanceof RegExp ? value.source : value;
  return result;
}

/** Merges filters into one object; a later filter on the same key wins. */
export function combineFilters(...filters: FilterOptions[]): FilterOptions {
  return Object.assign({}, ...filters);
}

/** `Date` → epoch ms, other values as they are. */
function dateToMs(value: number | Date): number {
  return value instanceof Date ? value.getTime() : value;
}

/**
 * The filter builders (names kept from 0.2.0). Each returns `FilterOptions` with the typed value;
 * combine them with `combineFilters` or object spread.
 *
 * @example
 * ```typescript
 * import { applyFilters, combineFilters, filters } from 'ubudu-rtls-sdk';
 *
 * const forklifts = combineFilters(
 *   filters.equals('user_type', 'forklift'),
 *   filters.between('battery', 20, 80)
 * );
 * const page = applyFilters(assets, { filters: forklifts, sort: 'user_name:asc', page: 1, limit: 20 });
 * ```
 */
export const filters = {
  /** Universal: JavaScript `==` against the text (`5` equals `'5'`); a boolean field matches `'true'`/`'false'`. */
  equals: (field: string, value: string | number | boolean): FilterOptions =>
    filter(field, 'eq', value),
  /** The negation of `equals`; missing and `null` fields match. */
  notEquals: (field: string, value: string | number | boolean): FilterOptions =>
    filter(field, 'ne', value),
  greaterThan: (field: string, value: number | Date): FilterOptions => filter(field, 'gt', value),
  greaterThanOrEqual: (field: string, value: number | Date): FilterOptions =>
    filter(field, 'gte', value),
  lessThan: (field: string, value: number | Date): FilterOptions => filter(field, 'lt', value),
  lessThanOrEqual: (field: string, value: number | Date): FilterOptions =>
    filter(field, 'lte', value),
  /** Universal: case-insensitive; `0`, `false` and `''` never match. Venue: case-sensitive. */
  contains: (field: string, value: string): FilterOptions => filter(field, 'contains', value),
  startsWith: (field: string, value: string): FilterOptions => filter(field, 'starts', value),
  endsWith: (field: string, value: string): FilterOptions => filter(field, 'ends', value),
  /**
   * A regular expression; flags are dropped: case-insensitive on universal routes and in `applyFilters`,
   * case-sensitive on venue routes. An invalid pattern never matches.
   */
  matches: (field: string, pattern: string | RegExp): FilterOptions =>
    filter(field, 'regex', pattern),
  /** The field's text is one of the values (elements must not contain `,`). */
  in: (field: string, values: readonly (string | number)[]): FilterOptions =>
    filter(field, 'in', values),
  notIn: (field: string, values: readonly (string | number)[]): FilterOptions =>
    filter(field, 'nin', values),
  /** `true`: the field is present (`null` counts as present); `false`: it is missing. */
  exists: (field: string, exists = true): FilterOptions => filter(field, 'exists', exists),
  /** Inclusive; a `Date` bound becomes epoch milliseconds. */
  between: (field: string, min: number | Date, max: number | Date): FilterOptions =>
    filter(field, 'between', [dateToMs(min), dateToMs(max)]),
  /** Array or string length (universal grammar only). */
  size: (field: string, size: number): FilterOptions => filter(field, 'size', size),
  /** The array field includes every value (universal grammar only). */
  all: (field: string, values: readonly string[]): FilterOptions => filter(field, 'all', values),
  /** "Any of": the array field includes at least one value (not Mongo `$elemMatch`; universal grammar only). */
  elemMatch: (field: string, values: string | readonly string[]): FilterOptions =>
    filter(field, 'elem', values),
};

function parseKey(key: string): { field: string; operator: FilterOperator } {
  const index = key.lastIndexOf(':');
  const operator = key.slice(index + 1);
  if (index < 0 || !OPERATORS.includes(operator as FilterOperator)) {
    throw invalid(`Filter key "${key}" must be "<field>:<operator>" with a known operator`, key);
  }
  const field = key.slice(0, index);
  if (field === '' || /[:[\]]/.test(field)) {
    throw invalid(
      `Filter field "${field}" must be a non-empty dot path without ":", "[" or "]"`,
      key
    );
  }
  return { field, operator: operator as FilterOperator };
}

function finiteNumber(key: string, value: unknown): number {
  const ms = value instanceof Date ? value.getTime() : value;
  if (typeof ms !== 'number' || !Number.isFinite(ms)) {
    throw invalid(
      `Filter "${key}" needs a finite number or a valid Date, not ${kindOf(value)}`,
      key
    );
  }
  return ms;
}

function scalarValue(key: string, value: unknown): Scalar {
  if (typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number' || value instanceof Date) return finiteNumber(key, value);
  throw invalid(`Filter "${key}" needs a single value, not ${kindOf(value)}`, key);
}

function listValue(key: string, value: unknown): ListElement[] {
  const values: unknown[] = Array.isArray(value) ? value : [value];
  if (values.length === 0) throw invalid(`Filter "${key}" needs at least one value`, key);
  return values.map((element) => {
    if (typeof element === 'number') return finiteNumber(key, element);
    if (typeof element !== 'string') {
      throw invalid(`Filter "${key}" takes strings and numbers, not ${kindOf(element)}`, key);
    }
    if (element.includes(',')) {
      throw invalid(`Filter "${key}": the value "${element}" must not contain ","`, key);
    }
    return element;
  });
}

function checkFilter(key: string, value: unknown): CheckedFilter {
  const { field, operator } = parseKey(key);
  if (operator === 'exists') {
    if (typeof value !== 'boolean') {
      throw invalid(`Filter "${key}" needs true or false, not ${kindOf(value)}`, key);
    }
    return { key, field, operator, value };
  }
  if (operator === 'between') {
    if (!Array.isArray(value) || value.length !== 2) {
      throw invalid(`Filter "${key}" needs exactly two bounds [min, max]`, key);
    }
    return {
      key,
      field,
      operator,
      value: [finiteNumber(key, value[0]), finiteNumber(key, value[1])],
    };
  }
  if (operator === 'in' || operator === 'nin' || operator === 'all' || operator === 'elem') {
    return { key, field, operator, value: listValue(key, value) };
  }
  return { key, field, operator, value: scalarValue(key, value) };
}

/** The filters as given, validated, in insertion order; `undefined` and `null` values are skipped. */
function checkFilters(filters: FilterOptions | undefined): CheckedFilter[] {
  if (filters === undefined || filters === null) return [];
  if (typeof filters !== 'object' || Array.isArray(filters)) {
    throw invalid(
      `filters must be an object of "<field>:<operator>" keys, not ${kindOf(filters)}`,
      'filters'
    );
  }
  const checked: CheckedFilter[] = [];
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== null) checked.push(checkFilter(key, value));
  }
  return checked;
}

function universalValue(entry: CheckedFilter): string {
  if (entry.operator === 'between' || LIST_OPERATORS.includes(entry.operator)) {
    return (entry.value as readonly ListElement[]).join(',');
  }
  return String(entry.value);
}

function venueEntry(entry: CheckedFilter): Record<string, unknown> {
  const { key, field, operator } = entry;
  if (NOT_IN_VENUE_GRAMMAR.includes(operator)) {
    throw invalid(
      `Operator "${operator}" is not supported by the venue filter grammar (${key})`,
      key
    );
  }
  if (entry.operator === 'exists')
    return { field, operator: entry.value ? 'exists' : 'not_exists' };
  if (entry.operator === 'nin') return { field, operator: 'not_in', value: entry.value };
  return { field, operator, value: entry.value };
}

/**
 * The wire form of `filters` for one grammar. Both grammars share the guards: the field must be a non-empty
 * dot path without `:`, `[` or `]`; list values must not contain `,`; `between` takes exactly two finite numbers or
 * Dates; a list operator takes an array (or one value); `exists` takes a boolean; numbers must be finite; a `Date`
 * becomes epoch milliseconds.
 *
 * - `'universal'` → one query key per filter, `{ 'field:op': '<string>' }` (lists joined with `,`).
 * - `'venue'` → `{ filters: '<JSON array of { field, operator, value }>' }`, or `{}` when there is no filter; values
 *   keep their type, `exists: false` becomes `not_exists`, `nin` becomes `not_in`; `size`, `all` and `elem` have no
 *   venue counterpart and throw.
 *
 * @throws {ValidationError} status 0 for any rejected filter (nothing is sent)
 * @example
 * ```typescript
 * import { filters, serializeFilters } from 'ubudu-rtls-sdk';
 *
 * serializeFilters(filters.in('user_type', ['forklift', 'person']), 'universal');
 * // { 'user_type:in': 'forklift,person' }
 * serializeFilters(filters.equals('name', 'Hall A'), 'venue');
 * // { filters: '[{"field":"name","operator":"eq","value":"Hall A"}]' }
 * ```
 */
export function serializeFilters(
  filters: FilterOptions | undefined,
  grammar: FilterGrammar
): Record<string, string> {
  if (grammar !== 'universal' && grammar !== 'venue') {
    throw invalid(
      `Unknown filter grammar "${String(grammar)}" (use 'universal' or 'venue')`,
      'grammar'
    );
  }
  const checked = checkFilters(filters);
  if (grammar === 'venue') {
    return checked.length > 0 ? { filters: JSON.stringify(checked.map(venueEntry)) } : {};
  }
  const query: Record<string, string> = {};
  for (const entry of checked) query[entry.key] = universalValue(entry);
  return query;
}

function pageNumber(name: 'page' | 'limit', value: unknown): string {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    throw invalid(`applyFilters: ${name} must be an integer >= 1, received ${String(value)}`, name);
  }
  return String(value);
}

function textList(name: 'sort' | 'fields', value: unknown, allowString: boolean): string {
  if (allowString && typeof value === 'string') return value;
  if (!Array.isArray(value) || !value.every((v) => typeof v === 'string')) {
    const expected = allowString ? 'a string or an array of strings' : 'an array of strings';
    throw invalid(`applyFilters: ${name} must be ${expected}`, name);
  }
  return value.join(',');
}

/**
 * Applies the universal filter grammar locally: filters, then `sort`, then the `fields` projection, then the
 * page, with exactly the semantics the server applies on its universal routes. It runs on
 * the serialized strings (`serializeFilters(query.filters, 'universal')`), so it sees what the server would see. Use
 * it where the server returns everything, for example the asset list, which honours only `key`/`value`.
 *
 * Always returns a `Page`. Without `page` and `limit` the page is the whole result:
 * `{ page: 1, limit: total, total, totalPages: total ? 1 : 0, hasNext: false, hasPrev: false }`. `page` and `limit`
 * must be integers >= 1 (the server turns `0` into its default and slices meaninglessly on negative values; this
 * function refuses both). With `fields`, the items are projections: the item type is `DeepPartial<T>` whenever the
 * query's type has a `fields` key (also an optional one, as in `LocalQuery`), else `T`. The input is not modified.
 *
 * @throws {ValidationError} status 0 for a rejected filter, `page`, `limit`, `sort` or `fields`
 * @example
 * ```typescript
 * import { applyFilters, filters } from 'ubudu-rtls-sdk';
 *
 * const assets = await client.assets.list();
 * const page = applyFilters(assets, {
 *   filters: filters.startsWith('user_name', 'fork'),
 *   sort: ['user_type:asc', 'user_name:desc'],
 *   page: 2,
 *   limit: 25,
 * });
 * page.pagination.total; // matches before paging
 * ```
 */
export function applyFilters<T, Q extends LocalQuery = Record<never, never>>(
  items: readonly T[],
  query?: Q
): Page<Q extends unknown ? ('fields' extends keyof Q ? DeepPartial<T> : T) : never> {
  if (!Array.isArray(items)) throw invalid('applyFilters needs an array of items', 'items');
  if (
    query !== undefined &&
    (query === null || typeof query !== 'object' || Array.isArray(query))
  ) {
    throw invalid('applyFilters: the query must be an object', 'query');
  }
  const raw: Record<string, string> = serializeFilters(query?.filters, 'universal');
  if (query?.sort !== undefined) raw.sort = textList('sort', query.sort, true);
  if (query?.fields !== undefined) raw.fields = textList('fields', query.fields, false);
  if (query?.page !== undefined) raw.page = pageNumber('page', query.page);
  if (query?.limit !== undefined) raw.limit = pageNumber('limit', query.limit);
  const result = applyUniversalQuery(items, raw);
  if (!Array.isArray(result)) {
    return result as Page<
      Q extends unknown ? ('fields' extends keyof Q ? DeepPartial<T> : T) : never
    >;
  }
  const total = result.length;
  return {
    data: result,
    pagination: {
      page: 1,
      limit: total,
      total,
      totalPages: total ? 1 : 0,
      hasNext: false,
      hasPrev: false,
    },
  } as Page<Q extends unknown ? ('fields' extends keyof Q ? DeepPartial<T> : T) : never>;
}
