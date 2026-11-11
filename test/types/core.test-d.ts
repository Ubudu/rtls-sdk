// Type-level tests of the core (P1 §8 `test/types/core.test-d.ts`). Not collected by vitest (the unit config
// excludes test/types/**); `npm run typecheck` compiles this file, so every `expectTypeOf` and every
// `@ts-expect-error` below is checked by the compiler.
import { expectTypeOf } from 'vitest';
import type {
  ApiPaths,
  HasPathParams,
  JsonBody,
  PathParams,
  PathsWithMethod,
  QueryParams,
  SuccessBody,
} from '../../src/client/paths';
import type {
  DownloadResult,
  SseEvent,
  Transport,
  TransportResponse,
} from '../../src/client/transport';
import type { components, paths } from '../../src/generated/schema';
import type {
  DeepPartial,
  FilterOptions,
  HealthStatus,
  LocalQuery,
  Page,
  Schema,
} from '../../src/types';
import { applyFilters, filters } from '../../src/utils/filtering';

declare const transport: Transport;
interface Foo {
  hits: { hits: unknown[] };
}
const esParams = { appNamespace: 'ns', dataType: 'alerts' } as const;

// ─── Transport.request / requestWithResponse ──────────────────────────────────

expectTypeOf(transport.request('GET', '/health')).toEqualTypeOf<Promise<HealthStatus>>();
expectTypeOf(transport.requestWithResponse('GET', '/health')).toEqualTypeOf<
  Promise<TransportResponse<HealthStatus>>
>();
// @ts-expect-error an unknown path
void transport.request('GET', '/nope');
// @ts-expect-error a method the path does not declare
void transport.request('POST', '/health');
// @ts-expect-error missing params on a path with path parameters (no options)
void transport.request('GET', '/settings/{app_namespace}');
// @ts-expect-error missing params on a path with path parameters (options without params)
void transport.request('GET', '/settings/{app_namespace}', {});
// @ts-expect-error a wrong param name
void transport.request('GET', '/settings/{app_namespace}', { params: { namespace: 'x' } });
// @ts-expect-error a wrong param type, and no type argument: it must not fall back to the explicit form
void transport.request('GET', '/settings/{app_namespace}', { params: { app_namespace: 1 } });
expectTypeOf(
  transport.request('GET', '/settings/{app_namespace}', { params: { app_namespace: 'x' } })
).toEqualTypeOf<Promise<SuccessBody<'/settings/{app_namespace}', 'GET'>>>();
// The explicit form needs a type argument and then accepts any TransportOptions.
expectTypeOf(
  transport.request<unknown>('GET', '/settings/{app_namespace}', {
    params: { app_namespace: 'x' },
  })
).toEqualTypeOf<Promise<unknown>>();
expectTypeOf(
  transport.request<Foo>('POST', '/es/query/{appNamespace}/{dataType}', {
    params: esParams,
    body: { size: 1 },
  })
).toEqualTypeOf<Promise<Foo>>();
expectTypeOf(
  transport.requestWithResponse<Foo[]>('GET', '/health', { parseAs: 'json' })
).toEqualTypeOf<Promise<TransportResponse<Foo[]>>>();
// @ts-expect-error a typed call with a body of the wrong type (the explicit form needs a type argument)
void transport.request('POST', '/es/query/{appNamespace}/{dataType}', {
  params: esParams,
  body: 1,
});
// @ts-expect-error a body on an operation without a JSON request body
void transport.request('GET', '/health', { body: { a: 1 } });
// @ts-expect-error typed calls return the spec type, so parseAs other than auto/json needs the explicit form
void transport.request('GET', '/health', { parseAs: 'text' });
expectTypeOf(transport.request<string>('GET', '/health', { parseAs: 'text' })).toEqualTypeOf<
  Promise<string>
>();
// Typed query: declared keys keep their type, other keys (filters) stay allowed.
void transport.request('GET', '/spatial/assets/{namespace}/nearest-to-point', {
  params: { namespace: 'ns' },
  query: { lat: 1, lon: 2, 'user_name:contains': 'a' },
});
// @ts-expect-error lat is a number in the spec
void transport.request('GET', '/spatial/assets/{namespace}/nearest-to-point', {
  params: { namespace: 'ns' },
  query: { lat: 'north', lon: 2 },
});
// The real spatial asset route is accepted, the spec's Express-form path is not.
expectTypeOf(
  transport.request('GET', '/spatial/assets/{namespace}/nearest-to-point', {
    params: { namespace: 'ns' },
    query: { lat: 1, lon: 2 },
  })
).toEqualTypeOf<Promise<components['schemas']['SpatialAssetsResponse']>>();
// @ts-expect-error the spec path in Express form is removed from ApiPaths (USI-P1-6)
void transport.request('GET', '/api/spatial/assets/:namespace/nearest-to-point', {});

// ─── upload / download / stream ───────────────────────────────────────────────

expectTypeOf(
  transport.upload<{ _id: string }>('/assets/{namespace}/{mac_address}/documents', new FormData(), {
    params: { namespace: 'ns', mac_address: 'aabbccddeeff' },
  })
).toEqualTypeOf<Promise<{ _id: string }>>();
// @ts-expect-error upload takes POST paths only
void transport.upload('/health', new FormData());
// @ts-expect-error upload options take no body and no retry
void transport.upload('/etl/upload', new FormData(), { retry: { idempotent: true } });
expectTypeOf(
  transport.download('/assets/{namespace}/{mac_address}/documents/{documentId}/download', {
    params: { namespace: 'ns', mac_address: 'aabbccddeeff', documentId: 'd' },
  })
).toEqualTypeOf<Promise<DownloadResult>>();
// @ts-expect-error download takes GET paths only
void transport.download('/etl/upload');
expectTypeOf(
  transport.stream('/notifications/{namespace}/stream', {
    params: { namespace: 'ns' },
    idleTimeoutMs: 1000,
  })
).toEqualTypeOf<AsyncIterableIterator<SseEvent>>();
// @ts-expect-error stream takes GET paths only
void transport.stream('/es/query/{appNamespace}/{dataType}');
// @ts-expect-error a stream has no total timeout
void transport.stream('/notifications/{namespace}/stream', { timeoutMs: 1 });

// ─── Schema<K> ────────────────────────────────────────────────────────────────

expectTypeOf<Schema<'HealthStatus'>>().toEqualTypeOf<components['schemas']['HealthStatus']>();
expectTypeOf<HealthStatus>().toEqualTypeOf<{ status: string }>();
// @ts-expect-error an unknown schema name is a compile error
export type NoSuchSchema = Schema<'Nope'>;

// ─── ApiPaths, ExtraPaths, ReplacedSpecPaths ──────────────────────────────────

expectTypeOf<'/health'>().toMatchTypeOf<keyof ApiPaths>();
expectTypeOf<'/spatial/assets/{namespace}/nearest-to-point'>().toMatchTypeOf<keyof ApiPaths>();
expectTypeOf<'/spatial/assets/{namespace}/nearest-realtime'>().toMatchTypeOf<keyof ApiPaths>();
expectTypeOf<'/api/spatial/assets/:namespace/nearest-to-point'>().not.toMatchTypeOf<
  keyof ApiPaths
>();
expectTypeOf<'/api/spatial/assets/:namespace/nearest-realtime'>().not.toMatchTypeOf<
  keyof ApiPaths
>();

// ─── PathsWithMethod ──────────────────────────────────────────────────────────

expectTypeOf<'/health'>().toMatchTypeOf<PathsWithMethod<'GET'>>();
expectTypeOf<'/health'>().not.toMatchTypeOf<PathsWithMethod<'POST'>>();
expectTypeOf<'/es/query/{appNamespace}/{dataType}'>().toMatchTypeOf<PathsWithMethod<'POST'>>();
expectTypeOf<'/es/query/{appNamespace}/{dataType}'>().not.toMatchTypeOf<PathsWithMethod<'GET'>>();
expectTypeOf<'/spatial/assets/{namespace}/nearest-to-point'>().toMatchTypeOf<
  PathsWithMethod<'GET'>
>();
expectTypeOf<'/spatial/assets/{namespace}/nearest-to-point'>().not.toMatchTypeOf<
  PathsWithMethod<'POST'>
>();
expectTypeOf<'/api/spatial/assets/:namespace/nearest-to-point'>().not.toMatchTypeOf<
  PathsWithMethod<'GET'>
>();

// ─── PathParams, HasPathParams ────────────────────────────────────────────────

expectTypeOf<PathParams<'/settings/{app_namespace}', 'GET'>>().toEqualTypeOf<{
  app_namespace: string;
}>();
expectTypeOf<PathParams<'/health', 'GET'>>().toBeNever();
expectTypeOf<HasPathParams<'/health', 'GET'>>().toEqualTypeOf<false>();
expectTypeOf<HasPathParams<'/settings/{app_namespace}', 'GET'>>().toEqualTypeOf<true>();
expectTypeOf<PathParams<'/es/query/{appNamespace}/{dataType}', 'POST'>>().toEqualTypeOf<{
  appNamespace: string;
  dataType: 'alerts' | 'positions' | 'zone_visits';
}>();
expectTypeOf<PathParams<'/spatial/assets/{namespace}/nearest-to-point', 'GET'>>().toEqualTypeOf<{
  namespace: string;
}>();

// ─── QueryParams ──────────────────────────────────────────────────────────────

expectTypeOf<QueryParams<'/health', 'GET'>>().toBeNever();
// The real route takes the namespace in the path, not in the query.
expectTypeOf<
  QueryParams<'/spatial/assets/{namespace}/nearest-to-point', 'GET'>
>().not.toHaveProperty('namespace');
expectTypeOf<QueryParams<'/spatial/assets/{namespace}/nearest-to-point', 'GET'>>().toHaveProperty(
  'lat'
);
expectTypeOf<QueryParams<'/spatial/assets/{namespace}/nearest-to-point', 'GET'>>().toHaveProperty(
  'max_age'
);
expectTypeOf<
  QueryParams<'/spatial/assets/{namespace}/nearest-realtime', 'GET'>
>().not.toHaveProperty('max_age');

// ─── JsonBody ─────────────────────────────────────────────────────────────────

expectTypeOf<JsonBody<'/es/query/{appNamespace}/{dataType}', 'POST'>>().toEqualTypeOf<
  Record<string, unknown>
>();
expectTypeOf<JsonBody<'/health', 'GET'>>().toBeNever();

// ─── SuccessBody ──────────────────────────────────────────────────────────────

expectTypeOf<SuccessBody<'/health', 'GET'>>().toEqualTypeOf<HealthStatus>();
expectTypeOf<SuccessBody<'/spatial/assets/{namespace}/nearest-to-point', 'GET'>>().toEqualTypeOf<
  components['schemas']['SpatialAssetsResponse']
>();
expectTypeOf<SuccessBody<'/settings/{app_namespace}', 'GET'>>().toHaveProperty('map');
// A 201 is taken when there is no 200 with content.
expectTypeOf<SuccessBody<'/dashboards', 'POST'>>().toEqualTypeOf<
  paths['/dashboards']['post']['responses'][201]['content']['application/json']
>();
// text/plain → string; no 2xx content → unknown (USI-P1-5).
expectTypeOf<SuccessBody<'/status/{component}', 'GET'>>().toEqualTypeOf<string>();
expectTypeOf<SuccessBody<'/admin/{namespace}/services', 'GET'>>().toEqualTypeOf<unknown>();

// ─── applyFilters, DeepPartial, FilterOptions ─────────────────────────────────

interface Item {
  id: number;
  name: string;
  data: { x: number; tags: string[] };
}
declare const items: Item[];

// Without a projection the items keep their type; with `fields` they are DeepPartial.
expectTypeOf(applyFilters(items, {})).toEqualTypeOf<Page<Item>>();
expectTypeOf(applyFilters(items)).toEqualTypeOf<Page<Item>>();
expectTypeOf(
  applyFilters(items, { filters: filters.equals('name', 'a'), sort: 'name:asc', page: 1, limit: 2 })
).toEqualTypeOf<Page<Item>>();
expectTypeOf(applyFilters(items, { fields: ['id', 'data.x'] })).toEqualTypeOf<
  Page<DeepPartial<Item>>
>();
declare const someQuery: LocalQuery;
expectTypeOf(applyFilters(items, someQuery)).toEqualTypeOf<Page<DeepPartial<Item>>>();
// A query built conditionally (projection or not): the result type distributes over the union.
declare const projected: { fields: string[] };
declare const filteredOnly: { filters: FilterOptions };
declare const withProjection: boolean;
expectTypeOf(applyFilters(items, withProjection ? projected : filteredOnly)).toEqualTypeOf<
  Page<Item | DeepPartial<Item>>
>();
expectTypeOf<DeepPartial<Item>>().toEqualTypeOf<{
  id?: number;
  name?: string;
  data?: { x?: number; tags?: string[] };
}>();
// @ts-expect-error a key applyFilters does not know
void applyFilters(items, { filter: filters.equals('name', 'a') });
// @ts-expect-error page is a number
void applyFilters(items, { page: '1' });

// FilterOptions values keep their type; keys are '<field>:<operator>'.
export const mixedList: FilterOptions = { 'a:in': ['x', 1] };
export const typedValues: FilterOptions = {
  'n:eq': 5,
  'b:eq': false,
  't:gt': new Date(0),
  'x:between': [1, 2],
};
expectTypeOf(filters.between('x', new Date(0), 2)).toEqualTypeOf<FilterOptions>();
// @ts-expect-error a key without an operator
export const noOperator: FilterOptions = { name: 'x' };
// @ts-expect-error an unknown operator
export const badOperator: FilterOptions = { 'name:like': 'x' };
// @ts-expect-error an object value
export const objectValue: FilterOptions = { 'a:eq': { x: 1 } };
// @ts-expect-error builders take typed values: greaterThan needs a number or a Date
void filters.greaterThan('v', '5');
// @ts-expect-error builders take typed values: in needs an array
void filters.in('t', 'a');
