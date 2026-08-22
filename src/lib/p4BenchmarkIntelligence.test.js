import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { P4_BENCHMARK_POLICY_VERSION, P4_MAX_MERCHANT_WEIGHT, P4_MIN_DISTINCT_MERCHANTS, P4_MIN_PUBLISHABLE_DISTINCT_MERCHANTS, benchmarkGroupKey, deriveBenchmarkCohort, groupBenchmarkContributions, isP4PublishableObservedCohort, selectSyntheticBenchmarkSeedTarget } from '../../base44/shared/p4BenchmarkIntelligence.ts';

const read = (relativePath) => fs.readFileSync(new URL(`../../${relativePath}`, import.meta.url), 'utf8');
const row = (merchant, value, extra = {}) => ({ source_anon_id: merchant, metric_value: value, cohort_key: 'small|FR|payments', metric_key: 'payment_effective_rate', month: '2026-08', source_population: 'inbound', validated: true, flagged: false, contribution_hash: `${merchant}:${value}`, contribution_source: 'verified', ...extra });

describe('P4 statistical benchmark intelligence', () => {
  it('enforces k=10 distinct merchants and withholds statistics below the threshold', () => {
    expect(P4_MIN_DISTINCT_MERCHANTS).toBe(10);
    const result = deriveBenchmarkCohort(Array.from({ length: 9 }, (_, index) => row(`m${index}`, 100 + index)));
    expect(result).toMatchObject({ status: 'INSUFFICIENT_DATA', publicationStatus: 'ABSTAIN', isPublic: false, statisticsAvailable: false, sampleSize: 9, median: null, p25: null, p75: null });
    expect(deriveBenchmarkCohort(Array.from({ length: 9 }, (_, index) => row(`m${index}`, 100 + index)), { minimumDistinctMerchants: 5 }).isPublic).toBe(false);
  });

  it('keeps 10-19 internal INDICATIVE and publishes only from 20 merchants', () => {
    const rows = Array.from({ length: 10 }, (_, index) => row(`m${index}`, (index + 1) * 10));
    const a = deriveBenchmarkCohort(rows);
    const b = deriveBenchmarkCohort([...rows].reverse());
    expect(a).toEqual(b);
    expect(a).toMatchObject({ status: 'AVAILABLE', publicationStatus: 'INDICATIVE', isPublic: false, statisticsAvailable: true, sampleSize: 10, median: 55, p25: 32.5, p75: 77.5, maxMerchantWeight: 0.1, derivationVersion: P4_BENCHMARK_POLICY_VERSION });
    const publishable = deriveBenchmarkCohort(Array.from({ length: 20 }, (_, index) => row(`p${index}`, 100 + index)));
    expect(P4_MIN_PUBLISHABLE_DISTINCT_MERCHANTS).toBe(20);
    expect(P4_MAX_MERCHANT_WEIGHT).toBe(0.2);
    expect(publishable).toMatchObject({ publicationStatus: 'PUBLISHABLE', isPublic: true, sampleSize: 20, maxMerchantWeight: 0.05, merchantWeightCompliant: true });
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
    const outbound = row('outbound', 300, { source_population: 'outbound' });
    const groups = groupBenchmarkContributions([fr, es, outbound]);
    expect(groups.size).toBe(3);
    expect(benchmarkGroupKey(fr)).not.toBe(benchmarkGroupKey(es));
    expect(benchmarkGroupKey(fr)).not.toBe(benchmarkGroupKey(outbound));
    expect(groupBenchmarkContributions([row('missing', 100, { source_population: undefined })]).size).toBe(0);
  });

  it('applies deterministic outlier handling and never returns merchant identifiers', () => {
    const rows = Array.from({ length: 10 }, (_, index) => row(`m${index}`, 100 + index));
    rows.push(row('outlier', 10_000));
    const result = deriveBenchmarkCohort(rows);
    expect(result.excludedOutliers).toBe(1);
    expect(JSON.stringify(result)).not.toMatch(/source_anon_id|merchant_id|brand_id|m0/);
  });

  it('wires source population and observed-only publication through every P4 writer', () => {
    const contribution = JSON.parse(read('base44/entities/BenchmarkContribution.jsonc'));
    const cohort = JSON.parse(read('base44/entities/BenchmarkCohort.jsonc'));
    expect(contribution.properties.source_population.enum).toEqual(['inbound', 'outbound']);
    expect(cohort.properties.publication_status.enum).toEqual(['ABSTAIN', 'INDICATIVE', 'PUBLISHABLE']);
    expect(cohort.properties.max_merchant_weight.maximum).toBe(0.2);
    expect(cohort.properties.data_origin.enum).toEqual(['observed_contributions', 'synthetic_seed']);

    const learning = read('base44/functions/benchmarkLearningEngine/entry.ts');
    expect(learning).toContain('source_population_required');
    expect(learning).toContain('contribution_source + source_population');
    const discovery = read('base44/functions/runContinuousDiscovery/entry.ts');
    expect(discovery).toMatch(/benchmarkLearningEngine[\s\S]*source_population:\s*['"]outbound['"]/);

    const recompute = read('base44/functions/scheduledBenchmarkRecompute/entry.ts');
    expect(recompute).toContain('data_origin: "observed_contributions"');
    expect(recompute).toContain('publication_status: derived.publicationStatus');
    expect(recompute).toContain('{ cohort_key, metric_key, month, source_population }');
  });

  it('never publishes synthetic benchmark seeds as observed network data', () => {
    const seed = read('base44/functions/seedBenchmarkCohorts/entry.ts');
    expect(seed).toContain('data_origin: "synthetic_seed"');
    expect(seed).toContain('is_public: false');
    expect(seed).toContain('publication_status: "ABSTAIN"');
    const report = read('base44/functions/getBenchmarkForReport/entry.ts');
    expect(report).toContain('data_origin: "observed_contributions"');
    expect(report).toContain('publication_status: "PUBLISHABLE"');
  });

  it('fails closed for malformed rows even when they claim to be public', () => {
    const valid = {
      n: 20,
      source_population: 'inbound',
      data_origin: 'observed_contributions',
      publication_status: 'PUBLISHABLE',
      is_public: true,
      weighting_policy: 'EQUAL_ONE_VOTE_PER_DISTINCT_MERCHANT',
      max_merchant_weight: 0.05,
      derivation_status: 'AVAILABLE',
      p25: 1.1,
      median: 1.2,
      p75: 1.3,
    };
    expect(isP4PublishableObservedCohort(valid)).toBe(true);
    for (const patch of [
      { max_merchant_weight: 0 },
      { max_merchant_weight: 0.01 },
      { weighting_policy: undefined },
      { derivation_status: 'INSUFFICIENT_DATA' },
      { median: null },
      { p25: 1.4 },
    ]) expect(isP4PublishableObservedCohort({ ...valid, ...patch })).toBe(false);
    const report = read('base44/functions/getBenchmarkForReport/entry.ts');
    expect(report).toContain('isP4PublishableObservedCohort(cohorts[0])');
  });

  it('migrates a legacy synthetic seed tuple instead of creating a duplicate', () => {
    const fingerprint = { engine_version: '1.0.0', benchmark_version: '1.0.0', source_population: 'inbound' };
    const legacy = { id: 'legacy', cohort_key: 'small|France|payments', metric_key: 'payment_effective_rate', month: '2026-06', engine_version: '1.0.0', benchmark_version: '1.0.0' };
    const observed = { id: 'observed', source_population: 'inbound', data_origin: 'observed_contributions' };
    const unknownLegacy = { ...legacy, id: 'unknown', engine_version: 'different' };
    expect(selectSyntheticBenchmarkSeedTarget([], [legacy], fingerprint)).toBe(legacy);
    expect(selectSyntheticBenchmarkSeedTarget([observed], [observed, legacy], fingerprint)).toBe(legacy);
    expect(selectSyntheticBenchmarkSeedTarget([], [unknownLegacy], fingerprint)).toBeNull();
    const seed = read('base44/functions/seedBenchmarkCohorts/entry.ts');
    expect(seed).toContain('.filter({ cohort_key: row.cohort_key, metric_key: row.metric_key, month: row.month })');
    expect(seed).toContain('seedFingerprint');
    expect(seed).toContain('legacyRows,\n          seedFingerprint');
    expect(seed).toContain('BenchmarkCohort.update(existing.id, row)');
    expect(seed).toContain('else if (legacyRows.length > 0)');
    expect(seed).toContain('skipped_conflicting_legacy++');
  });
});
