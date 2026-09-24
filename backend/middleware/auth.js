const jwt = require('jsonwebtoken');
const dbManager = require('../db/dbHelper');
const { jwtSecret } = require('../jwtSecret');

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ message: 'Access denied. No token provided.' });
  }

  try {
    const decoded = jwt.verify(token, jwtSecret());
    const usersDb = dbManager.getUsersDb();
    
    // Find user in database
    const user = usersDb.users.find(u => u.id === decoded.userId || u.robloxUsername === decoded.robloxUsername);
    if (!user || !user.isActive || user.isFrozen || user.isBanned) {
      return res.status(403).json({ message: 'Access denied. Invalid, inactive, or banned user.' });
    }

    req.user = {
      userId: user.id,
      robloxUsername: user.robloxUsername,
      displayName: user.displayName,
      isAdmin: !!user.isAdmin
    };

    next();
  } catch (error) {
    console.error('Authentication error:', error);
    return res.status(403).json({ message: 'Access denied. Invalid token.' });
  }
};

const authenticateAdmin = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ message: 'Access denied. No token provided.' });
  }

  try {
    const decoded = jwt.verify(token, jwtSecret());
    const usersDb = dbManager.getUsersDb();
    
    // Find user in database
    const user = usersDb.users.find(u => u.robloxUsername === decoded.robloxUsername || u.id === decoded.userId);
    if (!user || !user.isActive || user.isFrozen || user.isBanned || !user.isAdmin) {
      return res.status(403).json({ message: 'Access denied. Admin access required.' });
    }

    req.user = {
      userId: user.id,
      robloxUsername: user.robloxUsername,
      displayName: user.displayName,
      isAdmin: true
    };

    next();
  } catch (error) {
    console.error('Admin authentication error:', error);
    return res.status(403).json({ message: 'Access denied. Invalid token.' });
  }
};

module.exports = { authenticateToken, authenticateAdmin };