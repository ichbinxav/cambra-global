import { safeBestEffort } from '../../shared/bestEffort.ts';
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import { monthlySummaryEmail } from '../../shared/emails/monthlySummary.ts';
import { emergencyState } from '../../shared/operationalControl.ts';
import { sendCostGovernedEmail } from '../../shared/costGovernance.ts';
import { internalErrorResponse } from '../../shared/publicErrors.ts';

// Sends the monthly savings summary email to a user (or to all opted-in users when called from scheduler).
// Payload:
//   { userEmail?: string }   -> send only to that user (used for "Send test" / preview)
//   {}                       -> send to all opted-in users (used by monthly automation)
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    let requestedEmail: string | null = null;
    let isAdminCaller = false;
    let callerEmail: string | null = null;
    try {
      const caller = await base44.auth.me();
      if (caller) {
        callerEmail = caller.email;
        isAdminCaller = caller.role === 'admin';
      }
    } catch(error){safeBestEffort(error,{operation:'sendMonthlySavingsSummary',fallback:null,severity:'secondary'})}

    let body: any = {};
    try { body = await req.json(); } catch(error){safeBestEffort(error,{operation:'sendMonthlySavingsSummary',fallback:null,severity:'secondary'})}
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

    const emergency = await emergencyState(base44.asServiceRole);
    if (emergency.safe_mode || emergency.communications_paused) return Response.json({ ok:false, error:'emergency_control_paused:communications', safe_mode:emergency.safe_mode, reason:emergency.reason || null }, { status:409 });

    // Find target users
    let targets: any[] = [];
    if (requestedEmail) {
      // For single-user (test) sends, use the authenticated caller directly to avoid
      // depending on filter-by-email reliability.
      const me = await base44.auth.me();
      if (me && (isAdminCaller || me.email === requestedEmail)) {
        targets = [me];
      } else {
        const list = await base44.asServiceRole.entities.User.filter({ email: requestedEmail });
        targets = list;
      }
    } else {
      targets = await base44.asServiceRole.entities.User.filter({ monthly_email_summary: true });
    }

    if (!targets.length) {
      return Response.json({ sent: 0, message: 'No recipients' });
    }

    const results: any[] = [];
    for (const u of targets) {
      try {
        // A2 migration (2026-07-12) — resolve the user's brand via
        // contact_email (same pivot as the frontend getMyActiveBrand helper),
        // then scope AnalyzerResult reads by brand_id. Previously this used
        // { created_by_id: u.id } which silently skipped every user whose
        // brand (and therefore whose AnalyzerResult rows) were written by
        // service role. Skip semantics preserved: users without a brand get
        // 'skipped_no_data', just like before, but for the right reason.
        const brands = await base44.asServiceRole.entities.Brand.filter(
          { contact_email: u.email }, '-created_date', 1
        );
        const brand = brands[0] || null;
        if (!brand) {
          results.push({ email: u.email, status: 'skipped_no_brand' });
          continue;
        }
        const analyses = await base44.asServiceRole.entities.AnalyzerResult.filter(
          { brand_id: brand.id }, '-created_date', 12
        );
        if (!analyses.length) {
          results.push({ email: u.email, status: 'skipped_no_data' });
          continue;
        }

        const latest = analyses[0];
        const total = Math.round(latest.total_savings || 0);
        const monthly = Math.round(total / 12);

        // Cumulative estimate (sum of all identified savings monthly run-rate × months active)
        const sorted = [...analyses].sort((a, b) => new Date(a.created_date).getTime() - new Date(b.created_date).getTime());
        const firstDate = new Date(sorted[0].created_date);
        const monthsActive = Math.max(
          1,
          (new Date().getFullYear() - firstDate.getFullYear()) * 12 + (new Date().getMonth() - firstDate.getMonth()) + 1
        );
        const cumulative = Math.round((total / 12) * monthsActive);

        // P0.2 — payments-only monthly email. Removed the multi-vertical
        // breakdown and the composite efficiency score card; the email
        // now reports only card-payment savings + cumulative.
        const mail = monthlySummaryEmail(brand.locale, {
          firstName: u.full_name?.split(' ')[0] || '',
          total,
          monthly,
          cumulative,
          appDomain: Deno.env.get('APP_DOMAIN') || 'cambra.global',
        });

        await sendCostGovernedEmail(base44.asServiceRole, { event_key:`email:monthly-savings:${u.id || u.email}:${new Date().toISOString().slice(0,7)}`, source:'sendMonthlySavingsSummary', related_entity_type:'User', related_entity_id:u.id || u.email }, {
          from_name: 'CAMBRA',
          to: u.email,
          subject: mail.subject,
          body: mail.html,
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
    return internalErrorResponse(error, 'sendMonthlySavingsSummary');
  }
});
