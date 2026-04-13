import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // automation payload
    const payload = await req.json();
    const evt = payload?.event;
    const data = payload?.data;

    // If payload is too large or missing data, fetch it
    let result = data;
    if (!result && evt?.entity_id) {
      result = await base44.asServiceRole.entities.AnalyzerResult.filter({ id: evt.entity_id }).then(r => r?.[0]);
    }

    if (!result) {
      return Response.json({ ok: false, reason: 'No result data' }, { status: 400 });
    }

    const to = result.created_by || (await base44.auth.me())?.email;
    const total = result.total_savings || 0;

    await base44.asServiceRole.integrations.Core.SendEmail({
      to,
      subject: 'Your THE NoDE analysis is ready',
      body: `Your analysis has been created.\n\nIdentified annual savings: €${Number(total).toLocaleString()}\n\nOpen your dashboard to see details.\n\n— THE NoDE`
    });

    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});