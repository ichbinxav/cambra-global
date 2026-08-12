#!/usr/bin/env node
import fs from 'node:fs';
import process from 'node:process';

const file='config/data-retention-matrix.json';const fail=(message)=>{console.error(`retention:check FAIL — ${message}`);process.exitCode=1};
if(!fs.existsSync(file)){fail(`${file} missing`);process.exit(1)}
let matrix;try{matrix=JSON.parse(fs.readFileSync(file,'utf8'))}catch(error){fail(`invalid JSON: ${error.message}`);process.exit(1)}
const rows=Array.isArray(matrix.categories)?matrix.categories:[];if(rows.length<15)fail(`material category coverage too small: ${rows.length}`);
if(matrix.schema_version!=='cambra-data-retention-v2')fail(`unexpected schema_version: ${matrix.schema_version}`);
if(matrix.policy_engine!=='base44/shared/retentionPolicy.ts'||!fs.existsSync(matrix.policy_engine))fail('central policy engine missing');
if(!String(matrix.policy_version||'').trim())fail('policy_version missing');
if(!fs.existsSync(String(matrix.audit_evidence_entity||'')))fail('audit evidence entity missing');
const required=['category','purpose','identifiability','retention_rule','method','exceptions','owner','automation_status','automation_reference'];
const names=new Set();for(const [index,row] of rows.entries()){
  for(const field of required)if(!String(row?.[field]??'').trim())fail(`row ${index} missing ${field}`);
  if(names.has(row.category))fail(`duplicate category ${row.category}`);names.add(row.category);
  if(!fs.existsSync(row.automation_reference))fail(`${row.category} reference missing: ${row.automation_reference}`);
  if(String(row.automation_status).startsWith('AUTOMATED')&&!String(row.central_policy_key||'').trim())fail(`${row.category} automated without central_policy_key`);
}
for(const category of ['uploaded_source_documents','commercial_communications','billing_invoices_and_tax_records','security_and_authorization_audits','product_analytics_events','intelligence_outcomes_and_aggregates'])if(!names.has(category))fail(`material category missing: ${category}`);
if(!process.exitCode)console.log(`retention:check PASS — ${rows.length} categories mapped to ${matrix.policy_version}; execution evidence required; non-automated states remain explicit`);
