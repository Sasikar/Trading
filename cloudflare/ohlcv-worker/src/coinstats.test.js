import { test } from 'node:test';
import assert from 'node:assert/strict';
import { holdingsFromDas, historyRows, labelHistory, writeWallets, readWallets, judgeSells, sellLine, writeChartPoint, readChart } from './coinstats.js';

test('holdings keep priced tokens and native sol', () => {
  const out = holdingsFromDas({
    result: {
      nativeBalance: { lamports: 2e9, price_per_sol: 150, total_price: 300 },
      items: [
        { id: 'MINT', interface: 'FungibleToken', token_info: { symbol: 'JEAN', balance: 1000000, decimals: 6, price_info: { price_per_token: 2, total_price: 2 } } },
        { id: 'DUST', interface: 'FungibleToken', token_info: { symbol: 'SPAM', balance: 10, decimals: 0, price_info: { total_price: 0.1 } } }
      ]
    }
  });
  assert.equal(out.rows.length, 2);
  assert.equal(out.rows[0].symbol, 'SOL');
  assert.equal(out.rows[1].symbol, 'JEAN');
  assert.equal(out.total, 302);
});

test('history keeps the last week and knows in from out', () => {
  const now = Date.now();
  const rows = historyRows([
    {
      timestamp: Math.floor(now / 1000) - 3600,
      type: 'SWAP',
      signature: 'SIG',
      source: 'JUPITER',
      tokenTransfers: [{ tokenSymbol: 'JEAN', tokenAmount: 5, toUserAccount: 'ME', fromUserAccount: 'POOL' }]
    },
    {
      timestamp: Math.floor((now - 8 * 24 * 3600 * 1000) / 1000),
      tokenTransfers: [{ tokenSymbol: 'OLD', tokenAmount: 1, toUserAccount: 'ME', fromUserAccount: 'POOL' }]
    }
  ], 'ME', now - 7 * 24 * 3600 * 1000);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].side, 'in');
  assert.equal(rows[0].token, 'JEAN');
});

test('history uses the holding name so a search can find it', () => {
  const rows = labelHistory(
    [{ token: 'GTBxUiw6wJdmmkCGZgRHLyYxqu1vG4KtRpeox6yDpump', amount: 10, side: 'in' }],
    [{ mint: 'GTBxUiw6wJdmmkCGZgRHLyYxqu1vG4KtRpeox6yDpump', symbol: 'JEANPHIL', price: 0.004 }]
  );
  assert.equal(rows[0].token, 'JEANPHIL');
  assert.equal(rows[0].usd, 0.04);
});

test('wallets add without duplicates', () => {
  const bag = {};
  const store = {
    getMeta() { return bag.v || '[]'; },
    setMeta(_k, v) { bag.v = v; }
  };
  const a = writeWallets(store, [{ address: 'not-a-wallet' }]);
  assert.equal(a.length, 0);
  const addr = '5sAQ111111111111111111111111111111111k5qe';
  writeWallets(store, [{ address: addr }, { address: addr }]);
  assert.equal(readWallets(store).length, 1);
});

test('a smaller balance is a sell, and the line names the score', () => {
  const row = judgeSells(
    { A: 100, B: 50, C: 20 },
    { A: 100, B: 10, C: 0 },
    ['A', 'B', 'C']
  );
  assert.equal(row.score, 3);
  assert.equal(row.sold, 2);
  assert.equal(row.holding, 2);
  assert.equal(sellLine(Object.assign({ hadBaseline: true, name: 'JEANPHIL' }, row)), 'JEANPHIL. 2 of 3 still holding.');
});

test('a chart keeps one point per hour for one day', () => {
  const bag = {};
  const store = { getMeta() { return bag.v || '{}'; }, setMeta(_k, v) { bag.v = v; } };
  const mint = 'GTBxUiw6wJdmmkCGZgRHLyYxqu1vG4KtRpeox6yDpump';
  writeChartPoint(store, mint, { hour: '2026-09-25T10', total: 100, coin: 80 });
  writeChartPoint(store, mint, { hour: '2026-09-25T10', total: 140, coin: 90 });
  for (let n = 0; n < 24; n++) {
    const hh = n < 10 ? '0' + n : String(n);
    writeChartPoint(store, mint, { hour: '2026-09-25T' + hh, total: n, coin: n });
  }
  let series = readChart(store, mint);
  assert.equal(series.length, 24);
  assert.equal(series[0].hour, '2026-09-25T00');
  assert.equal(series.filter((row) => row.hour === '2026-09-25T10')[0].total, 10);
  series = writeChartPoint(store, mint, { hour: '2026-09-26T00', total: 30, coin: 3 });
  assert.equal(series.length, 24);
  assert.equal(series[0].hour, '2026-09-25T01');
});
