// DASHBOARD-C2 (2026-08-17) — canonical pipeline stage resolution.
//
// C0 established that stage authority exists but is fragmented: three overlapping
// mutable vocabularies on OutboundLead, one column each on PartnerProspect and
// Provider, and DealActivation.status for lifecycle. Nothing recorded a
// transition.
//
// This module is the single reader of that fragmentation. It does NOT change what
// any entity stores — migrating fifteen writers onto a new vocabulary would be a
// live data migration, out of scope, and dangerous. It declares the canonical
// reading, and both frontend and backend consume it so they cannot drift.
//
// The rule that matters most:
//
//   When several source columns disagree about the same subject, take the
//   LEAST-ADVANCED canonical stage and record the disagreement.
//
// Claiming progress that cannot be proven is the error class. A lead whose
// reservoir_state says "converted" while its stage still says "contacted" is a
// contacted lead with a suspicious reservoir row, not a won deal.

import registry from '../../config/dashboard/pipeline-stage-registry.v1.json' with { type: 'json' };

export const PIPELINE_STAGE_REGISTRY_VERSION: string = (registry as any).registry_version;

const text = (value: unknown) => String(value ?? '').trim();

export type Lane = 'MERCHANT_ACQUISITION' | 'PARTNER_ACQUISITION' | 'PROVIDER_RELATIONS' | 'MERCHANT_LIFECYCLE';
export const LANES: readonly Lane[] = Object.freeze(Object.keys((registry as any).lanes) as Lane[]);

export type StageDefinition = {
  key: string;
  order: number;
  terminal: boolean;
  semantics: 'open' | 'win' | 'loss' | 'nurture' | 'blocked';
  allowed_source_events?: string[];
  required_fields?: string[];
  note?: string;
};

export function stagesFor(lane: string): StageDefinition[] {
  return ((registry as any).lanes?.[text(lane)]?.stages || []) as StageDefinition[];
}

export function stageDefinition(lane: string, stage: string): StageDefinition | null {
  return stagesFor(lane).find((row) => row.key === text(stage).toUpperCase()) || null;
}

export function laneAuthority(lane: string): { entity: string; columns: string[]; projection_only?: boolean } | null {
  const node = (registry as any).lanes?.[text(lane)];
  if (!node) return null;
  return {
    entity: node.authority?.entity,
    columns: node.authority?.columns || [],
    projection_only: node.projection_only === true,
  };
}

/**
 * Maps one legacy column value onto its canonical stage.
 *
 * Returns null for a value the registry does not know. Null is deliberate: a
 * value nobody mapped must surface as UNKNOWN rather than being guessed into the
 * nearest-looking stage.
 */
export function mapLegacyStage(lane: string, column: string, value: unknown): string | null {
  const mappings = (registry as any).lanes?.[text(lane)]?.legacy_mappings?.[text(column)];
  if (!mappings) return null;
  return mappings[text(value)] ?? null;
}

export type StageReading = {
  lane: Lane;
  stage: string | null;
  order: number | null;
  terminal: boolean;
  semantics: string | null;
  confidence: 'OBSERVED' | 'DERIVED' | 'CONFLICTED' | 'UNKNOWN';
  /** Every column that produced a reading, so a disagreement is inspectable. */
  readings: Array<{ column: string; raw: string; canonical: string | null; order: number | null }>;
  unmapped_values: Array<{ column: string; raw: string }>;
  conflicted: boolean;
};

/**
 * Resolves the canonical stage of one subject row.
 *
 * `OBSERVED` only when every mapped column agrees. Any disagreement is
 * `CONFLICTED` at the least-advanced stage. No reading at all is `UNKNOWN` with a
 * null stage — never a default of the first stage, which would make an unread row
 * indistinguishable from a genuinely new one.
 */
export function resolveStage(lane: string, row: Record<string, unknown> | null | undefined): StageReading {
  const authority = laneAuthority(lane);
  const laneKey = text(lane) as Lane;
  const readings: StageReading['readings'] = [];
  const unmapped: StageReading['unmapped_values'] = [];

  for (const column of authority?.columns || []) {
    const raw = text(row?.[column]);
    if (!raw) continue;
    const canonical = mapLegacyStage(laneKey, column, raw);
    if (!canonical) { unmapped.push({ column, raw }); continue; }
    readings.push({
      column, raw, canonical,
      order: stageDefinition(laneKey, canonical)?.order ?? null,
    });
  }

  if (!readings.length) {
    return {
      lane: laneKey, stage: null, order: null, terminal: false, semantics: null,
      // An unmapped value is a known unknown; no value at all is also unknown.
      confidence: 'UNKNOWN', readings, unmapped_values: unmapped, conflicted: false,
    };
  }

  const distinct = new Set(readings.map((entry) => entry.canonical));
  // Least-advanced wins. A null order sorts as Infinity so an unordered stage
  // never silently becomes the winner.
  const weakest = readings.reduce((low, entry) =>
    (entry.order ?? Number.POSITIVE_INFINITY) < (low.order ?? Number.POSITIVE_INFINITY) ? entry : low);
  const definition = stageDefinition(laneKey, weakest.canonical!);
  const conflicted = distinct.size > 1;

  return {
    lane: laneKey,
    stage: weakest.canonical,
    order: definition?.order ?? null,
    terminal: definition?.terminal === true,
    semantics: definition?.semantics ?? null,
    // A single agreed column is OBSERVED. Several agreeing is still OBSERVED.
    // Any disagreement is CONFLICTED — never quietly resolved to one side.
    confidence: conflicted ? 'CONFLICTED' : (unmapped.length ? 'DERIVED' : 'OBSERVED'),
    readings,
    unmapped_values: unmapped,
    conflicted,
  };
}

/** Direction of a move, derived from stage order rather than asserted. */
export function transitionDirection(lane: string, from: string | null, to: string): 'FORWARD' | 'BACKWARD' | 'LATERAL' | 'TERMINAL' {
  const target = stageDefinition(lane, to);
  if (target?.terminal) return 'TERMINAL';
  if (!from) return 'FORWARD';
  const source = stageDefinition(lane, from);
  if (!source || !target) return 'LATERAL';
  if (target.order > source.order) return 'FORWARD';
  if (target.order < source.order) return 'BACKWARD';
  return 'LATERAL';
}

export type TransitionCheck = {
  allowed: boolean;
  blockers: string[];
  direction: ReturnType<typeof transitionDirection>;
  requires_reason: boolean;
  requires_source_event: boolean;
};

/**
 * Validates a proposed transition against the registry.
 *
 * The two rules worth stating:
 *
 *  - A stage that declares `allowed_source_events` may NOT be reached
 *    automatically without one of them. A model saying a lead sounds interested
 *    is not an observed reply.
 *  - A terminal loss stage requires a reason code. A lost deal with no reason is
 *    not auditable, and "we lost it" without why teaches nothing.
 */
export function checkTransition(input: {
  lane: string;
  from: string | null;
  to: string;
  automatic: boolean;
  source_event_type?: string | null;
  reason_code?: string | null;
}): TransitionCheck {
  const blockers: string[] = [];
  const target = stageDefinition(input.lane, input.to);
  const direction = transitionDirection(input.lane, input.from, input.to);

  if (!LANES.includes(text(input.lane) as Lane)) blockers.push('unknown_lane');
  if (!target) blockers.push('unknown_target_stage');
  if (input.from && !stageDefinition(input.lane, input.from)) blockers.push('unknown_source_stage');

  const authority = laneAuthority(input.lane);
  if (authority?.projection_only) {
    // MERCHANT_LIFECYCLE projects DealActivation. Writing a stage here would
    // create a second authority for something that already has a guarded one.
    blockers.push('lane_is_projection_only');
  }

  const requiresReason = (target?.required_fields || []).includes('reason_code');
  if (requiresReason && !text(input.reason_code)) blockers.push('reason_code_required');

  const allowedEvents = target?.allowed_source_events || [];
  const requiresSourceEvent = allowedEvents.length > 0;
  if (requiresSourceEvent && input.automatic) {
    const provided = text(input.source_event_type);
    if (!provided) blockers.push('automatic_transition_requires_source_event');
    else if (!allowedEvents.includes(provided)) blockers.push(`source_event_not_allowed_for_stage:${provided}`);
  }

  return {
    allowed: blockers.length === 0,
    blockers,
    direction,
    requires_reason: requiresReason,
    requires_source_event: requiresSourceEvent,
  };
}

/** The retired authority, exposed so callers can refuse it explicitly. */
export const RETIRED_AUTHORITY = Object.freeze({
  entity: (registry as any).retired_authority?.entity,
  state: (registry as any).retired_authority?.state,
  rule: (registry as any).retired_authority?.rule,
});

export function isRetiredAuthority(entity: unknown): boolean {
  return text(entity) === RETIRED_AUTHORITY.entity;
}
