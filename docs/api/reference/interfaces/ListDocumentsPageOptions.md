[**ubudu-rtls-sdk**](../README.md)

***

[ubudu-rtls-sdk](../README.md) / ListDocumentsPageOptions

# Interface: ListDocumentsPageOptions

One page of `assetDocuments.listPage` (newest first; the server offers no sort option).

## Properties

### docType?

> `optional` **docType?**: `string`

***

### limit?

> `optional` **limit?**: `number`

Integer 1..500; server default 50.

***

### offset?

> `optional` **offset?**: `number`

Integer >= 0; default 0.
