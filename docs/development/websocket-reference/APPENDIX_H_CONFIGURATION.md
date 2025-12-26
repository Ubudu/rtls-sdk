# Appendix H: Technical Configuration Reference

From `TECHNICAL_README.md`:

## Environment Variables

| Variable | Description | Default Value |
|----------|-------------|---------------|
| APP_NAMESPACE | Application namespace (required) | - |
| MAP_UUID | Map UUID (required for publishing) | - |
| PUBLISHER_URL | Publisher WebSocket URL | wss://rtls.ubudu.com/api/ws/publisher |
| SUBSCRIBER_URL | Subscriber WebSocket URL | wss://rtls.ubudu.com/api/ws/subscriber |
| DEBUG | Debug mode (1 = enabled) | 0 |
| RECONNECT_INTERVAL | Reconnection interval in ms | 5000 |

## Subscription Types

```typescript
const SUBSCRIPTION_TYPES = {
  POSITIONS: 'POSITIONS',           // Real-time tag positions
  ZONES_ENTRIES_EVENTS: 'ZONES_ENTRIES_EVENTS',  // Zone enter/exit
  ZONE_STATS_EVENTS: 'ZONE_STATS_EVENTS',  // Zone occupancy stats
  ALERTS: 'ALERTS',                 // Notifications
  ASSETS: 'ASSETS',                 // Asset CRUD events
};
```

## Subscription Process

The two-step process provides explicit control:

1. **Connect**: Establish WebSocket connection
2. **Subscribe**: Request specific event types

```typescript
await subscriber.connect();
await subscriber.subscribe([
  SUBSCRIPTION_TYPES.POSITIONS,
  SUBSCRIPTION_TYPES.ALERTS
]);
```

## Error Handling Patterns

1. **Connection Errors**: Automatic reconnection with exponential backoff
2. **Message Parsing Errors**: Try-catch around JSON parsing, log raw message
3. **Application Logic Errors**: Validation before operations, meaningful error messages

## Performance Considerations

- Connection pooling for multiple operations
- Efficient event handling with typed emitters
- Minimized JSON payload size
- Proper connection cleanup on shutdown
