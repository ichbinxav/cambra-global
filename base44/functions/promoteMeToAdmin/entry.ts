import { createClientFromRequest } from 'npm:@base44/sdk@0.8.26';

// Endpoint classification: AUTH_REQUIRED (bootstrap-gated ADMIN_REQUIRED).
// This is the ONLY function that can elevate a user to admin. Auth is layered:
//   1. Caller must be authenticated (401 otherwise).
//   2. If no admin exists yet (bootstrap), caller must match FOUNDER_EMAIL or
//      ADMIN_ALLOWLIST_EMAILS, or present the ADMIN_SETUP_TOKEN.
//   3. If an admin already exists, caller must both be in ADMIN_ALLOWLIST_EMAILS
//      AND present the ADMIN_SETUP_TOKEN — two-factor by policy.
// asServiceRole justification: role elevation writes to User which is
// admin-write RLS. All the policy gates run before the service-role write.

function parseList(v){ return (v||'').split(',').map(s=>s.trim().toLowerCase()).filter(Boolean); }

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const allow = parseList(Deno.env.get('ADMIN_ALLOWLIST_EMAILS'));
    const founder = (Deno.env.get('FOUNDER_EMAIL')||'').toLowerCase();
    const setupToken = Deno.env.get('ADMIN_SETUP_TOKEN');
    const body = await req.json().catch(()=>({}));
    const token = body?.token;

    const admins = await base44.asServiceRole.entities.User.filter({ role: 'admin' });
    const hasAdmin = Array.isArray(admins) && admins.length > 0;

    const email = (user.email||'').toLowerCase();

    if (user.role === 'admin') {
      return Response.json({ success: true, user });
    }

    if (!hasAdmin) {
      if (email === founder || allow.includes(email) || (setupToken && token === setupToken)) {
        await base44.asServiceRole.entities.User.update(user.id, { role: 'admin' });
        const me = await base44.auth.me();
        return Response.json({ success: true, user: me, bootstrap: true });
      }
      return Response.json({ error: 'Forbidden: Not in founder/allowlist and no valid setup token' }, { status: 403 });
    }

    if (allow.includes(email) && setupToken && token === setupToken) {
      await base44.asServiceRole.entities.User.update(user.id, { role: 'admin' });
      const me = await base44.auth.me();
      return Response.json({ success: true, user: me, via: 'allowlist+token' });
    }

    return Response.json({ error: 'Forbidden' }, { status: 403 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});