// Admin-only utility — sends ONE real test email to ADMIN_NOTIFICATION_EMAIL
// using the same Resend path production uses (RESEND_FROM + Reply-To).
// Purpose: confirm the sending domain (contact.cambra.global) is verified in
// Resend and that admin notifications land in the monitored inbox.
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const resendKey = Deno.env.get("RESEND_API_KEY");
    const fromAddress = Deno.env.get("RESEND_FROM") || "CAMBRA <hello@contact.cambra.global>";
    const adminEmail = Deno.env.get("ADMIN_NOTIFICATION_EMAIL") || "";

    if (!resendKey) return Response.json({ ok: false, error: "RESEND_API_KEY missing" }, { status: 500 });
    if (!adminEmail) return Response.json({ ok: false, error: "ADMIN_NOTIFICATION_EMAIL missing" }, { status: 500 });

    const subject = "CAMBRA · Admin notification test";
    const body = [
      "This is a real test email confirming the CAMBRA email pipeline.",
      "",
      `From: ${fromAddress}`,
      `To: ${adminEmail}`,
      `Reply-To: ${adminEmail}`,
      "",
      "If you received this in the hello@cambra.global inbox, the pipeline is live:",
      "  · contact.cambra.global verified as sender in Resend",
      "  · Admin notifications route to the root-domain inbox",
      "  · Replies come back to the monitored inbox",
      "",
      "— CAMBRA infrastructure",
    ].join("\n");

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${resendKey}`,
      },
      body: JSON.stringify({
        from: fromAddress,
        to: adminEmail,
        reply_to: adminEmail,
        subject,
        text: body,
      }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return Response.json({
        ok: false,
        sent: false,
        status: res.status,
        resend_error: data,
        from: fromAddress,
        to: adminEmail,
      });
    }

    return Response.json({
      ok: true,
      sent: true,
      resend_id: data?.id || null,
      from: fromAddress,
      to: adminEmail,
      reply_to: adminEmail,
    });
  } catch (error) {
    return Response.json({ ok: false, error: (error as any)?.message || "internal_error" }, { status: 500 });
  }
});