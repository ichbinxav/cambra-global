import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { recordApiUsage } from '../../base44/shared/apiUsage.ts';

function state() {
  let rows = [{ id:'u1', organization_id:'o1', period_month:'2026-08', request_count:9, billing_claim_revision:0, billed:false, created_date:'2026-08-01' }];
  return {
    rows: () => rows,
    svc: { entities: {
      Organization: { get: async () => ({ id:'o1', monthly_api_quota:10, overage_price_per_1k:1 }) },
      ApiUsageRecord: {
        filter: async () => structuredClone(rows),
        create: async (payload) => { const row={ id:`u${rows.length+1}`, ...payload }; rows.push(row); return row; },
        updateMany: async (filter, update) => {
          const row=rows.find((x)=>x.id===filter.id&&x.request_count===filter.request_count&&x.billing_claim_revision===filter.billing_claim_revision&&x.billed===filter.billed);
          if(!row)return {updated:0}; Object.assign(row,update.$set); return {updated:1};
        },
      },
    } },
  };
}

describe('API usage and MCP rate authority', () => {
  it('counts concurrent requests exactly once per caller and calculates aggregate overage', async () => {
    const s=state(),principal={raw:{organization_id:'o1'}};
    const results=await Promise.all(Array.from({length:5},()=>recordApiUsage(s.svc,principal,new Date('2026-08-13T12:00:00Z'))));
    expect(results.every((x)=>x.ok)).toBe(true);
    expect(s.rows().reduce((n,x)=>n+x.request_count,0)).toBe(14);
    expect(s.rows()[0].overage_count).toBe(4);
    expect(s.rows()[0].billing_claim_revision).toBe(5);
  });

  it('fails closed instead of recording into a claimed or billed period', async () => {
    const s=state();
    s.rows()[0].billing_run_id='billing-run';
    await expect(recordApiUsage(s.svc,{raw:{organization_id:'o1'}},new Date('2026-08-13T12:00:00Z'))).rejects.toThrow('api_usage_period_closed');
  });

  it('fails closed when billing authority is unavailable', async () => {
    const s=state();s.svc.entities.ApiUsageRecord.filter=async()=>{throw new Error('down')};
    await expect(recordApiUsage(s.svc,{raw:{organization_id:'o1'}})).rejects.toThrow();
  });

  it('routes REST and MCP through the same CAS helpers', () => {
    const rest=fs.readFileSync('base44/functions/apiV1/entry.ts','utf8');
    const mcp=fs.readFileSync('base44/functions/mcpServer/entry.ts','utf8');
    for(const source of [rest,mcp]){
      expect(source).toContain('consumeRateLimit');
      expect(source).toContain('recordApiUsage');
    }
    expect(mcp).not.toContain('RateLimitCounter.update(counter.id');
    expect(JSON.parse(fs.readFileSync('base44/entities/ApiUsageRecord.jsonc','utf8')).rls.write.user_condition.role).toBe('__service_role_only__');
  });
});
