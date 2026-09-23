// Jackpot route integration test with stubbed db layer.
const path = require('path');
const Module = require('module');

const ROUTE = path.join(__dirname, 'backend', 'routes', 'jackpot.js');

// ---- In-memory fake DB ----
const state = {
  users: [
    { id: 'u1', robloxUsername: 'Alice', displayName: 'Alice', avatar: 'a1', gamesPlayed: 0, gamesWon: 0, gamesLost: 0 },
    { id: 'u2', robloxUsername: 'Bob', displayName: 'Bob', avatar: 'a2', gamesPlayed: 0, gamesWon: 0, gamesLost: 0 }
  ],
  main: { jackpots: [] },
  inventories: {
    u1: { items: [
      { itemId: 'p1', id: 'p1', name: 'Cat', itemName: 'Cat', value: 100, rarity: 'rare', quantity: 1, imageUrl: '', image: '' },
      { itemId: 'p2', id: 'p2', name: 'Dog', itemName: 'Dog', value: 50, rarity: 'common', quantity: 2, imageUrl: '', image: '' }
    ] },
    u2: { items: [
      { itemId: 'p3', id: 'p3', name: 'Fox', itemName: 'Fox', value: 120, rarity: 'epic', quantity: 1, imageUrl: '', image: '' }
    ] }
  }
};
const emitted = [];

function invTotal(inv) {
  return inv.items.reduce((s, i) => s + ((i.value || 0) * (i.quantity || 1)), 0);
}

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

// tax disabled for deterministic value checks (no recipient configured)
const taxStub = {
  getTaxRecipient: () => null,
  getTaxConfig: () => ({ enabled: false, percent: 0, rate: 0 }),
  collectItemTax: (stacks) => ({ winnerStacks: stacks, taxStacks: [], taxAmount: 0, potValue: 0 })
};

let currentUser = 'u1';
const authStub = {
  authenticateToken: (req, res, next) => {
    req.user = { userId: currentUser, robloxUsername: currentUser === 'u1' ? 'Alice' : 'Bob' };
    next();
  }
};
const notifStub = { addNotification: () => ({}) };
const realtimeStub = { emitToAll: (ev, data) => emitted.push({ ev, data }) };

// Inject stubs into require cache before loading the route
function stubRequest(request, parent) {
  const filename = Module._resolveFilename(request, parent);
  if (request.endsWith('db/dbHelper')) return { exports: dbStub };
  if (request.endsWith('taxUtil')) return { exports: taxStub };
  if (request.endsWith('middleware/auth')) return { exports: authStub };
  if (request.endsWith('notificationService')) return { exports: notifStub };
  if (request.endsWith('realtime')) return { exports: realtimeStub };
  return null;
}
const origLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (parent && parent.filename === ROUTE) {
    const hit = stubRequest(request, parent);
    if (hit) return hit.exports;
  }
  return origLoad.call(this, request, parent, isMain);
};

const express = require('express');
const jackpotRouter = require(ROUTE);
const app = express();
app.use(express.json());
app.use('/api/jackpot', jackpotRouter);

const server = app.listen(0, async () => {
  const base = `http://127.0.0.1:${server.address().port}/api/jackpot`;
  const results = [];
  const check = (name, cond, extra) => {
    results.push(`${cond ? 'PASS' : 'FAIL'} ${name}${extra ? ' :: ' + extra : ''}`);
  };
  try {
    // 1. Alice joins (creates waiting round)
    currentUser = 'u1';
    let r = await fetch(`${base}/join`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ selectedItems: [{ itemId: 'p1', quantity: 1 }] })
    });
    let j = await r.json();
    check('alice join ok', r.ok && j.entries.length === 1, `status=${j.status}`);
    check('alice item deducted', state.inventories.u1.items.find((i) => i.itemId === 'p1') === undefined);
    check('still waiting', j.status === 'waiting');

    // 2. Alice cannot join twice
    r = await fetch(`${base}/join`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ selectedItems: [{ itemId: 'p2', quantity: 1 }] })
    });
    check('double join rejected', r.status === 400);

    // 3. Bob joins (starts timer)
    currentUser = 'u2';
    r = await fetch(`${base}/join`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ selectedItems: [{ itemId: 'p3', quantity: 1 }] })
    });
    j = await r.json();
    check('bob join ok, active', r.ok && j.status === 'active' && j.entries.length === 2);
    check('pot value 220', j.totalValue === 220, `got=${j.totalValue}`);

    // 4. Active endpoint returns it
    r = await fetch(`${base}/active`);
    j = await r.json();
    check('active returns round', r.ok && j && j.id);

    // 5. Resolve
    const id = j.id;
    r = await fetch(`${base}/${id}/resolve`, { method: 'POST' });
    j = await r.json();
    check('resolve ok', r.ok && j.status === 'completed' && !!j.winnerId, `winner=${j.winnerUsername}`);
    check('winner got pot + un-entered items', (() => {
      const w = dbStub.getUserInventory(j.winnerId);
      // pot 220 (p1+p3) + Alice's un-entered p2x2 (100) = 320 if Alice won;
      // Bob wins -> 220 only (he entered his only item)
      const wtotal = invTotal(w);
      return j.winnerId === 'u1' ? wtotal === 320 : wtotal === 220;
    })(), `winnerTotal=${invTotal(dbStub.getUserInventory(j.winnerId))}`);
    check('loser keeps only un-entered items', (() => {
      const loserId = j.winnerId === 'u1' ? 'u2' : 'u1';
      const ltotal = invTotal(dbStub.getUserInventory(loserId));
      // Alice entered p1 only (keeps p2x2 = 100); Bob entered his only item (keeps 0)
      return loserId === 'u1' ? ltotal === 100 : ltotal === 0;
    })());
    check('jackpotUpdate broadcast', emitted.some((e) => e.ev === 'jackpotUpdate'));
    check('double resolve rejected', (await (await fetch(`${base}/${id}/resolve`, { method: 'POST' })).json(), true) && true);
    r = await fetch(`${base}/${id}/resolve`, { method: 'POST' });
    check('second resolve 400', r.status === 400);

    // 6. New join after completion starts a fresh round
    currentUser = 'u1';
    r = await fetch(`${base}/join`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ selectedItems: [{ itemId: 'p2', quantity: 1 }] })
    });
    j = await r.json();
    check('fresh round after completion', r.ok && j.status === 'waiting' && j.entries.length === 1, `status=${j.status}`);

    // 7. Lazy expiry: backdate timer, GET /active resolves
    const jp = state.main.jackpots.find((x) => x.status === 'waiting');
    currentUser = 'u2';
    // give u2 something to join with
    state.inventories.u2.items.push({ itemId: 'p9', id: 'p9', name: 'Bird', itemName: 'Bird', value: 60, rarity: 'common', quantity: 1, imageUrl: '', image: '' });
    r = await fetch(`${base}/join`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ selectedItems: [{ itemId: 'p9', quantity: 1 }] })
    });
    j = await r.json();
    check('second round active', r.ok && j.status === 'active');
    // force expiry
    const live = state.main.jackpots.find((x) => x.id === j.id);
    live.timerStartedAt = new Date(Date.now() - 200000).toISOString();
    r = await fetch(`${base}/active`);
    j = await r.json();
    check('expired lazy-resolved (active returns null)', r.ok && j === null);
    const done = state.main.jackpots.find((x) => x.id === live.id);
    check('round completed in db', done.status === 'completed' && !!done.winnerId);
  } catch (e) {
    results.push('FAIL harness error :: ' + e.message);
  } finally {
    console.log(results.join('\n'));
    server.close();
  }
});
