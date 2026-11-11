/**
 * Local evaluator of the universal filter grammar.
 *
 * A port of the server's universal filter function and of its helpers (filter-key parsing, nested values, loose
 * equality, the operator switch, sort parsing and sorting, field selection, pagination). It runs on the query as the
 * server receives it, every value a string, so `applyFilters` sees what the server sees; the parity vectors of
 * `test/unit/core/fixtures/universal-filter-parity.json` were computed with the server's own function.
 *
 * Differences from the server code, none of which changes an output for an array of JSON values:
 * - relational operators are written `Number(field) > n`, which is how JavaScript compares any value with a number;
 * - the projection writes only into the objects it creates (the server, in sloppy mode, may also write into the
 *   item's own objects, always the value they already hold, or into a primitive, which is ignored);
 * - the server's pass-through of a non-array, its error handling and its unreachable `default` operator case are not
 *   ported: the input is always an array of string values, and an error reaches the caller.
 *
 * @internal
 * @module utils/filter-eval
 */
import type { FilterOperator, Page } from '../types';

/** The query as the server reads it: every value is a string. */
export type UniversalQuery = Readonly<Record<string, string>>;

interface ParsedFilter {
  field: string;
  operator: FilterOperator;
  value: string;
}

interface ParsedSort {
  field: string;
  order: 'asc' | 'desc';
}

type Projection = Record<string, unknown>;

const FILTER_KEY =
  /^(.+?):(eq|ne|gt|gte|lt|lte|contains|starts|ends|regex|in|nin|exists|between|size|all|elem)(?::(.+))?$/;
const INDEXED_KEY = /^(.+?)\[(\d+)\]$/;

/** `value[key]`, as JavaScript reads a property of any value (a primitive included). */
function property(value: unknown, key: string): unknown {
  return (value as Projection)[key];
}

/** Filter keys `field:op` or `field:op:value`; the value in the key wins when it is not empty. */
function parseFilterParams(query: UniversalQuery): ParsedFilter[] {
  const filters: ParsedFilter[] = [];
  for (const [key, value] of Object.entries(query)) {
    const match = FILTER_KEY.exec(key);
    if (match) {
      filters.push({
        field: match[1] as string,
        operator: match[2] as FilterOperator,
        value: match[3] || value,
      });
    }
  }
  return filters;
}

/** A dot path, with `name[0]` index steps. */
function getNestedValue(obj: unknown, path: string): unknown {
  if (!obj || !path) return undefined;
  let current: unknown = obj;
  for (const key of path.split('.')) {
    if (current === null || current === undefined) return undefined;
    const arrayMatch = INDEXED_KEY.exec(key);
    if (arrayMatch) {
      current = property(current, arrayMatch[1] as string);
      if (!Array.isArray(current)) return undefined;
      current = current[parseInt(arrayMatch[2] as string)];
    } else {
      current = property(current, key);
    }
  }
  return current;
}

/** A boolean field matches its text, case-insensitively and trimmed; everything else is JavaScript `==`. */
function looseEquals(fieldValue: unknown, value: string): boolean {
  if (typeof fieldValue === 'boolean') return String(fieldValue) === value.trim().toLowerCase();
  return fieldValue == value;
}

function list(value: string): string[] {
  return value.split(',').map((v) => v.trim());
}

function matchesFilter(item: unknown, filter: ParsedFilter): boolean {
  const { field, operator, value } = filter;
  const fieldValue = getNestedValue(item, field);
  switch (operator) {
    case 'eq':
      return looseEquals(fieldValue, value);
    case 'ne':
      return !looseEquals(fieldValue, value);
    case 'gt':
      return Number(fieldValue) > parseFloat(value);
    case 'gte':
      return Number(fieldValue) >= parseFloat(value);
    case 'lt':
      return Number(fieldValue) < parseFloat(value);
    case 'lte':
      return Number(fieldValue) <= parseFloat(value);
    case 'contains':
      return !!fieldValue && String(fieldValue).toLowerCase().includes(value.toLowerCase());
    case 'starts':
      return !!fieldValue && String(fieldValue).toLowerCase().startsWith(value.toLowerCase());
    case 'ends':
      return !!fieldValue && String(fieldValue).toLowerCase().endsWith(value.toLowerCase());
    case 'regex':
      try {
        const regex = new RegExp(value, 'i');
        return !!fieldValue && regex.test(String(fieldValue));
      } catch {
        return false;
      }
    case 'in':
      return list(value).includes(String(fieldValue));
    case 'nin':
      return !list(value).includes(String(fieldValue));
    case 'exists':
      return value === 'true' ? fieldValue !== undefined : fieldValue === undefined;
    case 'between': {
      const [min, max] = value.split(',').map((v) => parseFloat(v.trim()));
      return Number(fieldValue) >= Number(min) && Number(fieldValue) <= Number(max);
    }
    case 'size':
      if (Array.isArray(fieldValue) || typeof fieldValue === 'string') {
        return fieldValue.length === parseInt(value);
      }
      return false;
    case 'all':
      if (!Array.isArray(fieldValue)) return false;
      return list(value).every((v) => fieldValue.includes(v));
    case 'elem':
      if (!Array.isArray(fieldValue)) return false;
      return list(value).some((v) => fieldValue.includes(v));
  }
}

/** `sort=f1:asc,f2:desc`; a missing or unknown direction is `asc`, an empty field is skipped. */
function parseSortParams(sortParam: string): ParsedSort[] {
  const sorts: ParsedSort[] = [];
  for (const part of sortParam.split(',')) {
    const [field, order = 'asc'] = part.split(':');
    if (field)
      sorts.push({ field: field.trim(), order: order.toLowerCase() === 'desc' ? 'desc' : 'asc' });
  }
  return sorts;
}

/** Nulls and missing values last on `asc`, first on `desc`; two strings `localeCompare`, other values `<`. */
function applySorting(items: unknown[], sorts: ParsedSort[]): unknown[] {
  if (sorts.length === 0) return items;
  return [...items].sort((a, b) => {
    for (const sort of sorts) {
      const aValue = getNestedValue(a, sort.field);
      const bValue = getNestedValue(b, sort.field);
      if (aValue === bValue) continue;
      if (aValue === null || aValue === undefined) return sort.order === 'asc' ? 1 : -1;
      if (bValue === null || bValue === undefined) return sort.order === 'asc' ? -1 : 1;
      const comparison =
        typeof aValue === 'string' && typeof bValue === 'string'
          ? aValue.localeCompare(bValue)
          : aValue < bValue
            ? -1
            : 1;
      return sort.order === 'asc' ? comparison : -comparison;
    }
    return 0;
  });
}

/**
 * Writes `value` at `keys` inside the projection, creating the parent objects. A parent that holds a value taken
 * from the item already holds `value` at that path (it is the item's own object), so nothing is written into it.
 */
function setPath(
  selected: Projection,
  keys: string[],
  value: unknown,
  created: Set<unknown>
): void {
  const last = keys.pop() as string;
  let current = selected;
  for (const key of keys) {
    const next = current[key];
    if (next && !created.has(next)) return;
    if (!next) {
      const object: Projection = {};
      created.add(object);
      current[key] = object;
    }
    current = current[key] as Projection;
  }
  current[last] = value;
}

/** `fields=a,b.c`: projects onto nested objects; `undefined` values are omitted. */
function applyFieldSelection(items: unknown[], fields: string): Projection[] {
  const fieldList = fields.split(',').map((f) => f.trim());
  return items.map((item) => {
    const selected: Projection = {};
    const created = new Set<unknown>([selected]);
    for (const field of fieldList) {
      const value = getNestedValue(item, field);
      if (value !== undefined) setPath(selected, field.split('.'), value, created);
    }
    return selected;
  });
}

/** The page envelope; `parseInt(page) || 1`, `parseInt(limit) || 50`. */
function applyPagination(
  items: unknown[],
  page: string | undefined,
  limit: string | undefined
): Page<unknown> {
  const pageNum = parseInt(String(page)) || 1;
  const limitNum = parseInt(String(limit)) || 50;
  const startIndex = (pageNum - 1) * limitNum;
  const endIndex = startIndex + limitNum;
  return {
    data: items.slice(startIndex, endIndex),
    pagination: {
      page: pageNum,
      limit: limitNum,
      total: items.length,
      totalPages: Math.ceil(items.length / limitNum),
      hasNext: endIndex < items.length,
      hasPrev: pageNum > 1,
    },
  };
}

/**
 * The universal grammar over `items`: filters (ANDed; unknown keys ignored) → `sort` → `fields` → pagination. The
 * result is the items (a new array) or, when `page` or `limit` is set, the `{ data, pagination }` envelope. The input
 * array and its items are not modified.
 *
 * @internal
 */
export function applyUniversalQuery(
  items: readonly unknown[],
  query: UniversalQuery
): unknown[] | Page<unknown> {
  let result = [...items];
  const filters = parseFilterParams(query);
  if (filters.length > 0) {
    result = result.filter((item) => filters.every((filter) => matchesFilter(item, filter)));
  }
  if (query.sort) result = applySorting(result, parseSortParams(query.sort));
  if (query.fields) result = applyFieldSelection(result, query.fields);
  if (query.page || query.limit) return applyPagination(result, query.page, query.limit);
  return result;
}
