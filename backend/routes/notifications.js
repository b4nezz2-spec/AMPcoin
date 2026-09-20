const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const dbManager = require('../db/dbHelper');

// My notifications (latest 50)
router.get('/', authenticateToken, (req, res) => {
  try {
    const db = dbManager.getMainDb();
    const mine = (db.notifications || [])
      .filter((n) => String(n.userId) === String(req.user.userId))
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 50);
    res.json({ notifications: mine, unread: mine.filter((n) => !n.read).length });
  } catch (error) {
    console.error('Error fetching notifications:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Mark all my notifications as read
router.post('/read', authenticateToken, (req, res) => {
  try {
    const db = dbManager.getMainDb();
    let changed = false;
    (db.notifications || []).forEach((n) => {
      if (String(n.userId) === String(req.user.userId) && !n.read) {
        n.read = true;
        changed = true;
      }
    });
    if (changed) dbManager.saveMainDb();
    res.json({ message: 'All notifications marked as read' });
  } catch (error) {
    console.error('Error marking notifications read:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
