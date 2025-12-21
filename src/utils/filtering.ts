import type { FilterOperator, FilterOptions } from '../types';

export function filter(
  field: string,
  operator: FilterOperator,
  value: string | number | boolean | string[] | number[]
): FilterOptions {
  const key = `${field}:${operator}` as `${string}:${FilterOperator}`;
  const stringValue = Array.isArray(value) ? value.join(',') : String(value);
  return { [key]: stringValue } as FilterOptions;
}

export function combineFilters(...filters: FilterOptions[]): FilterOptions {
  return Object.assign({}, ...filters);
}

export const filters = {
  equals: (field: string, value: string | number | boolean) => filter(field, 'eq', value),
  notEquals: (field: string, value: string | number | boolean) => filter(field, 'ne', value),
  greaterThan: (field: string, value: number) => filter(field, 'gt', value),
  greaterThanOrEqual: (field: string, value: number) => filter(field, 'gte', value),
  lessThan: (field: string, value: number) => filter(field, 'lt', value),
  lessThanOrEqual: (field: string, value: number) => filter(field, 'lte', value),
  contains: (field: string, value: string) => filter(field, 'contains', value),
  startsWith: (field: string, value: string) => filter(field, 'starts', value),
  endsWith: (field: string, value: string) => filter(field, 'ends', value),
  matches: (field: string, pattern: string) => filter(field, 'regex', pattern),
  in: (field: string, values: (string | number)[]) => filter(field, 'in', values as string[]),
  notIn: (field: string, values: (string | number)[]) => filter(field, 'nin', values as string[]),
  exists: (field: string, exists = true) => filter(field, 'exists', exists),
  between: (field: string, min: number, max: number) => filter(field, 'between', `${min},${max}`),
  size: (field: string, size: number) => filter(field, 'size', size),
  all: (field: string, values: string[]) => filter(field, 'all', values),
  elemMatch: (field: string, value: string) => filter(field, 'elem', value),
};
