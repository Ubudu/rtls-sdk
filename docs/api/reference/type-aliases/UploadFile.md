[**ubudu-rtls-sdk**](../README.md)

***

[ubudu-rtls-sdk](../README.md) / UploadFile

# Type Alias: UploadFile

> **UploadFile** = `Blob` \| \{ `data`: `Blob` \| `ArrayBuffer` \| `ArrayBufferView`; `filename`: `string`; `contentType?`: `string`; \}

A file to upload: a `Blob` (a `File` keeps its own name), or bytes with an explicit filename and an optional
content type. A bare `Blob` without a name needs a fallback filename from the resource that uploads it: without
a filename the server sees the part as `blob` / `application/octet-stream`.
