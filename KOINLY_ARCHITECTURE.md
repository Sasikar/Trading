# Koinly → Trading architecture

## Target architecture: live mobile login + browser scraping

GitHub Pages remains the UI. The authenticated Koinly browser lives on Cloudflare Browser Run, not on the phone and not in GitHub Actions.

`Trading GitHub Pages → Cloudflare Worker → Browser Run / Playwright → Koinly → D1 → Trading dashboard`

### Login flow

1. Trading opens the private `/login` endpoint.
2. Cloudflare starts/reconnects the persistent Browser Run session.
3. The worker returns a Cloudflare Live View URL.
4. On the phone, the user opens that URL and manually signs into Koinly with Google.
5. The browser session remains the same session; no Google password, Koinly password, or browser cookie is sent to GitHub or to the dashboard.
6. Trading calls `/sync`; Playwright reconnects to the same Browser Run session and reads Koinly Transactions.
7. Normalized transaction JSON is written to Cloudflare D1.
8. Trading reads the latest rows from `/transactions` and renders the portfolio.

Cloudflare Browser Run supports Playwright, reusable sessions, Live View, and Human-in-the-Loop authentication handoffs. Sessions can be kept alive for up to 10 minutes of inactivity, so the intended UX is: open Login → authenticate → return and press Sync. If Koinly has timed out, Login simply starts another manual login. The authenticated session is never committed to Git. 

## Security

- `KOINLY_ACCESS_KEY` is a Cloudflare Worker secret protecting `/login`, `/sync`, and `/transactions`.
- The access key must never be committed to GitHub.
- Raw Koinly browser session state is held by Cloudflare Browser Run; it is not stored in GitHub Actions artifacts.
- D1 contains normalized transaction records, not Google/Koinly credentials.
- The GitHub Pages frontend should keep the access key in the user's browser/local storage rather than hard-code it into the repository.

## Current implementation in this repository

- `cloudflare/koinly-worker/wrangler.jsonc` — Browser Run, D1 and Durable Object configuration.
- `cloudflare/koinly-worker/src/index.ts` — Worker, Live View login handoff, reusable Playwright session and D1 sync API.
- `cloudflare/koinly-worker/schema.sql` — transaction/sync schema.

## Remaining deployment steps

1. Create the D1 database `trading-koinly` and put its database ID into `wrangler.jsonc`.
2. Deploy the Worker.
3. Add the `KOINLY_ACCESS_KEY` Worker secret.
4. Test `/login` from the phone and complete Google login through Live View.
5. Test `/sync` and inspect the actual authenticated Koinly DOM. Koinly's UI selectors are intentionally an adapter layer and may need one adjustment after the first real login.
6. Connect the Portfolio page to `/transactions`.

## Legacy approach

The previous GitHub Actions + `KOINLY_STORAGE_STATE_B64` approach is not the desired mobile architecture. A GitHub-hosted runner cannot see a login session created in the phone browser. It can remain as a fallback/manual experiment, but it should not be the source of truth for live Koinly data.
