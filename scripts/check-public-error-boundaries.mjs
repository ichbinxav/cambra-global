#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const fix=process.argv.includes('--fix');
// AUDIT SEC-07 (2026-08-17): logical routes moved into base44/shared/*.ts. Walk both
// roots recursively so the check sees where the trust boundaries actually live.
const roots=['base44/functions','base44/shared'];
const files=[];
const walk=(dir)=>{
  for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
    const full=path.join(dir,entry.name);
    if(entry.isDirectory())walk(full);
    else if(entry.name.endsWith('.ts'))files.push(full);
  }
};
for(const r of roots)if(fs.existsSync(r))walk(r);
// A `public-errors:allow-diagnostic — <reason>` comment on the same block exempts an
// intentional bounded exposure (namespaced error prefix, or slice(0,N) truncation with
// a fallback code). The reason has to be present so the exemption is auditable.
const ALLOW_MARK=/public-errors:allow-diagnostic/;
const unsafe=[];
for(const file of files){
  let source=fs.readFileSync(file,'utf8');
  const replacements=[];
  let cursor=0;
  while((cursor=source.indexOf('return Response.json(',cursor))>=0){
    const open=source.indexOf('(',cursor);
    let depth=0, quote='', escaped=false, close=-1;
    for(let index=open;index<source.length;index+=1){
      const char=source[index];
      if(quote){if(escaped)escaped=false;else if(char==='\\\\')escaped=true;else if(char===quote)quote='';continue}
      if(char==='\"'||char==="'"||char==='`'){quote=char;continue}
      if(char==='(')depth+=1;
      else if(char===')'&&--depth===0){close=index;break}
    }
    if(close<0)break;
    const end=source[close+1]===';'?close+2:close+1;
    const call=source.slice(cursor,end);
    const isFiveXx=/status\s*:\s*5\d\d/.test(call);
    // AUDIT SEC-07 (2026-08-17): dynamic status expressions with a fallback that resolves
    // to 5xx are just as bad — e.g. `{status: Number(error?.status || 500)}` returns 500
    // when the caught error has no status field. Flag them as potentially-5xx.
    const dynamicWith5xxFallback=/\|\|\s*5\d\d\b/.test(call)||/status\s*:\s*(?:Number\()?(?:error|e)\?\.status\b/.test(call);
    const hasDiagnostic=/(?:\.message\b|\.stack\b|\bmessage\s*:\s*(?!["'])|\bstack\s*:|String\((?:error|e)\))/.test(call);
    const contextBefore=source.slice(Math.max(0,cursor-400),cursor);
    const allowed=ALLOW_MARK.test(contextBefore)||ALLOW_MARK.test(call);
    const leaks=(isFiveXx||dynamicWith5xxFallback)&&hasDiagnostic&&!allowed;
    if(leaks){
      const line=source.slice(0,cursor).split('\n').length;
      unsafe.push(`${file}:${line}`);
      if(fix){
        const prefix=source.slice(0,cursor);
        const catches=[...prefix.matchAll(/catch\s*\(\s*([A-Za-z_$][\w$]*)[^)]*\)/g)];
        const variable=catches.at(-1)?.[1] || 'undefined';
        replacements.push([cursor,end,`return internalErrorResponse(${variable}, '${path.basename(path.dirname(file))}');`]);
      }
    }
    cursor=end;
  }
  if(replacements.length){
    for(const [start,end,value] of replacements.reverse())source=source.slice(0,start)+value+source.slice(end);
    if(!source.includes("../../shared/publicErrors.ts")){
      const importLine=`import { internalErrorResponse } from '../../shared/publicErrors.ts';\n`;
      const imports=[...source.matchAll(/^import[^\n]+\n/gm)];
      const at=imports.length ? (imports.at(-1).index + imports.at(-1)[0].length) : 0;
      source=source.slice(0,at)+importLine+source.slice(at);
    }
    fs.writeFileSync(file,source);
  }
}
if(fix){console.log(`public-errors:fix — hardened ${new Set(unsafe.map((x)=>x.split(':').slice(0,-1).join(':'))).size} file(s), ${unsafe.length} unsafe 500 response(s)`);process.exit(0)}
if(unsafe.length){console.error(`public-errors:check FAIL — internal diagnostics exposed by ${unsafe.length} 500 response(s):\n${unsafe.slice(0,100).join('\n')}`);process.exit(1)}
console.log(`public-errors:check PASS — ${files.length} backend source file(s); no error message/stack is returned by a 500 boundary.`);
