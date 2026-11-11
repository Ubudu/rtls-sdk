[**ubudu-rtls-sdk**](../README.md)

***

[ubudu-rtls-sdk](../README.md) / EtlFileInput

# Type Alias: EtlFileInput

> **EtlFileInput** = [`UploadFile`](UploadFile.md) \| \{ `data`: `string`; `filename`: `string`; \}

File input. A Blob must be a File (it needs a name); otherwise use the object form. CSV must be UTF-8,
comma-separated (USI-P7-17). The MIME type always comes from the extension (`csv`, `xlsx`, `xls`); the object
form's `contentType` and a File's own type are ignored.
