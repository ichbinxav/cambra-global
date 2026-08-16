// billApiUsage — closes and invoices the previous month's API usage.
//
// Multiple ApiUsageRecord shards may legitimately exist when the first API
// calls for a month race. Billing therefore never trusts a shard's cached
// overage fields: it freezes the aggregate behind the same CAS revision used
// by the recorder, reads quota/pricing from Organization and creates at most
// one deterministic Invoice per organization+period.
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import { billApiUsageOrganization, listApiUsageOrganizationIds } from '../../shared/apiUsageBilling.ts';
import { requireAdminOrInternal } from '../../shared/internalGate.ts';
import {
  assertEmergencyEpochUnchanged,
  assertOperationAllowed,
  captureEmergencyEpoch,
} from '../../shared/operationalControl.ts';
import { internalErrorResponse } from '../../shared/publicErrors.ts';
import { guardedScheduledServe } from '../../shared/schedulerRun.ts';

guardedScheduledServe(
  { worker_key: 'billApiUsage', cadence_seconds: 300 },
  createClientFromRequest,
  async (req) => {
    try {
      const base44 = createClientFromRequest(req);
      const body = await req.json().catch(() => ({}));
      const gate = await requireAdminOrInternal(req, base44, body);
      if (!gate.ok) {
        return gate.response || Response.json({ error: 'forbidden' }, { status: 403 });
      }
      const svc = base44.asServiceRole;
      let billingEpoch: any;
      try {
        await assertOperationAllowed(svc, 'billing_issuance');
        billingEpoch = await captureEmergencyEpoch(svc, 'billing_issuance');
      } catch (error: any) {
        return Response.json({
          error: error?.message || 'emergency_control_paused:billing_issuance',
        }, { status: 409 });
      }

      const now = new Date();
      const previousMonth = new Date(Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth() - 1,
        1,
      ));
      const periodMonth = previousMonth.toISOString().slice(0, 7);
      const runId = `run_${periodMonth}_${crypto.randomUUID()}`;
      const organizationIds = await listApiUsageOrganizationIds(svc, periodMonth);
      const results: any[] = [];

      for (const organizationId of organizationIds) {
        const result = await billApiUsageOrganization(svc, {
          organization_id: organizationId,
          period_month: periodMonth,
          run_id: runId,
          now,
          assert_before_invoice: () => assertEmergencyEpochUnchanged(
            svc,
            billingEpoch,
            `before_api_overage_invoice:${organizationId}:${periodMonth}`,
          ),
          assert_after_invoice: () => assertEmergencyEpochUnchanged(
            svc,
            billingEpoch,
            `after_api_overage_invoice:${organizationId}:${periodMonth}`,
          ),
        });
        results.push(result);
      }

      const reviewRequired = results.some((result) => result.review_required === true);
      return Response.json({
        ok: !reviewRequired,
        period_month: periodMonth,
        run_id: runId,
        organizations_observed: organizationIds.length,
        invoiced: results.filter((result) => result.status === 'invoiced').length,
        closed_no_charge: results.filter((result) => result.status === 'closed_no_charge').length,
        in_progress: results.filter((result) =>
          result.status === 'claimed_elsewhere' || result.status === 'claim_lost'
        ).length,
        review_required: reviewRequired,
        results,
      }, { status: reviewRequired ? 503 : 200 });
    } catch (error) {
      return internalErrorResponse(error, 'billApiUsage');
    }
  },
);
