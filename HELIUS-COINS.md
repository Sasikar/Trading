# Helius → Coins (auto top-100)

You do **not** paste 100 addresses by hand. After the API key is on the Worker, `GET /helius?sync=1` creates/updates one Enhanced SWAP webhook with whatever SOL leaders are live.

## Secrets (Cloudflare Worker `trading-ohlcv`, encrypted)

```
HELIUS_API_KEY = <dashboard.helius.dev>
TELEGRAM_BOT_TOKEN = <from @BotFather>
TELEGRAM_CHAT_ID = <your chat or group id>
```

Telegram fires only when a mint is bought by 2+ watched wallets **and** DexScreener MC is ≥ $50k. Same coin is not re-pinged for 12 hours.

Then open:

```
https://trading-ohlcv.sasipudi.workers.dev/helius?sync=1
```

Expect `{ ok:true, addresses:~90+, webhookId:"..." }`.

Do not commit keys.
