import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';
import { requireAdminOrInternal } from '../../shared/internalGate.ts';

// Email 4: Welcome to CAMBRA — triggered when a Brand entity is created (onboarding complete)
Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  // SECURITY-2 (2026-07-24) — canonical gate replacing the inverted pattern
  // (anonymous used to pass). Platform automations authenticate as the
  // app-owner admin (verified empirically), so automation triggers still work;
  // anonymous curl no longer does.
  const body = await req.json().catch(() => ({}));
  const gate = await requireAdminOrInternal(req, base44, body);
  if (!gate.ok) return gate.response;
  const { data } = body;

  if (!data) return Response.json({ ok: true });

  // Get the user who created this brand
  const userEmail = data.created_by;
  const brandName = data.name || "your brand";

  if (!userEmail) return Response.json({ ok: true });

  // SECURITY-1 — anti-forgery: only email when the referenced Brand actually
  // exists and its stored creator matches the payload. Kills anonymous
  // curl-with-forged-payload email spam through our sending domain.
  const brand = data.id
    ? await base44.asServiceRole.entities.Brand.get(data.id).catch(() => null)
    : null;
  if (!brand || brand.created_by !== userEmail) {
    return Response.json({ ok: true, skipped: "unverified_payload" });
  }

  const appDomain = Deno.env.get('APP_DOMAIN') || 'cambra.global';

  await base44.asServiceRole.integrations.Core.SendEmail({
    from_name: "CAMBRA",
    to: userEmail,
    subject: "Welcome to CAMBRA — let's see what you're paying",
    body: `
      <div style="font-family: -apple-system, sans-serif; max-width: 560px; margin: 0 auto; padding: 40px 32px; color: #111;">
        <p style="font-size: 11px; letter-spacing: 0.2em; text-transform: uppercase; color: #999; margin-bottom: 32px;">CAMBRA</p>
        <h1 style="font-size: 32px; font-weight: 900; letter-spacing: -0.04em; line-height: 1; margin-bottom: 12px;">
          Welcome, ${brandName}.
        </h1>
        <p style="color: #666; font-size: 15px; line-height: 1.6; margin-bottom: 32px;">
          You've joined CAMBRA — we help independent businesses stop overpaying on card payments.
        </p>

        <div style="background: #111; color: #fff; border-radius: 16px; padding: 28px; margin-bottom: 32px;">
          <p style="font-size: 11px; letter-spacing: 0.2em; text-transform: uppercase; color: rgba(255,255,255,0.35); margin-bottom: 16px;">What's unlocked</p>
          <div style="margin-bottom: 12px;">
            <p style="font-weight: 700; margin-bottom: 4px;">The analyzer</p>
            <p style="font-size: 13px; color: rgba(255,255,255,0.5);">See what you pay on card payments, and the minimum banks and card networks allow.</p>
          </div>
          <div style="margin-bottom: 12px;">
            <p style="font-weight: 700; margin-bottom: 4px;">Verified figures</p>
            <p style="font-size: 13px; color: rgba(255,255,255,0.5);">Connect your payment provider, read-only, and your estimate becomes a measured number.</p>
          </div>
          <div>
            <p style="font-weight: 700; margin-bottom: 4px;">The collective</p>
            <p style="font-size: 13px; color: rgba(255,255,255,0.5);">Many businesses negotiating as one for a better card rate.</p>
          </div>
        </div>

        <p style="font-size: 13px; color: #666; line-height: 1.6; margin-bottom: 24px;">
          Start with the analyzer — two minutes, and it shows exactly where your card payments cost more than they should.
        </p>

        <a href="https://${appDomain}/Analyzer" style="display: inline-block; background: #111; color: #fff; text-decoration: none; font-weight: 700; font-size: 14px; padding: 14px 28px; border-radius: 100px;">
          Run the Analyzer →
        </a>

        <div style="margin-top: 48px; padding-top: 24px; border-top: 1px solid #eee;">
          <p style="font-size: 11px; color: #ccc;">CAMBRA · Payments margin recovery</p>
        </div>
      </div>
    `,
  });

  return Response.json({ ok: true });
});