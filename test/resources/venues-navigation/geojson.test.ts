// Unit tests of the four extract*FromGeoJSON helpers (P4 §8.4, G-1 … G-5) on the venues-navigation fixtures.
import { describe, it, expect } from 'vitest';
import { loadFixture } from '../../contract/fixtures';
import {
  extractPathNodesFromGeoJSON,
  extractPathSegmentsFromGeoJSON,
  extractPoisFromGeoJSON,
  extractZonesFromGeoJSON,
  type PathFeatureCollection,
  type POIFeatureCollection,
  type ZoneFeatureCollection,
} from '../../../src';

const bodyOf = <T>(name: string): T => loadFixture('venues-navigation', name).body as T;

/** A copy of `collection` with a feature of null geometry first (the server lets such features through). */
function withNullGeometry<C extends { features: { geometry: unknown }[] }>(collection: C): C {
  const [first] = collection.features;
  return { ...collection, features: [{ ...first, geometry: null }, ...collection.features] };
}

describe('extract*FromGeoJSON (G-1 … G-5)', () => {
  it('G-1: zones → flat zones (color from rgb_color, geometry kept); null geometry skipped', () => {
    const zones = bodyOf<ZoneFeatureCollection>('zones');
    const [z1, z2] = zones.features;
    const expected = [z1, z2].map((f) => ({
      id: f?.properties.id,
      name: f?.properties.name,
      level: f?.properties.level,
      color: f?.properties.rgb_color,
      tags: f?.properties.tags,
      type: f?.properties.type,
      geometry: f?.geometry,
    }));
    expect(extractZonesFromGeoJSON(zones)).toEqual(expected);
    expect(extractZonesFromGeoJSON(withNullGeometry(zones))).toEqual(expected);
    expect(expected[0]).toMatchObject({ id: 1287000038, color: '#2E79FF', type: 'map_zone' });
  });

  it('G-2: POIs → [lon, lat] to lat/lng; missing tags → []; null geometry skipped', () => {
    const pois = bodyOf<POIFeatureCollection>('pois');
    const flat = extractPoisFromGeoJSON(withNullGeometry(pois));
    expect(flat).toEqual([
      {
        id: 501,
        name: 'POI 1',
        description: 'Description 1',
        level: 0,
        color: '#3388ff',
        tags: ['exit', 'ground'],
        lat: 45.5001,
        lng: 4.5002,
      },
      {
        id: '65f0c0ffee0000000000a002',
        name: 'POI 2',
        description: undefined,
        level: 0,
        color: undefined,
        tags: [],
        lat: 45.5003,
        lng: 4.5005,
      },
    ]);
  });

  it('G-3: path nodes: segments ignored; poi_type, is_accessible, is_emergency_exit mapped; object connections kept', () => {
    const graph = bodyOf<PathFeatureCollection>('paths-object-connections');
    expect(extractPathNodesFromGeoJSON(withNullGeometry(graph))).toEqual([
      {
        id: 9001,
        externalId: 9001,
        nodeType: 'elevator',
        name: 'Node 9001',
        level: 0,
        isActive: true,
        crossLevelConnections: [{ target_node_id: 9101, connection_type: 'elevator' }, 9102],
        tags: ['lift'],
        lat: 45.5001,
        lng: 4.5001,
        poiType: 'elevator',
        isAccessible: true,
        isEmergencyExit: false,
      },
    ]);
    const live = extractPathNodesFromGeoJSON(bodyOf<PathFeatureCollection>('paths'));
    expect(live.map((n) => [n.poiType, n.isAccessible, n.isEmergencyExit])).toEqual([
      [undefined, undefined, undefined],
      [undefined, undefined, undefined],
      [undefined, undefined, undefined],
    ]);
  });

  it('G-4: path segments: nodes ignored; every field with the stored names; connection_type optional', () => {
    const graph = bodyOf<PathFeatureCollection>('paths-object-connections');
    expect(extractPathSegmentsFromGeoJSON(withNullGeometry(graph))).toEqual([
      {
        id: 9201,
        externalId: 9201,
        sourceNodeId: 9001,
        targetNodeId: 9002,
        level: 0,
        bidirectional: false,
        distance: 7.8,
        estimatedTime: 6.5,
        accessibility: { wheelchair: false, visual_impaired: true, hearing_impaired: true },
        penaltyFactor: 1.5,
        isActive: false,
        tags: ['ramp'],
        connectionType: 'stairs',
        coordinates: [
          [4.5001, 45.5001],
          [4.5002, 45.5001],
        ],
      },
    ]);
    const live = extractPathSegmentsFromGeoJSON(bodyOf<PathFeatureCollection>('paths'));
    expect(live).toHaveLength(2);
    expect(live.map((s) => s.connectionType)).toEqual([undefined, undefined]);
    expect(live[0]).toMatchObject({
      sourceNodeId: 656131045,
      targetNodeId: 83058115,
      bidirectional: true,
    });
  });

  it('G-5: collections without metadata and with total/hasMore are accepted', () => {
    const zones = bodyOf<ZoneFeatureCollection>('zones');
    const bare: ZoneFeatureCollection = {
      type: 'FeatureCollection',
      features: zones.features,
      total: 2,
      hasMore: false,
    };
    expect(extractZonesFromGeoJSON(bare)).toHaveLength(2);
    const pois = bodyOf<POIFeatureCollection>('pois');
    expect(
      extractPoisFromGeoJSON({ type: 'FeatureCollection', features: pois.features, total: 2 })
    ).toHaveLength(2);
    const graph = bodyOf<PathFeatureCollection>('paths-object-connections');
    expect(graph).toSatisfy((g: object) => !('metadata' in g));
    expect(extractPathNodesFromGeoJSON(graph)).toHaveLength(1);
    expect(extractPathSegmentsFromGeoJSON(graph)).toHaveLength(1);
    expect(extractZonesFromGeoJSON({ type: 'FeatureCollection', features: [] })).toEqual([]);
  });
});
