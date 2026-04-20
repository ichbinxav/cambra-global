import { createClientFromRequest } from 'npm:@base44/sdk@0.8.26';

// Triggered when a DealApplication status changes to "activated"
Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const body = await req.json();
  const { data, old_data, event } = body;

  // Only act on DealApplication updates where status becomes activated
  if (event?.entity_name !== "DealApplication") return Response.json({ ok: true });
  if (data?.status !== "activated") return Response.json({ ok: true });
  if (old_data?.status === "activated") return Response.json({ ok: true }); // already processed

  const app = data;

  // 1. Create Contract record
  const today = new Date().toISOString().split("T")[0];
  const endDate = new Date();
  endDate.setFullYear(endDate.getFullYear() + 1);

  await base44.asServiceRole.entities.Contract.create({
    deal_application_id: app.id,
    user_email: app.user_email,
    deal_id: app.deal_id,
    deal_name: app.deal_name,
    provider: app.provider,
    category: app.category,
    status: "active",
    estimated_savings_annual: app.estimated_savings || 0,
    start_date: today,
    end_date: endDate.toISOString().split("T")[0],
    node_revenue_pct: 15,
    activity_log: [{ date: today, action: "Contract created — deal activated", by: "system" }],
  });

  // 2. Also update or create UserDeal as active
  const existingDeals = await base44.asServiceRole.entities.UserDeal.filter({
    user_email: app.user_email,
    deal_id: app.deal_id,
  });

  if (existingDeals.length > 0) {
    await base44.asServiceRole.entities.UserDeal.update(existingDeals[0].id, {
      status: "active",
      start_date: today,
      end_date: endDate.toISOString().split("T")[0],
      estimated_savings: app.estimated_savings || 0,
    });
  } else {
    await base44.asServiceRole.entities.UserDeal.create({
      user_email: app.user_email,
      deal_id: app.deal_id,
      deal_name: app.deal_name,
      provider: app.provider,
      category: app.category,
      status: "active",
      start_date: today,
      end_date: endDate.toISOString().split("T")[0],
      estimated_savings: app.estimated_savings || 0,
      is_real_savings: false,
    });
  }

  // 3. Create DealActivation record for provider lead & tracking
  try {
    const brands = await base44.asServiceRole.entities.Brand.filter({ created_by: app.user_email });
    const brandId = brands?.[0]?.id || null;
    const providers = await base44.asServiceRole.entities.Provider.filter({ name: app.provider });
    const providerId = providers?.[0]?.id || null;
    const estYear = Number(app.estimated_savings || 0);
    const nowIso = new Date().toISOString();
    await base44.asServiceRole.entities.DealActivation.create({
      brand_id: brandId || "",
      provider_id: providerId || "",
      deal_id: app.deal_id,
      deal_name: app.deal_name,
      user_email: app.user_email,
      estimated_savings_yearly: estYear,
      activated_at: nowIso,
      activated_savings_yearly: estYear,
      potential_savings_yearly: estYear,
      realized_savings_monthly: 0,
      realized_savings_yearly: 0,
      last_updated: nowIso
    });
  } catch (e) {
    console.warn('DealActivation persist failed:', e?.message || e);
  }

  // 4. Send activation email to user
  await base44.asServiceRole.integrations.Core.SendEmail({
    from_name: "THE NoDE",
    to: app.user_email,
    subject: `Deal activated — ${app.deal_name}`,
    body: `
      <div style="font-family: -apple-system, sans-serif; max-width: 520px; margin: 0 auto; padding: 40px 32px; color: #111;">
        <p style="font-size: 11px; letter-spacing: 0.2em; text-transform: uppercase; color: #999; margin-bottom: 32px;">THE NoDE · Deal Update</p>
        <h1 style="font-size: 26px; font-weight: 900; letter-spacing: -0.04em; margin-bottom: 8px;">Your deal is active.</h1>
        <p style="color: #666; font-size: 15px; line-height: 1.6; margin-bottom: 24px;">
          <strong style="color:#111;">${app.deal_name}</strong> with <strong style="color:#111;">${app.provider}</strong> has been activated.
        </p>
        ${app.estimated_savings ? `
        <div style="background: #f8f8f8; border-radius: 12px; padding: 20px; margin-bottom: 24px; text-align: center;">
          <p style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.15em; color: #999; margin-bottom: 6px;">Estimated annual savings</p>
          <p style="font-size: 36px; font-weight: 900; color: #16a34a; letter-spacing: -0.04em;">€${Math.round(app.estimated_savings).toLocaleString()}/yr</p>
        </div>` : ""}
        <p style="font-size: 13px; color: #666; line-height: 1.6;">
          Your new rates are now in effect. Track your contract and savings in your dashboard.
        </p>
        <a href="https://thenode.co/Deals" style="display: inline-block; margin-top: 20px; background: #111; color: #fff; text-decoration: none; font-weight: 700; font-size: 14px; padding: 12px 24px; border-radius: 100px;">
          View my contracts →
        </a>
        <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #eee;">
          <p style="font-size: 11px; color: #ccc;">THE NoDE · Infrastructure leverage for independent brands</p>
        </div>
      </div>
    `,
  });

  return Response.json({ ok: true, created: "contract" });
});