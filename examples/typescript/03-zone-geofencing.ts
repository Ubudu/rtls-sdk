/**
 * 03 - Zone & Geofencing with Ubudu RTLS SDK
 *
 * This example demonstrates:
 * - Listing zones for a venue (GeoJSON format)
 * - Spatial queries (containing point, nearest, within radius)
 * - Zone presence detection
 * - Working with GeoJSON data
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
  type ZoneFeatureCollection,
  type Zone,
} from '@ubudu/rtls-sdk';

const NAMESPACE = process.env.APP_NAMESPACE!;
const API_KEY = process.env.RTLS_API_KEY!;

if (!NAMESPACE || !API_KEY) {
  console.error('Missing APP_NAMESPACE or RTLS_API_KEY in .env');
  process.exit(1);
}

const client = createRtlsClient({ apiKey: API_KEY });

console.log('Ubudu RTLS SDK - Zone & Geofencing Example\n');
console.log('==========================================\n');

// Store venue info for examples
let venueId: number | null = null;
let venueCoords: { lat: number; lng: number } | null = null;

// =============================================================================
// Example 1: Get Venue for Zone Operations
// =============================================================================

async function getFirstVenue(): Promise<void> {
  console.log('1. Getting First Venue');
  console.log(`   Endpoint: GET /venues/${NAMESPACE}\n`);

  const venues = await client.venues.list(NAMESPACE);

  if (venues.length === 0) {
    console.log('   No venues found. Create a venue first.\n');
    return;
  }

  const venue = venues[0] as {
    id: number;
    name: string;
    coordinates: { lat: number; lng: number };
  };

  venueId = venue.id;
  venueCoords = venue.coordinates;

  console.log(`   Venue: ${venue.name}`);
  console.log(`   ID: ${venueId}`);
  if (venueCoords) {
    console.log(`   Coordinates: (${venueCoords.lat}, ${venueCoords.lng})\n`);
  } else {
    console.log(`   Coordinates: N/A\n`);
  }
}

// =============================================================================
// Example 2: List Zones as GeoJSON
// =============================================================================

async function listZonesGeoJSON(): Promise<ZoneFeatureCollection | null> {
  if (!venueId) return null;

  console.log('2. Listing Zones as GeoJSON');
  console.log(`   Endpoint: GET /venues/${NAMESPACE}/${venueId}/zones\n`);

  const geoJson = await client.zones.list(NAMESPACE, venueId);

  console.log(`   GeoJSON Type: ${geoJson.type}`);
  console.log(`   Total Features: ${geoJson.features.length}`);
  if (geoJson.metadata) {
    console.log(`   Metadata: ${JSON.stringify(geoJson.metadata)}\n`);
  }

  if (geoJson.features.length > 0) {
    const first = geoJson.features[0];
    console.log('   First Zone (GeoJSON Feature):');
    console.log(`   - Type: ${first.type}`);
    console.log(`   - Geometry: ${first.geometry.type}`);
    console.log(`   - Properties: ${first.properties.name} (ID: ${first.properties.id})`);
    console.log(`   - Level: ${first.properties.level}`);
    console.log(`   - Color: ${first.properties.rgb_color}\n`);
  }

  return geoJson;
}

// =============================================================================
// Example 3: List Zones as Flat Array
// =============================================================================

async function listZonesArray(): Promise<Zone[]> {
  if (!venueId) return [];

  console.log('3. Listing Zones as Flat Array');
  console.log('   Method: client.zones.listAsArray()\n');

  const zones = await client.zones.listAsArray(NAMESPACE, venueId);

  console.log(`   Total Zones: ${zones.length}\n`);

  zones.slice(0, 3).forEach((zone, i) => {
    console.log(`   Zone ${i + 1}: ${zone.name}`);
    console.log(`   - ID: ${zone.id}`);
    console.log(`   - Type: ${zone.type}`);
    console.log(`   - Level: ${zone.level}`);
    console.log(`   - Color: ${zone.color}\n`);
  });

  return zones;
}

// =============================================================================
// Example 4: Extract Zones from GeoJSON (Utility)
// =============================================================================

async function extractZonesDemo(geoJson: ZoneFeatureCollection | null): Promise<void> {
  if (!geoJson) return;

  console.log('4. Extracting Zones from GeoJSON (Utility)');
  console.log('   Using: extractZonesFromGeoJSON()\n');

  const zones = extractZonesFromGeoJSON(geoJson);
  console.log(`   Extracted ${zones.length} zones from GeoJSON`);

  if (zones.length > 0) {
    console.log(`   First zone: ${zones[0].name}`);
    console.log(`   Has geometry: ${zones[0].geometry ? 'yes' : 'no'}\n`);
  }
}

// =============================================================================
// Example 5: Spatial Query - Zones Containing Point
// =============================================================================

async function zonesContainingPoint(): Promise<void> {
  if (!venueCoords) {
    console.log('5. Spatial Query: Zones Containing Point');
    console.log('   Skipped - no venue coordinates available\n');
    return;
  }

  console.log('5. Spatial Query: Zones Containing Point');
  console.log(`   Endpoint: GET /spatial/zones/${NAMESPACE}/containing-point\n`);

  const result = await client.spatial.zonesContainingPoint(NAMESPACE, {
    lat: venueCoords.lat,
    lon: venueCoords.lng,
  });

  console.log('   Result:');
  console.log(`   - Reference Point: (${result.reference_point.lat}, ${result.reference_point.lon})`);
  console.log(`   - Level: ${result.level ?? 'all'}`);
  console.log(`   - Containing Zones: ${result.total}`);

  if (result.containing_zones.length > 0) {
    result.containing_zones.forEach((zone) => {
      console.log(`     - ${zone.name} (ID: ${zone.id})`);
    });
  }
  console.log();
}

// =============================================================================
// Example 6: Spatial Query - Nearest Zones
// =============================================================================

async function nearestZones(): Promise<void> {
  if (!venueCoords) {
    console.log('6. Spatial Query: Nearest Zones');
    console.log('   Skipped - no venue coordinates available\n');
    return;
  }

  console.log('6. Spatial Query: Nearest Zones');
  console.log(`   Endpoint: GET /spatial/zones/${NAMESPACE}/nearest-to-point\n`);

  const result = await client.spatial.nearestZones(NAMESPACE, {
    lat: venueCoords.lat,
    lon: venueCoords.lng,
    limit: 5,
  });

  console.log('   Result:');
  console.log(`   - Reference Point: (${result.reference_point.lat}, ${result.reference_point.lon})`);
  console.log(`   - Total Zones: ${result.total_zones}`);
  console.log(`   - Has More: ${result.hasMore}`);

  if (result.zones.length > 0) {
    console.log('   - Nearest Zones:');
    result.zones.forEach((zone) => {
      const distance = zone.distance_meters?.toFixed(1) ?? 'N/A';
      console.log(`     - ${zone.name}: ${distance}m`);
    });
  }
  console.log();
}

// =============================================================================
// Example 7: Spatial Query - Zones Within Radius
// =============================================================================

async function zonesWithinRadius(): Promise<void> {
  if (!venueCoords) {
    console.log('7. Spatial Query: Zones Within Radius');
    console.log('   Skipped - no venue coordinates available\n');
    return;
  }

  console.log('7. Spatial Query: Zones Within Radius');
  console.log(`   Endpoint: GET /spatial/zones/${NAMESPACE}/within-radius\n`);

  const result = await client.spatial.zonesWithinRadius(NAMESPACE, {
    lat: venueCoords.lat,
    lon: venueCoords.lng,
    radiusMeters: 500, // 500 meter radius
  });

  console.log('   Result:');
  console.log(`   - Reference Point: (${result.reference_point.lat}, ${result.reference_point.lon})`);
  console.log(`   - Radius: ${result.radius_meters}m`);
  console.log(`   - Total Zones: ${result.total_zones}`);

  if (result.zones.length > 0) {
    console.log('   - Zones in radius:');
    result.zones.slice(0, 5).forEach((zone) => {
      console.log(`     - ${zone.name}`);
    });
  }
  console.log();
}

// =============================================================================
// Example 8: Zone Presence Data
// =============================================================================

async function zonePresence(): Promise<void> {
  console.log('8. Zone Presence Data');
  console.log(`   Endpoint: GET /es/zone_presence/${NAMESPACE}\n`);

  const endTime = Date.now();
  const startTime = endTime - 60 * 60 * 1000; // Last hour

  try {
    const presence = await client.zones.getPresence(NAMESPACE, {
      timestampFrom: startTime,
      timestampTo: endTime,
      interval: '5m',
    });

    console.log(`   Presence records (last hour): ${presence.length}`);

    if (presence.length > 0) {
      console.log('   Sample record:', JSON.stringify(presence[0], null, 2).slice(0, 200));
    }
  } catch (error) {
    if (error instanceof RtlsError) {
      console.log(`   Presence data not available: ${error.message}`);
    } else {
      throw error;
    }
  }
  console.log();
}

// =============================================================================
// Example 9: Iterate Through Zones
// =============================================================================

async function iterateZones(): Promise<void> {
  if (!venueId) return;

  console.log('9. Iterating Through Zones');
  console.log('   Using: client.zones.iterate()\n');

  let count = 0;
  for await (const zone of client.zones.iterate(NAMESPACE, venueId)) {
    console.log(`   [${count + 1}] ${zone.name} (Level ${zone.level})`);
    count++;
    if (count >= 5) {
      console.log('   ... (showing first 5)');
      break;
    }
  }
  console.log();
}

// =============================================================================
// Main Execution
// =============================================================================

async function main(): Promise<void> {
  try {
    await getFirstVenue();

    const geoJson = await listZonesGeoJSON();
    await listZonesArray();
    await extractZonesDemo(geoJson);

    await zonesContainingPoint();
    await nearestZones();
    await zonesWithinRadius();

    await zonePresence();
    await iterateZones();

    console.log('==========================================');
    console.log('Zone & geofencing example completed!');
  } catch (error) {
    console.error('Example failed:', error);
    process.exit(1);
  }
}

main();
