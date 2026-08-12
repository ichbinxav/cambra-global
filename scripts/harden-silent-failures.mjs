#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const fix=process.argv.includes('--fix');
const root='base44/functions';
const exempt=new Set(['base44/functions/processUploadedFile/entry.ts']); // pre-ECL frozen boundary; failures are handled by its explicit outer error contract.
const files=[];
for(const dir of fs.readdirSync(root,{withFileTypes:true}).filter((x)=>x.isDirectory()))for(const name of fs.readdirSync(path.join(root,dir.name)))if(name.endsWith('.ts'))files.push(path.join(root,dir.name,name));
const failures=[];let changed=0,occurrences=0;
for(const file of files){
  if(exempt.has(file))continue;
  let source=fs.readFileSync(file,'utf8');
  const importLine="import { safeBestEffort } from '../../shared/bestEffort.ts';\n";
  if(fix&&source.includes(importLine)){
    source=source.replaceAll(importLine,'');
    source=importLine+source;
    fs.writeFileSync(file,source);
  }
  const pattern=/\.catch\(\s*\(\s*\)\s*=>\s*(null|\[\])\s*\)/g;
  const matches=[...source.matchAll(pattern)];
  const emptyCatch=/catch\s*\{\s*\}/g;
  const emptyMatches=[...source.matchAll(emptyCatch)];
  if(!matches.length&&!emptyMatches.length)continue;
  failures.push(`${file}:${matches.length+emptyMatches.length}`);occurrences+=matches.length+emptyMatches.length;
  if(!fix)continue;
  const operation=path.basename(path.dirname(file));
  const severity=/(?:billing|invoice|stripe|webhook|outbound|commercial|contract|recover|migration|providerRevenue)/i.test(operation)?'critical':'secondary';
  source=source.replace(pattern,(_,fallback)=>`.catch((error:any)=>safeBestEffort(error,{operation:'${operation}',fallback:${fallback},severity:'${severity}'}))`);
  source=source.replace(emptyCatch,`catch(error){safeBestEffort(error,{operation:'${operation}',fallback:null,severity:'${severity}'})}`);
  if(!source.includes("../../shared/bestEffort.ts"))source=importLine+source;
  fs.writeFileSync(file,source);changed+=1;
}
if(fix){console.log(`silent-failures:fix — instrumented ${occurrences} fallback(s) across ${changed} function file(s)`);process.exit(0)}
if(failures.length){console.error(`silent-failures:check FAIL — ${occurrences} unobservable null/empty-array catch fallback(s):\n${failures.slice(0,150).join('\n')}`);process.exit(1)}
console.log(`silent-failures:check PASS — ${files.length} backend source file(s); no unobservable null/empty-array catch fallback.`);
