import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';

/**
 * getWaitlistAggregate — admin-only.
 *
 * Purpose: aggregate demand across all "Join to recover" waitlist signups —
 * combined volume, brand count, breakdown by tier and country. This is
 * NEGOTIATION AMMUNITION for the founder ("142 brands, €38M combined volume
 * ready to move"), not a public page. Never expose these numbers publicly
 * without an aggregation floor.
 *
 * Data flow (single source of truth):
 *   Lead (waitlist)  → session_id parsed from `notes`  →  AnalyzerResult
 *                                                       →  AnalyzerInput
 *   The euro/GMV figures come STRAIGHT from AnalyzerResult.total_savings and
 *   AnalyzerInput.monthly_revenue, which are the outputs of scoreEngine.js.
 *   NEVER recomputes anything here — this is a read + sum, not a calculator.
 *
 * Trust note: until server-side recalculation lands (see TODO in
 * submitAnonymousAnalysis), the AnalyzerResult figures on anonymous sessions
 * are client-declared. We defend the aggregate with:
 *   - a per-brand cap (default €5M/yr in savings, €50M/mo in revenue) — anything
 *     above is treated as an outlier and dropped from the aggregate (still
 *     visible in the raw Lead list, just not summed);
 *   - the aggregate is admin-only.
 *
 * Endpoint classification: ADMIN_REQUIRED.
 * asServiceRole justification: reads Lead / AnalyzerResult / AnalyzerInput
 * across tenants (this is a platform-wide aggregate for the founder). All
 * numbers stay inside the response; no cross-tenant identifiers are returned
 * beyond what's already in Lead.notes.
 */

const UUID_V4 = /[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i;
const SESSION_RX = /Session:\s*([0-9a-f-]{36})/i;

// Outlier caps — see trust note above. Deliberately generous so real large
// brands aren't excluded, but tight enough that a malicious payload with
// €99M/yr doesn't dominate the aggregate.
const CAP_SAVINGS_PER_BRAND = 5_000_000;      // €/yr
const CAP_MONTHLY_REVENUE   = 50_000_000;     // €/mo

function tierOf(monthlyRevenue: number): string {
  if (monthlyRevenue >= 500_000) return 'large';
  if (monthlyRevenue >= 100_000) return 'mid';
  if (monthlyRevenue >= 30_000)  return 'small';
  return 'micro';
}

function parseSessionId(notes: string | undefined | null): string | null {
  if (!notes || typeof notes !== 'string') return null;
  const m = notes.match(SESSION_RX);
  if (!m) return null;
  const id = m[1];
  return UUID_V4.test(id) ? id : null;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const user = await base44.auth.me().catch(() => null);
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    // 1. Collect all waitlist Leads (same filter as getWaitlistLeads).
    const allLeads = await base44.asServiceRole.entities.Lead.list('-created_date', 1000);
    const waitlist = (allLeads || []).filter((l: any) =>
      typeof l?.source_page === 'string' &&
      (l.source_page.startsWith('landing_waitlist') ||
       l.source_page.startsWith('analyzer_teaser_waitlist'))
    );

    // 2. Extract distinct session_ids per Lead.
    //    PRIMARY source: the structured `anon_session_id` field on Lead —
    //    populated at signup time by submitWaitlistSignup.
    //    FALLBACK: regex-parse the human-readable `notes` field. Used only
    //    for leads created before `anon_session_id` existed. New signups
    //    should always go through the structured path.
    //    Landing-only signups have no session_id in either place (visitor
    //    hadn't run the Analyzer yet) — they count towards total_signups but
    //    not towards combined_volume/savings.
    const sessionIds = new Set<string>();
    const leadBySession = new Map<string, any>();
    for (const l of waitlist) {
      const structured = typeof l?.anon_session_id === "string" && UUID_V4.test(l.anon_session_id)
        ? l.anon_session_id
        : null;
      const sid = structured || parseSessionId(l.notes);
      if (sid) {
        sessionIds.add(sid);
        // Keep the most recent Lead per session (list is already -created_date)
        if (!leadBySession.has(sid)) leadBySession.set(sid, l);
      }
    }

    // 3. Fetch AnalyzerResult per session (small N — waitlist scale).
    //    Anonymous results still have anon_session_id populated; claimed ones
    //    have it cleared, so we also try to find by created_by == lead.email
    //    as a fallback when the visitor signed up AND then claimed.
    const linkedResults: Array<{ sid: string; result: any; lead: any }> = [];
    for (const sid of sessionIds) {
      const lead = leadBySession.get(sid);
      let result: any = null;

      // Path 1: still anonymous — anon_session_id is present.
      const anon = await base44.asServiceRole.entities.AnalyzerResult
        .filter({ anon_session_id: sid }, '-created_date', 1).catch(() => []);
      if (anon.length) result = anon[0];

      // Path 2: user claimed after signup → look up by their email.
      if (!result && lead?.email) {
        const claimed = await base44.asServiceRole.entities.AnalyzerResult
          .filter({ created_by: lead.email }, '-created_date', 1).catch(() => []);
        if (claimed.length) result = claimed[0];
      }

      if (result) linkedResults.push({ sid, result, lead });
    }

    // 4. Fetch AnalyzerInputs for tier / country / provider breakdowns.
    const inputById = new Map<string, any>();
    for (const { result } of linkedResults) {
      if (result.input_id && !inputById.has(result.input_id)) {
        const inp = await base44.asServiceRole.entities.AnalyzerInput
          .get(result.input_id).catch(() => null);
        if (inp) inputById.set(result.input_id, inp);
      }
    }

    // 5. Aggregate — with outlier clamp.
    let combined_savings = 0;
    let combined_monthly_revenue = 0;
    let linked_brands = 0;
    let outliers_dropped = 0;

    const byTier:    Record<string, { brands: number; savings: number; monthly_revenue: number }> = {};
    const byCountry: Record<string, { brands: number; savings: number; monthly_revenue: number }> = {};
    const byPaymentProvider: Record<string, number> = {};

    for (const { result } of linkedResults) {
      const input = result.input_id ? inputById.get(result.input_id) : null;

      const savings = Number(result.total_savings || 0);
      const monthlyRev = Number(input?.monthly_revenue || 0);

      // Outlier: reject the whole brand from the aggregate if either figure
      // is beyond its cap. Still counted as a signup elsewhere, just not summed.
      if (savings > CAP_SAVINGS_PER_BRAND || monthlyRev > CAP_MONTHLY_REVENUE) {
        outliers_dropped += 1;
        continue;
      }
      if (!Number.isFinite(savings) || !Number.isFinite(monthlyRev)) {
        outliers_dropped += 1;
        continue;
      }

      linked_brands += 1;
      combined_savings += Math.max(0, savings);
      combined_monthly_revenue += Math.max(0, monthlyRev);

      const tier = tierOf(monthlyRev);
      byTier[tier] ||= { brands: 0, savings: 0, monthly_revenue: 0 };
      byTier[tier].brands += 1;
      byTier[tier].savings += Math.max(0, savings);
      byTier[tier].monthly_revenue += Math.max(0, monthlyRev);

      const country = String(input?.country || 'Unknown').slice(0, 60) || 'Unknown';
      byCountry[country] ||= { brands: 0, savings: 0, monthly_revenue: 0 };
      byCountry[country].brands += 1;
      byCountry[country].savings += Math.max(0, savings);
      byCountry[country].monthly_revenue += Math.max(0, monthlyRev);

      const pp = String(input?.payment_provider || 'Unknown').trim().slice(0, 60) || 'Unknown';
      byPaymentProvider[pp] = (byPaymentProvider[pp] || 0) + 1;
    }

    const totalSignups = waitlist.length;
    const withoutSession = totalSignups - sessionIds.size;

    return Response.json({
      ok: true,
      aggregate: {
        total_signups: totalSignups,
        signups_without_session: withoutSession, // landing-page-only signups
        linked_brands,
        outliers_dropped,
        combined_savings_yearly: Math.round(combined_savings),
        combined_monthly_revenue: Math.round(combined_monthly_revenue),
        combined_annual_gmv: Math.round(combined_monthly_revenue * 12),
        by_tier: byTier,
        by_country: byCountry,
        by_payment_provider: byPaymentProvider,
        caps: {
          savings_per_brand: CAP_SAVINGS_PER_BRAND,
          monthly_revenue: CAP_MONTHLY_REVENUE,
        },
        // Trust flag — the numbers above come from client-declared
        // AnalyzerResults on the anonymous path. Surface this in the UI so
        // the admin knows what they're looking at.
        source_verification: 'client_declared_unverified',
      },
    });
  } catch (error) {
    return Response.json({ error: (error as any)?.message || 'internal_error' }, { status: 500 });
  }
});