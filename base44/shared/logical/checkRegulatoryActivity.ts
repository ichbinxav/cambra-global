// AUDIT 2026-08-18 — moved out of base44/functions/checkRegulatoryActivity/entry.ts. Host functions
// import this module directly: a relative import into another function's tree
// cannot be bundled, so every host of this logical route silently failed to
// deploy and kept serving stale code.
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import { requireAdminOrInternal } from '../internalGate.ts';
import { REGULATORY_ACTIVITIES } from '../regulatoryControl.ts';
import { auditRegulatoryDecision, evaluateRegulatoryActivityRuntime } from '../regulatoryRuntime.ts';

export async function handleCheckRegulatoryActivity(req: Request) {
  try {
    const base44 = createClientFromRequest(req); const body = await req.json().catch(() => ({})); const gate = await requireAdminOrInternal(req, base44, body); if (!gate.ok) return gate.response;
    const jurisdiction = String(body.jurisdiction || '').toUpperCase(); const activity = String(body.activity || '').toUpperCase();
    if (!/^[A-Z]{2}$/.test(jurisdiction) || !REGULATORY_ACTIVITIES.includes(activity as any)) return Response.json({ ok:false,error:'valid_jurisdiction_and_activity_required' }, { status:400 });
    const decision = await evaluateRegulatoryActivityRuntime(base44.asServiceRole, { ...body,jurisdiction,activity,actor_type:body.actor_type || 'regulatory_check' });
    await auditRegulatoryDecision(base44.asServiceRole, body, decision);
    return Response.json({ ok:true,decision });
  } catch (error) { console.error(error); return Response.json({ ok:false,error:'regulatory_activity_check_failed' }, { status:500 }); }
}
