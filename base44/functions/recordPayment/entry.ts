// recordPayment — registers a payment against an Invoice.
//
// SECURITY-2 (2026-07-24):
//   · Canonical trust gate (admin OR INTERNAL_CALL_SECRET). The previous
//     inverted pattern `if (user && user.role !== 'admin')` let ANONYMOUS
//     callers credit arbitrary amounts to any invoice.
//   · amount validated: finite number, > 0, ≤ MAX_PAYMENT_EUR.
//   · currency (when provided) must match the invoice currency.
//   · IDEMPOTENCY: when processor + processor_ref are present, an existing
//     PaymentEvent with that pair short-circuits — the invoice is NOT
//     re-credited and the previous state is returned. Manual payments
//     without a ref (method 'manual', admin-triggered from AdminInvoices)
//     cannot be deduplicated automatically — documented criterion: the
//     admin UI is the safeguard for those.
//   · STATE MACHINE: payments are only accepted from 'issued' /
//     'partially_paid' / 'due' / 'overdue'. A 'paid' invoice is never
//     modified again by this endpoint (refunds are an explicit separate
//     event, out of scope here).
import { createClientFromRequest } from "npm:@base44/sdk@0.8.41";
import { requireAdminOrInternal } from "../../shared/internalGate.ts";
import { internalErrorResponse } from "../../shared/publicErrors.ts";

const MAX_PAYMENT_EUR = 1_000_000;

function computeStatus(total, paid) {
  if (paid <= 0) return "due";
  if (paid > 0 && paid < total) return "partially_paid";
  return "paid";
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));

    const gate = await requireAdminOrInternal(req, base44, body);
    if (!gate.ok) return gate.response;

    const {
      invoice_id,
      amount,
      currency = null,
      processor = null,
      processor_ref = null,
      received_at = null,
      method = "manual",
      note = null,
    } = body || {};
    if (!invoice_id) {
      return Response.json({ error: "invoice_id is required" }, {
        status: 400,
      });
    }

    // ── Financial validation ──
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      return Response.json({
        error: "amount must be a finite number greater than 0",
      }, { status: 400 });
    }
    if (amt > MAX_PAYMENT_EUR) {
      return Response.json({
        error: `amount exceeds the maximum accepted (${MAX_PAYMENT_EUR})`,
      }, { status: 400 });
    }

    const rows = await base44.asServiceRole.entities.Invoice.filter(
      { id: invoice_id },
      "-created_date",
      2,
    );
    if (!Array.isArray(rows)) throw new Error("invoice_authority_unavailable");
    if (rows.length === 0) {
      return Response.json({ error: "Invoice not found" }, { status: 404 });
    }
    if (rows.length !== 1) {
      return Response.json({
        error: "invoice_authority_ambiguous",
        effects: false,
      }, { status: 409 });
    }
    const inv = rows[0];

    // P6 — Recover invoices whose processor is Stripe have ONE payment truth:
    // Stripe. Manual/local credits would race webhooks and could manufacture a
    // paid state without processor evidence. Use Stripe + reconciliation only.
    if (
      inv.monthly_savings_report_id ||
      String(inv.payment_provider || "").toLowerCase() === "stripe" ||
      inv.stripe_invoice_id
    ) {
      return Response.json({
        error: "recover_stripe_invoice_is_processor_authoritative",
        use: "reconcileRecoverBilling",
      }, { status: 409 });
    }

    if (
      currency && inv.currency &&
      String(currency).toUpperCase() !== String(inv.currency).toUpperCase()
    ) {
      return Response.json({
        error: `currency mismatch: invoice is ${inv.currency}`,
      }, { status: 400 });
    }

    // 'paid' is terminal for this endpoint — a paid invoice is never re-credited.
    const blockedStatuses = ["draft", "void", "refunded", "failed", "paid"];
    if (blockedStatuses.includes(inv.status)) {
      return Response.json({
        error: `Payments not allowed from status ${inv.status}`,
      }, { status: 400 });
    }

    // ── Idempotency (processor + processor_ref) ──
    if (processor && processor_ref) {
      const dup = await base44.asServiceRole.entities.PaymentEvent.filter(
        { processor, processor_ref, invoice_id: inv.id },
        "-created_date",
        1,
      );
      if (dup?.length) {
        return Response.json({
          invoice: inv,
          idempotent: true,
          existing_event_id: dup[0].id,
        });
      }
    }

    const total = Number(inv.total_amount || 0);
    const newPaid = Math.round(
      ((Number(inv.amount_paid || 0) + amt) + Number.EPSILON) * 100,
    ) / 100;
    const newBalance = Math.max(
      0,
      Math.round(((total - newPaid) + Number.EPSILON) * 100) / 100,
    );
    const newStatus = computeStatus(total, newPaid);

    const updated = await base44.asServiceRole.entities.Invoice.update(inv.id, {
      amount_paid: newPaid,
      balance_due: newBalance,
      status: newStatus,
      paid_at: newStatus === "paid"
        ? (received_at || new Date().toISOString())
        : inv.paid_at || null,
      billing_snapshot_json: {
        ...(inv.billing_snapshot_json || {}),
        last_payment_method: method,
      },
    });

    await base44.asServiceRole.entities.PaymentEvent.create({
      invoice_id: inv.id,
      brand_id: inv.brand_id || null,
      amount: amt,
      currency: inv.currency || "EUR",
      event_type: newStatus === "paid"
        ? "payment_succeeded"
        : "payment_partially_succeeded",
      processor: processor,
      processor_ref: processor_ref,
      occurred_at: received_at || new Date().toISOString(),
      metadata_json: {
        method,
        note,
        recorded_by: gate.user?.email || "internal",
      },
    });

    if (inv.monthly_savings_report_id) {
      const target = newStatus === "paid" ? "paid" : "invoiced";
      await base44.asServiceRole.entities.MonthlySavingsReport.update(
        inv.monthly_savings_report_id,
        { status: target },
      );
    }

    return Response.json({ invoice: updated });
  } catch (error) {
    return internalErrorResponse(error, "recordPayment");
  }
});
