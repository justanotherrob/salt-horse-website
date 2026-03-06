const { Resend } = require('resend');
const { generateGiftCardPDF } = require('./pdf');

// Gracefully handle missing API key — app can still start without Resend
const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

const fromEmail = process.env.RESEND_FROM_EMAIL || 'Salt Horse <hello@salthorse.beer>';

function emailHeader() {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:40px 20px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#182241;border-radius:8px;overflow:hidden;">
        <tr><td style="padding:30px 40px 20px;text-align:center;">
          <h1 style="color:#FFF6DA;font-size:18px;letter-spacing:4px;margin:0;">SALT HORSE</h1>
          <p style="color:#D4943A;font-size:11px;letter-spacing:2px;margin:5px 0 0;">CRAFT BEER &amp; BURGERS . EDINBURGH</p>
        </td></tr>
        <tr><td style="padding:0 60px;"><hr style="border:none;border-top:1px solid #D4943A;margin:0;"></td></tr>`;
}

function emailFooter() {
  return `
        <tr><td style="padding:20px 40px 30px;text-align:center;border-top:1px solid rgba(255,246,218,0.1);">
          <p style="color:#D4943A;font-size:11px;letter-spacing:1px;margin:0 0 5px;">57-61 Blackfriars St, Edinburgh EH1 1NB</p>
          <p style="color:rgba(255,246,218,0.4);font-size:11px;margin:0;">salthorse.beer</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ── Send gift card email (with code + PDF) to recipient ──
async function sendGiftCardEmail(giftCard, overrideEmail) {
  const pdf = await generateGiftCardPDF(giftCard);
  const amountStr = `£${(giftCard.initial_amount / 100).toFixed(0)}`;
  const expiryDate = giftCard.expires_at
    ? new Date(giftCard.expires_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
    : '12 months from purchase';

  const toEmail = overrideEmail || (giftCard.send_to === 'friend' ? giftCard.recipient_email : giftCard.purchaser_email);
  const toName = giftCard.send_to === 'friend' ? giftCard.recipient_name : giftCard.purchaser_name;

  const isFriend = giftCard.send_to === 'friend';
  const greeting = isFriend
    ? `${giftCard.purchaser_name} has sent you a ${amountStr} gift card to Salt Horse!`
    : `Here's your ${amountStr} Salt Horse gift card!`;

  const html = emailHeader() + `
        <tr><td style="padding:30px 40px;">
          <p style="color:#FFF6DA;font-size:15px;line-height:1.6;margin:0 0 15px;">Hi${toName ? ' ' + toName : ''},</p>
          <p style="color:#FFF6DA;font-size:15px;line-height:1.6;margin:0 0 25px;">${greeting}</p>

          <table width="100%" cellpadding="0" cellspacing="0" style="background:rgba(255,246,218,0.08);border:1px solid rgba(255,246,218,0.15);border-radius:6px;margin-bottom:25px;">
            <tr><td style="padding:25px;text-align:center;">
              <p style="color:#D4943A;font-size:36px;font-weight:bold;margin:0 0 8px;">${amountStr}</p>
              <p style="color:#FFF6DA;font-size:20px;font-family:monospace;letter-spacing:3px;margin:0 0 12px;">${giftCard.code}</p>
              <p style="color:rgba(255,246,218,0.6);font-size:12px;margin:0;">Valid until ${expiryDate}</p>
            </td></tr>
          </table>

          <p style="color:rgba(255,246,218,0.6);font-size:13px;line-height:1.6;margin:0 0 10px;">
            Present this code when you visit Salt Horse to redeem your gift card. It can be used for anything we serve or sell.
          </p>
          <p style="color:rgba(255,246,218,0.6);font-size:13px;line-height:1.6;margin:0;">
            Your gift card PDF is attached to this email for easy printing.
          </p>
        </td></tr>` + emailFooter();

  if (!resend) {
    console.warn('RESEND_API_KEY not set — skipping gift card email to', toEmail);
    return { skipped: true };
  }

  const result = await resend.emails.send({
    from: fromEmail,
    to: [toEmail],
    subject: `Your ${amountStr} Salt Horse Gift Card`,
    html: html,
    attachments: [{
      filename: `SaltHorse-GiftCard-${giftCard.code}.pdf`,
      content: pdf.toString('base64'),
      contentType: 'application/pdf',
    }],
  });

  console.log(`Gift card email sent to ${toEmail}:`, result);
  return result;
}

// ── Send purchase receipt to the buyer ──
async function sendPurchaserReceipt(giftCard, overrideEmail) {
  const amountStr = `£${(giftCard.initial_amount / 100).toFixed(0)}`;
  const toEmail = overrideEmail || giftCard.purchaser_email;
  const toName = giftCard.purchaser_name;
  const purchaseDate = giftCard.purchased_at
    ? new Date(giftCard.purchased_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
    : new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  const expiryDate = giftCard.expires_at
    ? new Date(giftCard.expires_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
    : '12 months from purchase';

  const isFriend = giftCard.send_to === 'friend';
  const recipientLine = isFriend
    ? `<p style="color:#FFF6DA;font-size:15px;line-height:1.6;margin:0 0 25px;">A ${amountStr} gift card has been sent to <strong>${giftCard.recipient_name}</strong> at <strong>${giftCard.recipient_email}</strong>.</p>`
    : `<p style="color:#FFF6DA;font-size:15px;line-height:1.6;margin:0 0 25px;">Your ${amountStr} gift card is ready. Check your inbox for the gift card email with your code and PDF.</p>`;

  const html = emailHeader() + `
        <tr><td style="padding:30px 40px;">
          <p style="color:#FFF6DA;font-size:15px;line-height:1.6;margin:0 0 15px;">Hi${toName ? ' ' + toName : ''},</p>
          <p style="color:#FFF6DA;font-size:15px;line-height:1.6;margin:0 0 10px;">Thanks for your purchase!</p>
          ${recipientLine}

          <table width="100%" cellpadding="0" cellspacing="0" style="background:rgba(255,246,218,0.08);border:1px solid rgba(255,246,218,0.15);border-radius:6px;margin-bottom:25px;">
            <tr><td style="padding:20px 25px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="color:rgba(255,246,218,0.6);font-size:13px;padding:6px 0;">Gift Card</td>
                  <td style="color:#FFF6DA;font-size:13px;padding:6px 0;text-align:right;">Salt Horse Gift Card</td>
                </tr>
                <tr>
                  <td style="color:rgba(255,246,218,0.6);font-size:13px;padding:6px 0;">Amount</td>
                  <td style="color:#D4943A;font-size:13px;font-weight:bold;padding:6px 0;text-align:right;">${amountStr}</td>
                </tr>
                <tr>
                  <td style="color:rgba(255,246,218,0.6);font-size:13px;padding:6px 0;">Code</td>
                  <td style="color:#FFF6DA;font-size:13px;font-family:monospace;letter-spacing:2px;padding:6px 0;text-align:right;">${giftCard.code}</td>
                </tr>
                <tr>
                  <td style="color:rgba(255,246,218,0.6);font-size:13px;padding:6px 0;">Date</td>
                  <td style="color:#FFF6DA;font-size:13px;padding:6px 0;text-align:right;">${purchaseDate}</td>
                </tr>
                <tr>
                  <td style="color:rgba(255,246,218,0.6);font-size:13px;padding:6px 0;">Valid Until</td>
                  <td style="color:#FFF6DA;font-size:13px;padding:6px 0;text-align:right;">${expiryDate}</td>
                </tr>
              </table>
            </td></tr>
          </table>

          <p style="color:rgba(255,246,218,0.6);font-size:13px;line-height:1.6;margin:0;">
            This is your purchase receipt. If you have any questions, pop in or email us at hello@salthorse.beer.
          </p>
        </td></tr>` + emailFooter();

  if (!resend) {
    console.warn('RESEND_API_KEY not set — skipping receipt email to', toEmail);
    return { skipped: true };
  }

  const result = await resend.emails.send({
    from: fromEmail,
    to: [toEmail],
    subject: `Your Salt Horse Gift Card Receipt - ${amountStr}`,
    html: html,
  });

  console.log(`Purchase receipt sent to ${toEmail}:`, result);
  return result;
}

module.exports = { sendGiftCardEmail, sendPurchaserReceipt };
