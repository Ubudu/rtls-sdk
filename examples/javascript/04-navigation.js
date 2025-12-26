/**
 * 04 - Navigation & Wayfinding with Ubudu RTLS SDK
 *
 * This example covers:
 * - Listing POIs (Points of Interest)
 * - Working with navigation paths
 * - Path nodes and segments
 * - Spatial queries for POIs
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
} from '@ubudu/rtls-sdk';

// =============================================================================
// Configuration
// =============================================================================

const NAMESPACE = process.env.APP_NAMESPACE;
const API_KEY = process.env.RTLS_API_KEY;

if (!NAMESPACE || !API_KEY) {
  console.error('Missing APP_NAMESPACE or RTLS_API_KEY in .env');
  process.exit(1);
}

const client = createRtlsClient({
  apiKey: API_KEY,
  namespace: NAMESPACE,
});

console.log('Ubudu RTLS SDK - Navigation & Wayfinding\n');

let venueCoords = null;

// =============================================================================
// 1. Get Venue
// =============================================================================

async function getVenue() {
  console.log('1. Getting Venue...');

  const venues = await client.venues.list();
  if (venues.length === 0) {
    console.log('   No venues found');
    return false;
  }

  const venue = venues[0];
  venueCoords = venue.coordinates;

  // Set default venue for subsequent calls
  client.setVenue(venue.id);

  console.log(`   Venue: ${venue.name} (ID: ${venue.id})`);
  return true;
}

// =============================================================================
// 2. List POIs (GeoJSON)
// =============================================================================

async function listPoisGeoJSON() {
  console.log('\n2. Listing POIs (GeoJSON)...');

  const geoJson = await client.venues.listPois();
  console.log(`   Features: ${geoJson.features.length}`);

  if (geoJson.features.length > 0) {
    const first = geoJson.features[0];
    console.log(`   First: ${first.properties.name} (${first.geometry.type})`);
  }

  return geoJson;
}

// =============================================================================
// 3. List POIs (Flat Array)
// =============================================================================

async function listPoisArray() {
  console.log('\n3. Listing POIs (Array)...');

  const pois = await client.venues.listPoisAsArray();
  console.log(`   Total: ${pois.length} POI(s)`);

  pois.slice(0, 3).forEach((poi) => {
    console.log(`   - ${poi.name} (Level ${poi.level})`);
  });
}

// =============================================================================
// 4. Nearest POIs
// =============================================================================

async function nearestPois() {
  if (!venueCoords) return;

  console.log('\n4. Nearest POIs...');

  try {
    const result = await client.spatial.nearestPois({
      lat: venueCoords.lat,
      lon: venueCoords.lng,
      limit: 5,
    });

    console.log(`   Found: ${result.total_pois} POI(s)`);

    result.pois.slice(0, 3).forEach((poi) => {
      const dist = poi.distance_meters?.toFixed(1) ?? 'N/A';
      console.log(`   - ${poi.name}: ${dist}m`);
    });
  } catch (error) {
    if (error instanceof RtlsError) {
      console.log(`   Not available: ${error.message}`);
    } else {
      throw error;
    }
  }
}

// =============================================================================
// 5. POIs Within Radius
// =============================================================================

async function poisWithinRadius() {
  if (!venueCoords) return;

  console.log('\n5. POIs Within 200m Radius...');

  try {
    const result = await client.spatial.poisWithinRadius({
      lat: venueCoords.lat,
      lon: venueCoords.lng,
      radiusMeters: 200,
    });

    console.log(`   Found: ${result.total_pois} POI(s)`);

    result.pois.slice(0, 3).forEach((poi) => {
      console.log(`   - ${poi.name}`);
    });
  } catch (error) {
    if (error instanceof RtlsError) {
      console.log(`   Not available: ${error.message}`);
    } else {
      throw error;
    }
  }
}

// =============================================================================
// 6. List Navigation Paths
// =============================================================================

async function listPaths() {
  console.log('\n6. Listing Navigation Paths...');

  const geoJson = await client.venues.listPaths();

  const nodes = geoJson.features.filter((f) => f.properties.type === 'path_node');
  const segments = geoJson.features.filter((f) => f.properties.type === 'path_segment');

  console.log(`   Path Nodes: ${nodes.length}`);
  console.log(`   Path Segments: ${segments.length}`);

  return geoJson;
}

// =============================================================================
// 7. Extract Path Data
// =============================================================================

async function extractPathData() {
  console.log('\n7. Extracting Path Nodes and Segments...');

  const nodes = await client.venues.listPathNodes();
  const segments = await client.venues.listPathSegments();

  console.log(`   Nodes: ${nodes.length}`);
  console.log(`   Segments: ${segments.length}`);

  if (nodes.length > 0) {
    const node = nodes[0];
    console.log(`   First node: ${node.name} (${node.nodeType})`);
  }
}

// =============================================================================
// 8. GeoJSON Extraction Utilities
// =============================================================================

async function extractUtilities() {
  console.log('\n8. GeoJSON Extraction Utilities...');

  const poisGeoJson = await client.venues.listPois();
  const pathsGeoJson = await client.venues.listPaths();

  const pois = extractPoisFromGeoJSON(poisGeoJson);
  const pathNodes = extractPathNodesFromGeoJSON(pathsGeoJson);
  const pathSegments = extractPathSegmentsFromGeoJSON(pathsGeoJson);

  console.log(`   Extracted POIs: ${pois.length}`);
  console.log(`   Extracted Nodes: ${pathNodes.length}`);
  console.log(`   Extracted Segments: ${pathSegments.length}`);
}

// =============================================================================
// Main
// =============================================================================

async function main() {
  try {
    const hasVenue = await getVenue();

    if (hasVenue) {
      await listPoisGeoJSON();
      await listPoisArray();
      await nearestPois();
      await poisWithinRadius();
      await listPaths();
      await extractPathData();
      await extractUtilities();
    }

    console.log('\nDone!');
  } catch (error) {
    console.error('Failed:', error.message);
    process.exit(1);
  }
}

main();
