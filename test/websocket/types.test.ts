/**
 * Type Guards and Utilities Unit Tests
 */

import { describe, it, expect } from 'vitest';
import {
  // Type guards
  isPositionMessage,
  isZoneEntryExitMessage,
  isZoneStatsMessage,
  isAlertMessage,
  isAssetMessage,
  isSubscriptionConfirmation,
  classifyMessage,

  // MAC address utilities
  normalizeMacAddress,
  isValidMacAddress,

  // Reconnection utilities
  calculateReconnectDelay,
  DEFAULT_RECONNECTION_STRATEGY,

  // Subscription type
  SubscriptionType,
} from '../../src/websocket';

import {
  createPositionMessage,
  createZoneEntryMessage,
  createZoneStatsMessage,
  createAlertMessage,
  createAssetUpdateMessage,
  createSubscriptionConfirmation,
} from './mocks/fixtures';

describe('Type Guards', () => {
  describe('isPositionMessage()', () => {
    it('should return true for position message with type field', () => {
      const msg = createPositionMessage({ type: 'POSITIONS' });
      expect(isPositionMessage(msg)).toBe(true);
    });

    it('should return true for position message with lat/lon and user_uuid', () => {
      const msg = createPositionMessage();
      delete (msg as Record<string, unknown>).type;
      expect(isPositionMessage(msg)).toBe(true);
    });

    it('should return true for position message with lat/lon and user_udid', () => {
      const msg = { lat: 48.8, lon: 2.3, user_udid: 'abc123' };
      expect(isPositionMessage(msg)).toBe(true);
    });

    it('should return false for non-position messages', () => {
      expect(isPositionMessage({ type: 'OTHER' })).toBe(false);
      expect(isPositionMessage({ lat: 48.8 })).toBe(false); // Missing lon and user
      expect(isPositionMessage(null)).toBe(false);
      expect(isPositionMessage(undefined)).toBe(false);
      expect(isPositionMessage('string')).toBe(false);
    });
  });

  describe('isZoneEntryExitMessage()', () => {
    it('should return true for zone entry message with type field', () => {
      const msg = createZoneEntryMessage({ type: 'ZONES_ENTRIES_EVENTS' });
      expect(isZoneEntryExitMessage(msg)).toBe(true);
    });

    it('should return true for ENTER_ZONE event_type', () => {
      const msg = createZoneEntryMessage({ event_type: 'ENTER_ZONE' });
      expect(isZoneEntryExitMessage(msg)).toBe(true);
    });

    it('should return true for EXIT_ZONE event_type', () => {
      const msg = { event_type: 'EXIT_ZONE' };
      expect(isZoneEntryExitMessage(msg)).toBe(true);
    });

    it('should return true for all zone event types', () => {
      const eventTypes = ['ENTER_ZONE', 'EXIT_ZONE', 'ENTER', 'EXIT', 'ZONE_ENTRY', 'ZONE_EXIT'];
      for (const event_type of eventTypes) {
        expect(isZoneEntryExitMessage({ event_type })).toBe(true);
      }
    });

    it('should return false for non-zone messages', () => {
      expect(isZoneEntryExitMessage({ event_type: 'OTHER' })).toBe(false);
      expect(isZoneEntryExitMessage({ type: 'POSITIONS' })).toBe(false);
    });
  });

  describe('isZoneStatsMessage()', () => {
    it('should return true for zone stats message with type field', () => {
      const msg = createZoneStatsMessage({ type: 'ZONE_STATS_EVENTS' });
      expect(isZoneStatsMessage(msg)).toBe(true);
    });

    it('should return true for UPDATE_ZONE_COUNTER event_type', () => {
      const msg = { event_type: 'UPDATE_ZONE_COUNTER' };
      expect(isZoneStatsMessage(msg)).toBe(true);
    });

    it('should return false for non-stats messages', () => {
      expect(isZoneStatsMessage({ event_type: 'ENTER_ZONE' })).toBe(false);
      expect(isZoneStatsMessage({ type: 'POSITIONS' })).toBe(false);
    });
  });

  describe('isAlertMessage()', () => {
    it('should return true for alert message with ALERTS type', () => {
      const msg = createAlertMessage({ type: 'ALERTS' });
      expect(isAlertMessage(msg)).toBe(true);
    });

    it('should return true for alert message with NOTIFICATION type', () => {
      const msg = { type: 'NOTIFICATION', params: {} };
      expect(isAlertMessage(msg)).toBe(true);
    });

    it('should return true for NOTIFICATION event_type', () => {
      const msg = { event_type: 'NOTIFICATION', params: {} };
      expect(isAlertMessage(msg)).toBe(true);
    });

    it('should return true for message with alert_type field', () => {
      const msg = { alert_type: 'zone_presence' };
      expect(isAlertMessage(msg)).toBe(true);
    });

    it('should return true for event_type containing ALERT', () => {
      const msg = { event_type: 'ZONE_ALERT' };
      expect(isAlertMessage(msg)).toBe(true);
    });

    it('should return false for non-alert messages', () => {
      expect(isAlertMessage({ type: 'POSITIONS' })).toBe(false);
      expect(isAlertMessage({ event_type: 'ENTER_ZONE' })).toBe(false);
    });
  });

  describe('isAssetMessage()', () => {
    it('should return true for asset message with type field', () => {
      const msg = createAssetUpdateMessage();
      expect(isAssetMessage(msg)).toBe(true);
    });

    it('should return true for message with asset_id field', () => {
      const msg = { asset_id: '12345' };
      expect(isAssetMessage(msg)).toBe(true);
    });

    it('should return true for event_type containing ASSET', () => {
      const msg = { event_type: 'ASSET_UPDATE' };
      expect(isAssetMessage(msg)).toBe(true);
    });

    it('should return false for non-asset messages', () => {
      expect(isAssetMessage({ type: 'POSITIONS' })).toBe(false);
    });
  });

  describe('isSubscriptionConfirmation()', () => {
    it('should return true for SUBSCRIPTION_CONFIRMATION type', () => {
      const msg = createSubscriptionConfirmation(['POSITIONS']);
      expect(isSubscriptionConfirmation(msg)).toBe(true);
    });

    it('should return true for subscribeEvent action', () => {
      const msg = createSubscriptionConfirmation(undefined, 'alt');
      expect(isSubscriptionConfirmation(msg)).toBe(true);
    });

    it('should return false for other message types', () => {
      expect(isSubscriptionConfirmation({ type: 'POSITIONS' })).toBe(false);
      expect(isSubscriptionConfirmation({ action: 'other' })).toBe(false);
    });
  });

  describe('classifyMessage()', () => {
    it('should classify position messages', () => {
      const msg = createPositionMessage();
      expect(classifyMessage(msg)).toBe(SubscriptionType.POSITIONS);
    });

    it('should classify zone entry messages', () => {
      const msg = createZoneEntryMessage();
      expect(classifyMessage(msg)).toBe(SubscriptionType.ZONES_ENTRIES_EVENTS);
    });

    it('should classify zone stats messages', () => {
      const msg = createZoneStatsMessage();
      expect(classifyMessage(msg)).toBe(SubscriptionType.ZONE_STATS_EVENTS);
    });

    it('should classify alert messages', () => {
      const msg = createAlertMessage();
      expect(classifyMessage(msg)).toBe(SubscriptionType.ALERTS);
    });

    it('should classify asset messages', () => {
      const msg = createAssetUpdateMessage();
      expect(classifyMessage(msg)).toBe(SubscriptionType.ASSETS);
    });

    it('should classify subscription confirmations', () => {
      const msg = createSubscriptionConfirmation();
      expect(classifyMessage(msg)).toBe('CONFIRMATION');
    });

    it('should return UNKNOWN for unrecognized messages', () => {
      expect(classifyMessage({ foo: 'bar' })).toBe('UNKNOWN');
      expect(classifyMessage({})).toBe('UNKNOWN');
    });
  });
});

describe('MAC Address Utilities', () => {
  describe('normalizeMacAddress()', () => {
    it('should normalize colon-separated uppercase', () => {
      expect(normalizeMacAddress('AA:BB:CC:DD:EE:FF')).toBe('aabbccddeeff');
    });

    it('should normalize colon-separated lowercase', () => {
      expect(normalizeMacAddress('aa:bb:cc:dd:ee:ff')).toBe('aabbccddeeff');
    });

    it('should normalize dash-separated', () => {
      expect(normalizeMacAddress('AA-BB-CC-DD-EE-FF')).toBe('aabbccddeeff');
    });

    it('should normalize dot-separated', () => {
      expect(normalizeMacAddress('AABB.CCDD.EEFF')).toBe('aabbccddeeff');
    });

    it('should normalize without separators', () => {
      expect(normalizeMacAddress('AABBCCDDEEFF')).toBe('aabbccddeeff');
    });

    it('should return already normalized address unchanged', () => {
      expect(normalizeMacAddress('aabbccddeeff')).toBe('aabbccddeeff');
    });

    it('should throw for invalid MAC address - too short', () => {
      expect(() => normalizeMacAddress('aabbcc')).toThrow(/Invalid MAC address/);
    });

    it('should throw for invalid MAC address - too long', () => {
      expect(() => normalizeMacAddress('aabbccddeeff00')).toThrow(/Invalid MAC address/);
    });

    it('should throw for invalid characters', () => {
      expect(() => normalizeMacAddress('GG:HH:II:JJ:KK:LL')).toThrow(/Invalid MAC address/);
    });

    it('should throw for empty string', () => {
      expect(() => normalizeMacAddress('')).toThrow(/Invalid MAC address/);
    });
  });

  describe('isValidMacAddress()', () => {
    it('should return true for valid MAC addresses', () => {
      expect(isValidMacAddress('AA:BB:CC:DD:EE:FF')).toBe(true);
      expect(isValidMacAddress('aabbccddeeff')).toBe(true);
      expect(isValidMacAddress('AA-BB-CC-DD-EE-FF')).toBe(true);
    });

    it('should return false for invalid MAC addresses', () => {
      expect(isValidMacAddress('invalid')).toBe(false);
      expect(isValidMacAddress('')).toBe(false);
      expect(isValidMacAddress('GG:HH:II:JJ:KK:LL')).toBe(false);
    });
  });
});

describe('Reconnection Utilities', () => {
  describe('calculateReconnectDelay()', () => {
    it('should return base interval for first attempt', () => {
      expect(calculateReconnectDelay(0)).toBe(DEFAULT_RECONNECTION_STRATEGY.baseInterval);
    });

    it('should double delay for each attempt (capped at max)', () => {
      const base = DEFAULT_RECONNECTION_STRATEGY.baseInterval; // 5000
      const max = DEFAULT_RECONNECTION_STRATEGY.maxDelay; // 30000

      expect(calculateReconnectDelay(0)).toBe(base);       // 5000
      expect(calculateReconnectDelay(1)).toBe(base * 2);   // 10000
      expect(calculateReconnectDelay(2)).toBe(base * 4);   // 20000
      // 5000 * 8 = 40000, but capped at 30000
      expect(calculateReconnectDelay(3)).toBe(max);
    });

    it('should cap at max delay', () => {
      const maxDelay = DEFAULT_RECONNECTION_STRATEGY.maxDelay;
      expect(calculateReconnectDelay(10)).toBe(maxDelay);
      expect(calculateReconnectDelay(100)).toBe(maxDelay);
    });

    it('should use custom strategy', () => {
      const customStrategy = {
        baseInterval: 1000,
        maxDelay: 5000,
        multiplier: 3,
        maxAttempts: 5,
      };

      expect(calculateReconnectDelay(0, customStrategy)).toBe(1000);
      expect(calculateReconnectDelay(1, customStrategy)).toBe(3000);
      expect(calculateReconnectDelay(2, customStrategy)).toBe(5000); // Capped at max
    });
  });
});
