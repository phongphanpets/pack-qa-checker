# Request Hub server

GitHub Pages hosts the interface at https://phongphanpets.github.io/pack-qa-checker/.
The team has not provided a server yet. Bundle-only paste/manual exports now run in the browser using the bundled XLSX templates, including separate ZIP workbooks and standalone Product export. These exports do not send request data to an API or save shared History. Loading the website and template assets still requires network access; full offline caching is not implemented.

Run the API below on a server with persistent storage, then enter its HTTPS URL and access token in the Pages connection panel for shared Requests, History and XLSX upload. Exports associated with an existing Request continue through the API to preserve its artifact history.

## Deployment

From the repository root:

```sh
docker build -f web/Dockerfile.api -t request-hub-api .
docker run -d --restart unless-stopped --name request-hub-api \
  -p 127.0.0.1:3003:3003 \
  -v request-hub-data:/data \
  --env-file /secure/path/request-hub.env request-hub-api
```

Create that environment file outside the repository, with:

```text
PACK_QA_API_TOKEN=<long randomly generated team access token>
PACK_QA_ALLOWED_ORIGIN=https://phongphanpets.github.io
PACK_QA_DISCORD_WEBHOOK_URL=<optional Discord webhook>
```

Place an HTTPS reverse proxy in front of port 3003. Forward Authorization and support OPTIONS. The frontend sends a bearer token with every request and download. CORS accepts only the configured origin. Token is stored in browser sessionStorage, endpoint in localStorage. This is team-token access, not individual accounts; history does not claim verified actor identities. Rotate the server token to revoke access.

The image uses only Node built-ins and includes the import templates. Run one API process against a data volume. Mutations are queued and metadata updates use atomic rename. Multiple processes require a transactional database before scaling. Back up the entire volume, including import_requests.local.json and request_exports; keep backups private because they contain request data and source attachments. The API does not automatically migrate an existing workstation's data.

Without Docker, run Node 22 from web/ with PACK_QA_API_ONLY=1, PACK_QA_HOST=127.0.0.1, PORT=3003, PACK_QA_DATA_DIR set to a persistent directory, and the credentials above. Terminate TLS at the reverse proxy.

## Checks

Run `node --test tests/request-api.test.mjs tests/request-events.test.mjs` from web/. This starts an isolated API, checks authorization, CORS, concurrent creates, status events, template export/upload, restart persistence, and byte-identical re-download. Test artifacts go under outputs; no real request records are changed.

After deployment, create a sample request through Pages, change its status, export and reopen it from a second browser with the same endpoint/token. Verify the timeline and download. Discord is optional and requires a real webhook; automated tests do not send real notifications.

## Portable conversion skill

Copy `skills/aztek-import/` into the other machine's Codex skills directory (normally `~/.codex/skills/`). Ask Codex to use `$aztek-import` with a request table and the latest Aztek template. This skill generates files directly and does not require this web application or server.
