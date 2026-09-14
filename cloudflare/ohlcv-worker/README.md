# trading-ohlcv

API-only Cloudflare Worker. **Does not host GitHub Pages and has no login.**

GitHub Pages (`sasikar.github.io/Trading`) only *reads* this API.

**Full breakout logic / architecture / alerts:** [`docs/BREAKOUT.md`](../../docs/BREAKOUT.md) at repo root. Update that file in the same commit as engine changes.

- Polls DexScreener for saved CAs (`data/ca-recents.json`)
- Builds 1m/5m/10m/15m/30m/1h/2h/4h candles in a Durable Object
- 1m breakout only for the **focus** coin
- Telegram DM from the worker (phone can be locked)

Live: `https://trading-ohlcv.sasipudi.workers.dev/health`
