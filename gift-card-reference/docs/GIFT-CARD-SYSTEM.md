# Gift Card System — Implementation Reference

Use this document and the accompanying source files to rebuild this gift card system in any framework (designed for Next.js but framework-agnostic in concept).

---

## Table of Contents

1. Architecture Overview
2. Database Schema
3. Environment Variables
4. Payment Flow (Stripe Embedded Checkout)
5. Webhook Handler
6. Email & PDF Generation
7. Customer-Facing Pages
8. Admin Pages
9. API Endpoints
10. Key Gotchas & Lessons Learned

---

## 1. Architecture Overview

The gift card system has these components:

```
Customer buys gift card
  → Frontend form collects details
  → POST /gift-cards/checkout creates Stripe session + pending DB record
  → Stripe Embedded Checkout mounts in overlay
  → Customer pays
  → Stripe fires webhook (checkout.session.completed)
  → Webhook activates card, generates code, sends emails
  → Frontend polls /gift-cards/status until active, shows confirmation

Admin manages gift cards
  → List/search/filter all cards (codes masked, last 4 only)
  → Click into detail view for each card
  → Redeem page: look up card by code, redeem full or custom amount
  → Import CSV from previous provider
  → Export all cards as CSV (full codes visible in export)
  → Resend emails to purchaser or recipient
```

### Two Purchase Modes

- **For Me ("self")**: Purchaser gets an email with a printable PDF attached. The PDF is an A4 branded gift card they can give in person.
- **For a Friend ("friend")**: Recipient gets an email with the gift card code and any personal message (no PDF). Purchaser gets a separate receipt email.

---

## 2. Database Schema

PostgreSQL. All amounts stored in **pence** (integer), displayed in pounds by dividing by 100.

### gift_cards

```sql
CREATE TABLE IF NOT EXISTS gift_cards (
  id SERIAL PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  initial_amount INTEGER NOT NULL,        -- in pence (e.g. 5000 = £50)
  balance INTEGER NOT NULL,               -- in pence
  currency TEXT NOT NULL DEFAULT 'GBP',
  status TEXT NOT NULL DEFAULT 'pending',  -- pending | active | redeemed | expired
  purchaser_email TEXT,
  purchaser_name TEXT,
  recipient_email TEXT,
  recipient_name TEXT,
  send_to TEXT DEFAULT 'self',            -- 'self' or 'friend'
  personal_message TEXT,
  stripe_session_id TEXT,
  stripe_payment_intent TEXT,
  purchased_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gift_cards_code ON gift_cards(code);
CREATE INDEX IF NOT EXISTS idx_gift_cards_status ON gift_cards(status);
CREATE INDEX IF NOT EXISTS idx_gift_cards_stripe ON gift_cards(stripe_session_id);
```

### gift_card_transactions

```sql
CREATE TABLE IF NOT EXISTS gift_card_transactions (
  id SERIAL PRIMARY KEY,
  gift_card_id INTEGER NOT NULL REFERENCES gift_cards(id),
  amount INTEGER NOT NULL,                -- in pence
  type TEXT NOT NULL,                     -- 'purchase' | 'redemption' | 'import'
  redeemed_by_user_id INTEGER,            -- references admin user who redeemed
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Status Lifecycle

```
pending → active → redeemed
                  → expired (can still be redeemed with warning)
```

- **pending**: Created when checkout session starts. Cleaned up after 24 hours if never completed.
- **active**: Payment confirmed via webhook. Code generated, emails sent.
- **redeemed**: Balance reaches zero after redemption(s).
- **expired**: Past expiry date. Can still be redeemed (admin gets a warning confirmation dialog).

---

## 3. Environment Variables

```env
STRIPE_SECRET_KEY=sk_live_...
STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
DATABASE_URL=postgresql://user:pass@host:5432/dbname
BASE_URL=https://yourdomain.com
RESEND_API_KEY=re_...              # Email provider (Resend)
SESSION_SECRET=your-session-secret
```

---

## 4. Payment Flow (Stripe Embedded Checkout)

### Step 1: Customer fills form

The purchase form collects:
- Amount (preset buttons: £25, £50, £75, £100 — or custom £25–£250)
- Who it's for: "For Me" or "For a Friend" (toggle buttons)
- Purchaser name + email (always required)
- Recipient name + email + personal message (only if "For a Friend")

### Step 2: Create checkout session

**POST /gift-cards/checkout**

Client sends:
```json
{
  "amount": 5000,              // pence (integer)
  "purchaserName": "John",
  "purchaserEmail": "john@example.com",
  "recipientName": "Jane",     // null if self
  "recipientEmail": "jane@example.com",  // null if self
  "sendTo": "friend",          // "self" or "friend"
  "personalMessage": "Happy birthday!"   // null if self
}
```

Server:
1. Validates amount (2500–25000 pence), required fields
2. Creates Stripe checkout session with `ui_mode: 'embedded'`, stores metadata
3. Inserts a **pending** gift card record with temporary code `PENDING-{session_id_suffix}`
4. Returns `{ clientSecret }` to the frontend

See: `source-files/services/stripe.js` → `createCheckoutSession()`

### Step 3: Mount Stripe checkout

Frontend uses `stripe.initEmbeddedCheckout({ clientSecret, onComplete })` to mount the payment form inside a full-screen overlay. The overlay also shows an order summary.

### Step 4: Payment complete → poll for activation

When `onComplete` fires:
1. Hide Stripe form, show "Confirming your payment..." spinner
2. Get session ID from `currentCheckout.session()`
3. Poll **GET /gift-cards/status?session_id=xxx** every 2 seconds (max 15 attempts = 30 seconds)
4. When status returns `active`, show confirmation
5. If timeout, show a generic "check your email" fallback

### Step 5: Webhook activates the card

This happens server-side in parallel with the polling. See section 5.

---

## 5. Webhook Handler

**POST /webhook/stripe**

Critical: This route must receive the raw body (not JSON-parsed). In Express, this means placing it before `bodyParser.json()`. In Next.js, you'll need to disable body parsing for this route.

```
Stripe sends checkout.session.completed
  → Verify signature using STRIPE_WEBHOOK_SECRET
  → Check metadata.type === 'gift_card'
  → Find pending card by stripe_session_id
  → Generate unique 10-character alphanumeric code
  → Update card: set code, status='active', stripe_payment_intent, purchased_at
  → Insert 'purchase' transaction
  → Send emails (see section 6)
```

### Code Generation

10 characters from `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (no I/O/0/1 to avoid confusion). Loop until unique (check DB), max 100 attempts.

See: `source-files/services/stripe.js` → `handleWebhook()` and `generateUniqueCode()`

### Stripe Webhook Setup

In the Stripe dashboard, create a webhook endpoint pointing to `https://yourdomain.com/webhook/stripe` listening for `checkout.session.completed` events.

---

## 6. Email & PDF Generation

### Email Provider: Resend

Uses the Resend API (`resend` npm package) to send transactional emails with HTML bodies and optional PDF attachments.

### Email Types

**1. Gift Card Email** (sent to recipient or self)

- **Self purchase**: Includes a printable PDF attachment + message about printing
- **Friend purchase**: No PDF, includes personal message if provided, message about redeeming at the bar

**2. Purchaser Receipt** (only for friend purchases)

Sent to the purchaser confirming the gift card was sent to the recipient. No PDF, no gift card code — just a confirmation.

### Email HTML Structure

All emails use an inline-styled HTML table layout (for email client compatibility). The design matches the site: dark navy background (`#182241`), cream text (`#FFF6DA`), amber accents (`#D4943A`). Contains:
- Logo header
- Greeting
- Gift card amount + code in a styled card
- Expiry date
- Personal message (if friend purchase)
- Footer

See: `source-files/services/email.js`

### PDF Generation (PDFKit)

A4 portrait PDF (`595.28 × 841.89` points). Designed to be printed and given as a physical gift card. Contains:
- Brand colour background (`#182241`)
- Logo centred at top
- "GIFT CARD" title
- Large amount display
- Gift card code
- Expiry date
- Personal message (if any)
- Recipient name
- Tagline and address at bottom

The PDF is generated in memory (Buffer), base64-encoded, and attached to the email.

See: `source-files/services/pdf.js`

**Important**: The PDF requires a logo file at `public/logos/salthorse_lesstext_logo_FFF6DA_transparent.png`. Update this path for the new brand.

---

## 7. Customer-Facing Pages

### Purchase Page (/gift-cards)

Full-page form with the brand's dark theme. Sections:
1. Amount selection (4 preset buttons + custom input, £25–£250)
2. "For Me" / "For a Friend" toggle with hint text explaining what happens
3. Purchaser details (name + email)
4. Recipient details (name + email + personal message, shown only for "friend")
5. Buy button

On submit, a full-screen payment overlay opens with:
- Order summary (amount, recipient name if friend)
- Stripe Embedded Checkout form
- Processing spinner (after payment)
- Confirmation state (after webhook fires)
- Error state with retry button

See: `source-files/views/gift-cards.ejs`

### Success Page (/gift-cards/success)

Fallback page for the `return_url` from Stripe. Shows different content based on purchase type:

- **Friend**: "We've emailed a £X gift card to **Name** at **email**" + receipt note
- **Self**: "We've sent your £X gift card to **email**. Check your inbox — it's ready to print and give in person."

See: `source-files/views/gift-cards-success.ejs`

---

## 8. Admin Pages

### Gift Card List (/admin/gift-cards)

Paginated table with filter tabs (All, Active, Redeemed, Expired, Pending) and search (by code or email, case-insensitive with ILIKE).

**Gift card codes are masked** — only the last 4 characters are visible (e.g. `••••SATBH`). This prevents staff from casually reading codes. Full codes are only visible in CSV exports and on the redeem page.

Each row expands on click to show purchaser/recipient details, masked code, and resend buttons. The resend modal allows editing the email address before sending.

Columns: Code (masked), Purchaser, Recipient, Amount, Balance, Status, Purchased, Expires.

See: `source-files/views/admin-gift-cards.ejs`

### Redeem Page (/admin/redeem?code=XXXX)

Staff enter or scan a gift card code. The page shows:
- Card status badge, purchaser/recipient info, purchase date, expiry
- Prominent balance display
- "Redeem Full Balance — £X.XX" button (full width)
- "or enter a custom amount" divider
- Custom amount input with validation (max = current balance)
- Both buttons show a confirmation dialog before processing
- **Expired cards**: A red warning banner appears, and confirmation dialogs say "This gift card has expired. Are you sure you want to redeem...?"
- Transaction history showing all purchases and redemptions with timestamps

See: `source-files/views/admin-redeem.ejs`

### Import / Export (/admin/import)

**Import**: File upload accepting CSV. Expects columns: GIFT CODE, INITIAL VALUE, REMAINING VALUE, PURCHASER EMAIL, RECIPIENT EMAIL, PURCHASE DATE, USAGE. Amounts parsed from "50.00 GBP" format. USAGE "DEPLETED" maps to "redeemed" status. Duplicate codes are skipped (reported in results). Uses `ON CONFLICT` to avoid errors.

**Export**: Downloads all non-pending gift cards as CSV with **full codes** (not masked). Includes: code, initial value, remaining value, status, purchaser email/name, recipient email/name, purchase date, expiry.

See: `source-files/views/admin-import.ejs`

---

## 9. API Endpoints

All admin endpoints require authentication.

### Public

| Method | Path | Description |
|---|---|---|
| POST | `/gift-cards/checkout` | Create Stripe checkout session |
| GET | `/gift-cards/status?session_id=xxx` | Poll for card activation |
| POST | `/webhook/stripe` | Stripe webhook (raw body) |

### Admin

| Method | Path | Description |
|---|---|---|
| GET | `/api/gift-cards/export` | Download CSV export |
| POST | `/api/gift-cards/import` | Upload CSV (multipart, field name: `csv`) |
| POST | `/api/gift-cards/:code/redeem` | Redeem amount (body: `{ amount }` in pence) |
| POST | `/api/gift-cards/:id/resend-recipient` | Resend gift card email |
| POST | `/api/gift-cards/:id/resend-purchaser` | Resend receipt email |

### Redeem API Detail

```
POST /api/gift-cards/:code/redeem
Body: { "amount": 2500 }  // pence

- Accepts active and expired cards (expired cards have balance > 0)
- Rejects redeemed or pending cards
- Validates amount > 0 and <= balance
- Updates balance, sets status to 'redeemed' if balance reaches 0
- Creates redemption transaction
- Returns: { success, newBalance, newStatus, redeemed, balanceFormatted }
```

---

## 10. Key Gotchas & Lessons Learned

### All amounts are in pence

Store, transmit, and process all amounts in pence (integers). Only convert to pounds for display: `(amount / 100).toFixed(2)`. The frontend sends `Math.round(amount * 100)` when converting user input. This avoids floating point issues.

### Stripe webhook must receive raw body

The webhook signature verification requires the raw request body. In Express, the webhook route is placed **before** `bodyParser.json()` and uses `bodyParser.raw({ type: 'application/json' })`. In Next.js, disable body parsing for the webhook API route:

```ts
export const config = { api: { bodyParsing: false } };
```

### Pending cards need cleanup

When a customer starts checkout, a pending record is created. If they abandon, it stays forever. A cleanup job runs on startup and every 24 hours to delete pending cards older than 24 hours:

```sql
DELETE FROM gift_cards WHERE status = 'pending' AND created_at < NOW() - INTERVAL '24 hours'
```

### Gift card codes are masked in admin

Staff shouldn't casually see gift card codes. The admin list masks codes to show only the last 4 characters: `••••ABCD`. Full codes are visible on the redeem page (where they're needed) and in CSV exports (for backup purposes).

### Expired cards can still be redeemed

The system doesn't block redemption of expired cards. Instead, it shows a warning and asks for confirmation. The API accepts both `active` and `expired` status cards for redemption.

### CSV import field name must match

The multer upload middleware and the HTML form's `name` attribute must match. We use `name="csv"` on the form and `upload.single('csv')` in multer.

### Date format

All dates displayed as dd/mm/yyyy using `.toLocaleDateString('en-GB')`.

### Self vs Friend purchase handling

The `send_to` field (`'self'` or `'friend'`) drives all the conditional logic:
- Which emails are sent
- Whether a PDF is attached
- What the success/confirmation page says
- Whether recipient fields are required

### PDF requires the logo file path

The PDF generator loads the logo from disk. Update the path in `pdf.js` for the new brand. Also update colours, text, and layout to match the new brand.

---

## Adapting to Next.js

### Suggested mapping

| Express (current) | Next.js equivalent |
|---|---|
| `routes/public.js` GET endpoints | `app/gift-cards/page.tsx`, `app/gift-cards/success/page.tsx` |
| `server.js` POST `/gift-cards/checkout` | `app/api/gift-cards/checkout/route.ts` |
| `server.js` GET `/gift-cards/status` | `app/api/gift-cards/status/route.ts` |
| `server.js` POST `/webhook/stripe` | `app/api/webhook/stripe/route.ts` (disable body parsing!) |
| `routes/api.js` redeem/import/export | `app/api/gift-cards/[code]/redeem/route.ts`, etc. |
| `services/stripe.js` | `lib/stripe.ts` (same logic, adapt db calls) |
| `services/email.js` | `lib/email.ts` (consider React Email for templates) |
| `services/pdf.js` | `lib/pdf.ts` (PDFKit works in Node.js API routes) |
| `views/*.ejs` | React components with Tailwind or CSS Modules |
| Admin pages | Protected routes under `/admin/*` with middleware auth |

### Database

Use Prisma, Drizzle, or raw `pg` queries. The schema above works as-is with any PostgreSQL approach.

### Email templates

Consider using [React Email](https://react.email) for the HTML email templates instead of string concatenation — it's a better fit for Next.js projects.

### Stripe Embedded Checkout in React

```tsx
import { loadStripe } from '@stripe/stripe-js';

const stripe = await loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY);
const checkout = await stripe.initEmbeddedCheckout({
  clientSecret,
  onComplete: handlePaymentComplete
});
checkout.mount('#stripe-checkout');
```

---

## File Reference

```
source-files/
├── db/
│   └── database.js          # PostgreSQL setup, schema, helper methods
├── services/
│   ├── stripe.js             # Checkout session creation, webhook handler
│   ├── email.js              # Resend email sending (gift card + receipt)
│   └── pdf.js                # PDFKit A4 printable gift card
├── routes/
│   └── api.js                # Admin API: redeem, import, export, resend
├── views/
│   ├── gift-cards.ejs        # Purchase page with Stripe overlay
│   ├── gift-cards-success.ejs  # Fallback success page
│   ├── admin-gift-cards.ejs  # Admin list with masked codes
│   ├── admin-redeem.ejs      # Redeem page with expired warning
│   └── admin-import.ejs      # Import/export page
├── server.js                 # Checkout route, webhook, status polling, cleanup
└── package.json              # Dependencies
```
