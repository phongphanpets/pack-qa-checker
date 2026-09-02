---
name: aztek-bundle-import
description: Convert a Flash Sale or pack-spec workbook into a validated Aztek Bundle Import `.xlsx` using the confirmed nine-column import layout. Use whenever the user asks to create, repair, migrate, or validate an Aztek bundle import, Flash Sale import, gacha pack import, Golden Seed Point (GSP), Player EXP, Chance, Secret Chance, or wallet-coin mapping. When a known-working import workbook is supplied, make it the canonical template.
compatibility: Requires Python with openpyxl, a source specification workbook, and a known-working Aztek import workbook.
---

# Aztek Bundle Import

Create an import-ready workbook from the requested source tab. A workbook that the user confirms has imported successfully is the source of truth for headers, item types, field placement, repeated values, and formatting. Do not apply an earlier schema when it differs from that confirmed template.

## Inputs to establish

1. Source workbook and the exact source tab(s).
2. The confirmed-working import template.
3. Target pack names. Exclude packs the user has already imported unless asked.
4. Current mapping rules, especially UUIDs for wallet credits.

Do not invent an item ID, UUID, chance, or item type. Ask when a required mapping is missing.

## Confirmed import format

Use this exact nine-column order:

`Bundle Name`, `Bundle Type`, `Item Type`, `Item ID`, `Quantity`, `Tier`, `Position`, `เรทสุ่ม`, `เรทโชว์`

The workbook has no `Send Immediately`, `Currency ID`, `Monarchy ID`, `Chance`, or `Secret Chance` columns. In this format:

- `เรทสุ่ม` is Chance.
- `เรทโชว์` is Secret Chance.
- `Position` starts at `1` and increments by one within each bundle.
- Use `Tier = Trainee` when the user requests Trainee for all rows.

## Item conversion rules

| Source value | Item Type | Item ID |
|---|---|---|
| Regular item | `ITEM` | Numeric source item ID |
| `Gold_Cur` | `ITEM` | `101147` |
| `TP_Cur` | `ITEM` | `101145` |
| `Diamond` | `ITEM` | `101146` |
| Golden Seed Point | `WALLET_DEBIT` | `Golden Seed Point` |
| Player EXP | `PLAYER_EXPERIENCE` | `PLAYER_EXPERIENCE` |
| `Popo_Kupo_1` / Kupole Coin | `WALLET_CREDIT` | `a15e08db-9f3f-4bd2-a8bf-d4bb451e192d` |
| `Popo_Fellow_1` / Fellow Coin | `WALLET_CREDIT` | `a15e08fd-4e26-4256-a1e4-068ef2db9e56` |
| `Popo_God_1` / God Coin | `WALLET_CREDIT` | `a15e0918-7fe8-44af-af85-fd8250a1a78a` |

Do not use coin display names as Item ID values. The UUID is required for each wallet-credit coin.

## Pack conversion

### Fixed packs

- Set `Bundle Type = FIXED`.
- Fixed source rewards with no rate remain fixed.
- Leave both `เรทสุ่ม` and `เรทโชว์` blank.
- Include Golden Seed Point and Player EXP when specified in the source.

### Random packs

Create two bundles:

1. `<pack name> [Fixed]` contains guaranteed rewards, Golden Seed Point, and Player EXP. Use `FIXED` and leave both rate columns blank.
2. `<pack name> [Random]` contains chance-based rewards. Use `RANDOM`.

Copy source probabilities as numeric percentage values: for example, source `0.1` remains `0.1`, not `0.001`. Set `เรทโชว์` equal to `เรทสุ่ม` for every random row unless the user supplies a different display-rate rule.

## Build workflow

1. Inspect the confirmed template, including populated rows, styles, and field conventions.
2. Read source quantities, GSP, and EXP using `data_only=True`; source Excel formulas must become their cached values, not formulas in the import file.
3. Copy the confirmed template to a new output file. Preserve the header, widths, and row styling; replace only data rows.
4. Convert the selected packs in source order. Assign positions within each bundle after all rows are determined.
5. Validate before delivery:
   - no formulas in import rows;
   - every random row has `เรทสุ่ม == เรทโชว์` when this rule applies;
   - every fixed row has both rate columns blank;
   - each random bundle has a rate total of 100, with a small floating-point tolerance;
   - all wallet coins use `WALLET_CREDIT` and their confirmed UUIDs;
   - Golden Seed Point is `WALLET_DEBIT / Golden Seed Point`;
   - Player EXP is `PLAYER_EXPERIENCE / PLAYER_EXPERIENCE`;
   - every bundle's positions are consecutive from 1;
   - all rows use the requested Tier;
   - no unexpected packs appear.
6. Report the output path and a concise validation summary.

## Safety checks

- Never alter the source workbook.
- Never substitute a fixed reward with a 100% random reward.
- Do not add rates to fixed rows unless the user explicitly requests it.
- If a random-rate total is not 100, report the source discrepancy; do not silently normalize it.
