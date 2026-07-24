import { createClientFromRequest } from 'npm:@base44/sdk@0.8.26';
import { quarantineProbe } from '../../shared/internalGate.ts';

// [QUARANTINE 2026-08-15] PURGE-2 (2026-07-24): zero references from src or live functions.
// Invocation probe below logs any real use to OperationalLog before the second sweep.
Deno.serve(async (req) => {
  await quarantineProbe(createClientFromRequest(req), "authzScope");
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const isAdmin = user.role === 'admin';
    let brandId = null;
    let providerIds = [];

    try {
      const brands = await base44.entities.Brand.filter({ created_by: user.email }, '-created_date', 1);
      brandId = brands?.[0]?.id || null;
    } catch {}

    try {
      const providers = await base44.entities.Provider.filter({ contact_email: user.email });
      const managed = await base44.entities.Provider.filter({ account_manager: user.email });
      const set = new Set([...(providers||[]).map(p=>p.id), ...(managed||[]).map(p=>p.id)]);
      providerIds = Array.from(set);
    } catch {}

    return Response.json({ scope: { isAdmin, brandId, providerIds, user_email: user.email } });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});