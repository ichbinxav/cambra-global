import {describe,expect,it} from 'vitest';
import fs from 'node:fs';
import {alertRetryDecision,incidentAlertKey,incidentAlertSeverity,recipientFingerprint} from '../../base44/shared/incidentAlerting.ts';

describe('critical incident external alerting',()=>{
  it('pushes only HIGH/CRITICAL and never routine warnings',()=>{
    expect(incidentAlertSeverity({severity:'warning',customer_impact:'none',legal_risk:'none'})).toBeNull();
    expect(incidentAlertSeverity({severity:'warning',customer_impact:'high'})).toBe('HIGH');
    expect(incidentAlertSeverity({severity:'critical'})).toBe('CRITICAL');
  });
  it('deduplicates delivered alerts and applies retry cooldown',()=>{
    expect(alertRetryDecision({status:'DELIVERED'}).allowed).toBe(false);
    expect(alertRetryDecision({status:'RETRY_PENDING',attempt_count:1,next_retry_at:new Date(Date.now()+60000).toISOString()}).reason).toBe('retry_cooldown');
    expect(incidentAlertKey({id:'abc'},'CRITICAL')).toBe('incident:abc:CRITICAL');
  });
  it('does not surface the complete configured address in the ledger',()=>{
    expect(recipientFingerprint('founder@example.com')).toBe('f***@example.com');
  });
  it('persists configuration and delivery failures instead of faking SENT',()=>{
    const source=fs.readFileSync('base44/shared/incidentAlerting.ts','utf8');
    expect(source).toContain("Deno.env.get('FOUNDER_ALERT_EMAIL')||Deno.env.get('FOUNDER_EMAIL')||Deno.env.get('ADMIN_NOTIFICATION_EMAIL')");
    expect(source).toContain("status:'CONFIGURATION_REQUIRED'");
    expect(source).toContain("terminal?'FAILED':'RETRY_PENDING'");
    expect(source).toContain('sendCostGovernedEmail');
  });
});
