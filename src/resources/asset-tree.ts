/**
 * The asset tree of a namespace (`client.assetTree`): read access only (writing the tree is a product-UI task that
 * the SDK does not wrap).
 *
 * @module resources/asset-tree
 */
import type { RequestOptions } from '../client/base';
import { ResourceBase } from '../client/resource';
import type { CallContext } from '../context';
import type { AssetTree } from '../types/assets';
import { splitCallOptions } from '../utils';

/** Read access to the asset tree (asset `path` values such as `/Root/Lv 1/` address its nodes). */
export class AssetTreeResource extends ResourceBase {
  /**
   * Reads the asset tree (`GET /assets_library/{app_namespace}`), returned as stored: `[]` when none is set. The
   * server stores any JSON, so the value is returned unchanged, without runtime checks: the result is typed
   * `AssetTree`, but a tree written by another client can be any JSON value (check `Array.isArray` if that matters).
   *
   * @param options per-call `namespace` and request options
   * @throws {ServerError} 500 when the stored value is not valid JSON
   * @throws {ContextError} when no namespace is given or set
   * @example
   * ```typescript
   * import { createRtlsClient } from 'ubudu-rtls-sdk';
   *
   * const client = createRtlsClient({ apiKey: process.env.RTLS_API_KEY, namespace: 'my-namespace' });
   * const tree = await client.assetTree.get();
   * for (const root of tree) console.log(root.name, root.families?.length ?? 0);
   * ```
   */
  async get(options?: CallContext & RequestOptions): Promise<AssetTree> {
    const { ctx, request } = splitCallOptions(options);
    return await this.transport.request<AssetTree>('GET', '/assets_library/{app_namespace}', {
      params: { app_namespace: this.ns(ctx) },
      ...request,
    });
  }
}
