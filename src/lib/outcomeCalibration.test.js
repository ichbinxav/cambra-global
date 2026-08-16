import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { buildOutcomeCalibration, buildPrivacySafeOutcomeCalibration, MIN_OUTCOME_CALIBRATION_COHORT } from '../../base44/shared/outcomeCalibration.ts';

const row=(n,extra={})=>({id:`secret-${n}`,tenant_scope:'tenant',brand_id:`merchant-${n}`,related_entity_id:`case-${n}`,currency:'EUR',realized_savings:n*10,confidence_after:.8,success:n%4!==0,negative_knowledge:n%4===0,is_demo:false,...extra});
const coverage={status:'COMPLETE',coverage_complete:true,source_entity:'AnonymizedIntelligenceAggregate',snapshot_at:'2026-08-15T00:00:00.000Z',records_read:1,pages_fetched:1,page_size:1000};
const retained=(extra={})=>({
  aggregate_key:'outcome:payments::stripe::2026-Q3::EUR@2026-08-10T00:00:00.000Z',
  aggregate_series_key:'outcome:payments::stripe::2026-Q3::EUR',
  aggregate_snapshot_version:'privacy-safe-intelligence-1.3.0@2026-08-10T00:00:00.000Z',
  aggregate_type:'verified_outcomes',vertical:'payments',provider_bucket:'stripe',currency_bucket:'EUR',period:'2026-Q3',sample_size:10,reidentification_mapping_retained:false,last_verified_at:'2026-08-10T00:00:00.000Z',
  metrics_json:{kind:'verified_outcomes',aggregate_snapshot_version:'privacy-safe-intelligence-1.3.0@2026-08-10T00:00:00.000Z',vertical:'payments',provider_bucket:'stripe',currency:'EUR',period:'2026-Q3',sample_size:10,median_realized_savings:1000,mean_expected_savings:1200,success_rate_pct:80,observation_selection:'latest_declared_observation_per_distinct_merchant_cohort',distinct_merchant_denominators:true,financial_values_converted:false,financial_value_unit:'native_currency:EUR',generated_at:'2026-08-10T00:00:00.000Z',source_coverage:{status:'COMPLETE',coverage_complete:true,aggregate_input_complete:true,source_entity:'IntelligenceOutcome',snapshot_at:'2026-08-10T00:00:00.000Z',records_read:10,eligible_records:10,pages_fetched:1}},
  ...extra,
});

describe('cross-engine outcome calibration',()=>{
  it('suppresses cohorts below k=10 and returns no row identifiers',()=>{
    const result=buildOutcomeCalibration(Array.from({length:MIN_OUTCOME_CALIBRATION_COHORT-1},(_,i)=>row(i+1)),{currency:'EUR'});
    expect(result.suppressed).toBe(true);
    expect(result.aggregate).toBeNull();
    expect(JSON.stringify(result)).not.toMatch(/secret-|merchant-|case-/);
  });

  it('returns only bounded aggregate signals for real same-currency outcomes',()=>{
    const result=buildOutcomeCalibration(Array.from({length:12},(_,i)=>row(i+1)),{currency:'EUR'});
    expect(result.suppressed).toBe(false);
    expect(result.n).toBe(12);
    expect(result.aggregate).toEqual(expect.objectContaining({currency:'EUR',median_realized_savings:65}));
    expect(result).toMatchObject({methodology_class:'DESCRIPTIVE_AGGREGATE_HEURISTIC',probabilistic_calibration:false});
    expect(JSON.stringify(result)).not.toMatch(/secret-|merchant-|case-/);
    expect(result.truth_note).toContain('not a public provider rate');
    expect(result.truth_note).toContain('not statistically or probabilistically calibrated');
  });

  it('cannot let a mixed-currency or demo row contaminate the cohort',()=>{
    const rows=[...Array.from({length:9},(_,i)=>row(i+1)),row(10,{currency:'USD'}),row(11,{is_demo:true})];
    expect(buildOutcomeCalibration(rows,{currency:'EUR'}).suppressed).toBe(true);
    expect(buildOutcomeCalibration([...Array.from({length:9},(_,i)=>row(i+1)),row(10,{currency:'USD'})]).suppression_reason).toBe('KNOWN_SINGLE_CURRENCY_COHORT_REQUIRED');
  });

  it('requires ten distinct merchants and never treats missing realized savings as zero',()=>{
    const repeated=Array.from({length:12},(_,i)=>row(i+1,{brand_id:'one-merchant'}));
    expect(buildOutcomeCalibration(repeated,{currency:'EUR'})).toMatchObject({suppressed:true,n:1});
    const missing=[...Array.from({length:9},(_,i)=>row(i+1)),row(10,{realized_savings:null})];
    expect(buildOutcomeCalibration(missing,{currency:'EUR'})).toMatchObject({suppressed:true,n:9});
    const zeroes=Array.from({length:10},(_,i)=>row(i+1,{realized_savings:0,success:undefined,negative_knowledge:undefined,confidence_after:i===0?.8:undefined}));
    expect(buildOutcomeCalibration(zeroes,{currency:'EUR'}).aggregate).toMatchObject({median_realized_savings:0,success_rate:null,negative_outcome_rate:null,median_confidence_after:null});
  });

  it('collapses repeated observations per merchant before every denominator',()=>{
    const current=Array.from({length:10},(_,i)=>row(i+1,{captured_at:'2026-08-10T00:00:00.000Z',realized_savings:100,success:true}));
    const stale=row(99,{brand_id:'merchant-1',captured_at:'2026-08-01T00:00:00.000Z',realized_savings:100000,success:false});
    expect(buildOutcomeCalibration([stale,...current],{currency:'EUR'})).toMatchObject({
      suppressed:false,
      n:10,
      observation_count:10,
      observation_selection:'latest_declared_observation_per_distinct_merchant',
      aggregate:{median_realized_savings:100,success_rate:1},
    });
    const newerUnknown=row(100,{brand_id:'merchant-1',captured_at:'2026-08-20T00:00:00.000Z',realized_savings:null});
    expect(buildOutcomeCalibration([...current,newerUnknown],{currency:'EUR'})).toMatchObject({suppressed:true,n:9});
  });

  it('suppresses unknown currency instead of treating it as EUR',()=>{
    const unknown=Array.from({length:10},(_,i)=>row(i+1,{currency:null}));
    expect(buildOutcomeCalibration(unknown)).toMatchObject({
      suppressed:true,
      aggregate:null,
      suppression_reason:'KNOWN_SINGLE_CURRENCY_COHORT_REQUIRED',
    });
  });

  it('is consumed by provider negotiation as advisory-only context',()=>{
    const source=fs.readFileSync('base44/functions/providerNegotiationAgent/entry.ts','utf8');
    expect(source).toMatch(/comparable_outcomes:\s*comparableOutcomes/);
    expect(source).toContain('descriptive aggregate heuristic only, not statistical or probabilistic calibration');
    expect(source).toContain('never quote them as a probability, public provider rate, target, promise, guarantee or authority');
    expect(source).toContain('readCompleteEntityPages');
    expect(source).toContain('privacy_safe_outcome_coverage_incomplete');
    expect(source).not.toContain('entities.IntelligenceOutcome');
  });

  it('consumes only complete retained k10 same-currency snapshots',()=>{
    expect(buildPrivacySafeOutcomeCalibration([retained()],{currency:'EUR',provider_id:'stripe',as_of:'2026-08-15T00:00:00.000Z',source_coverage:coverage})).toMatchObject({
      suppressed:false,n:10,observation_count:10,
      aggregate:{currency:'EUR',median_realized_savings:1000,success_rate:.8,financial_values_converted:false,financial_value_unit:'native_currency:EUR'},
    });
    expect(buildPrivacySafeOutcomeCalibration([retained()],{currency:'USD',provider_id:'stripe',as_of:'2026-08-15T00:00:00.000Z',source_coverage:coverage})).toMatchObject({suppressed:true,aggregate:null});
    expect(buildPrivacySafeOutcomeCalibration([retained()],{currency:'EUR',provider_id:'stripe',as_of:'2026-08-15T00:00:00.000Z',source_coverage:{...coverage,status:'INCOMPLETE',coverage_complete:false}})).toMatchObject({suppressed:true,suppression_reason:'SOURCE_COVERAGE_INCOMPLETE',aggregate:null});
  });
});
