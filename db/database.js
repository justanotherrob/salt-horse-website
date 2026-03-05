const Database = require('better-sqlite3');
const path = require('path');

const dbPath = process.env.DATABASE_PATH || path.join(__dirname, 'salthorse.db');
const db = new Database(dbPath);

// Enable WAL mode for better concurrent read performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ── Create Tables ─────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    name TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS content_blocks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key TEXT UNIQUE NOT NULL,
    value TEXT NOT NULL DEFAULT '',
    type TEXT NOT NULL DEFAULT 'text',
    label TEXT,
    section TEXT,
    sort_order INTEGER DEFAULT 0,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS opening_hours (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    day TEXT UNIQUE NOT NULL,
    day_order INTEGER NOT NULL,
    bar_open TEXT,
    bar_close TEXT,
    kitchen_open TEXT,
    kitchen_close TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS gift_cards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT UNIQUE NOT NULL,
    initial_amount INTEGER NOT NULL,
    balance INTEGER NOT NULL,
    currency TEXT NOT NULL DEFAULT 'GBP',
    status TEXT NOT NULL DEFAULT 'pending',
    purchaser_email TEXT,
    purchaser_name TEXT,
    recipient_email TEXT,
    recipient_name TEXT,
    send_to TEXT DEFAULT 'self',
    stripe_session_id TEXT,
    stripe_payment_intent TEXT,
    purchased_at DATETIME,
    expires_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS gift_card_transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    gift_card_id INTEGER NOT NULL,
    amount INTEGER NOT NULL,
    type TEXT NOT NULL,
    redeemed_by_user_id INTEGER,
    note TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (gift_card_id) REFERENCES gift_cards(id),
    FOREIGN KEY (redeemed_by_user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS redirects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    from_path TEXT UNIQUE NOT NULL,
    to_url TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_gift_cards_code ON gift_cards(code);
  CREATE INDEX IF NOT EXISTS idx_gift_cards_status ON gift_cards(status);
  CREATE INDEX IF NOT EXISTS idx_gift_cards_stripe ON gift_cards(stripe_session_id);
  CREATE INDEX IF NOT EXISTS idx_content_key ON content_blocks(key);
  CREATE INDEX IF NOT EXISTS idx_redirects_path ON redirects(from_path);
`);

module.exports = db;
