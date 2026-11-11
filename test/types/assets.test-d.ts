// Type-level tests of the assets domain (P2 §8.1, P2-T12). Not collected by vitest (the unit config excludes
// test/types/**); `npm run typecheck` compiles this file, so every `expectTypeOf` and every `@ts-expect-error`
// below is checked by the compiler. Nothing here runs.
import { expectTypeOf } from 'vitest';
import type { RtlsClient } from '../../src';
import type { DownloadResult } from '../../src/client/transport';
import type {
  TagAction as ResourceTagAction,
  TagActionsResult,
} from '../../src/resources/tag-actions';
import type { OffsetPage } from '../../src/types';
import type {
  Asset,
  AssetDocument,
  AssetDocumentSummary,
  AssetHistoryEntry,
  AssetTree,
  BatchDeleteResult,
  BulkClearResult,
  BulkDeclareResult,
  DataModelField,
  DocumentDeleteResult,
  DocumentUploadJob,
  DocumentUploadJobCreated,
  TagAction,
  TagActionsResponse,
} from '../../src/types/assets';

declare const client: RtlsClient;
const mac = 'aabbccddeeff';
const doc = 'doc-1';

// ─── assets ───────────────────────────────────────────────────────────────────

expectTypeOf(client.assets.get(mac)).toEqualTypeOf<Promise<Asset>>();
expectTypeOf(client.assets.get('ns', mac)).toEqualTypeOf<Promise<Asset>>();
expectTypeOf(client.assets.create(mac, { user_name: 'Forklift 1' })).toEqualTypeOf<
  Promise<Asset>
>();
// @ts-expect-error user_name is required (B1)
void client.assets.create(mac, { color: '#ff0000' });
// @ts-expect-error createdBy is server-owned
void client.assets.create(mac, { user_name: 'Forklift 1', createdBy: 'me' });
// @ts-expect-error dateChanged is server-owned
void client.assets.create(mac, { user_name: 'Forklift 1', dateChanged: 1 });
expectTypeOf(client.assets.update(mac, { color: null, data: { zone: 'A' } })).toEqualTypeOf<
  Promise<Asset>
>();
void client.assets.update(mac, {
  user_name: 'Forklift 2',
  user_udid: mac,
  declared_location: null,
});
void client.assets.update(mac, { external_id: null, data: null, custom_key: null });
// @ts-expect-error user_name cannot be deleted (update rejects null)
void client.assets.update(mac, { user_name: null });
// @ts-expect-error user_udid cannot be deleted (update rejects null)
void client.assets.update(mac, { user_udid: null });
// @ts-expect-error createdBy is server-owned, null included
void client.assets.update(mac, { createdBy: null });
// @ts-expect-error dateChanged is server-owned
void client.assets.update(mac, { dateChanged: 1 });
expectTypeOf(client.assets.delete(mac)).toEqualTypeOf<Promise<void>>();
expectTypeOf(client.assets.batchDelete([mac])).toEqualTypeOf<Promise<BatchDeleteResult>>();
expectTypeOf(client.assets.batchSave([{ user_udid: mac, user_name: 'A' }])).toEqualTypeOf<
  Promise<Asset[]>
>();
expectTypeOf(client.assets.getHistory(mac, { startTime: new Date() })).toEqualTypeOf<
  Promise<AssetHistoryEntry[]>
>();

// list (D8, B3): typed options, legacy positional namespace, deprecated two-object form.
expectTypeOf(client.assets.list()).toEqualTypeOf<Promise<Asset[]>>();
expectTypeOf(
  client.assets.list({ key: 'user_udid', value: mac, 'user_name:contains': 'fork', limit: 10 })
).toEqualTypeOf<Promise<Asset[]>>();
expectTypeOf(client.assets.list({ namespace: 'ns' }, { timeoutMs: 1000 })).toEqualTypeOf<
  Promise<Asset[]>
>();
expectTypeOf(client.assets.list('ns', { limit: 1 })).toEqualTypeOf<Promise<Asset[]>>();
// @ts-expect-error arbitrary option keys no longer type-check (B3)
void client.assets.list({ foo: 1 });
expectTypeOf(client.assets.iterate()).toEqualTypeOf<AsyncGenerator<Asset>>();

// ─── asset tree, data models ──────────────────────────────────────────────────

expectTypeOf(client.assetTree.get()).toEqualTypeOf<Promise<AssetTree>>();
expectTypeOf(client.dataModels.get()).toEqualTypeOf<Promise<DataModelField[]>>();
// The field type is open: a value outside the six known ones is accepted.
const custom: DataModelField = { key: 'data.custom', type: 'geo_point' };
expectTypeOf(custom.type).toEqualTypeOf<DataModelField['type']>();

// ─── tag actions ──────────────────────────────────────────────────────────────

expectTypeOf(client.tagActions.send([{ macAddress: mac, action: 'ptlGreen' }])).toEqualTypeOf<
  Promise<TagActionsResponse>
>();
void client.tagActions.send([{ macAddress: mac, action: 'ptlAquamarine', duration: 30 }]);
// @ts-expect-error 'ptlPink' is not one of the 11 actions
void client.tagActions.send([{ macAddress: mac, action: 'ptlPink' }]);
// The 0.2.0 names exported by the resource file are the domain types.
expectTypeOf<TagActionsResult>().toEqualTypeOf<TagActionsResponse>();
expectTypeOf<ResourceTagAction>().toEqualTypeOf<TagAction>();
expectTypeOf(client.sendTagActions('ns', [{ macAddress: mac, action: 'uwbBlink' }])).toEqualTypeOf<
  Promise<TagActionsResult>
>();

// ─── declared locations ───────────────────────────────────────────────────────

expectTypeOf(
  client.declaredLocations.bulkDeclare({
    assets: [{ mac_address: mac }, { external_id: 'PALLET-42' }],
    shared_location: { lat: 48.85, lng: 2.35, level: 0, source: 'api' },
  })
).toEqualTypeOf<Promise<BulkDeclareResult>>();
void client.declaredLocations.bulkDeclare({
  // @ts-expect-error 'gps' is not a declared-location source
  assets: [{ mac_address: mac, declared_location: { lat: 0, lng: 0, source: 'gps' } }],
});
expectTypeOf(client.declaredLocations.bulkClear({ mac_addresses: [mac] })).toEqualTypeOf<
  Promise<BulkClearResult>
>();

// ─── asset documents ──────────────────────────────────────────────────────────

expectTypeOf(
  client.assetDocuments.upload(mac, {
    file: new Uint8Array(1),
    filename: 'a.png',
    docType: 'photo',
    tags: ['x'],
  })
).toEqualTypeOf<Promise<DocumentUploadJobCreated>>();
void client.assetDocuments.upload(mac, {
  file: new Blob([]),
  filename: 'a.bmp',
  // @ts-expect-error contentType is one of the five document types
  contentType: 'image/bmp',
  docType: 'photo',
});
expectTypeOf(client.assetDocuments.getJob('job')).toEqualTypeOf<Promise<DocumentUploadJob>>();
expectTypeOf(
  client.assetDocuments.waitForJob('job', { intervalMs: 500, maxWaitMs: 10_000 })
).toEqualTypeOf<Promise<DocumentUploadJob>>();
expectTypeOf(client.assetDocuments.listPage(mac, { limit: 10, offset: 0 })).toEqualTypeOf<
  Promise<OffsetPage<AssetDocumentSummary>>
>();
// @ts-expect-error no sort options (the server's sortBy/sortOrder are undocumented, §4)
void client.assetDocuments.listPage(mac, { sortBy: 'created_at' });
expectTypeOf(client.assetDocuments.list(mac, { maxItems: 10 })).toEqualTypeOf<
  Promise<AssetDocumentSummary[]>
>();
expectTypeOf(client.assetDocuments.get(mac, doc)).toEqualTypeOf<Promise<AssetDocument>>();
expectTypeOf(client.assetDocuments.download(mac, doc, { version: 'thumbnail' })).toEqualTypeOf<
  Promise<DownloadResult>
>();
// @ts-expect-error 'huge' is not a document version
void client.assetDocuments.download(mac, doc, { version: 'huge' });
expectTypeOf(client.assetDocuments.delete(mac, doc)).toEqualTypeOf<Promise<DocumentDeleteResult>>();
