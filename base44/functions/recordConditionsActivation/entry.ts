// recordConditionsActivation — RECOVER-4 (2026-08-04).
//
// The ONLY writer of DealActivation.conditions_activated_at — the real date the
// newly approved conditions started applying, backed by named evidence. Admin
// only (a human verifies evidence; no internal/scheduled path on purpose).
// Never inferred from the RECOVER-1 acceptance, the SetupIntent or a frontend
// edit (§6). Derives the whole contractual calendar from it.
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import {
  agreementEndAt,
  firstMeasurementMonth,
  parisMonthOf,
} from '../../shared/recoverBillingMath.ts';

const SOURCES = [
  'provider_confirmation',
  'pricing_schedule',
  'first_settlement',
  'api_verification',
  'admin_documented_review',
];

export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (user?.role !== 'admin') return Response.json({ error: 'forbidden' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const { deal_activation_id, conditions_activated_at, source, evidence_note } = body || {};
    if (!deal_activation_id) return Response.json({ error: 'deal_activation_id required' }, { status: 400 });
    if (!SOURCES.includes(source)) return Response.json({ error: `source must be one of ${SOURCES.join(', ')}` }, { status: 400 });
    if (!String(evidence_note || '').trim()) return Response.json({ error: 'evidence_note required — the activation date must cite its evidence' }, { status: 400 });
    const at = new Date(String(conditions_activated_at || ''));
    if (Number.isNaN(at.getTime())) return Response.json({ error: 'conditions_activated_at must be a valid ISO date' }, { status: 400 });
    if (at.getTime() > Date.now()) return Response.json({ error: 'conditions_activated_at cannot be in the future' }, { status: 400 });

    const svc = base44.asServiceRole;
    const rows = await svc.entities.DealActivation.filter({ id: deal_activation_id }, '-created_date', 1).catch(() => []);
    const activation = rows?.[0];
    if (!activation) return Response.json({ error: 'activation not found' }, { status: 404 });

    // RECOVER-4 reads `live`; it does not perform the migrating→live transition
    // itself (§6). An activation that is not yet live has no verified effective
    // conditions to anchor a calendar to.
    if (!['live', 'monetizing'].includes(activation.status)) {
      return Response.json({ error: `activation_not_live: status=${activation.status}` }, { status: 409 });
    }
    // Requires an active mandate — measurement without authorization is meaningless.
    const mandates = await svc.entities.Mandate.filter({ deal_activation_id, status: 'active' }, '-created_date', 1).catch(() => []);
    if (!mandates?.length) return Response.json({ error: 'no_active_mandate' }, { status: 409 });

    if (activation.conditions_activated_at && activation.conditions_activated_at !== at.toISOString()) {
      // Changing an anchored calendar is a correction, not a routine update.
      if (body?.confirm_correction !== true) {
        return Response.json({
          error: 'conditions_activated_at_already_set',
          current: activation.conditions_activated_at,
          hint: 'pass confirm_correction: true to correct it (logged as a correction)',
        }, { status: 409 });
      }
    }

    const iso = at.toISOString();
    const firstMonth = firstMeasurementMonth(iso);
    const endAt = agreementEndAt(iso);
    // First invoice is issuable in the month AFTER the first measured month.
    const [fy, fm] = firstMonth.split('-').map(Number);
    const firstInvoiceEligible = new Date(Date.UTC(fy, fm, 1)).toISOString();

    await svc.entities.DealActivation.update(activation.id, {
      conditions_activated_at: iso,
      conditions_activation_source: source,
      conditions_activation_verified_by: user.email,
      conditions_activation_verified_at: new Date().toISOString(),
      first_measurement_month: firstMonth,
      agreement_end_at: endAt,
      first_invoice_eligible_at: firstInvoiceEligible,
    });

    await svc.entities.OperationalLog.create({
      deal_activation_id: activation.id,
      brand_id: activation.brand_id || '',
      provider_id: activation.provider_id || '',
      event_type: 'status_changed',
      message: 'recover_conditions_activation_verified',
      data_json: {
        conditions_activated_at: iso,
        activation_month: parisMonthOf(iso),
        first_measurement_month: firstMonth,
        agreement_end_at: endAt,
        source,
        evidence_note: String(evidence_note).slice(0, 2000),
        previous_value: activation.conditions_activated_at || null,
        correction: Boolean(activation.conditions_activated_at),
      },
      actor_email: user.email,
      created_at: new Date().toISOString(),
    }).catch(() => null);

    return Response.json({
      ok: true,
      deal_activation_id: activation.id,
      conditions_activated_at: iso,
      activation_month_not_billable: parisMonthOf(iso),
      first_measurement_month: firstMonth,
      first_invoice_eligible_at: firstInvoiceEligible,
      agreement_end_at: endAt,
    });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
}