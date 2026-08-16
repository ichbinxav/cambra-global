import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { ACTION_POLICIES, EUROPE_33, canExecuteAction, canonicalize } from '../../base44/shared/legalExecution.ts';

const NOW='2026-08-11T12:00:00.000Z';
function valid(action='B2B_OUTREACH',overrides={}){
  const scope=ACTION_POLICIES[action]?.authority_scope;
  return{
    requested_action:action,market:'ES',timestamp:NOW,merchant_id:'m1',provider_id:'p1',case_id:'c1',material_payload_hash:'h1',
    regulatory_state:{status:'ALLOWED',policy_version:'p10-1',conditions:[]},
    legal_policy:{status:'ALLOW',confidence:'COUNSEL_APPROVED',version:'p11-1',review_status:'COUNSEL_APPROVED',effective_from:'2026-01-01T00:00:00.000Z',active:true,merchant_approval_required:false,signature_requirement:scope?'SIMPLE_E_SIGNATURE':'NONE',conditions:[]},
    actor:{id:'agent',type:'AUTOMATION',allowed_actions:[action]},
    mandate:scope?{id:'mandate-1',status:'active',document_version:'v1',signed_at:'2026-01-01T00:00:00.000Z'}:null,
    authority_grants:scope?[{id:'grant-1',scope,active:true,provider_id:'p1',case_id:'c1',effective_from:'2026-01-01T00:00:00.000Z'}]:[],authority_restrictions:[],
    contract_instance:scope?{id:'contract-1',status:'ACCEPTED',version:'v1',hash_valid:true,effective_from:'2026-01-01T00:00:00.000Z'}:null,
    signature_state:scope?{level:'ADVANCED_E_SIGNATURE',evidence_valid:true,document_hash_valid:true,signer_capacity_verified:true,signer_capacity_status:'verified'}:null,
    ...overrides,
  };
}

describe('P11 legal execution and commercial compatibility',()=>{
  it('covers the canonical Europe-33 and known actions',()=>{expect(EUROPE_33).toHaveLength(33);expect(new Set(EUROPE_33).size).toBe(33);expect(ACTION_POLICIES.B2B_OUTREACH.regulatory_activity).toBe('B2B_OUTREACH');});
  it('allows only fully evidenced non-binding outreach',()=>{expect(canExecuteAction(valid()).decision).toBe('ALLOW');});
  it('does not let commercial automation bypass a P11 legal BLOCK',()=>{const r=canExecuteAction(valid('B2B_OUTREACH',{legal_policy:{...valid().legal_policy,status:'BLOCK'}}));expect(r.allowed).toBe(false);expect(r.reason_codes).toContain('LEGAL_EXECUTION_POLICY_BLOCKED');});
  it('fails closed on missing P10/P11 evidence and legal kill switches',()=>{
    expect(canExecuteAction(valid('B2B_OUTREACH',{regulatory_state:{status:'LEGAL_REVIEW_REQUIRED'}})).decision).toBe('LEGAL_REVIEW_REQUIRED');
    expect(canExecuteAction(valid('B2B_OUTREACH',{legal_policy:null})).decision).toBe('LEGAL_REVIEW_REQUIRED');
    expect(canExecuteAction(valid('B2B_OUTREACH',{kill_switch:{active:true}})).decision).toBe('BLOCK');
  });
  it('enforces actor, contract, mandate, scope and restrictions for provider negotiation',()=>{
    expect(canExecuteAction(valid('NEGOTIATE_PRICING',{actor:{type:'AUTOMATION',allowed_actions:[]}})).reason_codes).toContain('ACTOR_AUTHORITY_MISSING');
    expect(canExecuteAction(valid('NEGOTIATE_PRICING',{contract_instance:null})).reason_codes).toContain('CONTRACT_REQUIRED');
    expect(canExecuteAction(valid('NEGOTIATE_PRICING',{mandate:null})).reason_codes).toContain('NO_ACTIVE_MANDATE');
    expect(canExecuteAction(valid('NEGOTIATE_PRICING',{authority_grants:[]})).reason_codes).toContain('AUTHORITY_SCOPE_MISSING');
    expect(canExecuteAction(valid('NEGOTIATE_PRICING',{authority_restrictions:[{scope:'NEGOTIATE_PRICING',active:true,effective_from:'2026-01-01T00:00:00.000Z'}]})).reason_codes).toContain('AUTHORITY_RESTRICTED');
  });
  it('preserves deterministic canonical evidence hashes',()=>{expect(canonicalize({b:2,a:{d:4,c:3}})).toBe(canonicalize({a:{c:3,d:4},b:2}));});
  it('places P10/P11 before commercial policy and makes legal evidence part of each send',()=>{
    const src=fs.readFileSync('base44/functions/commercialSendMessage/entry.ts','utf8');
    expect(src.indexOf('await assertMarketCapabilityAllowed')).toBeLessThan(src.indexOf('await enforceLegalExecution'));
    expect(src.indexOf('await enforceLegalExecution')).toBeLessThan(src.indexOf('const policyAuthority = await readExactCommercialPolicy'));
    expect(src).toContain('authority_snapshot_hash');
  });
  it('gates every material Recover execution boundary before its first external or state-changing effect',()=>{
    const acceptance=fs.readFileSync('base44/functions/acceptRecoverMandate/entry.ts','utf8');
    const startMigration=fs.readFileSync('base44/functions/startPaymentsMigration/entry.ts','utf8');
    const migrationTask=fs.readFileSync('base44/functions/updatePaymentsMigrationTask/entry.ts','utf8');
    const negotiation=fs.readFileSync('base44/functions/startProviderNegotiation/entry.ts','utf8');
    const billing=fs.readFileSync('base44/functions/createEligibleRecoverInvoices/entry.ts','utf8');
    expect(acceptance.indexOf("requested_action:'ACCEPT_RECOVER_MANDATE'")).toBeLessThan(acceptance.indexOf('Mandate.update(mandate_id'));
    expect(startMigration.indexOf("requested_action:'COORDINATE_MIGRATION'")).toBeLessThan(startMigration.indexOf('DealActivation.updateMany'));
    expect(migrationTask.indexOf("requested_action:'AUTHORIZE_MIGRATION'")).toBeLessThan(migrationTask.indexOf('MigrationTask.updateMany'));
    expect(negotiation.indexOf("requested_action:'NEGOTIATE_PRICING'")).toBeLessThan(negotiation.indexOf('NegotiationCase.create'));
    const billingAuthority = billing.indexOf('requested_action: "AUTHORIZE_CAMBRA_BILLING"');
    const billingClaim = billing.indexOf('claimRecoverInvoiceDraft(');
    const billingProvider = billing.indexOf('return executeRecoverBillingProviderRequest(svc, claim, {');
    expect(billingAuthority).toBeGreaterThan(-1);
    expect(billingAuthority).toBeLessThan(billingClaim);
    expect(billingAuthority).toBeLessThan(billingProvider);
    expect(billing).not.toMatch(/\bstripeRequest\s*\(/);
    for(const src of [acceptance,startMigration,migrationTask,negotiation,billing])expect(src).toMatch(/enforceLegalExecution|evaluateLegalExecution/);
  });
  it('keeps policy publication, kill switches and authority grants strict-admin and evidence-gated',()=>{
    const src=fs.readFileSync('base44/functions/manageLegalExecution/entry.ts','utf8');
    expect(src).toContain("user?.role!=='admin'");
    expect(src).toContain('allow_requires_approved_review_confidence_and_evidence');
    expect(src).toContain("mandate.status!=='active'");
    expect(src).toContain('signed_mandate_and_authority_evidence_required');
    expect(src).toContain("action==='verify_signer_capacity'");
    expect(src).toContain("action==='activate_kill_switch'");
    expect(src).not.toContain('requireAdminOrInternal');
  });
});
