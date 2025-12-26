# Appendix D: Reference Subscriber Message Detection

Key patterns from the reference `UbuduWebsocketSubscriber.js` for message classification:

```javascript
/**
 * Determine the type of message based on content
 * This is critical for routing messages to the correct handlers
 */
_classifyMessage(data) {
  // If the server explicitly provides a type, use it
  if (data.type) {
    return data.type;
  }

  // Infer type from message content

  // Position: has lat/lon and user identifier
  if (data.lat !== undefined && data.lon !== undefined &&
      (data.user_uuid || data.user_udid)) {
    return 'POSITIONS';
  }

  // Zone entry/exit events
  const zoneEvents = ['ENTER_ZONE', 'EXIT_ZONE', 'ENTER', 'EXIT', 'ZONE_ENTRY', 'ZONE_EXIT'];
  if (data.event_type && zoneEvents.includes(data.event_type)) {
    return 'ZONES_ENTRIES_EVENTS';
  }

  // Zone stats
  if (data.event_type === 'UPDATE_ZONE_COUNTER') {
    return 'ZONE_STATS_EVENTS';
  }

  // Alerts/Notifications
  if (data.event_type === 'NOTIFICATION' || data.alert_type) {
    return 'ALERTS';
  }

  // Assets
  if (data.type === 'assets' || data.asset_id) {
    return 'ASSETS';
  }

  // Subscription confirmation
  if (data.type === 'SUBSCRIPTION_CONFIRMATION' || data.action === 'subscribeEvent') {
    return 'SUBSCRIPTION_CONFIRMATION';
  }

  return 'UNKNOWN';
}

/**
 * Valid event types for subscription and handlers
 */
const SUBSCRIPTION_TYPES = {
  POSITIONS: 'POSITIONS',
  ZONES_ENTRIES_EVENTS: 'ZONES_ENTRIES_EVENTS',
  ZONE_STATS_EVENTS: 'ZONE_STATS_EVENTS',
  ALERTS: 'ALERTS',
  ASSETS: 'ASSETS',
};

/**
 * Valid handler event types (includes system events)
 */
const VALID_EVENT_TYPES = [
  ...Object.values(SUBSCRIPTION_TYPES),
  'message',      // Receives all messages
  'error',        // Connection errors
  'connected',    // Connection established
  'disconnected', // Connection closed
];
```

## Classification Priority

1. **Explicit `type` field** - Use if present
2. **Position inference** - `lat`, `lon`, and user identifier present
3. **Zone events** - `event_type` matches zone event patterns
4. **Zone stats** - `event_type === 'UPDATE_ZONE_COUNTER'`
5. **Alerts** - `event_type === 'NOTIFICATION'` or `alert_type` present
6. **Assets** - `type === 'assets'` or `asset_id` present
7. **Subscription confirmation** - `type === 'SUBSCRIPTION_CONFIRMATION'` or `action === 'subscribeEvent'`
8. **Unknown** - Default fallback
