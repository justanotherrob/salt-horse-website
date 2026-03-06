const express = require('express');
const db = require('../db/database');
const router = express.Router();

// Helper: check if a site setting is enabled
async function getSetting(key) {
  const row = await db.get('SELECT value FROM site_settings WHERE key = $1', [key]);
  return row ? row.value === 'true' : false;
}

// Helper: get all content as key-value object
async function getContent() {
  const rows = await db.all('SELECT key, value, type FROM content_blocks');
  const content = {};
  for (const row of rows) {
    content[row.key] = row.value;
  }
  return content;
}

// Helper: get opening hours as array sorted by day_order
async function getHours() {
  return db.all('SELECT * FROM opening_hours ORDER BY day_order');
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
router.get('/', async (req, res) => {
  const content = await getContent();
  const hours = await getHours();
  const giftCardsEnabled = await getSetting('gift_cards_enabled');
  res.render('index', { content, hours, formatTime, stripeKey: process.env.STRIPE_PUBLISHABLE_KEY, giftCardsEnabled });
});

// GET /gift-cards — Purchase page
router.get('/gift-cards', async (req, res) => {
  if (!(await getSetting('gift_cards_enabled'))) return res.redirect('/');
  const content = await getContent();
  res.render('gift-cards', { content, stripeKey: process.env.STRIPE_PUBLISHABLE_KEY });
});

// GET /gift-cards/success
router.get('/gift-cards/success', async (req, res) => {
  if (!(await getSetting('gift_cards_enabled'))) return res.redirect('/');
  const sessionId = req.query.session_id;
  let giftCard = null;

  if (sessionId) {
    giftCard = await db.get('SELECT * FROM gift_cards WHERE stripe_session_id = $1', [sessionId]);
  }

  const content = await getContent();
  res.render('gift-cards-success', { content, giftCard });
});

// GET /butterbeer — The Sorting Tap
router.get('/butterbeer', (req, res) => {
  res.render('butterbeer');
});

module.exports = router;
