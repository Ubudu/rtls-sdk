[**ubudu-rtls-sdk**](../README.md)

***

[ubudu-rtls-sdk](../README.md) / BatchSaveResult

# ~~Type Alias: BatchSaveResult~~

> **BatchSaveResult** = [`Schema`](Schema.md)\<`"BatchSaveResult"`\>

The spec's `BatchSaveResult` schema (`{ created, updated, errors }`).

Spec defect: the server never answers with it; `POST /assets/{app_namespace}` returns the array of saved assets
(USI-P2-4), and `assets.batchSave` resolves `Asset[]`.

## Deprecated

since 0.3.0 — `assets.batchSave` returns `Asset[]`; kept for one minor version.
