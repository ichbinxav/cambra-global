import { createClientFromRequest } from 'npm:@base44/sdk@0.8.26';
import { jsPDF } from 'npm:jspdf@4.0.0';

function pad(n, w = 5) { return String(n).padStart(w, '0'); }

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const body = await req.json();
    const { invoice_id, expires_in = 3600 } = body || {};
    if (!invoice_id) return Response.json({ error: 'invoice_id is required' }, { status: 400 });

    const invRows = await base44.asServiceRole.entities.Invoice.filter({ id: invoice_id }, '-created_date', 1);
    const inv = invRows?.[0];
    if (!inv) return Response.json({ error: 'Invoice not found' }, { status: 404 });

    const report = inv.monthly_savings_report_id ? (await base44.asServiceRole.entities.MonthlySavingsReport.filter({ id: inv.monthly_savings_report_id }, '-created_date', 1))?.[0] : null;

    // Build a simple PDF
    const doc = new jsPDF();
    const now = new Date();

    const number = inv.invoice_number || `${inv.series || `INV-${now.getFullYear()}`}-${pad(inv.sequence || 1)}`;

    doc.setFontSize(18);
    doc.text('INVOICE', 20, 20);

    doc.setFontSize(10);
    doc.text(`Invoice No: ${number}`, 20, 30);
    doc.text(`Status: ${inv.status || 'draft'}`, 20, 36);
    doc.text(`Issued: ${inv.issued_at ? new Date(inv.issued_at).toLocaleString() : '-'}`, 20, 42);
    doc.text(`Due: ${inv.due_at ? new Date(inv.due_at).toLocaleString() : '-'}`, 20, 48);

    doc.text(`Brand: ${inv.brand_id || '-'}`, 120, 30);
    doc.text(`Provider: ${inv.provider_id || '-'}`, 120, 36);
    if (report?.month) doc.text(`Month: ${report.month}`, 120, 42);

    // Table header
    let y = 62;
    doc.setFontSize(12);
    doc.text('Description', 20, y);
    doc.text('Amount', 170, y, { align: 'right' });

    y += 8;
    doc.setFontSize(10);
    // REFERRAL-2 T4 (2026-08-03) — show the APPLIED PERCENTAGE, not just the
    // amount. With the referral programme a merchant may be billed at 20%, 15%,
    // 10% or 5%; an invoice that only prints the total makes that impossible to
    // check. Percentage + savings base come from billing_snapshot_json.
    const snap = inv.billing_snapshot_json || {};
    const feePct = Number(snap.fee_pct ?? NaN);
    const savingsBase = Number(snap.savings ?? report?.savings ?? NaN);
    const pctLabel = Number.isFinite(feePct) ? ` — ${feePct}% of verified savings` : '';
    const line = `Node fee for ${report?.month || inv.month || 'period'}${pctLabel}`;
    const amount = Number(inv.total_amount ?? inv.subtotal_amount ?? 0).toFixed(2);
    doc.text(line, 20, y);
    doc.text(`€${amount}`, 170, y, { align: 'right' });

    if (Number.isFinite(savingsBase) && Number.isFinite(feePct)) {
      y += 6;
      doc.setFontSize(9);
      doc.text(`Verified savings this period: €${savingsBase.toFixed(2)} · fee applied: ${feePct}%`, 20, y);
      if (Number(snap?.referral?.activated_count) > 0) {
        y += 5;
        doc.text(`Includes referral discount (${snap.referral.activated_count} activated referral(s))`, 20, y);
      }
      doc.setFontSize(10);
    }

    y += 10;
    doc.text('Subtotal', 140, y);
    doc.text(`€${Number(inv.subtotal_amount || 0).toFixed(2)}`, 170, y, { align: 'right' });

    y += 6;
    doc.text('Tax', 140, y);
    doc.text(`€${Number(inv.tax_amount || 0).toFixed(2)}`, 170, y, { align: 'right' });

    y += 6;
    doc.setFontSize(12);
    doc.text('Total', 140, y);
    doc.text(`€${Number(inv.total_amount || 0).toFixed(2)}`, 170, y, { align: 'right' });

    y += 12;
    doc.setFontSize(9);
    if (report) doc.text(`Report ID: ${report.id}`, 20, y);
    y += 5;
    doc.text(`Invoice ID: ${inv.id}`, 20, y);

    const pdfBytes = doc.output('arraybuffer');

    // Upload to private storage and return a signed URL
    // A bare Blob is rejected by the upload endpoint ("'file' field is an empty
    // object") because it carries no filename — it must be a named File.
    const filename = `invoice-${number.replace(/\s+/g, '-')}.pdf`;
    const file = new File([pdfBytes], filename, { type: 'application/pdf' });

    const upload = await base44.asServiceRole.integrations.Core.UploadPrivateFile({ file });
    const file_uri = upload?.file_uri;
    if (!file_uri) return Response.json({ error: 'Upload failed' }, { status: 500 });

    // Persist reference for future reuse
    await base44.asServiceRole.entities.Invoice.update(inv.id, { pdf_url: file_uri });

    const { signed_url } = await base44.asServiceRole.integrations.Core.CreateFileSignedUrl({ file_uri, expires_in });

    return Response.json({ url: signed_url, file_uri, invoice_id: inv.id });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});