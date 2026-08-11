import { claimSchedulerRun, finishSchedulerRun } from '../../shared/schedulerRun.ts';
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import { requireAdminOrInternal } from '../../shared/internalGate.ts';
import { buildCommercialIntelligence, COMMERCIAL_INTELLIGENCE_VERSION, normalizeCompanyDomain } from '../../shared/commercialIntelligence.ts';
import { emergencyState } from '../../shared/operationalControl.ts';

const VERSION = 'always-on-lead-discovery-2.0.0';
const now = () => new Date().toISOString();
const COUNTRY_NAMES: Record<string, string> = { FR: 'France', ES: 'Spain', DE: 'Germany', IT: 'Italy', PT: 'Portugal', BE: 'Belgium', AT: 'Austria', NL: 'Netherlands', IE: 'Ireland', GB: 'United Kingdom', LU: 'Luxembourg', DK: 'Denmark', SE: 'Sweden', FI: 'Finland', NO: 'Norway', PL: 'Poland', CZ: 'Czechia', GR: 'Greece', RO: 'Romania' };

Deno.serve(async (req) => {let __schedulerSvc:any=null;let __schedulerClaim:any=null;let __schedulerOk=true;
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const gate = await requireAdminOrInternal(req, base44, body);
    if (!gate.ok) return gate.response;
    const service = base44.asServiceRole;
    __schedulerSvc=service;
    __schedulerClaim=await claimSchedulerRun(service,req,{worker_key:'alwaysOnLeadDiscoveryWorker',cadence_seconds:3600});
    if(!__schedulerClaim.allowed)return Response.json({ok:true,duplicate_blocked:true,run_key:__schedulerClaim.run_key});
    const internal = Deno.env.get('INTERNAL_CALL_SECRET') || '';
    const policies = await service.entities.CommercialPolicy.filter({ engine: 'merchant_acquisition', status: 'active' }, '-approved_at', 10).catch(() => []);
    const policy = policies[0] || null;
    if (!policy) return Response.json({ ok: true, status: 'waiting_policy', engine_version: VERSION });

    const [before, profiles, emergency] = await Promise.all([
      service.entities.OutboundLead.list('-created_date', 5000).catch(() => []),
      service.entities.OutboundSendingProfile.filter({ profile_key: 'resend:contact.cambra.global' }, '-created_date', 1).catch(() => []),
      emergencyState(service),
    ]);
    const capacity = Math.max(0, Number(profiles[0]?.current_daily_cap || policy.daily_send_limit || 0));
    const targetDays = Math.max(0.5, Math.min(30, Number(policy?.icp_json?.pipeline_coverage_days || 3)));
    const minScore = Number(policy.min_lead_score || 70);
    const readyBefore = before.filter((lead: any) => lead.stage === 'scored' && Number(lead.score || 0) >= minScore && Number(lead.score_breakdown_json?.evidence_confidence || 0) >= 0.55 && lead.contact_email && lead.legal_basis).length;
    const coverageBefore = capacity > 0 ? readyBefore / capacity : readyBefore > 0 ? 999 : 0;
    const perRun = Math.max(1, Math.min(100, Number(policy?.icp_json?.per_run || 25)));
    const monthlyBudget = Math.max(0, Number(policy?.icp_json?.discovery_monthly_budget || 0));
    const shouldDiscover = !emergency.safe_mode && coverageBefore < targetDays && policy?.icp_json?.enabled !== false;
    const discoveryAction = emergency.safe_mode ? 'safe_mode_no_external_discovery' : shouldDiscover ? 'increase_discovery' : coverageBefore > targetDays * 2 ? 'reservoir_healthy_reduce_discovery' : 'quality_refresh';

    const requestedCountries = (Array.isArray(policy.countries) && policy.countries.length ? policy.countries : ['FR', 'ES']).map((value: any) => String(value).toUpperCase());
    // Bound external credit spend per run. Coverage beyond these countries is
    // reported as unknown, never as if Apollo had scanned all Europe.
    const countriesThisRun = requestedCountries.slice(0, Math.min(8, perRun));
    const discoveryRuns: any[] = [];
    if (shouldDiscover) {
      const each = Math.max(1, Math.floor(perRun / Math.max(1, countriesThisRun.length)));
      for (const countryCode of countriesThisRun) {
        const country = COUNTRY_NAMES[countryCode] || countryCode;
        const result = await service.functions.invoke('leadOrchestrator', {
          icp: {
            industry: policy.icp_json?.industry || 'ecommerce',
            titles: policy.icp_json?.titles || ['founder', 'CEO', 'co-founder', 'CFO', 'Head of Ecommerce', 'Head of Payments'],
            country, per_page: each, limit: each,
          },
          internal_secret: internal,
        }).catch((error: any) => ({ data: { ok: false, error: String(error?.message || error) } }));
        discoveryRuns.push({ country, result: result?.data || result });
      }
    }

    const leads = await service.entities.OutboundLead.list('-created_date', 5000).catch(() => []);
    const rankedForDedupe = [...leads].sort((a: any, b: any) => Number(b.score || 0) - Number(a.score || 0) || Date.parse(b.updated_date || b.created_date || '') - Date.parse(a.updated_date || a.created_date || ''));
    const companyWinner = new Map<string, string>();
    const duplicateLeadIds = new Set<string>();
    let deduplicated = 0;
    for (const lead of rankedForDedupe) {
      const domain = normalizeCompanyDomain(lead.company_domain);
      if (!domain) continue;
      if (!companyWinner.has(domain)) { companyWinner.set(domain, lead.id); continue; }
      if (!['contacted', 'meeting', 'won'].includes(String(lead.stage))) {
        await service.entities.OutboundLead.update(lead.id, { reservoir_state: 'disqualified', suppression_reason: `duplicate_company:${companyWinner.get(domain)}`, reservoir_updated_at: now() }).catch(() => null);
        duplicateLeadIds.add(lead.id);
        deduplicated++;
      }
    }

    let suppressed = 0;
    let qualified = 0;
    let highConfidence = 0;
    let outreachReady = 0;
    let stale = 0;
    const staleCutoff = Date.now() - 30 * 86400000;
    for (const lead of leads) {
      if (duplicateLeadIds.has(lead.id) || lead.reservoir_state === 'disqualified') continue;
      const email = String(lead.contact_email || '').trim().toLowerCase();
      const suppression = email ? await service.entities.ContactSuppression.filter({ email, active: true }, '-created_date', 1).catch(() => []) : [];
      if (suppression.length) {
        suppressed++;
        await service.entities.OutboundLead.update(lead.id, { reservoir_state: 'suppressed', suppression_reason: 'contact_suppression', reservoir_updated_at: now() }).catch(() => null);
        continue;
      }
      const score = Number(lead.score || 0);
      const confidence = Number(lead.score_breakdown_json?.evidence_confidence || 0);
      const isQualified = lead.stage === 'scored' && score >= minScore;
      if (isQualified) qualified++;
      if (isQualified && confidence >= 0.75) highConfidence++;
      const isReady = isQualified && confidence >= 0.55 && !!email && !!lead.legal_basis;
      if (isReady) {
        outreachReady++;
        await service.entities.OutboundLead.update(lead.id, { reservoir_state: 'ready', revenue_stage: 'outreach_ready', outreach_ready_at: lead.outreach_ready_at || now(), last_verified_at: now(), reservoir_updated_at: now() }).catch(() => null);
      } else if (['lead', 'enriched', 'scored'].includes(String(lead.stage))) {
        await service.entities.OutboundLead.update(lead.id, { reservoir_state: lead.stage === 'lead' ? 'discovered' : lead.stage === 'enriched' ? 'enriching' : 'qualified', reservoir_updated_at: now() }).catch(() => null);
      }
      const lastVerified = Date.parse(lead.last_verified_at || lead.updated_date || lead.created_date || '');
      if (!Number.isFinite(lastVerified) || lastVerified < staleCutoff) stale++;
    }

    const coverage = capacity > 0 ? Number((outreachReady / capacity).toFixed(2)) : outreachReady > 0 ? 999 : 0;
    const coverageStatus = coverage < targetDays ? 'LOW' : coverage > targetDays * 2 ? 'EXCESS' : 'HEALTHY';
    const countryBreakdown: Record<string, number> = {};
    for (const lead of leads) countryBreakdown[String(lead.country || 'unknown')] = (countryBreakdown[String(lead.country || 'unknown')] || 0) + 1;
    const reservoir = await service.entities.LeadReservoirSnapshot.create({
      snapshot_key: `reservoir:${Date.now()}`, captured_at: now(),
      discovered: leads.filter((lead: any) => lead.stage === 'lead').length,
      enriching: leads.filter((lead: any) => lead.stage === 'enriched').length,
      qualified, high_confidence: highConfidence, outreach_ready: outreachReady,
      queued: 0, waiting_window: 0, waiting_capacity: Math.max(0, outreachReady - capacity),
      suppressed, disqualified: deduplicated, stale,
      safe_daily_send_capacity: capacity, coverage_days: coverage, target_coverage_days: targetDays,
      coverage_status: coverageStatus, discovery_action: discoveryAction,
      cost_guard_json: { monthly_budget: monthlyBudget, per_run_limit: perRun, countries_this_run: countriesThisRun, safe_mode: emergency.safe_mode, note: '24/7 scheduling does not imply unrestricted paid API calls; safe mode disables external discovery.' },
      country_breakdown_json: countryBreakdown, engine_version: VERSION,
    });

    const intelligence = buildCommercialIntelligence(leads, policy);
    const commercialSnapshot = await service.entities.CommercialIntelligenceSnapshot.create({
      snapshot_key: `commercial:${Date.now()}`,
      generated_at: intelligence.generated_at,
      engine_version: intelligence.version,
      policy_key: policy.policy_key,
      policy_version: String(policy.version || ''),
      market_sizing_json: intelligence.market_sizing,
      prioritization_json: intelligence.prioritization,
      lead_graph_json: intelligence.lead_graph,
      forecast_json: intelligence.forecast,
      learning_json: intelligence.learning,
      data_quality_json: intelligence.data_quality,
      source_coverage_json: intelligence.source_coverage,
      unknowns: intelligence.unknowns,
      reservoir_snapshot_id: reservoir.id,
    });
    await service.entities.Event.create({ brand_id: '_platform', event_type: 'commercial.intelligence.snapshot.created', source: 'always_on_lead_discovery', entity_type: 'CommercialIntelligenceSnapshot', entity_id: commercialSnapshot.id, payload_json: { engine_version: COMMERCIAL_INTELLIGENCE_VERSION, reservoir_snapshot_id: reservoir.id, market_methodology: intelligence.market_sizing.methodology }, status: 'pending' }).catch(() => null);

    return Response.json({
      ok: true, engine_version: VERSION,
      reservoir_snapshot_id: reservoir.id,
      commercial_intelligence_snapshot_id: commercialSnapshot.id,
      coverage_days: coverage, target_coverage_days: targetDays, coverage_status: coverageStatus,
      outreach_ready: outreachReady, safe_daily_send_capacity: capacity,
      discovery_action: discoveryAction, discovery_runs: discoveryRuns.length,
      safe_mode: emergency.safe_mode,
      deduplicated, suppressed,
      market_sizing: intelligence.market_sizing,
      source_coverage: intelligence.source_coverage,
    });
  } catch (error) {__schedulerOk=false;
    console.error(error);
    return Response.json({ ok: false, error: 'always_on_lead_discovery_failed', message: String((error as Error)?.message || error).slice(0, 300) }, { status: 500 });
  }finally{if(__schedulerSvc&&__schedulerClaim)await finishSchedulerRun(__schedulerSvc,__schedulerClaim,{worker_key:'alwaysOnLeadDiscoveryWorker'},__schedulerOk)}
});
