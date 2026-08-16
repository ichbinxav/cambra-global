import { pauseAllInstantlyCampaigns } from "./instantlyRuntime.ts";
import { readAuthorityRowsForContainment } from "./singletonAuthority.ts";
import {
  captureEmergencyEpoch,
  containCommunicationTransport,
  guardedEmergencyEffect,
  inheritEmergencyEpoch,
} from "./operationalControl.ts";
import type { EmergencyCapability } from "./operationalControl.ts";
import {
  attemptFailClosedOperation,
  bestEffortExecutionEvidence,
  requireCriticalOperation,
} from "./criticalExecution.ts";

export const COST_GOVERNANCE_VERSION = "cost-governance-1.4.0";
export const COST_CATEGORIES = Object.freeze([
  "ai",
  "api",
  "enrichment",
  "email",
]);
export const COST_RESERVATION_MAX_CAS_ATTEMPTS = 6;

const COMMUNICATION_PROVIDERS = new Set([
  "outlook",
  "resend",
  "instantly",
  "typefully",
  "taplio",
]);
const READ_ONLY_RECONCILIATION_SOURCES = new Set([
  "instantlyReconciliationWorker",
  "resendInboundWebhook",
]);

/**
 * Maps paid external work to EmergencyControl capabilities. API/enrichment is
 * always paid-discovery governed, regardless of provider name; this prevents a
 * new/future provider from silently bypassing the pause through a missing
 * allow-list entry. Communication providers additionally retain their stricter
 * transport boundary.
 *
 * COMMAND-PRE-C1 (2026-08-17): the `ai` category used to map to NO capability,
 * so a global emergency stop did not pause LLM spend at all. That was tolerable
 * while the only LLM caller was a single-shot chat; it is not tolerable for
 * CAMBRA Command, which is designed to be the largest LLM spender in the system.
 *
 * `ai` is mapped onto `paid_discovery` rather than onto a NEW capability
 * deliberately: a new field would be absent on every EmergencyControl row that
 * already exists, so an emergency already in force would read it as false and
 * fail OPEN. Reusing paid_discovery means every safe-mode row ever written
 * already covers AI spend from the moment this ships. Legitimate read-only
 * reconciliation keeps its existing escape hatch above.
 */
export function paidProviderEmergencyCapabilities(
  input: any,
): EmergencyCapability[] {
  const category = String(input?.category || "").trim().toLowerCase();
  const provider = String(input?.provider || "").trim().toLowerCase();
  const source = String(input?.source || "").trim();
  if (
    input?.emergency_effect_mode === "read_only_reconciliation" &&
    READ_ONLY_RECONCILIATION_SOURCES.has(source)
  ) return [];
  const capabilities: EmergencyCapability[] = [];
  if (category === "email" || COMMUNICATION_PROVIDERS.has(provider)) {
    capabilities.push("communications");
  }
  if (category === "api" || category === "enrichment" || category === "ai") {
    capabilities.push("paid_discovery");
  }
  return [...new Set(capabilities)];
}

const positiveInteger = (value: any) =>
  Number.isInteger(Number(value)) && Number(value) > 0;

export function validateCostBudget(control: any) {
  const blockers: string[] = [];
  if (!control || control.status !== "active") {
    blockers.push("active_cost_budget_required");
  }
  if (control?.currency !== "EUR") {
    blockers.push("cost_budget_currency_must_be_eur");
  }
  const dailyTotal = Number(control?.daily_total_limit_minor);
  const monthlyTotal = Number(control?.monthly_total_limit_minor);
  if (!positiveInteger(dailyTotal)) {
    blockers.push("daily_total_cost_limit_required");
  }
  if (!positiveInteger(monthlyTotal) || monthlyTotal < dailyTotal) {
    blockers.push("monthly_total_cost_limit_invalid");
  }
  const limits = control?.category_limits_json || {};
  for (const category of COST_CATEGORIES) {
    const daily = Number(limits?.[category]?.daily_limit_minor);
    const monthly = Number(limits?.[category]?.monthly_limit_minor);
    if (!positiveInteger(daily)) {
      blockers.push(`${category}_daily_cost_limit_required`);
    }
    if (!positiveInteger(monthly) || monthly < daily) {
      blockers.push(`${category}_monthly_cost_limit_invalid`);
    }
  }
  const warning = Number(control?.anomaly_warning_pct);
  const hardStop = Number(control?.hard_stop_pct);
  if (!Number.isFinite(warning) || warning < 1 || warning >= 100) {
    blockers.push("cost_anomaly_warning_pct_invalid");
  }
  if (!Number.isFinite(hardStop) || hardStop < warning || hardStop > 100) {
    blockers.push("cost_hard_stop_pct_invalid");
  }
  if (control?.emergency_stop_active === true) {
    blockers.push("cost_emergency_stop_active");
  }
  if (
    !Number.isInteger(Number(control?.reservation_revision)) ||
    Number(control?.reservation_revision) < 0
  ) blockers.push("cost_reservation_revision_required");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(control?.reservation_day_key || ""))) {
    blockers.push("cost_reservation_day_key_required");
  }
  if (!/^\d{4}-\d{2}$/.test(String(control?.reservation_month_key || ""))) {
    blockers.push("cost_reservation_month_key_required");
  }
  if (
    !Number.isFinite(Number(control?.reserved_daily_total_minor)) ||
    Number(control?.reserved_daily_total_minor) < 0
  ) blockers.push("cost_reserved_daily_total_invalid");
  if (
    !Number.isFinite(Number(control?.reserved_monthly_total_minor)) ||
    Number(control?.reserved_monthly_total_minor) < 0
  ) blockers.push("cost_reserved_monthly_total_invalid");
  if (
    !control?.reserved_category_json ||
    typeof control.reserved_category_json !== "object"
  ) blockers.push("cost_reserved_category_state_required");
  if (!Array.isArray(control?.reservation_recent_event_keys)) {
    blockers.push("cost_reservation_event_claims_required");
  }
  return {
    ok: blockers.length === 0,
    blockers: [...new Set(blockers)],
    version: COST_GOVERNANCE_VERSION,
  };
}

export function reservationWindowKeys(at = new Date()) {
  const iso = at.toISOString();
  return { day_key: iso.slice(0, 10), month_key: iso.slice(0, 7) };
}

/**
 * Carries the live, CAS-protected reservation journal across a Founder budget
 * reconfiguration. A new day clears only daily counters; a new month clears
 * both windows and the bounded event-key journal. Configuration changes must
 * never reset usage in the current accounting window.
 */
export function costReservationStateForReconfiguration(
  control: any,
  at = new Date(),
) {
  const keys = reservationWindowKeys(at);
  if (!control) {
    return {
      reservation_revision: 0,
      reservation_day_key: keys.day_key,
      reservation_month_key: keys.month_key,
      reserved_daily_total_minor: 0,
      reserved_monthly_total_minor: 0,
      reserved_category_json: Object.fromEntries(
        COST_CATEGORIES.map((
          category,
        ) => [category, { daily_minor: 0, monthly_minor: 0 }]),
      ),
      reservation_recent_event_keys: [],
      emergency_stop_active: false,
      emergency_stop_reason: "",
    };
  }
  const usage = reservationUsageFromControl(control, at);
  const sameMonth =
    String(control.reservation_month_key || "") === keys.month_key;
  return {
    reservation_revision: Math.max(
      0,
      Number(control.reservation_revision || 0),
    ),
    reservation_day_key: keys.day_key,
    reservation_month_key: keys.month_key,
    reserved_daily_total_minor: usage.daily_total_minor,
    reserved_monthly_total_minor: usage.monthly_total_minor,
    reserved_category_json: usage.categories,
    reservation_recent_event_keys:
      sameMonth && Array.isArray(control.reservation_recent_event_keys)
        ? [...control.reservation_recent_event_keys].slice(-500)
        : [],
    emergency_stop_active: control.emergency_stop_active === true,
    emergency_stop_reason: String(control.emergency_stop_reason || ""),
  };
}

export function selectSingleActiveCostBudget(controls: any[] = []) {
  if (controls.length === 1) return { control: controls[0], blockers: [] };
  return {
    control: null,
    blockers: [
      controls.length > 1
        ? "multiple_active_cost_budgets"
        : "active_cost_budget_required",
    ],
  };
}

/** Converts the CAS counters into the same usage shape as the ledger summary. */
export function reservationUsageFromControl(control: any, at = new Date()) {
  const keys = reservationWindowKeys(at),
    dayMatches = control?.reservation_day_key === keys.day_key,
    monthMatches = control?.reservation_month_key === keys.month_key,
    categories: any = {};
  for (const category of COST_CATEGORIES) {
    const row = control?.reserved_category_json?.[category] || {};
    categories[category] = {
      daily_minor: dayMatches ? Math.max(0, Number(row.daily_minor || 0)) : 0,
      monthly_minor: monthMatches
        ? Math.max(0, Number(row.monthly_minor || 0))
        : 0,
    };
  }
  return {
    daily_total_minor: dayMatches
      ? Math.max(0, Number(control?.reserved_daily_total_minor || 0))
      : 0,
    monthly_total_minor: monthMatches
      ? Math.max(0, Number(control?.reserved_monthly_total_minor || 0))
      : 0,
    categories,
    day_start: `${keys.day_key}T00:00:00.000Z`,
    month_start: `${keys.month_key}-01T00:00:00.000Z`,
  };
}

export function nextCostReservationState(
  control: any,
  category: string,
  amountMinor: number,
  eventKey: string,
  at = new Date(),
) {
  const keys = reservationWindowKeys(at),
    usage = reservationUsageFromControl(control, at),
    categories: any = {};
  for (const key of COST_CATEGORIES) {
    categories[key] = {
      daily_minor: Number(usage.categories[key].daily_minor || 0) +
        (key === category ? amountMinor : 0),
      monthly_minor: Number(usage.categories[key].monthly_minor || 0) +
        (key === category ? amountMinor : 0),
    };
  }
  const recent = control?.reservation_month_key === keys.month_key &&
      Array.isArray(control?.reservation_recent_event_keys)
    ? control.reservation_recent_event_keys
    : [];
  return {
    reservation_revision: Number(control.reservation_revision) + 1,
    reservation_day_key: keys.day_key,
    reservation_month_key: keys.month_key,
    reserved_daily_total_minor: Number(usage.daily_total_minor) + amountMinor,
    reserved_monthly_total_minor: Number(usage.monthly_total_minor) +
      amountMinor,
    reserved_category_json: categories,
    reservation_recent_event_keys: [...new Set([...recent, eventKey])].slice(
      -500,
    ),
    updated_by: "cost_governor",
    updated_at: at.toISOString(),
  };
}

function updatedExactlyOne(result: any) {
  return Boolean(
    result &&
      (result.updated === 1 || result.modified_count === 1 ||
        result.matched_count === 1),
  );
}

async function claimDiscoveryRunBudget(
  svc: any,
  input: any,
  amountMinor: number,
) {
  if (
    String(input?.related_entity_type || "") !== "DiscoveryExecutionRun" ||
    !String(input?.related_entity_id || "")
  ) return null;
  const explicitCap = Number(input?.max_related_spend_minor);
  if (!Number.isFinite(explicitCap) || explicitCap < 0) {
    throw Object.assign(new Error("discovery_run_hard_cap_required"), {
      code: "DISCOVERY_RUN_HARD_CAP_REQUIRED",
    });
  }
  for (
    let attempt = 1;
    attempt <= COST_RESERVATION_MAX_CAS_ATTEMPTS;
    attempt++
  ) {
    const run = await requireCriticalOperation(
      "discovery_run_cost_authority_read",
      () =>
        svc.entities.DiscoveryExecutionRun.get(String(input.related_entity_id)),
    );
    if (!run) {
      throw Object.assign(new Error("discovery_run_not_found"), {
        code: "DISCOVERY_RUN_NOT_FOUND",
      });
    }
    if (
      [
        "COMPLETED",
        "COMPLETED_PARTIAL",
        "BUDGET_STOPPED",
        "FOUNDER_STOPPED",
        "SOURCE_LIMITED",
        "FAILED",
        "NEEDS_REVIEW",
      ].includes(String(run.status))
    ) {
      throw Object.assign(new Error("terminal_discovery_run_cannot_spend"), {
        code: "TERMINAL_DISCOVERY_RUN_CANNOT_SPEND",
      });
    }
    const configuredCap = Math.max(0, Number(run.hard_cap_minor || 0));
    const effectiveCap = Math.min(configuredCap, explicitCap);
    const current = Math.max(0, Number(run.reserved_cost_minor || 0));
    if (current + amountMinor > effectiveCap) {
      throw Object.assign(new Error("discovery_run_hard_cap_exceeded"), {
        code: "DISCOVERY_RUN_HARD_CAP_EXCEEDED",
        projected_minor: current + amountMinor,
        hard_cap_minor: effectiveCap,
      });
    }
    const revision = Math.max(0, Number(run.cost_reservation_revision || 0));
    const changed = await attemptFailClosedOperation(
      "discovery_run_cost_reservation_cas",
      () =>
        svc.entities.DiscoveryExecutionRun.updateMany({
          id: run.id,
          cost_reservation_revision: revision,
        }, {
          $set: {
            reserved_cost_minor: current + amountMinor,
            cost_reservation_revision: revision + 1,
          },
        }),
    );
    if (updatedExactlyOne(changed)) {
      return {
        run_id: run.id,
        previous_minor: current,
        claimed_minor: amountMinor,
        revision: revision + 1,
      };
    }
  }
  throw Object.assign(
    new Error("discovery_run_cost_reservation_concurrency_exhausted"),
    { code: "DISCOVERY_RUN_COST_RESERVATION_CONCURRENCY_EXHAUSTED" },
  );
}

async function rollbackDiscoveryRunBudget(svc: any, claim: any) {
  if (!claim) return;
  await bestEffortExecutionEvidence(
    "discovery_run_cost_reservation_rollback",
    () =>
      svc.entities.DiscoveryExecutionRun.updateMany({
        id: claim.run_id,
        cost_reservation_revision: claim.revision,
        reserved_cost_minor: claim.previous_minor + claim.claimed_minor,
      }, {
        $set: {
          reserved_cost_minor: claim.previous_minor,
          cost_reservation_revision: claim.revision + 1,
        },
      }),
    null,
  );
}

function utcBounds(at = new Date()) {
  const day = new Date(at);
  day.setUTCHours(0, 0, 0, 0);
  const month = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), 1));
  return { dayStart: day.toISOString(), monthStart: month.toISOString() };
}

export function summarizeCostUsage(events: any[] = [], at = new Date()) {
  const { dayStart, monthStart } = utcBounds(at);
  // FAILED attempts remain conservatively budgeted: a provider can charge for a
  // request even when our transport/parser reports failure. Only an explicit
  // reconciliation may VOID a non-billable attempt.
  const active = events.filter((event: any) =>
    ["RESERVED", "OBSERVED", "RECONCILED", "FAILED"].includes(
      String(event?.status || ""),
    )
  );
  const sum = (rows: any[]) =>
    rows.reduce(
      (total: number, event: any) =>
        total + Math.max(0, Number(event?.amount_minor || 0)),
      0,
    );
  const daily = active.filter((event: any) =>
    String(event?.occurred_at || "") >= dayStart
  );
  const monthly = active.filter((event: any) =>
    String(event?.occurred_at || "") >= monthStart
  );
  const categories: any = {};
  for (const category of COST_CATEGORIES) {
    categories[category] = {
      daily_minor: sum(
        daily.filter((event: any) => event.category === category),
      ),
      monthly_minor: sum(
        monthly.filter((event: any) => event.category === category),
      ),
    };
  }
  return {
    daily_total_minor: sum(daily),
    monthly_total_minor: sum(monthly),
    categories,
    day_start: dayStart,
    month_start: monthStart,
  };
}

export function costReservationDecision(input: any) {
  const validation = validateCostBudget(input?.control);
  if (!validation.ok) {
    return {
      allowed: false,
      reason: validation.blockers[0],
      blockers: validation.blockers,
    };
  }
  const category = String(input?.category || "");
  if (!COST_CATEGORIES.includes(category)) {
    return {
      allowed: false,
      reason: "known_cost_category_required",
      blockers: ["known_cost_category_required"],
    };
  }
  const amount = Math.max(0, Math.ceil(Number(input?.amount_minor || 0)));
  if (!positiveInteger(amount)) {
    return {
      allowed: false,
      reason: "positive_cost_reservation_required",
      blockers: ["positive_cost_reservation_required"],
    };
  }
  const usage = input?.usage || summarizeCostUsage([]);
  const control = input.control;
  const limits = control.category_limits_json?.[category] || {};
  const projected = {
    daily_total_minor: Number(usage.daily_total_minor || 0) + amount,
    monthly_total_minor: Number(usage.monthly_total_minor || 0) + amount,
    category_daily_minor:
      Number(usage.categories?.[category]?.daily_minor || 0) + amount,
    category_monthly_minor:
      Number(usage.categories?.[category]?.monthly_minor || 0) + amount,
  };
  const blockers: string[] = [];
  if (projected.daily_total_minor > Number(control.daily_total_limit_minor)) {
    blockers.push("daily_total_cost_budget_exceeded");
  }
  if (
    projected.monthly_total_minor > Number(control.monthly_total_limit_minor)
  ) blockers.push("monthly_total_cost_budget_exceeded");
  if (projected.category_daily_minor > Number(limits.daily_limit_minor)) {
    blockers.push(`${category}_daily_cost_budget_exceeded`);
  }
  if (projected.category_monthly_minor > Number(limits.monthly_limit_minor)) {
    blockers.push(`${category}_monthly_cost_budget_exceeded`);
  }
  return {
    allowed: blockers.length === 0,
    reason: blockers[0] || "within_cost_budget",
    blockers,
    projected,
    amount_minor: amount,
    budget_version: control.version,
  };
}

export async function claimCostEmergencyStop(
  svc: any,
  controlId: string,
  reason: string,
  details: any = {},
) {
  const stopKey = String(details.stop_key || `cost-stop:${crypto.randomUUID()}`)
    .slice(0, 200);
  const owner = String(details.stop_owner || "cost_governor").slice(0, 200);
  const kind = details.operator_exercise === true
    ? "operator_drill"
    : details.stop_kind === "bootstrap"
    ? "bootstrap"
    : "runtime";
  const requireInactive = details.require_inactive === true;
  for (
    let attempt = 1;
    attempt <= COST_RESERVATION_MAX_CAS_ATTEMPTS;
    attempt++
  ) {
    const fresh = await attemptFailClosedOperation(
      "cost_emergency_stop_authority_read",
      () => svc.entities.CostBudgetControl.get(controlId),
    );
    if (!fresh || fresh.status !== "active") {
      return {
        ok: false,
        acquired: false,
        error: "active_cost_budget_required",
        stop_key: stopKey,
        control: fresh,
      };
    }
    if (requireInactive && fresh.emergency_stop_active === true) {
      return {
        ok: false,
        acquired: false,
        error: "cost_emergency_stop_already_active",
        stop_key: stopKey,
        control: fresh,
      };
    }
    const revision = Number(fresh.reservation_revision);
    if (!Number.isInteger(revision) || revision < 0) {
      return {
        ok: false,
        acquired: false,
        error: "cost_reservation_revision_required",
        stop_key: stopKey,
        control: fresh,
      };
    }
    const at = new Date().toISOString();
    const next = {
      emergency_stop_active: true,
      emergency_stop_reason: reason,
      emergency_stop_key: stopKey,
      emergency_stop_owner: owner,
      emergency_stop_kind: kind,
      emergency_stop_activated_at: at,
      reservation_revision: revision + 1,
      updated_at: at,
      updated_by: owner,
    };
    const changed = await attemptFailClosedOperation(
      "cost_emergency_stop_claim_cas",
      () =>
        svc.entities.CostBudgetControl.updateMany(
          {
            id: fresh.id,
            status: "active",
            reservation_revision: revision,
            ...(requireInactive ? { emergency_stop_active: false } : {}),
          },
          { $set: next },
        ),
    );
    if (updatedExactlyOne(changed)) {
      return {
        ok: true,
        acquired: true,
        stop_key: stopKey,
        control: { ...fresh, ...next },
        previous_revision: revision,
        reservation_revision: revision + 1,
      };
    }
  }
  return {
    ok: false,
    acquired: false,
    error: "cost_emergency_stop_concurrency_exhausted",
    stop_key: stopKey,
    control: await attemptFailClosedOperation(
      "cost_emergency_stop_claim_readback",
      () => svc.entities.CostBudgetControl.get(controlId),
    ),
  };
}

export async function clearOwnedCostEmergencyStop(svc: any, input: any) {
  const controlId = String(input?.control_id || "");
  const expectedRevision = Number(input?.expected_revision);
  const stopKey = String(input?.stop_key || "");
  if (
    !controlId || !Number.isInteger(expectedRevision) || expectedRevision < 0
  ) {
    return {
      ok: false,
      cleared: false,
      error: "cost_stop_clear_revision_required",
    };
  }
  const at = new Date().toISOString();
  const changed = await attemptFailClosedOperation(
    "cost_emergency_stop_clear_cas",
    () =>
      svc.entities.CostBudgetControl.updateMany(
        {
          id: controlId,
          status: "active",
          reservation_revision: expectedRevision,
          emergency_stop_active: true,
          ...(stopKey ? { emergency_stop_key: stopKey } : {}),
        },
        {
          $set: {
            emergency_stop_active: false,
            emergency_stop_reason: "",
            emergency_stop_key: "",
            emergency_stop_owner: "",
            reservation_revision: expectedRevision + 1,
            updated_by: String(input?.actor || "founder"),
            updated_at: at,
          },
        },
      ),
  );
  if (!updatedExactlyOne(changed)) {
    return {
      ok: false,
      cleared: false,
      error: "cost_emergency_stop_changed_concurrently",
      control: await attemptFailClosedOperation(
        "cost_emergency_stop_clear_readback",
        () => svc.entities.CostBudgetControl.get(controlId),
      ),
    };
  }
  const fresh = await attemptFailClosedOperation(
    "cost_emergency_stop_verification_readback",
    () => svc.entities.CostBudgetControl.get(controlId),
  );
  const verified = Boolean(
    fresh && fresh.emergency_stop_active !== true &&
      Number(fresh.reservation_revision) === expectedRevision + 1,
  );
  return verified
    ? {
      ok: true,
      cleared: true,
      control: fresh,
      reservation_revision: expectedRevision + 1,
    }
    : {
      ok: false,
      cleared: false,
      error: "cost_emergency_stop_clear_not_verified",
      control: fresh,
    };
}

export async function containOutboundForCostStop(svc: any, reason: string) {
  const authority = await readAuthorityRowsForContainment(svc, {
    entity: "OutboundControl",
    query: { control_key: "global" },
    sort: "-created_date",
    authority: "outbound_control",
    limit: 1000,
  });
  if (!authority.rows.length) {
    return authority.complete
      ? { ok: true, reason: "outbound_control_missing", authority_row_count: 0 }
      : {
        ok: false,
        error: authority.blocker || "outbound_control_unavailable",
        authority_row_count: 0,
      };
  }
  const stopped = {
    acquisition_enabled: false,
    premium_outlook_enabled: false,
    volume_resend_enabled: false,
    instantly_enabled: false,
    paused_reason: `cost_emergency_stop:${reason}`,
    transition_key: "",
    transition_action: "",
    transition_actor: "",
    transition_preflight_hash: "",
    transition_emergency_revision: null,
    transition_started_at: null,
    transition_expires_at: null,
  };
  const results: any[] = [];
  for (const seed of authority.rows) {
    let result: any = {
      ok: false,
      error: "outbound_cost_stop_concurrency_exhausted",
    };
    for (
      let attempt = 1;
      attempt <= COST_RESERVATION_MAX_CAS_ATTEMPTS;
      attempt++
    ) {
      const fresh = attempt === 1 ? seed : await attemptFailClosedOperation(
        "cost_stop_outbound_control_read",
        () => svc.entities.OutboundControl.get(seed.id),
      );
      if (!fresh) {
        result = { ok: false, error: "outbound_control_unavailable" };
        break;
      }
      const revision = Number.isInteger(Number(fresh.control_revision))
        ? Number(fresh.control_revision)
        : 0;
      const changed = await attemptFailClosedOperation(
        "cost_stop_outbound_control_cas",
        () =>
          svc.entities.OutboundControl.updateMany({
            id: fresh.id,
            control_revision: revision,
          }, { $set: { ...stopped, control_revision: revision + 1 } }),
      );
      if (updatedExactlyOne(changed)) {
        result = {
          ok: true,
          control_revision: revision + 1,
          preempted_transition: Boolean(fresh.transition_key),
        };
        break;
      }
    }
    results.push({ control_id: String(seed.id || ""), ...result });
  }
  const ok = authority.complete && results.every((row) => row.ok);
  return {
    ...(results.length === 1 ? results[0] : {}),
    ok,
    authority_row_count: authority.rows.length,
    duplicate_authority_detected: authority.rows.length > 1,
    coverage_complete: authority.complete,
    read_blocker: authority.blocker,
    results,
    ...(!ok ? { error: "outbound_cost_stop_containment_incomplete" } : {}),
  };
}

export async function activateCostEmergencyStop(
  svc: any,
  control: any,
  reason: string,
  details: any = {},
) {
  const now = new Date().toISOString();
  const claim = await claimCostEmergencyStop(
    svc,
    String(control?.id || ""),
    reason,
    details,
  );
  // An operator drill may never supersede a real stop. Real runtime stops still
  // contain outbound even if their budget CAS exhausts, preserving fail-closed
  // behavior at the external-effect boundary.
  if (details.require_inactive === true && !claim.acquired) {
    return {
      ok: false,
      claim,
      outbound: { ok: true, skipped: true },
      instantly_remote_pause: { ok: true, skipped: true },
      incident: null,
    };
  }
  const outbound = await containOutboundForCostStop(svc, reason);
  const instantlyPause = await pauseAllInstantlyCampaigns(
    svc,
    `cost_emergency_stop:${reason}`,
  ).catch((error: any) => ({
    ok: false,
    reason: String(error?.message || "instantly_remote_pause_failed"),
  }));
  const dedupeKey = String(
    details.incident_dedupe_key ||
      (details.operator_exercise === true
        ? `cost-budget-emergency-stop-drill:${claim.stop_key}`
        : "cost-budget-emergency-stop"),
  ).slice(0, 240);
  const old = await bestEffortExecutionEvidence(
    "cost_stop_incident_lookup",
    () =>
      svc.entities.AutonomyIncident.filter(
        { dedupe_key: dedupeKey, status: "open" },
        "-last_seen_at",
        1,
      ),
    [] as any[],
  );
  const incident = {
    domain: "financial",
    severity: "critical",
    status: "open",
    subject_type: "CostBudgetControl",
    subject_id: control.id,
    summary: `Paid execution stopped: ${reason}`,
    details_json: {
      ...details,
      stop_key: claim.stop_key,
      stop_claimed: claim.acquired,
      budget_version: control.version,
      outbound_containment: outbound,
    },
    first_seen_at: old[0]?.first_seen_at || now,
    last_seen_at: now,
    workflow_state: "human_review",
    owner_type: "founder",
    automation_eligibility: "human_required",
    financial_impact_minor: 0,
    customer_impact: "none",
    legal_risk: "none",
  };
  const persistedIncident = old[0]
    ? await bestEffortExecutionEvidence(
      "cost_stop_incident_update",
      () => svc.entities.AutonomyIncident.update(old[0].id, incident),
      old[0],
    )
    : await bestEffortExecutionEvidence(
      "cost_stop_incident_create",
      () =>
        svc.entities.AutonomyIncident.create({
          dedupe_key: dedupeKey,
          ...incident,
        }),
      null,
    );
  await bestEffortExecutionEvidence(
    "cost_stop_operational_log",
    () =>
      svc.entities.OperationalLog.create({
        event_type: "cost_emergency_stop_activated",
        message: reason,
        data_json: {
          ...details,
          stop_key: claim.stop_key,
          stop_claimed: claim.acquired,
          outbound_containment: outbound,
          instantly_remote_pause: instantlyPause,
        },
        actor_email: String(details.stop_owner || "cost_governor"),
        created_at: now,
      }),
    null,
  );
  return {
    ok: claim.acquired && outbound.ok && instantlyPause?.ok !== false,
    claim,
    outbound,
    instantly_remote_pause: instantlyPause,
    incident: persistedIncident,
  };
}

export async function reservePaidOperation(svc: any, input: any) {
  const eventKey = String(input?.event_key || "").trim();
  if (!eventKey) {
    throw Object.assign(new Error("cost_event_key_required"), {
      code: "COST_EVENT_KEY_REQUIRED",
    });
  }
  const emergencyCapabilities = paidProviderEmergencyCapabilities(input);
  const emergencyEpoch = emergencyCapabilities.length
    ? input?.emergency_epoch_claim
      ? await inheritEmergencyEpoch(
        svc,
        input.emergency_epoch_claim,
        emergencyCapabilities,
      )
      : await captureEmergencyEpoch(svc, emergencyCapabilities)
    : null;
  const existing = await requireCriticalOperation(
    "cost_usage_event_idempotency_read",
    () =>
      svc.entities.CostUsageEvent.filter(
        { event_key: eventKey },
        "-occurred_at",
        2,
      ),
  );
  if (existing[0]) {
    if (!["VOID", "FAILED"].includes(String(existing[0].status))) {
      return {
        duplicate: true,
        event: existing[0],
        decision: { allowed: true, reason: "existing_cost_reservation" },
        emergency_epoch_claim: emergencyEpoch,
      };
    }
    throw Object.assign(new Error("terminal_cost_event_key_reuse_forbidden"), {
      code: "TERMINAL_COST_EVENT_KEY_REUSE_FORBIDDEN",
    });
  }
  const controls = await requireCriticalOperation(
    "cost_budget_authority_read",
    () =>
      svc.entities.CostBudgetControl.filter(
        { control_key: "global", status: "active" },
        "-approved_at",
        20,
      ),
  );
  const selection = selectSingleActiveCostBudget(controls);
  const control = selection.control;
  if (selection.blockers.length) {
    throw Object.assign(new Error(selection.blockers[0]), {
      code: "COST_BUDGET_BLOCKED",
      blockers: selection.blockers,
      active_control_count: controls.length,
    });
  }
  const validation = validateCostBudget(control);
  if (!validation.ok) {
    throw Object.assign(new Error(validation.blockers[0]), {
      code: "COST_BUDGET_BLOCKED",
      blockers: validation.blockers,
    });
  }
  const configuredAmount = Number(
    control?.estimated_unit_cost_minor_json?.[String(input.category || "")],
  );
  const amountMinor = Number.isFinite(Number(input.amount_minor)) &&
      Number(input.amount_minor) > 0
    ? Number(input.amount_minor)
    : configuredAmount;
  if (!positiveInteger(amountMinor)) {
    throw Object.assign(new Error("positive_cost_reservation_required"), {
      code: "POSITIVE_COST_RESERVATION_REQUIRED",
    });
  }
  let discoveryRunClaim: any = null;
  if (String(input?.related_entity_type || "") === "DiscoveryExecutionRun") {
    discoveryRunClaim = await claimDiscoveryRunBudget(svc, input, amountMinor);
  }
  let claimedControl: any = null, decision: any = null;
  try {
    for (
      let attempt = 1;
      attempt <= COST_RESERVATION_MAX_CAS_ATTEMPTS;
      attempt++
    ) {
      const fresh = await requireCriticalOperation(
        "cost_budget_authority_refresh",
        () => svc.entities.CostBudgetControl.get(control.id),
      );
      const freshValidation = validateCostBudget(fresh);
      if (!freshValidation.ok) {
        throw Object.assign(new Error(freshValidation.blockers[0]), {
          code: "COST_BUDGET_BLOCKED",
          blockers: freshValidation.blockers,
        });
      }
      if ((fresh.reservation_recent_event_keys || []).includes(eventKey)) {
        const persisted = (await requireCriticalOperation(
          "cost_usage_event_claim_readback",
          () =>
            svc.entities.CostUsageEvent.filter(
              { event_key: eventKey },
              "-occurred_at",
              2,
            ),
        ))[0] || null;
        if (
          persisted && !["VOID", "FAILED"].includes(String(persisted.status))
        ) {
          return {
            duplicate: true,
            event: persisted,
            decision: { allowed: true, reason: "existing_cost_reservation" },
            emergency_epoch_claim: emergencyEpoch,
          };
        }
        if (persisted) {
          throw Object.assign(
            new Error("terminal_cost_event_key_reuse_forbidden"),
            { code: "TERMINAL_COST_EVENT_KEY_REUSE_FORBIDDEN" },
          );
        }
        throw Object.assign(new Error("cost_event_claimed_concurrently"), {
          code: "COST_EVENT_CLAIMED_CONCURRENTLY",
        });
      }
      const usage = reservationUsageFromControl(fresh);
      decision = costReservationDecision({
        control: fresh,
        usage,
        category: input.category,
        amount_minor: amountMinor,
      });
      if (!decision.allowed) {
        await activateCostEmergencyStop(svc, fresh, decision.reason, {
          category: input.category,
          projected: decision.projected,
          blockers: decision.blockers,
        });
        throw Object.assign(new Error(decision.reason), {
          code: "COST_BUDGET_EXCEEDED",
          blockers: decision.blockers,
          projected: decision.projected,
        });
      }
      const next = nextCostReservationState(
        fresh,
        String(input.category),
        decision.amount_minor,
        eventKey,
      );
      const changed = await attemptFailClosedOperation(
        "cost_budget_reservation_cas",
        () =>
          svc.entities.CostBudgetControl.updateMany({
            id: fresh.id,
            reservation_revision: Number(fresh.reservation_revision),
          }, { $set: next }),
      );
      if (updatedExactlyOne(changed)) {
        claimedControl = { ...fresh, ...next };
        break;
      }
    }
    if (!claimedControl) {
      throw Object.assign(new Error("cost_reservation_concurrency_exhausted"), {
        code: "COST_RESERVATION_CONCURRENCY_EXHAUSTED",
      });
    }
  } catch (error) {
    await rollbackDiscoveryRunBudget(svc, discoveryRunClaim);
    throw error;
  }
  try {
    const event = await svc.entities.CostUsageEvent.create({
      event_key: eventKey,
      category: String(input.category),
      provider: String(input.provider || "unknown"),
      source: String(input.source || "unknown"),
      related_entity_type: String(input.related_entity_type || ""),
      related_entity_id: String(input.related_entity_id || ""),
      amount_minor: decision.amount_minor,
      currency: "EUR",
      status: "RESERVED",
      usage_json: {
        reservation: true,
        reservation_revision: claimedControl.reservation_revision,
        related_budget_revision: discoveryRunClaim?.revision || null,
        ...(input.usage_json || {}),
      },
      budget_version: claimedControl.version,
      occurred_at: new Date().toISOString(),
    });
    return {
      duplicate: false,
      event,
      decision,
      control: claimedControl,
      emergency_epoch_claim: emergencyEpoch,
    };
  } catch (error) {
    await bestEffortExecutionEvidence(
      "cost_reservation_ledger_failure_log",
      () =>
        svc.entities.OperationalLog.create({
          event_type: "cost_reservation_ledger_write_failed",
          message:
            "CAS budget claim retained conservatively; paid operation blocked",
          data_json: {
            event_key: eventKey,
            category: String(input.category),
            reservation_revision: claimedControl.reservation_revision,
          },
          actor_email: "cost_governor",
          created_at: new Date().toISOString(),
        }),
      null,
    );
    throw Object.assign(new Error("cost_reservation_ledger_write_failed"), {
      code: "COST_RESERVATION_LEDGER_WRITE_FAILED",
      cause: error,
    });
  }
}

export async function settlePaidOperation(
  svc: any,
  reservation: any,
  input: any = {},
) {
  if (!reservation?.event?.id || reservation.duplicate) {
    return reservation?.event || null;
  }
  const receiptAmount = Number(input.amount_minor),
    reconciliationRef = String(input.reconciliation_ref || "").trim();
  const reliableActual = input.reconciled === true &&
    input.amount_quality === "PROVIDER_FINAL_RECEIPT" &&
    Number.isInteger(receiptAmount) && receiptAmount >= 0 &&
    Boolean(reconciliationRef);
  const fallbackAmount = input.amount_quality === "PROVIDER_FINAL_RECEIPT"
    ? reservation.event.amount_minor
    : Number.isFinite(Number(input.amount_minor))
    ? Math.max(0, Math.ceil(Number(input.amount_minor)))
    : reservation.event.amount_minor;
  return requireCriticalOperation(
    "cost_usage_event_settlement_write",
    () =>
      svc.entities.CostUsageEvent.update(reservation.event.id, {
        status: input.ok === false
          ? "FAILED"
          : reliableActual
          ? "RECONCILED"
          : "OBSERVED",
        amount_minor: reliableActual ? receiptAmount : fallbackAmount,
        usage_json: {
          ...(reservation.event.usage_json || {}),
          ...(input.usage_json || {}),
          ...(reliableActual
            ? { reserved_amount_minor: reservation.event.amount_minor }
            : {}),
          amount_quality: reliableActual
            ? "PROVIDER_FINAL_RECEIPT"
            : input.amount_quality === "PROVIDER_FINAL_RECEIPT"
            ? "CONSERVATIVE_RESERVATION"
            : input.amount_quality || "CONSERVATIVE_RESERVATION",
          ...(reliableActual ? { reconciliation_ref: reconciliationRef } : {}),
        },
        completed_at: new Date().toISOString(),
      }),
  );
}

/**
 * Executes a provider operation under the exact EmergencyControl epoch that
 * authorized its durable cost reservation. Raw provider adapters must use this
 * helper rather than recapturing authority after the reservation.
 */
export async function guardReservedPaidProviderEffect<T>(
  svc: any,
  reservation: any,
  input: any,
  effect: () => Promise<T>,
): Promise<T> {
  const capabilities = paidProviderEmergencyCapabilities(input);
  if (!capabilities.length) return effect();
  const claim = reservation?.emergency_epoch_claim;
  if (!claim) {
    throw Object.assign(
      new Error("paid_provider_emergency_epoch_claim_required"),
      {
        code: "PAID_PROVIDER_EMERGENCY_EPOCH_CLAIM_REQUIRED",
        review_required: true,
      },
    );
  }
  const provider = String(input?.provider || "").trim().toLowerCase();
  return guardedEmergencyEffect(svc, {
    claim,
    effect_key: String(
      input?.effect_key ||
        `paid_provider_effect:${
          String(input?.event_key || reservation?.event?.event_key || "unkeyed")
        }`,
    ),
    effect,
    contain: ["outlook", "resend", "instantly"].includes(provider)
      ? () =>
        containCommunicationTransport(
          svc,
          provider as "outlook" | "resend" | "instantly",
          "emergency_epoch_changed_during_paid_email",
        )
      : undefined,
  });
}

/** Cost-gated transport for paid provider endpoints that need a custom request/response shape. */
export async function paidProviderFetch(
  svc: any,
  input: any,
  url: string | URL,
  init?: RequestInit,
): Promise<Response> {
  const logicalKey = String(input?.event_key || "unkeyed");
  // Approval-gated publishing paths use one stable event key. A duplicate
  // reservation is an ambiguous/replayed external effect and must never issue
  // the HTTP request again. Other callers preserve the historical per-attempt
  // accounting key until they explicitly opt in.
  const eventKey = input?.stable_event_key === true
    ? logicalKey
    : `${logicalKey}:${crypto.randomUUID()}`;
  const reservation = await reservePaidOperation(svc, {
    ...input,
    event_key: eventKey,
  });
  if (input?.stable_event_key === true && reservation.duplicate) {
    const duplicate: any = new Error(
      "stable_paid_provider_operation_already_claimed",
    );
    duplicate.code = "STABLE_PAID_PROVIDER_OPERATION_ALREADY_CLAIMED";
    duplicate.review_required = true;
    throw duplicate;
  }
  try {
    // reservePaidOperation captures/inherits before any budget mutation. Reuse
    // that exact epoch so the provider request cannot recapture authority after
    // STOP -> RESUME while cost reservation was in progress.
    const response = await guardReservedPaidProviderEffect(svc, reservation, {
      ...input,
      effect_key: `paid_provider_fetch:${logicalKey}`,
    }, () => fetch(url, init));
    await settlePaidOperation(svc, reservation, {
      ok: response.ok,
      usage_json: { http_status: response.status },
      amount_quality: "CONSERVATIVE_RESERVATION",
    });
    return response;
  } catch (error) {
    await settlePaidOperation(svc, reservation, {
      ok: false,
      usage_json: {
        transport_error: String((error as Error)?.message || error).slice(
          0,
          200,
        ),
      },
      amount_quality: "CONSERVATIVE_RESERVATION",
    });
    throw error;
  }
}

export async function sendCostGovernedEmail(
  svc: any,
  input: any,
  payload: any,
): Promise<any> {
  const logicalKey = String(input?.event_key || "unkeyed");
  const eventKey = input?.stable_event_key === true
    ? logicalKey
    : `${logicalKey}:${crypto.randomUUID()}`;
  const reservation = await reservePaidOperation(svc, {
    ...input,
    event_key: eventKey,
    category: "email",
    provider: String(input?.provider || "base44_email"),
  });
  // Core.SendEmail exposes no documented provider idempotency/reconciliation
  // guarantee. An existing stable reservation may therefore represent a
  // completed external effect: block replay and require reconciliation.
  if (input?.stable_event_key === true && reservation.duplicate) {
    throw Object.assign(new Error("email_effect_review_required"), {
      code: "EMAIL_EFFECT_REVIEW_REQUIRED",
      status: 409,
      review_required: true,
      automatic_retry_blocked: true,
      event_key: eventKey,
      cost_event_id: reservation.event?.id || null,
    });
  }
  try {
    const claim = input?.emergency_epoch_claim
      ? await inheritEmergencyEpoch(
        svc,
        input.emergency_epoch_claim,
        "communications",
      )
      : await captureEmergencyEpoch(svc, "communications");
    const result: any = await guardedEmergencyEffect(svc, {
      claim,
      effect_key: `base44_email:${logicalKey}`,
      effect: () => svc.integrations.Core.SendEmail(payload),
      // Core.SendEmail is CAMBRA's volume-email boundary. A provider response
      // racing with STOP cannot be recalled, so disable the durable Resend/
      // volume transport and its profiles before surfacing REVIEW_REQUIRED.
      contain: () =>
        containCommunicationTransport(
          svc,
          "resend",
          "emergency_epoch_changed_during_base44_email",
        ),
    });
    const providerReference = String(
      result?.id || result?.message_id || "",
    ).trim();
    if (!providerReference) {
      throw Object.assign(new Error("email_provider_response_unverified"), {
        code: "EMAIL_PROVIDER_RESPONSE_UNVERIFIED",
        status: 409,
        review_required: true,
        automatic_retry_blocked: true,
      });
    }
    await settlePaidOperation(svc, reservation, {
      ok: true,
      usage_json: {
        recipient_count: Array.isArray(payload?.to) ? payload.to.length : 1,
        provider_reference: providerReference,
        provider_acceptance_state: "ACCEPTED",
        delivery_observed: false,
      },
      amount_quality: "CONSERVATIVE_RESERVATION",
    });
    return {
      ...result,
      id: providerReference,
      status: "ACCEPTED",
      delivery_observed: false,
    };
  } catch (error) {
    await settlePaidOperation(svc, reservation, {
      ok: false,
      usage_json: {
        transport_error: String((error as Error)?.message || error).slice(
          0,
          200,
        ),
      },
      amount_quality: "CONSERVATIVE_RESERVATION",
    });
    throw error;
  }
}

export async function costRuntimeSnapshot(svc: any) {
  const controls = await requireCriticalOperation(
    "cost_runtime_budget_authority_read",
    () =>
      svc.entities.CostBudgetControl.filter(
        { control_key: "global", status: "active" },
        "-approved_at",
        20,
      ),
  );
  const selection = selectSingleActiveCostBudget(controls);
  const control = selection.control;
  const bounds = utcBounds();
  const events = await requireCriticalOperation(
    "cost_runtime_usage_read",
    () =>
      svc.entities.CostUsageEvent.filter(
        { occurred_at: { $gte: bounds.monthStart } },
        "-occurred_at",
        5000,
      ),
  );
  const usage = summarizeCostUsage(events);
  const reservationUsage = control
    ? reservationUsageFromControl(control)
    : summarizeCostUsage([]);
  const governedUsage = {
    daily_total_minor: Math.max(
      usage.daily_total_minor,
      reservationUsage.daily_total_minor,
    ),
    monthly_total_minor: Math.max(
      usage.monthly_total_minor,
      reservationUsage.monthly_total_minor,
    ),
    categories: Object.fromEntries(
      COST_CATEGORIES.map((category) => [category, {
        daily_minor: Math.max(
          usage.categories[category].daily_minor,
          reservationUsage.categories[category].daily_minor,
        ),
        monthly_minor: Math.max(
          usage.categories[category].monthly_minor,
          reservationUsage.categories[category].monthly_minor,
        ),
      }]),
    ),
  };
  const baseValidation = validateCostBudget(control);
  const validation = {
    ...baseValidation,
    ok: selection.blockers.length === 0 && baseValidation.ok,
    blockers: [...new Set([...selection.blockers, ...baseValidation.blockers])],
  };
  const pct = (used: number, limit: any) =>
    Number(limit) > 0 ? used * 100 / Number(limit) : null;
  const utilization = {
    daily_total_pct: pct(
      governedUsage.daily_total_minor,
      control?.daily_total_limit_minor,
    ),
    monthly_total_pct: pct(
      governedUsage.monthly_total_minor,
      control?.monthly_total_limit_minor,
    ),
    categories: Object.fromEntries(
      COST_CATEGORIES.map((category) => [category, {
        daily_pct: pct(
          governedUsage.categories[category].daily_minor,
          control?.category_limits_json?.[category]?.daily_limit_minor,
        ),
        monthly_pct: pct(
          governedUsage.categories[category].monthly_minor,
          control?.category_limits_json?.[category]?.monthly_limit_minor,
        ),
      }]),
    ),
  };
  return {
    control,
    validation,
    active_control_count: controls.length,
    conflicting_active_control_ids: controls.length > 1
      ? controls.map((row: any) => String(row.id || "")).filter(Boolean)
      : [],
    usage,
    reservation_usage: reservationUsage,
    governed_usage: governedUsage,
    utilization,
    coverage_truncated: events.length >= 5000,
  };
}
