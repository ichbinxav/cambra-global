import { describe, expect, it } from 'vitest';
import { commercialCoverageAttention } from './commercialOperatingSystem.ts';

const coverage=(sources:Record<string,any>)=>({
  blockers:Object.values(sources).flatMap((row:any)=>row.blockers||[]),
  sources,
});

describe('commercialCoverageAttention',()=>{
  it('does not call complete portfolio counts critical when only history windows are full',()=>{
    const result=commercialCoverageAttention(
      coverage({campaigns:{status:'COMPLETE'},tasks:{status:'INCOMPLETE',blockers:['commercial_agent_tasks_coverage_truncated']}}),
      coverage({leads:{status:'COMPLETE'},scheduler_runs:{status:'INCOMPLETE',blockers:['discovery_scheduler_runs_coverage_truncated']}}),
    );
    expect(result).toMatchObject({severity:'info',code:'commercial_operational_history_windowed'});
    expect(result?.label).toContain('Portfolio counts are complete');
  });

  it('keeps incomplete portfolio authorities critical',()=>{
    const result=commercialCoverageAttention(
      coverage({campaigns:{status:'INCOMPLETE',blockers:['commercial_campaigns_coverage_truncated']}}),
      coverage({leads:{status:'COMPLETE'}}),
    );
    expect(result).toMatchObject({severity:'critical',code:'commercial_runtime_sources_incomplete'});
  });
});
