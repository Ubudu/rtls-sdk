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

## Development

### Work Packages

| # | Document | Status | Description |
|---|----------|--------|-------------|
| 1 | [01_WORK_PACKAGE.md](./development/01_WORK_PACKAGE.md) | COMPLETED | SDK implementation |
| 2 | [02_API_VALIDATION_WORKPACKAGE.md](./development/02_API_VALIDATION_WORKPACKAGE.md) | COMPLETED | API validation testing |
| 3 | [03_SDK_ALIGNMENT_WORKPACKAGE.md](./development/03_SDK_ALIGNMENT_WORKPACKAGE.md) | COMPLETED | SDK alignment |
| 4 | [04_SDK_DOCUMENTATION_WORKPACKAGE.md](./development/04_SDK_DOCUMENTATION_WORKPACKAGE.md) | COMPLETED | Documentation & examples |
| 5 | [05_SDK_ERGONOMICS_WORKPACKAGE.md](./development/05_SDK_ERGONOMICS_WORKPACKAGE.md) | COMPLETED | Default context & ergonomics |
| 6 | [06_WEBSOCKET_CLIENT_WORKPACKAGE.md](./development/06_WEBSOCKET_CLIENT_WORKPACKAGE.md) | COMPLETED | WebSocket real-time client |

## Support

- [GitHub Issues](https://github.com/ubudu/rtls-sdk/issues) - Report bugs or request features
- [API Documentation](https://rtls.ubudu.com/api/docs) - RTLS API reference
