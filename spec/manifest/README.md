# Operation manifests

Every operation of the vendored spec (`spec/rtls-api.swagger.json`, 176 operations) has a decision here: wrapped
by the SDK, or excluded with a reason. `npm run test:contract` checks the files (schema in `schema.json`);
`npm run manifest:report` prints the merged table (`-- --json` for tooling such as the endpoint-coverage
generator of `npm run docs:coverage`).

The SDK surface is split into eight domain groups, `P1` (core) to `P8` (WebSocket). The `phase` key names the
group of an operation, and each group has its own manifest file.

| File | Content |
|---|---|
| `base.json` | every operation: `id`, `tag`, `phase` (its group), `decision`, `reason` |
| `P1.json` … `P8.json` | how the SDK wraps the operations of one group: SDK names, tests, tier |
| `schema.json` | JSON Schema of both kinds (`definitions/base`, `definitions/phase`) |

## `base.json`

One entry per spec operation, sorted by `id` (`"METHOD path"` with the spec's path string verbatim). `phase` is
`P2`…`P8` or `none`; `reason` is required for `exclude`. The key names are frozen; `id` is the key every consumer
reads.

```json
{
  "specVersion": "3.4.0-15bab236",
  "operations": [
    { "id": "GET /assets/{app_namespace}", "tag": "Assets Data", "phase": "P2", "decision": "wrap" },
    {
      "id": "POST /settings/{app_namespace}",
      "tag": "Settings",
      "phase": "P5",
      "decision": "exclude",
      "reason": "Full-replace write of the whole namespace configuration; an operator task. settings.get() stays."
    }
  ]
}
```

A decision is changed in `base.json` only; a group manifest cannot override it.

## Group manifest `P<n>.json`

Strict schema (`additionalProperties: false`). `phase` and `domain` name the group; `status` is `draft` while the
lists are incomplete and `complete` once every operation of the group is listed.
`npm run test:contract -- --phase P<n>` requires `complete`.

```json
{
  "phase": "P7",
  "domain": "etl",
  "status": "draft",
  "operations": [],
  "nonHttp": [],
  "sdkMethods": []
}
```

### `operations`

One entry per operation of the group. `decision` must equal the `base.json` decision. A `wrap` entry has `sdk`
(surface names, see below), `unit` (test files), and `live` + `tier` or `allowlist` (an id in
`test/integration/allowlist/P<n>.json`). `realPath` is the `ExtraPaths` key when the spec path is wrong; `usi`
lists the server issues that affect the operation.

```json
{
  "op": "GET /etl/activities",
  "decision": "wrap",
  "sdk": ["etl.activities.listPage", "etl.activities.iterate"],
  "unit": "test/resources/etl/activities.test.ts",
  "live": ["test/integration/etl/read.int.test.ts"],
  "tier": "R"
}
```

### `nonHttp` (WebSocket, P8)

```json
{
  "id": "WS-C1",
  "kind": "ws-command",
  "decision": "wrap",
  "sdk": "RtlsWebSocketSubscriber.subscribe",
  "unit": "test/websocket/subscriber.test.ts",
  "live": "test/websocket/subscriber.int.test.ts",
  "tier": "R"
}
```

`sdk` is optional on `nonHttp` rows and, when present, holds surface names only (not class, event or type names).

### `sdkMethods`

Public functions and exports without an operation of their own (helpers, guards, constants).

```json
{ "name": "normalizeMac", "unit": "test/unit/core/utils/mac.test.ts", "live": "test/integration/core/transport.int.test.ts", "tier": "R" }
```

### `aliases`

Delegating or deprecated entry points; `op` and `delegatesTo` may belong to another group.

```json
{
  "sdk": "client.getSettings",
  "delegatesTo": "settings.get",
  "op": "GET /settings/{app_namespace}",
  "deprecated": true,
  "unit": "test/unit/core/client.test.ts",
  "live": "test/integration/core/delegates.int.test.ts",
  "tier": "R"
}
```

### `localMethods`

Surface names that issue no HTTP request (context setters, factories).

```json
["createRtlsClient", "client.forNamespace", "client.setNamespace"]
```

## Surface names

The names come from `scripts/lib/surface.mjs` (`node scripts/lib/surface.mjs` lists them): `<prop>.<method>` for
methods reachable from an `RtlsClient` property (`assets.list`, `notifications.rules.create`), `client.<method>`
for the client's own methods, `<Class>.<method>` for other exported classes (inherited members are attributed to the
declaring class), `<name>` for exported functions and `<object>.<member>` for function-valued members of exported
objects (`filters.equals`). Members tagged `@internal` are not part of the surface.

## Checks

Every manifest: schema, `phase`/`domain` match the file name, every `op` is a `base.json` operation of the group with
the same decision, no duplicates, referenced files exist, `tier` matches a `describeLive('<tier>', …)` of a listed
live file, `allowlist` ids exist, `aliases[].op` exists. When `complete`: every wrapped operation of the group is
listed with `sdk`, `unit` and `live` + `tier` or `allowlist`; every wrapped operation has a 2xx fixture with its
`_operation` under `test/fixtures/<domain>/`; every surface item declared in a file the group owns (`scripts/lib/ownership.mjs`) is listed in some
manifest; every listed name exists in the surface. `--release` requires every group manifest to be complete.
