# Helius → Coins (auto top-100)

You do **not** paste 100 addresses by hand. After the API key is on the Worker, `GET /helius?sync=1` creates/updates one Enhanced SWAP webhook with whatever SOL leaders are live.

## One secret (Cloudflare, not git)
Worker `trading-ohlcv` → Settings → Variables → Encrypt:

```
HELIUS_API_KEY = <paste from dashboard.helius.dev>
```

Then open:

```
https://trading-ohlcv.sasipudi.workers.dev/helius?sync=1
```

Expect `{ ok:true, addresses:~90+, webhookId:"..." }`.

Leaders already refresh every 6h. Hit `?sync=1` again after that (or we sync when you open `/helius?sync=1`). Free plan: 1 webhook, enough for ~100 addresses.

Do not commit the key. Test app still: put it only in Cloudflare secrets.
