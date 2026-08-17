// DASHBOARD-C1 (2026-08-17) — the Operating Workspace envelope contract.
//
// Extracted from the shape AdminMerchants + getFounderControlCenter already use
// (src/pages/admin/AdminMerchants.jsx:118-124), rather than designed from
// scratch. That page is the founder-approved reference and it already solves the
// hard parts: one server function, a view+action discriminator, and zero
// base44.entities calls in the browser.
//
// What this module adds is the part Merchants does inline and the other four
// workspaces must not each reinvent: a declared envelope with source health,
// truth classes and freshness, plus the fail-closed helpers that keep an unread
// source from being rendered as a zero.
//
// It deliberately does NOT wrap readRuntimeSource. That module already decides
// "did the read happen" honestly (COMPLETE / INCOMPLETE / UNAVAILABLE, with
// records_read null on failure) and is the only place in the repo where that
// question is answered truthfully. This builds on it.

import { epistemicStateForReads, type RuntimeSourceResult, type RuntimeSourceStatus } from './runtimeSourceRead.ts';

export const WORKSPACE_CONTRACT_VERSION = 'workspace-contract-1.0.0';

const text = (value: unknown) => String(value ?? '').trim();

export const WORKSPACES = Object.freeze([
  'pipeline', 'audits', 'recover', 'finance', 'intelligence',
] as const);
export type Workspace = typeof WORKSPACES[number];

/**
 * Truth classes (prompt section 4.4). A material figure must keep one, and these
 * must never be collapsed into each other.
 */
export const TRUTH_CLASSES = Object.freeze([
  'OBSERVED', 'DERIVED', 'MODELED', 'INFERRED',
  'CONTRACTUAL', 'VERIFIED', 'UNVERIFIED', 'CONFLICTED', 'UNKNOWN',
] as const);
export type TruthClass = typeof TRUTH_CLASSES[number];

/** Source health as a workspace reports it (prompt section 5.12). */
export const SOURCE_STATES = Object.freeze([
  'OBSERVED', 'PARTIAL', 'STALE', 'UNAVAILABLE', 'ERROR',
] as const);
export type SourceState = typeof SOURCE_STATES[number];

/** Projects a runtime read status into the source state a workspace displays. */
export function sourceStateForRead(status: RuntimeSourceStatus | undefined): SourceState {
  if (status === 'COMPLETE') return 'OBSERVED';
  if (status === 'INCOMPLETE') return 'PARTIAL';
  if (status === 'UNAVAILABLE') return 'UNAVAILABLE';
  // An unrecognised status is never optimistically upgraded.
  return 'ERROR';
}

export type SourceHealthRow = {
  source: string;
  state: SourceState;
  records_read: number | null;
  truncated: boolean;
  blockers: string[];
};

/**
 * Folds a map of runtime reads into the source_health array every workspace
 * response carries.
 *
 * `records_read` is passed through unchanged, including its null on failure —
 * that null is the cleanest discriminator between "genuinely empty" and "could
 * not read", and flattening it to 0 is the defect this whole contract exists to
 * prevent.
 */
export function buildSourceHealth(reads: Record<string, RuntimeSourceResult<unknown>>): SourceHealthRow[] {
  return Object.entries(reads || {}).map(([source, result]) => ({
    source,
    state: sourceStateForRead(result?.status),
    records_read: result?.records_read ?? null,
    truncated: result?.truncated === true,
    blockers: [...(result?.blockers || [])],
  })).sort((left, right) => left.source.localeCompare(right.source));
}

/**
 * A KPI as the contract requires it (prompt section 5.3).
 *
 * `value` is `null` when unproven. There is no zero fallback: a KPI whose source
 * did not load reports null with `truth_class: 'UNKNOWN'` and names the missing
 * sources, and the renderer must show an em dash.
 */
export type WorkspaceKpi = {
  metric_key: string;
  label: string;
  value: number | null;
  unit: string;
  numerator?: number | null;
  denominator?: number | null;
  truth_class: TruthClass;
  state: SourceState;
  unavailable_sources: string[];
  comparison_period?: string | null;
  claim_boundary?: string | null;
  formula_version?: string | null;
};

/**
 * Builds a KPI, refusing to attach a truth class to a value whose sources did
 * not load.
 *
 * `extra` is spread FIRST so the authoritative fields below always win. Spreading
 * it last would let a caller's key silently overwrite the verdict — a mistake
 * already made once in this repo's campaign preflight and caught by a test.
 */
export function kpi(input: {
  metric_key: string;
  label: string;
  value: number | null;
  unit: string;
  truth_class: TruthClass;
  sources: string[];
  health: SourceHealthRow[];
  extra?: Record<string, unknown>;
}): WorkspaceKpi {
  const byName = new Map(input.health.map((row) => [row.source, row]));
  const missing = input.sources.filter((source) => {
    const row = byName.get(source);
    return !row || row.state === 'UNAVAILABLE' || row.state === 'ERROR';
  });
  const partial = input.sources.filter((source) => byName.get(source)?.state === 'PARTIAL');

  if (missing.length) {
    return {
      ...(input.extra || {}),
      metric_key: input.metric_key,
      label: input.label,
      value: null,
      unit: input.unit,
      truth_class: 'UNKNOWN',
      state: 'UNAVAILABLE',
      unavailable_sources: missing,
    } as WorkspaceKpi;
  }
  return {
    ...(input.extra || {}),
    metric_key: input.metric_key,
    label: input.label,
    value: input.value,
    unit: input.unit,
    // A truncated source yields a lower bound, so the class is demoted to
    // DERIVED rather than left as an observation.
    truth_class: partial.length && input.truth_class === 'OBSERVED' ? 'DERIVED' : input.truth_class,
    state: partial.length ? 'PARTIAL' : 'OBSERVED',
    unavailable_sources: [],
  } as WorkspaceKpi;
}

export type WorkspaceContext = {
  context_id: string;
  workspace: Workspace;
  scope: string;
  filters: Record<string, unknown>;
  sort: string | null;
  view: string | null;
  reconstructed_at: string;
  data_complete: boolean;
  degraded_sources: string[];
  epistemic_state: 'OBSERVED' | 'DERIVED' | 'UNKNOWN';
  truth_boundary: string;
  contract_version: string;
};

export const TRUTH_BOUNDARY =
  'Observed, modeled, contractual and verified values remain distinct. Missing evidence remains unknown.';

/** Assembles the context envelope every workspace response carries. */
export function buildContext(input: {
  workspace: Workspace;
  scope?: string;
  filters?: Record<string, unknown>;
  sort?: string | null;
  view?: string | null;
  now: string;
  reads: Record<string, RuntimeSourceResult<unknown>>;
  contextId: string;
}): { context: WorkspaceContext; source_health: SourceHealthRow[] } {
  const health = buildSourceHealth(input.reads);
  const degraded = health
    .filter((row) => row.state !== 'OBSERVED')
    .map((row) => row.source);
  return {
    context: {
      context_id: input.contextId,
      workspace: input.workspace,
      scope: text(input.scope) || 'all',
      filters: input.filters || {},
      sort: input.sort ?? null,
      view: input.view ?? null,
      reconstructed_at: input.now,
      data_complete: degraded.length === 0,
      degraded_sources: degraded,
      epistemic_state: epistemicStateForReads(Object.values(input.reads || {})),
      truth_boundary: TRUTH_BOUNDARY,
      contract_version: WORKSPACE_CONTRACT_VERSION,
    },
    source_health: health,
  };
}

/**
 * The full portfolio response shape (prompt section 15.1).
 *
 * Declared as a builder rather than a bare type so a workspace cannot ship a
 * response missing source_health or the truth boundary — the two fields that make
 * the rest of it trustworthy.
 */
export function portfolioResponse(input: {
  context: WorkspaceContext;
  source_health: SourceHealthRow[];
  kpis: WorkspaceKpi[];
  quick_views?: Array<{ key: string; label: string; count: number | null }>;
  filter_options?: Record<string, unknown>;
  saved_views?: unknown[];
  rows?: unknown[];
  total?: number | null;
  next_cursor?: string | null;
  permissions?: Record<string, boolean>;
  available_actions?: string[];
}) {
  return {
    ok: true as const,
    context: input.context,
    source_health: input.source_health,
    kpis: input.kpis,
    quick_views: input.quick_views || [],
    filter_options: input.filter_options || {},
    saved_views: input.saved_views || [],
    items: {
      rows: input.rows || [],
      // A total we could not compute is null, never 0.
      total: input.total ?? null,
      next_cursor: input.next_cursor ?? null,
    },
    permissions: input.permissions || {},
    available_actions: input.available_actions || [],
    // Stated on every workspace response so no surface can imply it sent something.
    external_send_performed: false,
  };
}

/**
 * Sorts a list keeping unknown values LAST regardless of direction
 * (prompt section 5.5).
 *
 * A null sorted as if it were zero is how an unread merchant ends up looking like
 * the cheapest one.
 */
export function sortKeepingUnknownLast<T>(
  rows: T[],
  value: (row: T) => number | string | null | undefined,
  direction: 'asc' | 'desc' = 'desc',
): T[] {
  const known: T[] = [];
  const unknown: T[] = [];
  for (const row of rows || []) {
    const candidate = value(row);
    if (candidate === null || candidate === undefined || candidate === '') unknown.push(row);
    else known.push(row);
  }
  known.sort((left, right) => {
    const a = value(left) as any;
    const b = value(right) as any;
    if (typeof a === 'string' || typeof b === 'string') {
      return direction === 'asc' ? String(a).localeCompare(String(b)) : String(b).localeCompare(String(a));
    }
    return direction === 'asc' ? Number(a) - Number(b) : Number(b) - Number(a);
  });
  return [...known, ...unknown];
}
