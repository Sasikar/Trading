/** Create/update one Enhanced SWAP webhook with current FOMO SOL leaders. */
export const HELIUS_HOOK_ID_KEY = 'helius_webhook_id';
const HOOK_URL = 'https://trading-ohlcv.sasipudi.workers.dev/helius';
const API = 'https://api-mainnet.helius-rpc.com/v0/webhooks';

export function solAddresses(leaders) {
  const out = [];
  const seen = new Set();
  for (let i = 0; i < (leaders || []).length; i++) {
    const s = String((leaders[i] && leaders[i].sol) || '').trim();
    if (!s || seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

export async function syncHeliusWebhook(env, leaders, existingId) {
  const key = env && env.HELIUS_API_KEY;
  if (!key) return { ok: false, error: 'missing HELIUS_API_KEY' };
  const addrs = solAddresses(leaders);
  if (!addrs.length) return { ok: false, error: 'no sol leaders yet' };
  const body = {
    webhookURL: HOOK_URL,
    webhookType: 'enhanced',
    transactionTypes: ['SWAP'],
    accountAddresses: addrs,
    txnStatus: 'success'
  };
  const qs = '?api-key=' + encodeURIComponent(key);
  let id = existingId || '';
  if (!id) {
    try {
      const listed = await fetch(API + qs, { method: 'GET' });
      const arr = await listed.json();
      const hits = Array.isArray(arr) ? arr : [];
      const mine = hits.find((w) => (w.webhookURL || w.webhookUrl) === HOOK_URL);
      if (mine) id = mine.webhookID || mine.webhookId || '';
    } catch (e) {}
  }
  const url = id ? API + '/' + id + qs : API + qs;
  const method = id ? 'PUT' : 'POST';
  const res = await fetch(url, {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
  const txt = await res.text();
  let j = {};
  try {
    j = JSON.parse(txt);
  } catch (e) {
    return { ok: false, error: txt.slice(0, 200), status: res.status };
  }
  const newId = j.webhookID || j.webhookId || id;
  return {
    ok: res.ok,
    status: res.status,
    webhookId: newId || '',
    addresses: addrs.length,
    error: res.ok ? '' : (j.error || j.message || txt).toString().slice(0, 200)
  };
}
