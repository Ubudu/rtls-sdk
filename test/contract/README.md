# Contract tests

`npm run test:contract` runs the tests of this folder (`vitest.contract.config.ts`, no MSW setup) and then the
operation-manifest checks of `spec/manifest/` (see `spec/manifest/README.md`).

| File | What it checks |
|---|---|
| `spec.ts` | Loader and Ajv 8 validator for the vendored spec `spec/rtls-api.swagger.json` |
| `fixtures.ts` | Fixture envelope, loader, MSW response builder, contract and hygiene checks |
| `fixtures.contract.test.ts` | Every fixture under `test/fixtures/<domain>/*.json` |
| `tooling/*.test.ts` | Unit tests of the P0 tooling (inputs in `__fixtures__/`) |

## Fixture envelope

A fixture is a JSON file directly inside `test/fixtures/<domain>/` (domain keys of CONVENTIONS §6). Subfolders
such as `inputs/` hold request inputs and are ignored by the contract.

```json
{
  "_source": "live",
  "_note": "The server answers text/plain \"Created\"; the spec declares no 201 body.",
  "_operation": "POST /assets/{app_namespace}/{mac_address}",
  "status": 201,
  "text": "Created"
}
```

| Key | Meaning |
|---|---|
| `_source` | `spec` (body follows the spec), `live` (recorded from the live API), `server-code` (derived from server behaviour) |
| `_note` | Required unless `_source` is `spec`: how the real shape differs from the spec. No server file paths |
| `_operation` | `"METHOD path"` exactly as in `spec/manifest/base.json`. Required for `spec` fixtures and on at least one 2xx fixture of every wrapped operation |
| `_nonHttp` | WebSocket fixtures (P8): id of a `nonHttp` manifest entry, instead of `_operation` |
| `_usi` | USI ids (`USI-P<n>-<m>`) explaining a divergence |
| `_recorded` | `{ specVersion, runId }`, set by the harness recorder |
| `status` | HTTP status, default 200 |
| `contentType` | Default `application/json` for a JSON body, `text/plain` for `text`, none for `body: null`, `application/octet-stream` for `base64` |
| `headers` | Response headers (`X-Total-Count`, `Content-Disposition`, …) |
| `body` / `text` / `base64` | Exactly one: a JSON value (`null` = empty body), a non-JSON text body, or base64 bytes |

Unknown keys are rejected.

## Server truth

Where the spec is right, write `_source: "spec"`: the contract validates `body` against the response schema of
`_operation` and `status` (a `text` or `base64` fixture only against the declared status and content type; a
`body: null` fixture only when the status declares no content). Where the server differs from the spec, write
`_source: "live"` (recorded) or `"server-code"`, with a `_note`. Such fixtures are validated too, and the result
is reported, not failed. A `live`/`server-code` fixture that validates is reported as "override possibly
unnecessary"; `npm run test:contract -- --release` fails on it. Properties the schema does not declare are reported,
never failed.

## Hygiene

Always fatal, in any fixture: an e-mail address (except reserved example domains such as the scrub placeholder
`user@example.invalid`), a JWT-like `eyJ…` string, `Bearer `, any 40-hex identifier, a `.js:<n>`, `.h:<n>` or
`.cpp:<n>` source reference, and `rtls-api/` or `rt_positions_server/` paths. Record fixtures with the harness
recorder (`recordFixture`, which scrubs them) instead of copying responses by hand.

## Using fixtures in unit tests

```ts
import { http } from 'msw';
import { server } from '../mocks/server';
import { fixtureResponse, loadFixture } from '../contract/fixtures';

const created = loadFixture('assets', 'create.201');
server.use(http.post('https://rtls.test/api/assets/:ns/:mac', () => fixtureResponse(created)));
```

`fixtureResponse()` returns a standard `Response` with the fixture's status, content type, headers and body.
The contract run writes its results to `.cache/contract/fixtures-report.json`.
