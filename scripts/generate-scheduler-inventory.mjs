#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const check=process.argv.includes('--check');
const output='config/scheduler-inventory.json';
const units={minutes:60,hours:3600,days:86400,weeks:604800,months:null};
const topology=JSON.parse(fs.readFileSync('base44/deployment-topology.json','utf8'));
const logicalNames=new Set(Object.keys(topology.logical_routes||{}));
const sourceDirs=fs.readdirSync('base44/functions',{withFileTypes:true}).filter((entry)=>entry.isDirectory()).map((entry)=>entry.name).sort();
const dirs=sourceDirs.filter((name)=>!logicalNames.has(name));
const allFunctionSources=[];for(const dir of sourceDirs)for(const name of fs.readdirSync(path.join('base44/functions',dir)))if(name.endsWith('.ts'))allFunctionSources.push(fs.readFileSync(path.join('base44/functions',dir,name),'utf8'));
const rows=[];
for(const dir of dirs){
  const configPath=path.join('base44/functions',dir,'function.jsonc');if(!fs.existsSync(configPath))continue;
  let config;try{config=JSON.parse(fs.readFileSync(configPath,'utf8'));}catch(error){throw new Error(`${configPath} is not strict JSON: ${error.message}`)}
  const source=fs.readdirSync(path.dirname(configPath)).filter((name)=>name.endsWith('.ts')).map((name)=>fs.readFileSync(path.join(path.dirname(configPath),name),'utf8')).join('\n');
  for(const [index,automation] of (config.automations||[]).entries()){
    if(automation.type!=='scheduled')continue;
    const unit=String(automation.repeat_unit||'UNKNOWN');const interval=Number(automation.repeat_interval);
    const cadence=Number.isFinite(interval)&&units[unit]!=null?interval*units[unit]:null;
    const workerKey=String(automation.function_args?.hosted_worker||automation.function_name||config.name||dir);
    const guarded=source.includes('claimSchedulerRun')||allFunctionSources.some((candidate)=>candidate.includes('claimSchedulerRun')&&candidate.includes(`worker_key:'${workerKey}'`));
    rows.push({
      worker_key:workerKey,hosted_workers:Array.isArray(automation.function_args?.hosted_workers)?automation.function_args.hosted_workers:automation.function_args?.hosted_worker?[automation.function_args.hosted_worker]:[],function_directory:dir,automation_index:index,name:automation.name||null,responsibility:automation.description||automation.name||'UNKNOWN',owner_system:'Base44',trigger:'scheduled',is_active:automation.is_active===true,schedule:{mode:automation.schedule_mode||'UNKNOWN',type:automation.schedule_type||'UNKNOWN',repeat_unit:unit,repeat_interval:Number.isFinite(interval)?interval:null,cadence_seconds:cadence,start_time:automation.start_time||automation.starts_at||'UNKNOWN'},timeout_seconds:'UNKNOWN',concurrency:guarded?'AT_LEAST_ONCE_SLOT_GUARDED':'AT_LEAST_ONCE_NO_PROVEN_SLOT_GUARD',idempotency:guarded?'SCHEDULER_RUN_KEY; HANDLER GUARANTEE REQUIRES SOURCE REVIEW':'UNKNOWN',retry_backoff:'UNKNOWN',dlq_escalation:/DeadLetter|AutonomyIncident/.test(source)?'IMPLEMENTED_IN_HANDLER; VERIFY SOURCE':'UNKNOWN',side_effects:/\.create\(|\.update\(|\.delete\(|functions\.invoke|SendEmail|fetch\(/.test(source)?'MUTATING_OR_EXTERNAL; VERIFY SOURCE':'READ_ONLY_OR_UNKNOWN',tenant_scope:'UNKNOWN',authority:JSON.stringify(automation.function_args||{}).includes('INTERNAL_CALL_SECRET')?'INTERNAL_SECRET':'UNKNOWN',config_path:configPath,
    });
  }
}
const document={schema_version:'cambra-scheduler-inventory-v2',generated_from:'physical Base44 function configs after deployment-topology consolidation',truth_boundary:'Logical worker names may be hosted by an existing physical function. UNKNOWN means the repository does not prove the property. Base44 triggers are treated as at-least-once; exactly-once execution is not claimed.',scheduled_automation_count:rows.length,active_count:rows.filter((row)=>row.is_active).length,guarded_count:rows.filter((row)=>row.concurrency==='AT_LEAST_ONCE_SLOT_GUARDED').length,unguarded_active:rows.filter((row)=>row.is_active&&row.concurrency!=='AT_LEAST_ONCE_SLOT_GUARDED').map((row)=>row.worker_key),automations:rows};
const serialized=`${JSON.stringify(document,null,2)}\n`;
if(check){if(!fs.existsSync(output)||fs.readFileSync(output,'utf8')!==serialized){console.error('scheduler:check FAIL — config/scheduler-inventory.json is stale; run npm run scheduler:generate');process.exit(1)}console.log(`scheduler:check PASS — ${rows.length} scheduled automations inventoried`)}else{fs.writeFileSync(output,serialized);console.log(`${output} written — ${rows.length} scheduled automations`)}
