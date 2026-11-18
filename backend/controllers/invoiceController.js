/**
 * SATINOSTITCH — Admin Individual Invoice Controller
 * Keeps single-order invoice generation & PDF download cleanly separate
 * from sales reports, statements, and analytics exports.
 */
const invoiceService = require('../services/invoiceService');

async function getOrderInvoiceData(req, res) {
  const orderId = String(req.params.id || '').trim();
  if (!orderId) {
    return res.status(400).json({ error: 'Order ID is required.' });
  }

  try {
    const invoice = await invoiceService.getInvoiceDataForOrder(orderId);
    if (!invoice) {
      return res.status(404).json({ error: `Order #${orderId} not found.` });
    }
    return res.json(invoice);
  } catch (err) {
    console.error('[Invoice Data Error]:', err);
    return res.status(500).json({ error: 'Failed to prepare invoice data.' });
  }
}

async function downloadOrderInvoicePdf(req, res) {
  const orderId = String(req.params.id || '').trim();
  if (!orderId) {
    return res.status(400).json({ error: 'Order ID is required.' });
  }

  try {
    const invoice = await invoiceService.getInvoiceDataForOrder(orderId);
    if (!invoice) {
      return res.status(404).json({ error: `Order #${orderId} not found.` });
    }

    const pdfBuffer = await invoiceService.generateInvoicePdfBuffer(invoice);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${invoice.filename}"`);
    res.setHeader('Content-Length', String(pdfBuffer.length));
    res.setHeader('X-Invoice-Number', invoice.invoiceNumber);
    res.setHeader('X-Order-Id', invoice.orderId);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition, X-Invoice-Number, X-Order-Id');

    return res.status(200).send(pdfBuffer);
  } catch (err) {
    console.error('[Invoice PDF Generation Error]:', err);
    return res.status(500).json({ error: 'Failed to generate invoice PDF.' });
  }
}

module.exports = {
  getOrderInvoiceData,
  downloadOrderInvoicePdf
};
