/**
 * 04 - Navigation & Wayfinding with Ubudu RTLS SDK
 *
 * This example demonstrates:
 * - Listing POIs (Points of Interest)
 * - Working with navigation paths
 * - Path nodes and segments
 * - Indoor routing concepts
 */

import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../../.env') });

import {
  createRtlsClient,
  RtlsError,
  extractPoisFromGeoJSON,
  extractPathNodesFromGeoJSON,
  extractPathSegmentsFromGeoJSON,
  type POIFeatureCollection,
  type PathFeatureCollection,
} from '@ubudu/rtls-sdk';

const NAMESPACE = process.env.APP_NAMESPACE!;
const API_KEY = process.env.RTLS_API_KEY!;

if (!NAMESPACE || !API_KEY) {
  console.error('Missing APP_NAMESPACE or RTLS_API_KEY in .env');
  process.exit(1);
}

// Create client with default namespace
const client = createRtlsClient({
  apiKey: API_KEY,
  namespace: NAMESPACE, // Default namespace for all calls
});

console.log('Ubudu RTLS SDK - Navigation Example\n');
console.log('====================================\n');

let venueId: number | null = null;
let venueCoords: { lat: number; lng: number } | null = null;

// =============================================================================
// Example 1: Get Venue
// =============================================================================

async function getFirstVenue(): Promise<void> {
  console.log('1. Getting First Venue');
  console.log(`   Endpoint: GET /venues/${NAMESPACE}\n`);

  const venues = await client.venues.list();

  if (venues.length === 0) {
    console.log('   No venues found.\n');
    return;
  }

  const venue = venues[0] as {
    id: number;
    name: string;
    coordinates: { lat: number; lng: number };
  };

  venueId = venue.id;
  venueCoords = venue.coordinates;

  console.log(`   Venue: ${venue.name} (ID: ${venueId})\n`);
}

// =============================================================================
// Example 2: List POIs as GeoJSON
// =============================================================================

async function listPoisGeoJSON(): Promise<POIFeatureCollection | null> {
  if (!venueId) return null;

  console.log('2. Listing POIs as GeoJSON');
  console.log(`   Endpoint: GET /venues/${NAMESPACE}/${venueId}/pois\n`);

  const geoJson = await client.venues.listPois({ venueId });

  console.log(`   GeoJSON Type: ${geoJson.type}`);
  console.log(`   Total Features: ${geoJson.features.length}`);

  if (geoJson.features.length > 0) {
    const first = geoJson.features[0];
    console.log('\n   First POI (GeoJSON Feature):');
    console.log(`   - Name: ${first.properties.name}`);
    console.log(`   - Description: ${first.properties.description || 'N/A'}`);
    console.log(`   - Level: ${first.properties.level}`);
    console.log(`   - Coordinates: [${first.geometry.coordinates}]`);
  }
  console.log();

  return geoJson;
}

// =============================================================================
// Example 3: List POIs as Flat Array
// =============================================================================

async function listPoisArray(): Promise<void> {
  if (!venueId) return;

  console.log('3. Listing POIs as Flat Array');
  console.log('   Method: client.venues.listPoisAsArray()\n');

  const pois = await client.venues.listPoisAsArray({ venueId });

  console.log(`   Total POIs: ${pois.length}`);

  pois.slice(0, 3).forEach((poi, i) => {
    console.log(`\n   POI ${i + 1}: ${poi.name}`);
    console.log(`   - ID: ${poi.id}`);
    console.log(`   - Location: (${poi.lat}, ${poi.lng})`);
    console.log(`   - Level: ${poi.level}`);
    console.log(`   - Tags: ${poi.tags.join(', ') || 'none'}`);
  });
  console.log();
}

// =============================================================================
// Example 4: Nearest POIs (Spatial Query)
// =============================================================================

async function nearestPois(): Promise<void> {
  if (!venueCoords) {
    console.log('4. Spatial Query: Nearest POIs');
    console.log('   Skipped - no venue coordinates available\n');
    return;
  }

  console.log('4. Spatial Query: Nearest POIs');
  console.log(`   Endpoint: GET /spatial/pois/${NAMESPACE}/nearest-to-point\n`);

  try {
    // Uses default namespace from client config
    const result = await client.spatial.nearestPois({
      lat: venueCoords.lat,
      lon: venueCoords.lng,
      limit: 5,
    });

    console.log(`   Reference Point: (${result.reference_point.lat}, ${result.reference_point.lon})`);
    console.log(`   Total POIs: ${result.total_pois}`);
    console.log(`   Has More: ${result.hasMore}`);

    if (result.pois.length > 0) {
      console.log('\n   Nearest POIs:');
      result.pois.forEach((poi) => {
        const distance = poi.distance_meters?.toFixed(1) ?? 'N/A';
        console.log(`   - ${poi.name}: ${distance}m`);
      });
    }
  } catch (error) {
    if (error instanceof RtlsError) {
      console.log(`   Query failed: ${error.message}`);
    } else {
      throw error;
    }
  }
  console.log();
}

// =============================================================================
// Example 5: POIs Within Radius
// =============================================================================

async function poisWithinRadius(): Promise<void> {
  if (!venueCoords) {
    console.log('5. Spatial Query: POIs Within Radius');
    console.log('   Skipped - no venue coordinates available\n');
    return;
  }

  console.log('5. Spatial Query: POIs Within Radius');
  console.log(`   Endpoint: GET /spatial/pois/${NAMESPACE}/within-radius\n`);

  try {
    // Uses default namespace from client config
    const result = await client.spatial.poisWithinRadius({
      lat: venueCoords.lat,
      lon: venueCoords.lng,
      radiusMeters: 200,
    });

    console.log(`   Radius: ${result.radius_meters}m`);
    console.log(`   POIs found: ${result.total_pois}`);

    if (result.pois.length > 0) {
      console.log('\n   POIs in radius:');
      result.pois.forEach((poi) => {
        console.log(`   - ${poi.name}`);
      });
    }
  } catch (error) {
    if (error instanceof RtlsError) {
      console.log(`   Query failed: ${error.message}`);
    } else {
      throw error;
    }
  }
  console.log();
}

// =============================================================================
// Example 6: List Navigation Paths (GeoJSON)
// =============================================================================

async function listPaths(): Promise<PathFeatureCollection | null> {
  if (!venueId) return null;

  console.log('6. Listing Navigation Paths (GeoJSON)');
  console.log(`   Endpoint: GET /venues/${NAMESPACE}/${venueId}/paths\n`);

  const geoJson = await client.venues.listPaths({ venueId });

  console.log(`   GeoJSON Type: ${geoJson.type}`);
  console.log(`   Total Features: ${geoJson.features.length}`);

  // Count nodes vs segments
  const nodes = geoJson.features.filter((f) => f.properties.type === 'path_node');
  const segments = geoJson.features.filter((f) => f.properties.type === 'path_segment');

  console.log(`   - Path Nodes: ${nodes.length}`);
  console.log(`   - Path Segments: ${segments.length}`);

  if (nodes.length > 0) {
    const firstNode = nodes[0];
    const props = firstNode.properties as { id: number; name?: string; node_type?: string; level: number };
    console.log('\n   First Path Node:');
    console.log(`   - ID: ${props.id}`);
    console.log(`   - Name: ${props.name ?? 'N/A'}`);
    console.log(`   - Node Type: ${props.node_type ?? 'N/A'}`);
    console.log(`   - Level: ${props.level}`);
  }
  console.log();

  return geoJson;
}

// =============================================================================
// Example 7: Extract Path Nodes and Segments
// =============================================================================

async function extractPathData(): Promise<void> {
  if (!venueId) return;

  console.log('7. Extracting Path Nodes and Segments');
  console.log('   Using: client.venues.listPathNodes() / listPathSegments()\n');

  const nodes = await client.venues.listPathNodes({ venueId });
  const segments = await client.venues.listPathSegments({ venueId });

  console.log(`   Path Nodes: ${nodes.length}`);
  console.log(`   Path Segments: ${segments.length}`);

  if (nodes.length > 0) {
    const node = nodes[0];
    console.log('\n   Sample Node:');
    console.log(`   - ID: ${node.id}`);
    console.log(`   - Name: ${node.name}`);
    console.log(`   - Type: ${node.nodeType}`);
    console.log(`   - Location: (${node.lat}, ${node.lng})`);
    console.log(`   - Level: ${node.level}`);
    console.log(`   - Active: ${node.isActive}`);
  }

  if (segments.length > 0) {
    const segment = segments[0];
    console.log('\n   Sample Segment:');
    console.log(`   - ID: ${segment.id}`);
    console.log(`   - Start Node: ${segment.startNodeId}`);
    console.log(`   - End Node: ${segment.endNodeId}`);
    console.log(`   - Bidirectional: ${segment.isBidirectional}`);
    console.log(`   - Weight: ${segment.weight}`);
  }
  console.log();
}

// =============================================================================
// Example 8: Navigation API (Concept)
// =============================================================================

async function navigationConcept(): Promise<void> {
  console.log('8. Navigation API (Concept Overview)');
  console.log('   Available methods for indoor routing:\n');

  console.log('   client.navigation.shortestPath(namespace, request)');
  console.log('   - Find shortest path between two points');
  console.log('   - Request: { from: { lat, lon }, to: { lat, lon } }\n');

  console.log('   client.navigation.accessiblePath(namespace, request)');
  console.log('   - Find wheelchair-accessible path');
  console.log('   - Avoids stairs and inaccessible areas\n');

  console.log('   client.navigation.multiStop(namespace, request)');
  console.log('   - Plan route with multiple waypoints');
  console.log('   - Optimizes visit order\n');

  console.log('   Note: These require path data to be configured for the venue.\n');
}

// =============================================================================
// Example 9: Extract Utilities Demo
// =============================================================================

async function extractUtilitiesDemo(): Promise<void> {
  if (!venueId) return;

  console.log('9. GeoJSON Extraction Utilities');
  console.log('   Using: extractPoisFromGeoJSON(), extractPathNodesFromGeoJSON()\n');

  const poisGeoJson = await client.venues.listPois({ venueId });
  const pathsGeoJson = await client.venues.listPaths({ venueId });

  const pois = extractPoisFromGeoJSON(poisGeoJson);
  const pathNodes = extractPathNodesFromGeoJSON(pathsGeoJson);
  const pathSegments = extractPathSegmentsFromGeoJSON(pathsGeoJson);

  console.log('   Extracted from GeoJSON:');
  console.log(`   - POIs: ${pois.length}`);
  console.log(`   - Path Nodes: ${pathNodes.length}`);
  console.log(`   - Path Segments: ${pathSegments.length}\n`);
}

// =============================================================================
// Main Execution
// =============================================================================

async function main(): Promise<void> {
  try {
    await getFirstVenue();
    await listPoisGeoJSON();
    await listPoisArray();
    await nearestPois();
    await poisWithinRadius();
    await listPaths();
    await extractPathData();
    await navigationConcept();
    await extractUtilitiesDemo();

    console.log('====================================');
    console.log('Navigation example completed!');
  } catch (error) {
    console.error('Example failed:', error);
    process.exit(1);
  }
}

main();
