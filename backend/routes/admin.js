const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { authenticateAdmin } = require('../middleware/auth');
const dbManager = require('../db/dbHelper');

// Admin dashboard stats
function dashboardStats(req, res) {
  try {
    const usersDb = dbManager.getUsersDb();
    const itemsDb = dbManager.getItemsDb();
    const db = dbManager.getMainDb();

    const stats = {
      totalUsers: (usersDb.users || []).length,
      totalItems: (itemsDb.items || []).length,
      totalCoinflips: (db.coinflips || []).length,
      totalBlackjackGames: (db.blackjackGames || []).length,
      totalTransactions: (db.transactions || []).length,
      totalDeposits: (db.deposits || []).length,
      totalWithdrawals: (db.withdrawals || []).length,
      totalChatMessages: (db.chatMessages || []).length,
      totalBalance: (usersDb.users || []).reduce((sum, user) => sum + (user.balance || 0), 0),
      dailyActiveUsers: (usersDb.users || []).filter(u => {
        const lastLogin = new Date(u.lastLogin);
        const today = new Date();
        return lastLogin.toDateString() === today.toDateString();
      }).length
    };

    res.json(stats);
  } catch (error) {
    console.error('Error fetching dashboard stats:', error);
    res.status(500).json({ message: 'Server error' });
  }
}

router.get('/dashboard', authenticateAdmin, dashboardStats);
// Alias used by the frontend admin panel
router.get('/stats', authenticateAdmin, dashboardStats);

// Get all users
router.get('/users', authenticateAdmin, (req, res) => {
  try {
    const { search, page = 1, limit = 1000 } = req.query;
    const usersDb = dbManager.getUsersDb();
    let users = [...(usersDb.users || [])];

    if (search) {
      const term = search.toLowerCase();
      users = users.filter(user => 
        (user.displayName && user.displayName.toLowerCase().includes(term)) ||
        (user.robloxUsername && user.robloxUsername.toLowerCase().includes(term)) ||
        (user.id && user.id.toLowerCase().includes(term))
      );
    }

    // Pagination
    const startIndex = (parseInt(page) - 1) * parseInt(limit);
    const endIndex = startIndex + parseInt(limit);
    const paginatedUsers = users.slice(startIndex, endIndex);

    res.json({
      users: paginatedUsers,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(users.length / parseInt(limit)) || 1,
        total: users.length
      }
    });
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get user by ID or robloxUsername
router.get('/users/:robloxUsername', authenticateAdmin, (req, res) => {
  try {
    const robloxUsername = req.params.robloxUsername;
    const usersDb = dbManager.getUsersDb();
    const db = dbManager.getMainDb();

    const user = usersDb.users.find(u => u.robloxUsername === robloxUsername || u.id === robloxUsername);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Get user's inventory
    const inventory = dbManager.getUserInventory(user.id);
    
    // Get user's transactions
    const transactions = (db.transactions || []).filter(t => t.userId === user.id);
    
    // Get user's game history
    const coinflipHistory = (db.coinflips || []).filter(cf => 
      cf.creatorId === user.id || cf.opponentId === user.id
    );
    
    const blackjackHistory = (db.blackjackGames || []).filter(bg => 
      bg.playerId === user.id
    );

    res.json({
      user,
      inventory,
      transactions,
      gameHistory: {
        coinflip: coinflipHistory,
        blackjack: blackjackHistory
      }
    });
  } catch (error) {
    console.error('Error fetching user details:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update user balance (give/remove AMPcoin)
router.put('/users/:robloxUsername/balance', authenticateAdmin, (req, res) => {
  try {
    const { amount, action, reason } = req.body;
    const robloxUsername = req.params.robloxUsername;
    const usersDb = dbManager.getUsersDb();
    const db = dbManager.getMainDb();
    
    const user = usersDb.users.find(u => u.robloxUsername === robloxUsername || u.id === robloxUsername);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({ message: 'Invalid amount' });
    }

    let newBalance;
    if (action === 'add') {
      user.balance = (user.balance || 0) + parsedAmount;
      newBalance = user.balance;
    } else if (action === 'remove') {
      if ((user.balance || 0) < parsedAmount) {
        return res.status(400).json({ message: 'Insufficient balance to remove' });
      }
      user.balance = (user.balance || 0) - parsedAmount;
      newBalance = user.balance;
    } else {
      return res.status(400).json({ message: 'Invalid action. Use "add" or "remove"' });
    }

    user.updatedAt = new Date().toISOString();

    // Record admin action
    const adminLog = {
      id: uuidv4(),
      adminId: req.user.userId,
      adminUsername: req.user.robloxUsername,
      action: `balance_${action}`,
      targetUsername: user.robloxUsername,
      oldValue: action === 'add' ? user.balance - parsedAmount : user.balance + parsedAmount,
      newValue: newBalance,
      reason: reason || 'Admin adjustment',
      timestamp: new Date().toISOString()
    };

    // Record transaction
    const transaction = {
      id: uuidv4(),
      userId: user.id,
      robloxUsername: user.robloxUsername,
      amount: action === 'add' ? parsedAmount : -parsedAmount,
      type: `admin_balance_${action}`,
      status: 'completed',
      metadata: {
        adminId: req.user.userId,
        reason: reason || 'Admin adjustment'
      },
      timestamp: new Date().toISOString()
    };

    db.adminLogs = db.adminLogs || [];
    db.adminLogs.push(adminLog);
    db.transactions = db.transactions || [];
    db.transactions.push(transaction);

    dbManager.saveUsersDb();
    dbManager.saveMainDb();

    res.json({
      message: `Balance ${action === 'add' ? 'added' : 'removed'} successfully`,
      newBalance,
      transaction
    });
  } catch (error) {
    console.error('Error updating user balance:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Toggle user account status
router.put('/users/:robloxUsername/status', authenticateAdmin, (req, res) => {
  try {
    const { status, reason } = req.body;
    const robloxUsername = req.params.robloxUsername;
    const usersDb = dbManager.getUsersDb();
    const db = dbManager.getMainDb();
    
    const user = usersDb.users.find(u => u.robloxUsername === robloxUsername || u.id === robloxUsername);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (status !== 'active' && status !== 'inactive' && status !== 'banned') {
      return res.status(400).json({ message: 'Invalid status. Use "active", "inactive", or "banned"' });
    }

    user.isActive = status === 'active';
    user.isBanned = status === 'banned';
    user.updatedAt = new Date().toISOString();

    const adminLog = {
      id: uuidv4(),
      adminId: req.user.userId,
      adminUsername: req.user.robloxUsername,
      action: 'account_status_change',
      targetUsername: user.robloxUsername,
      newValue: status,
      reason: reason || 'Account status change',
      timestamp: new Date().toISOString()
    };

    db.adminLogs = db.adminLogs || [];
    db.adminLogs.push(adminLog);

    dbManager.saveUsersDb();
    dbManager.saveMainDb();

    res.json({
      message: `User status updated to ${status}`,
      user
    });
  } catch (error) {
    console.error('Error updating user status:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Add item to user inventory
router.post('/user/:userId/add-item', authenticateAdmin, (req, res) => {
  try {
    const { userId } = req.params;
    const { itemId, petId, quantity = 1 } = req.body;
    const targetItemId = itemId || petId;

    const usersDb = dbManager.getUsersDb();
    const user = usersDb.users.find(u => u.id === userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const itemsDb = dbManager.getItemsDb();
    const item = itemsDb.items.find(i => i.id === targetItemId || i.itemId === targetItemId);
    if (!item) {
      return res.status(404).json({ message: 'Item not found' });
    }

    const inventory = dbManager.addItemToUserInventory(userId, item, quantity);

    const db = dbManager.getMainDb();
    const adminLog = {
      id: uuidv4(),
      adminId: req.user.userId,
      adminUsername: req.user.robloxUsername,
      action: 'add_item_to_user',
      targetUserId: userId,
      targetUsername: user.robloxUsername,
      itemId: item.id,
      itemName: item.name,
      quantity: quantity,
      timestamp: new Date().toISOString()
    };
    db.adminLogs = db.adminLogs || [];
    db.adminLogs.push(adminLog);
    dbManager.saveMainDb();

    res.json({
      message: 'Item added to user inventory successfully',
      inventory: dbManager.getUserInventory(userId)
    });
  } catch (error) {
    console.error('Error adding item to user inventory:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Alias for add-pet to user inventory
router.post('/user/:userId/add-pet', authenticateAdmin, (req, res) => {
  const { userId } = req.params;
  const { petId, itemId, quantity = 1 } = req.body;
  const targetId = petId || itemId;

  const usersDb = dbManager.getUsersDb();
  const user = usersDb.users.find(u => u.id === userId);
  if (!user) {
    return res.status(404).json({ message: 'User not found' });
  }

  const itemsDb = dbManager.getItemsDb();
  const item = itemsDb.items.find(i => i.id === targetId || i.itemId === targetId);
  if (!item) {
    return res.status(404).json({ message: 'Pet not found' });
  }

  dbManager.addItemToUserInventory(userId, item, quantity);

  const db = dbManager.getMainDb();
  db.adminLogs = db.adminLogs || [];
  db.adminLogs.push({
    id: uuidv4(),
    adminId: req.user.userId,
    adminUsername: req.user.robloxUsername,
    action: 'add_pet_to_user',
    targetUserId: userId,
    targetUsername: user.robloxUsername,
    itemId: item.id,
    itemName: item.name,
    quantity,
    timestamp: new Date().toISOString()
  });
  dbManager.saveMainDb();

  res.json({
    message: 'Pet added to user inventory successfully',
    inventory: dbManager.getUserInventory(userId)
  });
});

// Remove item / pet from user inventory
router.delete('/user/:userId/remove-pet/:petId', authenticateAdmin, (req, res) => {
  try {
    const { userId, petId } = req.params;
    const { quantity = 1 } = req.body || {};

    const success = dbManager.removeItemFromUserInventory(userId, petId, quantity);
    if (!success) {
      return res.status(404).json({ message: 'Item not found in user inventory' });
    }

    const db = dbManager.getMainDb();
    db.adminLogs = db.adminLogs || [];
    db.adminLogs.push({
      id: uuidv4(),
      adminId: req.user.userId,
      adminUsername: req.user.robloxUsername,
      action: 'remove_pet_from_user',
      targetUserId: userId,
      petId,
      timestamp: new Date().toISOString()
    });
    dbManager.saveMainDb();

    res.json({
      message: 'Pet removed from user inventory successfully',
      inventory: dbManager.getUserInventory(userId)
    });
  } catch (error) {
    console.error('Error removing pet from user inventory:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get all items
router.get('/items', authenticateAdmin, (req, res) => {
  try {
    const { search, rarity, enabled } = req.query;
    const itemsDb = dbManager.getItemsDb();
    let items = [...(itemsDb.items || [])];

    if (search) {
      const term = search.toLowerCase();
      items = items.filter(item => 
        (item.name && item.name.toLowerCase().includes(term)) ||
        (item.description && item.description.toLowerCase().includes(term))
      );
    }

    if (rarity) {
      items = items.filter(item => item.rarity === rarity);
    }

    if (enabled !== undefined) {
      items = items.filter(item => item.isEnabled === (enabled === 'true'));
    }

    res.json(items);
  } catch (error) {
    console.error('Error fetching items:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get all coinflips
router.get('/coinflips', authenticateAdmin, (req, res) => {
  try {
    const { status, dateFrom, dateTo } = req.query;
    const db = dbManager.getMainDb();
    let coinflips = [...(db.coinflips || [])];

    if (status) {
      coinflips = coinflips.filter(cf => cf.status === status);
    }

    if (dateFrom) {
      coinflips = coinflips.filter(cf => new Date(cf.createdAt) >= new Date(dateFrom));
    }

    if (dateTo) {
      coinflips = coinflips.filter(cf => new Date(cf.createdAt) <= new Date(dateTo));
    }

    res.json(coinflips);
  } catch (error) {
    console.error('Error fetching coinflips:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get all blackjack games
router.get('/blackjack', authenticateAdmin, (req, res) => {
  try {
    const { status, dateFrom, dateTo } = req.query;
    const db = dbManager.getMainDb();
    let games = [...(db.blackjackGames || [])];

    if (status) {
      games = games.filter(game => game.status === status);
    }

    if (dateFrom) {
      games = games.filter(game => new Date(game.createdAt) >= new Date(dateFrom));
    }

    if (dateTo) {
      games = games.filter(game => new Date(game.createdAt) <= new Date(dateTo));
    }

    res.json(games);
  } catch (error) {
    console.error('Error fetching blackjack games:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get all transactions
router.get('/transactions', authenticateAdmin, (req, res) => {
  try {
    const { type, userId, dateFrom, dateTo } = req.query;
    const db = dbManager.getMainDb();
    let transactions = [...(db.transactions || [])];

    if (type) {
      transactions = transactions.filter(t => t.type === type);
    }

    if (userId) {
      transactions = transactions.filter(t => t.userId === userId);
    }

    if (dateFrom) {
      transactions = transactions.filter(t => new Date(t.timestamp) >= new Date(dateFrom));
    }

    if (dateTo) {
      transactions = transactions.filter(t => new Date(t.timestamp) <= new Date(dateTo));
    }

    res.json(transactions);
  } catch (error) {
    console.error('Error fetching transactions:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get all deposits
router.get('/deposits', authenticateAdmin, (req, res) => {
  try {
    const { status, userId, dateFrom, dateTo } = req.query;
    const db = dbManager.getMainDb();
    let deposits = [...(db.deposits || [])];

    if (status) {
      deposits = deposits.filter(d => d.status === status);
    }

    if (userId) {
      deposits = deposits.filter(d => d.userId === userId);
    }

    if (dateFrom) {
      deposits = deposits.filter(d => new Date(d.timestamp) >= new Date(dateFrom));
    }

    if (dateTo) {
      deposits = deposits.filter(d => new Date(d.timestamp) <= new Date(dateTo));
    }

    res.json(deposits);
  } catch (error) {
    console.error('Error fetching deposits:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get pending transactions (both fund and item withdrawals)
router.get('/transactions/pending', authenticateAdmin, (req, res) => {
  try {
    const db = dbManager.getMainDb();
    const usersDb = dbManager.getUsersDb();

    const pendingFundWithdrawals = Array.isArray(db.withdrawals) 
      ? db.withdrawals.filter(w => w?.status === 'pending') 
      : [];
      
    const pendingItemWithdrawals = Array.isArray(db.itemWithdrawals)
      ? db.itemWithdrawals.filter(w => w?.status === 'pending')
      : [];

    const pendingTransactions = Array.isArray(db.transactions)
      ? db.transactions.filter(t => t?.status === 'pending')
      : [];
    
    const allPending = [
      ...pendingFundWithdrawals.map(w => {
        const u = usersDb.users.find(u => u.robloxUsername === w.robloxUsername || u.id === w.userId);
        return {
          id: w.id,
          type: 'fund_withdrawal',
          amount: w.amount || 0,
          status: w.status,
          robloxUsername: w.robloxUsername || u?.robloxUsername || '',
          displayName: u?.displayName || u?.robloxDisplayName || w.robloxUsername || '',
          userName: u?.displayName || w.robloxUsername || w.userId || 'Unknown User',
          userId: w.userId || u?.id || '',
          address: w.address || '',
          createdAt: w.createdAt || w.timestamp || new Date().toISOString()
        };
      }),
      ...pendingItemWithdrawals.map(w => {
        const u = usersDb.users.find(u => u.id === w.userId);
        return {
          id: w.id,
          type: 'item_withdrawal',
          items: Array.isArray(w.items) ? w.items : [],
          totalValue: typeof w.totalValue === 'number' ? w.totalValue : 0,
          amount: typeof w.totalValue === 'number' ? w.totalValue : 0,
          status: w.status,
          robloxUsername: w.robloxUsername || u?.robloxUsername || '',
          displayName: w.displayName || u?.displayName || u?.robloxDisplayName || w.robloxUsername || '',
          userName: u?.displayName || w.userId || 'Unknown User',
          userId: w.userId || '',
          address: w.address || '',
          createdAt: w.createdAt || new Date().toISOString()
        };
      }),
      ...pendingTransactions.map(t => ({
        id: t.id,
        type: t.type || 'transaction',
        amount: t.amount || 0,
        status: t.status || 'pending',
        userName: t.robloxUsername || t.userId || 'Unknown User',
        userId: t.userId || '',
        createdAt: t.timestamp || new Date().toISOString()
      }))
    ];
    
    res.json({ transactions: allPending });
  } catch (error) {
    console.error('Error fetching pending transactions:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update transaction status (handles approve, pending, reject from Admin Panel)
router.put('/transactions/:transactionId/status', authenticateAdmin, (req, res) => {
  try {
    const { status, reason } = req.body;
    const transactionId = req.params.transactionId;
    const db = dbManager.getMainDb();

    let transaction = (db.transactions || []).find(t => t.id === transactionId);
    let withdrawal = (db.withdrawals || []).find(w => w.id === transactionId);
    let itemWithdrawal = (db.itemWithdrawals || []).find(w => w.id === transactionId);

    if (!transaction && !withdrawal && !itemWithdrawal) {
      return res.status(404).json({ message: 'Transaction not found' });
    }

    if (transaction) {
      transaction.status = status;
      transaction.updatedAt = new Date().toISOString();
    }
    if (withdrawal) {
      withdrawal.status = status;
      withdrawal.updatedAt = new Date().toISOString();
    }
    if (itemWithdrawal) {
      itemWithdrawal.status = status;
      itemWithdrawal.updatedAt = new Date().toISOString();
    }

    const adminLog = {
      id: uuidv4(),
      adminId: req.user.userId,
      adminUsername: req.user.robloxUsername,
      action: 'transaction_status_update',
      targetId: transactionId,
      newValue: status,
      reason: reason || 'Admin transaction update',
      timestamp: new Date().toISOString()
    };
    db.adminLogs = db.adminLogs || [];
    db.adminLogs.push(adminLog);

    dbManager.saveMainDb();

    res.json({
      message: `Transaction status updated to ${status}`,
      status,
      id: transactionId,
      amount: transaction?.amount || withdrawal?.amount || itemWithdrawal?.totalValue || 0
    });
  } catch (error) {
    console.error('Error updating transaction status:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get all withdrawals
router.get('/withdrawals', authenticateAdmin, (req, res) => {
  try {
    const { status, userId, dateFrom, dateTo } = req.query;
    const db = dbManager.getMainDb();
    
    let fundWithdrawals = [...(db.withdrawals || [])];
    let itemWithdrawals = [...(db.itemWithdrawals || [])];

    if (status) {
      fundWithdrawals = fundWithdrawals.filter(w => w.status === status);
      itemWithdrawals = itemWithdrawals.filter(w => w.status === status);
    }

    if (userId) {
      fundWithdrawals = fundWithdrawals.filter(w => w.userId === userId);
      itemWithdrawals = itemWithdrawals.filter(w => w.userId === userId);
    }

    if (dateFrom) {
      fundWithdrawals = fundWithdrawals.filter(w => new Date(w.timestamp || w.createdAt) >= new Date(dateFrom));
      itemWithdrawals = itemWithdrawals.filter(w => new Date(w.createdAt) >= new Date(dateFrom));
    }

    if (dateTo) {
      fundWithdrawals = fundWithdrawals.filter(w => new Date(w.timestamp || w.createdAt) <= new Date(dateTo));
      itemWithdrawals = itemWithdrawals.filter(w => new Date(w.createdAt) <= new Date(dateTo));
    }

    res.json({
      fundWithdrawals,
      itemWithdrawals
    });
  } catch (error) {
    console.error('Error fetching withdrawals:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update withdrawal status
router.put('/withdrawals/:withdrawalId/status', authenticateAdmin, (req, res) => {
  try {
    const { status, reason } = req.body;
    const withdrawalId = req.params.withdrawalId;
    const db = dbManager.getMainDb();
    
    let withdrawal = (db.withdrawals || []).find(w => w.id === withdrawalId);
    let itemWithdrawal = (db.itemWithdrawals || []).find(w => w.id === withdrawalId);
    
    if (!withdrawal && !itemWithdrawal) {
      return res.status(404).json({ message: 'Withdrawal not found' });
    }

    if (withdrawal) {
      withdrawal.status = status;
      withdrawal.updatedAt = new Date().toISOString();
    }
    if (itemWithdrawal) {
      itemWithdrawal.status = status;
      itemWithdrawal.updatedAt = new Date().toISOString();
    }

    dbManager.saveMainDb();

    res.json({
      message: `Withdrawal status updated to ${status}`,
      status
    });
  } catch (error) {
    console.error('Error updating withdrawal status:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Ensure settings storage is the canonical array shape (dbHelper may load an object)
function ensureSettingsArray(db) {
  if (!Array.isArray(db.settings)) {
    const obj = (db.settings && typeof db.settings === 'object') ? db.settings : {};
    db.settings = Object.entries(obj).map(([key, value]) => ({
      id: uuidv4(), key, value, category: 'taxes',
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
    }));
  }
  return db.settings;
}

function readStringSetting(settings, key) {
  if (Array.isArray(settings)) return settings.find(s => s.key === key)?.value ?? '';
  if (settings && typeof settings === 'object') return settings[key] ?? '';
  return '';
}

// Get tax settings: master switch + single 10-30% rate + recipient
router.get('/taxes', authenticateAdmin, (req, res) => {
  try {
    const { getTaxConfig } = require('../taxUtil');
    const cfg = getTaxConfig();
    const db = dbManager.getMainDb();
    res.json({
      taxEnabled: cfg.enabled,
      taxPercent: cfg.percent,
      taxRecipient: String(readStringSetting(db.settings, 'tax_recipient') || '')
    });
  } catch (error) {
    console.error('Error fetching tax settings:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update tax settings: { taxEnabled: bool, taxPercent: 10-30, taxRecipient: id/username }
router.put('/taxes', authenticateAdmin, (req, res) => {
  try {
    const { taxEnabled, taxPercent, taxRecipient } = req.body;
    const db = dbManager.getMainDb();
    ensureSettingsArray(db);

    const enabled = !!(taxEnabled === true || taxEnabled === 1 ||
      String(taxEnabled).toLowerCase() === 'true' || String(taxEnabled) === '1');
    let pct = parseFloat(taxPercent);
    if (isNaN(pct)) {
      const cur = db.settings.find(s => s.key === 'tax_percentage');
      pct = cur ? parseFloat(cur.value) : 15;
      if (isNaN(pct)) pct = 15;
    }
    pct = Math.min(30, Math.max(10, pct));

    const upsert = (key, value, description) => {
      let setting = db.settings.find(s => s.key === key);
      if (setting) {
        setting.value = value;
        setting.updatedAt = new Date().toISOString();
      } else {
        db.settings.push({
          id: uuidv4(),
          key,
          value,
          description,
          category: 'taxes',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
      }
    };

    upsert('tax_enabled', enabled, 'Master tax switch');
    upsert('tax_percentage', pct, 'House tax percentage (10-30)');
    // Keep legacy per-game keys in sync so nothing reads a stale rate
    upsert('coinflip_fee_percentage', pct / 100, 'Coinflip tax (mirrors master tax)');
    upsert('blackjack_fee_percentage', pct / 100, 'Blackjack tax (mirrors master tax)');

    // Tax recipient: user id or roblox username that receives taxed items.
    let recipientSetting = db.settings.find(s => s.key === 'tax_recipient');
    const recipientValue = (taxRecipient === undefined || taxRecipient === null)
      ? (recipientSetting ? recipientSetting.value : '')
      : String(taxRecipient).trim();
    if (recipientSetting) {
      recipientSetting.value = recipientValue;
      recipientSetting.updatedAt = new Date().toISOString();
    } else {
      db.settings.push({
        id: uuidv4(),
        key: 'tax_recipient',
        value: recipientValue,
        description: 'User (id or roblox username) that receives taxed items',
        category: 'taxes',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
    }

    dbManager.saveMainDb();

    res.json({ taxEnabled: enabled, taxPercent: pct, taxRecipient: recipientValue });
  } catch (error) {
    console.error('Error updating tax settings:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get tax recipients
router.get('/tax-recipients', authenticateAdmin, (req, res) => {
  try {
    const db = dbManager.getMainDb();
    res.json(db.taxRecipients || []);
  } catch (error) {
    console.error('Error fetching tax recipients:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get admin logs
router.get('/logs', authenticateAdmin, (req, res) => {
  try {
    const db = dbManager.getMainDb();
    const logs = [...(db.adminLogs || [])].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    res.json(logs);
  } catch (error) {
    console.error('Error fetching admin logs:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

function normBool(v, fallback) {
  if (v === undefined || v === null || v === '') return fallback;
  if (v === true || v === 1) return true;
  if (v === false || v === 0) return false;
  const s = String(v).toLowerCase();
  if (s === 'true' || s === '1') return true;
  if (s === 'false' || s === '0') return false;
  return fallback;
}

// Get admin settings
router.get('/settings', authenticateAdmin, (req, res) => {
  try {
    const db = dbManager.getMainDb();
    ensureSettingsArray(db);
    const botUser = db.settings.find(s => s.key === 'bot_user')?.value || '';
    const redirectLink = db.settings.find(s => s.key === 'redirect_link')?.value || '';
    const botEnabledRaw = db.settings.find(s => s.key === 'bot_enabled')?.value;
    const botEnabled = normBool(botEnabledRaw, true);
    
    res.json({ settings: { botUser, redirectLink, botEnabled } });
  } catch (error) {
    console.error('Error fetching settings:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update admin settings
router.put('/settings', authenticateAdmin, (req, res) => {
  try {
    const { botUser, redirectLink, botEnabled } = req.body;
    const db = dbManager.getMainDb();
    ensureSettingsArray(db);
    
    let botUserSetting = db.settings.find(s => s.key === 'bot_user');
    if (botUserSetting) {
      botUserSetting.value = botUser;
      botUserSetting.updatedAt = new Date().toISOString();
    } else {
      db.settings.push({
        id: uuidv4(),
        key: 'bot_user',
        value: botUser,
        description: 'Bot user identifier for transactions',
        category: 'bot',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
    }
    
    let redirectLinkSetting = db.settings.find(s => s.key === 'redirect_link');
    if (redirectLinkSetting) {
      redirectLinkSetting.value = redirectLink;
      redirectLinkSetting.updatedAt = new Date().toISOString();
    } else {
      db.settings.push({
        id: uuidv4(),
        key: 'redirect_link',
        value: redirectLink,
        description: 'Redirect link for bot transactions',
        category: 'bot',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
    }

    const enabled = normBool(botEnabled, true);
    let botEnabledSetting = db.settings.find(s => s.key === 'bot_enabled');
    if (botEnabledSetting) {
      botEnabledSetting.value = enabled;
      botEnabledSetting.updatedAt = new Date().toISOString();
    } else {
      db.settings.push({
        id: uuidv4(),
        key: 'bot_enabled',
        value: enabled,
        description: 'Master switch for the trade bot',
        category: 'bot',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
    }
    
    dbManager.saveMainDb();
    res.json({ settings: { botUser, redirectLink, botEnabled: enabled } });
  } catch (error) {
    console.error('Error updating settings:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;