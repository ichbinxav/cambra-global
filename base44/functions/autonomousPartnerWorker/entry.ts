import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import { requireAdminOrInternal } from '../../shared/internalGate.ts';
import { commercialTimezone, isBusinessHour, normalizeEmail, policyIsActive, sanitizeExternalText } from '../../shared/commercialAutonomy.ts';

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
  if(['France','Spain','FR','ES'].includes(String(p.country||''))){n+=5;why.launch_market=5}
  return {score:Math.min(100,n),why};
}
async function apollo(key:string,country:string,titles:string[],perPage:number){
 const keywords='accounting OR ecommerce agency OR fractional CFO OR boutique consultancy OR expert comptable OR asesoría';
 const r=await fetch('https://api.apollo.io/api/v1/mixed_people/api_search',{method:'POST',headers:{'Content-Type':'application/json','Cache-Control':'no-cache','x-api-key':key},body:JSON.stringify({person_titles:titles,person_locations:[country],q_keywords:keywords,page:1,per_page:perPage})});
 const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(`apollo_partner_search_failed:${r.status}`);return Array.isArray(d?.people)?d.people:[];
}

Deno.serve(async(req)=>{let task:any=null;try{
 const base44=createClientFromRequest(req);const body=await req.json().catch(()=>({}));const gate=await requireAdminOrInternal(req,base44,body);if(!gate.ok)return gate.response;const svc=base44.asServiceRole;
 const policies=await svc.entities.CommercialPolicy.filter({engine:'partner_acquisition',status:'active'},'-approved_at',10).catch(()=>[]);const policy=policies.find((p:any)=>policyIsActive(p))||null;
 if(!policy)return Response.json({ok:true,automatic:false,reason:'partner_policy_missing'});
 const controls=await svc.entities.OutboundControl.filter({control_key:'global'},'-created_date',1).catch(()=>[]);const control=controls[0]||null;if(!control?.acquisition_enabled||!control?.premium_outlook_enabled)return Response.json({ok:true,automatic:false,reason:'outbound_paused'});
 const now=new Date();const timezone=commercialTimezone({},policy);if(!isBusinessHour(policy,now,timezone))return Response.json({ok:true,automatic:false,reason:'outside_business_hours'});
 const day=new Date();day.setUTCHours(0,0,0,0);const sentToday=await svc.entities.CommunicationMessage.filter({direction:'outbound',policy_key:policy.policy_key,sent_at:{$gte:day.toISOString()}},'-sent_at',Math.min(Number(policy.daily_send_limit||20)+5,100)).catch(()=>[]);let remaining=Math.max(0,Number(policy.daily_send_limit||20)-sentToday.length);if(!remaining)return Response.json({ok:true,automatic:true,contacted:0,reason:'daily_limit'});
 task=await svc.entities.AgentTask.create({brand_id:'_platform',agent_name:'autonomous_partner_worker',task_type:'partner_acquisition_sweep',status:'running',requires_approval:false,risk_level:3,input_summary:'Discover, score and contact distribution partners',started_at:now.toISOString()});
 const apolloKey=Deno.env.get('APOLLO_API_KEY');if(!apolloKey)throw new Error('apollo_not_configured');
 const icp=policy.icp_json||{};const titles=Array.isArray(icp.titles)&&icp.titles.length?icp.titles:['partner','founder','managing director','fractional CFO','ecommerce director','consultant'];const per=Math.max(1,Math.min(Number(icp.per_run||20),50));
 const countries=Array.isArray(policy.countries)&&policy.countries.length?policy.countries:['FR','ES'];
 let discovered=0,created=0,contacted=0,skipped=0;const failures:any[]=[];
 for(const countryCode of countries){const country=String(countryCode).toUpperCase()==='FR'?'France':String(countryCode).toUpperCase()==='ES'?'Spain':String(countryCode);const people=await apollo(apolloKey,country,titles,per).catch((e:any)=>{failures.push({country,error:String(e?.message||e)});return[]});discovered+=people.length;
  for(const person of people){if(contacted>=remaining)break;const email=normalizeEmail(person?.email);if(!email){skipped++;continue}const org=person?.organization||{};const orgName=String(org.name||'').trim();if(!orgName){skipped++;continue}const domain=String(org.primary_domain||org.website_url||email.split('@')[1]||'').replace(/^https?:\/\//,'').replace(/\/.*$/,'').toLowerCase();
   const suppressed=await svc.entities.ContactSuppression.filter({email,active:true},'-created_date',1).catch(()=>[]);if(suppressed.length){skipped++;continue}
   const existing=await svc.entities.PartnerProspect.filter({contact_email:email},'-created_date',5).catch(()=>[]);let prospect=existing[0]||null;
   if(!prospect){const partnerType=classifyType(`${orgName} ${person?.title||''} ${org?.industry||''}`);const raw={organization_name:orgName,organization_domain:domain,partner_type:partnerType,contact_name:String(person?.name||''),contact_email:email,contact_title:String(person?.title||''),linkedin_url:String(person?.linkedin_url||''),country,source:'apollo',stage:'discovered',specialisms:[String(org?.industry||'')].filter(Boolean),legal_basis:'legitimate_interest',legal_basis_note:`B2B partnership outreach to a publicly listed professional at ${orgName}. Relevance: CAMBRA distribution partnership for merchants; opt-out honored immediately; no special-category data.`,raw_json:person};const sc=score(raw);prospect=await svc.entities.PartnerProspect.create({...raw,score:sc.score,score_breakdown_json:sc.why,stage:'scored'});created++}
   if(Number(prospect.score||0)<Number(policy.min_lead_score||65)||['contacted','replied','meeting','qualified','won','lost','suppressed'].includes(String(prospect.stage))){skipped++;continue}
   const threads=await svc.entities.CommunicationThread.filter({thread_key:`partner:${prospect.id}`},'-created_date',2).catch(()=>[]);if(threads.length){skipped++;continue}
   const language=country==='France'?'fr':country==='Spain'?'es':'en';const thread=await svc.entities.CommunicationThread.create({thread_key:`partner:${prospect.id}`,engine:'partner_acquisition',related_entity_type:'PartnerProspect',related_entity_id:prospect.id,counterparty_email:email,counterparty_name:prospect.contact_name||'',language,status:'open',policy_key:policy.policy_key,policy_version:policy.version,automation_paused:false,summary:`Distribution partner prospect: ${orgName}`,sending_profile_key:'outlook:xavi@cambra.global'});
   const subject=language==='fr'?`CAMBRA × ${orgName}`:language==='es'?`CAMBRA × ${orgName}`:`CAMBRA × ${orgName}`;
   const bodyText=language==='fr'?`Bonjour ${String(prospect.contact_name||'').split(' ')[0]||''},\n\nCAMBRA aide les marques e-commerce à réduire et gérer leurs coûts d’infrastructure, en commençant par les paiements. Nous cherchons quelques partenaires qui accompagnent déjà plusieurs marchands et pour qui ce travail peut devenir un service additionnel utile.\n\nJe pense que ${orgName} pourrait être pertinent. Ouvert à un échange de 20 minutes ?\n\nCAMBRA Partnerships`:language==='es'?`Hola ${String(prospect.contact_name||'').split(' ')[0]||''},\n\nCAMBRA ayuda a marcas e-commerce a reducir y gestionar sus costes de infraestructura, empezando por pagos. Estamos buscando algunos partners que ya trabajen con varias marcas y para quienes esto pueda convertirse en un servicio adicional útil.\n\nCreo que ${orgName} podría encajar. ¿Te va bien comentarlo 20 minutos?\n\nCAMBRA Partnerships`:`Hi ${String(prospect.contact_name||'').split(' ')[0]||''},\n\nCAMBRA helps ecommerce brands reduce and manage infrastructure costs, starting with payments. We’re looking for a small number of partners already advising multiple merchants where this can become a useful additional service.\n\nI think ${orgName} could be relevant. Open to a 20-minute chat?\n\nCAMBRA Partnerships`;
   const internal=Deno.env.get('INTERNAL_CALL_SECRET')||'';const send=await svc.functions.invoke('commercialSendMessage',{thread_id:thread.id,action:'partner_outreach',classification:'interested',subject:sanitizeExternalText(subject,300),text:sanitizeExternalText(bodyText,5000),agent_name:'autonomous_partner_worker',idempotency_key:`partner-initial:${prospect.id}:${policy.version}`,sending_profile_key:'outlook:xavi@cambra.global',next_action_at:new Date(Date.now()+72*3600000).toISOString(),internal_secret:internal}).catch((e:any)=>({data:{ok:false,error:String(e?.message||e)}}));const sd=send?.data||send||{};if(sd.ok===false){failures.push({prospect_id:prospect.id,error:sd.error});continue}await svc.entities.PartnerProspect.update(prospect.id,{stage:'contacted',last_contacted_at:new Date().toISOString(),next_action_at:new Date(Date.now()+72*3600000).toISOString()});contacted++;
  }
 }
 await svc.entities.AgentTask.update(task.id,{status:'completed',output_summary:`Partners: ${discovered} discovered, ${created} new, ${contacted} contacted, ${skipped} skipped`,output_payload_json:{discovered,created,contacted,skipped,failures:failures.slice(0,20)},completed_at:new Date().toISOString()});return Response.json({ok:true,task_id:task.id,discovered,created,contacted,skipped,failures:failures.length});
}catch(error){console.error('autonomousPartnerWorker failed',error);if(task?.id){try{const b=createClientFromRequest(req);await b.asServiceRole.entities.AgentTask.update(task.id,{status:'failed',error:String(error?.message||error),completed_at:new Date().toISOString()})}catch{}}return Response.json({ok:false,error:'autonomous_partner_worker_failed',detail:String(error?.message||error),task_id:task?.id||null},{status:500})}});
