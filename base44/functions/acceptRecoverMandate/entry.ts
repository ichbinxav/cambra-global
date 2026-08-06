// acceptRecoverMandate — RECOVER-1 (2026-08-03).
//
// Records the signature and authorizes the activation. THIS function is where the
// invariant "DealActivation never reaches 'authorized' without an active mandate"
// is enforced — IN LINE, not by guardDealActivationStatus.
//
// Why in line: that guard (and updateDealActivationStatus) were already dead
// before this chunk — no caller in src/, no registered entity automation (verified
// 2026-08-03: the app has ZERO entity automations), so the guard never fired at
// all. They were left to die in the PURGE-2 sweep of 2026-08-15 rather than
// resurrected: a precondition PREVENTS the invalid write instead of reverting it
// afterwards, and a reactive second writer of DealActivation.status could collide
// with the transient two-active-mandate overlap that supersession tolerates.
//
// Order of operations, and the reason for each:
//   1. re-verify the terms hash        → a fee/baseline change mid-popup refuses
//   2. RE-READ the mandate             → no double-accept, no accept-after-revoke
//   3. activate the mandate FIRST      → the mandate exists before authorization
//   4. RE-READ mandates, confirm active→ we never authorize on an assumption
//   5. RE-READ the activation, then    → state is checked immediately before each
//      walk activated → awaiting_authorization → authorized
//   6. supersede older active mandates
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { resolveFeePctForMonth } from '../../shared/billingFee.ts';
import { getSuccessFeePct } from '../../shared/generated/productPolicy.ts';
import { rejectClientTerms } from '../../shared/contractPolicySnapshot.ts';
import { normalizeLocale } from '../../shared/emailLocale.ts';
import { RECOVER_CONTRACT_TEMPLATE_VERSION } from '../../shared/recoverContractTemplates.ts';
import { deliveryIdempotencyKey, logContractEvent } from '../../shared/recoverContractState.ts';
import { fireAndForget } from '../../shared/invokeInternal.ts';
import {
  ACCEPTABLE_ACTIVATION_STATES,
  acceptanceEvidence,
  buildAcceptanceSnapshot,
  currentMonth,
  findVerifiedBaseline,
  hashSnapshot,
  resolveOwnedActivation,
} from '../../shared/recoverAcceptance.ts';

export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const authenticatedAt = new Date().toISOString();

    const body = await req.json().catch(() => ({}));
    // v61 (Checkpoint C) — the client may never carry economic-term keys.
    const termsGuard = rejectClientTerms(body);
    if (!termsGuard.ok) {
      // Destructured INSIDE the guard so the union narrows to its false arm.
      const { keys } = termsGuard;
      return Response.json({ error: 'client_terms_forbidden', keys }, { status: 400 });
    }
    const { mandate_id, signed_by_name, signed_by_role, accepted } = body || {};
    if (!mandate_id) return Response.json({ error: 'mandate_id required' }, { status: 400 });
    if (accepted !== true) return Response.json({ error: 'explicit acceptance required' }, { status: 400 });
    if (!signed_by_name || String(signed_by_name).trim().length < 2) {
      return Response.json({ error: 'signed_by_name required' }, { status: 400 });
    }

    const svc = base44.asServiceRole;
    const email = String(user.email || '').toLowerCase();

    // .catch(() => []) — .filter({ id }) throws on an unknown id instead of returning [].
    const first = await svc.entities.Mandate.filter({ id: mandate_id }, '-created_date', 1).catch(() => []);
    const mandate = first?.[0];
    if (!mandate) return Response.json({ error: 'mandate not found' }, { status: 404 });
    // RECOVER-4 audit fix (2026-08-04): NO admin bypass here, deliberately.
    // signed_by_email below is the SESSION's email, and it is both the legal
    // attribution of the signature and the sole recipient of the contractual
    // copy — so an admin "helping" would have recorded themselves as the
    // signatory and had the merchant's agreement emailed to CAMBRA instead.
    // An electronic acceptance can only be performed by its owner; admins read
    // and revoke, they never sign on someone's behalf.
    if (String(mandate.owner_email || '').toLowerCase() !== email) {
      return Response.json({ error: 'forbidden' }, { status: 403 });
    }
    if (mandate.status === 'active') {
      return Response.json({ ok: true, already_accepted: true, mandate_id: mandate.id });
    }
    if (mandate.status !== 'acceptance_started') {
      return Response.json({ error: 'mandate_not_pending', status: mandate.status }, { status: 409 });
    }

    const owned = await resolveOwnedActivation(svc, user, mandate.deal_activation_id);
    if (!owned.ok) return Response.json({ error: owned.error }, { status: owned.status });
    const { activation } = owned;

    // 1 — terms must be identical to what was displayed.
    const month = currentMonth();
    const baseline = await findVerifiedBaseline(svc, activation);
    if (!baseline) return Response.json({ error: 'no_verified_baseline' }, { status: 409 });
    const fee = await resolveFeePctForMonth(
      svc,
      {
        deal_activation_id: activation.id,
        brand_id: activation.brand_id,
        provider_id: activation.provider_id,
        fallbackPct: activation.node_share_percent ?? getSuccessFeePct(),
      },
      month,
    );
    const freshHash = await hashSnapshot(buildAcceptanceSnapshot({ activation, baseline, fee, month }));
    if (freshHash !== mandate.acceptance_snapshot_hash) {
      return Response.json(
        { error: 'terms_changed', expected: mandate.acceptance_snapshot_hash, actual: freshHash },
        { status: 409 },
      );
    }

    // 2 — re-read the mandate immediately before writing it.
    const recheck = await svc.entities.Mandate.filter({ id: mandate_id }, '-created_date', 1).catch(() => []);
    const fresh = recheck?.[0];
    if (!fresh) return Response.json({ error: 'mandate not found' }, { status: 404 });
    if (fresh.status === 'active') return Response.json({ ok: true, already_accepted: true, mandate_id: fresh.id });
    if (fresh.status !== 'acceptance_started') {
      return Response.json({ error: 'mandate_not_pending', status: fresh.status }, { status: 409 });
    }

    // 3 — the mandate becomes active BEFORE anything is authorized.
    const evidence = acceptanceEvidence(req, authenticatedAt);
    const signedAt = new Date().toISOString();
    // RECOVER-3 — the document language is FROZEN here, from the STORED
    // Brand.locale, never from a header or the browser: a copy regenerated months
    // later must read in the language the merchant accepted in.
    const language = normalizeLocale(owned.brand?.locale);
    await svc.entities.Mandate.update(mandate_id, {
      status: 'active',
      // RECOVER-3 — delivery is marked owed BEFORE anything is attempted and
      // WITHOUT waiting for RECOVER-2. If the non-blocking generation call below
      // is lost when this invocation ends, the reconciler still finds this row.
      language,
      contract_pdf_pending: true,
      contract_pdf_status: 'pending',
      contract_pdf_attempt_count: 0,
      contract_email_status: 'not_ready',
      contract_email_attempt_count: 0,
      contract_delivery_idempotency_key: deliveryIdempotencyKey({
        mandateId: mandate_id,
        snapshotHash: freshHash,
        templateVersion: RECOVER_CONTRACT_TEMPLATE_VERSION,
        language,
      }),
      signed_by_name: String(signed_by_name).trim(),
      signed_by_email: email,
      signed_by_role: signed_by_role || '',
      signed_at: signedAt,
      legal_entity_name: owned.brand?.name || mandate.legal_entity_name || '',
      authenticated_at: evidence.authenticated_at,
      ip_address: evidence.ip_address,
      user_agent: evidence.user_agent,
    });

    // 4 — never authorize on an assumption: confirm the active mandate is really there.
    const mandates = await svc.entities.Mandate.filter({ deal_activation_id: activation.id }, '-created_date', 25);
    const ours = (mandates || []).find((m: any) => m.id === mandate_id && m.status === 'active');
    if (!ours) return Response.json({ error: 'mandate_activation_failed' }, { status: 500 });

    // 5 — re-read the activation, then walk the declared state machine.
    let authorized = false;
    const actRows = await svc.entities.DealActivation.filter({ id: activation.id }, '-created_date', 1).catch(() => []);
    let current = actRows?.[0];
    if (current && ACCEPTABLE_ACTIVATION_STATES.includes(current.status)) {
      if (current.status === 'activated') {
        await svc.entities.DealActivation.update(current.id, {
          status: 'awaiting_authorization',
          last_updated: new Date().toISOString(),
        });
        const midRows = await svc.entities.DealActivation.filter({ id: activation.id }, '-created_date', 1).catch(() => []);
        current = midRows?.[0];
      }
      if (current?.status === 'awaiting_authorization') {
        await svc.entities.DealActivation.update(current.id, {
          status: 'authorized',
          last_updated: new Date().toISOString(),
        });
        authorized = true;
      }
    }

    // 6 — supersede any older active mandate for this activation.
    const superseded: string[] = [];
    for (const m of mandates || []) {
      if (m.id === mandate_id || m.status !== 'active') continue;
      await svc.entities.Mandate.update(m.id, {
        status: 'superseded',
        superseded_at: new Date().toISOString(),
        superseded_by_id: mandate_id,
      }).catch(() => null);
      superseded.push(m.id);
    }
    if (superseded.length) {
      await svc.entities.Mandate.update(mandate_id, { supersedes_id: superseded[0] }).catch(() => null);
    }

    await svc.entities.AuthorizationLog.create({
      brand_id: activation.brand_id || '',
      provider_id: activation.provider_id || '',
      deal_activation_id: activation.id,
      action_type: 'mandate_accepted',
      description: `Recover mandate accepted at ${fee.pct}% success fee${authorized ? ' · activation authorized' : ''}`,
      approved_by: email,
      approved_at: signedAt,
      source: 'acceptRecoverMandate',
      document_version: mandate.document_version || '',
    }).catch(() => null);

    await svc.entities.OperationalLog.create({
      deal_activation_id: activation.id,
      brand_id: activation.brand_id || '',
      provider_id: activation.provider_id || '',
      event_type: 'mandate_signed',
      message: `Recover mandate ${mandate_id} signed`,
      data_json: {
        fee_pct: Number(fee.pct),
        fee_source: fee.source,
        baseline_id: baseline.id,
        snapshot_hash: freshHash,
        authorized,
        superseded,
      },
      actor_email: email,
      created_at: signedAt,
    }).catch(() => null);

    // RECOVER-3 — queue the contractual PDF WITHOUT blocking this response: the
    // merchant continues straight to the payment-method setup. The document is a
    // later representation of an acceptance that is already valid, so nothing
    // here may fail the acceptance.
    await logContractEvent(svc, 'recover_contract_pdf_queued', { ...mandate, id: mandate_id }, { language }, email);
    fireAndForget(base44, 'generateRecoverContractPdf', { mandate_id });

    return Response.json({
      ok: true,
      mandate_id,
      status: 'active',
      fee_pct: Number(fee.pct),
      activation_authorized: authorized,
      superseded_mandate_ids: superseded,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}