const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: process.env.CLIENT_URL || "http://localhost:3000",
    methods: ["GET", "POST"]
  }
});

// Initialize database files if they don't exist
const dbDir = path.join(__dirname, 'backend', 'db');

// Create db directory if it doesn't exist
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

// Initialize users.json if it doesn't exist
const usersDbPath = path.join(dbDir, 'users.json');
if (!fs.existsSync(usersDbPath)) {
  const defaultUsers = {
    users: []
  };
  fs.writeFileSync(usersDbPath, JSON.stringify(defaultUsers, null, 2));
}

// Initialize items.json if it doesn't exist
const itemsDbPath = path.join(dbDir, 'items.json');
if (!fs.existsSync(itemsDbPath)) {
  const defaultItems = {
    items: []
  };
  fs.writeFileSync(itemsDbPath, JSON.stringify(defaultItems, null, 2));
}

// Initialize main db.json if it doesn't exist
const mainDbPath = path.join(dbDir, 'db.json');
if (!fs.existsSync(mainDbPath)) {
  const defaultDb = {
    transactions: [],
    coinflips: [],
    blackjackGames: [],
    withdrawals: [],
    deposits: [],
    inventories: [],
    chatMessages: [],
    adminLogs: [],
    itemWithdrawals: [],
    taxRecipients: [],
    settings: []
  };
  fs.writeFileSync(mainDbPath, JSON.stringify(defaultDb, null, 2));
}

// Remove the separate inventories.json file as it conflicts with the main db.json approach
const legacyInventoriesPath = path.join(dbDir, 'inventories.json');
if (fs.existsSync(legacyInventoriesPath)) {
  console.log('Removing legacy inventories.json file...');
  fs.unlinkSync(legacyInventoriesPath);
}

// Security middleware
app.use(helmet());
app.use(cors());

// Rate limiting - general (socket.io transport polling is exempt: it is
// long-lived realtime traffic, not API abuse, and shares the user's IP)
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000,
  skip: (req) => req.path.startsWith('/socket.io')
});

// More lenient rate limiting for API routes (since admins may make many requests)
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 2000,
  skip: (req) => req.path.startsWith('/socket.io')
});

app.use('/api/', apiLimiter); // Apply more lenient rate limit to API routes
app.use(generalLimiter); // Apply general rate limit to other routes

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Serve static files from the frontend build directory
// Only in production mode
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, 'frontend/build')));
} else {
  // In development, allow API routes to work without serving static files
  console.log('Development mode: Not serving static files from build directory');
}

// Import routes
const authRoutes = require('./backend/routes/auth');
const userRoutes = require('./backend/routes/users');
const itemRoutes = require('./backend/routes/items');
const coinflipRoutes = require('./backend/routes/coinflip');
const blackjackRoutes = require('./backend/routes/blackjack');
const walletRoutes = require('./backend/routes/wallet');
const chatRoutes = require('./backend/routes/chat');
const adminRoutes = require('./backend/routes/admin');
const statsRoutes = require('./backend/routes/stats');

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/items', itemRoutes);
app.use('/api/coinflip', coinflipRoutes);
app.use('/api/blackjack', blackjackRoutes);
app.use('/api/wallet', walletRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/stats', statsRoutes);

// Serve frontend for all other routes
// Only in production mode
if (process.env.NODE_ENV === 'production') {
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'frontend/build', 'index.html'));
  });
} else {
  // In development, return 404 for non-API routes
  app.get('*', (req, res) => {
    res.status(404).json({ message: 'Route not found in development mode' });
  });
}

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);

  // Handle chat messages
  socket.on('chatMessage', (data) => {
    io.emit('chatMessage', data);
  });

  // Handle coinflip updates
  socket.on('newCoinflip', (data) => {
    io.emit('newCoinflip', data);
  });

  // Handle coinflip join
  socket.on('joinCoinflip', (data) => {
    io.emit('coinflipJoined', data);
  });

  // Handle coinflip result
  socket.on('coinflipResult', (data) => {
    io.emit('coinflipResult', data);
  });

  // Handle blackjack game updates
  socket.on('blackjackUpdate', (data) => {
    io.emit('blackjackUpdate', data);
  });

  // Handle balance updates
  socket.on('balanceUpdate', (data) => {
    io.emit('balanceUpdate', data);
  });

  socket.on('disconnect', () => {
    console.log('A user disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// Initialize the database on startup
try {
  require('./backend/initDb');
  console.log('Database initialized successfully');
} catch (error) {
  console.error('Error initializing database:', error);
}