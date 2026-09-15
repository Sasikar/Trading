# Breakout system — source of truth

**Read this first** before changing Breakout, Telegram, Verdict-on-breakouts, or candles.

Last updated: 2026-09-15 (IST) — real 1D/1W/1M tape + Gecko backfill (2y keep)

| Status | What |
|---|---|
| **LIVE in code** | Everything in sections 1–12 |
| **FROZEN, not coded yet** | Daily PA, 1D tape, Feed, Backtest tab |

**Rule:** GitHub Pages is **display-only**. Dex polling, candles, scoring, sections, Telegram all live in the Cloudflare worker.

When you change any breakout number, alert rule, or UI section: **edit this file in the same PR.**

---

## 0. Glance (30 seconds)

```
Saved CAs (Pages ca-recents.json)
        ↓
Worker alarm every 60s → DexScreener ticks
        ↓
applyTick() builds 1m…4h candles (we own the tape)
        ↓
evaluateRow(tf)  →  “Did a breakout happen?”
        ↓
classifySection  →  EARLY / LIVE / MATURED  (quiet coins hidden)
        ↓
Telegram 🚀 only on LIVE (one ping per coin, ~30m cooldown)
        ↓
Pages Breakout tab GET /breakouts?tf=4h  (paint only)
```

**LIVE = opportunity detected. It is not BUY.**  
Tomorrow: `entryQuality()` answers “is it enterable *right now*?”

---

## 1. Where the code lives

| Piece | Path |
|---|---|
| Engine (candles, detect, alerts, hunter, verdict) | `cloudflare/ohlcv-worker/src/engine.js` |
| Durable Object, SQL store, 60s alarm | `cloudflare/ohlcv-worker/src/index.js` |
| Wrangler / cron | `cloudflare/ohlcv-worker/wrangler.jsonc` |
| Breakout UI (display) | `breakout-tab.js` + `#breakouts-panel` in `index.html` |
| Hunter UI | `hunter-tab.js` |
| Verdict UI | `verdict-tab.js` |
| Watchlist | `data/ca-recents.json` (Pages) + `watch_extra` in the worker |
| Live API | `https://trading-ohlcv.sasipudi.workers.dev` |
| Pages | `https://sasikar.github.io/Trading/index.html?tab=breakouts` |

Worker does **not** host Pages. No login on the worker.

---

## 2. Architecture

```
GitHub Pages (phone / desktop)
  breakout-tab.js  GET  /breakouts?tf=
  hunter-tab.js    GET  /hunter
  verdict-tab.js   GET  /verdict?ca=
           │
           │ display only
           ▼
Cloudflare Worker  trading-ohlcv
  fetch → Durable Object OhlcvEngine (one name: "main")
           │
           ├─ alarm every 60s → engine.tick()
           ├─ cron * * * * *  → GET /status (kick alarm only, no extra Dex)
           └─ SQL in the DO: ticks, open_bar, ohlcv, watch, alerts, meta
           │
           ▼
DexScreener  (quotes only — we do not use Dex OHLCV)
Telegram bot  MyTradingBreakoutBot  (private DM)
```

**Free-tier limit:** Durable Object **100,000 SQL writes / day**, reset **00:00 UTC = 5:30 AM IST**.  
Writes are skipped when a row is unchanged. Open candles stay in memory and flush every **5 minutes**. If this cap hits, API returns Cloudflare **1101**; Pages still load; live cards/Telegram pause until reset.

---

## 3. Data flow (one poll)

1. Load watchlist from Pages `ca-recents.json` (every **5 min**) + `watch_extra` (Hunter “save”).
2. `fetchDexPairsForCas` — batch Dex `tokens/v1/{ca1},{ca2},…` (chunk 12).
3. Pick highest-liquidity pair on that chain (SOL / ETH / Robinhood).
4. `pairToTick` → price, liq, m5, h1, h6, h24, vol5m/1h/24h, buys5m/sells5m, dexUrl.
5. `applyTick(ca, tick)`:
   - Persist tick (skip SQL if price/m5/h1/h6/liq/vol5m unchanged).
   - For each tape TF `1m 5m 10m 15m 30m 1h 2h 4h`:
     - Bucket `floor(t / tfSec) * tfSec`.
     - If bucket changed → **close** previous bar into `ohlcv`, start new **open** bar.
     - Else update high/low/close on the forming bar **in memory**.
6. Evaluate each target on needed TFs → maybe Telegram.
7. Hunter refresh (discover ~5 min, score ~90s) — separate from breakout detect.
8. Prune old 1m/5m…30m hourly; **1d / 1w / 1M kept 730 days**.
9. **Gecko 1D backfill** — one saved CA per alarm. Writes closed 1d (and resampled 1w / 1M). Never overwrites today.

**1d / 1w / 1M are real candles** (UTC day / Monday week / calendar month). Not Dex 24h %. `detectDexTf` is unused.

---

## 4. Candle tape (we own this)

| TF | Seconds | Closed bars needed before tape-break is allowed (`MIN_BARS`) |
|---|---|---|
| 1m | 60 | 20 |
| 5m | 300 | 16 |
| 10m | 600 | 12 |
| 15m | 900 | 12 |
| 30m | 1800 | 10 |
| 1h | 3600 | 8 |
| 2h | 7200 | 6 |
| 4h | 14400 | 6 (~24h of polling) |
| 1d | UTC midnight | 20 |
| 1w | Monday 00:00 UTC | 8 |
| 1M | 1st of month 00:00 UTC | 4 |

Keep **2 years** of 1d/1w/1M (`KEEP_LONG_MS`). Forming 1d/1w/1M stay in memory; **SQL write on close + backfill only** (not every 5 min).

**Closed vs forming**

- `store.bars(ca, tf)` = **closed** candles only. This is what `detectTapeBreakout` sees.
- Forming bar = `open_bar` (memory, SQL every 5 min). **Not** used in breakout detect today.
- Volume on a bar ≈ rise in Dex `vol24h` since previous tick (best-effort).

**60s poll honesty:** a 1m candle is typically **one sample**. Do not pretend we have second-by-second microstructure. After a DO wipe, 4h is `WARMING` until 6 closed 4H bars exist.

**Restart:** forming bars may be lost; closed `ohlcv` survives in DO SQL.

**Range high (the “level”)**  
Prior 20 **closed** bars’ highs, excluding the last bar: `max(prior.h)`. Printed on cards as `level` / `levelTxt`.

---

## 5. Breakout detection — `evaluateRow(tf)`

**This is the event engine. Do not replace it. Do not add a second one.**

```
evaluateRow(row, tf)
  no tick            → WARMING / NO TICK
  1m–4h / 1d / 1w / 1M, enough bars → detectTapeBreakout(closed, tf, tick)
  4h/2h/1h WARMING   → detectLegacy4h(tick)   mark live:true
  5m WARMING         → detectLive5m(tick)     mark live:true
  1d/1w/1M WARMING   → stay WARMING (no Dex-24h fake)
  then hitFrom() + entryQuality() + classifySection()
```

### 5.1 Tape break (`detectTapeBreakout`) — 1m…4h **and** 1d/1w/1M when warm

On the **last closed** bar vs prior range high:

```
broke = last.close > rangeHigh
     && last.close >= last.open
     && last.vol >= 1.5 × median(prior volumes)

heldBars = count of trailing closed bars with close >= rangeHigh × 0.998
```

| Condition | `event` | `state` | `fresh` |
|---|---|---|---|
| `broke` and `heldBars ≤ 2` | **NEW BREAKOUT** | EARLY | true, age 0 |
| close > high×0.995 and heldBars ≥ 1 | **BREAKOUT HELD** | STRONG CONFIRMED if age≤2 and volX≥1.3 and buyR≥0.52, else EARLY | age≤2 |
| not broke, close ≥ high×0.975, pushing, vol building, not stretched | **CLOSE TO BREAK** | — | near=true |
| else | — | WATCH | |

**Stretched (event-level, Dex windows — not “distance from this level”):**  
`h6 ≥ 80%` OR `h24 ≥ 150%` OR `m5 ≥ 35%`  
or tape `runup ≥ 18%` or this bar `ret ≥ 22%`  
→ if held/broke, `state = STRETCHED` (score −12).

If `n < MIN_BARS` → `WARMING` (not a break).

### 5.2 Legacy live 4h/2h/1h (`detectLegacy4h`) — tape still filling

Used only while 4h/2h/1h is WARMING.

- **NEW BREAKOUT (live):** Dex 5m ≥ +3% AND 1h ≥ +2% AND volX ≥ 1.5 AND not stretched
- **BREAKOUT HELD:** 1h > 0 AND 6h ≥ +8%
- **CLOSE TO BREAK:** 5m ≥ +1.2%, 1h ≥ 0, volX ≥ 1.15, not stretched

### 5.3 Live 5m (`detectLive5m`) — 5m tape still filling

- **NEW BREAKOUT (live):** 5m ≥ +4% AND volX ≥ 1.5 AND not stretched
- **BREAKOUT HELD:** 5m ≥ +2% AND 1h > 0
- **CLOSE TO BREAK:** 5m ≥ +1.5%, volX ≥ 1.15

### 5.4 Real 1d / 1w / 1M (not Dex 24h)

Same `detectTapeBreakout` vs last **closed** UTC candle’s range high.

**Backfill:** Gecko `/ohlcv/day?limit=180` — **one coin, one page, once per hour** (`GECKO_EVERY_MS`). Dex poll stays 60s. Full 180-day page → `partial`, next hour older `before_timestamp` until 730d or empty. Resample to 1w/1M. Meta `bf_long` / `bf_gecko_at`. 429 → skip until next hour.

**Alerts:** 1d/1w/1M Telegram only when that bar **just closed** this tick (no spam from history insert).

Until `MIN_BARS` exist (or backfill lands) the TF is **WARMING** — not a fake 24h HOLD.

### 5.5 Momentum score (`momentumFromTick`) — 0–100

| Input | Points |
|---|---|
| m5 ≥ 8 / 4 / 2 | +25 / +18 / +10 |
| volX ≥ 4 / 2 / 1.4 | +25 / +16 / +8 |
| h1 ≥ 5 and m5>0 | +16 |
| h1 ≥ 0 and m5 ≥ 2 | +10 |
| buyR ≥ 0.65 and trades≥20 | +15 |
| buyR ≥ 0.55 and trades≥10 | +9 |
| liq ≥ 200k / 50k / 15k | +10 / +7 / +4 |
| m5>0 and h1>0 | +5 |
| stretched | −18 |

`volX` = Dex vol5m / (vol1h/12)  
`buyR` = buys5m / (buys5m+sells5m)

---

## 6. Page sections (what you see)

`classifySection(det)` — **quiet coins (`''`) are not shown.**

| Section | When |
|---|---|
| **EARLY** | `CLOSE TO BREAK` / `near` — close to the level, **not** broken |
| **LIVE** | `NEW BREAKOUT` and (`fresh` or `age ≤ 1`) — happened **now** |
| **MATURED** | `STRETCHED` **or** `BREAKOUT HELD` / `STRONG CONFIRMED` / leftover `NEW BREAKOUT` — already happened |

Same coin may sit in **EARLY** (new cycle) and **MATURED** (old history) at once. Tell them apart with “Xm ago”.

### Matured history (`syncMatured`)

When a coin **is** matured this poll, remember it (`matured_hist` keyed `chain:ca:tf`).

| Field | Meaning |
|---|---|
| `held` | still in matured this poll |
| `broke` | had a history row, now spot **< level** |
| `failed` | faded off matured without holding |

TTL then delete:

| TF | Keep history |
|---|---|
| 1m | 6 hours |
| 5m / 10m / 15m | 24 hours |
| 30m / 1h / 2h | 2 days |
| 4h / 1d / 1w | 3 days |

**History does not Telegram.**

---

## 7. ALIGNED (multi-TF)

TFs: `5m 10m 15m 30m 1h 2h 4h 1d 1w` (**1m excluded**)  
A coin is ALIGNED if **≥ 2** of those have a non-empty section (early/live/matured).  
Top of the Breakout page. Pills on the card = which TFs agree.  
Does **not** change detect. Display + ranking only.

---

## 8. Telegram alerts — **LIVE today**

Private DM only (`MyTradingBreakoutBot`). Not groups.

`shouldAlert(hit, tf)`:

| TF | Ping? |
|---|---|
| 1m | Only **focus** coin, and only if 1m alerts are **on**, and `fresh` + `NEW BREAKOUT` |
| 5m / 10m | `fresh` + `NEW BREAKOUT` + score ≥ 55, and **not** a `live` (legacy) label |
| 4h (and other non-live) | `fresh` + `held` + `age ≤ 2` and (score ≥ 55 or `NEW BREAKOUT`) |
| `live` flag on a TF that is **not** 4h | **no** ping |
| EARLY / WATCH / WARMING | **no** ping |

**One phone ping per coin** (not per TF), key `ca|coin`, cooldown **30 min** (1m key is `ca|1m`, cooldown **20 min**).

Message includes: event, TF, why, reasons, Dex 5m/1h/vol, **level in brackets**, “exit = this TF close back under level”, CA, Pages link.

ntfy is fallback only; daily ntfy quota was already burned earlier — Telegram is primary.

---

## 9. Verdict tab (related, not Breakout)

Three cards on a **saved** coin: short 5m–1h, medium 2h–4h, long 1d–1w.

| Call | Rule |
|---|---|
| **HOLD** | that horizon still has **live or matured/held** |
| **EXIT** | **BROKE** only if that TF **had** a live/held/history break and spot is under **that** printed level. A WATCH range-high is not a break — then EXIT = “no live/held,” not BROKE. Early is not a hold. |

**Early is not a hold.** UI: chips from `/verdict` or Pages `ca-recents.json` if the worker is 1101.

---

## 10. Hunter (related)

Not breakout detect. Discovers **new** names (Dex token-profiles / boosts / search), filters:

- liq bands Micro <100k, Small 100k–1M, Mid 1–10M, Large 10–100M (skip ≥100M)
- pair age ≥ 5 minutes
- not Dex-stretched
- band-specific m5/h1/vol floors (`hunterPass`)
- max 3 names per band

Manual rug icons (Bubblemaps / Trench / Rugcheck / chain-specific) turn green on click (`POST /hunter/verify`). Save CA → `watch_extra` → joins Breakout watchlist.

---

## 11. Frontend contract

`GET /breakouts?tf=4h` returns `{ tf, updated, status, hits, sections:{early,live,matured}, align, count }`.

Each hit includes: `name, chain, ca, tf, section, state, event, score, why, reasons, level, levelTxt, distPct, spot, m5, h1, h6, volX, live, near, align, alignTfs, matureStatus, maturedAt, dexUrl, …`

`breakout-tab.js`:

- Polls ~20s for **display** (does not write DO except via GET snapshot → `syncMatured` skip-if-same).
- Three sections + ALIGNED on top.
- Bold `(4H)` on fresh, “Xm ago” not wall-clock.
- Canonical **breakout level** box (not entry price): level · spot · distance % · backtest +20% target · exit = this TF close under that level. Same number HIT/FAIL uses later.
- Dex 1D screenshots are **market cap**; engine level is **token USD**. The **%** matches.
- No Dex from the browser.

---

## 12. Entry-quality layer (**LIVE**)

Implement **after** worker is healthy and 1m/5m have real closed bars.

### Philosophy

```
evaluateRow(tf)     →  Did a breakout happen?     (UNCHANGED)
entryQuality(hit)   →  Is it enterable right now? (NEW)
```

4H example:

1. Existing 4H **NEW BREAKOUT** (closed 4H, or legacy live 4H if tape warming).
2. Immediately read **current 1m/5m** tape (no 15-minute wait).
3. Attach `entry.state` on the **same hit / same card**.

Do **not**: second 4H detector, 15m timer, treat 1m wick as 4H fail, treat LIVE as BUY, remove 🚀 LIVE alerts.

### States we **paint** (4 only)

| `entry.state` | Meaning | Telegram? |
|---|---|---|
| **WATCH** | Break exists; not enough 1m/5m proof. Not a sell. | no (🚀 LIVE already fired) |
| **WINDOW** | Accepted/reclaimed, momentum/volume not dying, **not** extended. Consider entry. Not a guarantee. | 🟢 once |
| **EXTENDED** | Break still valid, spot too far **above this level** to chase. | 🟡 once |
| **FAILED** | Meaningful lower-TF **closes** under the break TF level. | 🔴 once |

Internal only (why-text, not extra pings): accepting, retesting.

### Extension (chase) vs Dex STRETCHED

Different numbers.

- **Dex STRETCHED** (existing): h6/h24/m5 windows — stays on the **event**.
- **EXTENDED** (new): `spot >= level * (1 + ENTRY_EXT_PCT/100)`  
  **`ENTRY_EXT_PCT = 10`** — one named constant, tune later. Not 8 and 12 scattered in ifs.

Extended ≠ failed.

### FAILED (4H)

**Two 5m closes** under the **4H level**.  
Not last tick. Not a 1m wick. One 5m close is still noise.

### WINDOW (no new score)

Reuse `volX`, `buyR`, `m5`, last 3–6 **closed 1m** + **forming 5m**:

- holding or reclaiming the level
- not a single green 1m
- not over `ENTRY_EXT_PCT`

### Thin tape honesty

At 60s poll, 1m is weak. Expose `entry.tape = { pollSec, bars1m, bars5m, thin }`.  
If `thin` (e.g. `bars1m < 8`): **stay WATCH**, never fake WINDOW.

### Lower-TF map (one function, all break TFs)

| Break TF | Entry tape |
|---|---|
| 5m / 10m / 15m | 1m + 5m |
| 1h / 2h | 1m / 5m / 15m |
| 4h | 1m / 5m primary, 15m context |
| 1d / 1w | 1m–4h if they exist; else `entry: n/a` — do not fake |

### Code slot

```
tick / snapshot
  hit = evaluateRow(row, tf)           // existing
  hit.entry = entryQuality(hit, tape)  // new
  maybeAlert(hit)                      // existing 🚀 LIVE
  maybeEntryAlert(hit)                 // new 🟢/🟡/🔴
```

Persist `entry_state` only when it **changes** (`ca|tf`).

### Telegram episode (max a few pings)

```
🚀 LIVE            existing, keep
🟢 ENTRY WINDOW    new, key ca|tf|entry, once
🟡 EXTENDED        new, once
🔴 FAILED          new, once
```

No ping on WATCH↔accepting flicker.

### UI

Same card, two lines:

```
BREAKOUT: 4H LIVE
ENTRY:    WINDOW | EXTENDED | FAILED | WATCH
```

Do **not** add a fourth board. Keep EARLY / LIVE / MATURED / ALIGNED.

### Scenarios (acceptance tests)

| | Flow | Expected ENTRY |
|---|---|---|
| A | 4H break → 1m/5m hold → continuation | WINDOW |
| B | 4H break → reject, two 5m closes under | FAILED |
| C | 4H break → vertical to +12% vs level | EXTENDED (still a valid break) |
| D | up → pullback holds level → go | WINDOW |
| E | above level, no continuation | WATCH (not fail, not auto-buy) |
| F | 5m break | same function, faster; thin 1m → stay WATCH |

---

## 13. API cheat sheet

| Method | Path | Role |
|---|---|---|
| GET | `/health` | ping |
| GET | `/status` | watch count, last poll, telegram, rate-limit, last alert |
| GET | `/breakouts?tf=4h` | sections + align |
| GET | `/verdict?ca=` | HOLD/EXIT horizons |
| GET | `/hunter` | hunter hits |
| POST | `/hunter` | force hunter scan |
| POST | `/hunter/verify` | `{ca, tool}` green icon |
| POST | `/hunter/save` | `{ca}` → watch_extra |
| POST | `/focus` | 1m focus CA |
| GET/POST | `/run` | manual tick (avoid; alarm already polls) |

---

## 14. Operational gotchas

- **DO 100k writes:** don’t persist every open 1m bar. Skip unchanged meta/ticks. Alarm **60s**.
- **Dex 429:** worker pauses ~20s; don’t retry-storm.
- **ntfy daily cap:** Telegram only for phone.
- **4h WARMING 24h:** cards may use `live` Dex 4h until 6 closed 4H exist. That is still the **event**, not WINDOW.
- **Verdict/Hunter/Breakout all die on 1101.** Market + BTC fib on Pages do not.

---

## 15. How to update this doc

If you touch any of:

- `detectTapeBreakout` / `detectLegacy4h` / `detectLive5m` / `detectDexTf`
- `classifySection` / `syncMatured` / `ALIGN_*`
- `shouldAlert` / `maybeAlert` / Telegram text
- `entryQuality` (once it exists)
- Breakout UI sections

…then change **this file in the same commit**. Keep tables in sync with the numbers in `engine.js`. No second breakout write-up in chat.
