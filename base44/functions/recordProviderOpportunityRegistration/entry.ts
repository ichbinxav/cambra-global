import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import { handleProviderOpportunityRegistrationAction } from '../../shared/providerOpportunityRegistrationAdmin.ts';

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return Response.json({ ok: false, error: 'method_not_allowed' }, { status: 405 });
  }
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user || user.role !== 'admin') {
      return Response.json({ ok: false, error: 'forbidden' }, { status: 403 });
    }
    const body = await req.json().catch(() => ({}));
    return handleProviderOpportunityRegistrationAction(user, body, base44.asServiceRole);
  } catch (error) {
    console.error('recordProviderOpportunityRegistration failed', error);
    return Response.json({ ok: false, error: 'provider_opportunity_registration_failed' }, { status: 500 });
  }
});
