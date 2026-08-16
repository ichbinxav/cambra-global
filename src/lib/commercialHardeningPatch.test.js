import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { automaticSendGovernorDecision, followUpRunBudget, routineActionAllowed } from '../../base44/shared/commercialAutonomy.ts';
import { authorityForAgent } from '../../base44/shared/agentAuthority.ts';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..','..');
const read=(p)=>fs.readFileSync(path.join(ROOT,p),'utf8');
const activePolicy={status:'active',approved_at:'2026-08-11T00:00:00.000Z',approved_by:'founder@cambra.global',effective_at:'2026-08-11T00:00:00.000Z',daily_send_limit:40,allowed_routine_actions:['initial_outreach','partner_outreach','follow_up','routine_reply'],prohibited_actions:[]};

describe('v0.90.1 commercial hardening patch',()=>{
  it('represents cold first touch honestly instead of as inbound interest',()=>{
    expect(routineActionAllowed(activePolicy,'initial_outreach','initial_outreach').allowed).toBe(true);
    expect(routineActionAllowed(activePolicy,'partner_outreach','partner_outreach').allowed).toBe(true);
    for(const file of ['base44/functions/outboundVolumeWorker/entry.ts','base44/functions/autonomousCommercialWorker/entry.ts']){
      const src=read(file);expect(src).toMatch(/classification:\s*["']initial_outreach["']/);expect(src).not.toMatch(/action(?:\s*:\s*'initial_outreach'|),classification:'interested'/);
    }
    expect(read('base44/functions/autonomousPartnerWorker/entry.ts')).toContain("classification:'partner_outreach'");
  });

  it('fails closed for every automatic send without both central daily budgets',()=>{
    const profile={status:'active',current_daily_cap:30};
    expect(automaticSendGovernorDecision({automatic:true,sendingProfile:null,profileSentToday:0,policy:activePolicy,policySentToday:0}).reason).toBe('sending_profile_required');
    expect(automaticSendGovernorDecision({automatic:true,sendingProfile:profile,profileSentToday:30,policy:activePolicy,policySentToday:0}).reason).toBe('sending_profile_daily_cap_reached');
    expect(automaticSendGovernorDecision({automatic:true,sendingProfile:profile,profileSentToday:0,policy:activePolicy,policySentToday:40}).reason).toBe('policy_daily_send_limit_reached');
    expect(automaticSendGovernorDecision({automatic:true,sendingProfile:profile,profileSentToday:0,policy:{...activePolicy,daily_send_limit:0},policySentToday:0}).reason).toBe('policy_daily_send_limit_invalid');
  });

  it('applies profile and policy caps centrally to follow-ups, replies and future workers',()=>{
    const src=read('base44/functions/commercialSendMessage/entry.ts');
    expect(src).toContain('automaticSendGovernorDecision');
    expect(src).toMatch(/policySentToday:\s*policySent\.length/);
    expect(src).toContain('claimCommercialSendSlot');
    expect(src).toContain("agent_send_authority_required");
    expect(src).not.toContain('if(automatic&&policy&&Number(policy.daily_send_limit||0)>0)');
    expect(authorityForAgent('unknown_future_sender').CAN_SEND).toBe(false);
  });

  it('requires an actual admin and durable audit for manual override',()=>{
    const src=read('base44/functions/commercialSendMessage/entry.ts');
    expect(src).toMatch(/manualOverrideRequested\s*&&\s*!gate\.isAdmin/);
    expect(src).toMatch(/action_type:\s*["']commercial_send_manual_override["']/);
    expect(src).toContain("manual_override_audit_required");
  });

  it('stops follow-up work before history lookup or LLM drafting at its bounded budget',()=>{
    expect(followUpRunBudget(false,50)).toBe(25);
    expect(followUpRunBudget(true,999)).toBe(50);
    expect(followUpRunBudget(true,7)).toBe(7);
    const src=read('base44/functions/commercialFollowUpWorker/entry.ts');
    const budget=src.search(/if\s*\(sent\s*>=\s*runBudget\)/);
    expect(budget).toBeGreaterThan(0);
    expect(budget).toBeLessThan(src.indexOf('CommunicationMessage.filter'));
    expect(budget).toBeLessThan(src.search(/const prompt\s*=/));
    expect(src).toContain('future pass');
  });

  it('checks idempotency before consuming central capacity, so retry cannot send twice',()=>{
    const src=read('base44/functions/commercialSendMessage/entry.ts');
    const idempotencyRead=src.indexOf('const idempotencyRead = await readCommercialSendIdempotency(');
    const governorDecision=src.indexOf('automaticSendGovernorDecision({');
    expect(idempotencyRead).toBeGreaterThan(0);
    expect(governorDecision).toBeGreaterThan(idempotencyRead);
    expect(src).toMatch(/resendProviderIdempotencyKey\s*=\s*requireResendIdempotencyKey\(\s*idempotency\s*,?\s*\)/);
    expect(src).toMatch(/["']Idempotency-Key["']:\s*resendProviderIdempotencyKey/);
  });
});
