# Pages and History delivery

Requested outcome: publish the current Request Hub on GitHub Pages, finish History (status and reusable export files), and deliver a portable Aztek conversion skill in Git.

Verified 2026-09-08:
- GitHub Pages exists at https://phongphanpets.github.io/pack-qa-checker/ and currently serves the root of main.
- Current application work is on master. No Actions Pages deployment workflow exists yet.
- A separate Vite client entry is in web/pages-client; build with `npx vite build --config vite.pages.config.ts` from web. Existing vinext/server configuration remains available.
- Request Hub calls /api/requests, /api/google-sheets, /api/read-spreadsheet, /api/bundle-import and /api/product-import. GitHub Pages cannot execute these server endpoints.
- The active local backend is web/asset-preview-proxy.mjs (not the older Python RequestStore). It stores data/import_requests.local.json and data/request_exports. New events record creation, status changes and export artifact IDs. RequestHub now exposes all export versions and the recorded timeline. Unit test web/tests/request-events.test.mjs and Pages build pass; live integration and concurrent-write handling remain unverified.
- History currently falls back to browser localStorage on network errors. This is not shared, cross-device history. Do not present that fallback as a completed shared History feature.
- skills/aztek-import is a standalone conversion skill. Copy the entire folder to the destination Codex skills directory; it does not depend on application code.
- Skill frontmatter and workflow YAML validated with js-yaml; referenced format.md exists. The bundled Python validator's YAML dependency is unavailable.

User clarification: no shared server exists yet; prepare the server for deployment. Dockerfile.api and docs/server-setup.md provide this. Pages can publish with an explicit connection panel; shared functionality will be enabled after the team deploys the API. This supersedes the earlier live-backend deployment gate below.
- API integration test now verifies eight simultaneous requests, authorization/CORS, history, template export and spreadsheet reading, persistence across restart, and byte-identical downloads. Pages browser smoke test passes. JSON writes are serialized within one process and atomically replaced.

Remaining delivery gates:
1. Implement the Pages API/storage strategy, including request status history and retained downloadable exports. Keep webhook credentials on a server. Do not ship a Pages screen whose normal export/upload path fails on missing /api routes.
2. Verify create, reload, status changes, reopening source, and re-downloading original export files. Verify cross-device history against a shared backend before claiming that capability.
3. Build and test the Pages entry, add deployment automation, publish and check live assets and workflows.
4. Validate the portable skill and push all finished changes. The overall goal is not complete until deployment and History are verified.
