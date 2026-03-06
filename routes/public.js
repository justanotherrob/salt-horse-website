const express = require('express');
const db = require('../db/database');
const router = express.Router();

// Helper: check if a site setting is enabled
function getSetting(key) {
  const row = db.prepare('SELECT value FROM site_settings WHERE key = ?').get(key);
  return row ? row.value === 'true' : false;
}

// Helper: get all content as key-value object
function getContent() {
  const rows = db.prepare('SELECT key, value, type FROM content_blocks').all();
  const content = {};
  for (const row of rows) {
    content[row.key] = row.value;
  }
  return content;
}

// Helper: get opening hours as array sorted by day_order
function getHours() {
  return db.prepare('SELECT * FROM opening_hours ORDER BY day_order').all();
}

// Helper: format 24h time to display format
function formatTime(time24) {
  if (!time24) return '';
  const [h, m] = time24.split(':').map(Number);
  if (h === 0 && m === 0) return '12am';
  if (h === 12 && m === 0) return '12pm';
  const period = h >= 12 ? 'pm' : 'am';
  const hour12 = h > 12 ? h - 12 : (h === 0 ? 12 : h);
  return m === 0 ? `${hour12}${period}` : `${hour12}:${m.toString().padStart(2, '0')}${period}`;
}

// GET / — Main site
router.get('/', (req, res) => {
  const content = getContent();
  const hours = getHours();
  const giftCardsEnabled = getSetting('gift_cards_enabled');
  res.render('index', { content, hours, formatTime, stripeKey: process.env.STRIPE_PUBLISHABLE_KEY, giftCardsEnabled });
});

// GET /gift-cards — Purchase page
router.get('/gift-cards', (req, res) => {
  if (!getSetting('gift_cards_enabled')) return res.redirect('/');
  const content = getContent();
  res.render('gift-cards', { content, stripeKey: process.env.STRIPE_PUBLISHABLE_KEY });
});

// GET /gift-cards/success
router.get('/gift-cards/success', (req, res) => {
  if (!getSetting('gift_cards_enabled')) return res.redirect('/');
  const sessionId = req.query.session_id;
  let giftCard = null;

  if (sessionId) {
    giftCard = db.prepare('SELECT * FROM gift_cards WHERE stripe_session_id = ?').get(sessionId);
  }

  const content = getContent();
  res.render('gift-cards-success', { content, giftCard });
});

// GET /butterbeer — The Sorting Tap
router.get('/butterbeer', (req, res) => {
  res.render('butterbeer');
});

module.exports = router;
