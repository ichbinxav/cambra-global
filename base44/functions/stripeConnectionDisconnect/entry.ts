import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import {
  isIntegrationCredentialBoundaryError,
  resolveOwnedBrandForIntegrationActor,
  resolveOwnedIntegrationForActor,
} from '../../shared/integrationCredentials.ts';
import {
  disconnectLegacyStripeConnectionOnly,
  disconnectStripeConnectedAccount,
  isStripeConnectedAccountLifecycleError,
  recordStripeConnectIncident,
} from '../../shared/stripeConnectedAccountLifecycle.ts';

/**
 * BUG-5 FIX (2026-07-12) — Unified Stripe disconnect for both Integration-backed
 * and legacy StripeConnection rows.
 *
 * Root cause captured empirically:
 *   - Frontend Branch A (`Integration.update`) → RLS "Permission denied for
 *     update operation on Integration entity". Integration.write is
 *     admin-only per schema. Service-owned rows can't be self-disconnected.
 *   - Frontend Branch B (legacy `stripeDisconnect` → invoke) → 500
 *     "Authentication required to view users" from `base44.auth.me()` inside
 *     the function. The reported "404" was actually a 500 in disguise.
 *
 * Design (mirrors the M3-sealed ownership pattern used by
 * computeStripeVerifiedGap / getPaymentsAnalysisVerified):
 *   1. Resolve the caller via `base44.auth.me()` guarded (defensive: some
 *      contexts return null / throw — we treat both as Unauthorized instead
 *      of leaking the underlying 500).
 *   2. Check ownership: caller must be admin OR Brand.contact_email ===
 *      user.email OR Brand.created_by === user.email. This mirrors A2's
 *      resolution model where service-owned brands are still "owned" by the
 *      human via contact_email.
 *   3. Perform the writes with `asServiceRole` — bypasses the admin-only
 *      RLS on Integration.write and StripeConnection.write.
 *   4. Dual-row cleanup: disconnect BOTH the Integration row (if
 *      integration_id given or auto-detected) AND any legacy
 *      StripeConnection rows for the same brand_id. Never leaves the app
 *      in a half-disconnected state.
 *   5. Revoke active Stripe ConsentRecords for the brand (same as legacy).
 *
 * Payload: { brand_id: string, integration_id?: string }
 * Returns: { ok: true, disconnected: { integrations: n, stripe_connections: n, consents: n } }
 *
 * Restrictions honored (heredadas del diagnóstico BUG-5):
 *   - Zero changes to paymentsGap, motor, computeStripeVerifiedGap,
 *     getPaymentsAnalysisVerified, submitPaymentsAnalysis, sync loop,
 *     _tenantGuard, schemas.
 *   - Does NOT delete historical data — keeps audit trail (status flip only).
 */
Deno.serve(async (req) => {
  let incidentSvc:any = null;
  try {
    const base44 = createClientFromRequest(req);

    // Step 1 — Resolve caller (defensively).
    let user;
    try {
      user = await base44.auth.me();
    } catch {
      return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }
    if (!user || !user.email) {
      return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const { brand_id, integration_id } = body || {};

    if (!brand_id) {
      return Response.json({ ok: false, error: 'brand_id required' }, { status: 400 });
    }

    // Step 2 — Ownership check (service-role read; RLS on Brand would hide
    // service-owned rows from the human even though contact_email matches).
    //
    // Enumeration-safety: the "brand exists but you don't own it" case and
    // the "brand does not exist" case MUST return the same status + body.
    // Otherwise a non-admin caller can distinguish valid brand_ids from
    // invalid ones by probing (originally: existing → 403, missing → 404).
    // Both paths collapse to 404 "Brand not found" for non-owners.
    //
    // Admins: no distinction preserved. Admins BYPASS the ownership guard
    // entirely (isAdmin skips the second 404 branch) and proceed to the
    // happy path, so an admin only ever sees the 404 when the brand truly
    // does not exist — not when the brand exists under another owner.
    // There is no admin-only 403 branch anywhere in this function.
    const svc = base44.asServiceRole;
    incidentSvc = svc;
    await resolveOwnedBrandForIntegrationActor(svc, { brand_id, actor: user });

    // Step 3+4 — Dual-row disconnect via service role.
    const counters = { integrations: 0, stripe_connections: 0, consents: 0 };

    // 3a — Integration row(s). If integration_id provided, disconnect it
    // (after verifying it belongs to this brand). Otherwise auto-detect any
    // connected Stripe-family Integration for this brand.
    let integrationsToClose = [];
    if (integration_id) {
      const one = await resolveOwnedIntegrationForActor(svc, {
        integration_id,
        brand_id,
        actor: user,
      });
      integrationsToClose.push(one);
    } else {
      const list = await base44.asServiceRole.entities.Integration.filter(
        { brand_id, status: 'connected' }, '-created_date', 100
      );
      if (!Array.isArray(list) || list.length >= 100) {
        throw new Error('stripe_integration_disconnect_coverage_unproven');
      }
      integrationsToClose = list.filter((i:any) =>
        i.provider === 'stripe' || i.provider === 'stripe_self' || i.provider === 'stripe_self_test'
      );
    }
    if (integrationsToClose.length > 0) {
      const legacyIds = new Set<string>();
      const consentIds = new Set<string>();
      for (const i of integrationsToClose) {
        const receipt = await disconnectStripeConnectedAccount(svc, {
          integration: i,
          provider_account_id: i.provider_account_id || '',
          reason: 'merchant_requested_stripe_disconnect',
          source: 'manual',
          actor_email: user.email || '',
        });
        counters.integrations += 1;
        for (const id of receipt.steps?.legacy_connections?.ids || []) legacyIds.add(id);
        for (const id of receipt.steps?.consents?.ids || []) consentIds.add(id);
      }
      counters.stripe_connections = legacyIds.size;
      counters.consents = consentIds.size;
    } else {
      // Historical brands can still have only a StripeConnection row. The
      // shared compatibility transition read-backs every mutation and returns
      // exact per-step receipts; any partial state becomes REVIEW_REQUIRED.
      const receipt = await disconnectLegacyStripeConnectionOnly(svc, {
        brand_id,
        reason: 'merchant_requested_stripe_disconnect',
        actor_email: user.email || '',
      });
      counters.stripe_connections = receipt.steps?.legacy_connections?.ids?.length || 0;
      counters.consents = receipt.steps?.consents?.ids?.length || 0;
    }
    return Response.json({ ok: true, disconnected: counters });
  } catch (error) {
    if (isIntegrationCredentialBoundaryError(error)
      && error.code === 'integration_tenant_resource_not_available') {
      return Response.json({ ok: false, error: 'integration_not_available' }, { status: 404 });
    }
    if (isStripeConnectedAccountLifecycleError(error)) {
      console.error('stripeConnectionDisconnect reconciliation required');
      if (incidentSvc) {
        try {
          const receipt:any = error.receipt || {};
          await recordStripeConnectIncident(incidentSvc, {
            dedupe_key: `stripe-connect-manual-review:${receipt.integration_id || receipt.brand_id || 'unknown'}:${error.code}`,
            account_id: receipt.account_id || '',
            event_id: receipt.event_id || '',
            event_type: receipt.event_type || 'manual_disconnect',
            error_code: error.code,
            integration_id: receipt.integration_id,
            brand_id: receipt.brand_id,
            receipt,
          });
        } catch (incidentError) {
          console.error(JSON.stringify({
            event: 'stripe_connect_manual_incident_write_failed',
            error_code: String((incidentError as any)?.code || 'INCIDENT_WRITE_FAILED').slice(0, 120),
          }));
        }
      }
      return Response.json({
        ok: false,
        error: 'stripe_disconnect_reconciliation_required',
        review_required: true,
      }, { status: error.status || 503 });
    }
    console.error('stripeConnectionDisconnect failed');
    return Response.json({ ok: false, error: 'stripe_disconnect_failed' }, { status: 500 });
  }
});
