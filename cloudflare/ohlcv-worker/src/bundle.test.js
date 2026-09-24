import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scoreBundle, botName } from './bundle.js';

const launch = Date.parse('2026-09-01T00:00:00Z');

test('a dex name is not a trading bot', () => {
  assert.equal(botName('PUMP_FUN'), '');
  assert.equal(botName('PHOTON'), 'PHOTON');
});

test('same slot, fresh wallets created together, and a shared bot fail', () => {
  const rows = [0, 1, 2, 3].map((i) => ({
    owner: 'W' + i,
    firstAt: launch - 60 * 60 * 1000,
    old: false,
    buySlot: 10,
    buyTokens: 100,
    nowTokens: 90,
    bot: 'PHOTON',
    funder: ''
  }));
  const out = scoreBundle(rows, launch);
  const by = Object.fromEntries(out.checks.map((c) => [c.id, c.state]));
  assert.equal(by.linked, 'fail');
  assert.equal(by.fresh, 'fail');
  assert.equal(by.age, 'fail');
  assert.equal(by.bot, 'fail');
  assert.equal(by.insider, 'grey');
  assert.equal(by.phish, 'grey');
  assert.equal(by.hold, 'pass');
});

test('old wallets with no launch buys stay grey or pass and do not invent a bot', () => {
  const rows = [0, 1, 2, 3, 4].map((i) => ({ owner: 'O' + i, old: true, nowTokens: 10, bot: 'JUPITER' }));
  const out = scoreBundle(rows, launch);
  const by = Object.fromEntries(out.checks.map((c) => [c.id, c.state]));
  assert.equal(by.fresh, 'pass');
  assert.equal(by.age, 'pass');
  assert.equal(by.linked, 'grey');
  assert.equal(by.bot, 'grey');
  assert.equal(by.hold, 'grey');
});

test('three wallets on one funder fail the link check', () => {
  const rows = [0, 1, 2, 3, 4].map((i) => ({
    owner: 'F' + i,
    old: true,
    funder: i < 3 ? 'BANK' : 'OTHER' + i,
    buySlot: 100 + i
  }));
  const out = scoreBundle(rows, launch);
  assert.equal(out.checks.find((c) => c.id === 'linked').state, 'fail');
});

test('a flagged wallet that sold half fails still holding', () => {
  const rows = [0, 1, 2, 3].map((i) => ({
    owner: 'S' + i,
    old: true,
    buySlot: 5,
    buyTokens: 100,
    nowTokens: 10,
    bot: ''
  }));
  const out = scoreBundle(rows, launch);
  assert.equal(out.checks.find((c) => c.id === 'hold').state, 'fail');
});
