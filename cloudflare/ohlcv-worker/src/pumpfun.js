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
  if (!(mc > 0) || mc > (+f.maxMc || 150000)) return false;
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
  for (let page = 0; page < 3; page++) {
    const url =
      PUMP +
      '?offset=' +
      page * 50 +
      '&limit=50&sort=created_timestamp&order=DESC&includeNsfw=false';
    try {
      const r = await fetch(url, {
        headers: { accept: 'application/json', 'user-agent': 'TradingPumpfun/1' }
      });
      if (!r.ok) {
        err = 'pump HTTP ' + r.status;
        break;
      }
      const arr = await r.json();
      if (!Array.isArray(arr) || !arr.length) break;
      for (let i = 0; i < arr.length; i++) {
        const s = slimPump(arr[i]);
        if (!s || seen.has(s.mint)) continue;
        seen.add(s.mint);
        coins.push(s);
      }
      const oldest = +arr[arr.length - 1].created_timestamp || 0;
      if (oldest && now - oldest > 120 * 60000) break;
    } catch (e) {
      err = String(e && e.message ? e.message : e).slice(0, 140);
      break;
    }
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
