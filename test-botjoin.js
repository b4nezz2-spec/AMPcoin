// Bot-join route test: creator creates a bet, house bot joins server-side.
const path = require('path');
const Module = require('module');

const ROUTE = path.join(__dirname, 'backend', 'routes', 'coinflip.js');

const state = {
  users: [
    { id: 'u1', robloxUsername: 'Alice', displayName: 'Alice', avatar: 'a1', gamesPlayed: 0, gamesWon: 0, gamesLost: 0 },
    { id: 'bot', robloxUsername: 'HouseBot', displayName: 'HouseBot', avatar: 'ab', gamesPlayed: 0, gamesWon: 0, gamesLost: 0 }
  ],
  main: {
    coinflips: [],
    transactions: [],
    settings: [
      { key: 'tax_enabled', value: true },
      { key: 'tax_percentage', value: 15 },
      { key: 'tax_recipient', value: 'HouseBot' }
    ]
  },
  inventories: {
    u1: { items: [
      { itemId: 'c1', id: 'c1', name: 'Cat', itemName: 'Cat', value: 100, rarity: 'rare', quantity: 1, imageUrl: '', image: '' }
    ] },
    bot: { items: [
      { itemId: 'b1', id: 'b1', name: 'Dragon', itemName: 'Dragon', value: 100, rarity: 'legendary', quantity: 1, imageUrl: '', image: '' }
    ] }
  }
};
const emitted = [];

const dbStub = {
  getMainDb: () => state.main,
  getUsersDb: () => ({ users: state.users }),
  getUserInventory: (uid) => {
    if (!state.inventories[uid]) state.inventories[uid] = { items: [] };
    return state.inventories[uid];
  },
  removeItemFromUserInventory: (uid, itemId, qty) => {
    const inv = dbStub.getUserInventory(uid);
    const idx = inv.items.findIndex((i) => i.itemId === itemId || i.id === itemId);
    if (idx === -1) return false;
    inv.items[idx].quantity -= (qty || 1);
    if (inv.items[idx].quantity <= 0) inv.items.splice(idx, 1);
    return true;
  },
  addItemToUserInventory: (uid, item, qty) => {
    const inv = dbStub.getUserInventory(uid);
    const ex = inv.items.find((i) => (i.itemId || i.id) === (item.itemId || item.id));
    if (ex) ex.quantity = (ex.quantity || 1) + (qty || 1);
    else inv.items.push({ ...item, quantity: qty || 1 });
    return inv;
  },
  saveMainDb: () => {},
  saveUsersDb: () => {}
};

let currentUser = 'u1';
const authStub = {
  authenticateToken: (req, res, next) => {
    req.user = { userId: currentUser, robloxUsername: currentUser === 'u1' ? 'Alice' : 'HouseBot' };
    next();
  }
};
const notifStub = { addNotification: () => ({}) };
const realtimeStub = { emitToAll: (ev, data) => emitted.push({ ev, data }) };

const BACKEND_PREFIX = __dirname + require('path').sep + 'backend' + require('path').sep;
const origLoad = Module._load;
Module._load = function (request, parent, isMain) {
  const inBackend = parent && parent.filename && parent.filename.startsWith(BACKEND_PREFIX);
  if (inBackend) {
    if (request.endsWith('db/dbHelper')) return dbStub;
    if (request.endsWith('middleware/auth')) return authStub;
    if (request.endsWith('notificationService')) return notifStub;
    if (request.endsWith('realtime')) return realtimeStub;
    // taxUtil loads for real (it uses the stubbed dbHelper above)
  }
  return origLoad.call(this, request, parent, isMain);
};

const express = require('express');
const coinflipRouter = require(ROUTE);
const app = express();
app.use(express.json());
app.use('/api/coinflip', coinflipRouter);

const server = app.listen(0, async () => {
  const base = `http://127.0.0.1:${server.address().port}/api/coinflip`;
  const results = [];
  const check = (name, cond, extra) => {
    results.push(`${cond ? 'PASS' : 'FAIL'} ${name}${extra ? ' :: ' + extra : ''}`);
  };
  try {
    // 1. Alice creates a 100-value bet (heads)
    currentUser = 'u1';
    let r = await fetch(base, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ selectedItems: [{ itemId: 'c1', quantity: 1 }], sideChosen: 'heads' })
    });
    let bet = await r.json();
    check('create ok', r.ok && bet.id && bet.status === 'waiting', `status=${bet.status}`);
    const betId = bet.id;

    // 2. Non-creator cannot bot-join (bot is not creator)
    currentUser = 'bot';
    r = await fetch(`${base}/${betId}/bot-join`, { method: 'POST' });
    check('non-creator bot-join rejected', r.status === 403);

    // 3. Creator triggers bot join (run a few times: 70/30 either way must settle)
    currentUser = 'u1';
    let settled = null;
    for (let i = 0; i < 5; i++) {
      // reset: fresh bet each attempt
      state.inventories.u1.items = [{ itemId: 'c1', id: 'c1', name: 'Cat', itemName: 'Cat', value: 100, rarity: 'rare', quantity: 1, imageUrl: '', image: '' }];
      state.inventories.bot.items = [{ itemId: 'b1', id: 'b1', name: 'Dragon', itemName: 'Dragon', value: 100, rarity: 'legendary', quantity: 1, imageUrl: '', image: '' }];
      r = await fetch(base, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ selectedItems: [{ itemId: 'c1', quantity: 1 }], sideChosen: 'heads' })
      });
      bet = await r.json();
      r = await fetch(`${base}/${bet.id}/bot-join`, { method: 'POST' });
      settled = await r.json();
      if (r.ok && settled.status === 'completed') break;
    }
    check('bot-join settles', settled && settled.status === 'completed', `status=${settled && settled.status}`);
    check('bot is opponent', settled && settled.opponentId === 'bot');
    check('has winner', settled && !!settled.winnerId);
    check('tax recorded', settled && typeof settled.taxAmount === 'number');
    check('coinflipResult broadcast', emitted.some((e) => e.ev === 'coinflipResult'));
    check('total conserved-ish (pot 200 = winner+tax)', (() => {
      const w = dbStub.getUserInventory(settled.winnerId);
      const wTotal = w.items.reduce((s, i) => s + ((i.value || 0) * (i.quantity || 1)), 0);
      const botInv = dbStub.getUserInventory('bot');
      const botTotal = botInv.items.reduce((s, i) => s + ((i.value || 0) * (i.quantity || 1)), 0);
      // pot was 200; winner + bot-tax-recipient holdings of pot items should cover it
      return wTotal + botTotal >= 200;
    })());

    // 4. Re-join a finished bet fails
    r = await fetch(`${base}/${settled.id}/bot-join`, { method: 'POST' });
    check('finished bet rejected', r.status === 400);
  } catch (e) {
    results.push('FAIL harness error :: ' + e.message);
  } finally {
    console.log(results.join('\n'));
    server.close();
    setTimeout(() => process.exit(0), 500).unref();
  }
});
