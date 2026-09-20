const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const USERS_DB_PATH = path.join(__dirname, 'users.json');
const ITEMS_DB_PATH = path.join(__dirname, 'items.json');
const MAIN_DB_PATH = path.join(__dirname, 'db.json');
const SETTINGS_DB_PATH = path.join(__dirname, 'settings.json');
const COINFLIP_DB_PATH = path.join(__dirname, 'coinflip.json');

function loadJSON(filePath, defaultContent) {
  try {
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, JSON.stringify(defaultContent, null, 2), 'utf8');
      return JSON.parse(JSON.stringify(defaultContent));
    }
    const raw = fs.readFileSync(filePath, 'utf8');
    if (!raw || raw.trim() === '') {
      fs.writeFileSync(filePath, JSON.stringify(defaultContent, null, 2), 'utf8');
      return JSON.parse(JSON.stringify(defaultContent));
    }
    return JSON.parse(raw);
  } catch (err) {
    console.error(`[dbHelper] Error loading ${filePath}:`, err.message);
    return JSON.parse(JSON.stringify(defaultContent));
  }
}

function saveJSON(filePath, data) {
  try {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.error(`[dbHelper] Error saving ${filePath}:`, err.message);
    return false;
  }
}

function normalizeUser(user) {
  if (!user) return null;
  const now = new Date().toISOString();
  const base = {
    id: user.id || uuidv4(),
    robloxUserId: user.robloxUserId || user.robloxId || null,
    robloxUsername: user.robloxUsername || user.username || '',
    robloxDisplayName: user.robloxDisplayName || user.robloxName || null,
    displayName: user.displayName || user.robloxDisplayName || user.robloxUsername || user.username || 'Anonymous',
    email: user.email || '',
    password: user.password || '',
    avatar: user.avatar || user.profilePicture || '',
    avatarCachedAt: user.avatarCachedAt || 0,
    balance: typeof user.balance === 'number' ? user.balance : 0,
    lockedBalance: typeof user.lockedBalance === 'number' ? user.lockedBalance : 0,
    totalDeposited: typeof user.totalDeposited === 'number' ? user.totalDeposited : 0,
    totalWithdrawn: typeof user.totalWithdrawn === 'number' ? user.totalWithdrawn : 0,
    gamesPlayed: typeof user.gamesPlayed === 'number' ? user.gamesPlayed : 0,
    gamesWon: typeof user.gamesWon === 'number' ? user.gamesWon : 0,
    gamesLost: typeof user.gamesLost === 'number' ? user.gamesLost : 0,
    highestStreak: typeof user.highestStreak === 'number' ? user.highestStreak : 0,
    currentStreak: typeof user.currentStreak === 'number' ? user.currentStreak : 0,
    isAdmin: user.isAdmin === true,
    isActive: user.isActive !== false,
    isBanned: user.isBanned === true || user.status === 'banned',
    isFrozen: user.isFrozen === true,
    isMuted: user.isMuted === true,
    status: user.status || (user.isBanned ? 'banned' : 'active'),
    lastLogin: user.lastLogin || now,
    createdAt: user.createdAt || now,
    updatedAt: user.updatedAt || now,
    inventorySyncedAt: user.inventorySyncedAt || 0
  };

  if (base.isBanned && base.status !== 'banned') base.status = 'banned';
  if (base.status === 'banned') base.isBanned = true;
  if (!base.isBanned && base.status === 'banned') base.status = 'active';

  return base;
}

let usersDb = loadJSON(USERS_DB_PATH, { users: [] });
if (Array.isArray(usersDb.users)) {
  usersDb.users = usersDb.users.map(normalizeUser);
  saveJSON(USERS_DB_PATH, usersDb);
} else {
  usersDb = { users: [] };
}

let itemsDb = loadJSON(ITEMS_DB_PATH, { items: [] });
if (!Array.isArray(itemsDb.items)) {
  itemsDb = { items: [] };
}

const defaultMainDb = {
  coinflips: [],
  inventories: [],
  transactions: [],
  deposits: [],
  withdrawals: [],
  pendingTransactions: [],
  blackjackGames: [],
  settings: {}
};
let db = loadJSON(MAIN_DB_PATH, defaultMainDb);
if (!db) db = JSON.parse(JSON.stringify(defaultMainDb));
if (!Array.isArray(db.coinflips)) db.coinflips = [];
if (!Array.isArray(db.inventories)) db.inventories = [];
if (!Array.isArray(db.transactions)) db.transactions = [];
if (!Array.isArray(db.deposits)) db.deposits = [];
if (!Array.isArray(db.withdrawals)) db.withdrawals = [];
if (!Array.isArray(db.pendingTransactions)) db.pendingTransactions = [];
if (!Array.isArray(db.blackjackGames)) db.blackjackGames = [];
if (!db.settings || typeof db.settings !== 'object') db.settings = {};

if (!loadJSON.cacheHitMain) {
  saveJSON(MAIN_DB_PATH, db);
}
loadJSON.cacheHitMain = true;

loadJSON(SETTINGS_DB_PATH, {});
loadJSON(COINFLIP_DB_PATH, { coinflips: [] });

const dbManager = {
  getUsersDb() {
    return usersDb;
  },

  getItemsDb() {
    return itemsDb;
  },

  getMainDb() {
    return db;
  },

  saveUsersDb() {
    if (Array.isArray(usersDb.users)) {
      usersDb.users = usersDb.users.map(u => {
        const norm = normalizeUser(u);
        norm.updatedAt = new Date().toISOString();
        return norm;
      });
    }
    return saveJSON(USERS_DB_PATH, usersDb);
  },

  saveItemsDb() {
    return saveJSON(ITEMS_DB_PATH, itemsDb);
  },

  saveMainDb() {
    return saveJSON(MAIN_DB_PATH, db);
  },

  getUserInventory(userId) {
    if (!userId) return { id: null, userId, items: [], totalValue: 0 };
    if (!db.inventories) db.inventories = [];

    let inv = db.inventories.find(i => i.userId === userId);
    if (!inv) {
      inv = {
        id: `inv-${userId}`,
        userId: userId,
        items: [],
        totalValue: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      db.inventories.push(inv);
      saveJSON(MAIN_DB_PATH, db);
    }
    if (!inv.items) inv.items = [];
    if (!inv.totalValue) inv.totalValue = 0;
    return inv;
  },

  addItemToUserInventory(userId, item, quantity) {
    if (!userId || !item) return null;
    const inv = this.getUserInventory(userId);
    const qty = typeof quantity === 'number' ? quantity : (item.quantity || 1);

    const existing = inv.items.find(i =>
      (i.itemId && i.itemId === (item.itemId || item.id)) ||
      (i.id && i.id === (item.itemId || item.id))
    );

    if (existing) {
      existing.quantity = (existing.quantity || 1) + qty;
    } else {
      const now = new Date().toISOString();
      inv.items.push({
        id: item.id || item.itemId || uuidv4(),
        itemId: item.itemId || item.id,
        name: item.name || item.itemName || 'Unknown Item',
        itemName: item.itemName || item.name || 'Unknown Item',
        value: typeof item.value === 'number' ? item.value : 0,
        rarity: item.rarity || 'common',
        quantity: qty,
        image: item.image || item.imageUrl || '',
        imageUrl: item.imageUrl || item.image || '',
        details: item.details || {
          name: item.name || item.itemName || 'Unknown Item',
          imageUrl: item.image || item.imageUrl || '',
          rarity: item.rarity || 'common'
        },
        createdAt: item.createdAt || now,
        updatedAt: now
      });
    }

    inv.totalValue = Array.isArray(inv.items)
      ? inv.items.reduce((s, i) => s + ((i.value || 0) * (i.quantity || 1)), 0)
      : 0;
    inv.updatedAt = new Date().toISOString();

    saveJSON(MAIN_DB_PATH, db);
    return inv;
  },

  removeItemFromUserInventory(userId, itemId, quantity) {
    if (!userId || !itemId) return false;
    const inv = this.getUserInventory(userId);
    if (!inv || !Array.isArray(inv.items)) return false;
    const qty = typeof quantity === 'number' ? quantity : 1;

    const idx = inv.items.findIndex(i =>
      i.itemId === itemId || i.id === itemId
    );
    if (idx === -1) return false;

    const currentQty = inv.items[idx].quantity || 1;
    if (currentQty <= qty) {
      inv.items.splice(idx, 1);
    } else {
      inv.items[idx].quantity = currentQty - qty;
    }

    inv.totalValue = inv.items.reduce((s, i) => s + ((i.value || 0) * (i.quantity || 1)), 0);
    inv.updatedAt = new Date().toISOString();

    saveJSON(MAIN_DB_PATH, db);
    return true;
  },

  findUserByRobloxUsername(username) {
    if (!username) return null;
    const key = String(username).toLowerCase();
    return usersDb.users.find(u =>
      (u.robloxUsername && String(u.robloxUsername).toLowerCase() === key) ||
      (u.username && String(u.username).toLowerCase() === key)
    );
  },

  findUserById(id) {
    if (!id) return null;
    return usersDb.users.find(u => u.id === id || String(u.id) === String(id));
  },

  normalizeUser,

  addUser(userData) {
    const normalized = normalizeUser(userData);
    usersDb.users.push(normalized);
    this.saveUsersDb();
    return normalized;
  },

  updateUser(userId, patch) {
    const user = this.findUserById(userId) || this.findUserByRobloxUsername(userId);
    if (!user) return null;
    Object.assign(user, patch || {});
    user.updatedAt = new Date().toISOString();
    const norm = normalizeUser(user);
    const idx = usersDb.users.findIndex(u => u.id === norm.id);
    if (idx !== -1) usersDb.users[idx] = norm;
    this.saveUsersDb();
    return norm;
  }
};

module.exports = dbManager;
