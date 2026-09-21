/** Telegram ping for Coin selection (overlap + MC >= 50k). Not a buy signal. */
const MIN_MC = 50000;
export const HELIUS_TG_KEY = 'helius_tg_sent';

export async function dexQuote(mint) {
  const url = 'https://api.dexscreener.com/tokens/v1/solana/' + mint;
  const r = await fetch(url, { headers: { accept: 'application/json' } });
  const arr = await r.json();
  const list = Array.isArray(arr) ? arr : [];
  let best = { name: '', symbol: '', mcap: 0 };
  for (let i = 0; i < list.length; i++) {
    const p = list[i] || {};
    const mcap = +p.marketCap || +p.fdv || 0;
    const symbol = (p.baseToken && (p.baseToken.symbol || p.baseToken.name)) || '';
    if (mcap >= best.mcap) best = { name: symbol, symbol, mcap };
  }
  return best;
}

function sentMap(raw) {
  try {
    return JSON.parse(raw || '{}') || {};
  } catch (e) {
    return {};
  }
}

export async function notifyNewOverlap(env, store, scored) {
  const token = env && env.TELEGRAM_BOT_TOKEN;
  const chat = env && env.TELEGRAM_CHAT_ID;
  if (!token || !chat) return { skipped: 'no telegram secrets' };
  const sent = sentMap(store.getMeta(HELIUS_TG_KEY));
  const now = Date.now();
  let n = 0;
  for (let i = 0; i < (scored || []).length; i++) {
    const c = scored[i];
    const mint = c && c.mint;
    if (!mint) continue;
    if (sent[mint] && now - sent[mint] < 12 * 3600e3) continue;
    let mcap = +c.mcap || 0;
    let name = c.symbol || c.name || '';
    if (!mcap || !name) {
      try {
        const q = await dexQuote(mint);
        mcap = q.mcap || mcap;
        name = q.symbol || name;
      } catch (e) {}
    }
    if (mcap < MIN_MC) continue;
    const handles = (c.handles || []).map((h) => '@' + h).join(' ');
    const text =
      'Coin selection\n' +
      (name || 'token') +
      '\nMC $' +
      Math.round(mcap).toLocaleString('en-US') +
      '\n' +
      (c.score || (c.wallets || []).length) +
      ' wallets\n' +
      (handles || '') +
      '\nhttps://dexscreener.com/solana/' +
      mint;
    const res = await fetch('https://api.telegram.org/bot' + token + '/sendMessage', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: chat, text, disable_web_page_preview: true })
    });
    if (res.ok) {
      sent[mint] = now;
      n++;
    }
  }
  store.setMeta(HELIUS_TG_KEY, JSON.stringify(sent));
  return { sent: n };
}
