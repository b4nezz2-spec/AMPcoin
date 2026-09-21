/**
 * One-time migration: reads existing JSON database files and
 * writes them into PostgreSQL. Run this once after setting up
 * DATABASE_URL on Railway.
 *
 * Usage: DATABASE_URL="postgres://..." node backend/migrateToPostgres.js
 */
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const DB_DIR = path.join(__dirname, 'db');

async function migrate() {
  if (!process.env.DATABASE_URL) {
    console.error('Set DATABASE_URL first');
    process.exit(1);
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  const client = await pool.connect();
  try {
    // Create table
    await client.query(`
      CREATE TABLE IF NOT EXISTS store (
        key TEXT PRIMARY KEY,
        data JSONB NOT NULL DEFAULT '{}',
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    function loadJSON(filename, fallback) {
      const p = path.join(DB_DIR, filename);
      if (!fs.existsSync(p)) return fallback;
      try {
        return JSON.parse(fs.readFileSync(p, 'utf8'));
      } catch {
        return fallback;
      }
    }

    // Users
    const users = loadJSON('users.json', { users: [] });
    await client.query(
      `INSERT INTO store (key, data) VALUES ('users', $1)
       ON CONFLICT (key) DO UPDATE SET data = $1, updated_at = NOW()`,
      [JSON.stringify(users)]
    );
    console.log(`Migrated ${users.users.length} users`);

    // Items
    const items = loadJSON('items.json', { items: [] });
    await client.query(
      `INSERT INTO store (key, data) VALUES ('items', $1)
       ON CONFLICT (key) DO UPDATE SET data = $1, updated_at = NOW()`,
      [JSON.stringify(items)]
    );
    console.log(`Migrated ${items.items.length} items`);

    // Main DB
    const defaultMain = {
      coinflips: [], inventories: [], transactions: [], deposits: [],
      withdrawals: [], itemWithdrawals: [], pendingTransactions: [],
      blackjackGames: [], chatMessages: [], giveaways: [],
      notifications: [], adminLogs: [], settings: []
    };
    const mainDb = loadJSON('db.json', defaultMain);
    await client.query(
      `INSERT INTO store (key, data) VALUES ('main', $1)
       ON CONFLICT (key) DO UPDATE SET data = $1, updated_at = NOW()`,
      [JSON.stringify(mainDb)]
    );
    console.log(`Migrated main DB (${Object.keys(mainDb).length} collections)`);

    // Settings
    const settings = loadJSON('settings.json', {});
    await client.query(
      `INSERT INTO store (key, data) VALUES ('settings', $1)
       ON CONFLICT (key) DO UPDATE SET data = $1, updated_at = NOW()`,
      [JSON.stringify(settings)]
    );
    console.log('Migrated settings');

    console.log('\n✅ Migration complete! Your data is now in PostgreSQL.');
    console.log('Deploy to Railway with DATABASE_URL and it will work.');
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
