import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

// Email 4: Welcome to THE NoDE — triggered when a Brand entity is created (onboarding complete)
Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const body = await req.json();
  const { data } = body;

  if (!data) return Response.json({ ok: true });

  // Get the user who created this brand
  const userEmail = data.created_by;
  const brandName = data.name || "your brand";

  if (!userEmail) return Response.json({ ok: true });

  await base44.asServiceRole.integrations.Core.SendEmail({
    from_name: "THE NoDE",
    to: userEmail,
    subject: "Welcome to THE NoDE — your infrastructure advantage starts here",
    body: `
      <div style="font-family: -apple-system, sans-serif; max-width: 560px; margin: 0 auto; padding: 40px 32px; color: #111;">
        <p style="font-size: 11px; letter-spacing: 0.2em; text-transform: uppercase; color: #999; margin-bottom: 32px;">THE NoDE</p>
        <h1 style="font-size: 32px; font-weight: 900; letter-spacing: -0.04em; line-height: 1; margin-bottom: 12px;">
          Welcome, ${brandName}.
        </h1>
        <p style="color: #666; font-size: 15px; line-height: 1.6; margin-bottom: 32px;">
          You've joined THE NoDE — a collective of independent brands pooling infrastructure leverage to access conditions normally reserved for much larger operators.
        </p>

        <div style="background: #111; color: #fff; border-radius: 16px; padding: 28px; margin-bottom: 32px;">
          <p style="font-size: 11px; letter-spacing: 0.2em; text-transform: uppercase; color: rgba(255,255,255,0.35); margin-bottom: 16px;">What's unlocked</p>
          <div style="margin-bottom: 12px;">
            <p style="font-weight: 700; margin-bottom: 4px;">Infrastructure Analyzer</p>
            <p style="font-size: 13px; color: rgba(255,255,255,0.5);">Benchmark your payments, shipping, and SaaS against real network rates.</p>
          </div>
          <div style="margin-bottom: 12px;">
            <p style="font-weight: 700; margin-bottom: 4px;">Network Deals</p>
            <p style="font-size: 13px; color: rgba(255,255,255,0.5);">Pre-negotiated conditions on Stripe, DHL, Klaviyo and more.</p>
          </div>
          <div>
            <p style="font-weight: 700; margin-bottom: 4px;">Member Network</p>
            <p style="font-size: 13px; color: rgba(255,255,255,0.5);">Connect with 1,000+ independent brands across Europe.</p>
          </div>
        </div>

        <p style="font-size: 13px; color: #666; line-height: 1.6; margin-bottom: 24px;">
          Start with the Analyzer — it takes 2 minutes and identifies exactly where your infrastructure is costing you more than it should.
        </p>

        <a href="https://thenode.co/Analyzer" style="display: inline-block; background: #111; color: #fff; text-decoration: none; font-weight: 700; font-size: 14px; padding: 14px 28px; border-radius: 100px;">
          Run the Analyzer →
        </a>

        <div style="margin-top: 48px; padding-top: 24px; border-top: 1px solid #eee;">
          <p style="font-size: 11px; color: #ccc;">THE NoDE · Infrastructure leverage for independent brands</p>
        </div>
      </div>
    `,
  });

  return Response.json({ ok: true });
});