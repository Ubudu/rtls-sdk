import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildRouteTable,
  loadRouteTable,
  matchRoute,
  normalizeTemplate,
  parseExtraPathKeys,
} from './routes';
import { tempDir } from './unit-support';

const table = loadRouteTable();

describe('routes.ts', () => {
  it('literal segments beat parameters', () => {
    expect(matchRoute(table, '/dashboards/created')?.template).toBe('/dashboards/created');
    expect(matchRoute(table, '/dashboards/abc123')?.template).toBe('/dashboards/{id}');
    expect(matchRoute(table, '/notifications/ns1/unread_count')?.template).toBe(
      '/notifications/{namespace}/unread_count'
    );
    expect(matchRoute(table, '/notifications/ns1/item-1')).toEqual(
      expect.objectContaining({
        template: '/notifications/{namespace}/{id}',
        params: { namespace: 'ns1', id: 'item-1' },
      })
    );
    expect(matchRoute(table, '/venues/cache/stats')?.template).toBe('/venues/cache/stats');
    expect(matchRoute(table, '/assets/ns1/bulk-declare')?.template).toBe(
      '/assets/{namespace}/bulk-declare'
    );
  });

  it('normalises Express-style spec paths (leading /api dropped, :param → {param})', () => {
    expect(normalizeTemplate('/api/spatial/assets/:namespace/nearest-to-point')).toBe(
      '/spatial/assets/{namespace}/nearest-to-point'
    );
    expect(matchRoute(table, '/spatial/assets/ns1/nearest-to-point')).toEqual(
      expect.objectContaining({
        template: '/spatial/assets/{namespace}/nearest-to-point',
        params: { namespace: 'ns1' },
      })
    );
    expect(matchRoute(table, '/spatial/assets/ns1/nearest-realtime')?.template).toBe(
      '/spatial/assets/{namespace}/nearest-realtime'
    );
  });

  it('parses the string-literal keys of ExtraPaths from a sample overrides file', () => {
    const source = [
      "import type { paths } from './schema';",
      'export interface ExtraPaths {',
      "  '/spatial/assets/{namespace}/nearest-to-point': { get: { responses: { '200': unknown } } };",
      '  "/extra/{namespace}/thing": {',
      "    post: { requestBody: { content: { 'application/json': unknown } } };",
      '  };',
      '}',
      'export interface Other { "/not/extra": unknown }',
    ].join('\n');
    expect(parseExtraPathKeys(source)).toEqual([
      '/spatial/assets/{namespace}/nearest-to-point',
      '/extra/{namespace}/thing',
    ]);
    const dir = tempDir('routes');
    const overrides = join(dir, 'overrides.ts');
    writeFileSync(overrides, source);
    const withExtra = loadRouteTable({ overridesPath: overrides });
    expect(matchRoute(withExtra, '/extra/ns1/thing')).toEqual(
      expect.objectContaining({
        template: '/extra/{namespace}/thing',
        source: 'extra',
        methods: null,
      })
    );
    expect(matchRoute(table, '/extra/ns1/thing')).toBeNull();
    expect(parseExtraPathKeys('export interface Unrelated {}')).toEqual([]);
  });

  it('an unknown path matches nothing', () => {
    expect(matchRoute(table, '/nope/ns1')).toBeNull();
    expect(matchRoute(table, '/assets/ns1/mac/extra/deep')).toBeNull();
    expect(matchRoute(table, '/assets//x')).toBeNull();
  });

  it('records the base.json exclude decisions by method and template', () => {
    expect(table.excluded.has('GET /venues/cache/stats')).toBe(true);
    expect(table.excluded.has('POST /settings/{app_namespace}')).toBe(true);
    expect(table.excluded.has('GET /settings/{app_namespace}')).toBe(false);
    const small = buildRouteTable({
      spec: { paths: { '/a/{namespace}': { get: {}, post: {} } } },
      excludedOperations: ['POST /a/{namespace}'],
    });
    expect(small.excluded).toEqual(new Set(['POST /a/{namespace}']));
    expect(matchRoute(small, '/a/x')?.methods).toEqual(new Set(['GET', 'POST']));
  });
});
