// DASHBOARD-C3 (2026-08-17) — Pipeline workspace admin surface.
//
// Hosted as a logical route on an existing entry point. Same view+action shape as
// getFounderControlCenter/merchants, which is the founder-approved reference:
// one function, an action discriminator, and zero generic entity CRUD.

import { buildPipelinePortfolio, previewStageChange, applyStageChange } from './pipelineCore.ts';
import { LANES, type Lane } from './pipelineStageRegistry.ts';

export const PIPELINE_ADMIN_VERSION = 'pipeline-admin-1.0.0';

const text = (value: unknown) => String(value ?? '').trim();
const json = (body: unknown, status = 200) => Response.json(body as any, { status });

async function sha256(value: unknown) {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function handlePipelineAdminAction(user: any, body: any, svc: any, deps: { now?: () => string } = {}) {
  const action = text(body?.action);
  const actor = text(user?.email) || text(user?.id);
  if (!actor) return json({ error: 'unidentified_actor' }, 401);
  const now = (deps.now || (() => new Date().toISOString()))();

  const lanes = Array.isArray(body?.lanes)
    ? (body.lanes.map(text).filter((lane: string) => (LANES as readonly string[]).includes(lane)) as Lane[])
    : undefined;

  if (action === 'portfolio' || action === 'list') {
    return json(await buildPipelinePortfolio({
      svc, now, contextId: crypto.randomUUID(),
      filters: body?.filters || {}, sort: text(body?.sort) || undefined,
      direction: body?.direction === 'asc' ? 'asc' : 'desc',
      lanes, limit: Number(body?.limit) || undefined, cursor: Number(body?.cursor) || 0,
    }));
  }

  if (action === 'preview_stage_change') {
    if (!text(body?.lane) || !text(body?.subject_id) || !text(body?.to_stage)) {
      return json({ error: 'lane_subject_and_to_stage_required' }, 400);
    }
    const result = await previewStageChange({
      svc, lane: text(body.lane), subject_id: text(body.subject_id),
      to_stage: text(body.to_stage), automatic: false,
      reason_code: text(body?.reason_code) || null, now, sha256,
    });
    return result.ok ? json(result) : json(result, 409);
  }

  if (action === 'apply_stage_change') {
    if (!text(body?.expected_preview_hash)) {
      // A change must be applied only as previewed, so the founder cannot approve
      // one thing and have another happen.
      return json({ error: 'expected_preview_hash_required' }, 400);
    }
    const result = await applyStageChange({
      svc, actor, actor_kind: 'FOUNDER',
      lane: text(body.lane), subject_id: text(body.subject_id), to_stage: text(body.to_stage),
      automatic: false, reason_code: text(body?.reason_code) || null,
      reason_detail: text(body?.reason_detail) || null,
      expected_preview_hash: text(body.expected_preview_hash), now, sha256,
    });
    return result.ok ? json(result) : json(result, 409);
  }

  return json({ error: 'pipeline_action_not_implemented', action }, 400);
}
