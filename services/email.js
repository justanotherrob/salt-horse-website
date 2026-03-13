const { Resend } = require('resend');
const { generateGiftCardPDF } = require('./pdf');

// Gracefully handle missing API key — app can still start without Resend
const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

const fromEmail = process.env.RESEND_FROM_EMAIL || 'Salt Horse <salthorsebeerbar@gmail.com>';

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

// ── Send gift card email ──
// For "self": includes printable PDF attachment, copy about printing
// For "friend": no PDF, includes personal message, copy about redeeming
async function sendGiftCardEmail(giftCard, overrideEmail) {
  const amountStr = `\u00A3${(giftCard.initial_amount / 100).toFixed(0)}`;
  const expiryDate = giftCard.expires_at
    ? new Date(giftCard.expires_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
    : '12 months from purchase';

  const toEmail = overrideEmail || (giftCard.send_to === 'friend' ? giftCard.recipient_email : giftCard.purchaser_email);
  const toName = giftCard.send_to === 'friend' ? giftCard.recipient_name : giftCard.purchaser_name;
  const isFriend = giftCard.send_to === 'friend';

  let subject, greeting, closingText;

  if (isFriend) {
    subject = `You've received a ${amountStr} Salt Horse gift card!`;
    greeting = `${giftCard.purchaser_name} has sent you a ${amountStr} gift card to Salt Horse!`;
    closingText = 'Present this code when you visit Salt Horse to redeem your gift card. It can be used for anything we serve or sell.';
  } else {
    subject = `Your ${amountStr} Salt Horse Gift Card`;
    greeting = `Here's your ${amountStr} Salt Horse gift card. We've attached a version you can print and give in person.`;
    closingText = 'Present this card when you visit Salt Horse. It can be used for anything we serve or sell.';
  }

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

          ${isFriend && giftCard.personal_message ? `
          <table width="100%" cellpadding="0" cellspacing="0" style="background:rgba(212,148,58,0.08);border-left:3px solid #D4943A;border-radius:0 4px 4px 0;margin-bottom:20px;">
            <tr><td style="padding:15px 20px;">
              <p style="color:rgba(255,246,218,0.5);font-size:11px;text-transform:uppercase;letter-spacing:1px;margin:0 0 6px;">Personal Message</p>
              <p style="color:#FFF6DA;font-size:14px;font-style:italic;line-height:1.5;margin:0;">"${giftCard.personal_message}"</p>
            </td></tr>
          </table>` : ''}

          <p style="color:rgba(255,246,218,0.6);font-size:13px;line-height:1.6;margin:0;">
            ${closingText}
          </p>
        </td></tr>` + emailFooter();

  if (!resend) {
    console.warn('RESEND_API_KEY not set — skipping gift card email to', toEmail);
    return { skipped: true };
  }

  // Only attach PDF for self-purchase (printable gift card)
  const emailOptions = {
    from: fromEmail,
    to: [toEmail],
    subject: subject,
    html: html,
  };

  if (!isFriend) {
    const pdf = await generateGiftCardPDF(giftCard);
    emailOptions.attachments = [{
      filename: `SaltHorse-GiftCard-${giftCard.code}.pdf`,
      content: pdf.toString('base64'),
      contentType: 'application/pdf',
    }];
  }

  const result = await resend.emails.send(emailOptions);
  console.log(`Gift card email sent to ${toEmail}:`, result);
  return result;
}

// ── Send purchase receipt to the buyer (friend gifts only) ──
async function sendPurchaserReceipt(giftCard, overrideEmail) {
  const amountStr = `\u00A3${(giftCard.initial_amount / 100).toFixed(0)}`;
  const toEmail = overrideEmail || giftCard.purchaser_email;
  const toName = giftCard.purchaser_name;
  const purchaseDate = giftCard.purchased_at
    ? new Date(giftCard.purchased_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
    : new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  const expiryDate = giftCard.expires_at
    ? new Date(giftCard.expires_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
    : '12 months from purchase';

  const html = emailHeader() + `
        <tr><td style="padding:30px 40px;">
          <p style="color:#FFF6DA;font-size:15px;line-height:1.6;margin:0 0 15px;">Hi${toName ? ' ' + toName : ''},</p>
          <p style="color:#FFF6DA;font-size:15px;line-height:1.6;margin:0 0 10px;">Thanks for your purchase!</p>
          <p style="color:#FFF6DA;font-size:15px;line-height:1.6;margin:0 0 25px;">We've sent a ${amountStr} gift card to <strong>${giftCard.recipient_name}</strong> at <strong>${giftCard.recipient_email}</strong>.</p>

          <table width="100%" cellpadding="0" cellspacing="0" style="background:rgba(255,246,218,0.08);border:1px solid rgba(255,246,218,0.15);border-radius:6px;margin-bottom:25px;">
            <tr><td style="padding:20px 25px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="color:rgba(255,246,218,0.6);font-size:13px;padding:6px 0;">Amount</td>
                  <td style="color:#D4943A;font-size:13px;font-weight:bold;padding:6px 0;text-align:right;">${amountStr}</td>
                </tr>
                <tr>
                  <td style="color:rgba(255,246,218,0.6);font-size:13px;padding:6px 0;">Sent to</td>
                  <td style="color:#FFF6DA;font-size:13px;padding:6px 0;text-align:right;">${giftCard.recipient_name}</td>
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
            This is your purchase receipt. If you have any questions, pop in or email us at salthorsebeerbar@gmail.com.
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

// ── Send group booking enquiry to the bar ──
async function sendGroupEnquiry(data) {
  const { name, email, phone, date, time, groupSize, type, comments } = data;
  const typeLabel = type === 'food_and_drinks' ? 'Food & Drinks' : 'Drinks Only';

  // Format date nicely
  const dateObj = new Date(date + 'T00:00:00');
  const formattedDate = dateObj.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  // Email to the bar
  const barHtml = emailHeader() + `
        <tr><td style="padding:30px 40px;">
          <p style="color:#D4943A;font-size:13px;letter-spacing:2px;text-transform:uppercase;margin:0 0 20px;">New Group Enquiry</p>

          <table width="100%" cellpadding="0" cellspacing="0" style="background:rgba(255,246,218,0.08);border:1px solid rgba(255,246,218,0.15);border-radius:6px;margin-bottom:25px;">
            <tr><td style="padding:20px 25px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="color:rgba(255,246,218,0.6);font-size:13px;padding:8px 0;">Name</td>
                  <td style="color:#FFF6DA;font-size:13px;padding:8px 0;text-align:right;font-weight:bold;">${name}</td>
                </tr>
                <tr>
                  <td style="color:rgba(255,246,218,0.6);font-size:13px;padding:8px 0;">Email</td>
                  <td style="color:#FFF6DA;font-size:13px;padding:8px 0;text-align:right;">${email}</td>
                </tr>
                <tr>
                  <td style="color:rgba(255,246,218,0.6);font-size:13px;padding:8px 0;">Phone</td>
                  <td style="color:#FFF6DA;font-size:13px;padding:8px 0;text-align:right;">${phone}</td>
                </tr>
                <tr>
                  <td style="color:rgba(255,246,218,0.6);font-size:13px;padding:8px 0;border-top:1px solid rgba(255,246,218,0.1);">Date</td>
                  <td style="color:#D4943A;font-size:13px;padding:8px 0;text-align:right;font-weight:bold;border-top:1px solid rgba(255,246,218,0.1);">${formattedDate}</td>
                </tr>
                <tr>
                  <td style="color:rgba(255,246,218,0.6);font-size:13px;padding:8px 0;">Time</td>
                  <td style="color:#D4943A;font-size:13px;padding:8px 0;text-align:right;font-weight:bold;">${time}</td>
                </tr>
                <tr>
                  <td style="color:rgba(255,246,218,0.6);font-size:13px;padding:8px 0;">Group Size</td>
                  <td style="color:#D4943A;font-size:13px;padding:8px 0;text-align:right;font-weight:bold;">${groupSize} people</td>
                </tr>
                <tr>
                  <td style="color:rgba(255,246,218,0.6);font-size:13px;padding:8px 0;">Type</td>
                  <td style="color:#FFF6DA;font-size:13px;padding:8px 0;text-align:right;">${typeLabel}</td>
                </tr>
              </table>
            </td></tr>
          </table>

          ${comments ? `
          <table width="100%" cellpadding="0" cellspacing="0" style="background:rgba(212,148,58,0.08);border-left:3px solid #D4943A;border-radius:0 4px 4px 0;margin-bottom:20px;">
            <tr><td style="padding:15px 20px;">
              <p style="color:rgba(255,246,218,0.5);font-size:11px;text-transform:uppercase;letter-spacing:1px;margin:0 0 6px;">Notes</p>
              <p style="color:#FFF6DA;font-size:14px;line-height:1.5;margin:0;">${comments}</p>
            </td></tr>
          </table>` : ''}

          <p style="color:rgba(255,246,218,0.6);font-size:13px;line-height:1.6;margin:0;">
            Reply to this email to respond directly to ${name}.
          </p>
        </td></tr>` + emailFooter();

  // Confirmation email to the customer
  const customerHtml = emailHeader() + `
        <tr><td style="padding:30px 40px;">
          <p style="color:#FFF6DA;font-size:15px;line-height:1.6;margin:0 0 15px;">Hi ${name},</p>
          <p style="color:#FFF6DA;font-size:15px;line-height:1.6;margin:0 0 25px;">Thanks for getting in touch about a group booking. We've got your details and we'll be in touch soon to confirm everything.</p>

          <table width="100%" cellpadding="0" cellspacing="0" style="background:rgba(255,246,218,0.08);border:1px solid rgba(255,246,218,0.15);border-radius:6px;margin-bottom:25px;">
            <tr><td style="padding:20px 25px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="color:rgba(255,246,218,0.6);font-size:13px;padding:6px 0;">Date</td>
                  <td style="color:#FFF6DA;font-size:13px;padding:6px 0;text-align:right;">${formattedDate}</td>
                </tr>
                <tr>
                  <td style="color:rgba(255,246,218,0.6);font-size:13px;padding:6px 0;">Time</td>
                  <td style="color:#FFF6DA;font-size:13px;padding:6px 0;text-align:right;">${time}</td>
                </tr>
                <tr>
                  <td style="color:rgba(255,246,218,0.6);font-size:13px;padding:6px 0;">Group Size</td>
                  <td style="color:#FFF6DA;font-size:13px;padding:6px 0;text-align:right;">${groupSize} people</td>
                </tr>
                <tr>
                  <td style="color:rgba(255,246,218,0.6);font-size:13px;padding:6px 0;">Type</td>
                  <td style="color:#FFF6DA;font-size:13px;padding:6px 0;text-align:right;">${typeLabel}</td>
                </tr>
              </table>
            </td></tr>
          </table>

          <p style="color:rgba(255,246,218,0.6);font-size:13px;line-height:1.6;margin:0;">
            If you have any questions, just reply to this email or give us a call on +44 7400 653295.
          </p>
        </td></tr>` + emailFooter();

  if (!resend) {
    console.warn('RESEND_API_KEY not set — skipping group enquiry emails');
    return { skipped: true };
  }

  // Send to bar (reply-to set to customer)
  const barResult = await resend.emails.send({
    from: fromEmail,
    to: ['salthorsebeerbar@gmail.com'],
    replyTo: email,
    subject: `Group Enquiry: ${groupSize} people — ${formattedDate}`,
    html: barHtml,
  });
  console.log('Group enquiry email sent to bar:', barResult);

  // Send confirmation to customer
  const customerResult = await resend.emails.send({
    from: fromEmail,
    to: [email],
    subject: 'We got your group booking enquiry — Salt Horse',
    html: customerHtml,
  });
  console.log('Group enquiry confirmation sent to', email, ':', customerResult);

  return { barResult, customerResult };
}

module.exports = { sendGiftCardEmail, sendPurchaserReceipt, sendGroupEnquiry };
