# Helius → Coins (overlap only)

Coin selection list. Not candles. Not a buy signal.

## What you get
- `POST /helius` stores SWAP/TRANSFER buys for FOMO SOL leaders
- `GET /wallets` `coins[]` = mints bought by **2+** watched wallets
- `score` = number of those wallets (sorted **ascending**: 2, then 3, then 4…)

## One-time setup (free Helius)
1. https://dashboard.helius.dev → API key
2. Webhooks → Enhanced → transaction types `SWAP`
3. URL:

```
https://trading-ohlcv.sasipudi.workers.dev/helius
```

4. Addresses: every `sol` field from `/wallets` `leaders` (skip blank)
5. One webhook can hold all ~100 addresses on the free plan

Optional Worker secret:

```
HELIUS_WEBHOOK_SECRET = any string
```

Then append `?secret=THAT_STRING` to the webhook URL. Do not commit the API key.

Hard-refresh Wallets → Coins after deploy. Empty until two watched wallets buy the same mint.
