/**
 * Shared DexScreener helpers — no GeckoTerminal.
 * Pair stats (5m / 1h / 6h / 24h) are enough for live breakout + momentum.
 */
export const NTFY_DEFAULT_TOPIC = 'MyTradingMemeBreakout44';

export function chainIdOf(chain) {
  const c = String(chain || '').toLowerCase();
  if (c === 'sol' || c === 'solana') return 'solana';
  if (c === 'eth' || c === 'ethereum') return 'ethereum';
  if (c === 'base') return 'base';
  if (c === 'bsc' || c === 'bnb') return 'bsc';
  return c || 'solana';
}

export function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function fetchJSON(url, tries = 3) {
  let last;
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'TradingDexBreakout/2.0'
        },
        cache: 'no-store'
      });
      if (r.status === 429) {
        await sleep(800 * (i + 1));
        last = new Error('HTTP 429 DexScreener');
        continue;
      }
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return await r.json();
    } catch (e) {
      last = e;
      await sleep(300 * (i + 1));
    }
  }
  throw last || new Error('fetch failed');
}

/** One request per CA so ETH+SOL are not truncated by the 30-pair batch cap. */
export async function fetchDexPairsForCas(cas) {
  const uniq = [...new Set((cas || []).map((c) => String(c || '').trim()).filter(Boolean))];
  const all = [];
  const conc = 6;
  for (let i = 0; i < uniq.length; i += conc) {
    const chunk = uniq.slice(i, i + conc);
    const parts = await Promise.all(
      chunk.map(async (ca) => {
        const url = 'https://api.dexscreener.com/latest/dex/tokens/' + encodeURIComponent(ca);
        try {
          const j = await fetchJSON(url, 2);
          return j.pairs || [];
        } catch (e) {
          console.warn('dex token', ca.slice(0, 8), e.message || e);
          return [];
        }
      })
    );
    for (const p of parts) all.push(...p);
    if (i + conc < uniq.length) await sleep(80);
  }
  return all;
}

export function pickBestPair(pairs, chain, ca) {
  const want = chainIdOf(chain);
  const caL = String(ca || '').toLowerCase();
  let list = (pairs || []).filter((p) => p && p.chainId === want);
  if (caL) {
    const exact = list.filter(
      (p) =>
        String(p.baseToken?.address || '').toLowerCase() === caL ||
        String(p.quoteToken?.address || '').toLowerCase() === caL
    );
    if (exact.length) list = exact;
  }
  if (!list.length && caL) {
    list = (pairs || []).filter(
      (p) =>
        String(p.baseToken?.address || '').toLowerCase() === caL ||
        String(p.quoteToken?.address || '').toLowerCase() === caL
    );
  }
  list.sort((a, b) => +(b.liquidity?.usd || 0) - +(a.liquidity?.usd || 0));
  return list[0] || null;
}

function txWin(tx, key) {
  const x = (tx && tx[key]) || {};
  return { b: +x.buys || 0, s: +x.sells || 0 };
}
function buyRatio(t) {
  const n = t.b + t.s;
  return n ? t.b / n : 0.5;
}

/**
 * Momentum 0–100 from DexScreener windows + optional last snapshot (tick %).
 */
export function momentumScore(pair, prev) {
  const pc = pair.priceChange || {};
  const vol = pair.volume || {};
  const tx = pair.txns || {};
  const price = +pair.priceUsd || 0;
  const liq = +(pair.liquidity && pair.liquidity.usd) || 0;
  const m5 = +pc.m5 || 0;
  const h1 = +pc.h1 || 0;
  const h6 = +pc.h6 || 0;
  const h24 = +pc.h24 || 0;
  const vm5 = +vol.m5 || 0;
  const vh1 = +vol.h1 || 0;
  const t5 = txWin(tx, 'm5');
  const buyR = buyRatio(t5);
  const volX = vh1 / 12 > 0 ? vm5 / (vh1 / 12) : vm5 > 0 ? 2 : 0;
  let tickRet = 0;
  if (prev && prev.price > 0 && price > 0) tickRet = ((price - prev.price) / prev.price) * 100;

  let score = 0;
  const reasons = [];
  if (m5 >= 8) {
    score += 25;
    reasons.push('5m +' + m5.toFixed(1) + '%');
  } else if (m5 >= 4) {
    score += 18;
    reasons.push('5m +' + m5.toFixed(1) + '%');
  } else if (m5 >= 2) {
    score += 10;
    reasons.push('5m +' + m5.toFixed(1) + '%');
  } else if (tickRet >= 2) {
    score += 12;
    reasons.push('tick +' + tickRet.toFixed(1) + '%');
  }

  if (volX >= 4) {
    score += 25;
    reasons.push('vol ' + volX.toFixed(1) + 'x');
  } else if (volX >= 2) {
    score += 16;
    reasons.push('vol ' + volX.toFixed(1) + 'x');
  } else if (volX >= 1.4) {
    score += 8;
    reasons.push('vol ' + volX.toFixed(1) + 'x');
  }

  if (h1 >= 5 && m5 > 0) {
    score += 16;
    reasons.push('1h held +' + h1.toFixed(1) + '%');
  } else if (h1 >= 0 && m5 >= 2) {
    score += 10;
    reasons.push('1h green');
  } else if (h1 < -8) score -= 8;

  if (buyR >= 0.65 && t5.b + t5.s >= 20) {
    score += 15;
    reasons.push('buys ' + Math.round(buyR * 100) + '%');
  } else if (buyR >= 0.55 && t5.b + t5.s >= 10) {
    score += 9;
    reasons.push('buys ' + Math.round(buyR * 100) + '%');
  }

  if (liq >= 200000) score += 10;
  else if (liq >= 50000) score += 7;
  else if (liq >= 15000) score += 4;
  else score -= 10;

  if (m5 > 0 && h1 > 0) {
    score += 5;
    reasons.push('5m+1h aligned');
  }

  const stretched = h6 >= 80 || h24 >= 150 || m5 >= 35;
  if (stretched) {
    score -= 18;
    reasons.push('stretched');
  }

  score = Math.max(0, Math.min(100, Math.round(score)));

  let state = 'NORMAL';
  if (stretched && (m5 > 5 || h1 > 15)) state = 'EXTENDED';
  else if (score >= 62 && (m5 >= 3 || tickRet >= 2)) state = 'EARLY_BREAKOUT';
  else if (h1 < 0 && m5 >= 4 && buyR >= 0.6) state = 'RETEST/RECLAIM';

  return {
    score,
    state,
    reasons,
    stretched,
    forming: false,
    reclaim: state === 'RETEST/RECLAIM',
    detail: {
      price,
      liq,
      m5: +m5.toFixed(2),
      h1: +h1.toFixed(2),
      h6: +h6.toFixed(2),
      h24: +h24.toFixed(2),
      volX: +volX.toFixed(2),
      buyR: +buyR.toFixed(2),
      tickRet: +tickRet.toFixed(2),
      buys: t5.b,
      sells: t5.s,
      ret1: +m5.toFixed(2),
      ret3: +h1.toFixed(2),
      ret5: +h6.toFixed(2)
    }
  };
}

/**
 * TF breakout classification for the Breakout Memes tab (4h / 1d / 1w).
 * Uses DexScreener 5m/1h/6h/24h windows — no OHLCV, no GeckoTerminal.
 */
export function tfBreakout(pair, tf) {
  const mom = momentumScore(pair, null);
  const d = mom.detail;
  const tfn = String(tf || '4h').toLowerCase();
  let event = '—';
  let state = 'WATCH';
  let fresh = false;
  let held = false;
  let age = 99;

  if (tfn === '4h') {
    if (d.m5 >= 3 && d.h1 >= 2 && d.volX >= 1.5 && !mom.stretched) {
      event = 'NEW BREAKOUT';
      fresh = true;
      held = true;
      age = 0;
      state = 'EARLY';
    } else if (d.h1 > 0 && d.h6 >= 8) {
      event = 'BREAKOUT HELD';
      held = true;
      age = d.h6 >= 25 ? 3 : 1;
      state = d.h1 >= 6 && d.volX >= 1.3 && d.buyR >= 0.52 ? 'STRONG CONFIRMED' : 'EARLY';
    }
    if (mom.stretched && (d.h1 > 5 || d.h6 > 40)) state = 'STRETCHED';
  } else if (tfn === '1d') {
    if (d.h6 >= 8 && d.h24 >= 5 && d.h24 < 40 && d.volX >= 1.2) {
      event = 'NEW BREAKOUT';
      fresh = true;
      held = true;
      age = 0;
      state = 'EARLY';
    } else if (d.h24 >= 10 && d.h6 > 0) {
      event = 'BREAKOUT HELD';
      held = true;
      age = 1;
      state = d.h24 >= 20 ? 'STRONG CONFIRMED' : 'EARLY';
    }
    if (d.h24 >= 80) state = 'STRETCHED';
  } else {
    if (d.h24 >= 15 && d.h6 > 0) {
      event = 'BREAKOUT HELD';
      held = true;
      age = 2;
      state = 'EARLY';
    }
    if (d.h24 >= 120) state = 'STRETCHED';
  }

  const interesting = state !== 'WATCH' || fresh || held;
  const name = (pair.baseToken && pair.baseToken.symbol) || '???';
  return {
    name,
    chain: pair.chainId,
    pairAddress: pair.pairAddress,
    dexUrl: pair.url || '',
    state,
    event,
    fresh,
    held,
    age,
    interesting,
    score: mom.score,
    confirms: Math.min(8, Math.round(mom.score / 12.5)),
    sizePct: state === 'STRONG CONFIRMED' ? 80 : state === 'EARLY' ? 35 : 0,
    spot: d.price,
    liq: d.liq,
    m5: d.m5,
    h1: d.h1,
    h6: d.h6,
    h24: d.h24,
    volX: d.volX,
    buyR: d.buyR,
    reasons: mom.reasons
  };
}

export async function sendNtfy(topic, title, message, tags) {
  const topics = [...new Set([topic, NTFY_DEFAULT_TOPIC].map((t) => String(t || '').trim()).filter(Boolean))];
  let lastErr = null;
  let ok = 0;
  for (const t of topics) {
    const url = 'https://ntfy.sh/' + encodeURIComponent(t);
    try {
      const r = await fetch(url, {
        method: 'POST',
        headers: {
          Title: String(title || '').slice(0, 90),
          Priority: 'high',
          Tags: tags || 'chart_with_upwards_trend,moneybag'
        },
        body: `${title}\n${message}`
      });
      if (!r.ok) throw new Error('ntfy HTTP ' + r.status + ' @' + t);
      ok++;
    } catch (e) {
      lastErr = e;
      console.warn('ntfy', t, e.message || e);
    }
  }
  if (!ok && lastErr) throw lastErr;
  return { ok };
}
