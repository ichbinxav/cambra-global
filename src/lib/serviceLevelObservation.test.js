import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import {
  excludedServiceLevelResult,
  observeServiceLevelRequest,
  serviceLevelResult,
} from '../../base44/shared/serviceLevelObservation.ts';

const SHA='0123456789abcdef0123456789abcdef01234567';
const HASH='a'.repeat(64);
const ENV={CAMBRA_ENVIRONMENT:'production',CAMBRA_RELEASE_VERSION:'0.97.0',CAMBRA_RELEASE_BUILD_ID:'ci-42',CAMBRA_GIT_SHA:SHA,CAMBRA_SOURCE_TREE_HASH:HASH,CAMBRA_SOURCE_TREE_FILE_COUNT:'2500',CAMBRA_BASE44_BUNDLE_HASH:HASH,CAMBRA_BASE44_BUNDLE_FILE_COUNT:'2400',CAMBRA_DEPLOYMENT_TOPOLOGY_HASH:HASH,CAMBRA_SCHEDULER_INVENTORY_HASH:HASH,CAMBRA_PHYSICAL_FUNCTION_COUNT:'276',CAMBRA_LOGICAL_ROUTE_COUNT:'38'};
let previous;

function service(options={}){
  const rows=[];
  return {
    rows,
    entities:{ApiActivityLog:{
      create:async(value)=>{
        if(options.createFails)throw new Error('write_down');
        const row={id:'receipt-1',...value};rows.push(row);return row;
      },
      update:async(id,value)=>{
        if(options.updateFails)throw new Error('write_down');
        const index=rows.findIndex((row)=>row.id===id);
        rows[index]={...rows[index],...value};return rows[index];
      },
    }},
  };
}

/* global process */
describe('durable service-level request observation',()=>{
  beforeEach(()=>{previous=Object.fromEntries(Object.keys(ENV).map((key)=>[key,process.env[key]]));Object.assign(process.env,ENV);});
  afterEach(()=>{for(const [key,value] of Object.entries(previous)){if(value===undefined)delete process.env[key];else process.env[key]=value;}});

  it('precreates a conservative receipt then commits success with business refs',async()=>{
    const svc=service();
    const response=await observeServiceLevelRequest(svc,new Request('https://example.test',{method:'POST'}),{slo_key:'analyzer_submission',endpoint:'submitPaymentsAnalysis'},async()=>serviceLevelResult(Response.json({ok:true}),{source_refs:[{entity:'PaymentsAnalysisSession',key:'session-1'}]}));
    expect(response.status).toBe(200);
    expect(svc.rows).toHaveLength(1);
    expect(svc.rows[0]).toMatchObject({observation_state:'SUCCEEDED',status:'success',status_code:200,runtime_git_sha:SHA,payload_summary:{eligible:true,source_refs:[{entity:'PaymentsAnalysisSession',key:'session-1'}]}});
  });

  it('records explicit exclusions outside the denominator',async()=>{
    const svc=service();
    await observeServiceLevelRequest(svc,new Request('https://example.test',{method:'POST'}),{slo_key:'document_extraction',endpoint:'processUploadedFile'},async()=>excludedServiceLevelResult(Response.json({duplicate:true}),'idempotent_replay'));
    expect(svc.rows[0]).toMatchObject({observation_state:'EXCLUDED',payload_summary:{eligible:false,exclusion_reason:'idempotent_replay'}});
  });

  it('records thrown and HTTP failures, and never executes business work without the STARTED receipt',async()=>{
    const svc=service();
    await expect(observeServiceLevelRequest(svc,new Request('https://example.test',{method:'POST'}),{slo_key:'commercial_send',endpoint:'commercialSendMessage'},async()=>{throw Object.assign(new Error('provider_down'),{status:503});})).rejects.toThrow('provider_down');
    expect(svc.rows[0]).toMatchObject({observation_state:'FAILED',status:'error',status_code:503,error_message:'provider_down'});

    let executed=false;
    await expect(observeServiceLevelRequest(service({createFails:true}),new Request('https://example.test',{method:'POST'}),{slo_key:'commercial_send',endpoint:'commercialSendMessage'},async()=>{executed=true;return Response.json({ok:true});})).rejects.toMatchObject({code:'SLO_OBSERVATION_START_FAILED'});
    expect(executed).toBe(false);
  });

  it('leaves STARTED as an incomplete-coverage signal when terminal persistence fails',async()=>{
    const svc=service({updateFails:true});
    const response=await observeServiceLevelRequest(svc,new Request('https://example.test',{method:'POST'}),{slo_key:'analyzer_submission',endpoint:'submitPaymentsAnalysis'},async()=>Response.json({ok:true}));
    expect(response.status).toBe(200);
    expect(svc.rows[0]).toMatchObject({observation_state:'STARTED',status:'error',status_code:500});
  });

  it('is wired at each real eligible effect boundary without adding a route',()=>{
    const analyzer=fs.readFileSync('base44/functions/submitPaymentsAnalysis/entry.ts','utf8');
    const extractor=fs.readFileSync('base44/functions/processUploadedFile/entry.ts','utf8');
    const commercial=fs.readFileSync('base44/functions/commercialSendMessage/entry.ts','utf8');
    expect(analyzer).toContain("slo_key: 'analyzer_submission'");
    expect(analyzer.indexOf('consumePublicRequestRateLimit(')).toBeLessThan(analyzer.indexOf("slo_key: 'analyzer_submission'"));
    expect(analyzer.indexOf("slo_key: 'analyzer_submission'")).toBeLessThan(analyzer.indexOf('entities.ReferralLink'));
    expect(extractor).toContain("slo_key: 'document_extraction'");
    expect(extractor.indexOf("slo_key: 'document_extraction'")).toBeLessThan(extractor.indexOf('fetch(trusted.url'));
    expect(commercial).toContain('slo_key: "commercial_send"');
    expect(commercial.indexOf('slo_key: "commercial_send"')).toBeLessThan(commercial.indexOf('claimCommercialSendSlot(svc'));
  });
});
