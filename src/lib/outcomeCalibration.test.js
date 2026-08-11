import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { buildOutcomeCalibration, MIN_OUTCOME_CALIBRATION_COHORT } from '../../base44/shared/outcomeCalibration.ts';

const row=(n,extra={})=>({id:`secret-${n}`,brand_id:`merchant-${n}`,related_entity_id:`case-${n}`,currency:'EUR',realized_savings:n*10,confidence_after:.8,success:n%4!==0,negative_knowledge:n%4===0,is_demo:false,...extra});

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
    expect(JSON.stringify(result)).not.toMatch(/secret-|merchant-|case-/);
    expect(result.truth_note).toContain('not a public provider rate');
  });

  it('cannot let a mixed-currency or demo row contaminate the cohort',()=>{
    const rows=[...Array.from({length:9},(_,i)=>row(i+1)),row(10,{currency:'USD'}),row(11,{is_demo:true})];
    expect(buildOutcomeCalibration(rows,{currency:'EUR'}).suppressed).toBe(true);
  });

  it('is consumed by provider negotiation as advisory-only context',()=>{
    const source=fs.readFileSync('base44/functions/providerNegotiationAgent/entry.ts','utf8');
    expect(source).toContain('comparable_outcomes:comparableOutcomes');
    expect(source).toContain('never quote them as a public provider rate, target, promise, guarantee or authority');
  });
});
