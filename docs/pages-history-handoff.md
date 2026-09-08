# Pages and History delivery

Scope clarification on 2026-09-08: the team has no shared server yet. The user requested server preparation for later deployment. Do not claim the public site already has a running shared backend.

## Delivered source

- Source branch: master. Static publication branch: gh-pages. URL: https://phongphanpets.github.io/pack-qa-checker/.
- Pages entry: web/pages-client, built with `npx vite build --config vite.pages.config.ts` from web. This entry is separate from the existing vinext application.
- The Pages connection panel accepts a server HTTPS URL and session-only team access token. Requests and downloads use the configured server. Before connection, the UI explicitly reports shared History, XLSX reading and export as unavailable; text parsing remains usable.
- API server: web/asset-preview-proxy.mjs. Dockerfile.api packages Node and the actual import templates, with no npm runtime dependencies. Deployment steps and persistent-volume details are in docs/server-setup.md.
- History records creation, status transitions and export artifacts. All export versions can be downloaded. Single-process writes are queued and atomic, with bounded Windows file-lock retries. Historic records without events are not given invented timelines.
- API integration tests verify eight concurrent requests, access control/CORS, source retention, XLSX reading, export, restart persistence and byte-identical download. Pages browser smoke tests cover client startup and pasted-table parsing. Local and Pages builds pass.
- skills/aztek-import is a portable skill independent of the application. YAML frontmatter and references validated using js-yaml. The bundled Python validator could not run due to its unavailable YAML dependency.

## Publication maintenance

GitHub OAuth rejected workflow creation because workflow scope is absent. docs/pages-workflow.example.yml is an optional workflow to install once that scope is available. Current publication uses compiled web/dist-pages files on gh-pages with .nojekyll, not the main branch or a running Node server.

For updates, build and verify web/dist-pages, then commit those public files to gh-pages. Do not publish templates, request records, credentials or source attachments as static assets. Changing source on master alone does not update the published site.

## Later server rollout

The team must deploy the prepared API behind HTTPS with persistent storage and configure a team token. Then enter its URL/token in Pages and verify a request from a second browser. Discord remains optional and requires the team's webhook. No real Discord messages were sent in automated tests. The Docker image recipe is supplied; integration tests run the same Node entry directly, not a Docker daemon.
