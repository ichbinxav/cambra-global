import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

// Handles emails 6, 7, 8 based on "type" param passed by automation function_args
// Email 6: Analyzer follow-up (D+2) — users who ran analyzer but have no active deals
// Email 7: Contract expiring soon (30 days)
// Email 8: Monthly savings digest

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const body = await req.json();
  const type = body?.args?.type;

  if (!type) return Response.json({ error: "Missing type" }, { status: 400 });

  const now = new Date();

  // ── EMAIL 6: Analyzer follow-up D+2 ──────────────────────────────
  if (type === "analyzer_followup") {
    const twoDaysAgo = new Date(now);
    twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
    const threeDaysAgo = new Date(now);
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

    // Get analyzer results created ~2 days ago
    const results = await base44.asServiceRole.entities.AnalyzerResult.list("-created_date", 100);
    const recent = results.filter(r => {
      const created = new Date(r.created_date);
      return created >= threeDaysAgo && created <= twoDaysAgo && r.created_by;
    });

    for (const result of recent) {
      // Check if they have any active deals
      const deals = await base44.asServiceRole.entities.UserDeal.filter({ user_email: result.created_by });
      const hasActiveDeals = deals.some(d => d.status === "active");
      if (hasActiveDeals) continue;

      const total = result.total_savings ? `€${Math.round(result.total_savings).toLocaleString()}` : null;
      if (!total) continue;

      await base44.asServiceRole.integrations.Core.SendEmail({
        from_name: "THE NoDE",
        to: result.created_by,
        subject: `${total}/yr still unoptimized — activate your first deal`,
        body: `
          <div style="font-family: -apple-system, sans-serif; max-width: 560px; margin: 0 auto; padding: 40px 32px; color: #111;">
            <p style="font-size: 11px; letter-spacing: 0.2em; text-transform: uppercase; color: #999; margin-bottom: 32px;">THE NoDE</p>
            <h1 style="font-size: 26px; font-weight: 900; letter-spacing: -0.04em; margin-bottom: 8px;">Your ${total}/yr is still on the table.</h1>
            <p style="color: #666; font-size: 15px; line-height: 1.6; margin-bottom: 32px;">
              Two days ago, your Analyzer identified <strong>${total}/yr</strong> in infrastructure optimization potential. You haven't activated any network deals yet.
            </p>
            <p style="color: #666; font-size: 14px; line-height: 1.6; margin-bottom: 32px;">
              Most members activate their first deal in under 3 minutes. Preferred conditions are applied within 5 business days.
            </p>
            <a href="https://thenode.co/Deals" style="display: inline-block; background: #111; color: #fff; text-decoration: none; font-weight: 700; font-size: 14px; padding: 14px 28px; border-radius: 100px;">
              Activate your first deal →
            </a>
            <div style="margin-top: 48px; padding-top: 24px; border-top: 1px solid #eee;">
              <p style="font-size: 11px; color: #ccc;">THE NoDE · Infrastructure leverage for independent brands</p>
            </div>
          </div>
        `,
      });
    }
    return Response.json({ ok: true, processed: recent.length });
  }

  // ── EMAIL 7: Contract expiring soon ───────────────────────────────
  if (type === "expiring_contracts") {
    const in30 = new Date(now);
    in30.setDate(in30.getDate() + 30);
    const in37 = new Date(now);
    in37.setDate(in37.getDate() + 37);

    const allDeals = await base44.asServiceRole.entities.UserDeal.filter({ status: "active" });
    const expiring = allDeals.filter(d => {
      if (!d.end_date) return false;
      const end = new Date(d.end_date);
      return end >= in30 && end <= in37;
    });

    for (const deal of expiring) {
      const endFormatted = new Date(deal.end_date).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
      await base44.asServiceRole.integrations.Core.SendEmail({
        from_name: "THE NoDE",
        to: deal.user_email,
        subject: `Your ${deal.provider} contract expires ${endFormatted} — renew now`,
        body: `
          <div style="font-family: -apple-system, sans-serif; max-width: 560px; margin: 0 auto; padding: 40px 32px; color: #111;">
            <p style="font-size: 11px; letter-spacing: 0.2em; text-transform: uppercase; color: #999; margin-bottom: 32px;">THE NoDE · Contracts</p>
            <h1 style="font-size: 26px; font-weight: 900; letter-spacing: -0.04em; margin-bottom: 8px;">Your contract is expiring.</h1>
            <p style="color: #666; font-size: 15px; line-height: 1.6; margin-bottom: 32px;">
              Your preferred <strong>${deal.provider}</strong> conditions via THE NoDE expire on <strong>${endFormatted}</strong>. Renew now to keep your rates.
            </p>
            <div style="background: #fff7ed; border: 1px solid #fed7aa; border-radius: 12px; padding: 20px; margin-bottom: 32px;">
              <p style="font-size: 11px; letter-spacing: 0.15em; text-transform: uppercase; color: #9a3412; margin-bottom: 12px;">Contract details</p>
              <p style="font-weight: 700; font-size: 16px; margin-bottom: 4px;">${deal.deal_name}</p>
              <p style="color: #666; font-size: 14px; margin-bottom: 8px;">${deal.provider}</p>
              ${deal.estimated_savings ? `<p style="color: #16a34a; font-weight: 700;">€${deal.estimated_savings.toLocaleString()}/yr estimated benefit</p>` : ""}
              <p style="color: #ea580c; font-size: 13px; font-weight: 600; margin-top: 8px;">Expires: ${endFormatted}</p>
            </div>
            <a href="https://thenode.co/Deals" style="display: inline-block; background: #111; color: #fff; text-decoration: none; font-weight: 700; font-size: 14px; padding: 14px 28px; border-radius: 100px;">
              Renew contract →
            </a>
            <div style="margin-top: 48px; padding-top: 24px; border-top: 1px solid #eee;">
              <p style="font-size: 11px; color: #ccc;">THE NoDE · Infrastructure leverage for independent brands</p>
            </div>
          </div>
        `,
      });
    }
    return Response.json({ ok: true, processed: expiring.length });
  }

  // ── EMAIL 8: Monthly savings digest ───────────────────────────────
  if (type === "monthly_digest") {
    // Get all users with at least one deal
    const allDeals = await base44.asServiceRole.entities.UserDeal.list();
    const byUser = {};
    for (const deal of allDeals) {
      if (!deal.user_email) continue;
      if (!byUser[deal.user_email]) byUser[deal.user_email] = [];
      byUser[deal.user_email].push(deal);
    }

    for (const [email, deals] of Object.entries(byUser)) {
      const active = deals.filter(d => d.status === "active");
      const waitlist = deals.filter(d => d.status === "waitlist" || d.status === "pending");
      const totalSavings = active.reduce((sum, d) => sum + (d.estimated_savings || 0), 0);

      await base44.asServiceRole.integrations.Core.SendEmail({
        from_name: "THE NoDE",
        to: email,
        subject: `Your THE NoDE summary — ${active.length} active deal${active.length !== 1 ? "s" : ""}, €${totalSavings.toLocaleString()}/yr`,
        body: `
          <div style="font-family: -apple-system, sans-serif; max-width: 560px; margin: 0 auto; padding: 40px 32px; color: #111;">
            <p style="font-size: 11px; letter-spacing: 0.2em; text-transform: uppercase; color: #999; margin-bottom: 32px;">THE NoDE · Monthly Summary</p>
            <h1 style="font-size: 26px; font-weight: 900; letter-spacing: -0.04em; margin-bottom: 8px;">Your infrastructure this month.</h1>

            <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; margin-bottom: 32px;">
              <div style="background: #f9f9f9; border: 1px solid #eee; border-radius: 10px; padding: 16px; text-align: center;">
                <p style="font-size: 28px; font-weight: 900; color: #16a34a;">${active.length}</p>
                <p style="font-size: 11px; color: #999; margin-top: 4px;">Active deals</p>
              </div>
              <div style="background: #f9f9f9; border: 1px solid #eee; border-radius: 10px; padding: 16px; text-align: center;">
                <p style="font-size: 28px; font-weight: 900;">€${totalSavings.toLocaleString()}</p>
                <p style="font-size: 11px; color: #999; margin-top: 4px;">Saved / yr</p>
              </div>
              <div style="background: #f9f9f9; border: 1px solid #eee; border-radius: 10px; padding: 16px; text-align: center;">
                <p style="font-size: 28px; font-weight: 900; color: #2563eb;">${waitlist.length}</p>
                <p style="font-size: 11px; color: #999; margin-top: 4px;">On access list</p>
              </div>
            </div>

            ${active.length > 0 ? `
            <div style="border: 1px solid #eee; border-radius: 12px; overflow: hidden; margin-bottom: 32px;">
              <div style="padding: 12px 20px; background: #f9f9f9; border-bottom: 1px solid #eee;">
                <p style="font-size: 11px; letter-spacing: 0.15em; text-transform: uppercase; color: #999;">Active contracts</p>
              </div>
              ${active.map(d => `
              <div style="display: flex; justify-content: space-between; align-items: center; padding: 14px 20px; border-bottom: 1px solid #f0f0f0;">
                <div>
                  <p style="font-weight: 600; font-size: 14px;">${d.deal_name}</p>
                  <p style="font-size: 12px; color: #999;">${d.provider}</p>
                </div>
                ${d.estimated_savings ? `<p style="font-weight: 700; color: #16a34a; font-size: 14px;">€${d.estimated_savings.toLocaleString()}/yr</p>` : ""}
              </div>`).join("")}
            </div>` : ""}

            <a href="https://thenode.co/Deals" style="display: inline-block; background: #111; color: #fff; text-decoration: none; font-weight: 700; font-size: 14px; padding: 14px 28px; border-radius: 100px;">
              ${active.length === 0 ? "Activate your first deal →" : "View all deals →"}
            </a>

            <div style="margin-top: 48px; padding-top: 24px; border-top: 1px solid #eee;">
              <p style="font-size: 11px; color: #ccc;">THE NoDE · Infrastructure leverage for independent brands · You're receiving this as a network member.</p>
            </div>
          </div>
        `,
      });
    }
    return Response.json({ ok: true, processed: Object.keys(byUser).length });
  }

  return Response.json({ error: "Unknown type" }, { status: 400 });
});