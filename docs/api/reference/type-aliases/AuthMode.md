[**ubudu-rtls-sdk**](../README.md)

***

[ubudu-rtls-sdk](../README.md) / AuthMode

# Type Alias: AuthMode

> **AuthMode** = `"auto"` \| `"apiKey"` \| `"bearer"`

Which credential is sent (exactly one per request).
- `'auto'` (default): `Authorization: Bearer <accessToken>` when `accessToken` is set, else `X-API-Key: <apiKey>`.
- `'apiKey'`: always `X-API-Key` (requires `apiKey`).
- `'bearer'`: always `Authorization: Bearer` (requires `accessToken`).
