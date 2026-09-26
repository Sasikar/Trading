const KEY = 'fomo_entry_checks';
const PATH = 'data/fomo-entry.json';

export function readFomoEntry(store) {
  try {
    const parsed = JSON.parse(store.getMeta(KEY) || '[]');
    return Array.isArray(parsed) ? cleanItems(parsed) : [];
  } catch (e) {
    return [];
  }
}

export function writeFomoEntry(store, items) {
  const clean = cleanItems(items);
  store.setMeta(KEY, JSON.stringify(clean));
  return clean;
}

function cleanItems(items) {
  return (Array.isArray(items) ? items : []).map((row) => ({
    text: String((row && row.text) || '').trim().slice(0, 160),
    on: !!(row && row.on),
    custom: !!(row && row.custom)
  })).filter((row) => row.text).slice(0, 30);
}

function gitToken(env) {
  return String((env && (env.GIT_KEY || env.GITHUB_TOKEN || env.GH_TOKEN)) || '').trim();
}

function b64(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  bytes.forEach((b) => { bin += String.fromCharCode(b); });
  return btoa(bin);
}

export async function pushFomoGithub(env, items) {
  const token = gitToken(env);
  if (!token) return false;
  const url = 'https://api.github.com/repos/Sasikar/Trading/contents/' + PATH;
  const headers = {
    Authorization: 'Bearer ' + token,
    Accept: 'application/vnd.github+json',
    'User-Agent': 'trading-ohlcv'
  };
  let sha = '';
  const cur = await fetch(url + '?ref=master', { headers });
  if (cur.ok) sha = (await cur.json()).sha || '';
  else if (cur.status !== 404) return false;
  const body = {
    message: 'Save Fomo Entry checks',
    content: b64(JSON.stringify({ updated: new Date().toISOString(), items: cleanItems(items) }, null, 2)),
    branch: 'master'
  };
  if (sha) body.sha = sha;
  const put = await fetch(url, {
    method: 'PUT',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  return put.ok;
}
