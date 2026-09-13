const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { webcrypto } = require('node:crypto');
const { transformSync } = require('esbuild');
const source = fs.readFileSync('base44/functions/checkin-wallet-demo/entry.ts','utf8').replace(/^import .*;$/gm,'');
const writes = [], sessions = new Map(), intents = new Map(), idempotency = new Map();
let serial = 0;
const sandbox = { module:{exports:{}}, TextEncoder, TextDecoder, Response, URL, btoa, atob, crypto:webcrypto, Deno:{serve(){}},
  createClientFromRequest:()=>({auth:{me:async()=>null},asServiceRole:{}}),
  assertBillingAccount:async()=>{},getPublishableKey:()=>'pk_live_mock',getSecretKey:()=>'mock_secret_for_tests',
  captureEmergencyEpoch:async()=>({}),guardedEmergencyEffect:async(_svc,x)=>x.effect(),
  stripeRequest:async(_mode,method,path,params,key)=>{
    if(method==='GET'){
      if(path==='payment_method_domains')return {ok:true,data:{data:[{enabled:true,domain_name:'cambra.global',apple_pay:{status:'active'},google_pay:{status:'active'}}]}};
      const d=path.startsWith('checkout/sessions/')?sessions.get(path.slice(18)):intents.get(path.slice(14));
      return {ok:!!d,data:d};
    }
    assert.ok(['customers','checkout/sessions'].includes(path), 'No payment creation endpoint');
    writes.push({path,params,key});
    if(idempotency.has(key))return {ok:true,data:idempotency.get(key)};
    let d;
    if(path==='customers')d={id:'cus_'+(++serial)};
    else{
      assert.equal(params.mode,'setup');assert.equal(params.currency,'eur');
      assert.equal(params['payment_method_types[0]'],'card');assert.ok(!params['line_items[0][price]']);
      assert.equal(params['setup_intent_data[metadata][consent_scope]'],'save_for_trial_only_no_future_charges');
      assert.equal(params.success_url,'https://cambra.global/checkin-demo?checkout_session_id={CHECKOUT_SESSION_ID}');
      d={id:'cs_live_'+(++serial),mode:'setup',livemode:true,status:'open',url:'https://checkout.stripe.com/c/pay/mock',metadata:{purpose:params['metadata[purpose]'],session:params['metadata[session]'],profile:params['metadata[profile]']}};
      sessions.set(d.id,d);
    }
    idempotency.set(key,d);return {ok:true,data:d};
  }};
vm.runInNewContext(transformSync(source,{loader:'ts',format:'cjs'}).code,sandbox);
async function call(body){const r=await sandbox.module.exports.handler(new Request('https://cambra.global/test',{method:'POST',body:JSON.stringify(body)}));return {status:r.status,data:await r.json()};}
(async()=>{
  const a=(await call({action:'status'})).data,b=(await call({action:'status'})).data;
  const common={action:'hosted_setup',ticket:a.ticket,profile:'email'};
  assert.equal((await call(common)).status,400);assert.equal(writes.length,0);
  assert.equal((await call({...common,consent:'wallet-demo-v1',profile:'all'})).status,400);
  const first=await call({...common,consent:'wallet-demo-v1'});
  assert.equal(first.status,200);assert.equal(first.data.mode,'live');
  const repeated=await call({...common,consent:'wallet-demo-v1'});
  assert.equal(first.data.checkout_session_id,repeated.data.checkout_session_id);
  const result={action:'hosted_result',ticket:a.ticket,profile:'email',checkout_session_id:first.data.checkout_session_id};
  assert.equal((await call({...result,ticket:b.ticket})).status,403);
  assert.equal((await call({...result,profile:'all'})).status,403);
  assert.equal((await call({...result,checkout_session_id:'cs_test_bad'})).status,400);
  assert.equal((await call(result)).data.saved,false);
  const cs=sessions.get(first.data.checkout_session_id);
  cs.setup_intent='seti_123';intents.set('seti_123',{id:'seti_123',status:'succeeded',livemode:true,customer:'cus_1',metadata:cs.metadata,payment_method:{id:'pm_1',customer:'cus_1',billing_details:{email:'example@example.com'},card:{brand:'visa',last4:'1234',wallet:{type:'apple_pay'}}}});
  const complete=await call(result);assert.equal(complete.status,200);assert.equal(complete.data.saved,true);assert.equal(complete.data.contact.email,'example@example.com');assert.equal(complete.data.future_charges_authorized,false);
  console.log('PASS hosted setup: consent, setup-only, idempotency, isolation, safe return');
})().catch(e=>{console.error(e);process.exitCode=1;});
