const KEY = 'fav_dips';

function cleanDate(value) {
  const text = String(value || '').trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : '';
}

function cleanItems(items) {
  return (Array.isArray(items) ? items : []).map((row) => ({
    id: String((row && row.id) || '').slice(0, 24) || String(Date.now()),
    date: cleanDate(row && row.date),
    name: String((row && row.name) || '').trim().slice(0, 48),
    ca: String((row && row.ca) || '').trim().toLowerCase().slice(0, 64),
    dip: String((row && row.dip) || '').trim().slice(0, 32),
    support: String((row && row.support) || '').trim().slice(0, 32),
    at: Number(row && row.at) || Date.now()
  })).filter((row) => row.name || row.ca).slice(0, 200);
}

export function readFavDips(store) {
  try {
    const parsed = JSON.parse(store.getMeta(KEY) || 'null');
    if (parsed && parsed.saved && Array.isArray(parsed.items)) return { items: cleanItems(parsed.items), saved: true };
  } catch (e) {}
  return { items: [], saved: false };
}

export function writeFavDips(store, items) {
  const clean = cleanItems(items);
  store.setMeta(KEY, JSON.stringify({ saved: true, items: clean }));
  return clean;
}
