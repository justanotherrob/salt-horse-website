const { Pool } = require('pg');

// Use Railway's DATABASE_URL (includes host, port, user, password, dbname)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

// ── Helper methods to keep calling code concise ─────────
// db.query(sql, params) — run a query, return { rows }
// db.get(sql, params)   — return first row or null
// db.all(sql, params)   — return all rows as array
// db.run(sql, params)   — run INSERT/UPDATE/DELETE, return result

const db = {
  query: (sql, params = []) => pool.query(sql, params),
  get: async (sql, params = []) => {
    const { rows } = await pool.query(sql, params);
    return rows[0] || null;
  },
  all: async (sql, params = []) => {
    const { rows } = await pool.query(sql, params);
    return rows;
  },
  run: async (sql, params = []) => {
    const result = await pool.query(sql, params);
    return result;
  },
  pool,
};

// ── Create Tables ─────────────────────────────────────────
async function initDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      name TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS content_blocks (
      id SERIAL PRIMARY KEY,
      key TEXT UNIQUE NOT NULL,
      value TEXT NOT NULL DEFAULT '',
      type TEXT NOT NULL DEFAULT 'text',
      label TEXT,
      section TEXT,
      sort_order INTEGER DEFAULT 0,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS opening_hours (
      id SERIAL PRIMARY KEY,
      day TEXT UNIQUE NOT NULL,
      day_order INTEGER NOT NULL,
      bar_open TEXT,
      bar_close TEXT,
      kitchen_open TEXT,
      kitchen_close TEXT,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS gift_cards (
      id SERIAL PRIMARY KEY,
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
      personal_message TEXT,
      stripe_session_id TEXT,
      stripe_payment_intent TEXT,
      purchased_at TIMESTAMPTZ,
      expires_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS gift_card_transactions (
      id SERIAL PRIMARY KEY,
      gift_card_id INTEGER NOT NULL REFERENCES gift_cards(id),
      amount INTEGER NOT NULL,
      type TEXT NOT NULL,
      redeemed_by_user_id INTEGER REFERENCES users(id),
      note TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS redirects (
      id SERIAL PRIMARY KEY,
      from_path TEXT UNIQUE NOT NULL,
      to_url TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS site_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL DEFAULT '',
      label TEXT,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  // Create indexes
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_gift_cards_code ON gift_cards(code);
    CREATE INDEX IF NOT EXISTS idx_gift_cards_status ON gift_cards(status);
    CREATE INDEX IF NOT EXISTS idx_gift_cards_stripe ON gift_cards(stripe_session_id);
    CREATE INDEX IF NOT EXISTS idx_content_key ON content_blocks(key);
    CREATE INDEX IF NOT EXISTS idx_redirects_path ON redirects(from_path);
  `);

  // ── Seed language settings ──────────────────────────────
  const languages = [
    { code: 'fr', label: 'French' },
    { code: 'de', label: 'German' },
    { code: 'es', label: 'Spanish' },
    { code: 'it', label: 'Italian' },
    { code: 'nl', label: 'Dutch' },
    { code: 'pl', label: 'Polish' },
    { code: 'zh', label: 'Chinese' },
  ];

  for (const lang of languages) {
    await pool.query(
      `INSERT INTO site_settings (key, value, label) VALUES ($1, $2, $3) ON CONFLICT (key) DO NOTHING`,
      [`lang_${lang.code}_enabled`, 'true', `${lang.label} (${lang.code})`]
    );
  }

  console.log('Database initialized');
}

module.exports = db;
module.exports.initDatabase = initDatabase;
