// The four GeoJSON extractors (P1 §8 geojson.test.ts) on FeatureCollections shaped like the live venue responses
// (P1 §9 L-G1). src/utils/geojson.ts is P4's file: these cases assert properties only (counts, colours, geometry
// kinds, coordinates order) and never deep-equal whole output objects, because P4 changes the output fields.
import { describe, expect, it } from 'vitest';
import {
  extractPathNodesFromGeoJSON,
  extractPathSegmentsFromGeoJSON,
  extractPoisFromGeoJSON,
  extractZonesFromGeoJSON,
} from '../../../../src';

const square = (x: number): number[][][] => [
  [
    [x, 0],
    [x, 1],
    [x + 1, 1],
    [x + 1, 0],
    [x, 0],
  ],
];

const zones = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      geometry: { type: 'Polygon', coordinates: square(0) },
      properties: {
        id: 1,
        name: 'Zone A',
        level: 0,
        rgb_color: '#ff0000',
        tags: ['a'],
        type: 'zone',
      },
    },
    {
      type: 'Feature',
      geometry: { type: 'Polygon', coordinates: square(2) },
      properties: { id: 2, name: 'Zone B', level: 1, rgb_color: '#00ff00', tags: [], type: 'zone' },
    },
  ],
};

const pois = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [2.35, 48.85] },
      properties: { id: 7, name: 'Desk', description: 'd', level: 0, color: '#0000ff', tags: [] },
    },
  ],
};

const paths = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [2.1, 48.1] },
      properties: {
        type: 'path_node',
        id: 'n1',
        external_id: 'x1',
        node_type: 'waypoint',
        level: 0,
      },
    },
    {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [2.2, 48.2] },
      properties: {
        type: 'path_node',
        id: 'n2',
        external_id: 'x2',
        node_type: 'waypoint',
        level: 0,
      },
    },
    {
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates: [
          [2.1, 48.1],
          [2.2, 48.2],
        ],
      },
      properties: {
        type: 'path_segment',
        id: 's1',
        source_node_id: 'n1',
        target_node_id: 'n2',
        level: 0,
      },
    },
  ],
};

const empty = { type: 'FeatureCollection', features: [] };

describe('extract*FromGeoJSON (0.2.0 behaviour, per property)', () => {
  it('zones: one per feature, rgb_color becomes color, the polygon geometry is kept', () => {
    const result = extractZonesFromGeoJSON(zones as never);
    expect(result).toHaveLength(2);
    expect(result.map((z) => z.color)).toEqual(['#ff0000', '#00ff00']);
    expect(result.every((z) => (z.geometry as { type: string }).type === 'Polygon')).toBe(true);
    expect(result.map((z) => z.id)).toEqual([1, 2]);
  });

  it('POIs: one per feature, lat and lng read from [lng, lat]', () => {
    const [poi, ...rest] = extractPoisFromGeoJSON(pois as never);
    expect(rest).toEqual([]);
    expect([poi?.lat, poi?.lng]).toEqual([48.85, 2.35]);
    expect(poi?.color).toBe('#0000ff');
  });

  it('path nodes keep only the Point (path_node) features', () => {
    const nodes = extractPathNodesFromGeoJSON(paths as never);
    expect(nodes.map((n) => n.id)).toEqual(['n1', 'n2']);
    expect(nodes.map((n) => [n.lat, n.lng])).toEqual([
      [48.1, 2.1],
      [48.2, 2.2],
    ]);
  });

  it('path segments keep only the LineString (path_segment) features', () => {
    const segments = extractPathSegmentsFromGeoJSON(paths as never);
    expect(segments).toHaveLength(1);
    expect([segments[0]?.sourceNodeId, segments[0]?.targetNodeId]).toEqual(['n1', 'n2']);
    expect(segments[0]?.coordinates).toHaveLength(2);
  });

  it('an empty collection gives [] for each extractor', () => {
    expect(extractZonesFromGeoJSON(empty as never)).toEqual([]);
    expect(extractPoisFromGeoJSON(empty as never)).toEqual([]);
    expect(extractPathNodesFromGeoJSON(empty as never)).toEqual([]);
    expect(extractPathSegmentsFromGeoJSON(empty as never)).toEqual([]);
  });
});
