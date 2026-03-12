require('dotenv').config();

const express = require('express');
const session = require('express-session');
const PgSession = require('connect-pg-simple')(session);
const bodyParser = require('body-parser');
const path = require('path');
const stripe = process.env.STRIPE_SECRET_KEY
  ? require('stripe')(process.env.STRIPE_SECRET_KEY)
  : null;

const cookieParser = require('cookie-parser');
const db = require('./db/database');
const { initDatabase } = require('./db/database');
const { redirectMiddleware } = require('./middleware/redirects');
const { i18nMiddleware } = require('./middleware/i18n');
const { handleWebhook } = require('./services/stripe');

const app = express();
const PORT = process.env.PORT || 3000;

// ── View Engine ──────────────────────────────────────────
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// ── Stripe Webhook (must be before body-parser) ──────────
app.post('/webhook/stripe', bodyParser.raw({ type: 'application/json' }), async (req, res) => {
  console.log('[WEBHOOK] Received webhook request');
  if (!stripe) {
    console.error('[WEBHOOK] Stripe not configured');
    return res.status(503).send('Stripe not configured');
  }
  const sig = req.headers['stripe-signature'];
  console.log('[WEBHOOK] Signature present:', !!sig);
  console.log('[WEBHOOK] Secret present:', !!process.env.STRIPE_WEBHOOK_SECRET);
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
    console.log('[WEBHOOK] Event verified:', event.type, event.id);
  } catch (err) {
    console.error('[WEBHOOK] Signature verification FAILED:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    await handleWebhook(event);
    console.log('[WEBHOOK] Handler completed successfully');
  } catch (err) {
    console.error('[WEBHOOK] Handler error:', err);
  }

  res.json({ received: true });
});

// ── Middleware ────────────────────────────────────────────
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Session store — PostgreSQL
app.use(session({
  store: new PgSession({
    conString: process.env.DATABASE_URL,
    createTableIfMissing: true,
  }),
  secret: process.env.SESSION_SECRET || 'dev-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: 'lax',
  },
}));

// Cookie parser (needed for language preference cookie)
app.use(cookieParser());

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// 301 Redirects (before routes)
app.use(redirectMiddleware);

// i18n — language detection + translation loading
app.use(i18nMiddleware);

// ── Routes ───────────────────────────────────────────────
const authRoutes = require('./routes/auth');
const publicRoutes = require('./routes/public');
const adminRoutes = require('./routes/admin');
const apiRoutes = require('./routes/api');

app.use('/', authRoutes);
app.use('/', publicRoutes);
app.use('/admin', adminRoutes);
app.use('/api', apiRoutes);

// ── Deploy version check ─────────────────────────────────
app.get('/api/version', (req, res) => {
  res.json({ version: 'v4-postgres', deployed: new Date().toISOString() });
});

// ── Gift Card Checkout Route ─────────────────────────────
const { createCheckoutSession } = require('./services/stripe');

app.post('/gift-cards/checkout', async (req, res) => {
  try {
    const { amount, purchaserName, purchaserEmail, recipientName, recipientEmail, sendTo, personalMessage } = req.body;
    console.log('[CHECKOUT] Request:', { amount, purchaserName, purchaserEmail, sendTo });

    if (!stripe) {
      console.error('[CHECKOUT] Stripe not configured — missing STRIPE_SECRET_KEY');
      return res.status(503).json({ error: 'Payment system is not configured. Please try again later.' });
    }

    if (!purchaserName || !purchaserEmail) {
      return res.status(400).json({ error: 'Please enter your name and email.' });
    }

    const amountPence = parseInt(amount);
    if (isNaN(amountPence) || amountPence < 2500 || amountPence > 25000) {
      return res.status(400).json({ error: 'Amount must be between £25 and £250' });
    }

    if (sendTo === 'friend' && (!recipientName || !recipientEmail)) {
      return res.status(400).json({ error: 'Please enter recipient details.' });
    }

    const session = await createCheckoutSession({
      amount: amountPence,
      purchaserName,
      purchaserEmail,
      recipientName: sendTo === 'friend' ? recipientName : null,
      recipientEmail: sendTo === 'friend' ? recipientEmail : null,
      sendTo: sendTo || 'self',
      personalMessage: sendTo === 'friend' ? (personalMessage || '').substring(0, 300) : null,
    });

    console.log('[CHECKOUT] Session created:', session.id);
    res.json({ clientSecret: session.client_secret });
  } catch (err) {
    console.error('[CHECKOUT] Error:', err.message, err.stack);
    const userMessage = err.type === 'StripeInvalidRequestError'
      ? 'There was a problem with the payment setup. Please try again.'
      : 'Something went wrong. Please try again.';
    res.status(500).json({ error: userMessage });
  }
});

// ── Gift Card Status Polling ─────────────────────────────
app.get('/gift-cards/status', async (req, res) => {
  const sessionId = req.query.session_id;
  if (!sessionId) return res.status(400).json({ error: 'Missing session_id' });

  const card = await db.get('SELECT status, initial_amount, recipient_email, recipient_name, purchaser_email, send_to FROM gift_cards WHERE stripe_session_id = $1', [sessionId]);
  console.log('[STATUS] Poll for session:', sessionId, '-> status:', card ? card.status : 'not found');
  if (!card) return res.json({ status: 'not_found' });

  res.json({
    status: card.status,
    amount: card.status === 'active' ? (card.initial_amount / 100).toFixed(2) : null,
    sendTo: card.send_to,
    recipientName: card.recipient_name,
    emailSentTo: card.status === 'active' ? (card.send_to === 'friend' ? card.recipient_email : card.purchaser_email) : null,
  });
});

// ── 404 ──────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).render('index', {
    content: {},
    hours: [],
    formatTime: () => '',
    stripeKey: process.env.STRIPE_PUBLISHABLE_KEY,
    giftCardsEnabled: false,
    t: res.locals.t,
    lang: res.locals.lang,
    supportedLangs: res.locals.supportedLangs,
    locales: res.locals.locales,
  });
});

// ── Error Handler ────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).send('Something went wrong');
});

// ── Cleanup: remove stale pending gift cards ────────────
async function cleanupPendingGiftCards() {
  try {
    const result = await db.run(
      "DELETE FROM gift_cards WHERE status = 'pending' AND created_at < NOW() - INTERVAL '24 hours'"
    );
    const count = result.rowCount || 0;
    if (count > 0) {
      console.log(`[CLEANUP] Removed ${count} abandoned pending gift card(s)`);
    }
  } catch (err) {
    console.error('[CLEANUP] Error cleaning pending gift cards:', err.message);
  }
}

// ── Start ────────────────────────────────────────────────
async function start() {
  await initDatabase();

  // Clean up stale pending cards on startup, then once a day
  await cleanupPendingGiftCards();
  setInterval(cleanupPendingGiftCards, 24 * 60 * 60 * 1000);

  app.listen(PORT, () => {
    console.log(`\n  Salt Horse running at http://localhost:${PORT}\n`);
  });
}

start().catch(err => {
  console.error('Failed to start:', err);
  process.exit(1);
});
