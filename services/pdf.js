const PDFDocument = require('pdfkit');
const path = require('path');
const fs = require('fs');

function generateGiftCardPDF(giftCard) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: [600, 340],
        margins: { top: 40, bottom: 40, left: 50, right: 50 },
      });

      const chunks = [];
      doc.on('data', chunk => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const navy = '#182241';
      const cream = '#FFF6DA';
      const amber = '#D4943A';

      // Background
      doc.rect(0, 0, 600, 340).fill(navy);

      // Decorative border
      doc.rect(15, 15, 570, 310).lineWidth(1).stroke(amber);

      // Header
      doc.fontSize(10).fill(amber).font('Helvetica');
      doc.text('SALT HORSE', 50, 35, { align: 'center', width: 500 });

      doc.fontSize(7).fill(cream).font('Helvetica');
      doc.text('CRAFT BEER & BURGERS — EDINBURGH', 50, 50, { align: 'center', width: 500 });

      // Divider
      doc.moveTo(200, 68).lineTo(400, 68).lineWidth(0.5).stroke(amber);

      // Gift Card label
      doc.fontSize(22).fill(cream).font('Helvetica-Bold');
      doc.text('GIFT CARD', 50, 80, { align: 'center', width: 500 });

      // Amount
      const amountStr = `£${(giftCard.initial_amount / 100).toFixed(0)}`;
      doc.fontSize(56).fill(amber).font('Helvetica-Bold');
      doc.text(amountStr, 50, 115, { align: 'center', width: 500 });

      // Code
      doc.fontSize(20).fill(cream).font('Courier-Bold');
      doc.text(giftCard.code, 50, 190, { align: 'center', width: 500, characterSpacing: 3 });

      // Divider
      doc.moveTo(200, 225).lineTo(400, 225).lineWidth(0.5).stroke(amber);

      // Details
      doc.fontSize(8).fill(cream).font('Helvetica');

      if (giftCard.recipient_name && giftCard.send_to === 'friend') {
        doc.text(`For: ${giftCard.recipient_name}`, 50, 240, { align: 'center', width: 500 });
      }

      const expiryDate = giftCard.expires_at
        ? new Date(giftCard.expires_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
        : '12 months from purchase';
      doc.text(`Valid until ${expiryDate}`, 50, 255, { align: 'center', width: 500 });

      // Footer
      doc.fontSize(7).fill(amber).font('Helvetica');
      doc.text('Redeem in person at Salt Horse', 50, 280, { align: 'center', width: 500 });
      doc.text('57-61 Blackfriars St, Edinburgh EH1 1NB', 50, 292, { align: 'center', width: 500 });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = { generateGiftCardPDF };
