# AI Handoff — Pack QA Checker

## Read this first

This repository contains a working Pack QA pilot and the agreed direction for its next MVP. The existing web app is useful as a QA proof of concept, but **do not treat its OCR-first screens as the final product direction**.

The team now wants to reduce manual work around pack import. The next product is an **Import + QA hybrid workflow**, with Aztek API as the preferred source of truth when access is available. Keep the existing canonical model, adapters, rule engine, evidence history, and `UNVERIFIABLE` behavior; evolve around them rather than replacing them.

## Current status

- Working pilot: local web app for comparing a request/spec, Website evidence, Aztek Tool evidence, and Receipt evidence.
- Evidence history/revisions, PM summary, OCR-assisted Website checks, random pack handling, and export/import feedback exist in the current app.
- The current local launcher is `เปิด Pack QA.cmd`; close its services with `ปิด Pack QA.cmd` before moving or compressing the folder.
- User data, evidence images, local database, runtime logs, Excel files, and exported feedback are deliberately ignored by Git. The public repository contains code and safe fixtures only.
- A FigJam board documents the new direction: [MVP workflow board](https://www.figma.com/board/Oyc3SCz7mBv18CapxDRenk).

## Agreed product direction: MVP

The aim is to make the usual path feel like two clicks:

1. Receive a request through the existing/manual channel.
2. **Click 1:** choose a standardized Excel file or Google Sheet.
3. Normalize the input into the canonical pack model.
4. Run preflight checks and show a batch preview.
5. **Click 2:** user confirms the batch.
6. Import Bundle/Shop using Playwright as the near-term browser fallback, or a supported Aztek API endpoint when available.
7. Read the imported record back from Aztek API, then verify Website state and capture screenshots.
8. Auto-pass clean packs; send only exceptions to a human queue and save an audit log/evidence report.

Do **not** include a new central request platform, Discord automation, automated Receipt OCR, multi-user deployment, or automatic retry in the first MVP. Those are later options, not current scope.

## Architecture that must remain intact

- Every source is adapted into the canonical pack model before validation. The rule engine must not know whether data came from XLSX, API, OCR, forms, or browser automation.
- Preserve provenance per value: `value`, `source`, `confidence`, `raw_text`, and `locator`.
- An unreadable or insufficiently evidenced value is `UNVERIFIABLE`, never a `FAIL`.
- Use `bundle_id` as pack identity and stable Product UUID for the sellable
  listing. Do not match packs/items by display name alone. For Aztek regular
  items, retain both internal Item ID and Item Kind and join against Item Kind
  (the identifier used by the import workbook); special rewards use their
  normalized type/UUID identity.
- Receipt is evidence/presence review only; it is not an OCR source in this phase.
- Aztek Tool (older code may use the source key `admin`) is important for pack
  name, configuration, and open/close time. When an authenticated session is
  available, prefer the read-only Product/Bundle DOM over screenshot OCR;
  prefer an authenticated API read-back only after its contract is documented.

## What is implemented vs. pending

| Area | State |
| --- | --- |
| Canonical model, YAML adapter, rules, synthetic regressions | Implemented |
| Local QA web app, evidence upload, report/history/revisions | Implemented pilot |
| Website OCR helper and human confirmations | Implemented pilot / fallback |
| Random pack observations and chance checks | Implemented pilot |
| Standardized Excel/Google Sheet batch import | Pending MVP |
| Playwright import automation | Pending MVP |
| Aztek API adapter, authenticated import, and read-back verification | Pending API documentation and credentials |
| Shared cloud history / central request intake / Discord | Explicitly deferred |

## Live TOSM/Aztek Inspector findings (snapshot: 2026-09-02)

The authenticated Edge session was used to inspect Aztek Tool pages without
clicking Save, Import, purchase, or payment controls. These are read-back
facts for the next implementation, not a promise that live values remain
unchanged:

- Product list route: `https://aztek-tools.exe.in.th/exe/tosm/shop/products`.
  Bundle list route: `https://aztek-tools.exe.in.th/exe/tosm/shop/bundles`.
  Product details use `/exe/tosm/shop/products/{product_uuid}/edit` and Bundle
  details use `/exe/tosm/shop/bundles/{bundle_id}`.
- Inspected Product UUIDs and Bundle IDs:
  - มือใหม่ I: Product `a2a59a9e-fd24-43cb-99e6-2d9ef9669431`, Bundle `115172` FIXED.
  - มือใหม่ II: Product `a2a59aef-283a-484b-8d93-4f0bd9b3be2a`, Bundle `115182` FIXED.
  - มือใหม่ III: Product `a2a59b16-58f8-4ead-8b21-98c41060a978`, Bundle `115183` FIXED.
  - TP & Gold 9.1: Product `a2a598c7-7e83-40d8-8ff8-3e8e88685fb9`, Bundles `115184` FIXED + `115185` RANDOM.
  - TP & Gold 9.2: Product `a2a59907-cabd-4f4f-b10a-09f16a18dd97`, Bundles `115186` FIXED + `115187` RANDOM.
- The Product DOM exposes name, category, tags, order, price/full price,
  sale start/end datetime, player/server/character/product limits, reset
  interval and next reset, enabled, test mode, hidden, currency, linked
  bundles, and which bundle is `Primary`.
- The Bundle DOM exposes Bundle Type, item quantities, Tier, internal Item ID,
  Item Kind, wallet/experience type, Chance (`เรทสุ่ม`), and display/Secret
  Chance (`เรทโชว์`). Random 9.1 and 9.2 each had 32 outcomes; both Chance and
  Secret Chance summed to 100%, with every pair equal.
- Fixed rewards inspected included Player Experience and Golden Seed Point.
  The observed Player EXP amounts were 99/149/199 for มือใหม่ I–III and 9/29
  for TP & Gold 9.1/9.2. Golden Seed Point amounts were 990/1490/1990 and
  90/290 respectively.
- All five Products were enabled and not hidden in the snapshot. All five
  also had `test mode` checked; treat that as `REVIEW` unless the target
  manifest explicitly requires a public listing. มือใหม่ reset every 30 days;
  TP & Gold reset every 1 day.
- A type mismatch was visible in the read-back: God/Fellow/Kupole Coin rows in
  both RANDOM Bundles displayed `WALLET`, while the confirmed import mapping
  requires `WALLET_CREDIT` plus the confirmed coin UUID. Golden Seed Point was
  also not consistent across inspected Bundles (`WALLET_CREDIT` in one and
  `WALLET` in others). The read-back adapter must report this rather than
  silently accepting a matching display name/quantity.
- Edge Inspector Network/CDP was unavailable and direct static chunks were
  blocked, so no API endpoint or authentication detail was inferred. If
  Cloudflare/login expires, return `AUTH_REQUIRED` and have the user sign in
  in the same browser session. Never inspect or copy cookies, storage, tokens,
  or credentials.

Implementation consequence: add an Aztek DOM read adapter behind the
canonical model, with a target manifest keyed by Product UUID/Bundle ID,
separate `aztek_item_id`/`item_kind`, normalized wallet types, and a dry-run
read-only Playwright runner. Keep real Import/Save as a separately confirmed
workflow.

## Important unknowns — do not invent them

Aztek API endpoints, authentication method, permissions, request schemas, response schemas, rate limits, and a safe test environment have **not** been provided. Before implementing API work, obtain a real example or official documentation and write a narrow adapter with fixtures/tests. Do not hard-code guessed URLs, tokens, or browser selectors.

The source spreadsheet still needs a stable template. Start the next implementation by agreeing a column map for pack metadata, fixed items, random outcomes, chances, limits, and eligibility. Input standardization is the bottleneck for reliable automation.

## Repository map

- `packqa/model.py` — canonical Pydantic domain model.
- `packqa/adapters/` — YAML and Website OCR adapter boundaries.
- `packqa/rules/engine.py` and `pack_rules.yaml` — validation rules.
- `packqa/web_api.py`, `packqa/history.py` — local API/history behavior.
- `web/` — local UI.
- `fixtures/` and `tests/` — regression data and automated tests.
- `presentation/pack-qa-presentation.html` — presentation artifact.
- `README.md` — operating notes for the current pilot; use this file for the newer MVP direction when the two differ.

## Safe first steps for the next AI

1. Read `README.md`, then this file, then run the existing tests before changing behavior.
2. Inspect the Figma MVP workflow and confirm its steps against any new Aztek/API information.
3. Build the spreadsheet normalizer and preflight report using fixture files first.
4. Add a Playwright or API adapter only behind the canonical model boundary, with a dry-run/preview mode before real import.
5. Preserve the existing QA flow as a fallback while the import MVP is being proven.

## Running locally

On Windows, open `เปิด Pack QA.cmd`; it opens the local app at `http://localhost:3000`. Use `ปิด Pack QA.cmd` to close only identified Pack QA services.

The launcher currently relies on local Python/Node tooling (and can use Codex-managed runtime paths). On a new computer, install/restore the required runtime first if the launcher reports it cannot start. Never commit `.runtime/`, `data/`, `evidence/`, `.env`, production tokens, user Excel files, or exported feedback.
