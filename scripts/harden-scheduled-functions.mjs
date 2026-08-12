#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const fix=process.argv.includes('--fix');
const root='base44/functions';
const units={minutes:60,hours:3600,days:86400,weeks:604800};
const failures=[];
let changed=0;
for(const dir of fs.readdirSync(root,{withFileTypes:true}).filter((x)=>x.isDirectory())){
  const configPath=path.join(root,dir.name,'function.jsonc');
  if(!fs.existsSync(configPath))continue;
  const config=JSON.parse(fs.readFileSync(configPath,'utf8'));
  const active=(config.automations||[]).filter((x)=>x.type==='scheduled'&&x.is_active===true);
  if(!active.length)continue;
  const files=fs.readdirSync(path.join(root,dir.name)).filter((x)=>x.endsWith('.ts'));
  const entryName=config.entry || 'entry.ts';
  const entryPath=path.join(root,dir.name,entryName);
  if(!fs.existsSync(entryPath)){failures.push(`${dir.name}:entry_missing`);continue}
  let source=fs.readFileSync(entryPath,'utf8');
  if(source.includes('guardedScheduledServe')){
    if(fix&&!/guardedScheduledServe\(\{.*\},\s*createClientFromRequest\s*,/.test(source)){
      source=source.replace(/guardedScheduledServe\((\{.*?\}),\s*(async)/, 'guardedScheduledServe($1,createClientFromRequest,$2');
      fs.writeFileSync(entryPath,source);changed+=1;
    }
    continue;
  }
  if(source.includes('claimSchedulerRun'))continue;
  failures.push(`${dir.name}:scheduled_boundary_unguarded`);
  if(!fix)continue;
  const specs=active.map((a)=>({worker_key:String(a.function_args?.hosted_worker||a.function_name||config.name||dir.name),cadence_seconds:Number(a.repeat_interval)*(units[a.repeat_unit]||300),route:String(a.function_args?.host_action||a.function_args?.hosted_worker||'')}));
  const base=specs.find((x)=>!x.route)||specs[0];
  const routes=Object.fromEntries(specs.filter((x)=>x.route).map((x)=>[x.route,{worker_key:x.worker_key,cadence_seconds:x.cadence_seconds}]));
  const literal=JSON.stringify({worker_key:base.worker_key,cadence_seconds:base.cadence_seconds,...(Object.keys(routes).length?{routes}: {})});
  source=source.replace('Deno.serve(',`guardedScheduledServe(${literal},createClientFromRequest,`);
  const importLine="import { guardedScheduledServe } from '../../shared/schedulerRun.ts';\n";
  const imports=[...source.matchAll(/^import[^\n]+\n/gm)];
  const at=imports.length ? imports.at(-1).index+imports.at(-1)[0].length : 0;
  source=source.slice(0,at)+importLine+source.slice(at);
  fs.writeFileSync(entryPath,source);
  changed+=1;
}
if(fix){console.log(`scheduler-hardening:fix — wrapped ${changed} scheduled function boundary/boundaries`);process.exit(0)}
if(failures.length){console.error(`scheduler-hardening:check FAIL — ${failures.length} active scheduled boundaries lack a slot guard:\n${failures.join('\n')}`);process.exit(1)}
console.log('scheduler-hardening:check PASS — every active physical scheduled boundary is slot guarded.');
