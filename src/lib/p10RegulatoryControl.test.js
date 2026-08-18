import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { conservativePolicy, decideRegulatoryActivity, REGULATORY_ACTIVITIES } from '../../base44/shared/regulatoryControl.ts';

const read = (path) => fs.readFileSync(path, 'utf8');
const primaryEvidence = { id:'ev-1',active:true,review_status:'VERIFIED',source_tier:'PRIMARY_AUTHORITY',source_url:'https://authority.example/rule',effective_from:'2026-01-01T00:00:00Z',next_review_at:'2027-01-01T00:00:00Z' };
const basePolicy = { id:'policy-1',policy_key:'policy-1',jurisdiction:'FR',activity:'NEGOTIATION',status:'ALLOWED',active:true,effective_from:'2026-01-01T00:00:00Z',next_review_at:'2027-01-01T00:00:00Z',policy_version:'legal-reviewed-1',conditions_json:{} };

describe('P10 regulatory control', () => {
  it('covers every material activity and never treats unknown as allowed', () => {
    expect(REGULATORY_ACTIVITIES).toHaveLength(17);
    expect(REGULATORY_ACTIVITIES).toEqual(expect.arrayContaining(['ANALYSIS','ADVISORY','NEGOTIATION','MIGRATION_FACILITATION','ACCOUNT_INFORMATION_ACCESS','PAYMENT_INITIATION','FUND_HANDLING','BILLING_SUCCESS_FEES','B2B_OUTREACH','DATA_ENRICHMENT']));
    expect(decideRegulatoryActivity({ jurisdiction:'FR',activity:'NEGOTIATION' })).toMatchObject({ allowed:false,outcome:'REVIEW',reason_code:'policy_missing' });
  });

  it('seeds all market/activity combinations as review required rather than inventing permission', () => {
    const policy = conservativePolicy('ES', 'B2B_OUTREACH', '2026-08-11T00:00:00Z');
    expect(policy).toMatchObject({ status:'LEGAL_REVIEW_REQUIRED',evidence_refs:[],reason_code:'unreviewed_market_activity' });
    const seed = read('base44/shared/logical/seedP10RegulatoryControl.ts');
    expect(seed).toContain('EUROPE_MARKETS.length * REGULATORY_ACTIVITIES.length');
    expect(seed).toContain('permission_claims_created:0');
  });

  it('requires current verified primary-authority evidence before ALLOW', () => {
    expect(decideRegulatoryActivity({ jurisdiction:'FR',activity:'NEGOTIATION',policy:basePolicy,evidence:[],now:'2026-08-11T00:00:00Z' })).toMatchObject({ allowed:false,outcome:'REVIEW',reason_code:'current_primary_authority_evidence_required' });
    expect(decideRegulatoryActivity({ jurisdiction:'FR',activity:'NEGOTIATION',policy:basePolicy,evidence:[primaryEvidence],now:'2026-08-11T00:00:00Z' })).toMatchObject({ allowed:true,outcome:'ALLOW',evidence_ids:['ev-1'] });
  });

  it('cannot average away prohibition, registration, partner or missing conditions', () => {
    expect(decideRegulatoryActivity({ jurisdiction:'FR',activity:'NEGOTIATION',policy:{ ...basePolicy,status:'PROHIBITED' },evidence:[primaryEvidence] })).toMatchObject({ allowed:false,outcome:'BLOCK' });
    expect(decideRegulatoryActivity({ jurisdiction:'FR',activity:'NEGOTIATION',policy:{ ...basePolicy,status:'AUTHORIZATION_REQUIRED' },evidence:[primaryEvidence] })).toMatchObject({ allowed:false,outcome:'BLOCK',reason_code:'required_registration_or_authorization_not_proven' });
    expect(decideRegulatoryActivity({ jurisdiction:'FR',activity:'NEGOTIATION',policy:{ ...basePolicy,status:'PARTNER_REQUIRED' },evidence:[primaryEvidence] })).toMatchObject({ allowed:false,outcome:'BLOCK',reason_code:'required_authorized_partner_not_proven' });
    expect(decideRegulatoryActivity({ jurisdiction:'FR',activity:'NEGOTIATION',policy:{ ...basePolicy,status:'ALLOWED_WITH_CONDITIONS',conditions_json:{ required_conditions:['merchant_disclosure'] } },evidence:[primaryEvidence] })).toMatchObject({ allowed:false,outcome:'REVIEW',missing_conditions:['merchant_disclosure'] });
  });

  it('validates passporting and host notification instead of assuming EU-wide permission', () => {
    const policy = { ...basePolicy,status:'AUTHORIZATION_REQUIRED',cross_border_model:'PASSPORTING_POSSIBLE',host_notification_required:true };
    const registration = { id:'reg-1',active:true,status:'PASSPORTED',jurisdiction:'ES',activity_scope:['NEGOTIATION'],passport_markets:['FR'],host_notifications:[],effective_from:'2026-01-01T00:00:00Z',effective_to:'2027-01-01T00:00:00Z' };
    expect(decideRegulatoryActivity({ jurisdiction:'FR',activity:'NEGOTIATION',policy,evidence:[primaryEvidence],registrations:[registration],now:'2026-08-11T00:00:00Z' }).allowed).toBe(false);
    expect(decideRegulatoryActivity({ jurisdiction:'FR',activity:'NEGOTIATION',policy,evidence:[primaryEvidence],registrations:[{ ...registration,host_notifications:['FR'] }],now:'2026-08-11T00:00:00Z' })).toMatchObject({ allowed:true,outcome:'CONDITIONS',registration_id:'reg-1' });
  });

  it('plugs P10 into the canonical production capability gate with no regulatory override path', () => {
    const runtime = read('base44/shared/marketPolicyRuntime.ts');
    expect(runtime).toContain('evaluateRegulatoryActivityRuntime');
    expect(runtime).toContain('`p10_${regulatoryDecision.reason_code}`');
    for (const path of ['base44/functions/commercialSendMessage/entry.ts','base44/functions/startPaymentsMigration/entry.ts','base44/functions/createEligibleRecoverInvoices/entry.ts','base44/functions/startRecoverAcceptance/entry.ts']) expect(read(path)).toContain('assertMarketCapabilityAllowed');
  });

  it('monitors expiry without auto-promoting legal conclusions', () => {
    const worker = read('base44/shared/logical/regulatoryMonitoringWorker.ts');
    expect(worker).toContain('auto_promoted:false');
    expect(worker).toContain('legal_conclusions_changed:false');
    expect(worker).not.toMatch(/RegulatoryPolicyVersion\.(update|create)/);
  });

  it('models evidence, policy, registration, partner and auditable decisions', () => {
    for (const name of ['RegulatoryEvidence','RegulatoryPolicyVersion','RegulatoryRegistration','RegulatoryPartnerMandate','ComplianceDecision','RegulatoryChangeCandidate']) expect(fs.existsSync(`base44/entities/${name}.jsonc`)).toBe(true);
  });
});
