const express = require('express');
const multer = require('multer');
const { parse } = require('csv-parse/sync');
const db = require('../db/database');
const { requireAuth } = require('../middleware/auth');
const { refreshRedirects } = require('../middleware/redirects');
const router = express.Router();

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

// All API routes require auth
router.use(requireAuth);

// ── Content ──────────────────────────────────────────────

// POST /api/content/:key
router.post('/content/:key', (req, res) => {
  const { key } = req.params;
  const { value } = req.body;

  const block = db.prepare('SELECT id FROM content_blocks WHERE key = ?').get(key);
  if (!block) return res.status(404).json({ error: 'Content block not found' });

  db.prepare('UPDATE content_blocks SET value = ?, updated_at = CURRENT_TIMESTAMP WHERE key = ?').run(value, key);
  res.json({ success: true, key, value });
});

// ── Opening Hours ────────────────────────────────────────

// POST /api/hours/:day
router.post('/hours/:day', (req, res) => {
  const { day } = req.params;
  const { bar_open, bar_close, kitchen_open, kitchen_close } = req.body;

  const row = db.prepare('SELECT id FROM opening_hours WHERE day = ?').get(day);
  if (!row) return res.status(404).json({ error: 'Day not found' });

  db.prepare(`
    UPDATE opening_hours SET bar_open = ?, bar_close = ?, kitchen_open = ?, kitchen_close = ?, updated_at = CURRENT_TIMESTAMP
    WHERE day = ?
  `).run(bar_open, bar_close, kitchen_open, kitchen_close, day);

  res.json({ success: true });
});

// ── Gift Card Redemption ─────────────────────────────────

// POST /api/gift-cards/:code/redeem
router.post('/gift-cards/:code/redeem', (req, res) => {
  const { code } = req.params;
  const { amount } = req.body; // amount in pence

  const card = db.prepare('SELECT * FROM gift_cards WHERE code = ?').get(code);
  if (!card) return res.status(404).json({ error: 'Gift card not found' });
  if (card.status !== 'active') return res.status(400).json({ error: `Gift card is ${card.status}` });

  // Check expiry
  if (card.expires_at && new Date(card.expires_at) < new Date()) {
    db.prepare("UPDATE gift_cards SET status = 'expired' WHERE id = ?").run(card.id);
    return res.status(400).json({ error: 'Gift card has expired' });
  }

  const redeemAmount = parseInt(amount);
  if (isNaN(redeemAmount) || redeemAmount <= 0) return res.status(400).json({ error: 'Invalid amount' });
  if (redeemAmount > card.balance) return res.status(400).json({ error: `Amount exceeds balance of £${(card.balance / 100).toFixed(2)}` });

  const newBalance = card.balance - redeemAmount;
  const newStatus = newBalance === 0 ? 'redeemed' : 'active';

  const updateCard = db.prepare('UPDATE gift_cards SET balance = ?, status = ? WHERE id = ?');
  const insertTx = db.prepare('INSERT INTO gift_card_transactions (gift_card_id, amount, type, redeemed_by_user_id) VALUES (?, ?, ?, ?)');

  const redeem = db.transaction(() => {
    updateCard.run(newBalance, newStatus, card.id);
    insertTx.run(card.id, redeemAmount, 'redemption', req.session.userId);
  });

  redeem();

  res.json({
    success: true,
    newBalance,
    newStatus,
    redeemed: redeemAmount,
    balanceFormatted: `£${(newBalance / 100).toFixed(2)}`
  });
});

// ── CSV Import ───────────────────────────────────────────

// POST /api/gift-cards/import
router.post('/gift-cards/import', upload.single('csv'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  try {
    const content = req.file.buffer.toString('utf-8');
    const records = parse(content, { columns: true, skip_empty_lines: true, trim: true });

    let imported = 0;
    let skipped = 0;
    const errors = [];

    const insertCard = db.prepare(`
      INSERT INTO gift_cards (code, initial_amount, balance, currency, status, purchaser_email, recipient_email, purchased_at, expires_at)
      VALUES (?, ?, ?, 'GBP', ?, ?, ?, ?, ?)
    `);
    const insertTx = db.prepare(`
      INSERT INTO gift_card_transactions (gift_card_id, amount, type, note)
      VALUES (?, ?, 'import', ?)
    `);

    const importAll = db.transaction(() => {
      for (let i = 0; i < records.length; i++) {
        const row = records[i];
        try {
          const code = (row['GIFT CODE'] || '').trim();
          if (!code) { skipped++; continue; }

          // Check if code already exists
          const existing = db.prepare('SELECT id FROM gift_cards WHERE code = ?').get(code);
          if (existing) { skipped++; errors.push(`Row ${i + 2}: Code ${code} already exists`); continue; }

          // Parse amounts — format: "50.00 GBP"
          const initialStr = (row['INITIAL VALUE'] || '0').replace(/[^0-9.]/g, '');
          const remainingStr = (row['REMAINING VALUE'] || '0').replace(/[^0-9.]/g, '');
          const initialAmount = Math.round(parseFloat(initialStr) * 100);
          const balance = Math.round(parseFloat(remainingStr) * 100);

          // Map status
          const usage = (row['USAGE'] || '').toUpperCase();
          const status = usage === 'DEPLETED' ? 'redeemed' : 'active';

          // Dates
          const purchasedAt = row['PURCHASE DATE'] || new Date().toISOString();
          const purchaseDate = new Date(purchasedAt);
          const expiresAt = new Date(purchaseDate.getTime() + 365 * 24 * 60 * 60 * 1000).toISOString();

          const result = insertCard.run(
            code, initialAmount, balance, status,
            (row['PURCHASER EMAIL'] || '').trim(),
            (row['RECIPIENT EMAIL'] || '').trim(),
            purchasedAt, expiresAt
          );

          insertTx.run(result.lastInsertRowid, initialAmount, `Imported from CSV row ${i + 2}`);
          imported++;
        } catch (err) {
          skipped++;
          errors.push(`Row ${i + 2}: ${err.message}`);
        }
      }
    });

    importAll();

    res.json({ success: true, imported, skipped, total: records.length, errors: errors.slice(0, 20) });
  } catch (err) {
    res.status(400).json({ error: `Failed to parse CSV: ${err.message}` });
  }
});

// ── Redirects ────────────────────────────────────────────

// POST /api/redirects
router.post('/redirects', (req, res) => {
  let { from_path, to_url } = req.body;

  if (!from_path || !to_url) return res.status(400).json({ error: 'Both fields required' });

  // Ensure from_path starts with /
  if (!from_path.startsWith('/')) from_path = '/' + from_path;

  try {
    db.prepare('INSERT INTO redirects (from_path, to_url) VALUES (?, ?)').run(from_path, to_url);
    refreshRedirects();
    res.json({ success: true });
  } catch (err) {
    if (err.message.includes('UNIQUE')) {
      return res.status(400).json({ error: 'Redirect for this path already exists' });
    }
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/redirects/:id
router.put('/redirects/:id', (req, res) => {
  const { id } = req.params;
  let { from_path, to_url } = req.body;

  if (!from_path.startsWith('/')) from_path = '/' + from_path;

  db.prepare('UPDATE redirects SET from_path = ?, to_url = ? WHERE id = ?').run(from_path, to_url, id);
  refreshRedirects();
  res.json({ success: true });
});

// DELETE /api/redirects/:id
router.delete('/redirects/:id', (req, res) => {
  db.prepare('DELETE FROM redirects WHERE id = ?').run(req.params.id);
  refreshRedirects();
  res.json({ success: true });
});

module.exports = router;
