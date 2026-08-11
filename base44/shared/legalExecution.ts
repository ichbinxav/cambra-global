/**
 * CAMBRA P11 — deterministic legal execution and least-authority engine.
 *
 * The engine never decides what the law is. It consumes approved, versioned
 * P10/P11 evidence plus contract, mandate, approval, signature and actor state.
 * Unknown, stale or counsel-dependent inputs cannot become execution authority.
 */
export const LEGAL_EXECUTION_VERSION = 'p11-legal-execution-1.1.0';

export const EUROPE_33 = Object.freeze([
  'AT','BE','BG','HR','CY','CZ','DK','EE','FI','FR','DE','GR','HU','IE','IT','LV','LT','LU','MT','NL','PL','PT','RO','SK','SI','ES','SE','NO','IS','LI','CH','GB','AD',
]);

type ActionPolicy = {
  regulatory_activity:string;
  consequential:boolean;
  authority_scope?:string;
  contract_required:boolean;
  approval:'NOT_REQUIRED'|'POLICY'|'REQUIRED';
  minimum_signature:string;
  ai_forbidden?:boolean;
  high_assurance?:boolean;
};

export const ACTION_POLICIES:Readonly<Record<string,ActionPolicy>> = Object.freeze({
  ANALYZE:{regulatory_activity:'ANALYSIS',consequential:false,contract_required:false,approval:'NOT_REQUIRED',minimum_signature:'NONE'},
  B2B_OUTREACH:{regulatory_activity:'B2B_OUTREACH',consequential:true,contract_required:false,approval:'NOT_REQUIRED',minimum_signature:'NONE'},
  PARTNER_OUTREACH:{regulatory_activity:'PARTNER_REFERRAL',consequential:true,contract_required:false,approval:'NOT_REQUIRED',minimum_signature:'NONE'},
  MERCHANT_COMMUNICATION:{regulatory_activity:'CONTRACT_FACILITATION',consequential:true,contract_required:false,approval:'NOT_REQUIRED',minimum_signature:'NONE'},
  ACCEPT_RECOVER_MANDATE:{regulatory_activity:'MANDATE',consequential:true,contract_required:false,approval:'NOT_REQUIRED',minimum_signature:'NONE',ai_forbidden:true},
  CONTACT_PROVIDER:{regulatory_activity:'PROVIDER_CONTACT',consequential:true,authority_scope:'CONTACT_PROVIDER',contract_required:true,approval:'NOT_REQUIRED',minimum_signature:'SIMPLE_E_SIGNATURE'},
  REQUEST_PROVIDER_INFORMATION:{regulatory_activity:'PROVIDER_CONTACT',consequential:true,authority_scope:'REQUEST_PROVIDER_INFORMATION',contract_required:true,approval:'NOT_REQUIRED',minimum_signature:'SIMPLE_E_SIGNATURE'},
  REQUEST_PRICING_QUOTE:{regulatory_activity:'NEGOTIATION',consequential:true,authority_scope:'REQUEST_PRICING_QUOTE',contract_required:true,approval:'NOT_REQUIRED',minimum_signature:'SIMPLE_E_SIGNATURE'},
  NEGOTIATE_PRICING:{regulatory_activity:'NEGOTIATION',consequential:true,authority_scope:'NEGOTIATE_PRICING',contract_required:true,approval:'POLICY',minimum_signature:'SIMPLE_E_SIGNATURE'},
  COORDINATE_MIGRATION:{regulatory_activity:'MIGRATION_FACILITATION',consequential:true,authority_scope:'COORDINATE_MIGRATION',contract_required:true,approval:'POLICY',minimum_signature:'SIMPLE_E_SIGNATURE'},
  AUTHORIZE_MIGRATION:{regulatory_activity:'MIGRATION_FACILITATION',consequential:true,authority_scope:'AUTHORIZE_MIGRATION',contract_required:true,approval:'REQUIRED',minimum_signature:'ADVANCED_E_SIGNATURE',ai_forbidden:true},
  ACCEPT_PROVIDER_CONTRACT:{regulatory_activity:'CONTRACT_FACILITATION',consequential:true,authority_scope:'ACCEPT_PROVIDER_CONTRACT',contract_required:true,approval:'REQUIRED',minimum_signature:'POLICY_DEFINED',ai_forbidden:true},
  SIGN_PROVIDER_CONTRACT:{regulatory_activity:'CONTRACT_FACILITATION',consequential:true,authority_scope:'SIGN_PROVIDER_CONTRACT',contract_required:true,approval:'REQUIRED',minimum_signature:'POLICY_DEFINED',ai_forbidden:true},
  CHANGE_SETTLEMENT_BANK_DETAILS:{regulatory_activity:'PAYMENT_INITIATION',consequential:true,authority_scope:'CHANGE_SETTLEMENT_BANK_DETAILS',contract_required:true,approval:'REQUIRED',minimum_signature:'ADVANCED_E_SIGNATURE',ai_forbidden:true,high_assurance:true},
  ACCESS_PAYMENT_ACCOUNT_DATA:{regulatory_activity:'ACCOUNT_INFORMATION_ACCESS',consequential:true,authority_scope:'ACCESS_PAYMENT_ACCOUNT_DATA',contract_required:true,approval:'REQUIRED',minimum_signature:'POLICY_DEFINED',ai_forbidden:true},
  INITIATE_PAYMENT:{regulatory_activity:'PAYMENT_INITIATION',consequential:true,authority_scope:'INITIATE_PAYMENT',contract_required:true,approval:'REQUIRED',minimum_signature:'ADVANCED_E_SIGNATURE',ai_forbidden:true,high_assurance:true},
  AUTHORIZE_CAMBRA_BILLING:{regulatory_activity:'BILLING_SUCCESS_FEES',consequential:true,authority_scope:'AUTHORIZE_CAMBRA_BILLING',contract_required:true,approval:'POLICY',minimum_signature:'SIMPLE_E_SIGNATURE'},
});

const P10_BLOCK = new Set(['PROHIBITED','REGISTRATION_REQUIRED','AUTHORIZATION_REQUIRED','PARTNER_REQUIRED','BLOCK']);
const P10_REVIEW = new Set(['UNCERTAIN','LEGAL_REVIEW_REQUIRED','NOT_EVALUATED','UNKNOWN','']);
const P10_ALLOW = new Set(['ALLOWED','ALLOWED_WITH_CONDITIONS','ALLOW','ALLOW_WITH_CONDITIONS','NOT_REGULATED']);
const SIGNATURE_RANK:Record<string,number>={NONE:0,CLICK_ACCEPTANCE:1,SIMPLE_E_SIGNATURE:2,ADVANCED_E_SIGNATURE:3,QUALIFIED_E_SIGNATURE:4,WET_SIGNATURE:5};

function current(row:any,at:number){
  if(!row||row.active===false)return false;
  const from=row.effective_from?Date.parse(row.effective_from):-Infinity;
  const to=row.effective_to?Date.parse(row.effective_to):Infinity;
  return (!row.effective_from||Number.isFinite(from))&&(!row.effective_to||Number.isFinite(to))&&from<=at&&at<to;
}

function decision(name:string,reasons:string[],input:any,extra:any={}){
  return {
    decision:name,allowed:['ALLOW','ALLOW_WITH_CONDITIONS'].includes(name),
    reason_codes:[...new Set(reasons)],missing_requirements:[...new Set(extra.missing_requirements||[])],
    conditions:[...new Set(extra.conditions||[])],authority_source:extra.authority_source||null,
    jurisdiction:String(input.market||'').toUpperCase()||null,requested_action:String(input.requested_action||'').toUpperCase(),
    policy_version:input.legal_policy?.version||null,regulatory_policy_version:input.regulatory_state?.policy_version||null,
    contract_version:input.contract_instance?.version||input.contract_instance?.template_version||null,
    mandate_version:input.mandate?.authority_model_version||input.mandate?.document_version||null,
    decision_timestamp:new Date(input.timestamp||Date.now()).toISOString(),engine_version:LEGAL_EXECUTION_VERSION,
  };
}

function approvalSatisfied(input:any){
  const approval=input.approval;
  if(!approval||String(approval.status||'').toUpperCase()!=='APPROVED')return{ok:false,reason:'MERCHANT_APPROVAL_REQUIRED'};
  const at=Date.parse(input.timestamp||new Date().toISOString());
  if(approval.expires_at&&Date.parse(approval.expires_at)<=at)return{ok:false,reason:'MERCHANT_APPROVAL_EXPIRED'};
  for(const [a,b] of [['merchant_id','merchant_id'],['provider_id','provider_id'],['case_id','case_id'],['action','requested_action']]){
    if(approval[a]&&String(approval[a])!==String(input[b]||''))return{ok:false,reason:'APPROVAL_SCOPE_MISMATCH'};
  }
  if(approval.payload_hash&&approval.payload_hash!==input.material_payload_hash)return{ok:false,reason:'MATERIAL_TERMS_CHANGED'};
  return{ok:true};
}

function signatureSatisfied(required:string,signature:any,capacity='VERIFIED'){
  if(required==='NONE')return true;
  if(['POLICY_DEFINED','LEGAL_REVIEW_REQUIRED'].includes(required))return false;
  const capacityOk=capacity==='DECLARATION'?['declared','verified'].includes(String(signature?.signer_capacity_status||'').toLowerCase()):signature?.signer_capacity_verified===true;
  return Boolean(signature?.evidence_valid&&signature?.document_hash_valid!==false&&capacityOk&&(SIGNATURE_RANK[String(signature?.level||'').toUpperCase()]??-1)>=(SIGNATURE_RANK[required]??99));
}

/** Pure P11 decision. All database state must be resolved server-side. */
export function canExecuteAction(input:any){
  const action=String(input.requested_action||'').toUpperCase();
  const policy=ACTION_POLICIES[action];
  const market=String(input.market||'').toUpperCase();
  const at=Date.parse(input.timestamp||new Date().toISOString());
  if(!policy)return decision('BLOCK',['ACTION_UNKNOWN'],input);
  if(!EUROPE_33.includes(market))return decision('BLOCK',['MARKET_UNKNOWN'],input);
  if(policy.consequential&&(input.kill_switch?.active===true||input.emergency_state?.legal_execution_paused===true))return decision('BLOCK',[input.kill_switch?.active?'EMERGENCY_KILL_SWITCH':'LEGAL_SAFE_MODE'],input);
  if(input.policy_conflict===true)return decision('HUMAN_REVIEW_REQUIRED',['POLICY_CONFLICT_REVIEW_REQUIRED'],input);

  const p10=String(input.regulatory_state?.status||'').toUpperCase();
  if(P10_BLOCK.has(p10))return decision('BLOCK',['REGULATORY_ACTIVITY_BLOCKED'],input);
  if(P10_REVIEW.has(p10)||!P10_ALLOW.has(p10))return decision('LEGAL_REVIEW_REQUIRED',['REGULATORY_POLICY_UNCERTAIN'],input,{missing_requirements:['current P10 decision with authoritative evidence']});

  const legal=String(input.legal_policy?.status||'').toUpperCase();
  if(['BLOCK','PROHIBITED','DISABLED'].includes(legal))return decision('BLOCK',['LEGAL_EXECUTION_POLICY_BLOCKED'],input);
  if(!['ALLOW','ALLOW_WITH_CONDITIONS'].includes(legal)||!current(input.legal_policy,at))return decision('LEGAL_REVIEW_REQUIRED',[input.legal_policy?.counsel_required?'COUNSEL_REVIEW_REQUIRED':'LEGAL_POLICY_UNCERTAIN'],input,{missing_requirements:['current approved P11 policy']});
  if(!['VERIFIED_PRIMARY','VERIFIED_MULTIPLE_PRIMARY','COUNSEL_APPROVED'].includes(String(input.legal_policy?.confidence||'')))return decision('LEGAL_REVIEW_REQUIRED',['LEGAL_POLICY_UNCERTAIN'],input,{missing_requirements:['sufficient legal provenance']});

  const actorType=String(input.actor?.type||'').toUpperCase();
  if(policy.ai_forbidden&&['AI','AI_AGENT','AUTOMATION'].includes(actorType))return decision('BLOCK',['AI_SELF_AUTHORIZATION_FORBIDDEN'],input);
  if(policy.consequential&&(!Array.isArray(input.actor?.allowed_actions)||!input.actor.allowed_actions.includes(action)))return decision('BLOCK',['ACTOR_AUTHORITY_MISSING'],input);

  if(policy.contract_required){
    const contract=input.contract_instance;
    if(!contract)return decision('BLOCK',['CONTRACT_REQUIRED'],input);
    if(!['ACTIVE','ACCEPTED','SIGNED'].includes(String(contract.status||'').toUpperCase())||!current(contract,at)||!contract.version)return decision('BLOCK',['CONTRACT_VERSION_INVALID'],input);
    if(contract.hash_valid!==true)return decision('BLOCK',[contract.hash_valid===false?'CONTRACT_HASH_MISMATCH':'CONTRACT_EVIDENCE_UNAVAILABLE'],input);
  }

  let authoritySource=null;
  if(policy.authority_scope){
    const mandate=input.mandate;
    const mandateStatus=String(mandate?.authority_status||mandate?.status||'').toUpperCase();
    if(!mandate||!['ACTIVE','LIMITED'].includes(mandateStatus))return decision('BLOCK',[mandateStatus==='REVOKED'?'MANDATE_REVOKED':'NO_ACTIVE_MANDATE'],input);
    if(!current({...mandate,effective_from:mandate.effective_from||mandate.signed_at},at))return decision('BLOCK',['MANDATE_EXPIRED'],input);
    if((input.authority_restrictions||[]).some((x:any)=>x.active!==false&&x.scope===policy.authority_scope&&current(x,at)))return decision('BLOCK',['AUTHORITY_RESTRICTED'],input);
    const grant=(input.authority_grants||[]).find((x:any)=>x.active!==false&&x.scope===policy.authority_scope&&current(x,at)&&(!x.provider_id||String(x.provider_id)===String(input.provider_id||''))&&(!x.case_id||String(x.case_id)===String(input.case_id||'')));
    if(!grant)return decision('BLOCK',['AUTHORITY_SCOPE_MISSING'],input,{missing_requirements:[policy.authority_scope]});
    authoritySource=grant.id||`${mandate.id}:${grant.scope}`;
  }

  const approvalRequired=policy.approval==='REQUIRED'||(policy.approval==='POLICY'&&input.legal_policy?.merchant_approval_required!==false);
  if(approvalRequired){const a=approvalSatisfied(input);if(!a.ok)return decision(a.reason==='MERCHANT_APPROVAL_REQUIRED'?'MERCHANT_APPROVAL_REQUIRED':'BLOCK',[a.reason],input,{authority_source:authoritySource});}
  const required=String(input.legal_policy?.signature_requirement||policy.minimum_signature).toUpperCase();
  if(!signatureSatisfied(required,input.signature_state,String(input.legal_policy?.signer_capacity_requirement||'VERIFIED').toUpperCase()))return decision(required==='POLICY_DEFINED'?'LEGAL_REVIEW_REQUIRED':'BLOCK',['SIGNATURE_REQUIREMENT_NOT_MET'],input,{authority_source:authoritySource});
  if(policy.high_assurance&&input.approval?.assurance_level!=='HIGH_ASSURANCE')return decision('BLOCK',['HIGH_ASSURANCE_REQUIRED'],input);
  const conditions=[...(input.regulatory_state?.conditions||[]),...(input.legal_policy?.conditions||[])];
  return decision(conditions.length?'ALLOW_WITH_CONDITIONS':'ALLOW',[],input,{authority_source:authoritySource,conditions});
}

export function canonicalize(value:any):string{
  if(value===null||typeof value!=='object')return JSON.stringify(value);
  if(Array.isArray(value))return`[${value.map(canonicalize).join(',')}]`;
  return`{${Object.keys(value).sort().map(k=>`${JSON.stringify(k)}:${canonicalize(value[k])}`).join(',')}}`;
}

export async function sha256Canonical(value:any){
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonicalize(value)));
  return[...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,'0')).join('');
}
