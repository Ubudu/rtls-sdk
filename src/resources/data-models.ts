/**
 * The data model of a namespace (`client.dataModels`): read access only (writing the data model is a product-UI
 * task that the SDK does not wrap).
 *
 * @module resources/data-models
 */
import type { RequestOptions } from '../client/base';
import { ResourceBase } from '../client/resource';
import type { CallContext } from '../context';
import type { DataModelField } from '../types/assets';
import { splitCallOptions } from '../utils';

/** Read access to the asset data model definitions. */
export class DataModelsResource extends ResourceBase {
  /**
   * Reads the data model taxonomy (`GET /data_filters_taxonomy/{app_namespace}`): one entry per asset field, plus
   * the entry whose `key` is `'data_models'`, which carries the model definitions in `data`. Returned as stored
   * (`[]` when none is set, USI-P2-9), without runtime checks.
   *
   * @param options per-call `namespace` and request options
   * @throws {ServerError} 500 when the stored value is not valid JSON
   * @throws {ContextError} when no namespace is given or set
   * @example
   * ```typescript
   * import { createRtlsClient } from 'ubudu-rtls-sdk';
   *
   * const client = createRtlsClient({ apiKey: process.env.RTLS_API_KEY, namespace: 'my-namespace' });
   * const fields = await client.dataModels.get();
   * const models = fields.find((field) => field.key === 'data_models')?.data ?? [];
   * console.log(fields.length, models.map((model) => model.key));
   * ```
   */
  async get(options?: CallContext & RequestOptions): Promise<DataModelField[]> {
    const { ctx, request } = splitCallOptions(options);
    return await this.transport.request<DataModelField[]>(
      'GET',
      '/data_filters_taxonomy/{app_namespace}',
      { params: { app_namespace: this.ns(ctx) }, ...request }
    );
  }
}
