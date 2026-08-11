// P4 repository-native statistical benchmark policy.
// Merchant pseudonyms are used only for distinct-count/deduplication and are
// never returned from this module. Public/retained outputs require k >= 10.

export const P4_BENCHMARK_POLICY_VERSION = 'p4-benchmark-policy-1.0.0';
export const P4_MIN_DISTINCT_MERCHANTS = 10;
export const P4_OUTLIER_POLICY = 'tukey-iqr-1.5-v1';

export function percentile(sortedValues: number[], q: number): number | null {
  if (!sortedValues.length) return null;
  const position = (sortedValues.length - 1) * q;
  const lower = Math.floor(position);
  const fraction = position - lower;
  return sortedValues[lower + 1] === undefined
    ? sortedValues[lower]
    : sortedValues[lower] + fraction * (sortedValues[lower + 1] - sortedValues[lower]);
}

function timestamp(row: any): number {
  const value = Date.parse(row?.known_at || row?.created_date || row?.updated_date || row?.month || '1970-01-01');
  return Number.isFinite(value) ? value : 0;
}

function preferredMerchantObservation(rows: any[]): any | null {
  const verified = rows.filter(row => row?.contribution_source === 'verified');
  const eligible = verified.length ? verified : rows;
  return [...eligible].sort((a, b) => timestamp(b) - timestamp(a)
    || String(a?.contribution_hash || '').localeCompare(String(b?.contribution_hash || '')))[0] || null;
}

export function benchmarkGroupKey(row: any): string {
  return [row?.cohort_key, row?.metric_key, row?.month].map(value => String(value || '')).join('::');
}

export function groupBenchmarkContributions(rows: any[]): Map<string, any[]> {
  const groups = new Map<string, any[]>();
  for (const row of rows || []) {
    if (!row?.validated || row?.flagged || !row?.cohort_key || !row?.metric_key || !row?.month) continue;
    const key = benchmarkGroupKey(row);
    groups.set(key, [...(groups.get(key) || []), row]);
  }
  return groups;
}

export function deriveBenchmarkCohort(rows: any[], options: { minimumDistinctMerchants?: number } = {}) {
  const minimum = options.minimumDistinctMerchants ?? P4_MIN_DISTINCT_MERCHANTS;
  const byMerchant = new Map<string, any[]>();
  for (const row of rows || []) {
    if (!row?.validated || row?.flagged) continue;
    const merchant = String(row?.source_anon_id || '');
    const value = Number(row?.metric_value);
    if (!merchant || !Number.isFinite(value)) continue;
    byMerchant.set(merchant, [...(byMerchant.get(merchant) || []), row]);
  }

  const selected = [...byMerchant.values()].map(preferredMerchantObservation).filter(Boolean);
  const rawValues = selected.map(row => Number(row.metric_value)).sort((a, b) => a - b);
  const rawDistinctMerchants = rawValues.length;
  const q1 = percentile(rawValues, .25);
  const q3 = percentile(rawValues, .75);
  const iqr = q1 == null || q3 == null ? 0 : q3 - q1;
  const lower = iqr > 0 ? q1 - 1.5 * iqr : -Infinity;
  const upper = iqr > 0 ? q3 + 1.5 * iqr : Infinity;
  const values = rawValues.filter(value => value >= lower && value <= upper);
  const excludedOutliers = rawValues.length - values.length;
  const sampleSize = values.length;
  const sufficient = sampleSize >= minimum;
  const sourceCounts = selected.reduce((counts: Record<string, number>, row: any) => {
    const key = String(row?.contribution_source || 'estimated');
    counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {});

  return {
    status: sufficient ? 'AVAILABLE' : 'INSUFFICIENT_DATA',
    isPublic: sufficient,
    sampleSize,
    rawDistinctMerchants,
    minimumDistinctMerchants: minimum,
    insufficientDataReason: sufficient ? null : 'MINIMUM_DISTINCT_MERCHANT_THRESHOLD_NOT_MET',
    median: sufficient ? percentile(values, .5) : null,
    p25: sufficient ? percentile(values, .25) : null,
    p75: sufficient ? percentile(values, .75) : null,
    p10: sufficient ? percentile(values, .1) : null,
    average: sufficient ? values.reduce((sum, value) => sum + value, 0) / values.length : null,
    sourceCounts,
    excludedOutliers,
    outlierPolicy: P4_OUTLIER_POLICY,
    derivationVersion: P4_BENCHMARK_POLICY_VERSION,
    confidence: !sufficient ? 'INSUFFICIENT' : sampleSize >= 40 ? 'HIGH' : sampleSize >= 20 ? 'MEDIUM' : 'LOW',
  };
}
