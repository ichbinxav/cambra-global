import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import { requireAdminOrInternal } from '../../shared/internalGate.ts';
import { commercialTimezone, isBusinessHour, normalizeEmail, policyIsActive, sanitizeExternalText } from '../../shared/commercialAutonomy.ts';
import { chooseVariant, personalizationFacts, compactFacts } from '../../shared/outreachExperiment.ts';
import { canonicalMarket } from '../../shared/marketContext.ts';
import { sendingProfileIsValid } from '../../shared/commercialActivation.ts';

const FREE=new Set(['gmail.com','googlemail.com','hotmail.com','outlook.com','yahoo.com','icloud.com','proton.me','protonmail.com']);
const TYPE_RULES=[
  ['accounting_firm',/account|accounting|comptable|expert-comptable|asesor[ií]a|gestor/i],
  ['fractional_cfo',/fractional cfo|outsourced cfo|directeur financier|daf external|cfo as a service/i],
  ['ecommerce_agency',/e-?commerce|shopify|woocommerce|digital agency|agence digitale|agencia digital/i],
  ['boutique_consultancy',/consult|advisory|conseil|strategy|estrateg/i],
] as const;
function classifyType(text:string){for(const [t,r] of TYPE_RULES)if(r.test(text))return t;return 'other'}
function score(p:any){let n=25;const why:any={base:25};const text=`${p.organization_name||''} ${p.contact_title||''} ${(p.specialisms||[]).join(' ')}`;
  if(/partner|founder|managing director|owner|associé|socio|director|fractional cfo/i.test(p.contact_title||'')){n+=25;why.decision_maker=25}
  if(p.partner_type!=='other'){n+=20;why.target_partner_type=20}
  if(/e-?commerce|retail|payments|finance|shopify|digital/i.test(text)){n+=15;why.commerce_relevance=15}
  const domain=String(p.organization_domain||normalizeEmail(p.contact_email).split('@')[1]||'').toLowerCase();if(domain&&!FREE.has(domain)){n+=10;why.business_domain=10}
  return {score:Math.min(100,n),why};
}
async function apollo(key:string,country:string,titles:string[],perPage:number){
 const keywords='accounting OR ecommerce agency OR fractional CFO OR boutique consultancy OR expert comptable OR asesoría';
 const r=await fetch('https://api.apollo.io/api/v1/mixed_people/api_search',{method:'POST',headers:{'Content-Type':'application/json','Cache-Control':'no-cache','x-api-key':key},body:JSON.stringify({person_titles:titles,person_locations:[country],q_keywords:keywords,page:1,per_page:perPage})});
 const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(`apollo_partner_search_failed:${r.status}`);return Array.isArray(d?.people)?d.people:[];
}

async function claudeDraft(key:string, prospect:any, language:string, variant:any){
 const prompt=[
  'Write the first B2B partnership email from Xavi M. Contero, Founder of CAMBRA.',
  'Use ONLY the supplied prospect facts. Do not invent clients, referrals, shared contacts, revenue, merchant count, savings, partnerships, credentials or prior knowledge.',
  'CAMBRA helps ecommerce/retail merchants analyze and improve infrastructure economics, starting with payments. The goal is to explore a distribution/referral partnership where genuinely relevant.',
  'Natural and founder-to-founder/professional tone. Concise, specific, no startup clichés, no hype, no generic opener, no em-dash-heavy prose, no bullet list. Use at most 1-2 verified personalization signals and never force a detail. Max 90 words.',
  'APPROACH: '+String(variant?.instruction||''),
  'Do NOT add a signature, sender name, title, email address or website: the sending system adds Xavi’s verified HTML signature deterministically.',
  'A short plain opt-out sentence is allowed and should sound natural.',
  `Language: ${language}`,
  'Return ONLY JSON {"subject":"","body":""}.',
  'PROSPECT:', JSON.stringify(prospect)
 ].join('\n');
 const r=await fetch('https://api.anthropic.com/v1/messages',{method:'POST',headers:{'Content-Type':'application/json','x-api-key':key,'anthropic-version':'2023-06-01'},body:JSON.stringify({model:Deno.env.get('ANTHROPIC_STANDARD_MODEL')||'claude-sonnet-5',max_tokens:850,messages:[{role:'user',content:prompt}]})});
 const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(`anthropic_partner_draft_failed:${r.status}`);const t=String(d?.content?.[0]?.text||'').replace(/```json\s*/gi,'').replace(/```/g,'').trim();try{return JSON.parse(t)}catch{const m=t.match(/\{[\s\S]*\}/);if(m)try{return JSON.parse(m[0])}catch{}return null}
}

Deno.serve(async(req)=>{let task:any=null;try{
 const base44=createClientFromRequest(req);const body=await req.json().catch(()=>({}));const gate=await requireAdminOrInternal(req,base44,body);if(!gate.ok)return gate.response;const svc=base44.asServiceRole;
 const policies=await svc.entities.CommercialPolicy.filter({engine:'partner_acquisition',status:'active'},'-approved_at',10).catch(()=>[]);const policy=policies.find((p:any)=>policyIsActive(p))||null;
 if(!policy)return Response.json({ok:true,automatic:false,reason:'partner_policy_missing'});
 let sendingProfile:any=null;for(const profileKey of policy.sending_profile_keys||[]){const rows=await svc.entities.OutboundSendingProfile.filter({profile_key:profileKey},'-created_date',1).catch(()=>[]);if(rows[0]?.provider==='outlook'&&sendingProfileIsValid(rows[0])){sendingProfile=rows[0];break}}if(!sendingProfile)return Response.json({ok:true,automatic:false,reason:'partner_policy_outlook_profile_missing'});
 const controls=await svc.entities.OutboundControl.filter({control_key:'global'},'-created_date',1).catch(()=>[]);const control=controls[0]||null;if(!control?.acquisition_enabled||!control?.premium_outlook_enabled)return Response.json({ok:true,automatic:false,reason:'outbound_paused'});
 const now=new Date();const timezone=commercialTimezone({},policy);if(!isBusinessHour(policy,now,timezone))return Response.json({ok:true,automatic:false,reason:'outside_business_hours'});
 const day=new Date();day.setUTCHours(0,0,0,0);const sentToday=await svc.entities.CommunicationMessage.filter({direction:'outbound',policy_key:policy.policy_key,sent_at:{$gte:day.toISOString()}},'-sent_at',Math.min(Number(policy.daily_send_limit||20)+5,100)).catch(()=>[]);let remaining=Math.max(0,Number(policy.daily_send_limit||20)-sentToday.length);if(!remaining)return Response.json({ok:true,automatic:true,contacted:0,reason:'daily_limit'});
 task=await svc.entities.AgentTask.create({brand_id:'_platform',agent_name:'autonomous_partner_worker',task_type:'partner_acquisition_sweep',status:'running',requires_approval:false,risk_level:3,input_summary:'Discover, score and contact distribution partners',started_at:now.toISOString()});
 const apolloKey=Deno.env.get('APOLLO_API_KEY');if(!apolloKey)throw new Error('apollo_not_configured');
 const anthropicKey=Deno.env.get('ANTHROPIC_API_KEY');if(!anthropicKey)throw new Error('anthropic_not_configured');
 const expStats=await svc.entities.OutreachExperimentStats.filter({engine:'partner_acquisition'},'-updated_at',50).catch(()=>[]);
 const priorPartners=await svc.entities.PartnerProspect.filter({stage:{$in:['contacted','replied','meeting','qualified','won']}},'-created_date',1000).catch(()=>[]);const contactedOrgDomains=new Set(priorPartners.map((p:any)=>String(p.organization_domain||'').replace(/^https?:\/\//,'').replace(/^www\./,'').split('/')[0].toLowerCase()).filter(Boolean));const seenOrgDomains=new Set<string>();
 const icp=policy.icp_json||{};const titles=Array.isArray(icp.titles)&&icp.titles.length?icp.titles:['partner','founder','managing director','fractional CFO','ecommerce director','consultant'];const per=Math.max(1,Math.min(Number(icp.per_run||20),50));
 const countries=Array.isArray(policy.countries)?policy.countries:[];
 let discovered=0,created=0,contacted=0,skipped=0;const failures:any[]=[];
 for(const countryCode of countries){const market=canonicalMarket(countryCode);if(!market){failures.push({country:String(countryCode),error:'market_not_canonical'});continue}const country=market.canonical_name;const people=await apollo(apolloKey,country,titles,per).catch((e:any)=>{failures.push({country,error:String(e?.message||e)});return[]});discovered+=people.length;
  for(const person of people){if(contacted>=remaining)break;const email=normalizeEmail(person?.email);if(!email){skipped++;continue}const org=person?.organization||{};const orgName=String(org.name||'').trim();if(!orgName){skipped++;continue}const domain=String(org.primary_domain||org.website_url||email.split('@')[1]||'').replace(/^https?:\/\//,'').replace(/\/.*$/,'').toLowerCase();if(!domain||seenOrgDomains.has(domain)||contactedOrgDomains.has(domain)){skipped++;continue}seenOrgDomains.add(domain);
   const suppressed=await svc.entities.ContactSuppression.filter({email,active:true},'-created_date',1).catch(()=>[]);if(suppressed.length){skipped++;continue}
   const existing=await svc.entities.PartnerProspect.filter({contact_email:email},'-created_date',5).catch(()=>[]);let prospect=existing[0]||null;
   if(!prospect){const partnerType=classifyType(`${orgName} ${person?.title||''} ${org?.industry||''}`);const raw={organization_name:orgName,organization_domain:domain,partner_type:partnerType,contact_name:String(person?.name||''),contact_email:email,contact_title:String(person?.title||''),linkedin_url:String(person?.linkedin_url||''),country,source:'apollo',stage:'discovered',specialisms:[String(org?.industry||'')].filter(Boolean),legal_basis:'legitimate_interest',legal_basis_note:`B2B partnership outreach to a publicly listed professional at ${orgName}. Relevance: CAMBRA distribution partnership for merchants; opt-out honored immediately; no special-category data.`,raw_json:person};const sc=score(raw);prospect=await svc.entities.PartnerProspect.create({...raw,score:sc.score,score_breakdown_json:sc.why,stage:'scored'});created++}
   if(Number(prospect.score||0)<Number(policy.min_lead_score||65)||['contacted','replied','meeting','qualified','won','lost','suppressed'].includes(String(prospect.stage))){skipped++;continue}
   const threads=await svc.entities.CommunicationThread.filter({thread_key:`partner:${prospect.id}`},'-created_date',2).catch(()=>[]);if(threads.length){skipped++;continue}
   const language=market.iso2==='FR'?'fr':market.iso2==='ES'?'es':'en';const facts=compactFacts(personalizationFacts(prospect,'partner'));const variant=chooseVariant('partner_acquisition',String(prospect.id),expStats);const thread=await svc.entities.CommunicationThread.create({thread_key:`partner:${prospect.id}`,engine:'partner_acquisition',related_entity_type:'PartnerProspect',related_entity_id:prospect.id,counterparty_email:email,counterparty_name:prospect.contact_name||'',language,status:'open',policy_key:policy.policy_key,policy_version:policy.version,automation_paused:false,summary:`Distribution partner prospect: ${orgName}`,sending_profile_key:sendingProfile.profile_key,market_jurisdiction:market.iso2,experiment_key:'partner-outreach-v1',experiment_variant:variant.key,personalization_json:{facts,variant_mode:variant.mode}});
   const draft=await claudeDraft(anthropicKey,facts,language,variant).catch((e:any)=>{failures.push({prospect_id:prospect.id,error:String(e?.message||e)});return null});
   if(!draft?.subject||!draft?.body){skipped++;continue}
   const internal=Deno.env.get('INTERNAL_CALL_SECRET')||'';const send=await svc.functions.invoke('commercialSendMessage',{thread_id:thread.id,action:'partner_outreach',classification:'partner_outreach',subject:sanitizeExternalText(draft.subject,300),text:sanitizeExternalText(draft.body,5000),agent_name:'autonomous_partner_worker',idempotency_key:`partner-initial:${prospect.id}:${policy.version}`,sending_profile_key:sendingProfile.profile_key,next_action_at:new Date(Date.now()+72*3600000).toISOString(),internal_secret:internal}).catch((e:any)=>({data:{ok:false,error:String(e?.message||e)}}));const sd=send?.data||send||{};if(sd.ok===false){failures.push({prospect_id:prospect.id,error:sd.error});continue}contactedOrgDomains.add(domain);await svc.entities.PartnerProspect.update(prospect.id,{stage:'contacted',last_contacted_at:new Date().toISOString(),next_action_at:new Date(Date.now()+72*3600000).toISOString()});contacted++;
  }
 }
 await svc.entities.AgentTask.update(task.id,{status:'completed',output_summary:`Partners: ${discovered} discovered, ${created} new, ${contacted} contacted, ${skipped} skipped`,output_payload_json:{discovered,created,contacted,skipped,failures:failures.slice(0,20)},completed_at:new Date().toISOString()});return Response.json({ok:true,task_id:task.id,discovered,created,contacted,skipped,failures:failures.length});
}catch(error){console.error('autonomousPartnerWorker failed',error);if(task?.id){try{const b=createClientFromRequest(req);await b.asServiceRole.entities.AgentTask.update(task.id,{status:'failed',error:String(error?.message||error),completed_at:new Date().toISOString()})}catch{}}return Response.json({ok:false,error:'autonomous_partner_worker_failed',detail:String(error?.message||error),task_id:task?.id||null},{status:500})}});
