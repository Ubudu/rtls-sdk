// Root export surface (P1 §6.8, §8 exports.test.ts): the 0.2.0 runtime names are kept, the new 0.3.0 names are
// exported, internals are not, and every name two star exports share is one of the listed collisions, resolved in
// src/index.ts. The websocket barrel is checked only for its 0.2.0 names (P8 owns the rest).
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import ts from 'typescript';
import * as sdk from '../../../src';
import * as errors from '../../../src/errors';
import * as resources from '../../../src/resources';
import * as types from '../../../src/types';
import * as utils from '../../../src/utils';
import * as websocket from '../../../src/websocket';

const ROOT = resolve(__dirname, '..', '..', '..');

/**
 * The runtime exports of ubudu-rtls-sdk 0.2.0 (`Object.keys` of the v0.2.0 root module) and their `typeof`.
 * Frozen: 0.3.0 keeps every one of them.
 */
const RUNTIME_0_2_0: Readonly<Record<string, 'function' | 'object'>> = {
  AlertsResource: 'function',
  AssetsResource: 'function',
  AuthenticationError: 'function',
  AuthorizationError: 'function',
  ContextError: 'function',
  DashboardsResource: 'function',
  NavigationResource: 'function',
  NetworkError: 'function',
  NotFoundError: 'function',
  POSITION_ORIGIN: 'object',
  PositionsResource: 'function',
  RateLimitError: 'function',
  RtlsClient: 'function',
  RtlsError: 'function',
  RtlsWebSocketClient: 'function',
  RtlsWebSocketPublisher: 'function',
  RtlsWebSocketSubscriber: 'function',
  SpatialResource: 'function',
  SubscriptionType: 'object',
  TimeoutError: 'function',
  ValidationError: 'function',
  VenuesResource: 'function',
  WEBSOCKET_DEFAULTS: 'object',
  WEBSOCKET_URLS: 'object',
  WebSocketAuthenticationError: 'function',
  WebSocketConnectionError: 'function',
  WebSocketError: 'function',
  WebSocketSendError: 'function',
  WebSocketSubscriptionError: 'function',
  ZonesResource: 'function',
  buildQueryParams: 'function',
  classifyMessage: 'function',
  collectAll: 'function',
  combineFilters: 'function',
  createError: 'function',
  createRtlsClient: 'function',
  extractDataArray: 'function',
  extractPathNodesFromGeoJSON: 'function',
  extractPathSegmentsFromGeoJSON: 'function',
  extractPoisFromGeoJSON: 'function',
  extractZonesFromGeoJSON: 'function',
  filter: 'function',
  filters: 'object',
  isAlertMessage: 'function',
  isArrayResponse: 'function',
  isAssetMessage: 'function',
  isPositionMessage: 'function',
  isSubscriptionConfirmation: 'function',
  isValidMacAddress: 'function',
  isZoneEntryExitMessage: 'function',
  isZoneStatsMessage: 'function',
  normalizeListResponse: 'function',
  normalizeMacAddress: 'function',
  paginate: 'function',
  requireMapId: 'function',
  requireNamespace: 'function',
  requireVenueId: 'function',
  resolveContext: 'function',
};

/** The 0.2.0 root names that come from the websocket barrel (P8 owns everything else it exports). */
const WEBSOCKET_0_2_0 = [
  'POSITION_ORIGIN',
  'RtlsWebSocketClient',
  'RtlsWebSocketPublisher',
  'RtlsWebSocketSubscriber',
  'SubscriptionType',
  'WEBSOCKET_DEFAULTS',
  'WEBSOCKET_URLS',
  'WebSocketAuthenticationError',
  'WebSocketConnectionError',
  'WebSocketError',
  'WebSocketSendError',
  'WebSocketSubscriptionError',
  'classifyMessage',
  'isAlertMessage',
  'isAssetMessage',
  'isPositionMessage',
  'isSubscriptionConfirmation',
  'isValidMacAddress',
  'isZoneEntryExitMessage',
  'isZoneStatsMessage',
  'normalizeMacAddress',
] as const;

/** New runtime names of 0.3.0 (§6.2, §6.8) with the module whose export they must be. */
const NEW_ERRORS = [
  'ConflictError',
  'GoneError',
  'PayloadTooLargeError',
  'UnsupportedMediaTypeError',
  'ServerError',
  'ServiceUnavailableError',
  'AbortError',
  'ResponseParseError',
  'StreamError',
] as const;
const NEW_UTILS = [
  'paginatePages',
  'paginateOffset',
  'normalizePage',
  'serializeFilters',
  'applyFilters',
  'normalizeMac',
  'formatMac',
  'isValidMac',
  'toEpochMs',
] as const;
const NEW_RESOURCES = [
  'AssetDocumentsResource',
  'AssetTreeResource',
  'DataModelsResource',
  'DeclaredLocationsResource',
  'TagActionsResource',
  'AlertRulesResource',
  'SettingsResource',
  'NotificationsResource',
  'EtlResource',
] as const;

/** Internal names that must not be root runtime exports (§6.3–§6.8). */
const INTERNAL = [
  'Transport',
  'ResourceBase',
  'BaseClient',
  'parseErrorBody',
  'applyUniversalQuery',
  'readTotalCount',
  'resolveTimeRange',
  'pollUntil',
  'sleep',
  'parseSse',
  'toFormFile',
  'parseContentDisposition',
  'serializeQuery',
  'queryEntries',
  'resolveNamespaceArgs',
  'resolveVenueArgs',
  'resolveMapArgs',
  'splitCallOptions',
  'stripContextFromOptions',
] as const;

/** §6.8: the names two star exports of src/index.ts share today, and the module whose meaning the root keeps. */
const LISTED_COLLISIONS: Readonly<Record<string, string>> = {
  PublishPositionData: 'resources',
  ZoneProperties: 'types',
  ZoneFeature: 'types',
};

const rootKeys = Object.keys(sdk);

describe('0.2.0 runtime exports are kept', () => {
  it.each(Object.entries(RUNTIME_0_2_0))('%s is exported (%s)', (name, kind) => {
    expect(rootKeys).toContain(name);
    expect(typeof Reflect.get(sdk, name)).toBe(kind);
  });

  it.each(WEBSOCKET_0_2_0)('%s is the websocket barrel export', (name) => {
    expect(Reflect.get(sdk, name)).toBe(Reflect.get(websocket, name));
  });
});

describe('new 0.3.0 runtime exports', () => {
  it.each(NEW_ERRORS)('%s comes from src/errors.ts and extends RtlsError', (name) => {
    expect(rootKeys).toContain(name);
    expect(sdk[name]).toBe(errors[name]);
    expect(errors[name].prototype).toBeInstanceOf(errors.RtlsError);
  });

  it.each(NEW_UTILS)('%s comes from src/utils', (name) => {
    expect(rootKeys).toContain(name);
    expect(sdk[name]).toBe(utils[name]);
    expect(sdk[name]).toBeInstanceOf(Function);
  });

  it.each(NEW_RESOURCES)('%s comes from src/resources', (name) => {
    expect(rootKeys).toContain(name);
    expect(sdk[name]).toBe(resources[name]);
  });

  it('the 0.2.0 utilities are the utils barrel functions', () => {
    for (const name of ['paginate', 'collectAll', 'buildQueryParams', 'filter', 'combineFilters']) {
      expect(Reflect.get(sdk, name)).toBe(Reflect.get(utils, name));
    }
    expect(sdk.filters).toBe(utils.filters);
  });
});

describe('internals are not root exports', () => {
  it.each(INTERNAL)('%s is not a runtime export', (name) => {
    expect(rootKeys).not.toContain(name);
  });

  it('every root runtime export is a 0.2.0 name, a new name, or comes from a domain barrel', () => {
    const allowed = new Set<string>([
      ...Object.keys(RUNTIME_0_2_0),
      ...NEW_ERRORS,
      ...NEW_UTILS,
      ...Object.keys(errors),
      ...Object.keys(resources),
      ...Object.keys(types),
      ...Object.keys(websocket),
    ]);
    expect(rootKeys.filter((name) => !allowed.has(name))).toStrictEqual([]);
  });

  it('the utils barrel names that the root does not take stay internal', () => {
    const internalUtils = Object.keys(utils).filter((name) => !rootKeys.includes(name));
    expect(internalUtils).toEqual(
      expect.arrayContaining(['readTotalCount', 'resolveTimeRange', 'pollUntil', 'sleep'])
    );
    for (const name of internalUtils) expect(INTERNAL as readonly string[]).toContain(name);
  });
});

interface ExportAnalysis {
  /** name → the modules (specifier without `./`) that export it with different declarations */
  collisions: Map<string, string[]>;
  /** the declaration a root export resolves to, as `<file relative to the index>:<offset>:<name>` */
  rootExport: (name: string) => string | undefined;
  /** the declaration a module's export resolves to, same form */
  moduleExport: (module: string, name: string) => string | undefined;
  /** TS2308 (ambiguous star export) messages of the index file */
  ts2308: string[];
  /**
   * root export names whose declaration has a value meaning (class, function, variable, enum), however they are
   * exported: the declaration bundle emits `export type { SomeClass }` as a value export
   */
  valueExports: string[];
}

/**
 * The collision script of §6.8, on the real compiler: every module the index file star-exports contributes all its
 * exports, every other module the names the index takes from it by name (the explicit disambiguations of
 * star-exported modules are the resolutions, so they are left out). A name exported by two of them with different
 * declarations is a collision; the same declaration re-exported by two modules is not.
 */
function exportAnalysis(indexPath: string, options: ts.CompilerOptions): ExportAnalysis {
  const program = ts.createProgram({
    rootNames: [indexPath],
    options: { ...options, noEmit: true },
  });
  const checker = program.getTypeChecker();
  // a stable id of the declaration an export resolves to (symbols themselves are not compared or printed)
  const declaration = (s: ts.Symbol): string => {
    const target = s.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(s) : s;
    const node = target.declarations?.[0];
    if (!node) return `?:${target.name}`;
    const file = relative(dirname(indexPath), node.getSourceFile().fileName);
    return `${file}:${node.getStart()}:${target.name}`;
  };
  const index = program.getSourceFile(indexPath);
  if (!index) throw new Error(`${indexPath} is not in the program`);
  const exportsOf = (specifier: string): ts.Symbol[] => {
    const file = ts.resolveModuleName(specifier, indexPath, options, ts.sys).resolvedModule
      ?.resolvedFileName;
    const source = file ? program.getSourceFile(file) : undefined;
    const symbol = source ? checker.getSymbolAtLocation(source) : undefined;
    if (!symbol) throw new Error(`module ${specifier} not found`);
    return checker.getExportsOfModule(symbol);
  };
  const reExports = index.statements.flatMap((s) =>
    ts.isExportDeclaration(s) && s.moduleSpecifier && ts.isStringLiteral(s.moduleSpecifier)
      ? [{ statement: s, specifier: s.moduleSpecifier.text }]
      : []
  );
  const starred = new Set(
    reExports.filter((r) => !r.statement.exportClause).map((r) => r.specifier)
  );
  const owners = new Map<string, Array<{ module: string; declaration: string }>>();
  const add = (name: string, specifier: string, symbol: ts.Symbol): void => {
    const list = owners.get(name) ?? [];
    list.push({ module: specifier.replace(/^\.\//, ''), declaration: declaration(symbol) });
    owners.set(name, list);
  };
  for (const { statement, specifier } of reExports) {
    const exported = exportsOf(specifier);
    const clause = statement.exportClause;
    if (!clause) {
      for (const symbol of exported) add(symbol.name, specifier, symbol);
    } else if (ts.isNamedExports(clause) && !starred.has(specifier)) {
      for (const element of clause.elements) {
        const source = (element.propertyName ?? element.name).text;
        const symbol = exported.find((s) => s.name === source);
        if (!symbol) throw new Error(`${specifier} does not export ${source}`);
        add(element.name.text, specifier, symbol);
      }
    }
  }
  const collisions = new Map<string, string[]>();
  for (const [name, list] of owners) {
    if (new Set(list.map((o) => o.declaration)).size > 1) {
      collisions.set(
        name,
        list.map((o) => o.module)
      );
    }
  }
  const rootSymbol = checker.getSymbolAtLocation(index);
  const rootExports = rootSymbol ? checker.getExportsOfModule(rootSymbol) : [];
  const find = (list: ts.Symbol[], name: string): string | undefined => {
    const symbol = list.find((s) => s.name === name);
    return symbol ? declaration(symbol) : undefined;
  };
  const hasValue = (s: ts.Symbol): boolean =>
    ((s.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(s) : s).flags &
      ts.SymbolFlags.Value) !==
    0;
  return {
    collisions,
    valueExports: rootExports.filter(hasValue).map((s) => s.name),
    rootExport: (name) => find(rootExports, name),
    moduleExport: (module, name) => find(exportsOf(`./${module}`), name),
    ts2308: program
      .getSemanticDiagnostics(index)
      .filter((d) => d.code === 2308)
      .map((d) => ts.flattenDiagnosticMessageText(d.messageText, ' ')),
  };
}

function sdkCompilerOptions(): ts.CompilerOptions {
  const config = ts.getParsedCommandLineOfConfigFile(resolve(ROOT, 'tsconfig.json'), undefined, {
    ...ts.sys,
    onUnRecoverableConfigFileDiagnostic: (d) => {
      throw new Error(ts.flattenDiagnosticMessageText(d.messageText, '\n'));
    },
  });
  if (!config) throw new Error('tsconfig.json could not be read');
  return config.options;
}

describe('the collision script itself', () => {
  let dir = '';
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'sdk-collisions-'));
    const files: Record<string, string> = {
      'a.ts': 'export type X = 1;\nexport type Y = 1;\nexport const k = 1;\n',
      'b.ts': 'export type X = 2;\nexport type Z = 2;\n',
      'c.ts': "export type { Y } from './a';\n",
      'd.ts': 'export type Z = 4;\nexport type W = 4;\n',
      'index.ts': [
        "export * from './a';",
        "export * from './b';",
        "export * from './c';",
        "export type { Z, W } from './d';",
        "export type { X } from './a';",
        '',
      ].join('\n'),
      'ambiguous.ts': "export * from './a';\nexport * from './b';\n",
      'e.ts': 'export class K {}\nexport interface I {}\n',
      'typed.ts':
        "import type { K as KClass } from './e';\nexport type { K, I } from './e';\nexport type L = KClass;\n",
    };
    for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, name), text);
  });
  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('finds star-star and named-star collisions and ignores one declaration re-exported twice', () => {
    const analysis = exportAnalysis(join(dir, 'index.ts'), sdkCompilerOptions());
    expect(Object.fromEntries(analysis.collisions)).toStrictEqual({ X: ['a', 'b'], Z: ['b', 'd'] });
    expect(analysis.rootExport('X')).toBe(analysis.moduleExport('a', 'X'));
    expect(analysis.rootExport('X')).not.toBe(analysis.moduleExport('b', 'X'));
    expect(analysis.ts2308).toStrictEqual([]);
  }, 60_000);

  it('counts a type-only re-export of a class as a value export, an alias of it as a type', () => {
    expect(exportAnalysis(join(dir, 'typed.ts'), sdkCompilerOptions()).valueExports).toStrictEqual([
      'K',
    ]);
  }, 60_000);

  it('reports TS2308 for an unresolved collision', () => {
    const analysis = exportAnalysis(join(dir, 'ambiguous.ts'), sdkCompilerOptions());
    expect([...analysis.collisions.keys()]).toStrictEqual(['X']);
    expect(analysis.ts2308).toHaveLength(1);
    expect(analysis.ts2308[0]).toContain("'X'");
  }, 60_000);
});

describe('star-export collisions of src/index.ts (§6.8)', () => {
  let analysis: ExportAnalysis;
  beforeAll(() => {
    analysis = exportAnalysis(resolve(ROOT, 'src/index.ts'), sdkCompilerOptions());
  }, 120_000);

  it('every collision is a listed one (a new one is resolved in src/index.ts by handoff, O16)', () => {
    const unlisted = [...analysis.collisions].filter(([name]) => !(name in LISTED_COLLISIONS));
    expect(unlisted).toStrictEqual([]);
  });

  it('every collision involves the module whose meaning the root keeps', () => {
    for (const [name, modules] of analysis.collisions) {
      expect(modules).toContain(LISTED_COLLISIONS[name]);
    }
  });

  it.each(Object.entries(LISTED_COLLISIONS))(
    'the root %s is the one of ./%s (its 0.2.0 meaning)',
    (name, module) => {
      const fromRoot = analysis.rootExport(name);
      expect(fromRoot).not.toBeUndefined();
      expect(fromRoot).toBe(analysis.moduleExport(module, name));
      expect(fromRoot).not.toBe(analysis.moduleExport('websocket', name));
    }
  );

  it('the WebSocket publish payload stays reachable as WebSocketPublishPositionData', () => {
    const fromRoot = analysis.rootExport('WebSocketPublishPositionData');
    expect(fromRoot).not.toBeUndefined();
    expect(fromRoot).toBe(analysis.moduleExport('websocket', 'PublishPositionData'));
  });

  it('src/index.ts has no TS2308 (ambiguous star export)', () => {
    expect(analysis.ts2308).toStrictEqual([]);
  });

  it('every root export with a value meaning in the declarations is a runtime export', () => {
    // `export type { Transport }` of the class made index.d.ts promise a runtime `Transport` the bundle lacks.
    expect(analysis.valueExports.length).toBeGreaterThan(50);
    expect(analysis.valueExports.filter((name) => !rootKeys.includes(name))).toStrictEqual([]);
  });
});
