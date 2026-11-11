# Ubudu RTLS SDK documentation

Guides, recipes and reference for `ubudu-rtls-sdk`, the TypeScript and JavaScript SDK of the Ubudu RTLS REST and
WebSocket API.

## Which guide do I need

| I want to… | Guide |
|---|---|
| install the SDK, get credentials, create a client, set the default context | [Getting started](./guides/getting-started.md) |
| upgrade code written for 0.2 | [Migration to 0.3](./guides/migration-0.3.md) |
| handle errors, timeouts, cancellation, retries and rate limits | [Error handling](./guides/error-handling.md) |
| list large collections, filter, sort, bound an iteration | [Pagination and filtering](./guides/pagination-filtering.md) |
| manage assets, their documents, declared locations, BLE tag actions | [Assets](./guides/assets.md) |
| read live and historical positions, publish positions, run spatial queries | [Positions and spatial](./guides/positions-spatial.md) |
| read venues, maps, zones, POIs and paths, compute indoor routes | [Venues and navigation](./guides/venues-navigation.md) |
| manage dashboards, read alerts, edit alert rules, read settings | [Dashboards and alert rules](./guides/dashboards-alert-rules.md) |
| read and triage the notification inbox, send notifications, follow the live stream | [Notifications](./guides/notifications.md) |
| update existing assets from CSV or Excel files | [ETL](./guides/etl.md) |
| stream positions, zone events and alerts in real time, publish positions | [WebSocket](./guides/websocket.md) |
| see a complete scenario built from several domains | [Recipes](./recipes/README.md) |
| look up a class, method or type | [API reference](./api/README.md) |

## Start here

- [Getting started](./guides/getting-started.md): install, credentials, first client, authentication, client
  options, default context, `client.raw` for operations the SDK does not wrap, runtime support.
- [Migration to 0.3](./guides/migration-0.3.md): breaking changes with before and after code, deprecated aliases,
  new capabilities.

## Concepts

- [Error handling](./guides/error-handling.md): error classes, fields, status mapping, timeouts, cancellation,
  retries, rate limits.
- [Pagination and filtering](./guides/pagination-filtering.md): the three listing models, `collectAll`, the
  filter DSL, `applyFilters`, sorting and field selection.

## Domains

- [Assets](./guides/assets.md): `client.assets`, `assetDocuments`, `assetTree`, `dataModels`,
  `declaredLocations`, `tagActions`.
- [Positions and spatial](./guides/positions-spatial.md): `client.positions`, `client.spatial`.
- [Venues and navigation](./guides/venues-navigation.md): `client.venues`, `client.zones`, `client.navigation`.
- [Dashboards and alert rules](./guides/dashboards-alert-rules.md): `client.dashboards`, `client.alerts`,
  `client.alertRules`, `client.settings`.
- [Notifications](./guides/notifications.md): `client.notifications` and its live stream.
- [ETL](./guides/etl.md): `client.etl`.
- [WebSocket](./guides/websocket.md): `RtlsWebSocketSubscriber`, `RtlsWebSocketPublisher`,
  `RtlsWebSocketClient`, `client.createWebSocket()`.

## Recipes

End-to-end programs, each with a page and a TypeScript and a JavaScript example:
[recipe index](./recipes/README.md).

## Reference

- [API reference overview](./api/README.md): how the reference is organised, shared utilities.
- [Generated API reference](./api/reference/README.md): every exported class, function and type.
- [Endpoint coverage](./api/endpoint-coverage.md): every operation of the RTLS API with the SDK method that wraps
  it, or the reason it is not wrapped.

## Examples

Runnable examples for every domain, in TypeScript and JavaScript: [examples index](../examples/README.md).

## Maintainers

- [Release setup](./guides/release-setup.md): CI pipelines, GitHub mirroring, npm publishing, release checklist.
