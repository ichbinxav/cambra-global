// DASHBOARD-C12 (2026-08-17) — integrations admin surface. Logical route, view+action.
//
// Hosted on adminSummaries behind the `integration_` prefix. No new physical function.
//
// These are the two CRITICAL browser writes the legacy-routes ratchet has carried since C0:
// an OAuth app minted by generic CRUD (which is also where PKCE enforcement, the redirect
// allowlist and the scope allowlist were decided) and a webhook endpoint created and
// hard-deleted from the browser.
import {
  applyOAuthApp, applyWebhookEndpoint, disableWebhookEndpoint, OAUTH_APP_INPUT_FIELDS,
  OAUTH_APP_SERVER_OWNED, previewOAuthApp, previewWebhookEndpoint, readIntegrationRegistry,
  refuseWebhookDelete, revokeOAuthApp, WEBHOOK_EVENT_CATALOG, WEBHOOK_INPUT_FIELDS,
  WEBHOOK_SERVER_OWNED, WEBHOOK_TOOLS,
} from './integrationRegistryCore.ts';
import { PRIVILEGED_SCOPES, VALID_SCOPES } from './apiScopeCatalog.ts';
// DASHBOARD-C15: the last three direct browser writes — Organization plan terms, the
// mislabelled "suspend", and admin notes with an unidentified author.
import {
  applyOrganization, cancelOrganization, planCatalogView, previewOrganization,
  recordAdminNote, refuseDealApplicationWrite,
} from './platformAdminCore.ts';
// DASHBOARD-C16: the single founder queue — the remaining half of founder decision 3.
import { buildFounderQueue, founderQueueBadge } from './founderQueueCore.ts';

export const INTEGRATION_ADMIN_VERSION = 'integration-admin-1.0.0';
const text = (value: unknown) => String(value ?? '').trim();
const json = (body: unknown, status = 200) => Response.json(body as any, { status });

async function sha256(value: unknown) {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function appConnectorStatus(svc: any, key: 'github' | 'outlook', label: string) {
  try {
    const connection = await svc.connectors.getConnection(key);
    return { key, label, connected: Boolean(connection), status: connection ? 'connected' : 'not_connected' };
  } catch {
    return { key, label, connected: false, status: 'not_connected' };
  }
}

export async function handleIntegrationAdminAction(user: any, body: any, svc: any, deps: { now?: () => string } = {}) {
  const action = text(body?.action);
  const actor = text(user?.email) || text(user?.id);
  if (!actor) return json({ error: 'unidentified_actor' }, 401);
  const now = (deps.now || (() => new Date().toISOString()))();

  if (action === 'registry') return json(await readIntegrationRegistry({ svc }));

  if (action === 'connector_status') {
    const connectors = await Promise.all([
      appConnectorStatus(svc, 'github', 'GitHub'),
      appConnectorStatus(svc, 'outlook', 'Microsoft Outlook'),
    ]);
    return json({ ok: true, scope: 'CAMBRA_APP_SERVICE', connectors });
  }

  if (action === 'oauth_app_fields') {
    return json({
      ok: true,
      input_fields: [...OAUTH_APP_INPUT_FIELDS],
      server_owned: OAUTH_APP_SERVER_OWNED.map((row) => ({ ...row })),
      // The UI offers exactly the scopes the handler accepts, minus the privileged ones a
      // third-party app may never hold.
      selectable_scopes: VALID_SCOPES.filter((scope) => !(PRIVILEGED_SCOPES as readonly string[]).includes(scope)),
      refused_scopes: [...PRIVILEGED_SCOPES],
    });
  }

  if (action === 'preview_oauth_app') {
    const result = await previewOAuthApp({ svc, patch: body?.patch || {}, sha256 });
    return result.ok ? json(result) : json(result, 409);
  }

  if (action === 'create_oauth_app') {
    if (!text(body?.expected_preview_hash)) return json({ error: 'expected_preview_hash_required' }, 400);
    const result = await applyOAuthApp({
      svc, actor, patch: body?.patch || {},
      expected_preview_hash: text(body.expected_preview_hash), now, sha256,
    });
    return result.ok ? json(result) : json(result, 409);
  }

  if (action === 'revoke_oauth_app') {
    const result = await revokeOAuthApp({
      svc, actor, app_id: text(body?.app_id), reason: text(body?.reason), now,
    });
    return result.ok ? json(result) : json(result, 409);
  }

  if (action === 'webhook_fields') {
    return json({
      ok: true,
      input_fields: [...WEBHOOK_INPUT_FIELDS],
      server_owned: WEBHOOK_SERVER_OWNED.map((row) => ({ ...row })),
      event_catalog: [...WEBHOOK_EVENT_CATALOG],
      tools: [...WEBHOOK_TOOLS],
    });
  }

  if (action === 'preview_webhook') {
    const result = await previewWebhookEndpoint({ svc, patch: body?.patch || {}, sha256 });
    return result.ok ? json(result) : json(result, 409);
  }

  if (action === 'create_webhook') {
    if (!text(body?.expected_preview_hash)) return json({ error: 'expected_preview_hash_required' }, 400);
    const result = await applyWebhookEndpoint({
      svc, actor, patch: body?.patch || {},
      expected_preview_hash: text(body.expected_preview_hash), now, sha256,
    });
    return result.ok ? json(result) : json(result, 409);
  }

  if (action === 'disable_webhook') {
    const result = await disableWebhookEndpoint({
      svc, actor, webhook_id: text(body?.webhook_id), reason: text(body?.reason), now,
    });
    return result.ok ? json(result) : json(result, 409);
  }

  if (action === 'delete_webhook') {
    // Answered rather than omitted, so a caller that used to hard-delete learns the
    // alternative instead of receiving "not implemented".
    return json(refuseWebhookDelete(body?.webhook_id), 409);
  }

  if (action === 'founder_queue') {
    return json(await buildFounderQueue({ svc, now, limit: Number(body?.limit) || undefined }));
  }

  if (action === 'founder_queue_badge') return json(await founderQueueBadge({ svc, now }));

  if (action === 'plan_catalog') return json(planCatalogView());

  if (action === 'preview_organization') {
    const result = await previewOrganization({ svc, patch: body?.patch || {}, now, sha256 });
    return result.ok ? json(result) : json(result, 409);
  }

  if (action === 'create_organization') {
    if (!text(body?.expected_preview_hash)) return json({ error: 'expected_preview_hash_required' }, 400);
    const result = await applyOrganization({
      svc, actor, patch: body?.patch || {},
      expected_preview_hash: text(body.expected_preview_hash), now, sha256,
    });
    return result.ok ? json(result) : json(result, 409);
  }

  if (action === 'cancel_organization') {
    const result = await cancelOrganization({
      svc, actor, organization_id: text(body?.organization_id), reason: text(body?.reason), now,
    });
    return result.ok ? json(result) : json(result, 409);
  }

  if (action === 'suspend_organization') {
    // Answered rather than omitted: the old button offered a suspend that did not exist.
    return json({
      ok: false, error: 'no_suspended_state',
      reason: 'Organization.billing_status enumerates active, past_due, canceled and trial. There is no '
        + 'suspended state, so a suspend would be a cancel wearing a reversible-sounding name.',
      use_instead: 'integration_cancel_organization',
    }, 409);
  }

  if (action === 'record_note') {
    const result = await recordAdminNote({
      svc, actor, target_type: text(body?.target_type), target_id: text(body?.target_id),
      note: text(body?.note), now,
    });
    return result.ok ? json(result) : json(result, 409);
  }

  if (action === 'update_deal_application') {
    return json(refuseDealApplicationWrite(body?.field), 409);
  }

  return json({ error: 'integration_action_not_implemented', action }, 400);
}
