---
name: aztek-import
description: Convert TOSM promotion spreadsheets or pasted request tables into Aztek Bundle and Product import XLSX files, independently of the Import Adapter application.
---

# Aztek Import

Produce import files directly for the user. This skill is portable: it does not require the Pack QA application, a local server, or machine-specific paths. Use the current user-supplied template as the authority for column names, order, sheet names, and cell types. Read [format.md](references/format.md) before creating files.

## Read the request

- Accept XLSX tabs, TSV copied from Excel, Markdown tables, and headerless Item ID / Name / Amt lists. Preserve Unicode names exactly.
- Inspect the actual cell grid before mapping. Promotion tables with merged cells often shift item columns left after the first item. Locate each row's ID, name, amount and chance together instead of applying the first row's offsets everywhere.
- Skip Markdown alignment rows and decode escaped underscores, HTML tabs and line breaks. Do not split an item name at a comma or a quoted newline.
- Separate adjacent date/code blocks and independently numbered boards/wheels. Counts of recipients are not item quantities. Use the user's requested bundle names and grouping.
- Keep repeated IDs with different quantities or chances as separate outcomes. Never deduplicate them by ID.
- Resolve missing IDs or requested tiers against the provided Data catalog by exact ID or unambiguous name. Flag unknown/ambiguous matches instead of inventing IDs. Ignore broken lookup values such as TRUE/FALSE in Tier, not found and #VALUE!.

## Transform

- Split mixed guaranteed and random rewards into Fixed and Random bundles. Keep one Product referencing both bundles.
- Web Shop rewards: GSP equals Seed Point; Player EXP equals Seed Point / 10 and accepts decimals. Preserve explicitly supplied GSP/EXP values. Add these rewards to Fixed only, once; a random-only Web Shop needs a Fixed reward bundle. Do not add them to standalone itemcode reward bundles unless requested.
- Price comes from Seed Point, not THB or Total Paid. Read the purchase limit separately.
- Itemcode requests export their reward bundles only. Code serials, validity windows, usage limits and AND conditions are metadata for manual entry, not an Aztek code-import file.
- Chance and display/secret chance are distinct fields. When requested equal, copy each random chance exactly into both. Never normalize or round supplied chances to conceal an incorrect total. Preserve zero; blank is not zero.
- Default Tier to Trainee unless the user requests catalog tiers or provides another valid value. Do not confuse names like Tier S/A/B with an item's import Tier.

## Deliver and verify

Create XLSX using the spreadsheet library available on the destination machine. Prefer copying a supplied known-working template and clearing sample data without altering headers. If none exists, use the documented nine-column Bundle schema; for Product imports obtain a current template before claiming compatibility.

Reopen every output. Check exact headers, bundle names, row counts, IDs/types, numeric quantities, chance pairs and per-bundle positions. Report random totals that differ from 100, unresolved IDs and omitted invalid rows. Do not silently export incomplete rewards as ready to import.

By default deliver one XLSX per bundle because this workflow has encountered multi-bundle import issues; provide a ZIP for convenience when there are many. Follow an explicit request for a combined file. Sanitize filenames only (for example date slashes), leaving the Bundle Name intact. Link final files and state any remaining manual steps. A successful file check is not evidence that Aztek accepted an import.
