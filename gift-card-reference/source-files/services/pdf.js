const PDFDocument = require('pdfkit');

function generateGiftCardPDF(giftCard) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margins: { top: 60, bottom: 60, left: 60, right: 60 },
      });

      const chunks = [];
      doc.on('data', chunk => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const navy = '#182241';
      const amber = '#D4943A';
      const grey = '#666666';
      const pageWidth = 595.28;
      const contentWidth = pageWidth - 120; // 60px margins each side

      // ── Header ──
      doc.fontSize(14).fill(navy).font('Helvetica-Bold');
      doc.text('SALT HORSE', 60, 60, { align: 'center', width: contentWidth });

      doc.fontSize(9).fill(grey).font('Helvetica');
      doc.text('CRAFT BEER & BURGERS — EDINBURGH', 60, 80, { align: 'center', width: contentWidth });

      // Amber divider
      doc.moveTo(180, 105).lineTo(pageWidth - 180, 105).lineWidth(1).stroke(amber);

      // ── Gift Card Box ──
      const boxTop = 140;
      const boxHeight = 320;

      // Light border box
      doc.roundedRect(80, boxTop, pageWidth - 160, boxHeight, 4)
        .lineWidth(1.5)
        .stroke(amber);

      // "GIFT CARD" label
      doc.fontSize(12).fill(amber).font('Helvetica');
      doc.text('GIFT CARD', 60, boxTop + 30, { align: 'center', width: contentWidth });

      // Amount — big and bold
      const amountStr = '\u00A3' + (giftCard.initial_amount / 100).toFixed(0);
      doc.fontSize(72).fill(navy).font('Helvetica-Bold');
      doc.text(amountStr, 60, boxTop + 55, { align: 'center', width: contentWidth });

      // Divider inside box
      doc.moveTo(160, boxTop + 150).lineTo(pageWidth - 160, boxTop + 150).lineWidth(0.5).stroke(amber);

      // Code — prominent
      doc.fontSize(28).fill(navy).font('Courier-Bold');
      doc.text(giftCard.code, 60, boxTop + 170, { align: 'center', width: contentWidth, characterSpacing: 4 });

      // Divider
      doc.moveTo(160, boxTop + 215).lineTo(pageWidth - 160, boxTop + 215).lineWidth(0.5).stroke(amber);

      // Expiry
      const expiryDate = giftCard.expires_at
        ? new Date(giftCard.expires_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
        : '12 months from purchase';

      doc.fontSize(10).fill(grey).font('Helvetica');
      doc.text('Valid until ' + expiryDate, 60, boxTop + 230, { align: 'center', width: contentWidth });

      // ── Footer ──
      const footerY = boxTop + boxHeight + 40;

      doc.fontSize(11).fill(navy).font('Helvetica-Bold');
      doc.text('Redeem in person at Salt Horse', 60, footerY, { align: 'center', width: contentWidth });

      doc.fontSize(9).fill(grey).font('Helvetica');
      doc.text('57-61 Blackfriars St, Edinburgh EH1 1NB', 60, footerY + 18, { align: 'center', width: contentWidth });
      doc.text('salthorse.beer', 60, footerY + 33, { align: 'center', width: contentWidth });

      // Small note at bottom
      doc.fontSize(8).fill('#999999').font('Helvetica');
      doc.text('Present this card when you visit. Can be used for anything we serve or sell.', 60, footerY + 60, { align: 'center', width: contentWidth });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = { generateGiftCardPDF };
