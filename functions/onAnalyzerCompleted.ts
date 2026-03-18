import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

// Email 5: Analyzer results summary — triggered when an AnalyzerResult is created
Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const body = await req.json();
  const { data } = body;

  if (!data) return Response.json({ ok: true });

  const userEmail = data.created_by;
  if (!userEmail) return Response.json({ ok: true });

  const total = data.total_savings ? `€${Math.round(data.total_savings).toLocaleString()}` : null;
  const payments = data.payment_savings ? `€${Math.round(data.payment_savings).toLocaleString()}` : null;
  const shipping = data.shipping_savings ? `€${Math.round(data.shipping_savings).toLocaleString()}` : null;
  const saas = data.saas_savings ? `€${Math.round(data.saas_savings).toLocaleString()}` : null;
  const score = data.infra_score || null;
  const resultId = data.id;

  if (!total) return Response.json({ ok: true });

  await base44.asServiceRole.integrations.Core.SendEmail({
    from_name: "THE NoDE · Analyzer",
    to: userEmail,
    subject: `Your infrastructure analysis — ${total}/yr identified`,
    body: `
      <div style="font-family: -apple-system, sans-serif; max-width: 560px; margin: 0 auto; padding: 40px 32px; color: #111;">
        <p style="font-size: 11px; letter-spacing: 0.2em; text-transform: uppercase; color: #999; margin-bottom: 32px;">THE NoDE · Infrastructure Analyzer</p>
        <h1 style="font-size: 28px; font-weight: 900; letter-spacing: -0.04em; margin-bottom: 8px;">Your analysis is ready.</h1>
        <p style="color: #666; font-size: 15px; line-height: 1.6; margin-bottom: 32px;">
          Here's what we found across your infrastructure.
        </p>

        <div style="background: #111; color: #fff; border-radius: 16px; padding: 28px; margin-bottom: 24px; text-align: center;">
          <p style="font-size: 11px; letter-spacing: 0.2em; text-transform: uppercase; color: rgba(255,255,255,0.35); margin-bottom: 8px;">Optimization potential identified</p>
          <p style="font-size: 52px; font-weight: 900; letter-spacing: -0.04em; line-height: 1;">${total}</p>
          <p style="font-size: 14px; color: rgba(255,255,255,0.4); margin-top: 4px;">per year across your infrastructure</p>
          ${score ? `<p style="margin-top: 16px; font-size: 13px; color: rgba(255,255,255,0.5);">Infrastructure Score: <strong style="color:#fff;">${score}/100</strong></p>` : ""}
        </div>

        <div style="border: 1px solid #eee; border-radius: 12px; overflow: hidden; margin-bottom: 32px;">
          ${payments ? `
          <div style="display: flex; justify-content: space-between; padding: 14px 20px; border-bottom: 1px solid #eee;">
            <span style="color: #666; font-size: 13px;">Payments</span>
            <span style="font-weight: 700; color: #2563eb;">${payments}/yr</span>
          </div>` : ""}
          ${shipping ? `
          <div style="display: flex; justify-content: space-between; padding: 14px 20px; border-bottom: 1px solid #eee;">
            <span style="color: #666; font-size: 13px;">Shipping</span>
            <span style="font-weight: 700; color: #16a34a;">${shipping}/yr</span>
          </div>` : ""}
          ${saas ? `
          <div style="display: flex; justify-content: space-between; padding: 14px 20px;">
            <span style="color: #666; font-size: 13px;">SaaS & Tools</span>
            <span style="font-weight: 700; color: #ea580c;">${saas}/yr</span>
          </div>` : ""}
        </div>

        <p style="font-size: 13px; color: #666; line-height: 1.6; margin-bottom: 24px;">
          Activate network deals to start recovering this value. Most improvements are operational within 5 business days.
        </p>

        <a href="https://thenode.co/Results?id=${resultId}" style="display: inline-block; background: #111; color: #fff; text-decoration: none; font-weight: 700; font-size: 14px; padding: 14px 28px; border-radius: 100px; margin-right: 12px;">
          View full report →
        </a>
        <a href="https://thenode.co/Deals" style="display: inline-block; color: #111; text-decoration: none; font-weight: 600; font-size: 14px; padding: 14px 0;">
          Activate deals →
        </a>

        <div style="margin-top: 48px; padding-top: 24px; border-top: 1px solid #eee;">
          <p style="font-size: 11px; color: #ccc;">Estimated analysis · Based on manual inputs · Connect your tools for verified figures</p>
          <p style="font-size: 11px; color: #ccc; margin-top: 4px;">THE NoDE · Infrastructure leverage for independent brands</p>
        </div>
      </div>
    `,
  });

  return Response.json({ ok: true });
});