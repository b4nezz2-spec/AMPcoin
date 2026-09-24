// Single source of truth for the JWT signing secret.
// In production JWT_SECRET is REQUIRED (no silent fallback — a hardcoded
// fallback would let anyone forge admin tokens).
const crypto = require('crypto');

let cached = null;

function jwtSecret() {
  if (cached) return cached;
  const fromEnv = process.env.JWT_SECRET;
  if (fromEnv && fromEnv.length >= 16) {
    cached = fromEnv;
    return cached;
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error('FATAL: JWT_SECRET env var is required in production');
  }
  // Development only: random per-boot secret (tokens don't survive restarts)
  cached = 'dev-only-' + crypto.randomBytes(24).toString('hex');
  console.warn('[auth] JWT_SECRET not set — using ephemeral dev secret');
  return cached;
}

module.exports = { jwtSecret };
