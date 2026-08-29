# Trading site Worker (password gate)

Serves the Trading static site behind `TRADING_PASSWORD` (Cloudflare Worker Secret).

## Deploy

```bash
cd cloudflare/trading-site
npm install
npx wrangler secret put TRADING_PASSWORD   # only if not already set
npm run deploy
```

Requires Cloudflare account login (`npx wrangler login`) or `CLOUDFLARE_API_TOKEN`.

## Verify

1. Open https://trading.sasipudi.workers.dev/ → login page
2. Wrong password → error, still on login
3. Correct password → Trading UI + cookie
4. Open https://trading.sasipudi.workers.dev/pulse.html without cookie → login
