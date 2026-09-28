# Pack QA Checker — Web UI

เว็บสำหรับตรวจข้อมูลแพ็กจาก Excel Req, ภาพ Website และ Aztek Tool โดยแปลงข้อมูล
เข้าสู่ canonical pack model ก่อนประเมินด้วย rule engine เดียวกัน

## Prerequisites

- Node.js `>=22.13.0`

## Quick Start

```bash
npm install
npm run dev
npm run build
```

เปิด `http://localhost:3000` หลังรันคำสั่ง `npm run dev`

## Private Google Sheets in Import Studio

The Google Sheet source in Import Studio reads a sheet through the signed-in user's Google account. It lists tabs and loads the selected tab directly into the existing Bundle/Product preview. It never writes to the source sheet. Access tokens stay in browser memory; only an optional OAuth Client ID is saved locally.

One-time Google Cloud setup:

1. Enable the Google Sheets API and configure the OAuth consent screen. For an external app in testing, add the Google accounts that will use it as test users.
2. Create an OAuth client of type **Web application**. Add the actual web origin under **Authorized JavaScript origins**, for example `https://phongphanpets.github.io` for GitHub Pages or `http://localhost:3003` for a local preview. Do not include a path such as `/pack-qa-checker/`.
3. The GitHub Pages OAuth Client ID is configured in the app. Set `VITE_GOOGLE_CLIENT_ID` at build time only to use a different Google Cloud project. A Client ID is public configuration, not a client secret. Never put a client secret or access token in the frontend.

The user must already have Google access to the spreadsheet. `spreadsheets.readonly` allows reading spreadsheet data but not editing it. Google remembers consent for the same account and OAuth Client ID; the app requests a fresh short-lived token from a user click when needed without forcing consent again. Tokens are not persisted. No Request Hub server is required for this browser-side source. The existing Request Hub Google Sheet route is separate and still expects a link-viewable sheet/server.

## Tests

```bash
npm test
```

## Workspace Auth Headers

OpenAI workspace sites can read the current user's email from
`oai-authenticated-user-email`.

SIWC-authenticated workspace sites may also receive
`oai-authenticated-user-full-name` when the user's SIWC profile has a non-empty
`name` claim. The full-name value is percent-encoded UTF-8 and is accompanied by
`oai-authenticated-user-full-name-encoding: percent-encoded-utf-8`.

Treat the full name as optional and fall back to email when it is absent:

```tsx
import { headers } from "next/headers";

export default async function Home() {
  const requestHeaders = await headers();
  const email = requestHeaders.get("oai-authenticated-user-email");
  const encodedFullName = requestHeaders.get("oai-authenticated-user-full-name");
  const fullName =
    encodedFullName &&
    requestHeaders.get("oai-authenticated-user-full-name-encoding") ===
      "percent-encoded-utf-8"
      ? decodeURIComponent(encodedFullName)
      : null;

  const displayName = fullName ?? email;
  // ...
}
```

## Optional Dispatch-Owned ChatGPT Sign-In

Import the ready-to-use helpers from `app/chatgpt-auth.ts` when the site needs
optional or required ChatGPT sign-in:

- Use `getChatGPTUser()` for optional signed-in UI.
- Use `requireChatGPTUser(returnTo)` for server-rendered pages that should send
  anonymous visitors through Sign in with ChatGPT.
- Use `chatGPTSignInPath(returnTo)` and `chatGPTSignOutPath(returnTo)` for
  browser links or actions.
- Pass a same-origin relative `returnTo` path for the destination after sign-in
  or sign-out. The helper validates and safely encodes it.
- Mark protected pages with `export const dynamic = "force-dynamic"` because
  they depend on per-request identity headers.

Dispatch owns `/signin-with-chatgpt`, `/signout-with-chatgpt`, `/callback`, the
OAuth cookies, and identity header injection. Do not implement app routes for
those reserved paths. Routes that do not import and call the helper remain
anonymous-compatible.

SIWC establishes identity only; it does not prove workspace membership. Use the
Sites hosting platform's access policy controls for workspace-wide restrictions,
or enforce explicit server-side membership or allowlist checks.

Use SIWC for account pages, user-specific dashboards, saved records, and write
actions tied to the current ChatGPT user. Leave public content anonymous.

## Useful Commands

- `npm run dev`: start local development
- `npm run build`: verify the vinext build output
- `npm test`: build the starter and verify its rendered loading skeleton
- `npm run db:generate`: generate Drizzle migrations after schema changes

## Learn More

- [vinext Documentation](https://github.com/cloudflare/vinext)
- [Drizzle D1 Guide](https://orm.drizzle.team/docs/get-started/d1-new)
