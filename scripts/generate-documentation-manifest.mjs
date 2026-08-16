#!/usr/bin/env node
import fs from 'node:fs';
import crypto from 'node:crypto';

const sha=(path)=>crypto.createHash('sha256').update(fs.readFileSync(path)).digest('hex');
const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));
const registry=fs.readFileSync('base44/shared/documentationRegistry.ts','utf8');
const version=(registry.match(/DOCUMENTATION_REGISTRY_VERSION='([^']+)'/)||[])[1]||null;
const system=(registry.match(/DOCUMENTATION_SYSTEM_VERSION='([^']+)'/)||[])[1]||null;
const paths=[...new Set([...registry.matchAll(/['"]((?:src|base44|scripts|config)\/[^'"]+)['"]/g)].map((match)=>match[1]).filter((path)=>fs.existsSync(path)))].sort();
const docs=[
  'src/docs/CAMBRA_OPERATING_BIBLE.md',
  'src/docs/CAMBRA_FOUNDER_HANDBOOK.md',
  'src/docs/CAMBRA_AGENT_OPERATING_CATALOG.md',
  'src/docs/CAMBRA_AZ_FINAL_AUDIT_2026-08-11.md',
  'src/docs/CAMBRA_GROWTH_PATH_ENGINE_V1.md',
  'src/docs/CAMBRA_FOUNDER_CONTROL_V2_IMPLEMENTATION_MATRIX.md',
  'src/docs/CAMBRA_FOUNDER_ADMIN_SETTINGS_V2_IMPLEMENTATION_MATRIX.md',
  'src/docs/CAMBRA_FOUNDER_ADMIN_MERCHANTS_V2_SOURCE_MATRIX.md',
  'src/docs/CAMBRA_DISCOVERY_V2_EXISTING_CAPABILITY_MATRIX.md',
  'docs/INTELLIGENCE_CANONICAL_RECONCILIATION_V2.md',
  'src/docs/CAMBRA_INTELLIGENCE_PHASE_0_RECONCILIATION.md',
  'src/docs/CAMBRA_INTELLIGENCE_PHASE_1_FOUNDATION.md',
  'src/docs/CAMBRA_INTELLIGENCE_EVALUATION_HARNESS_CONTRACT.md',
  'src/docs/CAMBRA_CPIC_PHASE_2_FOUNDATION.md',
  'src/docs/CAMBRA_ADAPTIVE_LEAD_PHASE_3_CORE.md',
  'src/docs/CAMBRA_ADAPTIVE_VERIFIED_SAVINGS_ATTRIBUTION.md',
  'src/docs/Decision_Log_REMEDIATION_R0.md',
  'src/docs/Decision_Log_REMEDIATION_R1.md',
  'src/docs/Decision_Log_REMEDIATION_R2.md',
  'src/docs/Decision_Log_REMEDIATION_R3.md',
  'src/docs/Decision_Log_REMEDIATION_R4.md',
  'src/docs/Decision_Log_REMEDIATION_R5.md',
  'src/docs/Decision_Log_REMEDIATION_R6.md',
  'src/docs/Decision_Log_REMEDIATION_R7.md',
  'src/docs/CAMBRA_P6_AUTONOMOUS_DISCOVERY_RADAR.md',
  'src/docs/CAMBRA_ULTIMATE_TECHNICAL_CLOSURE_2026-08-11.md',
  'src/docs/CAMBRA_V096_COMMERCIAL_OPERATING_SYSTEM.md',
  'src/docs/CAMBRA_V097_FINAL_PRODUCTION_REMEDIATION.md',
  'src/docs/BASE44_BACKEND_DEPLOYMENT_TOPOLOGY.md',
  'src/docs/P18_TROUBLESHOOTING_PLAYBOOKS.md',
  'src/docs/P18_INCIDENT_PLAYBOOKS.md',
  'src/docs/P18_EMERGENCY_CONTROLS.md',
  'src/docs/EMERGENCY_EPOCH_BOUNDARY.md',
  'src/docs/PRODUCTION_FUNCTIONS.md',
  'src/docs/COMMERCIAL_GO_LIVE_CHECKLIST.md',
  'src/docs/FINAL_PRE_LAUNCH_REMEDIATION.md',
  'src/docs/P1_EUROPE_COUNTRY_INTELLIGENCE_FOUNDATION.md',
  'docs/P6_P8_AUTONOMOUS_COMPANY_SEAL.md',
  'src/docs/P9_EUROPEAN_LOCALIZATION.md',
  'src/docs/P10_REGULATORY_CONTROL.md',
  'src/docs/P11_PRODUCTION_SECURITY_RELIABILITY.md',
  'src/docs/CAMBRA_DISASTER_RECOVERY.md',
  'src/docs/P12_EUROPEAN_LAUNCH_GROWTH.md',
  'docs/CAMBRA_EUROPE_V1_FINAL_SEAL_REPORT.md',
];
for(const path of docs)if(!fs.existsSync(path))throw new Error(`documentation_manifest_missing:${path}`);
const manifest={registryVersion:version,systemVersion:system,packageVersion:pkg.version,generatedAt:new Date().toISOString(),sourcePaths:Object.fromEntries(paths.map((path)=>[path,sha(path)])),documentationFiles:Object.fromEntries(docs.map((path)=>[path,sha(path)]))};
fs.writeFileSync('config/documentation-drift-manifest.json',`${JSON.stringify(manifest,null,2)}\n`);
console.log(`documentation:generate PASS — ${paths.length} source paths + ${docs.length} canonical docs sealed for ${pkg.version}.`);
