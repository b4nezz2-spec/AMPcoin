const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { authenticateToken, authenticateAdmin } = require('../middleware/auth');
const dbManager = require('../db/dbHelper');

// Get all items
router.get('/', (req, res) => {
  try {
    const { rarity, search } = req.query;
    const itemsDb = dbManager.getItemsDb();
    let filteredItems = (itemsDb.items || []).filter(item => item.isEnabled !== false);

    if (rarity) {
      filteredItems = filteredItems.filter(item => item.rarity && item.rarity.toLowerCase() === rarity.toLowerCase());
    }

    if (search) {
      const term = search.toLowerCase();
      filteredItems = filteredItems.filter(item => 
        (item.name && item.name.toLowerCase().includes(term)) ||
        (item.description && item.description.toLowerCase().includes(term))
      );
    }

    res.json(filteredItems);
  } catch (error) {
    console.error('Error fetching items:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get item by ID
router.get('/:id', (req, res) => {
  try {
    const itemsDb = dbManager.getItemsDb();
    const item = (itemsDb.items || []).find(i => (i.id === req.params.id || i.itemId === req.params.id) && i.isEnabled !== false);
    if (!item) {
      return res.status(404).json({ message: 'Item not found' });
    }
    res.json(item);
  } catch (error) {
    console.error('Error fetching item:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Admin: Add new item
router.post('/', authenticateAdmin, (req, res) => {
  try {
    const { name, description, imageUrl, rarity, value, tradable } = req.body;
    const id = uuidv4();

    const newItem = {
      id,
      itemId: id,
      name: name || 'Unnamed Item',
      itemName: name || 'Unnamed Item',
      description: description || '',
      imageUrl: imageUrl || '',
      image: imageUrl || '',
      rarity: rarity || 'common',
      value: parseFloat(value) || 0,
      tradable: tradable !== undefined ? tradable : true,
      isEnabled: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const itemsDb = dbManager.getItemsDb();
    itemsDb.items.push(newItem);
    dbManager.saveItemsDb();

    res.status(201).json({ item: newItem, pet: newItem });
  } catch (error) {
    console.error('Error adding item:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Admin: Update item
router.put('/:id', authenticateAdmin, (req, res) => {
  try {
    const itemId = req.params.id;
    const itemsDb = dbManager.getItemsDb();
    const itemIndex = (itemsDb.items || []).findIndex(i => i.id === itemId || i.itemId === itemId);

    if (itemIndex === -1) {
      return res.status(404).json({ message: 'Item not found' });
    }

    const updates = req.body;
    Object.keys(updates).forEach(key => {
      if (key !== 'id' && key !== 'itemId' && key !== 'createdAt') {
        itemsDb.items[itemIndex][key] = updates[key];
      }
    });

    itemsDb.items[itemIndex].updatedAt = new Date().toISOString();
    dbManager.saveItemsDb();

    res.json(itemsDb.items[itemIndex]);
  } catch (error) {
    console.error('Error updating item:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Admin: Delete item
router.delete('/:id', authenticateAdmin, (req, res) => {
  try {
    const itemId = req.params.id;
    const itemsDb = dbManager.getItemsDb();
    const itemIndex = (itemsDb.items || []).findIndex(i => i.id === itemId || i.itemId === itemId);

    if (itemIndex === -1) {
      return res.status(404).json({ message: 'Item not found' });
    }

    itemsDb.items.splice(itemIndex, 1);
    dbManager.saveItemsDb();

    res.json({ message: 'Item deleted successfully' });
  } catch (error) {
    console.error('Error deleting item:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get user inventory
router.get('/user/:identifier/inventory', authenticateToken, (req, res) => {
  try {
    const usersDb = dbManager.getUsersDb();
    const user = usersDb.users.find(u => u.id === req.params.identifier || u.robloxUsername === req.params.identifier);
    const userId = user ? user.id : req.user.userId;
    const inventory = dbManager.getUserInventory(userId);
    res.json(inventory);
  } catch (error) {
    console.error('Error fetching user inventory:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;