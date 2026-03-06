const PDFDocument = require('pdfkit');
const path = require('path');
const fs = require('fs');

function generateGiftCardPDF(giftCard) {
  return new Promise((resolve, reject) => {
    try {
      const hasMessage = giftCard.personal_message && giftCard.send_to === 'friend';
      const pageHeight = hasMessage ? 420 : 340;

      const doc = new PDFDocument({
        size: [600, pageHeight],
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
      doc.rect(0, 0, 600, pageHeight).fill(navy);

      // Decorative border
      doc.rect(15, 15, 570, pageHeight - 30).lineWidth(1).stroke(amber);

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
      let detailY = 235;
      doc.fontSize(8).fill(cream).font('Helvetica');

      if (giftCard.recipient_name && giftCard.send_to === 'friend') {
        doc.text(`For: ${giftCard.recipient_name}`, 50, detailY, { align: 'center', width: 500 });
        detailY += 15;
      }

      const expiryDate = giftCard.expires_at
        ? new Date(giftCard.expires_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
        : '12 months from purchase';
      doc.text(`Valid until ${expiryDate}`, 50, detailY, { align: 'center', width: 500 });
      detailY += 20;

      // Personal message
      if (hasMessage) {
        doc.moveTo(150, detailY).lineTo(450, detailY).lineWidth(0.5).stroke(amber);
        detailY += 12;
        doc.fontSize(9).fill(cream).font('Helvetica-Oblique');
        doc.text(`"${giftCard.personal_message}"`, 60, detailY, {
          align: 'center',
          width: 480,
          lineGap: 3
        });
        detailY += doc.heightOfString(`"${giftCard.personal_message}"`, { width: 480, lineGap: 3 }) + 15;
      }

      // Footer
      doc.fontSize(7).fill(amber).font('Helvetica');
      const footerY = hasMessage ? pageHeight - 45 : 280;
      doc.text('Redeem in person at Salt Horse', 50, footerY, { align: 'center', width: 500 });
      doc.text('57-61 Blackfriars St, Edinburgh EH1 1NB', 50, footerY + 12, { align: 'center', width: 500 });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = { generateGiftCardPDF };
