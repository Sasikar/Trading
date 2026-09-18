import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Engine, MemoryStore } from './engine.js';

test('strategy notes snapshot history is per tab', () => {
  const e = new Engine(new MemoryStore(), {});
  e.saveStrategy({ tab: 'fund', text: 'size 1%', snapshot: true });
  e.saveStrategy({ tab: 'fund', text: 'size 2%', snapshot: true });
  e.saveStrategy({ tab: 'wallet', text: 'cold only', snapshot: true });
  const s = e.strategyState();
  assert.equal(s.fund.text, 'size 2%');
  assert.equal(s.fund.history[0].text, 'size 2%');
  assert.equal(s.fund.history[1].text, 'size 1%');
  assert.equal(s.wallet.text, 'cold only');
  assert.equal(s.rotation.text, '');
  e.saveStrategy({ tab: 'fund', restoreAt: s.fund.history[1].at });
  assert.equal(e.strategyState().fund.text, 'size 1%');
});
