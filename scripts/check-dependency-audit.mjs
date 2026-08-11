#!/usr/bin/env node
import {spawnSync} from 'node:child_process';
import {computeSourceTreeHash} from './lib/sourceTreeHash.mjs';
import {writeEvidence} from './lib/evidence.mjs';

const tree=computeSourceTreeHash('.');
const startedAt=new Date().toISOString();
const result=spawnSync('npm',['audit','--json'],{encoding:'utf8',maxBuffer:32*1024*1024});
let report=null;
try{report=JSON.parse(result.stdout||'{}')}catch{/* malformed output is a hard failure below */}
const vulnerabilities=report?.metadata?.vulnerabilities||null;
const total=Number(vulnerabilities?.total);
const valid=Boolean(report&&Number.isFinite(total));
const exitCode=result.status===0&&valid&&total===0?0:1;

writeEvidence('dependency-audit',{
  command:'npm audit --json',
  sourceTreeHash:tree.hash,
  startedAt,
  completedAt:new Date().toISOString(),
  exitCode,
  ciRunId:process.env.GITHUB_RUN_ID||null,
  auditReportVersion:report?.auditReportVersion??null,
  vulnerabilities:valid?vulnerabilities:null,
  dependencies:report?.metadata?.dependencies??null,
  networkExitCode:result.status??null,
});

if(exitCode!==0){
  const reason=!valid?'npm audit returned malformed/unavailable evidence':`${total} known vulnerabilit${total===1?'y':'ies'} reported`;
  console.error(`dependency:audit FAIL — ${reason}`);
  if(result.stderr)console.error(String(result.stderr).trim().slice(0,1000));
  process.exit(1);
}
console.log(`dependency:audit PASS — ${report.metadata.dependencies.total} dependencies, 0 known vulnerabilities`);
