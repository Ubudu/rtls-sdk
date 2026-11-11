// Scaffold check (P1 §8, ORCHESTRATION §3 Stage A): every resource, type and mock-handler file of the ownership table
// (README §6) exists, compiles (npm run typecheck) and is wired into the client and the barrels, so the domain phases
// only fill in files they own.
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { HttpHandler } from 'msw';
import * as sdk from '../../../src';
import { RtlsClient, createRtlsClient } from '../../../src';
import { loadFixture } from '../../contract/fixtures';
import { server } from '../../mocks/server';
import { handlers as defaultHandlers } from '../../mocks/handlers';
import { handlers as coreHandlers } from '../../mocks/handlers/core';
import { handlers as assetsHandlers } from '../../mocks/handlers/assets';
import { handlers as positionsSpatialHandlers } from '../../mocks/handlers/positions-spatial';
import { handlers as venuesNavigationHandlers } from '../../mocks/handlers/venues-navigation';
import { handlers as dashboardsRulesHandlers } from '../../mocks/handlers/dashboards-rules';
import { handlers as notificationsHandlers } from '../../mocks/handlers/notifications';
import { handlers as etlHandlers } from '../../mocks/handlers/etl';
import { handlers as websocketHandlers } from '../../mocks/handlers/websocket';
import { AssetsResource } from '../../../src/resources/assets';
import { AssetDocumentsResource } from '../../../src/resources/asset-documents';
import { AssetTreeResource } from '../../../src/resources/asset-tree';
import { DataModelsResource } from '../../../src/resources/data-models';
import { DeclaredLocationsResource } from '../../../src/resources/declared-locations';
import { TagActionsResource } from '../../../src/resources/tag-actions';
import { PositionsResource } from '../../../src/resources/positions';
import { SpatialResource } from '../../../src/resources/spatial';
import { VenuesResource } from '../../../src/resources/venues';
import { ZonesResource } from '../../../src/resources/zones';
import { NavigationResource } from '../../../src/resources/navigation';
import { DashboardsResource } from '../../../src/resources/dashboards';
import { AlertsResource } from '../../../src/resources/alerts';
import { AlertRulesResource } from '../../../src/resources/alert-rules';
import { SettingsResource } from '../../../src/resources/settings';
import { NotificationsResource } from '../../../src/resources/notifications';
import { EtlResource } from '../../../src/resources/etl';

const ROOT = resolve(__dirname, '..', '..', '..');
const read = (path: string): string => readFileSync(resolve(ROOT, path), 'utf8');

/** CONVENTIONS §5: client property, exported class name, class and resource module (README §6). */
const RESOURCES = [
  ['assets', 'AssetsResource', AssetsResource, 'assets'],
  ['assetDocuments', 'AssetDocumentsResource', AssetDocumentsResource, 'asset-documents'],
  ['assetTree', 'AssetTreeResource', AssetTreeResource, 'asset-tree'],
  ['dataModels', 'DataModelsResource', DataModelsResource, 'data-models'],
  [
    'declaredLocations',
    'DeclaredLocationsResource',
    DeclaredLocationsResource,
    'declared-locations',
  ],
  ['tagActions', 'TagActionsResource', TagActionsResource, 'tag-actions'],
  ['positions', 'PositionsResource', PositionsResource, 'positions'],
  ['spatial', 'SpatialResource', SpatialResource, 'spatial'],
  ['venues', 'VenuesResource', VenuesResource, 'venues'],
  ['zones', 'ZonesResource', ZonesResource, 'zones'],
  ['navigation', 'NavigationResource', NavigationResource, 'navigation'],
  ['dashboards', 'DashboardsResource', DashboardsResource, 'dashboards'],
  ['alerts', 'AlertsResource', AlertsResource, 'alerts'],
  ['alertRules', 'AlertRulesResource', AlertRulesResource, 'alert-rules'],
  ['settings', 'SettingsResource', SettingsResource, 'settings'],
  ['notifications', 'NotificationsResource', NotificationsResource, 'notifications'],
  ['etl', 'EtlResource', EtlResource, 'etl'],
] as const;

/** README §6: the type files of the domain phases (P2 assets; P3 positions, spatial; P4 venues, navigation, geojson;
 *  P5 dashboards, alerts; P6 notifications; P7 etl). */
const TYPE_FILES = [
  'assets',
  'positions',
  'spatial',
  'venues',
  'navigation',
  'geojson',
  'dashboards',
  'alerts',
  'notifications',
  'etl',
] as const;

/** Module path of a resource module (`notifications` is a folder, P6 §3). */
const resourceFile = (module: string): string =>
  module === 'notifications'
    ? 'src/resources/notifications/index.ts'
    : `src/resources/${module}.ts`;

/** The `export * from '<specifier>'` lines of a barrel, in order. */
function starExports(source: string): string[] {
  return [...source.matchAll(/^export \* from '([^']+)';$/gm)].map((m) => m[1] ?? '');
}

describe('client properties (CONVENTIONS §5)', () => {
  it('declares exactly the 17 properties of CONVENTIONS §5, in that order', () => {
    const client = new RtlsClient();
    const resourceProps = Object.keys(client).filter((key) =>
      RESOURCES.some(([, , cls]) => Reflect.get(client, key) instanceof cls)
    );
    expect(resourceProps).toStrictEqual(RESOURCES.map(([prop]) => prop));
  });

  it.each(RESOURCES)('client.%s is an instance of the exported %s', (prop, name, cls) => {
    const client = new RtlsClient();
    expect(client[prop]).toBeInstanceOf(cls);
    // the root export is the class of the resource module (src/resources/index.ts → src/index.ts)
    expect(Reflect.get(sdk, name)).toBe(cls);
  });

  it('builds one resource object per property and per client', () => {
    const a = new RtlsClient();
    const b = new RtlsClient();
    const objects = RESOURCES.map(([prop]) => a[prop]);
    expect(new Set(objects).size).toBe(RESOURCES.length);
    for (const [prop] of RESOURCES) expect(a[prop]).not.toBe(b[prop]);
  });

  it('scoped clients get their own resource objects of the same classes', () => {
    const parent = new RtlsClient({ namespace: 'ns-a' });
    const child = parent.forNamespace('ns-b');
    for (const [prop, , cls] of RESOURCES) {
      expect(child[prop]).toBeInstanceOf(cls);
      expect(child[prop]).not.toBe(parent[prop]);
    }
  });

  it('client.health is the RtlsClient method', () => {
    const client = new RtlsClient();
    expect(client.health).toBeInstanceOf(Function);
    expect(client.health).toBe(RtlsClient.prototype.health);
  });
});

describe('resource modules (README §6) are wired into src/resources/index.ts', () => {
  it.each(RESOURCES.map(([, , , module]) => module))('src/resources/%s exists', (module) => {
    expect(existsSync(resolve(ROOT, resourceFile(module)))).toBe(true);
  });

  it('the barrel star-exports exactly the 17 resource modules', () => {
    expect(starExports(read('src/resources/index.ts'))).toStrictEqual(
      RESOURCES.map(([, , , module]) => `./${module}`)
    );
  });
});

describe('type files (README §6) are wired into src/types/index.ts and src/types.ts', () => {
  it.each(TYPE_FILES)('src/types/%s.ts exists', (domain) => {
    expect(existsSync(resolve(ROOT, `src/types/${domain}.ts`))).toBe(true);
  });

  it('src/types/index.ts star-exports every domain type file', () => {
    expect([...starExports(read('src/types/index.ts'))].sort()).toStrictEqual(
      TYPE_FILES.map((domain) => `./${domain}`).sort()
    );
  });

  it('src/types.ts re-exports the domain barrel and src/index.ts re-exports src/types.ts', () => {
    expect(starExports(read('src/types.ts'))).toStrictEqual(['./types/index']);
    expect(starExports(read('src/index.ts'))).toContain('./types');
  });
});

/** CONVENTIONS §6 domain keys with an MSW handler file (`harness` has none), in the order of handlers/index.ts. */
const HANDLER_FILES = [
  ['core', coreHandlers],
  ['assets', assetsHandlers],
  ['positions-spatial', positionsSpatialHandlers],
  ['venues-navigation', venuesNavigationHandlers],
  ['dashboards-rules', dashboardsRulesHandlers],
  ['notifications', notificationsHandlers],
  ['etl', etlHandlers],
  ['websocket', websocketHandlers],
] as const;

describe('mock handler files (README §6) are wired into test/mocks/handlers/index.ts', () => {
  it.each(HANDLER_FILES)(
    'test/mocks/handlers/%s.ts exports an array of MSW handlers',
    (domain, list) => {
      expect(existsSync(resolve(ROOT, `test/mocks/handlers/${domain}.ts`))).toBe(true);
      expect(Array.isArray(list)).toBe(true);
      for (const handler of list) expect(handler).toBeInstanceOf(HttpHandler);
    }
  );

  it('the index is the concatenation of the domain arrays, in order', () => {
    const expected = HANDLER_FILES.flatMap(([, list]) => [...list]);
    expect(defaultHandlers).toHaveLength(expected.length);
    expect(defaultHandlers.every((handler, i) => handler === expected[i])).toBe(true);
    // the empty arrays too: each domain array is spread into the index, in this order
    const spread = [...read('test/mocks/handlers/index.ts').matchAll(/\.\.\.(\w+)Handlers,/g)];
    expect(spread.map((m) => m[1])).toStrictEqual([
      'core',
      'assets',
      'positionsSpatial',
      'venuesNavigation',
      'dashboardsRules',
      'notifications',
      'etl',
      'websocket',
    ]);
  });

  it('the index declares no handler of its own (P1-T21)', () => {
    const source = read('test/mocks/handlers/index.ts');
    expect(source).not.toMatch(/\bhttp\./);
    expect([...source.matchAll(/from '\.\/([\w-]+)'/g)].map((m) => m[1])).toStrictEqual(
      HANDLER_FILES.map(([domain]) => domain)
    );
  });

  it('the MSW server starts with the default handlers', () => {
    const current = server.listHandlers();
    expect(current).toHaveLength(defaultHandlers.length);
    expect(current.every((handler, i) => handler === defaultHandlers[i])).toBe(true);
  });

  it('the 0.2.0 test-only error routes are gone', () => {
    const paths = defaultHandlers.map((handler) =>
      handler instanceof HttpHandler ? String(handler.info.path) : ''
    );
    expect(paths.filter((path) => path.includes('/test/error'))).toStrictEqual([]);
  });

  it("the core handler answers GET /health with the live body { status: 'OK' }", async () => {
    await expect(createRtlsClient().health()).resolves.toStrictEqual({ status: 'OK' });
  });

  it('the core handler serves the health-200 fixture, JSON with its status', async () => {
    const fixture = loadFixture('core', 'health-200');
    const { data, status, headers } = await createRtlsClient().transport.requestWithResponse(
      'GET',
      '/health'
    );
    expect(data).toStrictEqual(fixture.body);
    expect(status).toBe(fixture.status);
    expect(headers.get('content-type')).toBe('application/json');
  });
});
