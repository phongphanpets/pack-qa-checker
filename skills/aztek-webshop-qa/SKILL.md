---
name: aztek-webshop-qa
description: Verify TOSM Web Shop packs against their Aztek Product and Bundle configuration without purchasing or changing live data. Use when a user asks to check a pack on the real website, validate Web Shop prices/GSP/items/chances, inspect a scheduled pack cutover, or QA a post-import pack.
compatibility: Requires an authenticated Edge or Chrome session for the TOSM Web Shop, access to Aztek Tool read views, and the applicable pack specification or import workbook.
---

# Aztek Web Shop QA

Validate the player-visible Web Shop after a pack has been configured in Aztek. This is a read-only QA workflow: report discrepancies and evidence; never correct production data unless the user explicitly asks for a separate change.

## Establish the target manifest

Before checking, collect the stable identifiers for each target pack:

- Product UUID and linked fixed/random Bundle IDs;
- expected display name, SP price, GSP bonus, rank, category, tags, purchase limit, reset interval, and sale window;
- expected fixed rewards, bonus rewards, and random outcomes; and
- any planned old-to-new cutover time.

Use Product UUID and Bundle ID as the identity. A display name may belong to an older Product as well as the current one.

For an import workbook, use `aztek-bundle-import` to establish the expected bundle rows first. Do not infer item IDs, rates, or cutover behavior from a matching display name.

## Access the live shop safely

- Use the user's existing Edge or Chrome session to open `https://tosm-portal.exe.in.th/shop/rank`.
- Cloudflare and login must be completed by the user in that browser. If either blocks access, report `AUTH_REQUIRED` and ask the user to complete it, then continue in the same session.
- Never run a headless-bypass flow, copy browser cookies, inspect session storage, or request credentials.
- Use only read/navigation actions: category filters, detail dialogs, and expanding the random-item list are allowed. Never press a buy, order, confirm, payment, save, or edit control.

## Read-back workflow

1. Read the Aztek Product and Bundle details without editing. Confirm the Product is enabled, not hidden, and has the expected price, time window, limits, reset values, category, tags, and linked bundle IDs.
2. Open the matching Web Shop category and locate the Product by the target manifest, not just name.
3. Read the card and its item-detail dialog. Record visible name, SP price, GSP award, rank/tags, purchase availability, limit, reset countdown, fixed rewards, bonus rewards, and every visible random outcome.
4. Compare Web Shop values with Aztek and the source specification:
   - SP price and GSP award;
   - category, rank, tags, limit, reset interval, and active sale window;
   - every fixed/bonus item name and quantity; and
   - every random item name, quantity, and displayed Chance. Random Chance must total 100% within floating-point tolerance.
5. The Web Shop does not expose Secret Chance. When Aztek is configured with `Secret Chance == Chance`, compare the visible website Chance to that common Aztek value. Otherwise mark Secret Chance as `NOT_VISIBLE_ON_WEBSITE`, not a website failure.

## Scheduled cutovers and duplicate names

Treat old/new Products with the same display name as separate records.

- Before the configured new-start time, judge the old Product against its own expected state.
- After the configured old-end time, require the old Product to be absent or in its user-specified end state, and require the new Product to be visible and purchasable.
- During a configured overlap or propagation window, report `EXPECTED_OVERLAP` rather than `FAIL`.
- If no cutover schedule is supplied, a visible duplicate is `REVIEW`, not automatically a failure.

Use a small, user-approved propagation grace period when checking immediately around a time boundary. Do not invent a universal duration.

## Report

Return one result per Product:

`PASS`, `FAIL`, `REVIEW`, `UNVERIFIABLE`, or `AUTH_REQUIRED`.

For each non-PASS result, state the Product UUID/Bundle IDs, expected value, observed value, source, and whether a read-only screenshot or visible page detail supports it. Keep `UNVERIFIABLE` separate from `FAIL` when a page does not expose a field or the session cannot load it.

## Automation boundary

The safe first automation is a read-only Website QA runner that consumes a target manifest and pauses on `AUTH_REQUIRED`. A separate, explicitly confirmed import workflow may prepare a dry-run and post-import read-back, but it must not purchase from the Web Shop or save Aztek changes without the user's explicit confirmation for that batch.
