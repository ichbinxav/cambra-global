import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import { requireAdminOrInternal } from '../../shared/internalGate.ts';
import { welcomeEmail } from '../../shared/emails/welcome.ts';
import { emergencyState } from '../../shared/operationalControl.ts';
import { sendCostGovernedEmail } from '../../shared/costGovernance.ts';

// Email 4: Welcome to CAMBRA — triggered when a Brand entity is created (onboarding complete)
//
// EMAIL-1 (2026-07-31): the inline English-only template moved to
// base44/shared/emails/welcome.ts, localized EN/FR/ES. Routing/auth/anti-forgery
// logic below is untouched.
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

  // EMAIL-1 T4 — the language comes from the STORED Brand record (written at
  // creation from the active UI language), never from the request payload:
  // this function is automation-triggered and the request carries no user
  // context. Missing/unknown values resolve to 'en' inside welcomeEmail.
  const emergency = await emergencyState(base44.asServiceRole);
  if (emergency.safe_mode || emergency.communications_paused) return Response.json({ ok:true, skipped:'emergency_control_paused:communications' });
  const mail = welcomeEmail(brand.locale, { brandName, appDomain });

  await sendCostGovernedEmail(base44.asServiceRole, { event_key:`email:brand-welcome:${brand.id}`, source:'onBrandCreated', related_entity_type:'Brand', related_entity_id:brand.id }, {
    from_name: "CAMBRA",
    to: userEmail,
    subject: mail.subject,
    body: mail.html,
  });

  return Response.json({ ok: true });
});
