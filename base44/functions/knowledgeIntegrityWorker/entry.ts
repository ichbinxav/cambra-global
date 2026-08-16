import { safeBestEffort } from '../../shared/bestEffort.ts';
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import { requireAdminOrInternal } from '../../shared/internalGate.ts';
import { guardedScheduledServe } from '../../shared/schedulerRun.ts';
import { quarantineReasonForLegacyIntelligence } from '../../shared/intelligenceTenantScope.ts';

async function quarantineEvidence(s: any, row: any, reason: string) {
  if (row.quarantined) return false;
  await s.entities.IntelligenceEvidence.update(row.id, { quarantined: true, quarantine_reason: reason });
  return true;
}

async function quarantineObservation(s: any, row: any, reason: string) {
  if (row.status === 'quarantined') return false;
  await s.entities.IntelligenceObservation.update(row.id, { status: 'quarantined', quarantine_reason: reason });
  return true;
}

async function quarantineClaim(s: any, row: any, reason: string) {
  if (row.knowledge_state === 'quarantined') return false;
  await s.entities.KnowledgeClaim.update(row.id, {knowledge_state:'quarantined', quarantine_reason: reason});
  return true;
}

async function quarantineOutcome(s: any, row: any, reason: string) {
  if (row.quarantined) return false;
  await s.entities.IntelligenceOutcome.update(row.id, { quarantined: true, quarantine_reason: reason });
  return true;
}

guardedScheduledServe(
  { worker_key: 'knowledgeIntegrityWorker', cadence_seconds: 21600 },
  createClientFromRequest,
  async (req) => {
    try {
      const b = createClientFromRequest(req);
      const body = await req.json().catch(() => ({}));
      const g = await requireAdminOrInternal(req, b, body);
      if (!g.ok) return g.response as Response;
      const s = b.asServiceRole;
      const [evidence, observations, claims, outcomes, pricing] = await Promise.all([
        s.entities.IntelligenceEvidence.list('-recorded_at', 1000).catch((error: any) =>
          safeBestEffort(error, { operation: 'knowledgeIntegrityWorker', fallback: [], severity: 'secondary' })
        ),
        s.entities.IntelligenceObservation.list('-created_date', 1000).catch((error: any) =>
          safeBestEffort(error, { operation: 'knowledgeIntegrityWorker', fallback: [], severity: 'secondary' })
        ),
        s.entities.KnowledgeClaim.list('-created_date', 1000).catch((error: any) =>
          safeBestEffort(error, { operation: 'knowledgeIntegrityWorker', fallback: [], severity: 'secondary' })
        ),
        s.entities.IntelligenceOutcome.list('-captured_at', 1000).catch((error: any) =>
          safeBestEffort(error, { operation: 'knowledgeIntegrityWorker', fallback: [], severity: 'secondary' })
        ),
        s.entities.ProviderPricingVersion.list('-observed_at', 1000).catch((error: any) =>
          safeBestEffort(error, { operation: 'knowledgeIntegrityWorker', fallback: [], severity: 'secondary' })
        ),
      ]);
      let quarantined = 0;
      const anomalies: any[] = [];

      for (const row of evidence) {
        const legacyReason = quarantineReasonForLegacyIntelligence(row, 'evidence');
        const badFuture = Date.parse(row.effective_at || '') > Date.now() + 366 * 86400000;
        const badConfidence = Number(row.confidence || 0) < 0 || Number(row.confidence || 0) > 1;
        const reason = legacyReason || (badFuture ? 'future_effective_date_anomaly' : badConfidence ? 'invalid_confidence' : '');
        if (!reason) continue;
        if (await quarantineEvidence(s, row, reason)) quarantined++;
        anomalies.push({ type: reason, entity: 'IntelligenceEvidence', id: row.id });
      }
      for (const row of observations) {
        const reason = quarantineReasonForLegacyIntelligence(row, 'observation');
        if (!reason) continue;
        if (await quarantineObservation(s, row, reason)) quarantined++;
        anomalies.push({ type: reason, entity: 'IntelligenceObservation', id: row.id });
      }
      for (const row of claims) {
        const reason = quarantineReasonForLegacyIntelligence(row, 'claim');
        if (!reason) continue;
        if (await quarantineClaim(s, row, reason)) quarantined++;
        anomalies.push({ type: reason, entity: 'KnowledgeClaim', id: row.id });
      }
      for (const row of outcomes) {
        const reason = quarantineReasonForLegacyIntelligence(row, 'outcome');
        if (!reason) continue;
        if (await quarantineOutcome(s, row, reason)) quarantined++;
        anomalies.push({ type: reason, entity: 'IntelligenceOutcome', id: row.id });
      }
      for (const row of pricing) {
        if (Number(row.variable_rate_bps || 0) < 0 || Number(row.variable_rate_bps || 0) > 5000) {
          await s.entities.ProviderPricingVersion.update(row.id, {knowledge_state:'quarantined'}).catch((error: any) =>
            safeBestEffort(error, { operation: 'knowledgeIntegrityWorker', fallback: null, severity: 'secondary' })
          );
          anomalies.push({ type: 'impossible_pricing', entity: 'ProviderPricingVersion', id: row.id });
        }
        if (row.currency && !['EUR', 'GBP', 'USD'].includes(row.currency)) {
          anomalies.push({ type: 'currency_mismatch', entity: 'ProviderPricingVersion', id: row.id });
        }
      }
      return Response.json({
        ok: true,
        checked: {
          evidence: evidence.length,
          observations: observations.length,
          claims: claims.length,
          outcomes: outcomes.length,
          pricing: pricing.length,
        },
        evidence_checked: evidence.length,
        pricing_checked: pricing.length,
        quarantined,
        anomalies: anomalies.slice(0, 200),
        legacy_scope_policy: 'QUARANTINE_WITHOUT_INFERENCE',
      });
    } catch (e) {
      console.error(e);
      return Response.json({ ok: false, error: 'knowledge_integrity_failed' }, { status: 500 });
    }
  },
);
