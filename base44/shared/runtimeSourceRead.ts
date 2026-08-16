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
