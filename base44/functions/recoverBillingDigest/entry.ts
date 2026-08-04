// recoverBillingDigest — RECOVER-4 (2026-08-04).
//
// Weekly reminder, NOT an invoicing job. It never approves a report and never
// creates an invoice: both remain deliberate human acts (§9, §31). It only
// looks at what is waiting and emails the admin a list, so a verified month
// never sits unnoticed and a first invoice is never issued late by accident.
//
// Callable by an admin, by the internal secret, or by the weekly scheduler
// (which carries no user session). Because the last case cannot be
// authenticated, the endpoint is deliberately harmless: it accepts no
// parameters, returns only counts, and can only ever send to the ONE address
// configured in the environment — plus a 6-hour send window, so an anonymous
// caller cannot use it to flood that inbox.
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

const SEND_WINDOW_MS = 6 * 60 * 60 * 1000;

const eur = (n) => `€${(Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const svc = base44.asServiceRole;

    const last = await svc.entities.OperationalLog.filter(
      { event_type: 'status_changed', message: 'recover_billing_digest_sent' }, '-created_date', 1
    ).catch(() => []);
    const lastAt = last?.[0]?.created_at ? new Date(last[0].created_at).getTime() : 0;
    if (Date.now() - lastAt < SEND_WINDOW_MS) {
      return Response.json({ ok: true, sent: false, reason: 'already_sent_recently' });
    }
    const reports = await svc.entities.MonthlySavingsReport.filter({ vertical: 'payments' }, '-month', 500);

    // Awaiting the human approval gate: measured and verified, never reviewed.
    const awaitingApproval = (reports || []).filter(r =>
      !r.invoice_id &&
      r.status !== 'void' &&
      ['verified', 'realized'].includes(r.verification_status) &&
      r.measurement_mode === 'fully_verified' &&
      !['eligible', 'invoiced', 'no_positive_savings'].includes(r.billing_eligibility_status)
    );

    // Approved but not yet invoiced — the queue that actually owes money.
    const approvedNotInvoiced = (reports || []).filter(r =>
      r.billing_eligibility_status === 'eligible' && !r.invoice_id && r.status !== 'void'
    );

    // Blocked for a named reason — surfaced so a blocker is fixed, not forgotten.
    const blocked = (reports || []).filter(r =>
      typeof r.billing_eligibility_status === 'string' &&
      r.billing_eligibility_status.startsWith('blocked_') &&
      !r.invoice_id && r.status !== 'void'
    );

    if (!awaitingApproval.length && !approvedNotInvoiced.length && !blocked.length) {
      return Response.json({ ok: true, sent: false, reason: 'nothing_pending' });
    }

    const brandIds = [...new Set([...awaitingApproval, ...approvedNotInvoiced, ...blocked].map(r => r.brand_id).filter(Boolean))];
    const brandNames = {};
    for (const id of brandIds) {
      const rows = await svc.entities.Brand.filter({ id }, '-created_date', 1).catch(() => []);
      brandNames[id] = rows?.[0]?.name || id;
    }
    const label = (r) => `${brandNames[r.brand_id] || 'Unknown business'} — ${r.month}`;

    const domain = Deno.env.get('APP_DOMAIN') || 'cambra.global';
    const link = `https://${domain}/admin/recover-billing`;
    const list = (rows, extra) =>
      rows.length
        ? `<ul style="margin:6px 0 14px;padding-left:18px;font-size:14px;color:#111">${rows.map(r => `<li>${label(r)}${extra(r)}</li>`).join('')}</ul>`
        : '<p style="margin:6px 0 14px;font-size:14px;color:#666">Nothing.</p>';

    const html = `
      <div style="font-family:Inter,Arial,sans-serif;max-width:640px">
        <h2 style="font-size:18px;margin:0 0 4px">Recover billing — weekly check</h2>
        <p style="font-size:13px;color:#666;margin:0 0 18px">Nothing below has been approved or invoiced automatically. Every action stays yours.</p>

        <h3 style="font-size:14px;margin:0 0 2px">Verified months waiting for your approval (${awaitingApproval.length})</h3>
        ${list(awaitingApproval, r => ` · savings ${eur(r.savings)}`)}

        <h3 style="font-size:14px;margin:0 0 2px">Approved, invoice not issued yet (${approvedNotInvoiced.length})</h3>
        ${list(approvedNotInvoiced, r => ` · fee ${eur(r.fee_net_amount)} excl. tax`)}

        <h3 style="font-size:14px;margin:0 0 2px">Blocked (${blocked.length})</h3>
        ${list(blocked, r => ` · ${r.billing_block_reason || r.billing_eligibility_status}`)}

        <p style="margin:20px 0 0"><a href="${link}" style="font-size:14px;font-weight:700;color:#5B4CF5">Open Recover billing</a></p>
      </div>`;

    const to = Deno.env.get('ADMIN_NOTIFICATION_EMAIL') || Deno.env.get('FOUNDER_EMAIL');
    if (!to) return Response.json({ ok: false, error: 'no_admin_recipient_configured' }, { status: 500 });

    await svc.integrations.Core.SendEmail({
      from_name: 'CAMBRA',
      to,
      subject: `Recover billing — ${awaitingApproval.length} to approve, ${approvedNotInvoiced.length} to invoice`,
      body: html,
    });

    await svc.entities.OperationalLog.create({
      event_type: 'status_changed',
      message: 'recover_billing_digest_sent',
      data_json: {
        awaiting_approval: awaitingApproval.length,
        approved_not_invoiced: approvedNotInvoiced.length,
        blocked: blocked.length,
      },
      actor_email: 'scheduler',
      created_at: new Date().toISOString(),
    }).catch(() => null);

    return Response.json({
      ok: true,
      sent: true,
      to,
      awaiting_approval: awaitingApproval.length,
      approved_not_invoiced: approvedNotInvoiced.length,
      blocked: blocked.length,
    });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
}