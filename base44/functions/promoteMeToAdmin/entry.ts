import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    // Check if there's already at least one admin
    const admins = await base44.asServiceRole.entities.User.filter({ role: 'admin' });
    const hasAdmin = Array.isArray(admins) && admins.length > 0;

    if (hasAdmin && user.role !== 'admin') {
      return Response.json({ error: 'Forbidden: An admin already exists. Ask an admin to grant access.' }, { status: 403 });
    }

    // Promote current user to admin (allowed if no admins exist or already admin)
    await base44.asServiceRole.entities.User.update(user.id, { role: 'admin' });
    const me = await base44.auth.me();

    return Response.json({ success: true, user: me });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});