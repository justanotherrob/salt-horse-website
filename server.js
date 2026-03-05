require('dotenv').config();

const express = require('express');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const bodyParser = require('body-parser');
const path = require('path');
const stripe = process.env.STRIPE_SECRET_KEY
  ? require('stripe')(process.env.STRIPE_SECRET_KEY)
  : null;

const cookieParser = require('cookie-parser');
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
  if (!stripe) return res.status(503).send('Stripe not configured');
  const sig = req.headers['stripe-signature'];
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    await handleWebhook(event);
  } catch (err) {
    console.error('Webhook handler error:', err);
  }

  res.json({ received: true });
});

// ── Middleware ────────────────────────────────────────────
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.use(session({
  store: new SQLiteStore({ db: 'sessions.db', dir: path.join(__dirname, 'db') }),
  secret: process.env.SESSION_SECRET || 'dev-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
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

// ── Gift Card Checkout Route ─────────────────────────────
const { createCheckoutSession } = require('./services/stripe');

app.post('/gift-cards/checkout', async (req, res) => {
  try {
    const { amount, purchaserName, purchaserEmail, recipientName, recipientEmail, sendTo } = req.body;

    const amountPence = parseInt(amount);
    if (isNaN(amountPence) || amountPence < 2500 || amountPence > 25000) {
      return res.status(400).json({ error: 'Amount must be between £25 and £250' });
    }

    const session = await createCheckoutSession({
      amount: amountPence,
      purchaserName,
      purchaserEmail,
      recipientName: sendTo === 'friend' ? recipientName : null,
      recipientEmail: sendTo === 'friend' ? recipientEmail : null,
      sendTo: sendTo || 'self',
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error('Checkout error:', err);
    res.status(500).json({ error: 'Failed to create checkout session' });
  }
});

// ── 404 ──────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).render('index', {
    content: {},
    hours: [],
    formatTime: () => '',
    stripeKey: process.env.STRIPE_PUBLISHABLE_KEY,
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

// ── Start ────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n  Salt Horse running at http://localhost:${PORT}\n`);
});
