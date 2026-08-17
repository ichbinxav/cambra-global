// DASHBOARD-C10 (2026-08-17) — Intelligence admin surface. Logical route, view+action.
//
// Hosted on adminSummaries behind the `intelligence_` prefix. No new physical function.
//
// The actions here are the exit that did not exist for a RateChangeCandidate. The
// watcher has been detecting pricing changes every six hours and writing them to a table
// no code read, so the backlog had no way out — not even a way to dismiss a row.
import {
  applyPromotion, buildPromotionQueue, previewPromotion, rejectCandidate,
} from './intelligencePromotionCore.ts';
import { buildIntelligencePortfolio, INTELLIGENCE_TABS } from './intelligenceWorkspaceCore.ts';

export const INTELLIGENCE_ADMIN_VERSION = 'intelligence-admin-1.0.0';
const text = (value: unknown) => String(value ?? '').trim();
const json = (body: unknown, status = 200) => Response.json(body as any, { status });

async function sha256(value: unknown) {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function handleIntelligenceAdminAction(user: any, body: any, svc: any, deps: { now?: () => string } = {}) {
  const action = text(body?.action);
  const actor = text(user?.email) || text(user?.id);
  if (!actor) return json({ error: 'unidentified_actor' }, 401);
  const now = (deps.now || (() => new Date().toISOString()))();

  if (action === 'tabs') {
    return json({ ok: true, tabs: INTELLIGENCE_TABS.map((tab) => ({ ...tab })) });
  }

  if (action === 'portfolio' || action === 'list') {
    return json(await buildIntelligencePortfolio({
      svc, now, contextId: crypto.randomUUID(), filters: body?.filters || {},
    }));
  }

  if (action === 'promotion_queue') {
    return json(await buildPromotionQueue({ svc, limit: Number(body?.limit) || undefined }));
  }

  if (action === 'preview_promotion') {
    if (!text(body?.candidate_id)) return json({ error: 'candidate_id_required' }, 400);
    const result = await previewPromotion({ svc, candidate_id: text(body.candidate_id), sha256 });
    return result.ok ? json(result) : json(result, 409);
  }

  if (action === 'apply_promotion') {
    if (!text(body?.expected_preview_hash)) return json({ error: 'expected_preview_hash_required' }, 400);
    if (!text(body?.reason)) return json({ error: 'reason_required' }, 400);
    const result = await applyPromotion({
      svc, actor, candidate_id: text(body?.candidate_id), reason: text(body.reason),
      expected_preview_hash: text(body.expected_preview_hash), now, sha256,
    });
    return result.ok ? json(result) : json(result, 409);
  }

  if (action === 'reject_candidate') {
    if (!text(body?.reason)) {
      // A dismissal without a reason is indistinguishable from an accident six months on.
      return json({ error: 'reason_required' }, 400);
    }
    const result = await rejectCandidate({
      svc, actor, candidate_id: text(body?.candidate_id), reason: text(body.reason), now,
    });
    return result.ok ? json(result) : json(result, 409);
  }

  return json({ error: 'intelligence_action_not_implemented', action }, 400);
}
