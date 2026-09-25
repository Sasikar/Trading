export const EW_SIGNAL_TFS = ['5m', '15m', '1h', '2h', '4h', '1d', '1w'];
const SKIP = { NO_SETUP: 1, WARMING: 1, '': 1 };
export const EW_SIG_KEEP_MS = 3 * 86400e3;
const MAX_PER = 40;
const MAX_LOG = 1500;

export function applySignals(book, events, now) {
  const src = book && typeof book === 'object' ? book : {};
  const last = Object.assign({}, src.last || {});
  const log = Array.isArray(src.log) ? src.log.slice() : [];
  (events || []).forEach((e) => {
    const ca = String(e.ca || '').toLowerCase();
    const tf = String(e.tf || '').toLowerCase();
    const state = String(e.state || '');
    if (!ca || !tf || !state) return;
    const key = ca + '|' + tf;
    if (last[key] === state) return;
    last[key] = state;
    if (SKIP[state]) return;
    log.push({
      ca: ca,
      tf: tf,
      state: state,
      name: String(e.name || '').slice(0, 40),
      label: String(e.label || state).slice(0, 40),
      why: String(e.why || '').slice(0, 160),
      at: now
    });
  });
  const cut = now - EW_SIG_KEEP_MS;
  const grouped = {};
  log.forEach((r) => {
    if (!r || r.at < cut) return;
    const key = r.ca + '|' + r.tf;
    (grouped[key] = grouped[key] || []).push(r);
  });
  let out = [];
  Object.keys(grouped).forEach((key) => {
    out = out.concat(grouped[key].slice(-MAX_PER));
  });
  out.sort((a, b) => a.at - b.at);
  if (out.length > MAX_LOG) out = out.slice(-MAX_LOG);
  return { last: last, log: out };
}

export function signalView(log, ca, now) {
  const want = String(ca || '').toLowerCase();
  const rows = (log || []).filter((r) => r && r.ca === want);
  const hour = now - 3600e3;
  const byTf = {};
  EW_SIGNAL_TFS.forEach((tf) => {
    byTf[tf] = { n: 0, hour: 0 };
  });
  rows.forEach((r) => {
    if (!byTf[r.tf]) byTf[r.tf] = { n: 0, hour: 0 };
    byTf[r.tf].n += 1;
    if (r.at >= hour) byTf[r.tf].hour += 1;
  });
  let hourN = 0;
  EW_SIGNAL_TFS.forEach((tf) => {
    hourN += byTf[tf].hour;
  });
  return { byTf: byTf, hour: hourN, rows: rows };
}
