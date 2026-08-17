// DASHBOARD-C9 (2026-08-17) — Finance admin surface. Logical route, view+action.
//
// Hosted on adminSummaries behind the `finance_` prefix, like the pipeline, audits and
// recover workspaces. No new physical function: the quota stays at 276.
import { buildFinanceSnapshot } from './financeCore.ts';
import {
  applyBillingIdentity, buildRevenueProjection, BILLING_IDENTITY_FIELDS,
  BILLING_PROTECTED_FIELDS, confirmB2bStatus, FINANCE_TABS, financeTab,
  previewBillingIdentity, readBillingIdentity, tabCombinationNote,
} from './financeWorkspaceCore.ts';

export const FINANCE_ADMIN_VERSION = 'finance-admin-1.0.0';
const text = (value: unknown) => String(value ?? '').trim();
const json = (body: unknown, status = 200) => Response.json(body as any, { status });

async function sha256(value: unknown) {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function handleFinanceAdminAction(user: any, body: any, svc: any, deps: { now?: () => string } = {}) {
  const action = text(body?.action);
  const actor = text(user?.email) || text(user?.id);
  if (!actor) return json({ error: 'unidentified_actor' }, 401);
  const now = (deps.now || (() => new Date().toISOString()))();

  if (action === 'tabs') {
    // Exposed so the page renders the tabs the handler actually serves, and carries
    // each tab's double-count note rather than restating the rule in the UI.
    return json({
      ok: true,
      tabs: FINANCE_TABS.map((tab) => ({
        key: tab.key, label: tab.label, hosts: tab.hosts,
        domains: [...tab.domains], combination_note: tabCombinationNote(tab.key),
      })),
    });
  }

  if (action === 'overview') {
    return json(await buildFinanceSnapshot({
      svc, now, contextId: crypto.randomUUID(), filters: body?.filters || {},
    }));
  }

  if (action === 'revenue') {
    return json(await buildRevenueProjection({
      svc, now, contextId: crypto.randomUUID(), filters: body?.filters || {},
    }));
  }

  if (action === 'billing_identity_fields') {
    return json({
      ok: true,
      editable_fields: [...BILLING_IDENTITY_FIELDS],
      protected_fields: BILLING_PROTECTED_FIELDS.map((row) => ({ field: row.field, why: row.why })),
    });
  }

  if (action === 'billing_identity_view') {
    if (!text(body?.brand_id)) return json({ error: 'brand_id_required' }, 400);
    const result = await readBillingIdentity({ svc, brand_id: text(body.brand_id) });
    return result.ok ? json(result) : json(result, 404);
  }

  if (action === 'preview_billing_identity') {
    if (!text(body?.brand_id)) return json({ error: 'brand_id_required' }, 400);
    const result = await previewBillingIdentity({
      svc, brand_id: text(body.brand_id), patch: body?.patch || {}, sha256,
    });
    return result.ok ? json(result) : json(result, 409);
  }

  if (action === 'apply_billing_identity') {
    if (!text(body?.expected_preview_hash)) {
      // The operator applies the change they were shown, including the consequences
      // the preview stated — such as a revoked B2B confirmation.
      return json({ error: 'expected_preview_hash_required' }, 400);
    }
    const result = await applyBillingIdentity({
      svc, actor, brand_id: text(body?.brand_id), patch: body?.patch || {},
      expected_preview_hash: text(body.expected_preview_hash), now, sha256,
    });
    return result.ok ? json(result) : json(result, 409);
  }

  if (action === 'confirm_b2b_status') {
    if (!text(body?.brand_id)) return json({ error: 'brand_id_required' }, 400);
    const result = await confirmB2bStatus({ svc, actor, brand_id: text(body.brand_id), now });
    return result.ok ? json(result) : json(result, 409);
  }

  if (action === 'tab_meta') {
    const tab = financeTab(body?.tab);
    if (!tab) return json({ error: 'unknown_tab', tab: text(body?.tab) }, 400);
    return json({ ok: true, tab: tab.key, domains: [...tab.domains], combination_note: tabCombinationNote(tab.key) });
  }

  return json({ error: 'finance_action_not_implemented', action }, 400);
}
