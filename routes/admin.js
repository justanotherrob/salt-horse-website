const express = require('express');
const db = require('../db/database');
const { requireAuth } = require('../middleware/auth');
const router = express.Router();

// All admin routes require auth
router.use(requireAuth);

// GET /admin — Dashboard
router.get('/', async (req, res) => {
  const totalCards = await db.get('SELECT COUNT(*) as count FROM gift_cards');
  const activeCards = await db.get('SELECT COUNT(*) as count FROM gift_cards WHERE status = $1', ['active']);
  const totalRevenue = await db.get("SELECT COALESCE(SUM(initial_amount), 0) as total FROM gift_cards WHERE status IN ('active', 'redeemed')");
  const redirectCount = await db.get('SELECT COUNT(*) as count FROM redirects');
  const giftCardsEnabled = await db.get("SELECT value FROM site_settings WHERE key = 'gift_cards_enabled'");

  // Get enabled state for each language
  const langCodes = ['fr', 'de', 'es', 'it', 'nl', 'pl', 'zh'];
  const enabledLangs = {};
  for (const code of langCodes) {
    const setting = await db.get("SELECT value FROM site_settings WHERE key = $1", [`lang_${code}_enabled`]);
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
router.get('/content', async (req, res) => {
  const blocks = await db.all('SELECT * FROM content_blocks ORDER BY section, sort_order');

  // Group by section
  const sections = {};
  for (const block of blocks) {
    if (!sections[block.section]) sections[block.section] = [];
    sections[block.section].push(block);
  }

  res.render('admin/content', { sections, user: req.session.userName });
});

// GET /admin/hours
router.get('/hours', async (req, res) => {
  const hours = await db.all('SELECT * FROM opening_hours ORDER BY day_order');
  res.render('admin/hours', { hours, user: req.session.userName });
});

// GET /admin/gift-cards
router.get('/gift-cards', async (req, res) => {
  const filter = req.query.filter || 'all';
  const search = req.query.search || '';
  const page = parseInt(req.query.page) || 1;
  const perPage = 25;
  const offset = (page - 1) * perPage;

  let where = "WHERE 1=1";
  const params = [];
  let paramIndex = 1;

  if (filter === 'active') { where += " AND status = 'active'"; }
  else if (filter === 'redeemed') { where += " AND status = 'redeemed'"; }
  else if (filter === 'expired') { where += " AND status = 'expired'"; }
  else if (filter === 'pending') { where += " AND status = 'pending'"; }

  if (search) {
    where += ` AND (code ILIKE $${paramIndex} OR purchaser_email ILIKE $${paramIndex + 1} OR recipient_email ILIKE $${paramIndex + 2})`;
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    paramIndex += 3;
  }

  const total = await db.get(`SELECT COUNT(*) as count FROM gift_cards ${where}`, params);
  const cards = await db.all(`SELECT * FROM gift_cards ${where} ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`, [...params, perPage, offset]);

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
router.get('/redeem', async (req, res) => {
  const code = req.query.code || '';
  let card = null;
  let transactions = [];

  if (code) {
    card = await db.get('SELECT * FROM gift_cards WHERE code = $1', [code]);
    if (card) {
      transactions = await db.all('SELECT * FROM gift_card_transactions WHERE gift_card_id = $1 ORDER BY created_at DESC', [card.id]);
    }
  }

  res.render('admin/redeem', { card, transactions, code, user: req.session.userName });
});

// GET /admin/import
router.get('/import', (req, res) => {
  res.render('admin/import', { user: req.session.userName });
});

// GET /admin/pages — All live site pages
router.get('/pages', async (req, res) => {
  const giftCardsEnabled = await db.get("SELECT value FROM site_settings WHERE key = 'gift_cards_enabled'");
  const gcOn = giftCardsEnabled ? giftCardsEnabled.value === 'true' : false;

  const pages = [
    { name: 'Homepage',         path: '/',                   type: 'Main',    typeClass: 'main',    note: 'Main landing page' },
    { name: 'Craft Beer',       path: '/drink',              type: 'SEO',     typeClass: 'seo',     note: 'Taps, bottles & fridge' },
    { name: 'Food & Burgers',   path: '/food',               type: 'SEO',     typeClass: 'seo',     note: 'Menu & kitchen hours' },
    { name: 'Book a Table',     path: '/book',               type: 'SEO',     typeClass: 'seo',     note: 'Reservations' },
    { name: 'Find Us',          path: '/find-us',            type: 'SEO',     typeClass: 'seo',     note: 'Location, hours & map' },
    { name: 'Group Bookings',   path: '/groups',             type: 'Feature', typeClass: 'feature', note: 'Enquiry form (7+ guests)' },
    { name: 'Gift Cards',       path: '/gift-cards',         type: 'Feature', typeClass: 'feature', note: gcOn ? 'Live' : 'Currently hidden' },
    { name: 'The Sorting Tap',  path: '/butterbeer',         type: 'Feature', typeClass: 'feature', note: 'Butterbeer quiz' },
    { name: 'Privacy Policy',   path: '/privacy',            type: 'Legal',   typeClass: 'legal',   note: '' },
  ];

  res.render('admin/pages', { pages, user: req.session.userName });
});

// GET /admin/redirects
router.get('/redirects', async (req, res) => {
  const redirects = await db.all('SELECT * FROM redirects ORDER BY created_at DESC');
  res.render('admin/redirects', { redirects, user: req.session.userName });
});

module.exports = router;
