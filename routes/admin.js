const express = require('express');
const db = require('../db/database');
const { requireAuth } = require('../middleware/auth');
const router = express.Router();

// All admin routes require auth
router.use(requireAuth);

// GET /admin — Dashboard
router.get('/', (req, res) => {
  const totalCards = db.prepare('SELECT COUNT(*) as count FROM gift_cards').get();
  const activeCards = db.prepare('SELECT COUNT(*) as count FROM gift_cards WHERE status = ?').get('active');
  const totalRevenue = db.prepare("SELECT COALESCE(SUM(initial_amount), 0) as total FROM gift_cards WHERE status IN ('active', 'redeemed')").get();
  const redirectCount = db.prepare('SELECT COUNT(*) as count FROM redirects').get();
  const giftCardsEnabled = db.prepare("SELECT value FROM site_settings WHERE key = 'gift_cards_enabled'").get();

  // Get enabled state for each language
  const langCodes = ['fr', 'de', 'es', 'it', 'nl', 'pl', 'zh'];
  const enabledLangs = {};
  for (const code of langCodes) {
    const setting = db.prepare("SELECT value FROM site_settings WHERE key = ?").get(`lang_${code}_enabled`);
    enabledLangs[code] = setting ? setting.value === 'true' : true; // default to true if not set
  }

  res.render('admin/dashboard', {
    user: req.session.userName,
    giftCardsEnabled: giftCardsEnabled ? giftCardsEnabled.value === 'true' : false,
    enabledLangs,
    stats: {
      totalCards: totalCards.count,
      activeCards: activeCards.count,
      totalRevenue: (totalRevenue.total / 100).toFixed(2),
      redirectCount: redirectCount.count,
    }
  });
});

// GET /admin/content
router.get('/content', (req, res) => {
  const blocks = db.prepare('SELECT * FROM content_blocks ORDER BY section, sort_order').all();

  // Group by section
  const sections = {};
  for (const block of blocks) {
    if (!sections[block.section]) sections[block.section] = [];
    sections[block.section].push(block);
  }

  res.render('admin/content', { sections, user: req.session.userName });
});

// GET /admin/hours
router.get('/hours', (req, res) => {
  const hours = db.prepare('SELECT * FROM opening_hours ORDER BY day_order').all();
  res.render('admin/hours', { hours, user: req.session.userName });
});

// GET /admin/gift-cards
router.get('/gift-cards', (req, res) => {
  const filter = req.query.filter || 'all';
  const search = req.query.search || '';
  const page = parseInt(req.query.page) || 1;
  const perPage = 25;
  const offset = (page - 1) * perPage;

  let where = "WHERE 1=1";
  const params = [];

  if (filter === 'active') { where += " AND status = 'active'"; }
  else if (filter === 'redeemed') { where += " AND status = 'redeemed'"; }
  else if (filter === 'expired') { where += " AND status = 'expired'"; }
  else if (filter === 'pending') { where += " AND status = 'pending'"; }

  if (search) {
    where += ' AND (code LIKE ? OR purchaser_email LIKE ? OR recipient_email LIKE ?)';
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }

  const total = db.prepare(`SELECT COUNT(*) as count FROM gift_cards ${where}`).get(...params);
  const cards = db.prepare(`SELECT * FROM gift_cards ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`).all(...params, perPage, offset);

  res.render('admin/gift-cards', {
    cards,
    filter,
    search,
    page,
    totalPages: Math.ceil(total.count / perPage),
    total: total.count,
    user: req.session.userName
  });
});

// GET /admin/redeem
router.get('/redeem', (req, res) => {
  const code = req.query.code || '';
  let card = null;
  let transactions = [];

  if (code) {
    card = db.prepare('SELECT * FROM gift_cards WHERE code = ?').get(code);
    if (card) {
      transactions = db.prepare('SELECT * FROM gift_card_transactions WHERE gift_card_id = ? ORDER BY created_at DESC').all(card.id);
    }
  }

  res.render('admin/redeem', { card, transactions, code, user: req.session.userName });
});

// GET /admin/import
router.get('/import', (req, res) => {
  res.render('admin/import', { user: req.session.userName, result: null });
});

// GET /admin/redirects
router.get('/redirects', (req, res) => {
  const redirects = db.prepare('SELECT * FROM redirects ORDER BY created_at DESC').all();
  res.render('admin/redirects', { redirects, user: req.session.userName });
});

module.exports = router;
