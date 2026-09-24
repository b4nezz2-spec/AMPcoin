const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { authenticateToken } = require('../middleware/auth');
const dbManager = require('../db/dbHelper');
const { addNotification } = require('../notificationService');

function getTrades() {
  const db = dbManager.getMainDb();
  if (!db.trades) db.trades = [];
  return db.trades;
}

function detailItems(invItems, selected) {
  const out = [];
  for (const sel of selected || []) {
    const inv = invItems.find((i) => i.itemId === sel.itemId || i.id === sel.itemId);
    const qty = Math.max(1, parseInt(sel.quantity || 1, 10) || 1);
    if (!inv || (inv.quantity || 1) < qty) {
      return { error: `Insufficient quantity for ${sel.name || sel.itemId}` };
    }
    out.push({
      id: inv.itemId || inv.id,
      itemId: inv.itemId || inv.id,
      name: inv.name || inv.itemName || 'Item',
      itemName: inv.itemName || inv.name || 'Item',
      value: Number(inv.value || 0),
      rarity: inv.rarity || 'common',
      quantity: qty,
      mods: Array.isArray(inv.mods) ? inv.mods : [],
      image: inv.image || inv.imageUrl || '',
      imageUrl: inv.imageUrl || inv.image || ''
    });
  }
  return { items: out };
}

function tradeValue(items) {
  return (items || []).reduce((s, it) => s + (Number(it.value || 0) * (it.quantity || 1)), 0);
}

function publicTrade(t) {
  return {
    id: t.id,
    creatorId: t.creatorId,
    creatorUsername: t.creatorUsername,
    creatorAvatar: t.creatorAvatar || '',
    offerItems: t.offerItems || [],
    offerValue: tradeValue(t.offerItems),
    wantItems: t.wantItems || [],
    wantValue: tradeValue(t.wantItems),
    wantText: t.wantText || '',
    offers: (t.offers || []).map((o) => ({
      id: o.id,
      userId: o.userId,
      username: o.username,
      avatar: o.avatar || '',
      items: o.items || [],
      value: tradeValue(o.items),
      createdAt: o.createdAt
    })),
    status: t.status,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt
  };
}

function broadcast() {
  try {
    const { emitToAll } = require('../realtime');
    emitToAll('tradeUpdate', { at: new Date().toISOString() });
  } catch (_) { /* ignore */ }
}

// List open trades (optionally only mine)
router.get('/', (req, res) => {
  try {
    let trades = getTrades().filter((t) => t.status === 'open');
    if (req.query.mine && req.query.userId) {
      trades = trades.filter((t) => t.creatorId === req.query.userId);
    }
    trades = [...trades].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    res.json({ trades: trades.map(publicTrade) });
  } catch (err) {
    console.error('Error listing trades:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Create a trade (offer items are escrowed out of inventory)
router.post('/', authenticateToken, (req, res) => {
  try {
    const userId = req.user.userId;
    const { offerItems, wantItems, wantText } = req.body;

    if (!Array.isArray(offerItems) || offerItems.length === 0) {
      return res.status(400).json({ message: 'Add at least one pet to offer' });
    }

    const usersDb = dbManager.getUsersDb();
    const user = usersDb.users.find((u) => u.id === userId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const inv = dbManager.getUserInventory(userId);
    const built = detailItems(inv.items || [], offerItems);
    if (built.error) return res.status(400).json({ message: built.error });

    // Wants are catalog references (no escrow) — validate they exist
    let wants = [];
    if (Array.isArray(wantItems) && wantItems.length > 0) {
      const itemsDb = dbManager.getItemsDb();
      for (const w of wantItems) {
        const cat = (itemsDb.items || []).find(
          (i) => i.id === w.itemId || i.itemId === w.itemId
        );
        if (!cat) return res.status(400).json({ message: `Wanted item not found: ${w.name || w.itemId}` });
        wants.push({
          id: cat.id || cat.itemId,
          itemId: cat.itemId || cat.id,
          name: cat.name || cat.itemName || 'Item',
          itemName: cat.itemName || cat.name || 'Item',
          value: Number(cat.baseValue ?? cat.value ?? 0),
          rarity: cat.rarity || 'common',
          quantity: Math.max(1, parseInt(w.quantity || 1, 10) || 1),
          image: cat.image || cat.imageUrl || '',
          imageUrl: cat.imageUrl || cat.image || ''
        });
      }
    }

    // Escrow the offered items
    for (const it of built.items) {
      dbManager.removeItemFromUserInventory(userId, it.itemId, it.quantity);
    }

    const trade = {
      id: uuidv4(),
      creatorId: userId,
      creatorUsername: user.displayName || user.robloxDisplayName || user.robloxUsername,
      creatorAvatar: user.avatar || '',
      offerItems: built.items,
      wantItems: wants,
      wantText: String(wantText || '').slice(0, 200),
      offers: [],
      status: 'open',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    getTrades().unshift(trade);
    dbManager.saveMainDb();

    const { emitToAll } = require('../realtime');
    emitToAll('inventoryUpdate', { userId });
    broadcast();

    res.status(201).json(publicTrade(trade));
  } catch (err) {
    console.error('Error creating trade:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Make an offer on a trade (offer items are escrowed)
router.post('/:id/offers', authenticateToken, (req, res) => {
  try {
    const userId = req.user.userId;
    const trade = getTrades().find((t) => t.id === req.params.id);
    if (!trade || trade.status !== 'open') {
      return res.status(404).json({ message: 'Trade not found or closed' });
    }
    if (trade.creatorId === userId) {
      return res.status(400).json({ message: 'You cannot offer on your own trade' });
    }
    if ((trade.offers || []).some((o) => o.userId === userId)) {
      return res.status(400).json({ message: 'You already have an offer on this trade' });
    }

    const usersDb = dbManager.getUsersDb();
    const user = usersDb.users.find((u) => u.id === userId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const inv = dbManager.getUserInventory(userId);
    const built = detailItems(inv.items || [], req.body.items);
    if (built.error) return res.status(400).json({ message: built.error });
    if (built.items.length === 0) {
      return res.status(400).json({ message: 'Add at least one pet to your offer' });
    }

    for (const it of built.items) {
      dbManager.removeItemFromUserInventory(userId, it.itemId, it.quantity);
    }

    const offer = {
      id: uuidv4(),
      userId,
      username: user.displayName || user.robloxDisplayName || user.robloxUsername,
      avatar: user.avatar || '',
      items: built.items,
      createdAt: new Date().toISOString()
    };
    trade.offers.push(offer);
    trade.updatedAt = new Date().toISOString();
    dbManager.saveMainDb();

    addNotification({
      userId: trade.creatorId,
      type: 'items',
      title: 'New trade offer',
      message: `${offer.username} offered ${built.items.length} pet(s) (◆${tradeValue(built.items).toLocaleString()}) on your trade.`,
      imageUrl: ''
    });

    const { emitToAll } = require('../realtime');
    emitToAll('inventoryUpdate', { userId });
    broadcast();

    res.status(201).json(publicTrade(trade));
  } catch (err) {
    console.error('Error making offer:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Accept an offer (creator only) — swap escrowed items, refund the rest
router.post('/:id/offers/:offerId/accept', authenticateToken, (req, res) => {
  try {
    const userId = req.user.userId;
    const trade = getTrades().find((t) => t.id === req.params.id);
    if (!trade || trade.status !== 'open') {
      return res.status(404).json({ message: 'Trade not found or closed' });
    }
    if (trade.creatorId !== userId) {
      return res.status(403).json({ message: 'Only the trade creator can accept' });
    }
    const offer = (trade.offers || []).find((o) => o.id === req.params.offerId);
    if (!offer) return res.status(404).json({ message: 'Offer not found' });

    // Creator receives the offer items, offerer receives the trade items
    for (const it of offer.items) {
      dbManager.addItemToUserInventory(trade.creatorId, it, it.quantity || 1);
    }
    for (const it of trade.offerItems) {
      dbManager.addItemToUserInventory(offer.userId, it, it.quantity || 1);
    }
    // Refund all other offers
    const refunded = [];
    for (const o of trade.offers) {
      if (o.id === offer.id) continue;
      for (const it of o.items) {
        dbManager.addItemToUserInventory(o.userId, it, it.quantity || 1);
      }
      refunded.push(o.userId);
    }

    trade.status = 'completed';
    trade.acceptedOfferId = offer.id;
    trade.updatedAt = new Date().toISOString();
    dbManager.saveMainDb();

    addNotification({
      userId: offer.userId,
      type: 'items',
      title: 'Trade accepted!',
      message: `${trade.creatorUsername} accepted your offer — pets swapped!`,
      imageUrl: ''
    });
    for (const uid of refunded) {
      addNotification({
        userId: uid,
        type: 'items',
        title: 'Trade closed',
        message: 'A trade you offered on was completed — your pets were returned.',
        imageUrl: ''
      });
    }

    const { emitToAll } = require('../realtime');
    emitToAll('inventoryUpdate', { userId: trade.creatorId });
    emitToAll('inventoryUpdate', { userId: offer.userId });
    for (const uid of refunded) emitToAll('inventoryUpdate', { userId: uid });
    broadcast();

    res.json(publicTrade(trade));
  } catch (err) {
    console.error('Error accepting offer:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Decline an offer (creator only) — returns escrowed items
router.post('/:id/offers/:offerId/decline', authenticateToken, (req, res) => {
  try {
    const userId = req.user.userId;
    const trade = getTrades().find((t) => t.id === req.params.id);
    if (!trade || trade.status !== 'open') {
      return res.status(404).json({ message: 'Trade not found or closed' });
    }
    if (trade.creatorId !== userId) {
      return res.status(403).json({ message: 'Only the trade creator can decline' });
    }
    const idx = (trade.offers || []).findIndex((o) => o.id === req.params.offerId);
    if (idx === -1) return res.status(404).json({ message: 'Offer not found' });
    const [offer] = trade.offers.splice(idx, 1);

    for (const it of offer.items) {
      dbManager.addItemToUserInventory(offer.userId, it, it.quantity || 1);
    }
    trade.updatedAt = new Date().toISOString();
    dbManager.saveMainDb();

    addNotification({
      userId: offer.userId,
      type: 'items',
      title: 'Offer declined',
      message: `${trade.creatorUsername} declined your offer — pets returned.`,
      imageUrl: ''
    });

    const { emitToAll } = require('../realtime');
    emitToAll('inventoryUpdate', { userId: offer.userId });
    broadcast();

    res.json(publicTrade(trade));
  } catch (err) {
    console.error('Error declining offer:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Cancel a trade (creator only) — returns everything escrowed
router.delete('/:id', authenticateToken, (req, res) => {
  try {
    const userId = req.user.userId;
    const trade = getTrades().find((t) => t.id === req.params.id);
    if (!trade || trade.status !== 'open') {
      return res.status(404).json({ message: 'Trade not found or closed' });
    }
    if (trade.creatorId !== userId) {
      return res.status(403).json({ message: 'Only the trade creator can cancel' });
    }

    for (const it of trade.offerItems) {
      dbManager.addItemToUserInventory(trade.creatorId, it, it.quantity || 1);
    }
    const touched = new Set([trade.creatorId]);
    for (const o of trade.offers || []) {
      for (const it of o.items) {
        dbManager.addItemToUserInventory(o.userId, it, it.quantity || 1);
      }
      touched.add(o.userId);
    }

    trade.status = 'cancelled';
    trade.updatedAt = new Date().toISOString();
    dbManager.saveMainDb();

    const { emitToAll } = require('../realtime');
    for (const uid of touched) emitToAll('inventoryUpdate', { userId: uid });
    broadcast();

    res.json({ message: 'Trade cancelled, pets returned' });
  } catch (err) {
    console.error('Error cancelling trade:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
