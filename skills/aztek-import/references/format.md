# Established Aztek format

These mappings reflect the user's confirmed imports. A newer supplied working template takes precedence.

## Bundle

Sheet: `Import Bundle_Final Cleaning` (Excel limits sheet names to 31 characters; preserve the actual template's name).

Columns, in exact order:

| Column | Header | Value |
| --- | --- | --- |
| A | Bundle Name | Full name on every item row |
| B | Bundle Type | FIXED or RANDOM |
| C | Item Type | Mapping below |
| D | Item ID | Mapping below; preserve numeric-looking identifiers as text |
| E | Quantity | Number |
| F | Tier | Trainee by default |
| G | Position | 1-based position, restarting for each bundle |
| H | เรทสุ่ม | Numeric random Chance; blank for Fixed |
| I | เรทโชว์ | Display/Secret Chance; copy H when requested equal |

Do not add an unverified Send Immediately column. The user wants immediate delivery, but the multi-bundle parameter has previously failed. Preserve an explicitly verified template field if supplied; otherwise disclose that this setting needs manual adjustment in Aztek.

| Source identifier | Item Type | Export Item ID |
| --- | --- | --- |
| Popo_God_1 | WALLET_DEBIT | God Coin |
| Popo_Fellow_1 | WALLET_DEBIT | Fellow Coin |
| Popo_Kupo_1 | WALLET_DEBIT | Kupole Coin |
| Gold_Cur or Currency explicitly named Gold | ITEM | 101147 |
| Diamond_Cur | ITEM | 101146 |
| GSP | WALLET_DEBIT | Golden Seed Point |
| PLAYER_EXP | PLAYER_EXPERIENCE | Player Experience - tosm |
| Other confirmed numeric item ID | ITEM | Original ID |

Do not treat every Currency row as Gold: inspect its name. Royal Chamber Key had a user-supplied `DEBIT Royale Chamberkey` correction; verify its exact type/ID cells against a working template before using it. Likewise the custom Tier `UR)` is a task-specific value, not a global replacement for item names containing UR.

## Product

Use the `Products` sheet from the supplied template. Existing schema has 34 columns A:AH:

```text
เซิฟเวอร์เกม
ชื่อสินค้า (ไทย)
ชื่อสินค้า (อังกฤษ)
หมวดหมู่
Tag(s)
รายละเอียด (ไทย)
รายละเอียด (อังกฤษ)
Thumbnail thai
Banner thai
Thumbnail en
Banner en
ลำดับการแสดง
เวลาเริ่มขาย
เวลาหยุดขาย
จำกัดการซื้อต่อ Player
Server
Character
Product
promotion reset count
last reset
next reset
active
test mode
hidden
currency 1
actual price
full price
currency 2
actual price 2
full price 2
currency 3
actual price 3
full price 3
Bundle Item 1 คำค้นหา
```

Server is GAME in the established template. The usual defaults are active TRUE, test mode TRUE and hidden FALSE; preserve template cell types and explicit instructions. Confirm missing dates/year; use Asia/Bangkok for relative dates. Full price is separate from actual price. Category must match the exact provided label, including bracket spacing. Social Point and Seed Point are distinct currencies.

A Product with Fixed and Random bundles remains one Product under the base name, without a Fixed/Random suffix. The application currently joins linked bundle names with comma-space; confirm this against a working Product template before treating it as a verified multi-bundle linkage. Do not invent backend bundle IDs or claim a Product import succeeded without feedback.
