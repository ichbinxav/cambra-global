#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const fix=process.argv.includes('--fix');
const root='base44/functions';
const files=[];
for(const dir of fs.readdirSync(root,{withFileTypes:true})){
  if(!dir.isDirectory())continue;
  for(const name of fs.readdirSync(path.join(root,dir.name)))if(name.endsWith('.ts'))files.push(path.join(root,dir.name,name));
}
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
    const leaks=/status\s*:\s*5\d\d/.test(call)&&/(?:\.message\b|\.stack\b|\bmessage\s*:\s*(?!["'])|\bstack\s*:|String\((?:error|e)\))/.test(call);
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
