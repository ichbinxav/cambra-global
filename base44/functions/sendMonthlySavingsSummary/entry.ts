import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Sends the monthly savings summary email to a user (or to all opted-in users when called from scheduler).
// Payload:
//   { userEmail?: string }   -> send only to that user (used for "Send test" / preview)
//   {}                       -> send to all opted-in users (used by monthly automation)
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    let requestedEmail = null;
    let isAdminCaller = false;
    let callerEmail = null;
    try {
      const caller = await base44.auth.me();
      if (caller) {
        callerEmail = caller.email;
        isAdminCaller = caller.role === 'admin';
      }
    } catch {}

    let body = {};
    try { body = await req.json(); } catch {}
    requestedEmail = body?.userEmail || null;

    // Authorization rules:
    //  - If a userEmail is passed, only admins OR the user themselves can trigger it.
    //  - If no userEmail (bulk run), only admin/service can call.
    if (requestedEmail) {
      if (!callerEmail) return Response.json({ error: 'Unauthorized' }, { status: 401 });
      if (!isAdminCaller && callerEmail !== requestedEmail) {
        return Response.json({ error: 'Forbidden' }, { status: 403 });
      }
    } else {
      if (!isAdminCaller) {
        return Response.json({ error: 'Forbidden: admin only' }, { status: 403 });
      }
    }

    // Find target users
    let targets = [];
    if (requestedEmail) {
      const list = await base44.asServiceRole.entities.User.filter({ email: requestedEmail });
      targets = list;
    } else {
      targets = await base44.asServiceRole.entities.User.filter({ monthly_email_summary: true });
    }

    if (!targets.length) {
      return Response.json({ sent: 0, message: 'No recipients' });
    }

    const results = [];
    for (const u of targets) {
      try {
        // Latest analysis for this user
        const analyses = await base44.asServiceRole.entities.AnalyzerResult.filter(
          { created_by_id: u.id }, '-created_date', 12
        );
        if (!analyses.length) {
          results.push({ email: u.email, status: 'skipped_no_data' });
          continue;
        }

        const latest = analyses[0];
        const total = Math.round(latest.total_savings || 0);
        const monthly = Math.round(total / 12);
        const score = latest.infra_score || 0;

        // Cumulative estimate (sum of all identified savings monthly run-rate × months active)
        const sorted = [...analyses].sort((a, b) => new Date(a.created_date) - new Date(b.created_date));
        const firstDate = new Date(sorted[0].created_date);
        const monthsActive = Math.max(
          1,
          (new Date().getFullYear() - firstDate.getFullYear()) * 12 + (new Date().getMonth() - firstDate.getMonth()) + 1
        );
        const cumulative = Math.round((total / 12) * monthsActive);

        const breakdown = [
          { label: 'Online Payments', v: Math.round(latest.payment_savings || 0) },
          { label: 'Shipping', v: Math.round(latest.shipping_savings || 0) },
          { label: 'SaaS & Tools', v: Math.round(latest.saas_savings || 0) },
          { label: 'Insurance', v: Math.round(latest.details?.insurance_savings || 0) },
        ].filter(x => x.v > 0);

        const monthName = new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

        const breakdownHtml = breakdown.map(b => `
          <tr>
            <td style="padding:10px 0;color:#525252;font-size:14px;">${b.label}</td>
            <td style="padding:10px 0;text-align:right;font-weight:700;color:#0a0a0a;font-size:14px;">€${b.v.toLocaleString()}</td>
          </tr>
        `).join('');

        const html = `
          <div style="font-family:Inter,Arial,sans-serif;max-width:580px;margin:0 auto;color:#0a0a0a;background:#fbfaf7;padding:40px 24px;">
            <p style="font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#999;margin:0 0 4px;">CAMBRA · ${monthName}</p>
            <h1 style="font-size:28px;font-weight:900;letter-spacing:-0.03em;margin:0 0 8px;">Your monthly savings summary</h1>
            <p style="font-size:14px;color:#666;margin:0 0 28px;">Hi ${u.full_name?.split(' ')[0] || 'there'}, here's how your infrastructure is performing this month.</p>

            <div style="background:#fff;border:1px solid #eee;border-radius:16px;padding:28px;margin-bottom:16px;">
              <p style="font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#999;margin:0 0 8px;">Identified annual savings</p>
              <p style="font-size:42px;font-weight:900;letter-spacing:-0.04em;margin:0 0 4px;">€${total.toLocaleString()}</p>
              <p style="font-size:13px;color:#666;margin:0;">≈ €${monthly.toLocaleString()} / month potential</p>
            </div>

            <div style="display:flex;gap:8px;margin-bottom:24px;">
              <div style="flex:1;background:#fff;border:1px solid #eee;border-radius:12px;padding:16px;">
                <p style="font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#999;margin:0 0 4px;">Infra Score</p>
                <p style="font-size:22px;font-weight:900;margin:0;">${score}/100</p>
              </div>
              <div style="flex:1;background:#fff;border:1px solid #eee;border-radius:12px;padding:16px;">
                <p style="font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#999;margin:0 0 4px;">Cumulative est.</p>
                <p style="font-size:22px;font-weight:900;margin:0;">€${cumulative.toLocaleString()}</p>
              </div>
            </div>

            ${breakdown.length ? `
              <div style="background:#fff;border:1px solid #eee;border-radius:16px;padding:24px;margin-bottom:24px;">
                <p style="font-size:12px;font-weight:700;margin:0 0 12px;">Breakdown by category</p>
                <table style="width:100%;border-collapse:collapse;">${breakdownHtml}</table>
              </div>
            ` : ''}

            <a href="https://app.base44.com/Dashboard" style="display:inline-block;background:#0a0a0a;color:#fff;text-decoration:none;padding:14px 28px;border-radius:999px;font-size:14px;font-weight:700;">Open Dashboard →</a>

            <p style="font-size:11px;color:#999;margin-top:32px;line-height:1.6;">
              You're receiving this because monthly summaries are enabled on your CAMBRA account.
              You can turn them off anytime in <a href="https://app.base44.com/Account" style="color:#666;">Account settings</a>.
            </p>
          </div>
        `;

        await base44.asServiceRole.integrations.Core.SendEmail({
          from_name: 'CAMBRA',
          to: u.email,
          subject: `Your CAMBRA savings summary — ${monthName}`,
          body: html,
        });
        results.push({ email: u.email, status: 'sent' });
      } catch (err) {
        results.push({ email: u.email, status: 'error', error: err.message });
      }
    }

    return Response.json({
      sent: results.filter(r => r.status === 'sent').length,
      total: results.length,
      results,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});