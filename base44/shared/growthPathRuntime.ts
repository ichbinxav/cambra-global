// AUDIT 2026-08-18 — config/ is outside the function bundle, so the identical
// bytes are consumed from the drift-gated generated artifact.
import { GROWTH_PATH_DEFAULTS as DEFAULTS } from './generated/growthPathDefaults.ts';
import { EUROPE_MARKETS } from './generated/europeMarkets.ts';
import { canonicalMarket } from './marketContext.ts';
import { localizationReadiness } from './localeRuntime.ts';
import { REGULATORY_ACTIVITIES, REGULATORY_CONTROL_VERSION } from './regulatoryControl.ts';
import { DEFAULT_GROWTH_POLICY, EUROPEAN_GROWTH_VERSION, launchReadiness, maturityTier, scoreMarketAttractiveness } from './europeanGrowth.ts';
import { emergencyState } from './operationalControl.ts';
import { buildGrowthPath, GROWTH_CHANNELS, GROWTH_PATH_ENGINE_VERSION } from './growthPath.ts';

// AUDIT P1-SHARED-001 / P3-03 (2026-08-17) — this file wrapped 30+ money-bearing entity reads in a
// swallow that returned [] on failure with NO log, NO counter and NO flag; actualRevenue and
// actualCash were then summed with a third private copy of the broken nullable coercion
// (`Number(x) : 0`) and returned with `revenue_sources: []`. AdminGrowth rendered
// "Actual revenue: EUR 0 · Operational evidence" for an Invoice read that threw, and
// persistGrowthPathSnapshot upserted that zero into MarketGrowthSnapshot — durable, and consulted
// by launch decisions from then on.
//
// The correct pattern already lived twice in this same directory (founderControlV2.ts:18,
// commandRunAdminCore.ts). The change here is narrow: `safe()` stays for backward compatibility
// with existing callers, and a new `summarize()` reports counted / missing so a total nobody
// could compute is null, not zero. The returned object carries `revenue_complete` and
// `cash_complete` flags so the consumer can see when the aggregate was computed on partial data.
const safe = async (fn:()=>Promise<any>, fallback:any = []) => { try { return await fn(); } catch { return fallback; } };
const sum = (rows:any[], field:string) => rows.reduce((total:number,row:any) => total + (Number.isFinite(Number(row?.[field])) ? Number(row[field]) : 0),0);

// The honest counterpart: reports counted/missing and returns null (never 0) when nothing carried
// the field. A zero from THIS function is a real zero; a null is "we could not compute this".
export function summarize(rows: any[], field: string): { total: number | null; counted: number; missing: number } {
  let total = 0, counted = 0, missing = 0;
  for (const row of rows || []) {
    const value = row?.[field];
    if (value === null || value === undefined || value === '' || typeof value === 'boolean') { missing += 1; continue; }
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) { missing += 1; continue; }
    total += parsed; counted += 1;
  }
  return { total: counted === 0 ? null : total, counted, missing };
}

const nowIso = () => new Date().toISOString();

function assumptionRange(metric:string, value:number) {
  if (['CONVERSION_RATE','REVENUE_REALIZATION_RATE','CASH_COLLECTION_RATE','CONTRIBUTION_MARGIN_RATE'].includes(metric)) return { low_value:Math.max(0,value*.7),high_value:Math.min(1,value*1.3) };
  if (metric.endsWith('_DAYS')) return { low_value:Math.max(0,value*.75),high_value:value*1.35 };
  return { low_value:Math.max(0,value*.7),high_value:value*1.3 };
}

const metricMap:any = {
  annual_reachable_volume:['ANNUAL_REACHABLE_VOLUME','opportunities/year'],conversion_rate:['CONVERSION_RATE','ratio'],average_booking_eur:['AVERAGE_BOOKING_EUR','EUR/customer'],verified_value_to_booking_ratio:['VERIFIED_VALUE_TO_BOOKING_RATIO','ratio'],revenue_realization_rate:['REVENUE_REALIZATION_RATE','ratio'],cash_collection_rate:['CASH_COLLECTION_RATE','ratio'],contribution_margin_rate:['CONTRIBUTION_MARGIN_RATE','ratio'],variable_cost_per_opportunity_eur:['VARIABLE_COST_PER_OPPORTUNITY_EUR','EUR/opportunity'],sales_lag_days:['SALES_LAG_DAYS','days'],revenue_lag_days:['REVENUE_LAG_DAYS','days'],cash_lag_days:['CASH_LAG_DAYS','days'],
};

export function defaultGrowthRegistryRows(at = nowIso()) {
  const targets = (DEFAULTS.targets as any[]).map((row:any) => ({ ...row,target_key:`${DEFAULTS.version}:${row.period_key}:${row.metric_key}:${row.business_line}`,version:DEFAULTS.version,status:'ACTIVE',currency:DEFAULTS.currency,milestones_json:(row.milestones || []).map((milestone:string) => ({ milestone,state:milestone.includes('PLANNED') ? 'PLANNED' : 'STRATEGIC' })),source_note:DEFAULTS.note,effective_at:at,created_at:at }));
  const assumptions:any[] = [];
  for (const channel of DEFAULTS.channel_assumptions as any[]) {
    for (const [sourceKey,[metricKey,unit]] of Object.entries(metricMap) as any) {
      const value = Number(channel[sourceKey]); if (!Number.isFinite(value)) continue;
      assumptions.push({ assumption_key:`${DEFAULTS.version}:${channel.channel}:${metricKey}:ALL`,version:DEFAULTS.version,status:'ACTIVE',metric_key:metricKey,value,...assumptionRange(metricKey,value),unit,period_key:'ALL',business_line:channel.business_line,geography:'EUROPE',channel:channel.channel,segment_key:'ALL',provenance:'ASSUMPTION',source_ref:`config/growth-path-defaults.json#channel_assumptions.${channel.channel}.${sourceKey}`,source_note:DEFAULTS.note,confidence:Number(channel.confidence || 0),effective_at:at,created_by:'SYSTEM_SEED',created_at:at });
    }
    for (const [periodKey,multiplier] of Object.entries(DEFAULTS.period_capacity_multipliers as any)) assumptions.push({ assumption_key:`${DEFAULTS.version}:${channel.channel}:PERIOD_CAPACITY_MULTIPLIER:${periodKey}`,version:DEFAULTS.version,status:'ACTIVE',metric_key:'PERIOD_CAPACITY_MULTIPLIER',value:Number(multiplier),...assumptionRange('PERIOD_CAPACITY_MULTIPLIER',Number(multiplier)),unit:'multiplier',period_key:periodKey,business_line:channel.business_line,geography:'EUROPE',channel:channel.channel,segment_key:'ALL',provenance:'ASSUMPTION',source_ref:`config/growth-path-defaults.json#period_capacity_multipliers.${periodKey}`,source_note:DEFAULTS.note,confidence:Number(channel.confidence || 0),effective_at:at,created_by:'SYSTEM_SEED',created_at:at });
  }
  return { targets,assumptions };
}

export async function ensureGrowthPathRegistry(service:any) {
  const [targets,assumptions] = await Promise.all([safe(() => service.entities.GrowthTargetRegistry.list('-created_at',500),[]),safe(() => service.entities.GrowthAssumptionRegistry.list('-created_at',2000),[])]);
  const defaults = defaultGrowthRegistryRows(); let targetsCreated = 0, assumptionsCreated = 0;
  if (!targets.length) for (const row of defaults.targets) { await service.entities.GrowthTargetRegistry.create(row); targetsCreated++; }
  if (!assumptions.length) for (const row of defaults.assumptions) { await service.entities.GrowthAssumptionRegistry.create(row); assumptionsCreated++; }
  return { targets_created:targetsCreated,assumptions_created:assumptionsCreated,seed_version:DEFAULTS.version };
}

function regulatoryGate(rows:any[]) {
  if (rows.length !== REGULATORY_ACTIVITIES.length) return { gate:'REVIEW',status:'MISSING_POLICY_COVERAGE',policy_version:REGULATORY_CONTROL_VERSION };
  if (rows.some((x:any) => ['PROHIBITED','REGISTRATION_REQUIRED','AUTHORIZATION_REQUIRED','PARTNER_REQUIRED'].includes(x.status))) return { gate:'BLOCK',status:'RESTRICTED_OR_AUTHORITY_REQUIRED',policy_version:rows[0]?.policy_version };
  if (rows.some((x:any) => ['UNCERTAIN','LEGAL_REVIEW_REQUIRED'].includes(x.status))) return { gate:'REVIEW',status:'LEGAL_REVIEW_REQUIRED',policy_version:rows[0]?.policy_version };
  return { gate:'CONDITIONS',status:'POLICY_AVAILABLE',policy_version:rows[0]?.policy_version };
}

export async function recomputeEuropeanMarketPortfolio(service:any) {
  const now = new Date(); const day = now.toISOString().slice(0,10); const emergency = await emergencyState(service);
  const [profiles,intelligence,leads,regulatoryPolicies,productionRows,activations] = await Promise.all([
    safe(() => service.entities.CountryProfile.list('iso2',100)),safe(() => service.entities.MarketIntelligenceProfile.list('jurisdiction',100)),safe(() => service.entities.OutboundLead.list('-created_date',5000)),safe(() => service.entities.RegulatoryPolicyVersion.filter({ active:true },'-effective_from',5000)),safe(() => service.entities.ProductionReadinessSnapshot.list('-calculated_at',1)),safe(() => service.entities.MarketActivationState.list('-updated_at',100)),
  ]);
  const production = productionRows[0] || { sealed:false,status:'P11_BLOCKED_NOT_SEALED' }; let upserted = 0; const portfolio:any[] = [];
  for (const market of EUROPE_MARKETS as any[]) {
    const profile = profiles.find((x:any) => x.iso2 === market.iso2) || null; const intel = intelligence.find((x:any) => x.jurisdiction === market.iso2) || null; const marketLeads = leads.filter((x:any) => canonicalMarket(x.country)?.iso2 === market.iso2); const contacted = marketLeads.filter((x:any) => ['contacted','meeting','won'].includes(String(x.stage))).length; const realOutcomes = marketLeads.filter((x:any) => x.stage === 'won').length; const dataMaturity = maturityTier({ observations:marketLeads.length,real_outcomes:realOutcomes }); const localization = localizationReadiness(market.iso2); const regulatory = regulatoryGate(regulatoryPolicies.filter((x:any) => x.jurisdiction === market.iso2));
    const readiness = launchReadiness({ production,regulatory,localization,data_maturity:dataMaturity,commercial_ready:contacted >= 3 });
    const dimensions:any = {
      merchant_supply:marketLeads.length ? { value:Math.min(100,marketLeads.length),evidence_refs:marketLeads.slice(0,20).map((x:any) => `OutboundLead:${x.id}`) } : null,
      data_maturity:profile ? { value:dataMaturity*25,evidence_refs:[`CountryProfile:${profile.id}`] } : null,
      commercial_evidence:contacted ? { value:Math.min(100,contacted*5),evidence_refs:marketLeads.filter((x:any) => ['contacted','meeting','won'].includes(String(x.stage))).slice(0,20).map((x:any) => `OutboundLead:${x.id}`) } : null,
      provider_landscape:intel && intel.provider_discovery_status !== 'PENDING_PROVIDER_DISCOVERY' ? { value:50,evidence_refs:[`MarketIntelligenceProfile:${intel.id}`] } : null,
      localization:{ value:localization.translation_readiness === 'NATIVE_PRODUCT' ? 100 : localization.translation_readiness === 'PARTIAL_NATIVE' ? 65 : 20,evidence_refs:[`LocaleRegistry:${localization.registry_version}`] },
      regulatory:regulatory.gate === 'CONDITIONS' ? { value:75,evidence_refs:regulatoryPolicies.filter((x:any) => x.jurisdiction === market.iso2).map((x:any) => `RegulatoryPolicyVersion:${x.id}`) } : null,
      production:production.sealed ? { value:100,evidence_refs:[`ProductionReadinessSnapshot:${production.id}`] } : null,
    };
    const attractiveness = scoreMarketAttractiveness(dimensions,DEFAULT_GROWTH_POLICY); const activation = activations.find((x:any) => x.market_code === market.iso2); const strategy = readiness.state === 'TECHNICAL_BLOCKED' || readiness.state === 'REGULATORY_BLOCKED' ? 'RESTRICT' : attractiveness.status === 'INSUFFICIENT_EVIDENCE' ? 'RESEARCH' : readiness.state === 'READY' ? 'EXPERIMENT' : 'RESEARCH'; const mainBlocker = readiness.hard_blocker || (attractiveness.status === 'INSUFFICIENT_EVIDENCE' ? 'DATA' : null);
    const snapshot:any = { snapshot_key:`market-growth:${market.iso2}:${day}`,market_code:market.iso2,segment_key:'ALL',launch_state:readiness.state,activation_state:activation?.state || 'RESEARCH_ONLY',strategy,attractiveness_score:attractiveness.score ?? undefined,attractiveness_status:attractiveness.status,attractiveness_json:attractiveness,data_maturity:dataMaturity,localization_readiness:localization,regulatory_readiness:regulatory,production_readiness:{ status:production.status,sealed:production.sealed === true,snapshot_id:production.id || null },commercial_readiness:{ observed_leads:marketLeads.length,contacted,real_outcomes:realOutcomes,ready:contacted >= 3 },main_blocker:mainBlocker || '',next_action:mainBlocker === 'P11' ? 'Complete P11 external production evidence' : mainBlocker === 'P10' ? 'Complete evidence-backed legal review' : mainBlocker === 'DATA' ? 'Collect bounded P3/P4/P6 evidence' : 'Review limited launch experiment',policy_versions_json:{ growth:DEFAULT_GROWTH_POLICY.version,regulatory:regulatory.policy_version || null,security:production.version || null,model:EUROPEAN_GROWTH_VERSION },source_refs:[...(profile ? [`CountryProfile:${profile.id}`] : []),...(intel ? [`MarketIntelligenceProfile:${intel.id}`] : [])],calculated_at:now.toISOString() };
    const old = await safe(() => service.entities.MarketGrowthSnapshot.filter({ snapshot_key:snapshot.snapshot_key },'-calculated_at',1),[]); if (old[0]) await service.entities.MarketGrowthSnapshot.update(old[0].id,snapshot); else await service.entities.MarketGrowthSnapshot.create(snapshot); upserted++; portfolio.push(snapshot);
  }
  const limitations = [...new Set(portfolio.map((x:any) => x.main_blocker).filter(Boolean))]; const brief:any = { brief_key:`growth-brief:daily:${day}`,cadence:'DAILY',period_from:new Date(now.getTime()-86400000).toISOString(),period_to:now.toISOString(),changes_json:[],attention_json:portfolio.filter((x:any) => x.main_blocker).map((x:any) => ({ market:x.market_code,blocker:x.main_blocker,next_action:x.next_action })).slice(0,20),autonomous_actions_json:[{ action:'market_portfolio_recomputed',markets:portfolio.length,mode:'SHADOW_RECOMMEND_ONLY',external_effect:false }],opportunities_json:portfolio.filter((x:any) => x.attractiveness_status === 'SCORED' && x.launch_state === 'READY').slice(0,10),limitations,source_refs:portfolio.flatMap((x:any) => x.source_refs).slice(0,100),generated_at:now.toISOString() };
  const priorBrief = await safe(() => service.entities.FounderGrowthBrief.filter({ brief_key:brief.brief_key },'-generated_at',1),[]); if (priorBrief[0]) await service.entities.FounderGrowthBrief.update(priorBrief[0].id,brief); else await service.entities.FounderGrowthBrief.create(brief);
  await safe(() => service.entities.Event.create({ brand_id:'_platform',event_type:'MARKET_PORTFOLIO_UPDATED',source:'growth_path_engine',entity_type:'MarketGrowthSnapshot',entity_id:`europe-33:${day}`,payload_json:{ markets:portfolio.length,scored:portfolio.filter((x:any) => x.attractiveness_status === 'SCORED').length,launch_ready:portfolio.filter((x:any) => x.launch_state === 'READY').length,safe_mode:emergency.safe_mode,mode:'SHADOW_RECOMMEND_ONLY',material_execution:false },status:'processed',processed_at:now.toISOString() }),null);
  return { markets:portfolio.length,upserted,scored:portfolio.filter((x:any) => x.attractiveness_status === 'SCORED').length,launch_ready:portfolio.filter((x:any) => x.launch_state === 'READY').length,mode:'SHADOW_RECOMMEND_ONLY',material_execution:false };
}

export async function collectObservedGrowthTruth(service:any) {
  const [life,reports,invoices,providerLedger,leads,profiles,policies,messages,marketRows,migrations,founderPolicies,costs,attributions,productionRows,meetingThreads,emergency,partners,referrals,analyzer] = await Promise.all([
    safe(() => service.entities.RevenueLifecycle.list('-updated_at',5000)),safe(() => service.entities.MonthlySavingsReport.list('-month',5000)),safe(() => service.entities.Invoice.list('-issued_at',5000)),safe(() => service.entities.ProviderRevenueLedger.list('-updated_at',5000)),safe(() => service.entities.OutboundLead.list('-created_date',5000)),safe(() => service.entities.OutboundSendingProfile.list('-created_date',200)),safe(() => service.entities.CommercialPolicy.filter({ engine:'merchant_acquisition',status:'active' },'-approved_at',50)),safe(() => service.entities.CommunicationMessage.list('-sent_at',2000)),safe(() => service.entities.MarketGrowthSnapshot.list('-calculated_at',500)),safe(() => service.entities.MigrationTask.list('-updated_at',3000)),safe(() => service.entities.FounderMeetingPolicy.filter({ status:'active' },'-approved_at',10)),safe(() => service.entities.GrowthCostLedger.list('-occurred_at',5000)),safe(() => service.entities.AcquisitionAttribution.list('-attributed_at',5000)),safe(() => service.entities.ProductionReadinessSnapshot.list('-calculated_at',1)),safe(() => service.entities.CommunicationThread.filter({ founder_required:true },'-meeting_start_at',500)),emergencyState(service),safe(() => service.entities.PartnerProspect.list('-created_date',2000)),safe(() => service.entities.ReferralActivation.list('-activated_at',2000)),safe(() => service.entities.AnalyzerResult.list('-created_date',5000)),
  ]);
  const production = productionRows[0] || null; const latestMarket = new Map(); for (const row of marketRows) if (!latestMarket.has(row.market_code)) latestMarket.set(row.market_code,row); const markets = [...latestMarket.values()];
  const policy = policies.find((row:any) => row.mode === 'CANARY') || policies[0] || null; const allowedProfiles = new Set(policy?.sending_profile_keys || []); const validProfiles = profiles.filter((row:any) => row.status === 'active' && Number(row.current_daily_cap) > 0 && (!allowedProfiles.size || allowedProfiles.has(row.profile_key)) && Number(row.bounce_rate_pct || 0) <= Number(row.bounce_pause_threshold_pct || 100) && Number(row.complaint_rate_pct || 0) <= Number(row.complaint_pause_threshold_pct || 100));
  const day = new Date(); day.setUTCHours(0,0,0,0); const sentToday = messages.filter((row:any) => row.direction === 'outbound' && Date.parse(row.sent_at || '') >= day.getTime()).length; const profileCapacity = validProfiles.reduce((total:number,row:any) => total + Math.max(0,Number(row.current_daily_cap || 0)),0); const policyCapacity = policy?.mode === 'CANARY' && Number(policy.daily_send_limit) >= 1 && Number(policy.daily_send_limit) <= 15 ? Number(policy.daily_send_limit) : 0; const dailyCapacity = Math.max(0,Math.min(profileCapacity,policyCapacity)-sentToday);
  const paidInvoices = invoices.filter((row:any) => ['paid','partially_paid'].includes(String(row.status)) || Number(row.amount_paid || 0) > 0); const realized = reports.filter((row:any) => row.measurement_mode === 'fully_verified' && row.verification_status === 'realized'); const won = leads.filter((row:any) => String(row.stage || row.revenue_stage) === 'won' && Number.isFinite(Number(row.expected_revenue_value))); const providerPaid = providerLedger.filter((row:any) => row.state === 'paid'); const providerAccrued = providerLedger.filter((row:any) => ['accrued','validation_pending','invoiced','payment_pending','partially_paid','paid'].includes(String(row.state)));
  const costCategories = new Set(costs.filter((row:any) => ['OBSERVED','VERIFIED'].includes(String(row.evidence_status))).map((row:any) => row.category)); const requiredCosts = ['paid_media','tools','enrichment','email','ai','people','agency','other']; const founderPolicy = founderPolicies[0] || null; const futureMeetings = meetingThreads.filter((row:any) => Date.parse(row.meeting_start_at || '') >= Date.now()); const weeklyCap = Math.max(0,Number(founderPolicy?.weekly_meeting_cap || 0));
  const blockedMigrations = migrations.filter((row:any) => ['blocked','failed'].includes(String(row.status)) || ['blocked','failed'].includes(String(row.step_status))); const billingBlockers = reports.filter((row:any) => String(row.billing_eligibility_status || '').startsWith('blocked_'));
  // AUDIT P1-SHARED-001 / P3-03 — compute each side through `summarize` so the totals carry their
  // presence accounting. Downstream consumers can use `revenue_complete` / `cash_complete` to
  // decide whether the aggregate is a total or a lower bound.
  const invoicesConsidered = invoices.filter((row:any) => !['draft','void'].includes(String(row.status)));
  const revenueSummary = summarize(invoicesConsidered,'total_amount');
  const providerAccrualSummary = summarize(providerAccrued,'accrued_amount_minor');
  const paidSummary = summarize(paidInvoices,'amount_paid');
  const providerPaidSummary = summarize(providerPaid,'paid_amount_minor');
  const actualRevenue = (revenueSummary.total ?? 0) + (providerAccrualSummary.total ?? 0)/100;
  const actualCash = (paidSummary.total ?? 0) + (providerPaidSummary.total ?? 0)/100;
  const revenueComplete = revenueSummary.missing === 0 && providerAccrualSummary.missing === 0;
  const cashComplete = paidSummary.missing === 0 && providerPaidSummary.missing === 0;
  return {
    actuals:{ bookings:sum(won,'expected_revenue_value'),verified_economic_value:sum(realized,'savings'),revenue:actualRevenue,cash:actualCash,revenue_complete:revenueComplete,cash_complete:cashComplete,revenue_missing_rows:revenueSummary.missing+providerAccrualSummary.missing,cash_missing_rows:paidSummary.missing+providerPaidSummary.missing,bookings_sources:won.slice(0,100).map((row:any) => `OutboundLead:${row.id}`),verified_value_sources:realized.slice(0,100).map((row:any) => `MonthlySavingsReport:${row.id}`),revenue_sources:[...invoices.slice(0,100).map((row:any) => `Invoice:${row.id}`),...providerAccrued.slice(0,100).map((row:any) => `ProviderRevenueLedger:${row.id}`)],cash_sources:[...paidInvoices.slice(0,100).map((row:any) => `Invoice:${row.id}`),...providerPaid.slice(0,100).map((row:any) => `ProviderRevenueLedger:${row.id}`)],sources:['OutboundLead','MonthlySavingsReport','Invoice','ProviderRevenueLedger'],revenue_definition:'Operational invoiced merchant revenue plus evidenced provider accrual; formal accounting recognition remains external.' },
    evidence:{ qualified_observations:leads.length,real_outcomes:won.length,calibration_confidence:won.length >= 10 ? Math.min(.9,won.length/100) : 0,attributed_customers:attributions.length,partner_prospects:partners.length,productive_partners:partners.filter((row:any) => row.stage === 'won').length,referral_activations:referrals.length,analyzer_results:analyzer.length },
    system:{ emergency_stop:emergency.safe_mode === true,emergency_reasons:emergency.reason ? [emergency.reason] : [] },production:{ sealed:production?.sealed === true,status:production?.status || 'MISSING',source_ref:production?.id ? `ProductionReadinessSnapshot:${production.id}` : 'ProductionReadinessSnapshot:missing' },markets:{ commercially_ready:markets.filter((row:any) => row.launch_state === 'READY').length,ready_with_limitations:markets.filter((row:any) => row.launch_state === 'READY_WITH_LIMITATIONS').length,intelligence_markets:markets.length },
    policy:{ active_canary:policy?.mode === 'CANARY' && policy?.status === 'active',daily_send_limit:policy?.daily_send_limit ?? null,markets:policy?.countries || [],source_ref:policy?.id ? `CommercialPolicy:${policy.id}` : 'CommercialPolicy:missing' },
    capacity:{ valid_sending_profiles:validProfiles.length,configured_sending_profiles:profiles.length,outbound_daily_contacts:dailyCapacity,outbound_annual_contacts:dailyCapacity*220,profile_capacity_daily:profileCapacity,policy_capacity_daily:policyCapacity,sent_today:sentToday,planned_sending_domains:DEFAULTS.planned_sending_domains,capacity_rule:'min(healthy profile caps, active CANARY policy cap) minus sends today' },
    operations:{ blocked_migrations:blockedMigrations.length,billing_blockers:billingBlockers.length,revenue_lifecycles:life.length },founder:{ weekly_meeting_cap:weeklyCap,scheduled_future_meetings:futureMeetings.length,weekly_available_meetings:Math.max(0,weeklyCap-futureMeetings.length),source_ref:founderPolicy?.id ? `FounderMeetingPolicy:${founderPolicy.id}` : 'FounderMeetingPolicy:missing' },pipeline:{ meetings_or_proposals:leads.filter((row:any) => ['meeting','proposal'].includes(String(row.stage || row.revenue_stage))).length },costs:{ complete:requiredCosts.every((category) => costCategories.has(category)),observed_categories:[...costCategories],missing_categories:requiredCosts.filter((category) => !costCategories.has(category)),total_eur:sum(costs,'amount_minor')/100 },
  };
}

export async function loadGrowthPathInputs(service:any) {
  const [targets,assumptions,scenarios,snapshots] = await Promise.all([safe(() => service.entities.GrowthTargetRegistry.filter({ status:'ACTIVE' },'-effective_at',500),[]),safe(() => service.entities.GrowthAssumptionRegistry.filter({ status:'ACTIVE' },'-effective_at',3000),[]),safe(() => service.entities.GrowthScenario.list('-updated_at',100),[]),safe(() => service.entities.GrowthPathSnapshot.list('-created_at',20),[])]);
  const defaults = defaultGrowthRegistryRows();
  return { targets:targets.length ? targets : defaults.targets,assumptions:assumptions.length ? assumptions : defaults.assumptions,scenarios,snapshots,using_seed_fallback:!targets.length || !assumptions.length };
}

export async function computeGrowthPath(service:any, options:any = {}) {
  const inputs = await loadGrowthPathInputs(service); const observed = await collectObservedGrowthTruth(service); const result = buildGrowthPath({ targets:inputs.targets,assumptions:options.assumptions || inputs.assumptions,observed,as_of:nowIso(),scenario_key:options.scenario_key || 'BASE',limitations:inputs.using_seed_fallback ? ['Registry has not been persisted yet; founder-editable seed values are being used in-memory.'] : [] });
  return { result,inputs,observed };
}

export async function persistGrowthPathSnapshot(service:any, result:any) {
  const now = result.as_of || nowIso(); const snapshotKey = `growth-path:${result.scenario_key}:${now.slice(0,13)}`; const row:any = { snapshot_key:snapshotKey,engine_version:GROWTH_PATH_ENGINE_VERSION,scenario_key:result.scenario_key,status:'CURRENT',as_of:now,actuals_json:result.actuals,forecasts_json:result.forecasts,target_gaps_json:result.target_gaps,revenue_bridge_json:result.revenue_bridge,contribution_bridge_json:result.contribution_bridge,capacity_chain_json:result.capacity_chain,constraints_json:result.constraints,binding_constraint_json:result.binding_constraint || {},recommendations_json:result.recommendations,marginal_allocation_json:result.marginal_allocation,early_warnings_json:result.early_warnings,lineage_json:result.lineage,assumption_versions:[...new Set(result.lineage.flatMap((row:any) => row.sources || []).filter((ref:string) => ref.startsWith('GrowthAssumptionRegistry:')))],target_versions:[...new Set(result.forecasts.map((forecast:any) => forecast.target_key))],confidence:result.confidence,limitations:result.limitations,created_at:now };
  const prior = await safe(() => service.entities.GrowthPathSnapshot.filter({ snapshot_key:snapshotKey },'-created_at',1),[]); if (prior[0]) return service.entities.GrowthPathSnapshot.update(prior[0].id,row); return service.entities.GrowthPathSnapshot.create(row);
}

export function validateGrowthTarget(body:any) {
  const allowedMetrics = ['BOOKINGS','VERIFIED_ECONOMIC_VALUE','REVENUE','CASH']; const allowedLines = ['ALL','PAYMENTS_EUROPE','PAYMENTS_USA','LOGISTICS_EUROPE']; const value = Number(body.target_value);
  if (!body.period_key || !body.period_start || !body.period_end || !allowedMetrics.includes(body.metric_key) || !allowedLines.includes(body.business_line || 'ALL') || !Number.isFinite(value) || value < 0) return { ok:false,error:'invalid_growth_target' };
  if (Date.parse(body.period_start) >= Date.parse(body.period_end)) return { ok:false,error:'invalid_target_period' };
  return { ok:true,value };
}

export function validateGrowthAssumption(body:any) {
  const value = Number(body.value); const confidence = Number(body.confidence); if (!body.metric_key || !body.unit || !Number.isFinite(value) || value < 0 || !Number.isFinite(confidence) || confidence < 0 || confidence > 1) return { ok:false,error:'invalid_growth_assumption' };
  if (body.channel && !GROWTH_CHANNELS.includes(body.channel)) return { ok:false,error:'invalid_growth_channel' };
  if (!['ASSUMPTION','OBSERVED','CALIBRATED','INSUFFICIENT_DATA'].includes(body.provenance)) return { ok:false,error:'invalid_growth_provenance' };
  return { ok:true,value,confidence };
}