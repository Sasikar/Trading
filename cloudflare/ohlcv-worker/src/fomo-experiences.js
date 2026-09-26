const KEY = 'fomo_experiences';

function cleanPrices(rows) {
  return (Array.isArray(rows) ? rows : []).map((row) => ({
    entered: String((row && row.entered) || '').trim().slice(0, 32),
    current: String((row && row.current) || '').trim().slice(0, 32)
  })).filter((row) => row.entered || row.current).slice(0, 12);
}

function cleanItems(items) {
  return (Array.isArray(items) ? items : []).map((row) => ({
    id: String((row && row.id) || '').slice(0, 24) || String(Date.now()),
    name: String((row && row.name) || '').trim().slice(0, 48),
    prices: cleanPrices(row && row.prices),
    note: String((row && row.note) || '').trim().slice(0, 500),
    at: Number(row && row.at) || Date.now()
  })).filter((row) => row.name).slice(0, 100);
}

export function readFomoExperiences(store) {
  try {
    const parsed = JSON.parse(store.getMeta(KEY) || 'null');
    if (parsed && parsed.saved && Array.isArray(parsed.items)) return { items: cleanItems(parsed.items), saved: true };
  } catch (e) {}
  return { items: [], saved: false };
}

export function writeFomoExperiences(store, items) {
  const clean = cleanItems(items);
  store.setMeta(KEY, JSON.stringify({ saved: true, items: clean }));
  return clean;
}
