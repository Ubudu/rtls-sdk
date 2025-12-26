/**
 * 03 - Zones & Geofencing with Ubudu RTLS SDK
 *
 * This example covers:
 * - Listing zones (GeoJSON and flat array)
 * - Spatial queries (containing point, nearest, within radius)
 * - Zone presence data
 */

import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../../.env') });

import {
  createRtlsClient,
  RtlsError,
  extractZonesFromGeoJSON,
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

console.log('Ubudu RTLS SDK - Zones & Geofencing\n');

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
// 2. List Zones (GeoJSON)
// =============================================================================

async function listZonesGeoJSON() {
  console.log('\n2. Listing Zones (GeoJSON)...');

  const geoJson = await client.zones.list();
  console.log(`   Features: ${geoJson.features.length}`);

  if (geoJson.features.length > 0) {
    const first = geoJson.features[0];
    console.log(`   First: ${first.properties.name} (${first.geometry.type})`);
  }

  return geoJson;
}

// =============================================================================
// 3. List Zones (Flat Array)
// =============================================================================

async function listZonesArray() {
  console.log('\n3. Listing Zones (Array)...');

  const zones = await client.zones.listAsArray();
  console.log(`   Total: ${zones.length} zone(s)`);

  zones.slice(0, 3).forEach((zone) => {
    console.log(`   - ${zone.name} (Level ${zone.level})`);
  });
}

// =============================================================================
// 4. Extract Zones from GeoJSON
// =============================================================================

async function extractZones(geoJson) {
  console.log('\n4. Extracting Zones from GeoJSON...');

  const zones = extractZonesFromGeoJSON(geoJson);
  console.log(`   Extracted: ${zones.length} zone(s)`);
}

// =============================================================================
// 5. Zones Containing Point
// =============================================================================

async function zonesContainingPoint() {
  if (!venueCoords) return;

  console.log('\n5. Zones Containing Point...');

  const result = await client.spatial.zonesContainingPoint({
    lat: venueCoords.lat,
    lon: venueCoords.lng,
  });

  console.log(`   Point: (${result.reference_point.lat}, ${result.reference_point.lon})`);
  console.log(`   Containing zones: ${result.total}`);

  result.containing_zones.slice(0, 3).forEach((zone) => {
    console.log(`   - ${zone.name}`);
  });
}

// =============================================================================
// 6. Nearest Zones
// =============================================================================

async function nearestZones() {
  if (!venueCoords) return;

  console.log('\n6. Nearest Zones...');

  const result = await client.spatial.nearestZones({
    lat: venueCoords.lat,
    lon: venueCoords.lng,
    limit: 5,
  });

  console.log(`   Found: ${result.total_zones} zone(s)`);

  result.zones.slice(0, 3).forEach((zone) => {
    const dist = zone.distance_meters?.toFixed(1) ?? 'N/A';
    console.log(`   - ${zone.name}: ${dist}m`);
  });
}

// =============================================================================
// 7. Zones Within Radius
// =============================================================================

async function zonesWithinRadius() {
  if (!venueCoords) return;

  console.log('\n7. Zones Within 500m Radius...');

  const result = await client.spatial.zonesWithinRadius({
    lat: venueCoords.lat,
    lon: venueCoords.lng,
    radiusMeters: 500,
  });

  console.log(`   Found: ${result.total_zones} zone(s)`);

  result.zones.slice(0, 3).forEach((zone) => {
    console.log(`   - ${zone.name}`);
  });
}

// =============================================================================
// 8. Zone Presence
// =============================================================================

async function zonePresence() {
  console.log('\n8. Zone Presence (last hour)...');

  const endTime = Date.now();
  const startTime = endTime - 60 * 60 * 1000;

  try {
    const presence = await client.zones.getPresence({
      timestampFrom: startTime,
      timestampTo: endTime,
      interval: '5m',
    });
    console.log(`   Records: ${presence.length}`);
  } catch (error) {
    if (error instanceof RtlsError) {
      console.log(`   Not available: ${error.message}`);
    } else {
      throw error;
    }
  }
}

// =============================================================================
// Main
// =============================================================================

async function main() {
  try {
    const hasVenue = await getVenue();

    if (hasVenue) {
      const geoJson = await listZonesGeoJSON();
      await listZonesArray();
      await extractZones(geoJson);
      await zonesContainingPoint();
      await nearestZones();
      await zonesWithinRadius();
      await zonePresence();
    }

    console.log('\nDone!');
  } catch (error) {
    console.error('Failed:', error.message);
    process.exit(1);
  }
}

main();
