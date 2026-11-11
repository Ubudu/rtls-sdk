// Type-level tests of client.etl (P7 §8.4). Not collected by vitest (the unit config excludes test/types/**);
// `npm run typecheck` compiles this file, so every `expectTypeOf` and every `@ts-expect-error` below is checked by
// the compiler.
import { expectTypeOf } from 'vitest';
import type {
  EtlActivitiesResource,
  EtlActivity,
  EtlActivityIterateQuery,
  EtlFileInput,
  EtlMappingProfile,
  EtlMappingProfileInput,
  EtlMappingProfilesResource,
  EtlMappingProfileUpdate,
  EtlProcessingStats,
  EtlResource,
  EtlSheetPreview,
  EtlStaleWriteBody,
  EtlUploadActivityDetails,
  EtlUploadResult,
  Page,
  RtlsClient,
} from '../../src';

declare const client: RtlsClient;
declare const profile: EtlMappingProfile;
declare const activity: EtlActivity;
declare const file: EtlFileInput;

// ─── Wiring ────────────────────────────────────────────────────────────────────

expectTypeOf(client.etl).toEqualTypeOf<EtlResource>();
expectTypeOf(client.etl.mappingProfiles).toEqualTypeOf<EtlMappingProfilesResource>();
expectTypeOf(client.etl.activities).toEqualTypeOf<EtlActivitiesResource>();

// E3/E4 are excluded: no check / fix method exists anywhere.
// @ts-expect-error check-mappings is not wrapped
void client.etl.mappingProfiles.check;
// @ts-expect-error check-mappings is not wrapped
void client.etl.checkMappings;
// @ts-expect-error fix-mapping is not wrapped
void client.etl.mappingProfiles.setKeyColumns;

// ─── Mapping profiles ──────────────────────────────────────────────────────────

expectTypeOf(client.etl.mappingProfiles.list()).toEqualTypeOf<Promise<EtlMappingProfile[]>>();
expectTypeOf(client.etl.mappingProfiles.listAll()).toEqualTypeOf<Promise<EtlMappingProfile[]>>();
expectTypeOf(client.etl.mappingProfiles.get('id')).toEqualTypeOf<Promise<EtlMappingProfile>>();
expectTypeOf(client.etl.mappingProfiles.delete('id')).toEqualTypeOf<Promise<void>>();
expectTypeOf(
  client.etl.mappingProfiles.create({
    name: 'n',
    mappings: { user_name: { sourceColumn: 'Name' } },
  })
).toEqualTypeOf<Promise<EtlMappingProfile>>();
// create() rejects a legacy string-valued mapping.
void client.etl.mappingProfiles.create({
  name: 'n',
  // @ts-expect-error a string mapping value is legacy and read-only
  mappings: { user_name: 'Name' },
});
// @ts-expect-error name is required
void client.etl.mappingProfiles.create({ mappings: {} });
// update() accepts a full profile value (read-modify-write) and the lock in every TimeInput form.
expectTypeOf(client.etl.mappingProfiles.update('id', profile)).toEqualTypeOf<
  Promise<EtlMappingProfile>
>();
expectTypeOf(profile).toMatchTypeOf<EtlMappingProfileUpdate>();
void client.etl.mappingProfiles.update('id', { updated_at: new Date() });
void client.etl.mappingProfiles.update('id', { updated_at: 0 });
void client.etl.mappingProfiles.update('id', { updated_at: profile.updated_at });
// @ts-expect-error updated_at is a time value
void client.etl.mappingProfiles.update('id', { updated_at: true });
void client.etl.mappingProfiles.list({ namespace: 'ns', signal: new AbortController().signal });

expectTypeOf<EtlMappingProfile['defaults']>().toEqualTypeOf<
  EtlMappingProfile['defaults'] | undefined
>();
expectTypeOf<Pick<EtlMappingProfile, 'defaults'>>().toEqualTypeOf<{
  defaults?: EtlMappingProfile['defaults'];
}>();
expectTypeOf<EtlMappingProfileInput['mappings'][string]>().not.toEqualTypeOf<string>();
expectTypeOf<EtlStaleWriteBody['current']>().toEqualTypeOf<EtlMappingProfile>();

// ─── Files ─────────────────────────────────────────────────────────────────────

expectTypeOf(client.etl.parseHeaders(file)).toEqualTypeOf<Promise<EtlSheetPreview>>();
expectTypeOf(client.etl.upload(file, 'id')).toEqualTypeOf<Promise<EtlUploadResult>>();
void client.etl.upload(file, ['a', 'b'] as const, { dryRun: true, timeoutMs: 0 });
void client.etl.upload({ data: 'MAC\n', filename: 'a.csv' }, 'id');
void client.etl.upload({ data: new Uint8Array(1), filename: 'a.xlsx' }, 'id');
void client.etl.upload(new File(['x'], 'a.csv'), 'id');
// @ts-expect-error the object form needs a filename
void client.etl.upload({ data: 'MAC\n' }, 'id');
// @ts-expect-error string data needs a filename
const noName: EtlFileInput = { data: 'x' };
void noName;
// @ts-expect-error dryRun is a boolean
void client.etl.upload(file, 'id', { dryRun: 'yes' });
expectTypeOf<EtlUploadResult['results']['processedProfiles'][number]['errors']>().toEqualTypeOf<
  Array<{ rowIndex?: number; message: string }>
>();

// ─── Activities ────────────────────────────────────────────────────────────────

expectTypeOf(client.etl.activities.listPage()).toEqualTypeOf<Promise<Page<EtlActivity>>>();
expectTypeOf(client.etl.activities.iterate()).toEqualTypeOf<AsyncIterableIterator<EtlActivity>>();
// @ts-expect-error iterate() pages itself: no page
void client.etl.activities.iterate({ page: 2 });
// @ts-expect-error iterate() pages itself: no limit
void client.etl.activities.iterate({ limit: 2 });
expectTypeOf<EtlActivityIterateQuery['pageSize']>().toEqualTypeOf<number | undefined>();
// @ts-expect-error the action enum is server truth (no import/export)
void client.etl.activities.listPage({ action: 'import' });

// EtlActivity narrows on action.
if (activity.action === 'upload') {
  expectTypeOf(activity.details).toEqualTypeOf<EtlUploadActivityDetails>();
  expectTypeOf(activity.details.processingStats).toEqualTypeOf<EtlProcessingStats | undefined>();
  expectTypeOf(activity.resourceType).toEqualTypeOf<'file'>();
} else {
  expectTypeOf(activity.details).toEqualTypeOf<{ name: string; applicationId?: string }>();
  expectTypeOf(activity.resourceType).toEqualTypeOf<'mapping'>();
}
expectTypeOf<EtlUploadActivityDetails['uploadResults']>().toEqualTypeOf<unknown>();
