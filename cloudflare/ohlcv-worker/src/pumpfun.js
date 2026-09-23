/** Latest Pump.fun coins for the Movers screen. Not a buy list. */
const PUMP = 'https://frontend-api-v3.pump.fun/coins';

let mem = { at: 0, coins: [], err: '' };

export function slimPump(c) {
  if (!c || !c.mint) return null;
  return {
    mint: String(c.mint),
    name: c.name || '',
    symbol: c.symbol || '',
    image: c.image_uri || '',
    mc: +c.usd_market_cap || 0,
    created: +c.created_timestamp || 0,
    twitter: c.twitter || '',
    telegram: c.telegram || '',
    website: c.website || '',
    replies: +c.reply_count || 0,
    complete: !!c.complete,
    protocol: c.protocol || 'pump'
  };
}

export function passMovers(c, f, now) {
  if (!c) return false;
  const age = (now - (+c.created || 0)) / 60000;
  if (!(age >= 0) || age > (+f.maxAge || 60)) return false;
  const mc = +c.mc || 0;
  const cap = +f.maxMc || 150000;
  const floor = Math.min(10000, cap);
  if (!(mc >= floor) || mc > cap) return false;
  if (f.twitter && !c.twitter) return false;
  const socials = [c.twitter, c.telegram, c.website].filter(Boolean).length;
  if (f.social && socials < 1) return false;
  return true;
}

export async function pumpfunFeed() {
  const now = Date.now();
  if (mem.coins.length && now - mem.at < 20000) {
    return { ok: true, at: mem.at, coins: mem.coins, cached: true, err: mem.err };
  }
  const coins = [];
  const seen = new Set();
  let err = '';
  for (let start = 0; start < 16; start += 4) {
    let batch = [];
    try {
      batch = await Promise.all(
        [0, 1, 2, 3].map(function (i) {
          const url =
            PUMP +
            '?offset=' +
            (start + i) * 50 +
            '&limit=50&sort=created_timestamp&order=DESC&includeNsfw=false';
          return fetch(url, {
            headers: { accept: 'application/json', 'user-agent': 'TradingPumpfun/1' },
            signal: AbortSignal.timeout(8000)
          }).then(function (r) {
            if (!r.ok) throw new Error('pump HTTP ' + r.status);
            return r.json();
          });
        })
      );
    } catch (e) {
      err = String(e && e.message ? e.message : e).slice(0, 140);
      break;
    }
    let oldest = 0;
    let empty = false;
    for (let b = 0; b < batch.length; b++) {
      const arr = batch[b];
      if (!Array.isArray(arr) || !arr.length) {
        empty = true;
        continue;
      }
      for (let i = 0; i < arr.length; i++) {
        const s = slimPump(arr[i]);
        if (!s || seen.has(s.mint)) continue;
        seen.add(s.mint);
        coins.push(s);
      }
      const t = +arr[arr.length - 1].created_timestamp || 0;
      if (t && (!oldest || t < oldest)) oldest = t;
    }
    if (empty) break;
    if (oldest && now - oldest > 70 * 60000) break;
  }
  if (coins.length) mem = { at: now, coins, err };
  return {
    ok: mem.coins.length > 0,
    at: mem.at || now,
    coins: mem.coins,
    err: err || mem.err,
    note: 'Pump launchpad only. MC, age, Twitter, site, Telegram. Holder count and bundle % are not on this public feed.'
  };
}
