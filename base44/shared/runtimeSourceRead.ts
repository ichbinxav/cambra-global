export const RUNTIME_SOURCE_READ_VERSION = 'runtime-source-read-1.0.0';

export type RuntimeSourceStatus = 'COMPLETE' | 'INCOMPLETE' | 'UNAVAILABLE';

export type RuntimeSourceResult<T> = {
  ok: boolean;
  status: RuntimeSourceStatus;
  value: T;
  source: string;
  records_read: number | null;
  truncated: boolean;
  blockers: string[];
  error_code: string | null;
};

const text = (value: unknown, limit = 180) =>
  String(value ?? '').replace(/[\r\n\t]+/g, ' ').trim().slice(0, limit);

function errorCode(error: any, source: string) {
  return text(error?.code || error?.message || `${source}_unavailable`) ||
    `${source}_unavailable`;
}

/**
 * Read a bounded runtime source without turning failure into an observed zero.
 * Read-only projections may use `value`, but must propagate status/blockers.
 */
export async function readRuntimeSource<T>(input: {
  source: string;
  read: () => Promise<T>;
  fallback: T;
  validate?: (value: T) => boolean;
  records?: (value: T) => number | null;
  limit?: number;
}): Promise<RuntimeSourceResult<T>> {
  const source = text(input.source, 120) || 'runtime_source';
  try {
    const value = await input.read();
    if (input.validate && !input.validate(value)) {
      throw Object.assign(new Error(`${source}_invalid_shape`), {
        code: `${source}_invalid_shape`,
      });
    }
    const records = input.records
      ? input.records(value)
      : Array.isArray(value) ? value.length : null;
    const truncated = Number.isInteger(input.limit) && input.limit! > 0 &&
      Number(records) >= Number(input.limit);
    return {
      ok: true,
      status: truncated ? 'INCOMPLETE' : 'COMPLETE',
      value,
      source,
      records_read: records,
      truncated,
      blockers: truncated ? [`${source}_coverage_truncated`] : [],
      error_code: null,
    };
  } catch (error: any) {
    const code = errorCode(error, source);
    console.error(JSON.stringify({
      level: 'error',
      event: 'runtime_source_unavailable',
      source,
      error_code: code,
      version: RUNTIME_SOURCE_READ_VERSION,
    }));
    return {
      ok: false,
      status: 'UNAVAILABLE',
      value: input.fallback,
      source,
      records_read: null,
      truncated: false,
      blockers: [`${source}_unavailable`],
      error_code: code,
    };
  }
}

export async function readRuntimeRows(input: {
  source: string;
  read: () => Promise<any>;
  limit?: number;
}) {
  return readRuntimeSource<any[]>({
    ...input,
    fallback: [],
    validate: Array.isArray,
    records: (rows) => rows.length,
  });
}

/** Action/authority callers must not continue from a fallback projection. */
export function requireRuntimeSource<T>(result: RuntimeSourceResult<T>) {
  if (!result.ok || result.status !== 'COMPLETE') {
    const error: any = new Error(result.blockers[0] || `${result.source}_unavailable`);
    error.code = result.blockers[0] || `${result.source}_unavailable`;
    error.status = 503;
    error.source_status = result.status;
    error.source_blockers = result.blockers;
    throw error;
  }
  return result.value;
}

export function runtimeSourceCoverage(
  results: Record<string, RuntimeSourceResult<any>>,
) {
  const sources = Object.fromEntries(Object.entries(results).map(([key, row]) => [key, {
    status: row.status,
    records_read: row.records_read,
    truncated: row.truncated,
    blockers: row.blockers,
    error_code: row.error_code,
  }]));
  const values = Object.values(results);
  const status: RuntimeSourceStatus = values.some((row) => row.status === 'UNAVAILABLE')
    ? 'UNAVAILABLE'
    : values.some((row) => row.status === 'INCOMPLETE')
    ? 'INCOMPLETE'
    : 'COMPLETE';
  return {
    status,
    complete: status === 'COMPLETE',
    blockers: [...new Set(values.flatMap((row) => row.blockers))],
    sources,
    version: RUNTIME_SOURCE_READ_VERSION,
  };
}

/**
 * COMMAND-C3 (2026-08-17) — projects a read result into the epistemic vocabulary
 * CAMBRA Command uses for its own claims (`RECEIPT_STATES` in
 * commandReceiptLedger.ts).
 *
 * This is the ONE place that bridge is allowed to happen, and it is deliberately
 * one-way and demote-only:
 *
 *   COMPLETE   -> OBSERVED         the read happened and returned everything
 *   INCOMPLETE -> DERIVED          real rows, but a truncated view; totals from
 *                                  it are lower bounds, not observations
 *   UNAVAILABLE-> UNKNOWN          nothing was read; not zero, not empty
 *
 * The repo already carries eight competing epistemic vocabularies. This function
 * exists so C3 does not add a ninth: everything Command asserts is projected
 * into the single closed set, and nothing is ever projected back out.
 *
 * It can never return a state stronger than the read supports, which is what
 * makes it safe to call from an assertion path.
 */
export function epistemicStateForRead(result: {
  status?: RuntimeSourceStatus;
  records_read?: number | null;
} | null | undefined): 'OBSERVED' | 'DERIVED' | 'UNKNOWN' {
  const status = result?.status;
  if (status === 'COMPLETE') return 'OBSERVED';
  if (status === 'INCOMPLETE') return 'DERIVED';
  // Anything else — UNAVAILABLE, absent, or a shape we do not recognise — is
  // UNKNOWN. An unrecognised status must never be optimistically upgraded.
  return 'UNKNOWN';
}

/**
 * Folds several read results into the single weakest state, so a claim built
 * from many sources can never be stronger than its weakest input.
 */
export function epistemicStateForReads(results: Array<{
  status?: RuntimeSourceStatus;
  records_read?: number | null;
} | null | undefined>): 'OBSERVED' | 'DERIVED' | 'UNKNOWN' {
  const rows = Array.isArray(results) ? results : [];
  // No inputs at all cannot be an observation of anything.
  if (!rows.length) return 'UNKNOWN';
  const states = rows.map(epistemicStateForRead);
  if (states.includes('UNKNOWN')) return 'UNKNOWN';
  if (states.includes('DERIVED')) return 'DERIVED';
  return 'OBSERVED';
}
