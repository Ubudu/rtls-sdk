# Ubudu RTLS SDK Documentation

Welcome to the Ubudu RTLS SDK documentation. This SDK provides TypeScript/JavaScript bindings for the Ubudu Real-Time Location System API.

## Guides

| Guide | Description |
|-------|-------------|
| [Getting Started](./guides/getting-started.md) | Installation, configuration, first API calls |
| [Asset Tracking](./guides/asset-tracking.md) | Asset CRUD, positions, history, statistics |
| [Zone & Geofencing](./guides/zone-geofencing.md) | Zones, spatial queries, presence detection |
| [Navigation](./guides/navigation.md) | POIs, paths, indoor routing |
| [WebSocket Streaming](./guides/websocket.md) | Real-time positions, zones, alerts |
| [Error Handling](./guides/error-handling.md) | Error types, retry strategies |
| [Advanced Patterns](./guides/advanced-patterns.md) | Pagination, filtering, batch processing |
| [Migration to v2](./guides/migration-v2.md) | Migrating to default context API |
| [Release Setup](./guides/release-setup.md) | CI/CD for GitHub and npm publishing |

## Examples

See the [examples directory](../examples/) for runnable TypeScript and JavaScript examples.

```bash
cd examples
npm install
npm run ts:all  # Run all TypeScript examples
```

## API Reference

See the [API Reference](./api/README.md) for detailed documentation of all classes and methods.

## Quick Start

```typescript
import { createRtlsClient } from 'ubudu-rtls-sdk';

const client = createRtlsClient({
  apiKey: 'your-api-key',
});

// List assets
const assets = await client.assets.list('namespace');

// Get cached positions
const positions = await client.positions.listCached('namespace');

// Spatial query
const nearbyZones = await client.spatial.nearestZones('namespace', {
  lat: 48.8566,
  lon: 2.3522,
  limit: 5,
});
```

## Resources

The SDK provides access to these API resources:

| Resource | Class | Description |
|----------|-------|-------------|
| Assets | `client.assets` | Asset CRUD, history, statistics |
| Positions | `client.positions` | Real-time and historical positions |
| Venues | `client.venues` | Venues, maps, POIs, paths |
| Zones | `client.zones` | Zone management and presence |
| Spatial | `client.spatial` | Spatial queries |
| Alerts | `client.alerts` | Alert rules |
| Dashboards | `client.dashboards` | Dashboard configuration |
| Navigation | `client.navigation` | Indoor routing |
| WebSocket | `RtlsWebSocketClient` | Real-time streaming |

## Support

- [GitHub Issues](https://github.com/ubudu/rtls-sdk/issues) - Report bugs or request features
- [API Documentation](https://rtls.ubudu.com/api/docs) - RTLS API reference
