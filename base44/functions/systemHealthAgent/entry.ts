import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';

/**
 * System Health Agent — meta-watcher for the entire agent fleet.
 *
 * READ-ONLY. NEVER kills tasks, NEVER applies fixes, NEVER re-runs schedules.
 * It only DETECTS and REPORTS. The founder (or future reapers) decides.
 *
 * Vigila 9 dimensiones:
 *   1. Agentes fallando (last N runs)
 *   2. AgentTasks colgados (running > 1h)
 *   3. Schedules que debieron correr
 *   4. Loop del Brain (B1→B2→B3 sin huecos)
 *   5. Events sin consumir (pending > 1h)
 *   6. AgentQuestions/Approvals estancados (pending > 24h)
 *   7. Estado de las keys (informativo)
 *   8. REGISTRY sync entre oauthConnector y dataSyncAgent
 *   9. Salud de Integrations (errored / stale-sync / expired tokens)
 *
 * Severities per dimension: 🟢 ok · 🟡 attention · 🔴 problem.
 * Overall = highest individual.
 *
 * Emits Event `system.health.checked` → Founder Copilot picks it up.
 */

const AGENT_NAME = "system_health";
const TASK_TYPE = "system_health_report";
const RISK_LEVEL = 1;
const PLATFORM_TENANT = "_platform";

// Agents we expect to see running (must match agentRegistry names_in_db)
const KNOWN_AGENTS = [
  "founder_copilot","investor_update","qa",
  "lead_discovery","lead_enrichment","lead_scoring","crm",
  "outreach","follow_up","meeting",
  "blog","newsletter","linkedin","x_twitter","seo",
  "competitor_monitor","provider_research","provider_monitor",
  "gdpr","compliance","legal_review","contract_ip",
  "code_review","security","qa_monitor","engineering_report","fix_validator",
  "discovery_tech_stack","spend_intelligence","recommendation_engine","brain_orchestrator",
];

// Schedules we expect (informational — we only check "did it run recently")
const EXPECTED_SCHEDULES = [
  { agent_name: "engineering_report", max_age_hours: 24, label: "Engineering report (2x/day)" },
  { agent_name: "provider_monitor",   max_age_hours: 24 * 8, label: "Provider monitor (weekly)" },
  { agent_name: "competitor_monitor", max_age_hours: 24 * 8, label: "Competitor monitor (weekly)" },
];

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

// Thresholds for the Integrations health dimension. Explicit so it's obvious
// what we'd tweak if signals are too noisy / not noisy enough.
const INTEGRATION_STALE_SYNC_DAYS = 7;     // connected but no sync for this many days → yellow
const INTEGRATION_EXPIRED_GRACE_MIN = 5;   // OAuth token already expired more than this → yellow

function pickSeverity(...sevs) {
  if (sevs.includes("red")) return "red";
  if (sevs.includes("yellow")) return "yellow";
  return "green";
}

Deno.serve(async (req) => {
  let task = null;
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    if (user.role !== "admin") return Response.json({ ok: false, error: "Forbidden" }, { status: 403 });

    const now = Date.now();
    const nowIso = new Date(now).toISOString();

    task = await base44.asServiceRole.entities.AgentTask.create({
      brand_id: PLATFORM_TENANT,
      agent_name: AGENT_NAME,
      task_type: TASK_TYPE,
      status: "running",
      requires_approval: false,
      risk_level: RISK_LEVEL,
      input_summary: "System health sweep across the entire agent fleet",
      started_at: nowIso,
    });

    // ── Snapshot inputs (read-only) ─────────────────────────────────────
    // Cap pulls to recent windows; we don't need full history for a health check.
    const [recentTasks, runningTasks, pendingEvents, pendingApprovals, pendingQuestions, allIntegrations] = await Promise.all([
      base44.asServiceRole.entities.AgentTask.list("-created_date", 500).catch(() => []),
      base44.asServiceRole.entities.AgentTask.filter({ status: "running" }, "-created_date", 200).catch(() => []),
      base44.asServiceRole.entities.Event.filter({ status: "pending" }, "-created_date", 200).catch(() => []),
      base44.asServiceRole.entities.Approval.filter({ status: "pending" }, "-created_date", 200).catch(() => []),
      base44.asServiceRole.entities.AgentQuestion.filter({ status: "pending" }, "-created_date", 200).catch(() => []),
      // Platform-wide read — same admin pattern as the other dimensions.
      base44.asServiceRole.entities.Integration.list("-created_date", 500).catch(() => []),
    ]);

    // ── 1. Failing agents (last 5 runs per agent) ───────────────────────
    const failingAgents = [];
    for (const an of KNOWN_AGENTS) {
      const last5 = recentTasks.filter(t => t.agent_name === an).slice(0, 5);
      if (last5.length === 0) continue;
      const allFailed = last5.every(t => t.status === "failed");
      const failRate = last5.filter(t => t.status === "failed").length / last5.length;
      if (allFailed && last5.length >= 3) {
        failingAgents.push({
          agent_name: an, severity: "red", reason: `Last ${last5.length} runs all failed`,
          last_error: last5[0]?.error || null, last_task_id: last5[0]?.id,
        });
      } else if (failRate >= 0.6 && last5.length >= 3) {
        failingAgents.push({
          agent_name: an, severity: "yellow", reason: `${Math.round(failRate * 100)}% of last ${last5.length} runs failed`,
          last_error: last5[0]?.error || null, last_task_id: last5[0]?.id,
        });
      }
    }
    const sevFailing = failingAgents.some(f => f.severity === "red") ? "red"
      : failingAgents.length > 0 ? "yellow" : "green";

    // ── 2. Stalled AgentTasks (running > 1h) ────────────────────────────
    const stalledTasks = [];
    for (const t of runningTasks) {
      const startedAt = new Date(t.started_at || t.created_date).getTime();
      const ageHours = (now - startedAt) / HOUR;
      if (ageHours > 1) {
        stalledTasks.push({
          task_id: t.id, agent_name: t.agent_name, task_type: t.task_type,
          age_hours: Math.round(ageHours * 10) / 10, started_at: t.started_at || t.created_date,
          brand_id: t.brand_id, input_summary: t.input_summary || null,
        });
      }
    }
    stalledTasks.sort((a, b) => b.age_hours - a.age_hours);
    const sevStalled = stalledTasks.some(t => t.age_hours > 6) ? "red"
      : stalledTasks.length > 0 ? "yellow" : "green";

    // ── 3. Missed schedules ─────────────────────────────────────────────
    const missedSchedules = [];
    for (const sch of EXPECTED_SCHEDULES) {
      const last = recentTasks.find(t => t.agent_name === sch.agent_name && t.status === "completed");
      if (!last) {
        missedSchedules.push({ ...sch, severity: "yellow", reason: "No completed run found in recent history" });
        continue;
      }
      const lastAt = new Date(last.completed_at || last.created_date).getTime();
      const ageHours = (now - lastAt) / HOUR;
      if (ageHours > sch.max_age_hours) {
        missedSchedules.push({
          ...sch, severity: ageHours > sch.max_age_hours * 2 ? "red" : "yellow",
          last_run_at: last.completed_at || last.created_date,
          hours_since_last: Math.round(ageHours),
          reason: `Last ran ${Math.round(ageHours)}h ago, expected within ${sch.max_age_hours}h`,
        });
      }
    }
    const sevSchedules = missedSchedules.some(s => s.severity === "red") ? "red"
      : missedSchedules.length > 0 ? "yellow" : "green";

    // ── 4. Brain loop integrity ─────────────────────────────────────────
    // For each completed B1 in the last 24h, is there a B2? For each B2, a B3?
    const last24hStart = now - DAY;
    const recentBrain = recentTasks.filter(t =>
      ["discovery_tech_stack", "spend_intelligence", "recommendation_engine"].includes(t.agent_name) &&
      t.status === "completed" &&
      new Date(t.completed_at || t.created_date).getTime() >= last24hStart
    );
    const brainByBrand = {};
    for (const t of recentBrain) {
      const k = t.brand_id || "_unknown";
      (brainByBrand[k] = brainByBrand[k] || { discovery: [], spend: [], recommendation: [] });
      if (t.agent_name === "discovery_tech_stack") brainByBrand[k].discovery.push(t);
      else if (t.agent_name === "spend_intelligence") brainByBrand[k].spend.push(t);
      else if (t.agent_name === "recommendation_engine") brainByBrand[k].recommendation.push(t);
    }
    const brokenChains = [];
    for (const [brandId, parts] of Object.entries(brainByBrand)) {
      if (parts.discovery.length > 0 && parts.spend.length === 0) {
        brokenChains.push({ brand_id: brandId, broken_at: "spend", reason: "Discovery completed but no Spend follow-up in last 24h" });
      } else if (parts.spend.length > 0 && parts.recommendation.length === 0) {
        brokenChains.push({ brand_id: brandId, broken_at: "recommendation", reason: "Spend completed but no Recommendation follow-up in last 24h" });
      }
    }
    const sevBrain = brokenChains.length > 0 ? "yellow" : "green";

    // ── 5. Stuck pending events (> 1h) ──────────────────────────────────
    const stuckEvents = [];
    for (const e of pendingEvents) {
      const ageHours = (now - new Date(e.created_date).getTime()) / HOUR;
      if (ageHours > 1) {
        stuckEvents.push({
          event_id: e.id, event_type: e.event_type, source: e.source,
          age_hours: Math.round(ageHours * 10) / 10,
        });
      }
    }
    stuckEvents.sort((a, b) => b.age_hours - a.age_hours);
    // Group by event_type → potential orphans (no consumer)
    const stuckByType = {};
    for (const e of stuckEvents) {
      stuckByType[e.event_type] = (stuckByType[e.event_type] || 0) + 1;
    }
    const orphanEventTypes = Object.entries(stuckByType)
      .filter(([, c]) => c >= 3)
      .map(([t, c]) => ({ event_type: t, stuck_count: c }));
    const sevEvents = orphanEventTypes.length > 0 ? "yellow"
      : stuckEvents.length > 10 ? "yellow" : "green";

    // ── 6. Stale founder inputs (>24h) ──────────────────────────────────
    const staleApprovals = pendingApprovals
      .map(a => ({
        id: a.id, action_type: a.action_type, risk_level: a.risk_level,
        age_hours: (now - new Date(a.created_date).getTime()) / HOUR,
      }))
      .filter(a => a.age_hours > 24)
      .map(a => ({ ...a, age_hours: Math.round(a.age_hours) }));
    const staleQuestions = pendingQuestions
      .map(q => ({
        id: q.id, agent_name: q.agent_name, question_text: q.question_text,
        age_hours: (now - new Date(q.created_date).getTime()) / HOUR,
      }))
      .filter(q => q.age_hours > 24)
      .map(q => ({ ...q, age_hours: Math.round(q.age_hours) }));
    const sevFounderInputs = (staleApprovals.length + staleQuestions.length) > 0 ? "yellow" : "green";

    // ── 8. Integration REGISTRY sync (oauthConnector vs dataSyncAgent) ──
    // The REGISTRY object is duplicated across two Deno functions because they
    // can't import from each other. If they ever drift, integrations fail
    // silently. We delegate the comparison to verifyRegistrySync (read-only)
    // so the logic lives in one place.
    let registrySync = { severity: "green", in_sync: true, divergence_count: 0, divergences: [], error: null };
    try {
      const verifyRes = await base44.functions.invoke("verifyRegistrySync", {});
      const verifyBody = verifyRes?.data || verifyRes;
      if (verifyBody?.ok) {
        registrySync = {
          severity: verifyBody.in_sync ? "green" : "red",
          in_sync: !!verifyBody.in_sync,
          divergence_count: verifyBody.divergences?.length || 0,
          // Cap at 5 to avoid bloating the health report.
          divergences: (verifyBody.divergences || []).slice(0, 5),
          error: null,
        };
      } else {
        registrySync = {
          severity: "yellow",
          in_sync: false,
          divergence_count: 0,
          divergences: [],
          error: verifyBody?.error || "verifyRegistrySync returned no payload",
        };
      }
    } catch (err) {
      registrySync = {
        severity: "yellow",
        in_sync: false,
        divergence_count: 0,
        divergences: [],
        error: `verifyRegistrySync invocation failed: ${err.message}`,
      };
    }
    const sevRegistry = registrySync.severity;

    // ── 7. Key activation status (informational) ────────────────────────
    // Proxy: an agent depending on a secret is "live" if it has any completed
    // task in the last 7d. We just count — never alarm.
    const sevenDaysAgoIso = new Date(now - 7 * DAY).toISOString();
    const recentSuccessful = recentTasks.filter(t =>
      t.status === "completed" && (t.completed_at || t.created_date) >= sevenDaysAgoIso
    );
    const agentsWithRecentSuccess = new Set(recentSuccessful.map(t => t.agent_name));
    const agentsObservedAtAll = new Set(recentTasks.map(t => t.agent_name));
    const dormantAgents = KNOWN_AGENTS.filter(an => !agentsObservedAtAll.has(an));
    const sevKeys = "green"; // Informational only

    // ── 9. Integrations health ──────────────────────────────────────────
    // Three sub-signals over a single read of the Integration entity:
    //   - errored:        status === "error" (somebody needs to reconnect)
    //   - stale_sync:     status === "connected" but last_sync_at is missing
    //                     or older than INTEGRATION_STALE_SYNC_DAYS
    //   - expired_tokens: OAuth integrations whose access_token_expires_at is
    //                     already in the past (refresh job didn't run / failed).
    //                     API-key integrations are skipped — keys don't expire
    //                     like OAuth tokens do, and `access_token_expires_at`
    //                     is null for them anyway.
    //
    // Read-only: we never touch the row. Just report.
    const erroredIntegrations = [];
    const staleSyncIntegrations = [];
    const expiredTokenIntegrations = [];
    const staleSyncCutoff = now - INTEGRATION_STALE_SYNC_DAYS * DAY;
    const expiredCutoff = now - INTEGRATION_EXPIRED_GRACE_MIN * 60 * 1000;

    for (const integ of allIntegrations) {
      if (integ.status === "error") {
        erroredIntegrations.push({
          integration_id: integ.id,
          provider: integ.provider,
          brand_id: integ.brand_id,
          last_error: integ.last_error || null,
          last_sync_at: integ.last_sync_at || null,
        });
        continue; // don't double-count errored rows in other buckets
      }

      if (integ.status === "connected") {
        const lastSyncMs = integ.last_sync_at ? new Date(integ.last_sync_at).getTime() : null;
        if (lastSyncMs == null || lastSyncMs < staleSyncCutoff) {
          const ageDays = lastSyncMs == null
            ? null
            : Math.round((now - lastSyncMs) / DAY);
          staleSyncIntegrations.push({
            integration_id: integ.id,
            provider: integ.provider,
            brand_id: integ.brand_id,
            last_sync_at: integ.last_sync_at || null,
            age_days: ageDays,
            reason: lastSyncMs == null
              ? "Connected but never synced"
              : `Last sync ${ageDays}d ago (threshold ${INTEGRATION_STALE_SYNC_DAYS}d)`,
          });
        }

        const authMethod = integ.metadata_json?.auth_method || "oauth";
        if (authMethod === "oauth" && integ.access_token_expires_at) {
          const expMs = new Date(integ.access_token_expires_at).getTime();
          if (expMs < expiredCutoff) {
            expiredTokenIntegrations.push({
              integration_id: integ.id,
              provider: integ.provider,
              brand_id: integ.brand_id,
              expired_at: integ.access_token_expires_at,
              expired_minutes_ago: Math.round((now - expMs) / 60000),
            });
          }
        }
      }
    }

    const integHasError = erroredIntegrations.length > 0;
    const integHasYellow = staleSyncIntegrations.length > 0 || expiredTokenIntegrations.length > 0;
    const sevIntegrations = integHasError ? "red" : integHasYellow ? "yellow" : "green";

    // ── Overall severity ────────────────────────────────────────────────
    const overall = pickSeverity(sevFailing, sevStalled, sevSchedules, sevBrain, sevEvents, sevFounderInputs, sevRegistry, sevIntegrations);

    // Build proposal (the "reaper" suggestion — never auto-executes)
    const proposals = [];
    if (stalledTasks.length > 0) {
      proposals.push({
        action: "cleanup_stale_agent_tasks",
        description: `Mark ${stalledTasks.length} stalled task(s) as failed (running > 1h). The founder decides — this agent never auto-cleans.`,
        affected_task_ids: stalledTasks.map(t => t.task_id),
      });
    }
    if (missedSchedules.length > 0) {
      proposals.push({
        action: "review_schedules",
        description: `Check ${missedSchedules.length} schedule(s) — they should have run by now. Look in /admin/automations.`,
        affected_schedules: missedSchedules.map(s => s.agent_name),
      });
    }

    const report = {
      checked_at: nowIso,
      overall_severity: overall,
      dimensions: {
        failing_agents:   { severity: sevFailing, count: failingAgents.length, items: failingAgents },
        stalled_tasks:    { severity: sevStalled, count: stalledTasks.length, items: stalledTasks.slice(0, 20) },
        missed_schedules: { severity: sevSchedules, count: missedSchedules.length, items: missedSchedules },
        brain_loop:       { severity: sevBrain, count: brokenChains.length, items: brokenChains },
        stuck_events:     { severity: sevEvents, count: stuckEvents.length, orphan_types: orphanEventTypes, items: stuckEvents.slice(0, 10) },
        founder_inputs:   { severity: sevFounderInputs, stale_approvals: staleApprovals, stale_questions: staleQuestions },
        keys:             { severity: sevKeys, agents_active_last_7d: agentsWithRecentSuccess.size, agents_dormant: dormantAgents.length, dormant_list: dormantAgents },
        registry_sync:    { severity: sevRegistry, ...registrySync },
        integrations_health: {
          severity: sevIntegrations,
          total_integrations: allIntegrations.length,
          errored: { count: erroredIntegrations.length, items: erroredIntegrations.slice(0, 20) },
          stale_sync: {
            count: staleSyncIntegrations.length,
            threshold_days: INTEGRATION_STALE_SYNC_DAYS,
            items: staleSyncIntegrations.slice(0, 20),
          },
          expired_tokens: {
            count: expiredTokenIntegrations.length,
            grace_minutes: INTEGRATION_EXPIRED_GRACE_MIN,
            items: expiredTokenIntegrations.slice(0, 20),
          },
        },
      },
      proposals,
      next_step: "This report only DETECTS. Nothing was modified. Review proposals and decide.",
    };

    // ── Emit Event so Founder Copilot can surface it ────────────────────
    const ev = await base44.asServiceRole.entities.Event.create({
      brand_id: PLATFORM_TENANT,
      event_type: "system.health.checked",
      source: AGENT_NAME,
      entity_type: "AgentTask",
      entity_id: task.id,
      agent_task_id: task.id,
      payload_json: {
        overall_severity: overall,
        counts: {
          failing_agents: failingAgents.length,
          stalled_tasks: stalledTasks.length,
          missed_schedules: missedSchedules.length,
          broken_brain_chains: brokenChains.length,
          stuck_events: stuckEvents.length,
          stale_founder_inputs: staleApprovals.length + staleQuestions.length,
          integrations_errored: erroredIntegrations.length,
          integrations_stale_sync: staleSyncIntegrations.length,
          integrations_expired_tokens: expiredTokenIntegrations.length,
        },
      },
      status: "pending",
    }).catch(() => null);

    const summary = overall === "green"
      ? `🟢 System healthy. ${KNOWN_AGENTS.length} known agents · ${runningTasks.length} running · 0 issues.`
      : overall === "yellow"
        ? `🟡 ${failingAgents.length} failing · ${stalledTasks.length} stalled · ${missedSchedules.length} schedules · ${stuckEvents.length} stuck events. Read-only — nothing modified.`
        : `🔴 ${failingAgents.length} agents failing · ${stalledTasks.length} stalled tasks · ${missedSchedules.length} missed schedules. Review immediately. Read-only — nothing modified.`;

    await base44.asServiceRole.entities.AgentTask.update(task.id, {
      status: "completed",
      output_summary: summary,
      output_payload_json: {
        report,
        report_event_id: ev?.id || null,
        disclaimer: "READ-ONLY. This agent never kills tasks, never reruns schedules, never applies fixes.",
      },
      completed_at: new Date().toISOString(),
    });

    return Response.json({ ok: true, task_id: task.id, overall_severity: overall, summary, report, event_id: ev?.id || null });
  } catch (error) {
    if (task?.id) {
      try {
        const base44 = createClientFromRequest(req);
        await base44.asServiceRole.entities.AgentTask.update(task.id, {
          status: "failed", error: error.message, completed_at: new Date().toISOString(),
        });
      } catch {}
    }
    return Response.json({ ok: false, error: error.message, task_id: task?.id || null }, { status: 500 });
  }
});