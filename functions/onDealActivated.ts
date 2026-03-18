import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const body = await req.json();

  const { data, event } = body;
  if (!data) return Response.json({ ok: true });

  // Only trigger on create or update to active/waitlist
  if (!["active", "waitlist"].includes(data.status)) {
    return Response.json({ ok: true });
  }

  const isActive = data.status === "active";
  const userEmail = data.user_email;
  const dealName = data.deal_name;
  const provider = data.provider;
  const savings = data.estimated_savings ? `€${data.estimated_savings.toLocaleString()}/yr` : null;

  // Email 1: Internal notification to THE NoDE team
  await base44.asServiceRole.integrations.Core.SendEmail({
    from_name: "THE NoDE · Deals",
    to: "94.martinez.x@gmail.com",
    subject: isActive
      ? `[Deal Request] ${userEmail} → ${provider}`
      : `[Access List] ${userEmail} → ${provider}`,
    body: `
      <div style="font-family: monospace; max-width: 560px; margin: 0 auto; padding: 32px; color: #111;">
        <p style="font-size: 11px; letter-spacing: 0.2em; text-transform: uppercase; color: #999; margin-bottom: 24px;">THE NoDE · Internal</p>
        <h2 style="font-size: 22px; font-weight: 900; margin-bottom: 4px;">
          ${isActive ? "New deal request" : "New access list signup"}
        </h2>
        <p style="color: #666; margin-bottom: 32px;">A member has ${isActive ? "requested preferred terms" : "joined the access list"} for <strong>${provider}</strong>.</p>
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 32px;">
          <tr><td style="padding: 10px 0; border-bottom: 1px solid #eee; color: #999; font-size: 12px;">Member</td><td style="padding: 10px 0; border-bottom: 1px solid #eee; font-weight: bold;">${userEmail}</td></tr>
          <tr><td style="padding: 10px 0; border-bottom: 1px solid #eee; color: #999; font-size: 12px;">Deal</td><td style="padding: 10px 0; border-bottom: 1px solid #eee;">${dealName}</td></tr>
          <tr><td style="padding: 10px 0; border-bottom: 1px solid #eee; color: #999; font-size: 12px;">Provider</td><td style="padding: 10px 0; border-bottom: 1px solid #eee;">${provider}</td></tr>
          <tr><td style="padding: 10px 0; border-bottom: 1px solid #eee; color: #999; font-size: 12px;">Status</td><td style="padding: 10px 0; border-bottom: 1px solid #eee;">${data.status}</td></tr>
          ${savings ? `<tr><td style="padding: 10px 0; color: #999; font-size: 12px;">Est. benefit</td><td style="padding: 10px 0; font-weight: bold; color: #16a34a;">${savings}</td></tr>` : ""}
        </table>
        <p style="font-size: 11px; color: #bbb;">Action required: follow up with this member within 5 business days.</p>
      </div>
    `,
  });

  // Email 2 or 3: Confirmation to the user
  await base44.asServiceRole.integrations.Core.SendEmail({
    from_name: "THE NoDE",
    to: userEmail,
    subject: isActive
      ? `Your request for ${provider} preferred terms — confirmed`
      : `You're on the access list — ${provider}`,
    body: isActive ? `
      <div style="font-family: -apple-system, sans-serif; max-width: 560px; margin: 0 auto; padding: 40px 32px; color: #111;">
        <p style="font-size: 11px; letter-spacing: 0.2em; text-transform: uppercase; color: #999; margin-bottom: 32px;">THE NoDE · Network Deals</p>
        <h1 style="font-size: 28px; font-weight: 900; letter-spacing: -0.04em; margin-bottom: 8px;">Request confirmed.</h1>
        <p style="color: #666; font-size: 15px; line-height: 1.6; margin-bottom: 32px;">
          We've received your request for preferred <strong>${provider}</strong> conditions. THE NoDE is submitting this on your behalf — you'll receive a follow-up within 5 business days.
        </p>
        <div style="background: #f9f9f9; border: 1px solid #eee; border-radius: 12px; padding: 20px; margin-bottom: 32px;">
          <p style="font-size: 11px; letter-spacing: 0.15em; text-transform: uppercase; color: #999; margin-bottom: 12px;">Deal summary</p>
          <p style="font-weight: 700; font-size: 16px; margin-bottom: 4px;">${dealName}</p>
          <p style="color: #666; font-size: 14px; margin-bottom: 12px;">${provider}</p>
          ${savings ? `<p style="font-size: 20px; font-weight: 900; color: #16a34a;">${savings} estimated benefit</p>` : ""}
        </div>
        <p style="font-size: 12px; color: #bbb; line-height: 1.6;">
          This deal is managed exclusively by THE NoDE. Your preferred conditions are negotiated collectively — you never need to approach ${provider} directly.
        </p>
        <div style="margin-top: 40px; padding-top: 24px; border-top: 1px solid #eee;">
          <p style="font-size: 11px; color: #ccc;">THE NoDE · Infrastructure leverage for independent brands</p>
        </div>
      </div>
    ` : `
      <div style="font-family: -apple-system, sans-serif; max-width: 560px; margin: 0 auto; padding: 40px 32px; color: #111;">
        <p style="font-size: 11px; letter-spacing: 0.2em; text-transform: uppercase; color: #999; margin-bottom: 32px;">THE NoDE · Network Deals</p>
        <h1 style="font-size: 28px; font-weight: 900; letter-spacing: -0.04em; margin-bottom: 8px;">You're on the list.</h1>
        <p style="color: #666; font-size: 15px; line-height: 1.6; margin-bottom: 32px;">
          You've been added to the access list for <strong>${provider}</strong> preferred conditions. We'll notify you the moment this becomes available to network members.
        </p>
        <div style="background: #f9f9f9; border: 1px solid #eee; border-radius: 12px; padding: 20px; margin-bottom: 32px;">
          <p style="font-size: 11px; letter-spacing: 0.15em; text-transform: uppercase; color: #999; margin-bottom: 12px;">Registered interest</p>
          <p style="font-weight: 700; font-size: 16px; margin-bottom: 4px;">${dealName}</p>
          <p style="color: #666; font-size: 14px;">${provider}</p>
          ${savings ? `<p style="font-size: 14px; color: #16a34a; font-weight: 600; margin-top: 8px;">Estimated benefit: ${savings}</p>` : ""}
        </div>
        <p style="font-size: 12px; color: #bbb; line-height: 1.6;">
          THE NoDE is actively negotiating with ${provider}. Your position on the list is confirmed — no further action needed.
        </p>
        <div style="margin-top: 40px; padding-top: 24px; border-top: 1px solid #eee;">
          <p style="font-size: 11px; color: #ccc;">THE NoDE · Infrastructure leverage for independent brands</p>
        </div>
      </div>
    `,
  });

  return Response.json({ ok: true });
});