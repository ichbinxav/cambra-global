import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import { quarantineProbe } from '../../shared/internalGate.ts';
import { internalErrorResponse } from '../../shared/publicErrors.ts';

/**
 * One-shot admin helper — invites a new admin user, or promotes an existing
 * user to admin. Guarded to admins only. Idempotent: safe to call twice.
 */
// [QUARANTINE 2026-08-15] PURGE-2 (2026-07-24): admin utility with no src caller — kept with probe.
Deno.serve(async (req) => {
  await quarantineProbe(createClientFromRequest(req), "inviteAdminUser");
  try {
    const base44 = createClientFromRequest(req);
    const caller = await base44.auth.me();
    if (!caller) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (caller.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const { email } = await req.json();
    if (!email) return Response.json({ error: 'email required' }, { status: 400 });

    // If the user already exists, just promote them.
    const existing = await base44.asServiceRole.entities.User.filter({ email });
    if (existing.length > 0) {
      const u = existing[0];
      if (u.role !== 'admin') {
        await base44.asServiceRole.entities.User.update(u.id, { role: 'admin' });
        return Response.json({ action: 'promoted_existing', email: u.email });
      }
      return Response.json({ action: 'already_admin', email: u.email });
    }

    // Otherwise send an invite as the admin caller.
    const result = await base44.users.inviteUser(email, 'admin');
    return Response.json({ action: 'invited', email, result });
  } catch (error) {
    return internalErrorResponse(error, 'inviteAdminUser');
  }
});