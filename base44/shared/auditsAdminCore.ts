// DASHBOARD-C4 (2026-08-17) — Audits & Opportunities admin surface.
// Logical route on an existing host, same view+action shape as Merchants.
import { buildAuditsPortfolio, previewRecoverHandoff } from './auditsCore.ts';

export const AUDITS_ADMIN_VERSION = 'audits-admin-1.0.0';
const text = (value: unknown) => String(value ?? '').trim();
const json = (body: unknown, status = 200) => Response.json(body as any, { status });

export async function handleAuditsAdminAction(user: any, body: any, svc: any, deps: { now?: () => string } = {}) {
  const action = text(body?.action);
  if (!(text(user?.email) || text(user?.id))) return json({ error: 'unidentified_actor' }, 401);
  const now = (deps.now || (() => new Date().toISOString()))();

  if (action === 'portfolio' || action === 'list') {
    return json(await buildAuditsPortfolio({
      svc, now, contextId: crypto.randomUUID(),
      filters: body?.filters || {}, sort: text(body?.sort) || undefined,
      direction: body?.direction === 'asc' ? 'asc' : 'desc',
      tab: body?.tab === 'opportunities' ? 'opportunities' : 'audits',
      limit: Number(body?.limit) || undefined, cursor: Number(body?.cursor) || 0,
    }));
  }

  if (action === 'preview_recover_handoff') {
    if (!text(body?.opportunity_id)) return json({ error: 'opportunity_id_required' }, 400);
    const result = await previewRecoverHandoff({ svc, opportunity_id: text(body.opportunity_id), now });
    return result.ok ? json(result) : json(result, 409);
  }

  return json({ error: 'audits_action_not_implemented', action }, 400);
}
