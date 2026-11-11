# ETL input files

Input files of the ETL tests (P7 §8.6). The contract test ignores this folder (it scans only the top-level
`test/fixtures/etl/*.json`). CSV inputs are built inline in the tests as strings and are not stored here.

## `sample.xlsx`

A minimal workbook: one sheet, inline-string cells (`t="inlineStr"`), no shared strings, no styles.

| Row | A | B |
|---|---|---|
| 1 | `MAC` | `Name` |
| 2 | `025d4b000000` | `sdk-test-fixture` |

The file is valid OOXML: a standard spreadsheet reader reads the two rows above. How the server's reader reads it
(expected: `columns ["MAC","Name"]` in the header preview and `[{ MAC: '025d4b000000', Name: 'sdk-test-fixture' }]`
in the import) is **unconfirmed**: the live preview R7 cannot run while USI-P7-21 holds, so the preview fixture
`sheet-preview-xlsx.json` is hand-built from that expectation. The MAC is in the test range but belongs to no run;
the file is only used for a header preview and a dry run, never for a writing upload.

### Recipe

Generated once with a Python standard-library script (not committed), run as `python3 -I make_sample_xlsx.py
test/fixtures/etl/inputs/sample.xlsx`. The script writes five parts with `zipfile.ZIP_DEFLATED`, each with the fixed
timestamp `1980-01-01 00:00:00` so that the output is reproducible:

1. `[Content_Types].xml`: defaults for `rels` (`application/vnd.openxmlformats-package.relationships+xml`) and `xml`
   (`application/xml`); overrides for `/xl/workbook.xml` (`…spreadsheetml.sheet.main+xml`) and
   `/xl/worksheets/sheet1.xml` (`…spreadsheetml.worksheet+xml`).
2. `_rels/.rels`: relationship `rId1`, type `…/relationships/officeDocument`, target `xl/workbook.xml`.
3. `xl/workbook.xml`: `<sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets>`.
4. `xl/_rels/workbook.xml.rels`: relationship `rId1`, type `…/relationships/worksheet`, target
   `worksheets/sheet1.xml`.
5. `xl/worksheets/sheet1.xml`: the two rows above, each cell written as
   `<c r="A1" t="inlineStr"><is><t>MAC</t></is></c>`.

Every XML part starts with `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` and uses the SpreadsheetML
main namespace `http://schemas.openxmlformats.org/spreadsheetml/2006/main` (relationships:
`http://schemas.openxmlformats.org/package/2006/relationships`).
