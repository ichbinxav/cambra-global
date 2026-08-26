// DASHBOARD-C3 (2026-08-17) — Pipeline portfolio projection and transitions.
//
// This is a PROJECTION, not an authority. C0 established that stage authority
// already exists per lane (OutboundLead, PartnerProspect, Provider,
// DealActivation) and that creating a generic PipelineItem would be a second
// source of truth for something that already has four. So nothing here stores a
// stage: it reads the authorities, resolves the canonical stage through the C2
// registry, and returns a workspace envelope.
//
// The one thing it DOES write is PipelineStageEvent — the append-only history the
// tree never had. That write is what gives the C2 entity its production writer.
//
// Two properties worth stating up front, both tested:
//
//  1. A lane whose source could not be read contributes NOTHING and is named in
//     source_health. It does not contribute zero rows, because "no leads" and
//     "could not read leads" are different answers.
//  2. The MERCHANT_LIFECYCLE lane is projection-only and every transition attempt
//     against it is refused. DealActivation already has a guarded authority.

import { readRuntimeSource } from './runtimeSourceRead.ts';
import { nullableNumber } from './nullableNumber.ts';
import {
  buildContext, kpi, portfolioResponse, sortKeepingUnknownLast,
  type SourceHealthRow,
} from './workspaceContract.ts';
import {
  canonicalToLegacy, checkTransition, historyRequiredFor, isMaterialStage,
  materialKindsFor, LANES, laneAuthority,
  PIPELINE_STAGE_REGISTRY_VERSION, resolveStage, stagesFor, transitionDirection, type Lane,
} from './pipelineStageRegistry.ts';
import { matchesLeadGmvBand, projectLeadPerson } from './leadPeopleProjection.ts';

export const PIPELINE_CORE_VERSION = 'pipeline-core-1.0.0';

const text = (value: unknown) => String(value ?? '').trim();
// Nullable coercion lives in ONE place now; see nullableNumber.ts for why.
const num = nullableNumber;

/** Read limits. Truncation is reported, never silently swallowed. */
const READ_LIMIT = 2000;

/**
 * Which column a transition writes for each lane.
 *
 * The first declared column only. OutboundLead has three progression columns and
 * writing all three would mean asserting values the caller never supplied; the
 * event row records that a single column moved.
 */
export function primaryColumn(lane: string): string | null {
  return laneAuthority(lane)?.columns?.[0] ?? null;
}

/** The display fields a pipeline row carries, per prompt section 8.9. */
export type PipelineRow = {
  canonical_id: string;
  entity_type: string;
  lane: Lane;
  display_name: string;
  person_name: string | null;
  person_title: string | null;
  person_email: string | null;
  personas: string[];
  score: number | null;
  estimated_gmv_min_eur: number | null;
  estimated_gmv_max_eur: number | null;
  gmv_truth_class: string;
  readiness: string | null;
  readiness_blockers: string[];
  canonical_company_key: string | null;
  country: string | null;
  stage: string | null;
  stage_order: number | null;
  stage_confidence: string;
  stage_conflicted: boolean;
  terminal: boolean;
  semantics: string | null;
  owner: string | null;
  next_action: string | null;
  next_action_at: string | null;
  expected_value_minor: number | null;
  last_activity_at: string | null;
  attention_reasons: string[];
  readings: unknown[];
};

const LANE_READS: Record<Lane, { entity: string; name: (row: any) => string; company: (row: any) => string | null }> = {
  MERCHANT_ACQUISITION: {
    entity: 'OutboundLead',
    name: (row) => text(row?.company_name) || text(row?.contact_email) || text(row?.id),
    company: (row) => text(row?.canonical_company_key) || null,
  },
  PARTNER_ACQUISITION: {
    entity: 'PartnerProspect',
    name: (row) => text(row?.company_name) || text(row?.name) || text(row?.id),
    company: (row) => text(row?.canonical_company_key) || null,
  },
  PROVIDER_RELATIONS: {
    entity: 'Provider',
    name: (row) => text(row?.name) || text(row?.id),
    company: (row) => text(row?.canonical_company_key) || text(row?.slug) || null,
  },
  MERCHANT_LIFECYCLE: {
    entity: 'DealActivation',
    name: (row) => text(row?.brand_name) || text(row?.brand_id) || text(row?.id),
    company: (row) => text(row?.brand_id) || null,
  },
};

/** Why a row needs attention. Every reason is derived, never asserted. */
function attentionReasons(row: any, reading: ReturnType<typeof resolveStage>, now: string): string[] {
  const reasons: string[] = [];
  if (reading.conflicted) reasons.push('stage_sources_disagree');
  if (reading.confidence === 'UNKNOWN') reasons.push('stage_unreadable');
  if (reading.unmapped_values.length) reasons.push('unmapped_stage_value');
  if (!text(row?.sales_owner) && !text(row?.owner_email) && !reading.terminal) reasons.push('no_owner');
  const due = text(row?.next_action_at);
  if (due && Date.parse(due) < Date.parse(now)) reasons.push('next_action_overdue');
  if (!text(row?.next_action) && !reading.terminal) reasons.push('no_next_action');
  return reasons;
}

function projectRow(lane: Lane, row: any, now: string): PipelineRow {
  const spec = LANE_READS[lane];
  const reading = resolveStage(lane, row);
  const person = lane === 'MERCHANT_ACQUISITION' ? projectLeadPerson(row) : null;
  return {
    canonical_id: text(row?.id),
    entity_type: spec.entity,
    lane,
    display_name: spec.name(row),
    person_name: person?.person_name || null,
    person_title: person?.person_title || null,
    person_email: person?.person_email || null,
    personas: person?.personas || [],
    score: person?.score ?? null,
    estimated_gmv_min_eur: person?.estimated_gmv_min_eur ?? null,
    estimated_gmv_max_eur: person?.estimated_gmv_max_eur ?? null,
    gmv_truth_class: person?.gmv_truth_class || 'UNKNOWN',
    readiness: person?.readiness || null,
    readiness_blockers: person?.blockers || [],
    canonical_company_key: spec.company(row),
    country: text(row?.country) || null,
    stage: reading.stage,
    stage_order: reading.order,
    stage_confidence: reading.confidence,
    stage_conflicted: reading.conflicted,
    terminal: reading.terminal,
    semantics: reading.semantics,
    owner: text(row?.sales_owner) || text(row?.owner_email) || null,
    next_action: text(row?.next_action) || null,
    next_action_at: text(row?.next_action_at) || null,
    expected_value_minor: num(row?.expected_revenue_value_minor) ?? num(row?.expected_value_minor),
    last_activity_at: text(row?.last_activity_at) || text(row?.updated_at) || text(row?.updated_date) || null,
    attention_reasons: attentionReasons(row, reading, now),
    readings: reading.readings,
  };
}

/** Deterministic filters (prompt section 8.8). Unknown is preserved, never dropped. */
export function applyFilters(rows: PipelineRow[], filters: Record<string, unknown>): PipelineRow[] {
  let out = [...rows];
  const wanted = (key: string) => {
    const value = filters?.[key];
    if (value === undefined || value === null || value === '') return null;
    return Array.isArray(value) ? value.map(text) : [text(value)];
  };

  const lanes = wanted('lane');
  if (lanes) out = out.filter((row) => lanes.includes(row.lane));
  const stages = wanted('stage');
  if (stages) out = out.filter((row) => row.stage !== null && stages.includes(row.stage));
  const countries = wanted('country');
  if (countries) out = out.filter((row) => row.country !== null && countries.includes(row.country));
  const owners = wanted('owner');
  if (owners) out = out.filter((row) => row.owner !== null && owners.includes(row.owner));
  const personas = wanted('persona');
  if (personas) out = out.filter((row) => row.personas.some((persona) => personas.includes(persona)));
  const readiness = wanted('readiness');
  if (readiness) out = out.filter((row) => row.readiness !== null && readiness.includes(row.readiness));
  if (text(filters?.gmv_band)) out = out.filter((row) => matchesLeadGmvBand(row, filters.gmv_band));
  const minScore = num(filters?.min_score);
  if (minScore !== null) out = out.filter((row) => row.score !== null && row.score >= minScore);

  if (filters?.needs_attention === true) out = out.filter((row) => row.attention_reasons.length > 0);
  if (filters?.unassigned === true) out = out.filter((row) => row.owner === null);
  if (filters?.conflicted === true) out = out.filter((row) => row.stage_conflicted);
  if (filters?.terminal === false) out = out.filter((row) => !row.terminal);

  const minValue = num(filters?.min_expected_value_minor);
  if (minValue !== null) {
    // A row with no value is NOT excluded by a minimum: unknown is not "less
    // than". It is kept and sorts last.
    out = out.filter((row) => row.expected_value_minor === null || row.expected_value_minor >= minValue);
  }
  const query = text(filters?.q).toLowerCase();
  if (query) {
    out = out.filter((row) =>
      row.display_name.toLowerCase().includes(query)
      || text(row.canonical_company_key).toLowerCase().includes(query)
      || text(row.person_name).toLowerCase().includes(query)
      || text(row.person_title).toLowerCase().includes(query)
      || text(row.person_email).toLowerCase().includes(query));
  }
  return out;
}

const SORTS: Record<string, (row: PipelineRow) => number | string | null> = {
  stage: (row) => row.stage_order,
  expected_value: (row) => row.expected_value_minor,
  last_activity: (row) => row.last_activity_at,
  next_action: (row) => row.next_action_at,
  name: (row) => row.display_name,
  attention: (row) => (row.attention_reasons.length ? row.attention_reasons.length : null),
};

/**
 * Builds the pipeline portfolio.
 *
 * `deps.readEntity` is injected so the projection is testable without a live
 * store, and so a caller can restrict which lanes it reads.
 */
export async function buildPipelinePortfolio(input: {
  svc: any;
  now: string;
  contextId: string;
  filters?: Record<string, unknown>;
  sort?: string;
  direction?: 'asc' | 'desc';
  lanes?: Lane[];
  limit?: number;
  cursor?: number;
}) {
  const lanes = (input.lanes && input.lanes.length ? input.lanes : [...LANES]) as Lane[];
  const reads: Record<string, any> = {};
  const rows: PipelineRow[] = [];

  for (const lane of lanes) {
    const spec = LANE_READS[lane];
    const result = await readRuntimeSource<any[]>({
      source: spec.entity,
      read: () => input.svc.entities[spec.entity].list('-updated_date', READ_LIMIT),
      fallback: [],
      limit: READ_LIMIT,
    });
    reads[spec.entity] = result;
    // A lane whose source failed contributes NOTHING rather than zero rows.
    // "No leads" and "could not read leads" are different answers.
    if (result.status === 'UNAVAILABLE') continue;
    for (const row of result.value || []) rows.push(projectRow(lane, row, input.now));
  }

  const { context, source_health } = buildContext({
    workspace: 'pipeline',
    filters: input.filters || {},
    sort: input.sort || 'stage',
    now: input.now,
    contextId: input.contextId,
    reads,
  });

  const filtered = applyFilters(rows, input.filters || {});
  const sorter = SORTS[text(input.sort) || 'stage'] || SORTS.stage;
  const sorted = sortKeepingUnknownLast(filtered, sorter, input.direction || 'desc');
  const offset = Math.max(0, Number(input.cursor || 0));
  const limit = Math.max(1, Math.min(500, Number(input.limit || 100)));
  const page = sorted.slice(offset, offset + limit);

  return portfolioResponse({
    context,
    source_health,
    kpis: buildPipelineKpis(rows, source_health, Object.keys(reads)),
    quick_views: buildQuickViews(rows),
    filter_options: {
      lane: [...lanes],
      stage: lanes.flatMap((lane) => stagesFor(lane).map((stage) => stage.key)),
      country: [...new Set(rows.map((row) => row.country).filter(Boolean))].sort(),
      owner: [...new Set(rows.map((row) => row.owner).filter(Boolean))].sort(),
      persona: [...new Set(rows.flatMap((row) => row.personas))].sort(),
      readiness: [...new Set(rows.map((row) => row.readiness).filter(Boolean))].sort(),
      gmv_band: ['UNDER_1M', 'FROM_1M_TO_5M', 'FROM_5M_TO_20M', 'FROM_20M_TO_100M', 'OVER_100M', 'UNKNOWN'],
      sort: Object.keys(SORTS),
    },
    rows: page,
    // A total over a degraded read is a lower bound, so it is only reported as a
    // total when every lane loaded.
    total: context.data_complete ? sorted.length : null,
    next_cursor: offset + limit < sorted.length ? String(offset + limit) : null,
    permissions: { read: true, prepare: true, operate: true },
    available_actions: ['preview_stage_change', 'apply_stage_change', 'assign_owner', 'set_next_action'],
  });
}

/**
 * KPIs, each declaring its sources so a failed read cannot become a zero.
 *
 * `sources` is the set of entities ACTUALLY read, not the full four. Declaring all
 * four on a lane-filtered view would mark every KPI UNKNOWN because three sources
 * were never consulted — conservative to the point of useless, and it would hide
 * the genuine failures among the irrelevant ones.
 */
export function buildPipelineKpis(rows: PipelineRow[], health: SourceHealthRow[], sources?: string[]) {
  const open = rows.filter((row) => !row.terminal);
  const won = rows.filter((row) => row.semantics === 'win');
  const lost = rows.filter((row) => row.semantics === 'loss');
  const attention = rows.filter((row) => row.attention_reasons.length > 0);
  const conflicted = rows.filter((row) => row.stage_conflicted);
  const unknownStage = rows.filter((row) => row.stage === null);
  const valued = rows.filter((row) => row.expected_value_minor !== null);
  const allSources = sources && sources.length
    ? sources
    : health.map((row) => row.source);

  return [
    kpi({ metric_key: 'active_relationships', label: 'Active relationships', value: open.length, unit: 'count', truth_class: 'OBSERVED', sources: allSources, health }),
    kpi({ metric_key: 'won', label: 'Won', value: won.length, unit: 'count', truth_class: 'OBSERVED', sources: allSources, health }),
    kpi({ metric_key: 'lost', label: 'Lost', value: lost.length, unit: 'count', truth_class: 'OBSERVED', sources: allSources, health }),
    kpi({ metric_key: 'needs_attention', label: 'Needs attention', value: attention.length, unit: 'count', truth_class: 'DERIVED', sources: allSources, health }),
    kpi({
      metric_key: 'stage_conflicts', label: 'Stage sources disagree', value: conflicted.length, unit: 'count',
      truth_class: 'OBSERVED', sources: allSources.includes('OutboundLead') ? ['OutboundLead'] : allSources, health,
      extra: { claim_boundary: 'OutboundLead carries three progression columns. A conflict means the least-advanced reading was taken.' },
    }),
    kpi({
      metric_key: 'stage_unknown', label: 'Stage unreadable', value: unknownStage.length, unit: 'count',
      truth_class: 'OBSERVED', sources: allSources, health,
      extra: { claim_boundary: 'These rows have no readable stage. They are not counted as new.' },
    }),
    kpi({
      metric_key: 'weighted_pipeline', label: 'Expected value', value: valued.reduce((sum, row) => sum + (row.expected_value_minor || 0), 0),
      unit: 'EUR_minor',
      // Only a lower bound: rows with no value are excluded from the sum, and
      // saying so is the difference between a total and a guess.
      truth_class: valued.length === rows.length ? 'DERIVED' : 'MODELED',
      sources: allSources, health,
      extra: {
        numerator: valued.length, denominator: rows.length,
        claim_boundary: valued.length === rows.length
          ? 'Every row carries an expected value.'
          : `${rows.length - valued.length} of ${rows.length} rows carry no expected value and are excluded. This is a lower bound, not a forecast.`,
      },
    }),
  ];
}

function buildQuickViews(rows: PipelineRow[]) {
  return [
    { key: 'all', label: 'All', count: rows.length },
    { key: 'needs_attention', label: 'Needs attention', count: rows.filter((row) => row.attention_reasons.length > 0).length },
    { key: 'unassigned', label: 'Unassigned', count: rows.filter((row) => row.owner === null).length },
    { key: 'conflicted', label: 'Stage sources disagree', count: rows.filter((row) => row.stage_conflicted).length },
    { key: 'overdue', label: 'Overdue next action', count: rows.filter((row) => row.attention_reasons.includes('next_action_overdue')).length },
    { key: 'open', label: 'Open', count: rows.filter((row) => !row.terminal).length },
  ];
}

/**
 * Previews a stage transition. Changes nothing.
 *
 * Returns everything the founder needs to decide plus a hash the execute step
 * must present back, so an execute cannot apply a different change than the one
 * that was shown.
 */
export async function previewStageChange(input: {
  svc: any;
  lane: string;
  subject_id: string;
  to_stage: string;
  automatic?: boolean;
  source_event_type?: string | null;
  reason_code?: string | null;
  now: string;
  sha256: (value: unknown) => Promise<string>;
}) {
  const authority = laneAuthority(input.lane);
  if (!authority?.entity) return { ok: false as const, error: 'unknown_lane' };

  const read = await readRuntimeSource<any>({
    source: `pipeline_subject_${authority.entity}`,
    read: () => input.svc.entities[authority.entity].get(input.subject_id),
    fallback: null,
  });
  if (read.status === 'UNAVAILABLE') return { ok: false as const, error: 'subject_unreadable' };
  if (!read.value) return { ok: false as const, error: 'subject_not_found' };

  const current = resolveStage(input.lane, read.value);
  const check = checkTransition({
    lane: input.lane, from: current.stage, to: input.to_stage,
    automatic: input.automatic === true,
    source_event_type: input.source_event_type,
    reason_code: input.reason_code,
  });

  const column = primaryColumn(input.lane);
  const preview = {
    lane: input.lane,
    subject_type: authority.entity,
    subject_id: text(input.subject_id),
    from_stage: current.stage,
    to_stage: text(input.to_stage).toUpperCase(),
    direction: transitionDirection(input.lane, current.stage, input.to_stage),
    stage_registry_version: PIPELINE_STAGE_REGISTRY_VERSION,
    // Named explicitly so the founder can see that only one of several columns
    // moves, and which one.
    writes_column: column,
    other_columns_untouched: (authority.columns || []).filter((name) => name !== column),
    current_readings: current.readings,
    conflicted: current.conflicted,
    reason_code: text(input.reason_code) || null,
    // Materiality is shown BEFORE the decision, because a transition whose history
    // must persist behaves differently on failure and the founder should know that
    // in advance rather than discover it from an error.
    material: isMaterialStage(input.lane, input.to_stage),
    material_kinds: materialKindsFor(input.lane, input.to_stage),
    history_required: historyRequiredFor(input.lane, input.to_stage),
    allowed: check.allowed,
    blockers: check.blockers,
    requires_reason: check.requires_reason,
    requires_source_event: check.requires_source_event,
    reversible: true,
    external_send_performed: false,
  };
  return { ok: true as const, preview, preview_hash: await input.sha256(preview) };
}

/**
 * Applies a stage transition and appends the event.
 *
 * Order matters: the authority column is moved with CAS FIRST, and only then is
 * the event appended. An event written before the move would claim a transition
 * that may not have happened; an event that fails after a successful move leaves
 * a real change with missing history, which is reported rather than swallowed.
 */
export async function applyStageChange(input: {
  svc: any;
  actor: string;
  actor_kind: 'FOUNDER' | 'OPERATOR' | 'SYSTEM' | 'SCHEDULER' | 'PROVIDER_EVENT';
  lane: string;
  subject_id: string;
  to_stage: string;
  automatic?: boolean;
  source_event_type?: string | null;
  source_event_id?: string | null;
  reason_code?: string | null;
  reason_detail?: string | null;
  expected_preview_hash: string;
  now: string;
  sha256: (value: unknown) => Promise<string>;
}) {
  const previewed = await previewStageChange(input);
  if (!previewed.ok) return previewed;
  if (previewed.preview_hash !== text(input.expected_preview_hash)) {
    // The subject moved between preview and execute, so the change the founder
    // approved is no longer the change that would be applied.
    return { ok: false as const, error: 'preview_hash_mismatch', preview: previewed.preview };
  }
  if (!previewed.preview.allowed) {
    return { ok: false as const, error: 'transition_not_allowed', blockers: previewed.preview.blockers };
  }

  const column = previewed.preview.writes_column;
  if (!column) return { ok: false as const, error: 'lane_has_no_writable_column' };

  // The legacy value this canonical stage corresponds to. If no legacy value
  // expresses it, REFUSE — writing the canonical key into a legacy column would
  // violate the entity enum and corrupt the authority.
  const legacyValue = canonicalToLegacy(input.lane, column, previewed.preview.to_stage);
  if (legacyValue === null) {
    return {
      ok: false as const,
      error: 'canonical_stage_not_expressible_in_authority_column',
      detail: `${previewed.preview.subject_type}.${column} has no value for ${previewed.preview.to_stage}`,
    };
  }

  // Move the authority with compare-and-swap on the value we previewed.
  const previousRaw = (previewed.preview.current_readings as any[])
    .find((entry) => entry.column === column)?.raw ?? null;
  let changed = 0;
  try {
    const result = await input.svc.entities[previewed.preview.subject_type].updateMany(
      previousRaw === null
        ? { id: input.subject_id }
        : { id: input.subject_id, [column]: previousRaw },
      { [column]: legacyValue },
    );
    changed = Number(result?.matched_count ?? result?.modified_count ?? result?.count ?? 0);
  } catch (error) {
    return { ok: false as const, error: 'authority_update_failed', detail: text((error as any)?.message) };
  }
  if (changed !== 1) return { ok: false as const, error: 'stage_revision_conflict' };

  const event = {
    event_key: `${previewed.preview.subject_type}:${input.subject_id}:${previewed.preview.to_stage}:${text(input.source_event_id) || input.now}`,
    lane: input.lane,
    subject_type: previewed.preview.subject_type,
    subject_id: text(input.subject_id),
    from_stage: previewed.preview.from_stage || '',
    to_stage: previewed.preview.to_stage,
    stage_registry_version: PIPELINE_STAGE_REGISTRY_VERSION,
    direction: previewed.preview.direction,
    reason_code: text(input.reason_code),
    reason_detail: text(input.reason_detail),
    actor: text(input.actor),
    actor_kind: input.actor_kind,
    automatic: input.automatic === true,
    source_event_type: text(input.source_event_type),
    source_event_id: text(input.source_event_id),
    confidence: input.automatic === true && text(input.source_event_type) ? 'OBSERVED' : (input.automatic === true ? 'INFERRED' : 'OBSERVED'),
    conflicted_sources_json: previewed.preview.conflicted ? { readings: previewed.preview.current_readings } : {},
    occurred_at: input.now,
    recorded_at: input.now,
  };

  let historyRecorded = true;
  let historyError: string | null = null;
  try {
    await input.svc.entities.PipelineStageEvent.create(event);
  } catch (error) {
    historyRecorded = false;
    historyError = text((error as any)?.message).slice(0, 160);
    console.error(JSON.stringify({ event: 'pipeline_stage_event_unpersisted', subject_id: input.subject_id, material: previewed.preview.material, error: historyError }));
  }

  // FAIL-CLOSED for material transitions. A contractual, economic, verification,
  // billing, mandate, migration or terminal change with no durable history is
  // indistinguishable from one that never happened, and that ambiguity is not
  // acceptable for those kinds. So the authority move is rolled back.
  //
  // Non-material transitions stay fail-open: the move stands and the caller is told
  // the history is incomplete, because losing a lead's CONTACTED timestamp is not
  // worth reverting a real change.
  if (!historyRecorded && previewed.preview.history_required) {
    let rolledBack = false;
    try {
      const undo = await input.svc.entities[previewed.preview.subject_type].updateMany(
        { id: input.subject_id, [column]: legacyValue },
        { [column]: previousRaw },
      );
      rolledBack = Number(undo?.matched_count ?? undo?.modified_count ?? undo?.count ?? 0) === 1;
    } catch (error) {
      console.error(JSON.stringify({ event: 'pipeline_material_rollback_failed', subject_id: input.subject_id, error: text((error as any)?.message).slice(0, 160) }));
    }
    return {
      ok: false as const,
      error: 'material_transition_history_unpersisted',
      material_kinds: previewed.preview.material_kinds,
      history_error: historyError,
      rolled_back: rolledBack,
      // If the rollback itself failed the authority moved with no history and no
      // undo. That is a review case, not a retry: repeating the move could double
      // a material effect.
      ambiguity_state: rolledBack ? null : 'REVIEW_REQUIRED',
      automatic_retry_blocked: !rolledBack,
    };
  }

  return {
    ok: true as const,
    applied: true,
    from_stage: previewed.preview.from_stage,
    to_stage: previewed.preview.to_stage,
    column_written: column,
    material: previewed.preview.material,
    history_recorded: historyRecorded,
    external_send_performed: false,
  };
}
