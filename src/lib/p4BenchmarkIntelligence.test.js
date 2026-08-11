import { describe, expect, it } from 'vitest';
import { P4_BENCHMARK_POLICY_VERSION, P4_MIN_DISTINCT_MERCHANTS, benchmarkGroupKey, deriveBenchmarkCohort, groupBenchmarkContributions } from '../../base44/shared/p4BenchmarkIntelligence.ts';

const row = (merchant, value, extra = {}) => ({ source_anon_id: merchant, metric_value: value, cohort_key: 'small|FR|payments', metric_key: 'payment_effective_rate', month: '2026-08', validated: true, flagged: false, contribution_hash: `${merchant}:${value}`, contribution_source: 'verified', ...extra });

describe('P4 statistical benchmark intelligence', () => {
  it('enforces k=10 distinct merchants and withholds statistics below the threshold', () => {
    expect(P4_MIN_DISTINCT_MERCHANTS).toBe(10);
    const result = deriveBenchmarkCohort(Array.from({ length: 9 }, (_, index) => row(`m${index}`, 100 + index)));
    expect(result).toMatchObject({ status: 'INSUFFICIENT_DATA', isPublic: false, sampleSize: 9, median: null, p25: null, p75: null });
  });

  it('derives deterministic percentiles and versioned provenance for a sufficient cohort', () => {
    const rows = Array.from({ length: 10 }, (_, index) => row(`m${index}`, (index + 1) * 10));
    const a = deriveBenchmarkCohort(rows);
    const b = deriveBenchmarkCohort([...rows].reverse());
    expect(a).toEqual(b);
    expect(a).toMatchObject({ status: 'AVAILABLE', isPublic: true, sampleSize: 10, median: 55, p25: 32.5, p75: 77.5, derivationVersion: P4_BENCHMARK_POLICY_VERSION });
  });

  it('counts one observation per merchant and prefers verified evidence', () => {
    const rows = Array.from({ length: 10 }, (_, index) => row(`m${index}`, 100 + index));
    rows.push(row('m0', 999, { contribution_source: 'estimated', created_date: '2026-08-12' }));
    const result = deriveBenchmarkCohort(rows);
    expect(result.sampleSize).toBe(10);
    expect(result.sourceCounts).toEqual({ verified: 10 });
  });

  it('segments cohorts deterministically instead of mixing markets', () => {
    const fr = row('fr', 100);
    const es = row('es', 200, { cohort_key: 'small|ES|payments' });
    const groups = groupBenchmarkContributions([fr, es]);
    expect(groups.size).toBe(2);
    expect(benchmarkGroupKey(fr)).not.toBe(benchmarkGroupKey(es));
  });

  it('applies deterministic outlier handling and never returns merchant identifiers', () => {
    const rows = Array.from({ length: 10 }, (_, index) => row(`m${index}`, 100 + index));
    rows.push(row('outlier', 10_000));
    const result = deriveBenchmarkCohort(rows);
    expect(result.excludedOutliers).toBe(1);
    expect(JSON.stringify(result)).not.toMatch(/source_anon_id|merchant_id|brand_id|m0/);
  });
});
