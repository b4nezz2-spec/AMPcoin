// Tiny realtime hub: maps userIds -> open sockets so routes can push
// events (notifications, giveaway updates) to a specific user.
let io = null;
const userSockets = new Map(); // userId(string) -> Set<socketId>

function setIo(ioInstance) {
  io = ioInstance;
}

function registerUser(userId, socketId) {
  if (!userId || !socketId) return;
  const key = String(userId);
  if (!userSockets.has(key)) userSockets.set(key, new Set());
  userSockets.get(key).add(socketId);
}

function unregisterSocket(socketId) {
  if (!socketId) return;
  for (const set of userSockets.values()) set.delete(socketId);
}

function emitToUser(userId, event, payload) {
  if (!io || !userId) return;
  const sockets = userSockets.get(String(userId));
  if (!sockets || sockets.size === 0) return;
  for (const sid of sockets) {
    io.to(sid).emit(event, payload);
  }
}

function emitToAll(event, payload) {
  if (!io) return;
  io.emit(event, payload);
}

module.exports = { setIo, registerUser, unregisterSocket, emitToUser, emitToAll };
