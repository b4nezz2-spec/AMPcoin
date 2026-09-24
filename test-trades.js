// Trades route integration test with stubbed db layer.
const path = require('path');
const Module = require('module');

const ROUTE = path.join(__dirname, 'backend', 'routes', 'trades.js');
const BACKEND_PREFIX = __dirname + require('path').sep + 'backend' + require('path').sep;

const state = {
  users: [
    { id: 'u1', robloxUsername: 'Alice', displayName: 'Alice', avatar: 'a1' },
    { id: 'u2', robloxUsername: 'Bob', displayName: 'Bob', avatar: 'a2' },
    { id: 'u3', robloxUsername: 'Cara', displayName: 'Cara', avatar: 'a3' }
  ],
  main: {},
  catalog: [
    { id: 'cat1', itemId: 'cat1', name: 'Dragon', itemName: 'Dragon', baseValue: 500, value: 500, rarity: 'legendary', image: '', imageUrl: '' }
  ],
  inventories: {
    u1: { items: [
      { itemId: 'c1', id: 'c1', name: 'Cat', itemName: 'Cat', value: 100, rarity: 'rare', quantity: 1, imageUrl: '', image: '' },
      { itemId: 'c2', id: 'c2', name: 'Dog', itemName: 'Dog', value: 50, rarity: 'common', quantity: 1, imageUrl: '', image: '' }
    ] },
    u2: { items: [
      { itemId: 'f1', id: 'f1', name: 'Fox', itemName: 'Fox', value: 120, rarity: 'epic', quantity: 1, imageUrl: '', image: '' }
    ] },
    u3: { items: [
      { itemId: 'b1', id: 'b1', name: 'Bird', itemName: 'Bird', value: 60, rarity: 'common', quantity: 1, imageUrl: '', image: '' }
    ] }
  }
};
const emitted = [];
const notifs = [];

const dbStub = {
  getMainDb: () => state.main,
  getUsersDb: () => ({ users: state.users }),
  getItemsDb: () => ({ items: state.catalog }),
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
    const u = state.users.find((x) => x.id === currentUser);
    req.user = { userId: currentUser, robloxUsername: u.robloxUsername };
    next();
  }
};
const notifStub = { addNotification: (n) => { notifs.push(n); return {}; } };
const realtimeStub = { emitToAll: (ev, data) => emitted.push({ ev, data }) };

const origLoad = Module._load;
Module._load = function (request, parent, isMain) {
  const inBackend = parent && parent.filename && parent.filename.startsWith(BACKEND_PREFIX);
  if (inBackend) {
    if (request.endsWith('db/dbHelper')) return dbStub;
    if (request.endsWith('middleware/auth')) return authStub;
    if (request.endsWith('notificationService')) return notifStub;
    if (request.endsWith('realtime')) return realtimeStub;
  }
  return origLoad.call(this, request, parent, isMain);
};

const express = require('express');
const tradesRouter = require(ROUTE);
const app = express();
app.use(express.json());
app.use('/api/trades', tradesRouter);

const server = app.listen(0, async () => {
  const base = `http://127.0.0.1:${server.address().port}/api/trades`;
  const results = [];
  const check = (name, cond, extra) => {
    results.push(`${cond ? 'PASS' : 'FAIL'} ${name}${extra ? ' :: ' + extra : ''}`);
  };
  const post = (url, body) => fetch(url, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {})
  });
  try {
    // 1. Alice creates trade: offers Cat, wants Dragon + text
    currentUser = 'u1';
    let r = await post(base, {
      offerItems: [{ itemId: 'c1', quantity: 1 }],
      wantItems: [{ itemId: 'cat1', quantity: 1 }],
      wantText: 'dragon pls'
    });
    let t = await r.json();
    check('create ok', r.status === 201 && t.offerItems.length === 1 && t.wantItems.length === 1);
    check('cat escrowed', !state.inventories.u1.items.some((i) => i.itemId === 'c1'));
    const tradeId = t.id;

    // 2. List shows it
    r = await fetch(base);
    let list = await r.json();
    check('listed', list.trades.length === 1);

    // 3. Bob offers Fox
    currentUser = 'u2';
    r = await post(`${base}/${tradeId}/offers`, { items: [{ itemId: 'f1', quantity: 1 }] });
    t = await r.json();
    check('offer ok', r.status === 201 && t.offers.length === 1);
    check('fox escrowed', !state.inventories.u2.items.some((i) => i.itemId === 'f1'));
    const offerId = t.offers[0].id;

    // 4. Bob cannot double-offer
    r = await post(`${base}/${tradeId}/offers`, { items: [{ itemId: 'f1', quantity: 1 }] });
    check('double offer rejected', r.status === 400);

    // 5. Cara offers Bird
    currentUser = 'u3';
    r = await post(`${base}/${tradeId}/offers`, { items: [{ itemId: 'b1', quantity: 1 }] });
    check('second offer ok', r.status === 201);

    // 6. Non-creator cannot accept
    r = await post(`${base}/${tradeId}/offers/${offerId}/accept`, {});
    check('non-creator accept rejected', r.status === 403);

    // 7. Alice accepts Bob's offer: Alice gets Fox, Bob gets Cat, Cara refunded Bird
    currentUser = 'u1';
    r = await post(`${base}/${tradeId}/offers/${offerId}/accept`, {});
    t = await r.json();
    check('accept ok, completed', r.ok && t.status === 'completed');
    check('alice has fox', state.inventories.u1.items.some((i) => i.itemId === 'f1'));
    check('bob has cat', state.inventories.u2.items.some((i) => i.itemId === 'c1'));
    check('cara refunded bird', state.inventories.u3.items.some((i) => i.itemId === 'b1'));
    check('trade gone from list', (await (await fetch(base)).json()).trades.length === 0);
    check('notifs sent', notifs.length >= 2);

    // 8. Decline flow: new trade, offer, decline refunds
    currentUser = 'u1';
    r = await post(base, { offerItems: [{ itemId: 'c2', quantity: 1 }], wantText: 'anything' });
    t = await r.json();
    const t2 = t.id;
    check('cat escrowed for t2', !state.inventories.u1.items.some((i) => i.itemId === 'c2'));
    currentUser = 'u3';
    r = await post(`${base}/${t2}/offers`, { items: [{ itemId: 'b1', quantity: 1 }] });
    t = await r.json();
    const o2 = t.offers[0].id;
    currentUser = 'u1';
    r = await post(`${base}/${t2}/offers/${o2}/decline`, {});
    check('decline ok', r.ok);
    check('bird refunded', state.inventories.u3.items.some((i) => i.itemId === 'b1'));

    // 9. Cancel returns escrow
    r = await fetch(`${base}/${t2}`, { method: 'DELETE' });
    check('cancel ok', r.ok);
    check('dog returned', state.inventories.u1.items.some((i) => i.itemId === 'c2'));
    check('list empty', (await (await fetch(base)).json()).trades.length === 0);
    check('tradeUpdate broadcast', emitted.some((e) => e.ev === 'tradeUpdate'));
  } catch (e) {
    results.push('FAIL harness error :: ' + e.message);
  } finally {
    console.log(results.join('\n'));
    server.close();
    setTimeout(() => process.exit(0), 500).unref();
  }
});
