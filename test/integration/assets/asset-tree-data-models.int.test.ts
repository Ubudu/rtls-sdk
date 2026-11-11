// P2 §9.6: live reads of the asset tree and the data-model taxonomy (tier R). Shapes are asserted, never logged.
import { beforeAll } from 'vitest';
import type { AssetTreeNode, DataModelField, RtlsClient } from '../../../src';
import { createLiveClient, describeLive, getHarness } from '../harness';

function nodes(tree: AssetTreeNode[]): AssetTreeNode[] {
  return tree.flatMap((n) => [n, ...nodes(Array.isArray(n.families) ? n.families : [])]);
}

describeLive('R', 'asset tree and data models', () => {
  let client: RtlsClient;

  beforeAll(() => {
    client = createLiveClient();
  });

  it('assetTree.get returns the stored tree', async () => {
    const tree = await client.assetTree.get();
    expect(Array.isArray(tree)).toBe(true);
    for (const n of nodes(tree)) {
      expect(typeof n.name).toBe('string');
      expect(n.families === undefined || Array.isArray(n.families)).toBe(true);
    }
    const again = await client.assetTree.get({ namespace: getHarness().env.namespace });
    expect(again).toEqual(tree);
  });

  it('dataModels.get returns the taxonomy with its data_models entry', async () => {
    const fields: DataModelField[] = await client.dataModels.get();
    expect(fields.length).toBeGreaterThanOrEqual(1);
    for (const f of fields) expect(typeof f.key).toBe('string');
    const models = fields.filter((f) => f.key === 'data_models');
    for (const m of models) {
      expect(Array.isArray(m.data)).toBe(true);
      for (const def of m.data ?? []) {
        expect(typeof def).toBe('object');
        expect(typeof def.key).toBe('string');
      }
    }
    const again = await client.dataModels.get({ namespace: getHarness().env.namespace });
    expect(again).toHaveLength(fields.length);
  });
});
