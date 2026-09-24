const KEY = 'tier_notes';
const MAX = 80;
const BUBBLES = { ok: 1, rug: 1, lazy: 1 };

function readAll(store) {
  try {
    const parsed = JSON.parse(store.getMeta(KEY) || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (e) {
    return {};
  }
}

export function readNote(store, mint) {
  const row = readAll(store)[mint] || {};
  return { mint: mint, bubble: row.bubble || '', dex: row.dex || '', at: row.at || 0 };
}

export function writeNote(store, mint, patch) {
  const all = readAll(store);
  const prev = all[mint] || {};
  const bubble = patch && Object.prototype.hasOwnProperty.call(patch, 'bubble') ? patch.bubble : prev.bubble;
  const dex = patch && Object.prototype.hasOwnProperty.call(patch, 'dex') ? patch.dex : prev.dex;
  const next = {
    bubble: BUBBLES[bubble] ? bubble : '',
    dex: String(dex || '').slice(0, 2000),
    at: Date.now()
  };
  all[mint] = next;
  const keys = Object.keys(all);
  if (keys.length > MAX) {
    keys.sort((a, b) => (all[a].at || 0) - (all[b].at || 0));
    keys.slice(0, keys.length - MAX).forEach((k) => { delete all[k]; });
  }
  store.setMeta(KEY, JSON.stringify(all));
  return { mint: mint, ...next };
}
