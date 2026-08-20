import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import { requireAdminOrInternal } from '../../shared/internalGate.ts';
import { handleAutonomousCompanyOrchestrator } from '../../shared/logical/autonomousCompanyOrchestrator.ts';
import { guardedScheduledServe } from '../../shared/schedulerRun.ts';
import {
  observeSupervisorCollection,
  observeSupervisorRecord,
  publicSupervisorDependency,
  summarizeSupervisorDependencies,
  supervisorAuthorityDependency,
  supervisorIncidentRecoveryDemonstrated,
  type SupervisorDependency,
} from '../../shared/supervisorObservation.ts';
import {
  commercialFollowUpResultIsComplete,
  commercialFollowUpResultIsPartial,
} from '../../shared/commercialFollowUpRecovery.ts';

export const AUTONOMOUS_OPERATIONS_SUPERVISOR_VERSION = 'autonomous-operations-supervisor-v2.1.0';
export const OPERATIONAL_PLANE_DECLARATION = Object.freeze({"function_name":"autonomousOperationsSupervisor","classification":"CANONICAL_GENERAL_SUPERVISOR","status":"ACTIVE","authoritative_for":["dependency truth","bounded recovery selection","AutonomyIncident escalation"]});

const PLATFORM = '_platform';
const AGENT = 'autonomous_operations_supervisor';
const DEPENDENCY_INCIDENT_DOMAIN = 'supervisor_dependency';

function stableErrorCode(error: unknown) {
  const name = String((error as { name?: unknown })?.name || 'Error')
    .replace(/[^a-zA-Z0-9_-]/g, '')
    .slice(0, 80);
  return name ? `SUPERVISOR_FAILED_${name.toUpperCase()}` : 'SUPERVISOR_FAILED';
}

function dependencyDedupeKey(dependency: string) {
  return `supervisor_dependency:${dependency}`.slice(0, 500);
}

async function upsertIncident(svc: any, input: any, knownOpenRows?: any[]) {
  const rows = Array.isArray(knownOpenRows)
    ? knownOpenRows.filter((row: any) => row.dedupe_key === input.dedupe_key && row.status === 'open')
    : await svc.entities.AutonomyIncident.filter(
      { dedupe_key: input.dedupe_key, status: 'open' },
      '-last_seen_at',
      2,
    );
  if (!Array.isArray(rows)) throw new Error('autonomy_incident_read_ambiguous');
  if (rows.length > 1) throw new Error('duplicate_open_autonomy_incident');
  const now = new Date().toISOString();
  const row = {
    domain: input.domain,
    severity: input.severity || 'warning',
    status: 'open',
    workflow_state: input.workflow_state || 'investigating',
    owner_type: input.owner_type || 'operations',
    automation_eligibility: input.automation_eligibility || 'human_required',
    subject_type: input.subject_type || '',
    subject_id: input.subject_id || '',
    summary: String(input.summary || 'Operational issue').slice(0, 500),
    details_json: input.details_json || {},
    customer_impact: input.customer_impact || 'none',
    legal_risk: input.legal_risk || 'none',
    first_seen_at: rows[0]?.first_seen_at || now,
    last_seen_at: now,
  };
  if (rows[0]) {
    await svc.entities.AutonomyIncident.update(rows[0].id, row);
    return { ...rows[0], ...row };
  }
  return svc.entities.AutonomyIncident.create({
    dedupe_key: input.dedupe_key,
    ...row,
  });
}

function dependencyPayload(dependencies: SupervisorDependency[]) {
  const availability = { COMPLETE: 0, UNAVAILABLE: 0, AMBIGUOUS: 0 };
  const observation = { OBSERVED: 0, EMPTY: 0, UNKNOWN: 0, ERROR: 0 };
  for (const item of dependencies) {
    availability[item.availability] += 1;
    observation[item.observation_state] += 1;
  }
  const important = dependencies.filter((item, index) => index < 20 || item.availability !== 'COMPLETE');
  return {
    version: AUTONOMOUS_OPERATIONS_SUPERVISOR_VERSION,
    total: dependencies.length,
    availability,
    observation,
    states: important.slice(0, 300).map(publicSupervisorDependency),
    states_truncated: important.length > 300,
  };
}

async function markDependencyIncidents(
  svc: any,
  blocked: SupervisorDependency[],
  openDependencyIncidents: SupervisorDependency<any>,
) {
  if (openDependencyIncidents.availability !== 'COMPLETE') {
    return {
      status: 'UNAVAILABLE' as const,
      incident_ids: [] as string[],
      reason: 'AUTONOMY_INCIDENT_DEDUPE_READ_UNAVAILABLE',
    };
  }
  const incidentIds: string[] = [];
  for (const dependency of blocked) {
    const incident = await upsertIncident(svc, {
      dedupe_key: dependencyDedupeKey(dependency.dependency),
      domain: DEPENDENCY_INCIDENT_DOMAIN,
      severity: 'critical',
      workflow_state: 'human_review',
      owner_type: 'engineering',
      automation_eligibility: 'human_required',
      subject_type: 'SupervisorDependency',
      subject_id: dependency.dependency,
      summary: `Supervisor dependency is ${dependency.availability}: ${dependency.dependency}`,
      details_json: {
        supervisor_version: AUTONOMOUS_OPERATIONS_SUPERVISOR_VERSION,
        dependency: dependency.dependency,
        availability: dependency.availability,
        observation_state: dependency.observation_state,
        error_code: dependency.error_code,
        reason: dependency.reason,
        automated_recovery_blocked: true,
      },
    }, openDependencyIncidents.rows);
    if (incident?.id) incidentIds.push(incident.id);
  }
  return {
    status: 'SURFACED' as const,
    incident_ids: incidentIds,
    reason: null,
  };
}

async function resolveRecoveredDependencyIncidents(
  svc: any,
  openDependencyIncidents: SupervisorDependency<any>,
  dependencies: SupervisorDependency<any>[],
) {
  if (openDependencyIncidents.availability !== 'COMPLETE') return 0;
  const now = new Date().toISOString();
  let resolved = 0;
  for (const incident of openDependencyIncidents.rows) {
    if (incident.status !== 'open') continue;
    // Absence from this sweep is not proof of recovery. In particular, an
    // authority incident may only close after that exact authority dependency
    // was re-probed and observed COMPLETE in the current sweep.
    if (!supervisorIncidentRecoveryDemonstrated(incident, dependencies)) continue;
    await svc.entities.AutonomyIncident.update(incident.id, {
      status: 'resolved',
      workflow_state: 'resolved',
      resolved_at: now,
      recovery_json: {
        source: AGENT,
        supervisor_version: AUTONOMOUS_OPERATIONS_SUPERVISOR_VERSION,
        authoritative_read_recovered: true,
      },
    });
    resolved += 1;
  }
  return resolved;
}

guardedScheduledServe(
  {
    worker_key: 'autonomousOperationsSupervisor',
    cadence_seconds: 900,
    routes: {
      autonomous_company_orchestrator: {
        worker_key: 'autonomousCompanyOrchestrator',
        cadence_seconds: 21600,
      },
    },
  },
  createClientFromRequest,
  async (req) => {
    const routed = await req.clone().json().catch(() => ({}));
    if (routed.host_action === 'autonomous_company_orchestrator') {
      return handleAutonomousCompanyOrchestrator(req);
    }

    let svc: any = null;
    let task: any = null;
    try {
      const base44 = createClientFromRequest(req);
      const body = await req.json().catch(() => ({}));
      const gate = await requireAdminOrInternal(req, base44, body);
      if (!gate.ok) return gate.response as Response;
      svc = base44.asServiceRole;
      const now = new Date();
      const nowIso = now.toISOString();
      task = await svc.entities.AgentTask.create({
        brand_id: PLATFORM,
        agent_name: AGENT,
        task_type: 'autonomy_sweep',
        status: 'running',
        requires_approval: false,
        risk_level: 2,
        input_summary: 'Cross-loop health observation and fail-closed bounded recovery selection',
        started_at: nowIso,
      });

      const dependencies: SupervisorDependency<any>[] = await Promise.all([
        observeSupervisorCollection(
          'AgentTask.stale_running',
          () =>
            svc.entities.AgentTask.filter(
              {
                status: 'running',
                started_at: {
                  $lte: new Date(now.getTime() - 60 * 60 * 1000).toISOString(),
                },
              },
              '-started_at',
              100,
            ),
          { limit: 100 },
        ),
        observeSupervisorCollection(
          'CommunicationThread.due_followups',
          () =>
            svc.entities.CommunicationThread.filter(
              {
                automation_paused: false,
                next_action_at: { $lte: nowIso },
                status: { $in: ['awaiting_counterparty', 'awaiting_cambra'] },
              },
              'next_action_at',
              100,
            ),
          { limit: 100 },
        ),
        observeSupervisorCollection(
          'NegotiationCase.awaiting_provider',
          () =>
            svc.entities.NegotiationCase.filter(
              { status: 'awaiting_provider', next_action_at: { $lte: nowIso } },
              'next_action_at',
              100,
            ),
          { limit: 100 },
        ),
        observeSupervisorCollection(
          'MigrationTask.blocked',
          () =>
            svc.entities.MigrationTask.filter(
              { status: 'blocked' },
              '-updated_at',
              100,
            ),
          { limit: 100 },
        ),
        observeSupervisorCollection(
          'ProviderPricingVersion.stale_verified',
          () =>
            svc.entities.ProviderPricingVersion.filter(
              {
                truth_level: 'verified_official',
                knowledge_state: 'active',
                observed_at: {
                  $lte: new Date(now.getTime() - 90 * 86400000).toISOString(),
                },
              },
              'observed_at',
              100,
            ),
          { limit: 100 },
        ),
        observeSupervisorCollection(
          'KnowledgeConflict.active_operation',
          () =>
            svc.entities.KnowledgeConflict.filter(
              {
                status: { $in: ['open', 'investigating'] },
                affects_active_operation: true,
              },
              '-created_at',
              100,
            ),
          { limit: 100 },
        ),
        observeSupervisorCollection(
          'PaymentRoutingObservation.production',
          () =>
            svc.entities.PaymentRoutingObservation.filter(
              { is_demo: false },
              '-created_date',
              200,
            ),
          { limit: 200 },
        ),
        observeSupervisorCollection(
          'RoutingProviderPerformance.stale',
          () =>
            svc.entities.RoutingProviderPerformance.filter(
              {
                window_to: {
                  $lte: new Date(now.getTime() - 90 * 86400000).toISOString(),
                },
              },
              'window_to',
              100,
            ),
          { limit: 100 },
        ),
        observeSupervisorCollection(
          'AggregatePool.stale_active',
          () =>
            svc.entities.AggregatePool.filter(
              {
                status: {
                  $in: [
                    'negotiation_ready',
                    'rfp_open',
                    'negotiating',
                    'tier_upgrade_pending',
                    'renegotiating',
                  ],
                },
                updated_at: {
                  $lte: new Date(now.getTime() - 7 * 86400000).toISOString(),
                },
              },
              'updated_at',
              100,
            ),
          { limit: 100 },
        ),
        observeSupervisorCollection(
          'AggregateRFP.stale_active',
          () =>
            svc.entities.AggregateRFP.filter(
              {
                status: {
                  $in: ['open', 'negotiating', 'final_offer', 'contracting'],
                },
                updated_at: {
                  $lte: new Date(now.getTime() - 7 * 86400000).toISOString(),
                },
              },
              'updated_at',
              100,
            ),
          { limit: 100 },
        ),
        observeSupervisorCollection(
          'AgreementTier.pending_confirmation',
          () =>
            svc.entities.AgreementTier.filter(
              { qualification_status: 'pending_confirmation' },
              '-updated_at',
              100,
            ),
          { limit: 100 },
        ),
        observeSupervisorCollection(
          'DealActivation.live',
          () =>
            svc.entities.DealActivation.filter(
              { status: { $in: ['live', 'monetizing'] } },
              '-last_updated',
              500,
            ),
          { limit: 500 },
        ),
        observeSupervisorCollection(
          'AutonomyIncident.supervisor_dependencies',
          () =>
            svc.entities.AutonomyIncident.filter(
              { domain: DEPENDENCY_INCIDENT_DOMAIN, status: 'open' },
              '-last_seen_at',
              100,
            ),
          { limit: 100 },
        ),
      ]);

      const byName = new Map(
        dependencies.map((item) => [item.dependency, item]),
      );
      const rows = (name: string): any[] => byName.get(name)?.rows || [];
      const initialSummary = summarizeSupervisorDependencies(dependencies);
      const openDependencyIncidents = byName.get(
        'AutonomyIncident.supervisor_dependencies',
      ) as SupervisorDependency<any>;

      if (initialSummary.automated_action_allowed) {
        for (
          const negotiationCase of rows('NegotiationCase.awaiting_provider')
        ) {
          if (!negotiationCase.thread_id) continue;
          dependencies.push(
            await observeSupervisorRecord(
              `CommunicationThread.negotiation_case:${negotiationCase.id}`,
              () => svc.entities.CommunicationThread.get(negotiationCase.thread_id),
            ),
          );
        }
        for (
          const observation of rows('PaymentRoutingObservation.production')
        ) {
          dependencies.push(
            await observeSupervisorCollection(
              `ShadowRoutingDecision.observation:${observation.id}`,
              () =>
                svc.entities.ShadowRoutingDecision.filter(
                  { routing_observation_id: observation.id },
                  '-evaluated_at',
                  1,
                ),
              { limit: 1, mode: 'EXISTENCE' },
            ),
          );
        }
        for (const activation of rows('DealActivation.live')) {
          dependencies.push(
            await observeSupervisorCollection(
              `MonthlySavingsReport.activation:${activation.id}`,
              () =>
                svc.entities.MonthlySavingsReport.filter(
                  { deal_activation_id: activation.id },
                  '-month',
                  1,
                ),
              { limit: 1, mode: 'EXISTENCE' },
            ),
          );
        }
        if (rows('CommunicationThread.due_followups').length > 0) {
          dependencies.push(supervisorAuthorityDependency(
            'InternalCallAuthority.commercialFollowUpWorker',
            Boolean(Deno.env.get('INTERNAL_CALL_SECRET')),
          ));
        }
      }

      const dependencySummary = summarizeSupervisorDependencies(dependencies);
      if (!dependencySummary.automated_action_allowed) {
        const blocked = dependencies.filter((item) => item.availability !== 'COMPLETE');
        const incidentSurface = await markDependencyIncidents(
          svc,
          blocked,
          openDependencyIncidents,
        );
        const output = {
          health_status: 'DEGRADED',
          readiness_status: 'UNKNOWN',
          automated_recovery_allowed: false,
          actions: [],
          blocked_dependencies: dependencySummary.blocked_dependencies,
          dependencies: dependencyPayload(dependencies),
          incident_surface: incidentSurface,
        };
        await svc.entities.AgentTask.update(task.id, {
          status: 'failed',
          output_summary:
            `Supervisor DEGRADED: ${blocked.length} critical dependency state(s); automated recovery blocked`,
          output_payload_json: output,
          error: 'supervisor_dependency_unknown',
          completed_at: new Date().toISOString(),
        });
        return Response.json({ ok: false, task_id: task.id, ...output }, {
          status: 503,
        });
      }

      const actions: any[] = [];
      let partialCommercialRecovery = false;
      const staleRunning = rows('AgentTask.stale_running');
      const dueThreads = rows('CommunicationThread.due_followups');
      const dueCases = rows('NegotiationCase.awaiting_provider');
      const blockedMigrations = rows('MigrationTask.blocked');
      const stalePricing = rows('ProviderPricingVersion.stale_verified');
      const criticalConflicts = rows('KnowledgeConflict.active_operation');
      const routingBacklog = rows('PaymentRoutingObservation.production');
      const staleRouting = rows('RoutingProviderPerformance.stale');
      const stalePools = rows('AggregatePool.stale_active');
      const staleRfps = rows('AggregateRFP.stale_active');
      const tierPending = rows('AgreementTier.pending_confirmation');
      const live = rows('DealActivation.live');

      // Materialize observed concerns before selecting any recovery. If the
      // incident ledger is unavailable, the sweep fails before an effect.
      for (const item of staleRunning) {
        await upsertIncident(svc, {
          dedupe_key: `stale_task:${item.id}`,
          domain: 'worker',
          severity: 'warning',
          subject_type: 'AgentTask',
          subject_id: item.id,
          summary: `AgentTask ${item.agent_name || item.id} has been running for >60 minutes`,
          details_json: {
            agent_name: item.agent_name,
            task_type: item.task_type,
          },
        });
      }
      for (const item of blockedMigrations) {
        const at = Date.parse(
          item.updated_at || item.updated_date || item.created_date || '',
        );
        if (Number.isFinite(at) && now.getTime() - at > 24 * 3600000) {
          await upsertIncident(svc, {
            dedupe_key: `migration_blocked:${item.id}`,
            domain: 'migration',
            severity: 'warning',
            subject_type: 'MigrationTask',
            subject_id: item.id,
            summary: `Migration task blocked for >24h: ${item.step_name}`,
            details_json: {
              brand_id: item.brand_id,
              deal_activation_id: item.deal_activation_id,
              reason: item.blocked_reason,
            },
          });
        }
      }
      for (const item of stalePricing) {
        await upsertIncident(svc, {
          dedupe_key: `intelligence_stale:${item.id}`,
          domain: 'intelligence',
          severity: 'warning',
          subject_type: 'ProviderPricingVersion',
          subject_id: item.id,
          summary: `Verified provider pricing stale >90d: ${item.provider_slug}`,
          details_json: {
            country: item.country,
            channel: item.channel,
            observed_at: item.observed_at,
          },
        });
      }
      for (const item of criticalConflicts) {
        await upsertIncident(svc, {
          dedupe_key: `intelligence_conflict:${item.id}`,
          domain: 'intelligence',
          severity: item.severity === 'critical' ? 'critical' : 'warning',
          subject_type: 'KnowledgeConflict',
          subject_id: item.id,
          summary: `Intelligence conflict affects active operation: ${item.semantic_key}`,
          details_json: {
            provider_slug: item.provider_slug,
            country: item.country,
            reason: item.reason,
          },
        });
      }
      let unevaluated = 0;
      for (const item of routingBacklog) {
        const decision = dependencies.find((dependency) =>
          dependency.dependency ===
            `ShadowRoutingDecision.observation:${item.id}`
        );
        if (decision?.observation_state === 'OBSERVED') continue;
        const at = Date.parse(
          item.occurred_at || item.window_to || item.created_date || '',
        );
        if (Number.isFinite(at) && now.getTime() - at > 24 * 3600000) {
          unevaluated += 1;
          await upsertIncident(svc, {
            dedupe_key: `routing_unevaluated:${item.id}`,
            domain: 'routing_intelligence',
            severity: 'warning',
            subject_type: 'PaymentRoutingObservation',
            subject_id: item.id,
            summary: 'Routing observation has no shadow decision after >24h',
            details_json: {
              brand_id: item.brand_id,
              provider_slug: item.provider_slug,
              granularity: item.granularity,
            },
          });
        }
      }
      for (const item of staleRouting) {
        await upsertIncident(svc, {
          dedupe_key: `routing_stale:${item.id}`,
          domain: 'routing_intelligence',
          severity: 'warning',
          subject_type: 'RoutingProviderPerformance',
          subject_id: item.id,
          summary: `Routing performance stale >90d: ${item.provider_slug}`,
          details_json: {
            country: item.country,
            network: item.network,
            sample_size: item.sample_size,
            window_to: item.window_to,
          },
        });
      }
      for (const item of stalePools) {
        await upsertIncident(svc, {
          dedupe_key: `aggregate_stale_pool:${item.id}`,
          domain: 'aggregate',
          severity: 'warning',
          subject_type: 'AggregatePool',
          subject_id: item.id,
          summary: `Aggregate pool stale >7d in active state: ${item.pool_key}`,
          details_json: {
            status: item.status,
            aps: item.aggregation_power_score,
            addressable: item.addressable_annual_volume_minor,
            committed: item.committed_annual_volume_minor,
          },
        });
      }
      for (const item of staleRfps) {
        await upsertIncident(svc, {
          dedupe_key: `aggregate_stale_rfp:${item.id}`,
          domain: 'aggregate',
          severity: 'warning',
          subject_type: 'AggregateRFP',
          subject_id: item.id,
          summary: 'Aggregate RFP has no progress for >7d',
          details_json: {
            pool_id: item.pool_id,
            status: item.status,
            provider_count: (item.provider_ids || []).length,
          },
        });
      }
      for (const item of tierPending) {
        const at = Date.parse(item.updated_at || item.created_date || '');
        if (Number.isFinite(at) && now.getTime() - at > 5 * 86400000) {
          await upsertIncident(svc, {
            dedupe_key: `aggregate_tier_confirmation:${item.id}`,
            domain: 'aggregate',
            severity: 'warning',
            subject_type: 'AgreementTier',
            subject_id: item.id,
            summary: 'Qualified aggregate tier awaiting provider confirmation >5d',
            details_json: {
              agreement_id: item.agreement_id,
              tier_number: item.tier_number,
              metric: item.metric,
              threshold: item.threshold_value,
            },
          });
        }
      }
      for (const activation of live) {
        const report = dependencies.find((dependency) =>
          dependency.dependency ===
            `MonthlySavingsReport.activation:${activation.id}`
        );
        if (report?.observation_state === 'EMPTY') {
          await upsertIncident(svc, {
            dedupe_key: `verification_missing:${activation.id}`,
            domain: 'verification',
            severity: 'warning',
            subject_type: 'DealActivation',
            subject_id: activation.id,
            summary: 'Live Recover has no MonthlySavingsReport yet',
            details_json: {
              brand_id: activation.brand_id,
              status: activation.status,
            },
          });
        }
      }

      const threadsByCase = new Map<string, any>();
      for (const negotiationCase of dueCases) {
        if (!negotiationCase.thread_id) {
          await upsertIncident(svc, {
            dedupe_key: `negotiation_thread_missing:${negotiationCase.id}`,
            domain: 'negotiation',
            severity: 'warning',
            workflow_state: 'human_review',
            subject_type: 'NegotiationCase',
            subject_id: negotiationCase.id,
            summary: 'Negotiation case has no communication thread reference',
            details_json: {
              provider_id: negotiationCase.provider_id,
              brand_id: negotiationCase.brand_id,
            },
          });
          continue;
        }
        const dependency = dependencies.find((item) =>
          item.dependency ===
            `CommunicationThread.negotiation_case:${negotiationCase.id}`
        );
        const thread = dependency?.rows[0] || null;
        if (!thread) {
          await upsertIncident(svc, {
            dedupe_key: `negotiation_thread_unresolved:${negotiationCase.id}`,
            domain: 'negotiation',
            severity: 'warning',
            workflow_state: 'human_review',
            subject_type: 'NegotiationCase',
            subject_id: negotiationCase.id,
            summary: 'Negotiation case references a missing communication thread',
            details_json: { thread_id: negotiationCase.thread_id },
          });
          continue;
        }
        threadsByCase.set(negotiationCase.id, thread);
        if (thread.automation_paused === true && !thread.next_action_at) {
          await upsertIncident(svc, {
            dedupe_key: `negotiation_thread_paused:${negotiationCase.id}`,
            domain: 'negotiation',
            severity: 'warning',
            workflow_state: 'human_review',
            subject_type: 'CommunicationThread',
            subject_id: thread.id,
            summary: 'Negotiation thread is paused and cannot be resumed by the supervisor',
            details_json: {
              negotiation_case_id: negotiationCase.id,
              pause_reason: thread.pause_reason || null,
            },
          });
        }
      }

      const resolvedDependencyIncidents = await resolveRecoveredDependencyIncidents(
        svc,
        openDependencyIncidents,
        dependencies,
      );

      // Bounded local repair: never clear a pause and never invent authority.
      let negotiationRepairs = 0;
      for (const negotiationCase of dueCases) {
        const thread = threadsByCase.get(negotiationCase.id);
        if (
          !thread || thread.automation_paused === true || thread.next_action_at
        ) continue;
        await svc.entities.CommunicationThread.update(thread.id, {
          status: 'awaiting_counterparty',
          next_action_at: negotiationCase.next_action_at,
        });
        negotiationRepairs += 1;
      }
      if (negotiationRepairs) {
        actions.push({
          action: 'negotiation_thread_repair',
          count: negotiationRepairs,
          status: 'COMPLETED',
        });
      }

      if (dueThreads.length) {
        const internalSecret = String(
          Deno.env.get('INTERNAL_CALL_SECRET') || '',
        );
        let invoked: any;
        try {
          invoked = await svc.functions.invoke('commercialFollowUpWorker', {
            internal_secret: internalSecret,
          });
        } catch (error) {
          await upsertIncident(svc, {
            dedupe_key: 'supervisor_recovery:commercial_followups',
            domain: 'worker',
            severity: 'critical',
            workflow_state: 'human_review',
            owner_type: 'engineering',
            subject_type: 'Worker',
            subject_id: 'commercialFollowUpWorker',
            summary: 'Commercial follow-up recovery invocation failed',
            details_json: {
              error_code: stableErrorCode(error),
              due_threads: dueThreads.length,
            },
          });
          throw new Error('commercial_followup_recovery_failed');
        }
        const result = invoked?.data || invoked;
        const recoveryComplete = commercialFollowUpResultIsComplete(result);
        const recoveryPartial = commercialFollowUpResultIsPartial(result);
        if (!recoveryComplete && !recoveryPartial) {
          await upsertIncident(svc, {
            dedupe_key: 'supervisor_recovery:commercial_followups',
            domain: 'worker',
            severity: 'critical',
            workflow_state: 'human_review',
            owner_type: 'engineering',
            subject_type: 'Worker',
            subject_id: 'commercialFollowUpWorker',
            summary: 'Commercial follow-up recovery returned a non-success result',
            details_json: {
              error_code: String(result?.error || 'WORKER_RECOVERY_INCOMPLETE')
                .slice(0, 180),
              due_threads: dueThreads.length,
              worker_data_complete: result?.data_complete === true,
              worker_recovery_status: String(
                result?.recovery_status || 'UNKNOWN',
              ).slice(0, 80),
              worker_failed: Number(result?.failed || 0),
            },
          });
          throw new Error('commercial_followup_recovery_non_success');
        }
        partialCommercialRecovery = recoveryPartial;
        actions.push({
          action: 'commercial_followups',
          due: dueThreads.length,
          status: recoveryComplete ? 'COMPLETED' : 'PARTIAL',
          pending: Number(result?.pending || 0),
        });
      }

      if (stalePricing.length) {
        actions.push({
          action: 'intelligence_stale_detected',
          count: stalePricing.length,
          status: 'OBSERVED',
        });
      }
      if (criticalConflicts.length) {
        actions.push({
          action: 'intelligence_conflicts_escalated',
          count: criticalConflicts.length,
          status: 'OBSERVED',
        });
      }
      if (unevaluated) {
        actions.push({
          action: 'routing_backlog_detected',
          count: unevaluated,
          status: 'OBSERVED',
        });
      }
      if (staleRouting.length) {
        actions.push({
          action: 'routing_stale_detected',
          count: staleRouting.length,
          status: 'OBSERVED',
        });
      }
      if (stalePools.length) {
        actions.push({
          action: 'aggregate_stale_pools_detected',
          count: stalePools.length,
          status: 'OBSERVED',
        });
      }
      if (staleRfps.length) {
        actions.push({
          action: 'aggregate_stale_rfps_detected',
          count: staleRfps.length,
          status: 'OBSERVED',
        });
      }

      const attentionCount = staleRunning.length + blockedMigrations.length +
        stalePricing.length +
        criticalConflicts.length + unevaluated + staleRouting.length +
        stalePools.length +
        staleRfps.length + tierPending.length +
        (partialCommercialRecovery ? 1 : 0);
      const output = {
        health_status: attentionCount ? 'ATTENTION_REQUIRED' : 'HEALTHY',
        readiness_status: partialCommercialRecovery ? 'PARTIAL' : 'COMPLETE',
        automated_recovery_allowed: true,
        deferred_recovery_pending: partialCommercialRecovery,
        dependencies: dependencyPayload(dependencies),
        actions,
        stale_tasks: staleRunning.length,
        blocked_migrations: blockedMigrations.length,
        stale_intelligence: stalePricing.length,
        active_intelligence_conflicts: criticalConflicts.length,
        routing_unevaluated: unevaluated,
        stale_routing: staleRouting.length,
        stale_aggregate_pools: stalePools.length,
        stale_aggregate_rfps: staleRfps.length,
        pending_tier_confirmations: tierPending.length,
        live_recoveries: live.length,
        resolved_dependency_incidents: resolvedDependencyIncidents,
      };
      const completedAt = new Date().toISOString();
      await svc.entities.AgentTask.update(task.id, {
        status: 'completed',
        heartbeat_at: completedAt,
        output_summary:
          `Supervisor ${output.health_status}: ${actions.length} bounded/observed action(s), ${attentionCount} attention signal(s)`,
        output_payload_json: output,
        completed_at: completedAt,
      });
      return Response.json({
        ok: true,
        task_id: task.id,
        ...output,
      });
    } catch (error) {
      const errorCode = stableErrorCode(error);
      console.error(JSON.stringify({
        level: 'error',
        event: 'autonomous_operations_supervisor_failed',
        error_code: errorCode,
        message: String(
          (error as { message?: unknown })?.message || error || 'unknown',
        ).slice(0, 500),
      }));
      if (svc && task?.id) {
        try {
          await svc.entities.AgentTask.update(task.id, {
            status: 'failed',
            error: errorCode,
            output_summary: 'Supervisor failed closed; no healthy result was emitted',
            completed_at: new Date().toISOString(),
          });
        } catch (taskError) {
          console.error(JSON.stringify({
            level: 'error',
            event: 'autonomous_operations_supervisor_failure_persistence_failed',
            error_code: stableErrorCode(taskError),
          }));
        }
      }
      return Response.json({
        ok: false,
        error: 'autonomy_supervisor_failed',
        error_code: errorCode,
        health_status: 'DEGRADED',
        readiness_status: 'UNKNOWN',
        automated_recovery_allowed: false,
      }, { status: 500 });
    }
  },
);
