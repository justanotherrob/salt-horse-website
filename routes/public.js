const express = require('express');
const db = require('../db/database');
const { sendGroupEnquiry } = require('../services/email');
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

// Helper: format time — 12h for English, 24h for everything else
function formatTime(time24, lang) {
  if (!time24) return '';
  const [h, m] = time24.split(':').map(Number);
  // English uses 12h format
  if (!lang || lang === 'en') {
    if (h === 0 && m === 0) return '12am';
    if (h === 12 && m === 0) return '12pm';
    const period = h >= 12 ? 'pm' : 'am';
    const hour12 = h > 12 ? h - 12 : (h === 0 ? 12 : h);
    return m === 0 ? `${hour12}${period}` : `${hour12}:${m.toString().padStart(2, '0')}${period}`;
  }
  // All other languages use 24h format
  return `${h}:${m.toString().padStart(2, '0')}`;
}

// GET / — Main site
router.get('/', async (req, res) => {
  const content = await getContent();
  const hours = await getHours();
  const giftCardsEnabled = await getSetting('gift_cards_enabled');
  const lang = res.locals.lang || 'en';
  res.render('index', { content, hours, formatTime: (t) => formatTime(t, lang), stripeKey: process.env.STRIPE_PUBLISHABLE_KEY, giftCardsEnabled });
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

// GET /groups — Group booking enquiry form
router.get('/groups', async (req, res) => {
  const content = await getContent();
  res.render('groups', { bookUrl: content.book_url || '#', recaptchaSiteKey: process.env.RECAPTCHA_SITE_KEY || '' });
});

// POST /groups — Submit group booking enquiry
router.post('/groups', async (req, res) => {
  try {
    const { name, email, phone, date, time, groupSize, type, comments, recaptchaToken } = req.body;

    // reCAPTCHA verification
    if (process.env.RECAPTCHA_SECRET_KEY) {
      if (!recaptchaToken) {
        return res.status(400).json({ error: 'reCAPTCHA verification failed. Please try again.' });
      }
      try {
        const recaptchaRes = await fetch('https://www.google.com/recaptcha/api/siteverify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: `secret=${process.env.RECAPTCHA_SECRET_KEY}&response=${recaptchaToken}`
        });
        const recaptchaData = await recaptchaRes.json();
        if (!recaptchaData.success || recaptchaData.score < 0.5) {
          console.log('[RECAPTCHA] Blocked submission — score:', recaptchaData.score, 'success:', recaptchaData.success);
          return res.status(400).json({ error: 'Submission blocked — please try again.' });
        }
        console.log('[RECAPTCHA] Passed — score:', recaptchaData.score);
      } catch (recaptchaErr) {
        console.error('[RECAPTCHA] Verification error:', recaptchaErr.message);
        // Allow submission if reCAPTCHA service is down
      }
    }

    // Validation
    if (!name || !email || !phone || !date || !time || !groupSize) {
      return res.status(400).json({ error: 'Please fill in all fields.' });
    }
    if (groupSize < 7) {
      return res.status(400).json({ error: 'Group bookings are for 7 or more people.' });
    }
    if (!['drinks', 'food_and_drinks'].includes(type)) {
      return res.status(400).json({ error: 'Please select drinks or food & drinks.' });
    }

    // Send emails
    await sendGroupEnquiry({ name, email, phone, date, time, groupSize, type, comments: (comments || '').substring(0, 500) });

    res.json({ success: true });
  } catch (err) {
    console.error('Group enquiry error:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again or give us a call.' });
  }
});

// ── SEO Landing Pages ──

// GET /drink — Craft beer landing page
router.get('/drink', async (req, res) => {
  const content = await getContent();
  res.render('drink', { bookUrl: content.book_url || '#' });
});

// GET /food — Food & burgers landing page
router.get('/food', async (req, res) => {
  const content = await getContent();
  res.render('food', {
    bookUrl: content.book_url || '#',
    menuUrl: content.food_menu_url || '#',
    allergensUrl: content.food_allergens_url || '#'
  });
});

// GET /book — Reservations landing page
router.get('/book', async (req, res) => {
  const content = await getContent();
  res.render('book', { bookUrl: content.book_url || '#' });
});

// GET /find-us — Location & hours landing page
router.get('/find-us', async (req, res) => {
  const content = await getContent();
  const hours = await getHours();
  const lang = res.locals.lang || 'en';
  res.render('find-us', { content, hours, formatTime: (t) => formatTime(t, lang), bookUrl: content.book_url || '#' });
});

// GET /butterbeer — The Sorting Tap
router.get('/butterbeer', (req, res) => {
  res.render('butterbeer');
});

// GET /privacy — Privacy Policy
router.get('/privacy', (req, res) => {
  res.render('privacy');
});

module.exports = router;
