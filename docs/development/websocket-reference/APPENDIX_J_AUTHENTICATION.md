# Appendix J: WebSocket Authentication Reference

From `WEBSOCKET_AUTHENTICATION.md` - the official authentication specification:

## Authentication Methods

WebSocket endpoints support two authentication methods via **query parameters only**:

| Method | Query Param | Format | Example |
|--------|-------------|--------|---------|
| API Key | `apiKey` | 32-char hex string | `?apiKey=abc123...` |
| JWT Token | `token` | JWT Bearer token | `?token=eyJhbG...` |

## WebSocket URLs

```
wss://rtls.ubudu.com/api/ws/subscriber?apiKey=YOUR_API_KEY
wss://rtls.ubudu.com/api/ws/subscriber?token=YOUR_JWT_TOKEN
wss://rtls.ubudu.com/api/ws/publisher?apiKey=YOUR_API_KEY
wss://rtls.ubudu.com/api/ws/publisher?token=YOUR_JWT_TOKEN
```

## Authentication Flow

```
Client                           RTLS API                        Backend
  │                                 │                               │
  │ GET /ws/subscriber?apiKey=xxx   │                               │
  │ Upgrade: websocket              │                               │
  │────────────────────────────────►│                               │
  │                                 │                               │
  │                    ┌────────────┴────────────┐                  │
  │                    │ 1. wsAuthAdapter()      │                  │
  │                    │    - Extract ?apiKey    │                  │
  │                    │    - Set X-API-Key      │                  │
  │                    │      header             │                  │
  │                    ├─────────────────────────┤                  │
  │                    │ 2. authenticate()       │                  │
  │                    │    - Validate key       │                  │
  │                    │    - Set req.user       │                  │
  │                    ├─────────────────────────┤                  │
  │                    │ 3. Proxy connection     │                  │
  │                    │    - Upgrade WebSocket  │─────────────────►│
  │                    └─────────────────────────┘                  │
  │◄═══════════════════════════════════════════════════════════════►│
  │                    WebSocket established                        │
```

## HTTP Status Codes During Upgrade

| Status | Meaning | Action |
|--------|---------|--------|
| `101` | Switching Protocols | Success - WebSocket established |
| `401` | Unauthorized | Invalid/missing/expired token |
| `403` | Forbidden | Token valid but not authorized |
| `500` | Server Error | Retry after delay |

## Security Notes

1. **Token in URL**: Tokens appear in query params which may be logged
   - HTTPS encrypts in transit
   - Configure nginx to exclude query params from logs

2. **Token Expiry**: Auth happens at connection time only
   - Long-lived connections remain open even if token expires
   - This is standard WebSocket behavior

## Reconnection Strategy (Exponential Backoff)

```typescript
let reconnectAttempts = 0;
const maxReconnectDelay = 30000; // 30 seconds max

function getReconnectDelay(): number {
  // Exponential backoff: 1s, 2s, 4s, 8s, ... up to 30s
  const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), maxReconnectDelay);
  reconnectAttempts++;
  return delay;
}

function onConnected(): void {
  reconnectAttempts = 0; // Reset on successful connection
}

function onDisconnected(): void {
  setTimeout(connect, getReconnectDelay());
}
```

## CLI Testing Commands

```bash
# Test with API key
wscat -c "wss://rtls.ubudu.com/api/ws/subscriber?apiKey=YOUR_API_KEY"

# Test with JWT token
wscat -c "wss://rtls.ubudu.com/api/ws/subscriber?token=YOUR_JWT_TOKEN"

# Then send subscribe message:
> {"type":"SUBSCRIBE","app_namespace":"your-namespace-uuid"}

# No auth - should fail with 401
wscat -c "wss://rtls.ubudu.com/api/ws/subscriber"
# Expected: error: Unexpected server response: 401
```
