import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * submitWaitlistSignup
 *
 * Captures a "Join to recover" waitlist signup from public surfaces
 * (landing hero, HowItWorks step 04, Analyzer teaser).
 *
 * Behavior:
 *   1. Validates email.
 *   2. Persists as a Lead record (source_page marks WHERE it came from).
 *   3. Sends a notification email to the admin so they know immediately.
 *
 * Public endpoint — no auth required (users are anonymous on the landing).
 */

const ADMIN_EMAIL = "94.martinez.x@gmail.com";

Deno.serve(async (req) => {
  try {
    if (req.method !== "POST") {
      return Response.json({ ok: false, error: "method_not_allowed" }, { status: 405 });
    }

    const body = await req.json().catch(() => ({}));
    const email = String(body?.email || "").trim().toLowerCase();
    const source = String(body?.source || "waitlist").trim();
    const context = body?.context || {};

    // Basic email validation
    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    if (!emailOk) {
      return Response.json({ ok: false, error: "invalid_email" }, { status: 400 });
    }

    const base44 = createClientFromRequest(req);

    // Persist as Lead (service-role — anonymous public users)
    const notes = [
      `Waitlist signup: ${source}`,
      context.brand_name ? `Brand: ${context.brand_name}` : null,
      context.total_savings ? `Savings estimate: €${Number(context.total_savings).toLocaleString("fr-FR")}` : null,
      context.session_id ? `Session: ${context.session_id}` : null,
    ].filter(Boolean).join(" · ");

    const lead = await base44.asServiceRole.entities.Lead.create({
      email,
      consent: true, // user explicitly opted in by submitting the form
      source_page: source,
      notes,
    });

    // Notify admin — best-effort, never block the signup on email failure
    try {
      const subject = `New waitlist signup — ${email}`;
      const bodyText = [
        `A new brand joined the CAMBRA waitlist.`,
        ``,
        `Email: ${email}`,
        `Source: ${source}`,
        context.brand_name ? `Brand: ${context.brand_name}` : null,
        context.total_savings ? `Estimated savings: €${Number(context.total_savings).toLocaleString("fr-FR")} / year` : null,
        context.session_id ? `Analyzer session: ${context.session_id}` : null,
        ``,
        `Lead ID: ${lead.id}`,
      ].filter(Boolean).join("\n");

      await base44.asServiceRole.integrations.Core.SendEmail({
        to: ADMIN_EMAIL,
        subject,
        body: bodyText,
        from_name: "CAMBRA Waitlist",
      });
    } catch (emailErr) {
      console.warn("Admin notification email failed:", emailErr?.message);
    }

    return Response.json({ ok: true, lead_id: lead.id });
  } catch (error) {
    console.error("submitWaitlistSignup error:", error);
    return Response.json({ ok: false, error: error.message || "internal_error" }, { status: 500 });
  }
});