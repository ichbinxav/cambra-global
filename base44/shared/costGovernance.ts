export const COST_GOVERNANCE_VERSION = 'cost-governance-1.0.0';
export const COST_CATEGORIES = Object.freeze(['ai', 'api', 'enrichment', 'email']);

const positiveInteger = (value:any) => Number.isInteger(Number(value)) && Number(value) > 0;

export function validateCostBudget(control:any) {
  const blockers:string[] = [];
  if (!control || control.status !== 'active') blockers.push('active_cost_budget_required');
  if (control?.currency !== 'EUR') blockers.push('cost_budget_currency_must_be_eur');
  const dailyTotal = Number(control?.daily_total_limit_minor);
  const monthlyTotal = Number(control?.monthly_total_limit_minor);
  if (!positiveInteger(dailyTotal)) blockers.push('daily_total_cost_limit_required');
  if (!positiveInteger(monthlyTotal) || monthlyTotal < dailyTotal) blockers.push('monthly_total_cost_limit_invalid');
  const limits = control?.category_limits_json || {};
  for (const category of COST_CATEGORIES) {
    const daily = Number(limits?.[category]?.daily_limit_minor);
    const monthly = Number(limits?.[category]?.monthly_limit_minor);
    if (!positiveInteger(daily)) blockers.push(`${category}_daily_cost_limit_required`);
    if (!positiveInteger(monthly) || monthly < daily) blockers.push(`${category}_monthly_cost_limit_invalid`);
  }
  const warning = Number(control?.anomaly_warning_pct);
  const hardStop = Number(control?.hard_stop_pct);
  if (!Number.isFinite(warning) || warning < 1 || warning >= 100) blockers.push('cost_anomaly_warning_pct_invalid');
  if (!Number.isFinite(hardStop) || hardStop < warning || hardStop > 100) blockers.push('cost_hard_stop_pct_invalid');
  if (control?.emergency_stop_active === true) blockers.push('cost_emergency_stop_active');
  return { ok:blockers.length === 0, blockers:[...new Set(blockers)], version:COST_GOVERNANCE_VERSION };
}

function utcBounds(at = new Date()) {
  const day = new Date(at); day.setUTCHours(0, 0, 0, 0);
  const month = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), 1));
  return { dayStart:day.toISOString(), monthStart:month.toISOString() };
}

export function summarizeCostUsage(events:any[] = [], at = new Date()) {
  const { dayStart, monthStart } = utcBounds(at);
  // FAILED attempts remain conservatively budgeted: a provider can charge for a
  // request even when our transport/parser reports failure. Only an explicit
  // reconciliation may VOID a non-billable attempt.
  const active = events.filter((event:any) => ['RESERVED','OBSERVED','RECONCILED','FAILED'].includes(String(event?.status || '')));
  const sum = (rows:any[]) => rows.reduce((total:number, event:any) => total + Math.max(0, Number(event?.amount_minor || 0)), 0);
  const daily = active.filter((event:any) => String(event?.occurred_at || '') >= dayStart);
  const monthly = active.filter((event:any) => String(event?.occurred_at || '') >= monthStart);
  const categories:any = {};
  for (const category of COST_CATEGORIES) categories[category] = {
    daily_minor:sum(daily.filter((event:any) => event.category === category)),
    monthly_minor:sum(monthly.filter((event:any) => event.category === category)),
  };
  return { daily_total_minor:sum(daily), monthly_total_minor:sum(monthly), categories, day_start:dayStart, month_start:monthStart };
}

export function costReservationDecision(input:any) {
  const validation = validateCostBudget(input?.control);
  if (!validation.ok) return { allowed:false, reason:validation.blockers[0], blockers:validation.blockers };
  const category = String(input?.category || '');
  if (!COST_CATEGORIES.includes(category)) return { allowed:false, reason:'known_cost_category_required', blockers:['known_cost_category_required'] };
  const amount = Math.max(0, Math.ceil(Number(input?.amount_minor || 0)));
  if (!positiveInteger(amount)) return { allowed:false, reason:'positive_cost_reservation_required', blockers:['positive_cost_reservation_required'] };
  const usage = input?.usage || summarizeCostUsage([]);
  const control = input.control;
  const limits = control.category_limits_json?.[category] || {};
  const projected = {
    daily_total_minor:Number(usage.daily_total_minor || 0) + amount,
    monthly_total_minor:Number(usage.monthly_total_minor || 0) + amount,
    category_daily_minor:Number(usage.categories?.[category]?.daily_minor || 0) + amount,
    category_monthly_minor:Number(usage.categories?.[category]?.monthly_minor || 0) + amount,
  };
  const blockers:string[] = [];
  if (projected.daily_total_minor > Number(control.daily_total_limit_minor)) blockers.push('daily_total_cost_budget_exceeded');
  if (projected.monthly_total_minor > Number(control.monthly_total_limit_minor)) blockers.push('monthly_total_cost_budget_exceeded');
  if (projected.category_daily_minor > Number(limits.daily_limit_minor)) blockers.push(`${category}_daily_cost_budget_exceeded`);
  if (projected.category_monthly_minor > Number(limits.monthly_limit_minor)) blockers.push(`${category}_monthly_cost_budget_exceeded`);
  return { allowed:blockers.length === 0, reason:blockers[0] || 'within_cost_budget', blockers, projected, amount_minor:amount, budget_version:control.version };
}

export async function activateCostEmergencyStop(svc:any, control:any, reason:string, details:any = {}) {
  const now = new Date().toISOString();
  await svc.entities.CostBudgetControl.update(control.id, { emergency_stop_active:true, emergency_stop_reason:reason, updated_at:now, updated_by:'cost_governor' }).catch(() => null);
  const outbound = (await svc.entities.OutboundControl.filter({ control_key:'global' }, '-created_date', 1).catch(() => []))[0];
  if (outbound) await svc.entities.OutboundControl.update(outbound.id, { acquisition_enabled:false, premium_outlook_enabled:false, volume_resend_enabled:false, paused_reason:`cost_emergency_stop:${reason}` }).catch(() => null);
  const old = await svc.entities.AutonomyIncident.filter({ dedupe_key:'cost-budget-emergency-stop', status:'open' }, '-last_seen_at', 1).catch(() => []);
  const incident = { domain:'financial', severity:'critical', status:'open', subject_type:'CostBudgetControl', subject_id:control.id, summary:`Paid execution stopped: ${reason}`, details_json:{ ...details, budget_version:control.version }, first_seen_at:old[0]?.first_seen_at || now, last_seen_at:now, workflow_state:'human_review', owner_type:'founder', automation_eligibility:'human_required', financial_impact_minor:0, customer_impact:'none', legal_risk:'none' };
  if (old[0]) await svc.entities.AutonomyIncident.update(old[0].id, incident).catch(() => null);
  else await svc.entities.AutonomyIncident.create({ dedupe_key:'cost-budget-emergency-stop', ...incident }).catch(() => null);
  await svc.entities.OperationalLog.create({ event_type:'cost_emergency_stop_activated', message:reason, data_json:details, actor_email:'cost_governor', created_at:now }).catch(() => null);
}

export async function reservePaidOperation(svc:any, input:any) {
  const eventKey = String(input?.event_key || '').trim();
  if (!eventKey) throw Object.assign(new Error('cost_event_key_required'), { code:'COST_EVENT_KEY_REQUIRED' });
  const existing = await svc.entities.CostUsageEvent.filter({ event_key:eventKey }, '-occurred_at', 2).catch(() => []);
  if (existing[0] && !['VOID','FAILED'].includes(String(existing[0].status))) return { duplicate:true, event:existing[0], decision:{ allowed:true, reason:'existing_cost_reservation' } };
  const controls = await svc.entities.CostBudgetControl.filter({ control_key:'global', status:'active' }, '-approved_at', 5).catch(() => []);
  const control = controls[0] || null;
  const validation = validateCostBudget(control);
  if (!validation.ok) throw Object.assign(new Error(validation.blockers[0]), { code:'COST_BUDGET_BLOCKED', blockers:validation.blockers });
  const bounds = utcBounds();
  const events = await svc.entities.CostUsageEvent.filter({ occurred_at:{ $gte:bounds.monthStart } }, '-occurred_at', 5000).catch(() => []);
  if (events.length >= 5000) throw Object.assign(new Error('cost_usage_coverage_truncated'), { code:'COST_USAGE_COVERAGE_TRUNCATED' });
  const usage = summarizeCostUsage(events);
  const configuredAmount = Number(control?.estimated_unit_cost_minor_json?.[String(input.category || '')]);
  const amountMinor = Number.isFinite(Number(input.amount_minor)) && Number(input.amount_minor) > 0 ? Number(input.amount_minor) : configuredAmount;
  const decision = costReservationDecision({ control, usage, category:input.category, amount_minor:amountMinor });
  if (!decision.allowed) {
    await activateCostEmergencyStop(svc, control, decision.reason, { category:input.category, projected:decision.projected, blockers:decision.blockers });
    throw Object.assign(new Error(decision.reason), { code:'COST_BUDGET_EXCEEDED', blockers:decision.blockers, projected:decision.projected });
  }
  const event = await svc.entities.CostUsageEvent.create({
    event_key:eventKey, category:String(input.category), provider:String(input.provider || 'unknown'), source:String(input.source || 'unknown'),
    related_entity_type:String(input.related_entity_type || ''), related_entity_id:String(input.related_entity_id || ''),
    amount_minor:decision.amount_minor, currency:'EUR', status:'RESERVED', usage_json:{ reservation:true },
    budget_version:control.version, occurred_at:new Date().toISOString(),
  });
  return { duplicate:false, event, decision, control };
}

export async function settlePaidOperation(svc:any, reservation:any, input:any = {}) {
  if (!reservation?.event?.id || reservation.duplicate) return reservation?.event || null;
  return svc.entities.CostUsageEvent.update(reservation.event.id, {
    status:input.ok === false ? 'FAILED' : 'OBSERVED',
    amount_minor:Number.isFinite(Number(input.amount_minor)) ? Math.max(0, Math.ceil(Number(input.amount_minor))) : reservation.event.amount_minor,
    usage_json:{ ...(reservation.event.usage_json || {}), ...(input.usage_json || {}), amount_quality:input.amount_quality || 'CONSERVATIVE_RESERVATION' },
    completed_at:new Date().toISOString(),
  }).catch(() => null);
}

/** Cost-gated transport for paid provider endpoints that need a custom request/response shape. */
export async function paidProviderFetch(svc:any, input:any, url:string | URL, init?:RequestInit) {
  const logicalKey = String(input?.event_key || 'unkeyed');
  const reservation = await reservePaidOperation(svc, { ...input, event_key:`${logicalKey}:${crypto.randomUUID()}` });
  try {
    const response = await fetch(url, init);
    await settlePaidOperation(svc, reservation, { ok:response.ok, usage_json:{ http_status:response.status }, amount_quality:'CONSERVATIVE_RESERVATION' });
    return response;
  } catch (error) {
    await settlePaidOperation(svc, reservation, { ok:false, usage_json:{ transport_error:String((error as Error)?.message || error).slice(0,200) }, amount_quality:'CONSERVATIVE_RESERVATION' });
    throw error;
  }
}

export async function sendCostGovernedEmail(svc:any, input:any, payload:any) {
  const logicalKey = String(input?.event_key || 'unkeyed');
  const reservation = await reservePaidOperation(svc, { ...input, event_key:`${logicalKey}:${crypto.randomUUID()}`, category:'email', provider:String(input?.provider || 'base44_email') });
  try {
    const result = await svc.integrations.Core.SendEmail(payload);
    await settlePaidOperation(svc, reservation, { ok:true, usage_json:{ recipient_count:Array.isArray(payload?.to) ? payload.to.length : 1 }, amount_quality:'CONSERVATIVE_RESERVATION' });
    return result;
  } catch (error) {
    await settlePaidOperation(svc, reservation, { ok:false, usage_json:{ transport_error:String((error as Error)?.message || error).slice(0,200) }, amount_quality:'CONSERVATIVE_RESERVATION' });
    throw error;
  }
}

export async function costRuntimeSnapshot(svc:any) {
  const controls = await svc.entities.CostBudgetControl.filter({ control_key:'global', status:'active' }, '-approved_at', 5).catch(() => []);
  const control = controls[0] || null;
  const bounds = utcBounds();
  const events = await svc.entities.CostUsageEvent.filter({ occurred_at:{ $gte:bounds.monthStart } }, '-occurred_at', 5000).catch(() => []);
  const usage = summarizeCostUsage(events);
  const validation = validateCostBudget(control);
  const pct = (used:number, limit:any) => Number(limit) > 0 ? used * 100 / Number(limit) : null;
  const utilization = {
    daily_total_pct:pct(usage.daily_total_minor, control?.daily_total_limit_minor),
    monthly_total_pct:pct(usage.monthly_total_minor, control?.monthly_total_limit_minor),
    categories:Object.fromEntries(COST_CATEGORIES.map((category) => [category, {
      daily_pct:pct(usage.categories[category].daily_minor, control?.category_limits_json?.[category]?.daily_limit_minor),
      monthly_pct:pct(usage.categories[category].monthly_minor, control?.category_limits_json?.[category]?.monthly_limit_minor),
    }])),
  };
  return { control, validation, usage, utilization, coverage_truncated:events.length >= 5000 };
}
