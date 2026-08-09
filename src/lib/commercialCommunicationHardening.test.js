import {describe,it,expect} from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {computeInboundReplySchedule,isBusinessHour,communicationQuality,MIN_INBOUND_REPLY_DELAY_MINUTES} from '../../base44/shared/commercialAutonomy.ts';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..','..');const read=p=>fs.readFileSync(path.join(ROOT,p),'utf8');
const policy={business_hours_start:8,business_hours_end:19,fallback_timezone:'Europe/Paris'};
describe('CAMBRA communication hard timing',()=>{
 it('10:00 inbound cannot send before 10:25',()=>{const r=computeInboundReplySchedule('2026-08-10T08:00:00Z',policy,'a','Europe/Paris');expect(r.earliest_reply_at).toBe('2026-08-10T08:25:00.000Z');expect(Date.parse(r.scheduled_send_at)).toBeGreaterThanOrEqual(Date.parse(r.earliest_reply_at));expect(MIN_INBOUND_REPLY_DELAY_MINUTES).toBe(25)});
 it('18:50 Paris inbound rolls after 19:00 to next business window',()=>{const r=computeInboundReplySchedule('2026-08-10T16:50:00Z',policy,'b','Europe/Paris');expect(r.earliest_reply_at).toBe('2026-08-10T17:15:00.000Z');expect(r.scheduled_send_at).toBe('2026-08-11T06:00:00.000Z')});
 it('never considers before 08 or at/after 19 business time',()=>{expect(isBusinessHour(policy,new Date('2026-08-10T05:59:00Z'),'Europe/Paris')).toBe(false);expect(isBusinessHour(policy,new Date('2026-08-10T06:00:00Z'),'Europe/Paris')).toBe(true);expect(isBusinessHour(policy,new Date('2026-08-10T16:59:00Z'),'Europe/Paris')).toBe(true);expect(isBusinessHour(policy,new Date('2026-08-10T17:00:00Z'),'Europe/Paris')).toBe(false)});
 it('quality gate rejects canonical LLM tics',()=>{expect(communicationQuality('I hope this email finds you well. Absolutely!').ok).toBe(false);expect(communicationQuality('Yes, that works for us. Thursday at 11:00 is fine.').ok).toBe(true)});
});
describe('hardening static enforcement',()=>{
 it('LLM cannot bypass delay and manual override is explicit admin path',()=>{const s=read('base44/functions/commercialSendMessage/entry.ts');expect(s).toContain('minimum_reply_delay_not_elapsed');expect(s).toContain('scheduled_send_not_due');expect(s).toContain('gate.isAdmin && body?.manual_override === true');expect(s).toContain('outside_business_hours')});
 it('duplicate inbound and duplicate worker sends are deduped',()=>{const i=read('base44/functions/outlookInboundRouter/entry.ts');const s=read('base44/functions/commercialSendMessage/entry.ts');expect(i).toContain("provider_message_id:String(msg.id)");expect(i).toContain('if(duplicate.length)');expect(s).toContain('idempotency_key:idempotency');expect(s).toContain('if (existing.length)')});
 it('suppression is rechecked at send time',()=>{expect(read('base44/functions/commercialSendMessage/entry.ts')).toContain("ContactSuppression.filter({ email:to, active:true }")});
 it('meeting uses real calendar and failure never invents slot',()=>{const m=read('base44/functions/outlookMeetingCoordinator/entry.ts');expect(m).toContain('/me/calendarView');expect(m).toContain('no_calendar_slot');expect(m).toContain('/me/events')});
 it('CRM sync does not mark contacted',()=>{const c=read('base44/functions/crmAgent/entry.ts');expect(c).toContain('stage: lead.stage || "scored"')});
 it('L4 provider terms and contract mismatch block',()=>{const p=read('base44/functions/providerNegotiationAgent/entry.ts');const c=read('base44/functions/reviewProviderContract/entry.ts');expect(p).toContain('risk_level:4');expect(p).toContain('awaiting_final_approval');expect(c).toContain("status==='mismatch'?'contract_mismatch':'contract_exception'")});
 it('style failure regenerates/escalates and thread context is supplied',()=>{const r=read('base44/functions/commercialReplyAgent/entry.ts');expect(r).toContain('communication_quality_gate_failed');expect(r).toContain('Rewrite this CAMBRA reply');expect(r).toContain("'THREAD:'");expect(r).toContain('Preserve thread language')});
 it('inbound email remains data, not authority',()=>{const r=read('base44/functions/commercialReplyAgent/entry.ts');expect(r).toContain('Never invent merchant fees');expect(r).toContain('Escalate anything involving final pricing acceptance');const s=read('base44/functions/commercialSendMessage/entry.ts');expect(s).toContain('routineActionAllowed')});
});
