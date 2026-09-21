const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const dbManager = require('./backend/db/dbHelper');

const app = express();
const server = http.createServer(app);

const allowedOrigins = [
  process.env.CLIENT_URL,
  'https://ampcoin.co.uk',
  'https://ampcoin.pages.dev',
  'http://localhost:3000',
  'https://ampcoin.b-cdn.net',
  'https://ampcoin.co.uk.b-cdn.net',
  'https://ampcoin-50q9kxt9.b4a.run'
].filter(Boolean);

const io = socketIo(server, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"],
    credentials: true
  }
});

// Security middleware
app.use(helmet({
  crossOriginResourcePolicy: false,
  crossOriginEmbedderPolicy: false
}));
app.use(cors());

// Rate limiting
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  skip: (req) => req.path.startsWith('/socket.io')
});
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 2000,
  skip: (req) => req.path.startsWith('/socket.io')
});

app.use('/api/', apiLimiter);
app.use(generalLimiter);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Import routes
const authRoutes = require('./backend/routes/auth');
const userRoutes = require('./backend/routes/users');
const itemRoutes = require('./backend/routes/items');
const coinflipRoutes = require('./backend/routes/coinflip');
const blackjackRoutes = require('./backend/routes/blackjack');
const walletRoutes = require('./backend/routes/wallet');
const chatRoutes = require('./backend/routes/chat');
const giveawayRoutes = require('./backend/routes/giveaways');
const notificationRoutes = require('./backend/routes/notifications');
const realtime = require('./backend/realtime');
const adminRoutes = require('./backend/routes/admin');
const statsRoutes = require('./backend/routes/stats');

realtime.setIo(io);

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/items', itemRoutes);
app.use('/api/coinflip', coinflipRoutes);
app.use('/api/blackjack', blackjackRoutes);
app.use('/api/wallet', walletRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/giveaways', giveawayRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/stats', statsRoutes);

// Serve frontend for all other routes — AFTER API routes
const frontendBuild = path.join(__dirname, 'frontend', 'build');
const indexHtml = path.join(frontendBuild, 'index.html');
if (process.env.NODE_ENV === 'production' && fs.existsSync(indexHtml)) {
  app.use(express.static(frontendBuild));
  app.get('*', (req, res) => {
    res.sendFile(indexHtml);
  });
} else {
  app.get('*', (req, res) => {
    res.status(404).json({ message: 'Route not found' });
  });
}

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);

  socket.on('joinChat', (data) => {
    realtime.registerUser(data && data.userId, socket.id);
  });

  socket.on('disconnect', () => {
    realtime.unregisterSocket(socket.id);
    console.log('A user disconnected:', socket.id);
  });

  socket.on('typingStart', (data) => {
    socket.broadcast.emit('typingStart', data);
  });
  socket.on('typingStop', (data) => {
    socket.broadcast.emit('typingStop', data);
  });
});

const PORT = process.env.PORT || 5000;

// Initialize PostgreSQL then start server
async function start() {
  try {
    await dbManager.init();
    console.log('PostgreSQL connected and data loaded');
  } catch (err) {
    console.error('FATAL: Could not connect to PostgreSQL:', err.message);
    console.error('Set DATABASE_URL environment variable to your Railway PostgreSQL connection string');
    process.exit(1);
  }

  server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

start();
