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
- Use `bundle_id` as pack identity and `item_id` as item identity. Do not match packs/items by display name alone.
- Receipt is evidence/presence review only; it is not an OCR source in this phase.
- Aztek Tool (older code may use the source key `admin`) is important for pack name and open/close time. In the new direction, prefer an authenticated Aztek API read-back over screenshot OCR.

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
