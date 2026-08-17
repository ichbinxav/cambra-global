// DASHBOARD-C6 (2026-08-17) — Recover admin surface. Logical route, view+action.
import { buildRecoverPortfolio, openRecoverCase, previewOpenCase } from './recoverCore.ts';

export const RECOVER_ADMIN_VERSION = 'recover-admin-1.0.0';
const text = (value: unknown) => String(value ?? '').trim();
const json = (body: unknown, status = 200) => Response.json(body as any, { status });

async function sha256(value: unknown) {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function handleRecoverAdminAction(user: any, body: any, svc: any, deps: { now?: () => string } = {}) {
  const action = text(body?.action);
  const actor = text(user?.email) || text(user?.id);
  if (!actor) return json({ error: 'unidentified_actor' }, 401);
  const now = (deps.now || (() => new Date().toISOString()))();

  if (action === 'portfolio' || action === 'list') {
    return json(await buildRecoverPortfolio({
      svc, now, contextId: crypto.randomUUID(),
      filters: body?.filters || {},
      direction: body?.direction === 'asc' ? 'asc' : 'desc',
      limit: Number(body?.limit) || undefined, cursor: Number(body?.cursor) || 0,
    }));
  }

  if (action === 'preview_open_case') {
    if (!text(body?.opportunity_id)) return json({ error: 'opportunity_id_required' }, 400);
    const result = await previewOpenCase({ svc, opportunity_id: text(body.opportunity_id), now, sha256 });
    return result.ok ? json(result) : json(result, 409);
  }

  if (action === 'open_case') {
    if (!text(body?.expected_preview_hash)) {
      // A case may only be opened as previewed, so the founder cannot approve one
      // opportunity and have a case opened against another.
      return json({ error: 'expected_preview_hash_required' }, 400);
    }
    const result = await openRecoverCase({
      svc, actor, opportunity_id: text(body.opportunity_id),
      expected_preview_hash: text(body.expected_preview_hash), now, sha256,
    });
    return result.ok ? json(result) : json(result, 409);
  }

  return json({ error: 'recover_action_not_implemented', action }, 400);
}
