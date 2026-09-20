const { v4: uuidv4 } = require('uuid');
const dbManager = require('./db/dbHelper');
const { emitToUser } = require('./realtime');

const MAX_PER_USER = 50;

// Create + persist a notification for a user and push it live over socket.
function addNotification({ userId, type, title, message, imageUrl }) {
  if (!userId) return null;
  try {
    const db = dbManager.getMainDb();
    db.notifications = db.notifications || [];
    const notification = {
      id: uuidv4(),
      userId: String(userId),
      type: type || 'info',
      title: title || '',
      message: message || '',
      imageUrl: imageUrl || '',
      read: false,
      createdAt: new Date().toISOString()
    };
    db.notifications.push(notification);

    // Cap stored notifications per user
    const mine = db.notifications.filter((n) => String(n.userId) === String(userId));
    if (mine.length > MAX_PER_USER) {
      const removeIds = new Set(mine.slice(0, mine.length - MAX_PER_USER).map((n) => n.id));
      db.notifications = db.notifications.filter((n) => !removeIds.has(n.id));
    }

    dbManager.saveMainDb();
    emitToUser(userId, 'notification', notification);
    return notification;
  } catch (error) {
    console.error('Error creating notification:', error.message);
    return null;
  }
}

module.exports = { addNotification };
