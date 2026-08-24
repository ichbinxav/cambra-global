// One allowlisted projection for both interactive Command chat and durable runs.
// Raw entity rows never enter model context.

const text = (value: unknown) => String(value ?? '').trim();

export const COMMAND_READ_STATE_VERSION = 'command-read-state-1.0.0';

export const COMMAND_READ_SAFE_FIELDS: Record<string, string[]> = {
  AgentTask: ['id','brand_id','agent_name','task_type','status','risk_level','requires_approval','input_summary','output_summary','error','created_date','started_at','completed_at'],
  AgentQuestion: ['id','brand_id','agent_name','question','status','created_date','answered_at'],
  Approval: ['id','brand_id','action_type','status','risk_level','summary','created_date','approved_at','rejected_at'],
  Event: ['id','brand_id','event_type','source','entity_type','entity_id','status','created_date'],
  ChatMessage: ['id','conversation_id','role','content','blocked_by_gate','created_date'],
  Brand: ['id','name','category','country','sector','annual_revenue','created_date'],
  AnalyzerInput: ['id','brand_id','vertical','created_date'],
  AnalyzerResult: ['id','brand_id','infra_score','total_savings','payment_savings','created_date'],
  Integration: ['id','brand_id','provider','category','status','scopes','connected_at','last_sync_at','last_sync_status','provider_account_id'],
  IntegrationCatalog: ['id','provider','category','name','status','created_date'],
  OutboundLead: ['id','company_name','company_domain','country','industry','stage','score','pre_score','revenue_opportunity_score','revenue_confidence','employee_range','revenue_range','ecommerce_platform','probable_payment_stack','estimated_tpv_min_eur','estimated_tpv_max_eur','estimation_status','contactability','outreach_eligibility','compliance_status','source','created_date'],
  CommercialCampaign: ['id','campaign_key','name','status','target_profile_id','policy_key','policy_version','provider_mode','lead_ids','sending_profile_keys','capacity_preview_json','blockers','metrics_json','created_at','updated_at'],
  CommercialPolicy: ['id','policy_key','version','engine','status','mode','countries','icp_json','excluded_domains','daily_send_limit','min_lead_score','min_opportunity_score','min_confidence','sending_profile_keys','created_date','updated_date'],
  OutboundSendingProfile: ['id','profile_key','provider','domain','from_address','status','current_daily_cap','target_daily_cap','bounce_rate_pct','complaint_rate_pct','webhook_status','last_provider_health_at'],
  CommunicationThread: ['id','thread_key','engine','lead_id','company_name','status','conversation_state','last_message_at','next_action_at','automation_paused','pause_reason','sending_profile_key','sending_profile_resolution_status'],
  Lead: ['id','company','country','status','source','created_date'],
  ProviderLead: ['id','provider_name','category','country','status','created_date'],
  BenchmarkContribution: ['id','brand_id','cohort_key','vertical','created_date'],
  BenchmarkCohort: ['id','cohort_key','vertical','sample_size','is_public','created_date'],
  StatementImport: ['id','brand_id','provider','status','confidence','owner_email','created_date'],
  Recommendation: ['id','brand_id','vertical','title','status','priority','created_date'],
  FounderDecision: ['id','decision_key','decision_type','status','title','summary','recommended_option','confidence','approval_id','created_at','updated_at'],
  FounderSimulation: ['id','simulation_key','simulation_type','status','scenario','confidence','production_effect','created_at'],
  StrategyDirective: ['id','directive_key','scope','directive','status','priority','effective_from','effective_to','created_at'],
  FounderCommandAudit: ['id','command_key','intent','action','risk_level','material','requires_confirmation','confirmed','status','created_at'],
  User: ['id','name','role','created_date'],
  SchedulerRun: ['id','record_kind','worker_key','run_key','cadence_seconds','invocation_kind','status','material_effect_state','claim_acquired','started_at','heartbeat_at','completed_at'],
  MaintenanceRun: ['id','run_key','engine_version','status','started_at','completed_at','health_score','signals_detected','automatic_repairs','repairs_verified','repairs_failed','escalations','learning_updates'],
  AutonomyIncident: ['id','domain','severity','status','subject_type','subject_id','summary','first_seen_at','last_seen_at','resolved_at','workflow_state','owner_type','automation_eligibility','financial_impact_minor','customer_impact','legal_risk'],
  OperatingHealthAssessment: ['id','assessment_key','score','systems_health','acquisition_health','revenue_health','cash_health','operations_health','ai_health','risk_health','health_status','readiness_status','data_complete','blockers','methodology_version','calculated_at'],
};

function projectRow(entity: string, row: any) {
  const projected: Record<string, unknown> = {};
  for (const field of COMMAND_READ_SAFE_FIELDS[entity] || []) {
    if (row?.[field] !== undefined) projected[field] = row[field];
  }
  return projected;
}

export async function handleCommandReadState(svc: any, input: any) {
  const entity = text(input?.entity);
  if (!COMMAND_READ_SAFE_FIELDS[entity]) return { ok: false, error: `Entity '${entity}' not in read-allowed list.` };
  const filter = input && typeof input.filter === 'object' && input.filter ? input.filter : {};
  const sort = typeof input?.sort === 'string' ? input.sort : '-created_date';
  const limit = Math.min(Math.max(Number(input?.limit || 25), 1), 100);
  try {
    const rows = Object.keys(filter).length > 0
      ? await svc.entities[entity].filter(filter, sort, limit)
      : await svc.entities[entity].list(sort, limit);
    if (!Array.isArray(rows)) return { ok: false, error: 'read_result_unavailable' };
    return { ok: true, entity, count: rows.length, rows: rows.map((row: any) => projectRow(entity, row)) };
  } catch (error) {
    return { ok: false, error: String((error as Error)?.message || 'read_failed').slice(0, 200) };
  }
}
