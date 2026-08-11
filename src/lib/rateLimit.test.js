import {describe,expect,it} from 'vitest';
import fs from 'node:fs';
import {consumeRateLimit,rateLimitWindow} from '../../base44/shared/rateLimit.ts';

function service(initial=[]){let rows=initial.map((row,i)=>({id:`r${i}`,...row})),seq=rows.length;return{rows,entities:{RateLimitCounter:{filter:async(query)=>rows.filter(row=>row.principal_id===query.principal_id&&row.window_start===query.window_start),create:async(row)=>{const saved={id:`r${seq++}`,created_date:`2026-08-11T00:00:0${seq}Z`,...row};rows.push(saved);return saved},updateMany:async(query,patch)=>{const row=rows.find(item=>item.id===query.id&&item.window_start===query.window_start&&item.count===query.count);if(!row)return{updated:0};Object.assign(row,patch.$set);return{updated:1}}}}};}

describe('central CAS rate limiter',()=>{
  it('uses deterministic windows and fails at the configured boundary',async()=>{const at=new Date('2026-08-11T12:34:30Z'),svc=service();expect(rateLimitWindow(60,at).window_start).toBe('2026-08-11T12:34:00.000Z');expect((await consumeRateLimit(svc,{principal_id:'p',principal_type:'ip',limit:2,window_seconds:60,at})).ok).toBe(true);expect((await consumeRateLimit(svc,{principal_id:'p',principal_type:'ip',limit:2,window_seconds:60,at})).ok).toBe(true);expect(await consumeRateLimit(svc,{principal_id:'p',principal_type:'ip',limit:2,window_seconds:60,at})).toMatchObject({ok:false,reason:'rate_limited'})});
  it('sums duplicate bucket rows, so a create race cannot increase capacity',async()=>{const window='2026-08-11T12:00:00.000Z',svc=service([{principal_id:'p',window_start:window,count:2},{principal_id:'p',window_start:window,count:2}]);expect(await consumeRateLimit(svc,{principal_id:'p',principal_type:'ip',limit:4,window_seconds:3600,at:new Date('2026-08-11T12:30:00Z')})).toMatchObject({ok:false,reason:'rate_limited'})});
  it('is the single limiter used by every public/API endpoint in scope',()=>{for(const file of ['submitWaitlistSignup','submitContactMessage','getPaymentsGapTeaser','submitPaymentsAnalysis','apiV1'])expect(fs.readFileSync(`base44/functions/${file}/entry.ts`,'utf8')).toContain('consumeRateLimit')});
});
