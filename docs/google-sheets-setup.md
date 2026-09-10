# Google Sheets Request Hub

## Current State

The Google backend and installable app package are implemented. They are NOT deployed to a Google account yet. Local tests use mocked Google services; a real-account acceptance test is required before team use.

This is a separate Apps Script deployment of the existing Request Hub UI. The GitHub Pages URL remains the standalone export version. Do not enter an Apps Script `/exec` URL in the Pages server connection field: the app uses Google's authenticated `google.script.run`, not an anonymous cross-origin API.

## Install

1. From `web`, run `npm run build:google`. The package is written to `outputs/google-apps-script`.
2. The team owner creates a standalone project at https://script.google.com/ and adds `Code.gs`, `Index.html`, and `appsscript.json` from the package. Enable showing the manifest in Project Settings. The manifest enables Drive API v3; enable the Drive API in the associated Cloud project if Google asks.
3. Run `setupHub` from the script editor and approve Google permissions. It creates a private spreadsheet named `GP Request Hub` and private folder `GP Request Hub Files`. URLs appear in the execution log. Re-running setup reuses the configured resources.
4. In Script Properties, set `ALLOWED_EMAILS` to comma-separated team emails. Set `REVIEWER_EMAILS` to the reviewers who may change status and save exports. Every reviewer must also be in `ALLOWED_EMAILS`. Defaults allow only the installing owner.
5. Share the new Sheet and Drive folder as Editor with these trusted team accounts, using explicit email invitations. Do not enable public link sharing. Because execution is per-user, users need underlying Google file permissions too. This is for a trusted internal team, not an untrusted customer portal: editors can edit records directly in Sheets.
6. Optional: set `DISCORD_WEBHOOK_URL` in Script Properties. Never put it in frontend code, the spreadsheet, or Git. Only a new Request triggers a notification; failures appear as FAILED and do not undo the Request.
7. Deploy as Web app, **Execute as: User accessing the web app**, **Who has access: Anyone with Google account** (not anonymous). The email allowlist still rejects non-team users. The checked-in manifest defaults to MYSELF deliberately; expand deployment access only after setting the allowlist and file sharing.
8. Open the deployment `/exec` URL and authorize as each team user. Distribute that URL, not the GitHub Pages URL, for shared Requests.

No passwords or shared API token are embedded in the webpage. Multiple Gmail accounts/domains are supported through an explicit email list. Google may display an OAuth consent warning or impose organization restrictions; the owner must resolve those account/deployment requirements. Do not switch to anonymous or execute-as-owner to bypass them.

## Data and Limits

- `Requests`: one canonical row per request. Readable columns show ID, title, status, requester, creation/update time. `record_json` contains source, payload, history and file references. Do not rename columns or edit JSON manually.
- History is part of the same canonical record so status and its history are saved together, not in separate partially committed tables.
- Drive stores attachments and generated XLSX/ZIP files. Exports are built in the browser using the original templates, then saved before download. Reviewers can download them again from History.
- Mutations use a script lock. An operation ID prevents duplicate Requests/files when retrying an uncertain response in the same browser session. Reloading loses the client retry key: check History before resubmitting after a reload.
- Up to 2,000 requests, 45,000 serialized characters per record including accumulated history, 10 attachments per request, about 5 MB per file, and 100,000 populated cells across an input workbook. These are conservative pilot limits, not a replacement for a database at large scale.
- XLSX reading uses a temporary private Google conversion, then moves the temporary file to Trash. CSV/Text parsing is unchanged. `.xls` is still unsupported.
- Reading a Google Sheet uses the accessing user's permissions. Private source sheets need to be shared with that user. Links do not grant access automatically.
- The backend stores trusted reviewer-generated imports; it does not independently validate XLSX contents or import them into Aztek. Item Code creation itself remains manual.
- Google Sheets writes and Drive operations are not a cross-service transaction. The app cleans new orphan files after a reported Sheet write failure, but abrupt platform termination can leave orphans. Retain backups, and do not delete files automatically without checking references.
- No migration of old local or Node-server history is performed.

## Acceptance Test Before Team Use

1. Owner runs setup, confirms private sharing, and opens `/exec` successfully.
2. GP creates a Web Shop request from pasted SP/Limit data. Another allowed account sees the same request after refresh.
3. Reviewer changes status, exports a Bundle and Product, refreshes History, and downloads the same files. Test importing these into Aztek test mode.
4. Test one uploaded XLSX and one private Google Sheet with tab selection.
5. Verify an unlisted Google account cannot open the app or invoke `hubApi`; a GP-only account cannot change status or save exports.
6. Submit twice during a simulated interrupted response and verify only one Request/file. Confirm Discord is sent only once when configured.

## References

- https://developers.google.com/apps-script/guides/web
- https://developers.google.com/apps-script/guides/html/communication
- https://developers.google.com/apps-script/manifest/web-app-api-executable
