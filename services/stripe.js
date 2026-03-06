const stripe = process.env.STRIPE_SECRET_KEY
  ? require('stripe')(process.env.STRIPE_SECRET_KEY)
  : null;
const db = require('../db/database');
const { sendGiftCardEmail, sendPurchaserReceipt } = require('./email');

function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I/O/0/1 for clarity
  let code = 'SH-';
  for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
  code += '-';
  for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

function generateUniqueCode() {
  let code;
  let attempts = 0;
  do {
    code = generateCode();
    const existing = db.prepare('SELECT id FROM gift_cards WHERE code = ?').get(code);
    if (!existing) return code;
    attempts++;
  } while (attempts < 100);
  throw new Error('Could not generate unique gift card code');
}

async function createCheckoutSession({ amount, purchaserName, purchaserEmail, recipientName, recipientEmail, sendTo }) {
  const baseUrl = process.env.BASE_URL || 'http://localhost:3000';

  // Create pending gift card record
  const expiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();

  const session = await stripe.checkout.sessions.create({
    ui_mode: 'embedded',
    payment_method_types: ['card'],
    line_items: [{
      price_data: {
        currency: 'gbp',
        product_data: {
          name: `Salt Horse Gift Card £${(amount / 100).toFixed(0)}`,
          description: 'Redeemable at Salt Horse, Edinburgh',
        },
        unit_amount: amount,
      },
      quantity: 1,
    }],
    customer_email: purchaserEmail,
    mode: 'payment',
    return_url: `${baseUrl}/gift-cards/success?session_id={CHECKOUT_SESSION_ID}`,
    metadata: {
      type: 'gift_card',
      purchaser_name: purchaserName,
      purchaser_email: purchaserEmail,
      recipient_name: recipientName || purchaserName,
      recipient_email: recipientEmail || purchaserEmail,
      send_to: sendTo,
    },
  });

  // Insert pending gift card
  db.prepare(`
    INSERT INTO gift_cards (code, initial_amount, balance, status, purchaser_email, purchaser_name, recipient_email, recipient_name, send_to, stripe_session_id, expires_at)
    VALUES (?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?)
  `).run(
    'PENDING-' + session.id.slice(-12),
    amount, amount,
    purchaserEmail, purchaserName,
    recipientEmail || purchaserEmail,
    recipientName || purchaserName,
    sendTo,
    session.id,
    expiresAt
  );

  return session;
}

async function handleWebhook(event) {
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;

    // Only process gift card payments
    if (session.metadata?.type !== 'gift_card') return;

    const card = db.prepare('SELECT * FROM gift_cards WHERE stripe_session_id = ?').get(session.id);
    if (!card) {
      console.error('Gift card not found for session:', session.id);
      return;
    }

    if (card.status !== 'pending') return; // Already processed

    const code = generateUniqueCode();
    const now = new Date().toISOString();

    // Activate the gift card
    db.prepare(`
      UPDATE gift_cards SET code = ?, status = 'active', stripe_payment_intent = ?, purchased_at = ?
      WHERE id = ?
    `).run(code, session.payment_intent, now, card.id);

    // Create purchase transaction
    db.prepare(`
      INSERT INTO gift_card_transactions (gift_card_id, amount, type, note)
      VALUES (?, ?, 'purchase', 'Stripe payment')
    `).run(card.id, card.initial_amount);

    // Send emails
    try {
      const updatedCard = db.prepare('SELECT * FROM gift_cards WHERE id = ?').get(card.id);
      await sendGiftCardEmail(updatedCard);
      // If it's a gift for a friend, also send the purchaser a receipt
      if (updatedCard.send_to === 'friend') {
        await sendPurchaserReceipt(updatedCard);
      }
    } catch (err) {
      console.error('Failed to send gift card email:', err);
    }
  }
}

module.exports = { createCheckoutSession, handleWebhook };
