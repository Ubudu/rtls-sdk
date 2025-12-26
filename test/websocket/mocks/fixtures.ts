/**
 * Test Fixtures for WebSocket Tests
 *
 * Provides consistent test data for all WebSocket tests.
 */

import type {
  PositionMessage,
  ZoneEntryExitMessage,
  ZoneStatsMessage,
  AlertMessage,
  AssetMessage,
  SubscriptionConfirmation,
} from '../../../src/websocket';

// Re-export fixtures from main types for convenience
export {
  POSITION_MESSAGE_FIXTURE,
  ZONE_ENTRY_FIXTURE,
  ZONE_STATS_FIXTURE,
  ALERT_MESSAGE_FIXTURE,
  ASSET_UPDATE_FIXTURE,
  ASSET_DELETE_FIXTURE,
  SUBSCRIPTION_CONFIRMATION_STANDARD,
  SUBSCRIPTION_CONFIRMATION_ALT,
} from '../../../src/websocket/types';

/** Test configuration */
export const TEST_CONFIG = {
  apiKey: 'test-api-key',
  namespace: 'test-namespace',
  mapUuid: 'test-map-uuid',
  subscriberUrl: 'wss://test.example.com/ws/subscriber',
  publisherUrl: 'wss://test.example.com/ws/publisher',
};

/** Create a position message with custom values */
export function createPositionMessage(overrides: Partial<PositionMessage> = {}): PositionMessage {
  return {
    app_namespace: TEST_CONFIG.namespace,
    lat: 48.8584,
    lon: 2.2945,
    user_uuid: 'aabbccddeeff',
    user_udid: 'aabbccddeeff',
    user_name: 'Test-Asset-001',
    user_type: 'tag',
    model: 'GenericTag',
    map_uuid: TEST_CONFIG.mapUuid,
    timestamp: Date.now(),
    color: '#FF0000',
    origin: 4,
    ...overrides,
  };
}

/** Create a zone entry message with custom values */
export function createZoneEntryMessage(overrides: Partial<ZoneEntryExitMessage> = {}): ZoneEntryExitMessage {
  return {
    app_namespace: TEST_CONFIG.namespace,
    map_uuid: TEST_CONFIG.mapUuid,
    event_type: 'ENTER_ZONE',
    zone: {
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        coordinates: [[[2.3795, 48.6187], [2.3796, 48.6187], [2.3796, 48.6188], [2.3795, 48.6188], [2.3795, 48.6187]]]
      },
      properties: {
        id: 12345,
        name: 'Test-Zone',
        level: 0,
        rgb_color: '#2eff9d',
        tags: ['test'],
        type: 'map_zone'
      }
    },
    user_uuid: 'aabbccddeeff',
    user_name: 'Test-Asset',
    user_type: 'tag',
    timestamp: Date.now(),
    ...overrides,
  };
}

/** Create a zone exit message */
export function createZoneExitMessage(overrides: Partial<ZoneEntryExitMessage> = {}): ZoneEntryExitMessage {
  return createZoneEntryMessage({
    event_type: 'EXIT_ZONE',
    ...overrides,
  });
}

/** Create a zone stats message */
export function createZoneStatsMessage(overrides: Partial<ZoneStatsMessage> = {}): ZoneStatsMessage {
  return {
    app_namespace: TEST_CONFIG.namespace,
    event_type: 'UPDATE_ZONE_COUNTER',
    zone_id: 12345,
    zone_name: 'Test-Zone',
    total_count: 10,
    tag_count: 8,
    mobile_count: 2,
    avg_time_seconds: 300,
    timestamp: Date.now(),
    ...overrides,
  };
}

/** Create an alert message */
export function createAlertMessage(overrides: Partial<AlertMessage> = {}): AlertMessage {
  return {
    app_namespace: TEST_CONFIG.namespace,
    map_uuid: TEST_CONFIG.mapUuid,
    event_type: 'NOTIFICATION',
    action: 'notifyEvent',
    user_uuid: 'aabbccddeeff',
    user_type: 'tag',
    params: {
      style: 'warning',
      title: 'Test Alert',
      text: 'This is a test alert',
      duration: 5000,
      priority: 'normal',
    },
    timestamp: Date.now(),
    ...overrides,
  };
}

/** Create an asset update message */
export function createAssetUpdateMessage(overrides: Partial<AssetMessage> = {}): AssetMessage {
  return {
    action: 'update',
    app_namespace: TEST_CONFIG.namespace,
    mac_address: 'aabbccddeeff',
    type: 'assets',
    data: {
      user_name: 'Test-Asset',
      user_type: 'tag',
      color: '#FF0000',
      model: 'GenericTag',
    },
    ...overrides,
  };
}

/** Create an asset delete message */
export function createAssetDeleteMessage(macAddress: string = 'aabbccddeeff'): AssetMessage {
  return {
    action: 'delete',
    app_namespace: TEST_CONFIG.namespace,
    mac_address: macAddress,
    type: 'assets',
  };
}

/** Create a subscription confirmation */
export function createSubscriptionConfirmation(
  types?: string[],
  format: 'standard' | 'alt' = 'standard'
): SubscriptionConfirmation {
  if (format === 'alt') {
    return {
      action: 'subscribeEvent',
      app_namespace: TEST_CONFIG.namespace,
    };
  }

  return {
    type: 'SUBSCRIPTION_CONFIRMATION',
    types: types as SubscriptionConfirmation['types'],
    app_namespace: TEST_CONFIG.namespace,
  };
}

/** Create multiple position messages for batch testing */
export function createPositionBatch(count: number): PositionMessage[] {
  return Array.from({ length: count }, (_, i) => createPositionMessage({
    user_uuid: `device${i.toString().padStart(12, '0')}`,
    user_name: `Device-${i}`,
    lat: 48.8584 + (i * 0.0001),
    lon: 2.2945 + (i * 0.0001),
  }));
}
