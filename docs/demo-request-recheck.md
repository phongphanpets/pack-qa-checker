# Request demo recheck

Scope: Request intake and Bundle export. Item Code creation/import in Aztek is not part of this tool.

## Covered patterns

- Item ID / Item Name / Amt, including headerless lists with a supplied Bundle Name.
- Markdown and tab-separated requests, escaped currency IDs and thousands separators.
- Flash Sale first-row and continuation-row column shifts, including SP/GSP/EXP alignment.
- Multiple vertically stacked Product blocks.
- Fixed and Random rewards, repeated item IDs, distinct display rates and fractional rewards.
- Trade/Amt reordering and shifted Chance columns.
- Request history search/filter, mobile status changes, failed-save handling and decimal request intake.

## Explicit limitations

- Side-by-side dates, multiple Amt columns (Tier S/A/B), and simultaneous Paid/Free rates are blocked with a warning. Split these sources into one group before converting; do not claim automatic conversion of the whole matrix.
- Invalid quantities or unspecified rates in a Chance column block export rather than silently yielding a partial bundle. Use Fixed for guaranteed rewards.
- Shared History, Request-linked exports and Discord require the configured team API. Standalone exports run in the browser from the bundled templates without the API. Live Discord delivery is not verified without the team's webhook.
- Automated tests do not prove Aztek acceptance. Use an already accepted import template and a controlled demo request.

## Demo path

1. Connect the API, then create a Normal Web Shop request using a simple item table.
2. Review item quantities and GSP/EXP, then export a Bundle file.
3. Show a mixed Fixed/Random request and its separate bundles.
4. Show Item Code reward intake and Bundle export only.
5. Open History, filter a request and download its saved artifact.

Keep a previously accepted XLSX available as backup. The public frontend alone is not an offline replacement for the API.
