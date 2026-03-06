const stripe = process.env.STRIPE_SECRET_KEY
  ? require('stripe')(process.env.STRIPE_SECRET_KEY)
  : null;
const db = require('../db/database');
const { sendGiftCardEmail, sendPurchaserReceipt } = require('./email');

function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I/O/0/1 for clarity
  let code = '';
  for (let i = 0; i < 10; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

async function generateUniqueCode() {
  let code;
  let attempts = 0;
  do {
    code = generateCode();
    const existing = await db.get('SELECT id FROM gift_cards WHERE code = $1', [code]);
    if (!existing) return code;
    attempts++;
  } while (attempts < 100);
  throw new Error('Could not generate unique gift card code');
}

async function createCheckoutSession({ amount, purchaserName, purchaserEmail, recipientName, recipientEmail, sendTo, personalMessage }) {
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
      personal_message: (personalMessage || '').substring(0, 300),
    },
  });

  // Insert pending gift card
  await db.run(`
    INSERT INTO gift_cards (code, initial_amount, balance, status, purchaser_email, purchaser_name, recipient_email, recipient_name, send_to, personal_message, stripe_session_id, expires_at)
    VALUES ($1, $2, $3, 'pending', $4, $5, $6, $7, $8, $9, $10, $11)
  `, [
    'PENDING-' + session.id.slice(-12),
    amount, amount,
    purchaserEmail, purchaserName,
    recipientEmail || purchaserEmail,
    recipientName || purchaserName,
    sendTo,
    personalMessage || null,
    session.id,
    expiresAt
  ]);

  return session;
}

async function handleWebhook(event) {
  console.log('[STRIPE] handleWebhook called, event type:', event.type);
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    console.log('[STRIPE] Session ID:', session.id);
    console.log('[STRIPE] Session metadata:', JSON.stringify(session.metadata));

    // Only process gift card payments
    if (session.metadata?.type !== 'gift_card') {
      console.log('[STRIPE] Not a gift card payment, skipping');
      return;
    }

    const card = await db.get('SELECT * FROM gift_cards WHERE stripe_session_id = $1', [session.id]);
    if (!card) {
      console.error('[STRIPE] Gift card not found for session:', session.id);
      return;
    }
    console.log('[STRIPE] Found pending card ID:', card.id, 'status:', card.status);

    if (card.status !== 'pending') {
      console.log('[STRIPE] Card already processed, skipping');
      return;
    }

    const code = await generateUniqueCode();
    console.log('[STRIPE] Generated new code:', code);
    const now = new Date().toISOString();

    // Activate the gift card
    await db.run(`
      UPDATE gift_cards SET code = $1, status = 'active', stripe_payment_intent = $2, purchased_at = $3
      WHERE id = $4
    `, [code, session.payment_intent, now, card.id]);
    console.log('[STRIPE] Card activated with code:', code);

    // Create purchase transaction
    await db.run(`
      INSERT INTO gift_card_transactions (gift_card_id, amount, type, note)
      VALUES ($1, $2, 'purchase', 'Stripe payment')
    `, [card.id, card.initial_amount]);

    // Send emails
    try {
      const updatedCard = await db.get('SELECT * FROM gift_cards WHERE id = $1', [card.id]);
      console.log('[STRIPE] Sending gift card email...');
      await sendGiftCardEmail(updatedCard);
      console.log('[STRIPE] Gift card email sent');
      // If it's a gift for a friend, also send the purchaser a receipt
      if (updatedCard.send_to === 'friend') {
        console.log('[STRIPE] Sending purchaser receipt...');
        await sendPurchaserReceipt(updatedCard);
        console.log('[STRIPE] Purchaser receipt sent');
      }
    } catch (err) {
      console.error('[STRIPE] Failed to send gift card email:', err);
    }
  }
}

module.exports = { createCheckoutSession, handleWebhook };
