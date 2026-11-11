/**
 * Hand-written path overrides for operations whose spec path is wrong (USI-P1-6). `npm run generate` never
 * writes this file.
 *
 * The spec declares the two spatial asset searches as `/api/spatial/assets/:namespace/…` (Express syntax, a doubled
 * `/api`, and `namespace` as a query parameter). The real routes are `/spatial/assets/{namespace}/…` with the
 * namespace in the path. `ApiPaths` (`src/client/paths.ts`) drops the spec entries listed in `ReplacedSpecPaths` and
 * adds the `ExtraPaths` below.
 *
 * The keys of the `ExtraPaths` interface below stay string literals: the live-test guard reads them with a regular
 * expression to accept these paths. Do not quote the interface declaration itself in a comment above it, or the
 * guard reads the comment instead.
 *
 * @module generated/overrides
 */
import type { paths } from './schema';

type SpecNearest = paths['/api/spatial/assets/:namespace/nearest-to-point']['get'];
type SpecRealtime = paths['/api/spatial/assets/:namespace/nearest-realtime']['get'];

/** Spec paths that are wrong and are removed from `ApiPaths` (USI-P1-6). */
export type ReplacedSpecPaths =
  | '/api/spatial/assets/:namespace/nearest-to-point'
  | '/api/spatial/assets/:namespace/nearest-realtime';

/** Real routes of the replaced spec paths, in the generated `paths` format. */
export interface ExtraPaths {
  '/spatial/assets/{namespace}/nearest-to-point': {
    parameters: { query?: never; header?: never; path?: never; cookie?: never };
    get: {
      parameters: {
        query: Omit<SpecNearest['parameters']['query'], 'namespace'>;
        header?: never;
        path: { namespace: string };
        cookie?: never;
      };
      requestBody?: never;
      responses: SpecNearest['responses'];
    };
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/spatial/assets/{namespace}/nearest-realtime': {
    parameters: { query?: never; header?: never; path?: never; cookie?: never };
    get: {
      parameters: {
        query: Omit<SpecRealtime['parameters']['query'], 'namespace'>;
        header?: never;
        path: { namespace: string };
        cookie?: never;
      };
      requestBody?: never;
      responses: SpecRealtime['responses'];
    };
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
}
