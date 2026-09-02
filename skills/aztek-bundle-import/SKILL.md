---
name: aztek-bundle-import
description: Convert a Flash Sale/pack specification workbook into a validated Aztek Bundle Import `.xlsx`. Use whenever the user asks to make, update, repair, or validate an Aztek import file, bundle import, Flash Sale import, gacha pack import, Golden Seed Point (GSP), Player EXP, Chance, or Secret Chance. This skill is especially important when a working import workbook is supplied: preserve its exact column conventions and use it as the output template.
compatibility: Requires Python with openpyxl and access to the source specification workbook plus a known-working Aztek import workbook.
---

# Aztek Bundle Import

Create an import-ready workbook from the stated source sheet. Treat a user-supplied workbook that has already imported successfully as the canonical template: its headers, field placement, repeated values, IDs, and cell formatting override generic assumptions.

## Inputs to confirm

1. Source workbook and the exact source tab(s). Do not process similarly named tabs unless requested.
2. A known-working import workbook. Inspect every populated row before constructing output.
3. The target pack names. Do not include already-imported packs unless the user explicitly asks.
4. Any current mapping rules for currencies, wallet credits, tiers, or chances.

If an ID or UUID is not defined by the template or user, do not invent it. Ask for that value before generating an import file.

## Required import layout

Match this header order exactly when the working template uses it:

`Bundle Name`, `Bundle Type`, `Send Immediately`, `Item Type`, `Item ID`, `Item Code ID`, `Currency ID`, `Monarchy ID`, `Quantity`, `Tier`, `Chance`, `Secret Chance`.

Populate data according to the working template:

- `ITEM`: put its numeric item ID in `Item ID`.
- `WALLET_CREDIT`: put the wallet/currency identifier in `Currency ID`.
- `PLAYER_EXPERIENCE`: set `Monarchy ID` to the template's monarchy UUID/value.
- Use `Tier = Trainee` when the user asks for all packs to use Trainee.
- Keep `Item ID`, `Item Code ID`, `Currency ID`, and `Monarchy ID` blank unless their `Item Type` requires one.
- Repeat `Bundle Type` and `Send Immediately` on every populated data row if the working import file does so.

## Pack conversion rules

### Fixed packs

- Use `Bundle Type = FIXED` and `Send Immediately = 1`.
- Fixed source rows with no rate remain fixed. Leave `Chance` and `Secret Chance` blank.
- Add both GSP and Player EXP when the source pack specifies them:
  - GSP is a `WALLET_CREDIT` row using the confirmed GSP currency identifier.
  - EXP is a `PLAYER_EXPERIENCE` row using the confirmed monarchy identifier.

### Random packs

A random sales pack has two import bundles:

1. `<pack name> [Fixed]` for always-received rewards, GSP, and Player EXP. Use `FIXED` / `1` and leave both chance columns blank.
2. `<pack name> [Random]` for chance-based rewards. Use `RANDOM` / `0`.

Copy each source probability exactly as a numeric percentage value, e.g. source `0.1` stays `0.1`, not `0.001`. Unless the user gives another rule, set `Secret Chance` equal to `Chance` for every random row.

## Confirmed mapping rules

Apply these only when the user has not superseded them:

| Source value | Import type | Destination value |
|---|---|---|
| `Gold_Cur` | `ITEM` | Item ID `101147` |
| `TP_Cur` | `ITEM` | Item ID `101145` |
| `Diamond` | `ITEM` | Item ID `101146` |
| `Popo_God_1` | `WALLET_CREDIT` | Currency ID `God Coin` |
| `Popo_Fellow_1` | `WALLET_CREDIT` | Currency ID `Fellow Coin` |
| `Popo_Kupo_1` | `WALLET_CREDIT` | Currency ID `Kupole Coin` |

## Build workflow

1. Read the working workbook with `openpyxl` and record headers, populated rows, types, field positions, styles, and UUIDs.
2. Read the source workbook using `data_only=True` for quantities, GSP, and EXP so Excel formulas are converted to their cached values. Do not save this `data_only` workbook.
3. Copy the known-working workbook to a new output path, then replace only its data rows. Preserve the header, column widths, and styles.
4. Build target packs in the source ordering. Convert fixed and random rewards according to the rules above.
5. Verify before delivery:
   - no formula cells in import rows;
   - every random row has `Chance == Secret Chance` when this rule applies;
   - every fixed row has both chance columns blank;
   - each random bundle's Chance total is exactly 100 (allow a small floating-point tolerance);
   - wallet rewards use `WALLET_CREDIT` and the value is in `Currency ID`;
   - GSP and Player EXP are present when specified;
   - all rows use the requested Tier;
   - no unexpected packs appear in the file.
6. Report the output path and the validation summary concisely.

## Safety checks

- Never change the source workbook.
- Do not guess UUIDs, item IDs, or rate semantics.
- Do not represent a fixed reward as a random row with `100` chance.
- Do not add Secret Chance to fixed rows unless the user explicitly requests it.
- If Chance totals differ from 100, report the source discrepancy instead of silently normalizing rates.
