/**
 * Type-only helpers that type the transport against the generated `paths` plus the hand-written overrides.
 * Nothing here exists at run time.
 *
 * @module client/paths
 */
import type { paths } from '../generated/schema';
import type { ExtraPaths, ReplacedSpecPaths } from '../generated/overrides';

/** The spec paths with the wrong ones replaced by their real routes (USI-P1-6). */
export type ApiPaths = Omit<paths, keyof ExtraPaths | ReplacedSpecPaths> & ExtraPaths;

/** HTTP methods the transport sends. */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/** The operation object of `P` for method `M`, or `never` when the path has no such operation. */
export type Operation<P extends keyof ApiPaths, M extends HttpMethod> =
  Lowercase<M> extends keyof ApiPaths[P] ? NonNullable<ApiPaths[P][Lowercase<M>]> : never;

/** The paths that declare an operation for `M`. */
export type PathsWithMethod<M extends HttpMethod> = {
  [P in keyof ApiPaths]: [Operation<P, M>] extends [never] ? never : P;
}[keyof ApiPaths];

// `never extends X` takes the true branch of a non-distributive conditional, so every step guards `never` first.

type ParametersOf<P extends keyof ApiPaths, M extends HttpMethod> = [Operation<P, M>] extends [
  never,
]
  ? never
  : Operation<P, M> extends { parameters: infer Params }
    ? Params
    : never;

/** Path parameters of the operation (`never` when it has none). */
export type PathParams<P extends keyof ApiPaths, M extends HttpMethod> = [
  ParametersOf<P, M>,
] extends [never]
  ? never
  : ParametersOf<P, M> extends { path: infer Path }
    ? Path
    : never;

/** Query parameters the spec declares for the operation (`never` when it declares none). */
export type QueryParams<P extends keyof ApiPaths, M extends HttpMethod> = [
  ParametersOf<P, M>,
] extends [never]
  ? never
  : ParametersOf<P, M> extends { query?: infer Query }
    ? NonNullable<Query>
    : never;

type RequestBodyOf<P extends keyof ApiPaths, M extends HttpMethod> = [Operation<P, M>] extends [
  never,
]
  ? never
  : Operation<P, M> extends { requestBody?: infer Body }
    ? NonNullable<Body>
    : never;

/** The JSON request body of the operation (`never` when it declares no `application/json` body). */
export type JsonBody<P extends keyof ApiPaths, M extends HttpMethod> = [
  RequestBodyOf<P, M>,
] extends [never]
  ? never
  : RequestBodyOf<P, M> extends { content: { 'application/json': infer Json } }
    ? Json
    : never;

type ResponsesOf<P extends keyof ApiPaths, M extends HttpMethod> = [Operation<P, M>] extends [never]
  ? never
  : Operation<P, M> extends { responses: infer R }
    ? R
    : never;

type ContentOf<R, S extends number> = [R] extends [never]
  ? never
  : S extends keyof R
    ? R[S] extends { content: infer C }
      ? C
      : never
    : never;

/** Content map of the first of 200, 201, 202 that declares `content`. */
type SuccessContent<R> = [ContentOf<R, 200>] extends [never]
  ? [ContentOf<R, 201>] extends [never]
    ? ContentOf<R, 202>
    : ContentOf<R, 201>
  : ContentOf<R, 200>;

type BodyOfContent<C> = [C] extends [never]
  ? unknown
  : 'application/json' extends keyof C
    ? C['application/json']
    : 'text/plain' extends keyof C
      ? string
      : unknown;

/**
 * The success body of the operation: the first of 200/201/202 that declares `content`, its `application/json`
 * schema, else `string` for `text/plain`, else `unknown` (78 operations declare no 2xx content, USI-P1-5).
 */
export type SuccessBody<P extends keyof ApiPaths, M extends HttpMethod> = BodyOfContent<
  SuccessContent<ResponsesOf<P, M>>
>;

/** `true` when the operation has path parameters. */
export type HasPathParams<P extends keyof ApiPaths, M extends HttpMethod> = [
  PathParams<P, M>,
] extends [never]
  ? false
  : true;
