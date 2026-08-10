import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';

/**
 * getWaitlistLeads — admin-only endpoint that returns all Lead records
 * created via the "Join to recover" flow (source_page starts with
 * "landing_waitlist" or "analyzer_teaser_waitlist").
 *
 * Uses service role internally because waitlist leads are created by
 * anonymous public visitors (created_by = service_*), so a user-scoped
 * read wouldn't return them.
 *
 * Auth: caller must be authenticated AND have role="admin".
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const all = await base44.asServiceRole.entities.Lead.list('-created_date', 500);
    const waitlist = (all || []).filter((l) =>
      typeof l.source_page === 'string' &&
      (l.source_page.startsWith('landing_waitlist') ||
       l.source_page.startsWith('analyzer_teaser_waitlist'))
    );

    // Count fresh signups (last 24h) for the sidebar badge
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    const fresh_24h = waitlist.filter(l =>
      l.created_date && new Date(l.created_date).getTime() >= cutoff
    ).length;

    return Response.json({ leads: waitlist, total: waitlist.length, fresh_24h });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});