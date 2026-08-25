# Koinly → Trading architecture

## What works on mobile today

GitHub Pages is a static site, so it cannot run a Python/Playwright process or access Koinly's authenticated cookies. The Portfolio page therefore uses Koinly's own transaction export and parses the CSV locally in the phone browser.

Flow:

1. Open Koinly and sign in with Google normally.
2. Go to Transactions.
3. Use `⋮` → `Bulk edit in Excel` → `Export`.
4. Return to Trading → Portfolio and choose the downloaded CSV.
5. The page renders the transaction table locally. No Koinly credentials or session cookies are collected.

Koinly documents that the Transactions page can export the currently filtered transactions, or all transactions when no filter is applied, through Bulk edit in Excel.

## Why the earlier Playwright idea cannot be fully automatic from GitHub Pages

A GitHub Actions runner is a different machine from the user's Android browser. A login performed on the phone creates browser session state on the phone; a GitHub-hosted Playwright runner cannot see those cookies. GitHub Pages also has no server process to receive or proxy the authenticated Koinly session.

## Future true-live architecture

If we want unattended scraping later, add a private browser-worker service:

`Trading GitHub Pages → private browser worker → Playwright → Koinly → normalized JSON → encrypted store → Trading GitHub Pages`

The worker would need a persistent browser profile. The user would authenticate once through a mobile-accessible remote browser, then the worker could reuse the session until Koinly expires it. The worker must never commit raw cookies/session files to Git.

For now the CSV path is the reliable mobile solution and avoids storing Google/Koinly credentials.
