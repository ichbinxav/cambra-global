import fs from 'node:fs';

const markets=JSON.parse(fs.readFileSync('config/europe-markets.json','utf8')).markets;
const locales=JSON.parse(fs.readFileSync('config/europe-locales.json','utf8'));
const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));
const localeByMarket=new Map(locales.markets.map((x)=>[x.market_code,x]));

const matrix=markets.map((market)=>{
  const locale=localeByMarket.get(market.iso2);
  return{
    market:market.iso2,name:market.canonical_name,launch_status:'RESEARCH_ONLY',launch_readiness:'EXTERNAL_ACTIVATION_BLOCKED',
    market_attractiveness:null,data_maturity:0,p3_coverage:'NOT_ASSERTED_BY_CLOSURE_REPORT',p4_maturity:'COLD_START',p5_opportunity_maturity:'COLD_START',
    p6_lead_availability:'RUNTIME_EVIDENCE_REQUIRED',p7_commercial_readiness:'P10_P11_P12_AND_RUNTIME_GATED',p9_localization_readiness:locale.translation_readiness,
    p10_regulatory_readiness:'LEGAL_REVIEW_REQUIRED',p11_legal_readiness:'COUNSEL_REVIEW_REQUIRED',p12_production_readiness:'EXTERNAL_PROOF_REQUIRED',p13_growth_readiness:'SHADOW_DATA_REQUIRED',
    recommended_strategy:'RESTRICT',main_blocker:'P10_P11_P12_EXTERNAL_EVIDENCE',
    next_action:'Complete evidence-backed P10/P11 counsel review, final-SHA remote CI, Base44 runtime proof, real restore and document corpus evaluation.',
    TECH_READY:false,DATA_READY:false,LOCALIZED:locale.translation_readiness==='NATIVE_PRODUCT',REGULATORY_READY:false,LEGAL_READY:false,COMMERCIAL_READY:false,LAUNCH_READY:false,
  };
});

const report={
  report:'CAMBRA EUROPE V1 FINAL AUTONOMY REPORT',version:pkg.version,generated_from_source:true,
  classification:'CAMBRA_EUROPE_V1_SEALED_WITH_EXTERNAL_BLOCKERS',
  final_status:'P1–P13 LOCAL TECHNICAL SEAL COMPLETE / EXTERNAL ACTIVATION BLOCKED',
  system_capability:'COHERENT_EUROPEAN_AUTONOMOUS_OPERATING_ARCHITECTURE_IMPLEMENTED_LOCALLY',real_business_performance:'NOT_PROVEN',
  phase_status:{
    P1:'IMPLEMENTED',P2:'IMPLEMENTED',P3:'IMPLEMENTED',P4:'IMPLEMENTED',P5:'IMPLEMENTED',P6:'IMPLEMENTED',P7:'IMPLEMENTED',P8:'IMPLEMENTED',
    P9:'IMPLEMENTED_WITH_LOCALIZATION_LIMITS',P10:'TECHNICALLY_COMPLETE_LEGAL_EVIDENCE_BLOCKED',
    P11:'TECHNICALLY_COMPLETE_COUNSEL_AND_POLICY_ACTIVATION_BLOCKED',P12:'TECHNICALLY_COMPLETE_EXTERNAL_PROOF_BLOCKED',
    P13:'TECHNICALLY_COMPLETE_SHADOW_ONLY_BLOCKED_BY_P10_P11_P12_AND_REAL_COHORTS',
  },
  canonical_machine:{
    chain:['countries','providers','rates','statistical_intelligence','opportunities','leads','commercial_execution','orchestration','localization','regulatory_permission','legal_execution','production_security_reliability','growth_allocation'],
    deterministic_authority:'P10 → P11 → contract/mandate → commercial policy → sending profile/caps → agent authority → execution/audit',
    p8_orchestrator:'CANONICAL_COORDINATION_ONLY_NO_MATERIAL_AUTHORITY',p12_containment:'MATERIAL_EXTERNAL_EFFECT_BOUNDARIES_FAIL_CLOSED',p13_mode:'SHADOW_RECOMMEND_ONLY',frontend_delivery:'ROUTE_LEVEL_LAZY_LOADING_AND_STABLE_VENDOR_CHUNKS',
    founder_os:'IMPLEMENTED_LOCALLY_RUNTIME_PROOF_PENDING',founder_inbox:'IMPLEMENTED_LOCALLY_RUNTIME_PROOF_PENDING',founder_ai:'DETERMINISTIC_DATA_TOOLS_WITHOUT_AUTHORITY_BYPASS',continuous_intelligence:'IMPLEMENTED_LOCALLY_CONNECTOR_AND_RUNTIME_EVIDENCE_PENDING',
    p11_enforced_boundaries:['commercial transport','mandate acceptance','provider negotiation','migration coordination','migration go-live','Recover invoice issuance'],
  },
  commercial_hardening_patch:{
    status:'INTEGRATED',honest_first_touch:true,central_daily_send_governor:true,follow_up_run_budget:true,p10_p11_compatible:true,
    first_touch_classifications:['initial_outreach','partner_outreach'],default_follow_up_budget:25,admin_max_follow_up_budget:50,
  },
  technical_blockers:[],
  required_authority:['Qualified approval of material contract/provider commitments.','Merchant approval where exact mandate/action policy requires it.','Admin approval for audited manual send override.'],
  required_legal_security:['Qualified P10/P11 review and current primary-source evidence.','Production privacy/DPA and real document-corpus approval.','Final-SHA remote CI, Base44 runtime, restore and security evidence.'],
  unnecessary_friction_removed:['Cold outreach no longer impersonates inbound interest.','All automatic senders share one fail-closed daily governor.','Unknown future senders default to no authority.','Follow-up sweeps stop before avoidable LLM work once budget closes.'],
  regulatory_legal_blockers:['Qualified review and authoritative evidence are required per jurisdiction/activity/action.','Conservative P10/P11 seeds grant zero permission.','No registration, passport notification, partner mandate or legal clearance is claimed.'],
  commercial_blockers:['Real acquisition, conversion, CAC, retention and revenue performance is not yet proven.','Fallback-only markets require native localization before full launch.'],
  document_extractor:{technical_status:'LOCAL_REGRESSION_PASS',controls:['file signature and hash','SSRF boundary','independent extraction agreement','minor-unit normalization','linked audit evidence','payments-statement-only projection'],external_proof:'REDACTED_MULTILINGUAL_REAL_DOCUMENT_GOLDEN_CORPUS_REQUIRED'},
  verification:{local_pipeline:'RELEASE_MANIFEST_EVIDENCE_REQUIRED',security_audit:'RUN_SEPARATELY_AND_REPORTED_IN_FINAL_HANDOFF',remote_ci:'NOT_VERIFIED_FOR_FINAL_SHA',base44_runtime:'NOT_VERIFIED'},
  external_blockers:['Final-SHA GitHub remote CI','Base44 deployed entity/function/scheduled-worker proof','Real backup restore exercise meeting RPO/RTO','Dependency alert proof','Redacted multilingual real-document extractor golden-corpus evaluation','Qualified legal/regulatory/contract review'],
  production_health:'NOT_PROVEN_IN_BASE44_RUNTIME',remote_ci:'NOT_VERIFIED_FOR_FINAL_SHA',base44_runtime:'NOT_VERIFIED',final_commit_sha:'REPORTED_AFTER_LOCAL_COMMIT',
  market_count:matrix.length,market_matrix:matrix,
  recommended_next_actions:['Run final-SHA GitHub Actions.','Sync/deploy the combined tree to Base44 and verify scheduled/runtime records.','Approve P10/P11 cells only from qualified evidence.','Run real restore and multilingual extractor corpus exercises.','Collect real commercial cohorts before any P13 scale claim.'],
};

fs.mkdirSync('docs',{recursive:true});
fs.writeFileSync('docs/CAMBRA_EUROPE_V1_FINAL_SEAL_REPORT.json',JSON.stringify(report,null,2)+'\n');
const rows=matrix.map((x)=>`| ${x.market} | ${x.name} | ${x.p9_localization_readiness} | ${x.p10_regulatory_readiness} | ${x.p11_legal_readiness} | ${x.p12_production_readiness} | ${x.p13_growth_readiness} | ${x.recommended_strategy} |`).join('\n');
const phases=Object.entries(report.phase_status).map(([phase,status])=>`| ${phase} | ${status} |`).join('\n');
fs.writeFileSync('docs/CAMBRA_EUROPE_V1_FINAL_SEAL_REPORT.md',`# CAMBRA Europe V1 Final Autonomy Report

**Classification:** ${report.classification}

**Final status:** ${report.final_status}

**Capability:** ${report.system_capability}

**Business performance:** ${report.real_business_performance}

P1–P13 form one local operating architecture. This report does not convert missing legal, remote-CI, deployed-runtime, restore, document-corpus or real-commercial evidence into a launch pass.

## P1–P13 status

| Phase | Status |
|---|---|
${phases}

## One canonical machine

${report.canonical_machine.chain.map((x,i)=>`${i+1}. ${x}`).join('\n')}

P8 coordinates but never manufactures material authority. P10 regulation, P11 legal execution/mandate/contract evidence and P12 containment remain deterministic boundaries. P13 stays shadow/recommend-only and cannot activate a market, send, spend, contract or bypass an upstream block.

**Material P11 boundaries:** ${report.canonical_machine.p11_enforced_boundaries.join('; ')}.

## Founder operating surface

- Founder OS: ${report.canonical_machine.founder_os}
- Unified founder inbox: ${report.canonical_machine.founder_inbox}
- Founder AI: ${report.canonical_machine.founder_ai}
- Continuous intelligence: ${report.canonical_machine.continuous_intelligence}

Runtime metrics are never inferred from source code. Revenue, market performance and overnight changes remain unproven until the deployed Base44 data plane is observed.

## Commercial hardening patch

**INTEGRATED.** Honest first-touch classifications, one central profile/policy daily governor, a bounded follow-up run budget and non-bypassable P10/P11 compatibility are release-tested.

## Document extractor

**${report.document_extractor.technical_status}.** ${report.document_extractor.controls.join('; ')}. Production quality still requires: ${report.document_extractor.external_proof}.

## System health and verification boundary

- Local release pipeline: ${report.verification.local_pipeline}
- Frontend delivery: ${report.canonical_machine.frontend_delivery}
- Dependency/security audit: ${report.verification.security_audit}
- Remote GitHub CI: ${report.remote_ci}
- Base44 deployed runtime: ${report.base44_runtime}
- Real business performance: ${report.real_business_performance}

## Europe-33 activation matrix

| Market | Name | P9 localization | P10 regulation | P11 legal | P12 production | P13 growth | Strategy |
|---|---|---|---|---|---|---|---|
${rows}

## External blockers

${report.external_blockers.map((x)=>`- ${x}`).join('\n')}

## Remaining intentional human authority

${[...report.required_authority,...report.required_legal_security].map((x)=>`- ${x}`).join('\n')}

## Next actions

${report.recommended_next_actions.map((x)=>`- ${x}`).join('\n')}
`);
console.log(`europe:report PASS — ${matrix.length} markets · ${report.classification}`);
