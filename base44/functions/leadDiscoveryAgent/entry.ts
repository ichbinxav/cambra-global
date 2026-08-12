import { safeBestEffort } from '../../shared/bestEffort.ts';
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import { requireAdminOrInternal } from '../../shared/internalGate.ts';
import { reservePaidOperation, settlePaidOperation } from '../../shared/costGovernance.ts';
import { ApolloLeadProvider, InstantlySuperSearchLeadProvider } from '../../shared/leadIntelligenceProvider.ts';
import { instantlyRequest } from '../../shared/outboundProvider.ts';
import {
  APOLLO_EXPIRY_AT,
  APOLLO_MAX_PAGE,
  DISCOVERY_ENGINE_VERSION,
  canonicalCompanyKey,
  cheapDiscoveryPreScore,
  checkpointBackoff,
  discoveryPartitionKey,
  discoveryProviderStatus,
  normalizeDiscoveryDomain,
  safeApolloUsageSnapshot,
} from '../../shared/discoveryRadar.ts';

const AGENT_NAME = 'lead_discovery';
const TASK_TYPE = 'discover_leads';
const RISK_LEVEL = 1;
const APOLLO_BASE = 'https://api.apollo.io/api/v1';
const now = () => new Date().toISOString();
const sleep = (milliseconds:number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

// Company-first filtering is intentionally conservative. Uncertain merchants
// continue to deterministic pre-scoring; obvious services/education do not.
const NON_MERCHANT_ORG = /\b(university|universit[eé]|school|college|academy|agence|agency|consulting|consultant|marketing agency|growth agency|logistique|logistics|3pl|freight|software agency|web agency)\b/i;
const GENERIC_ORG = /^(e-?commerce|commerce|retail|online store|shop)$/i;
function merchantDiscoveryCandidate(organization:any): { ok:true } | { ok:false; reason:string } {
  const name = String(organization?.name || '').trim();
  const domain = normalizeDiscoveryDomain(organization?.primary_domain || organization?.website_url);
  if (!name) return { ok:false, reason:'organization_missing' };
  if (GENERIC_ORG.test(name)) return { ok:false, reason:'organization_generic' };
  if (NON_MERCHANT_ORG.test(name)) return { ok:false, reason:'obvious_non_merchant_organization' };
  if (/\.(edu|edu\.[a-z]{2})$/i.test(domain)) return { ok:false, reason:'education_domain' };
  if (!domain) return { ok:false, reason:'canonical_domain_missing' };
  return { ok:true };
}

function decisionMakerPriority(person:any) {
  const title = String(person?.title || '');
  if (/founder|owner|chief executive|\bceo\b/i.test(title)) return 6;
  if (/chief financial|\bcfo\b|head of finance|finance director/i.test(title)) return 5;
  if (/head of payments|payments director|payments manager/i.test(title)) return 4;
  if (/chief operating|\bcoo\b|head of e-?commerce|e-?commerce director/i.test(title)) return 3;
  if (/\b(vp|head|director)\b/i.test(title)) return 2;
  if (/manager/i.test(title)) return 1;
  return 0;
}

function safeErrorCode(error:any) {
  const status = Number(error?.status || 0);
  if (status === 401) return 'APOLLO_UNAUTHORIZED';
  if (status === 403) return 'APOLLO_SCOPE_OR_PLAN_FORBIDDEN';
  if (status === 429) return 'APOLLO_RATE_LIMITED';
  if (status >= 500) return 'APOLLO_UPSTREAM_UNAVAILABLE';
  return String(error?.code || 'APOLLO_REQUEST_FAILED').slice(0, 80);
}

async function apolloRequest(path:string, key:string, options:any = {}) {
  let lastError:any = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(`${APOLLO_BASE}${path}`, {
        method: options.method || 'POST',
        headers: { 'Content-Type':'application/json', 'Cache-Control':'no-cache', 'x-api-key':key },
        ...(options.body ? { body:JSON.stringify(options.body) } : {}),
      });
      const payload = await response.json().catch(() => ({}));
      if (response.ok) return { payload, status:response.status, headers:response.headers };
      const error:any = new Error(`Apollo HTTP ${response.status}`);
      error.status = response.status;
      error.retryAfter = Number(response.headers.get('retry-after') || 0);
      error.providerMessage = String(payload?.error || payload?.message || '').slice(0, 160);
      throw error;
    } catch (error:any) {
      lastError = error;
      const retryable = Number(error?.status || 0) === 429 || Number(error?.status || 0) >= 500 || !Number(error?.status || 0);
      if (!retryable || attempt === 2) break;
      const wait = error?.retryAfter ? Math.min(5_000, error.retryAfter * 1_000) : 250 * (2 ** attempt);
      await sleep(wait);
    }
  }
  throw lastError || new Error('Apollo request failed');
}

function employeeRange(value:any) {
  const count = Number(value);
  if (!Number.isFinite(count)) return null;
  if (count < 10) return '1-9';
  if (count < 50) return '10-49';
  if (count < 200) return '50-199';
  if (count < 1000) return '200-999';
  return '1000+';
}

function observedTechnologies(organization:any) {
  const rows = Array.isArray(organization?.current_technologies) ? organization.current_technologies : Array.isArray(organization?.technologies) ? organization.technologies : [];
  return [...new Set(rows.map((item:any) => String(item?.name || item?.uid || item || '').trim().toLowerCase()).filter(Boolean))].slice(0, 100);
}

function detectedStack(technologies:string[]) {
  const commerce = technologies.find((value) => /shopify|woocommerce|bigcommerce|prestashop|magento|salesforce.commerce|commercetools/.test(value)) || null;
  const payments = technologies.filter((value) => /stripe|adyen|mollie|paypal|klarna|worldline|checkout.com|sumup|square/.test(value)).slice(0, 10);
  return { commerce, payments };
}

async function upsertCheckpoint(svc:any, checkpoint:any, patch:any) {
  if (checkpoint?.id) return svc.entities.LeadDiscoveryCheckpoint.update(checkpoint.id, patch);
  return svc.entities.LeadDiscoveryCheckpoint.create(patch);
}

async function runInstantlyPreviewDiscovery(service:any,body:any){
  const apiKey=Deno.env.get('INSTANTLY_API_KEY')||'';if(!apiKey)return Response.json({ok:false,error:'instantly_not_configured',provider_status:'NOT_CONFIGURED'},{status:409});
  const states=await service.entities.CommercialProviderState.filter({provider_key:'instantly_supersearch',role:'lead_intelligence'},'-last_checked_at',1).catch((error:any)=>safeBestEffort(error,{operation:'leadDiscoveryAgent',fallback:[],severity:'secondary'}));
  if(states[0]?.metrics_json?.supersearch_permission_verified!==true)return Response.json({ok:false,error:'instantly_supersearch_permission_not_verified',provider_status:states[0]?.status||'CONFIGURED'},{status:409});
  const country=String(body?.country||'').trim(),countryCode=String(body?.country_code||country).trim().toUpperCase(),industry=String(body?.industry||body?.vertical||'ecommerce').trim();
  const limit=Math.max(1,Math.min(100,Number(body?.per_page||body?.limit||100)));const partition={country:countryCode,vertical:industry,employee_range:String(body?.employee_range||''),technology:String(body?.technology||'')};const checkpointKey=String(body?.checkpoint_key||discoveryPartitionKey('instantly_supersearch',partition));
  const existing=(await service.entities.LeadDiscoveryCheckpoint.filter({checkpoint_key:checkpointKey},'-updated_date',1).catch((error:any)=>safeBestEffort(error,{operation:'leadDiscoveryAgent',fallback:[],severity:'secondary'})))[0]||null;const timestamp=now();const checkpoint=await upsertCheckpoint(service,existing,{checkpoint_key:checkpointKey,source_key:'instantly_supersearch',provider_status:'ACTIVE',partition_json:partition,page:1,maximum_page:1,last_attempt_at:timestamp,consecutive_failures:0,engine_version:DISCOVERY_ENGINE_VERSION,api_calls:Number(existing?.api_calls||0),candidates_scanned:Number(existing?.candidates_scanned||0),unique_companies_created:Number(existing?.unique_companies_created||0),duplicates_rejected:Number(existing?.duplicates_rejected||0),quality_rejected:Number(existing?.quality_rejected||0),enrichment_candidates:Number(existing?.enrichment_candidates||0)});
  const task=await service.entities.AgentTask.create({brand_id:'_platform',agent_name:AGENT_NAME,task_type:TASK_TYPE,status:'running',requires_approval:false,risk_level:RISK_LEVEL,input_summary:`Instantly SuperSearch preview: ${industry} · ${country}; max ${limit}`,started_at:timestamp});
  const reservation=await reservePaidOperation(service,{event_key:`api:instantly:supersearch-preview:${checkpointKey}:${timestamp.slice(0,13)}`,category:'api',provider:'instantly',source:'leadDiscoveryAgent',related_entity_type:'LeadDiscoveryCheckpoint',related_entity_id:checkpoint.id});
  if(reservation.duplicate){await service.entities.AgentTask.update(task.id,{status:'completed',output_summary:'Duplicate SuperSearch slot blocked before provider request',completed_at:now()});return Response.json({ok:true,provider:'instantly_supersearch',duplicate_blocked:true,created_ids:[],enrichment_ids:[],task_id:task.id,checkpoint_id:checkpoint.id});}
  const adapter=new InstantlySuperSearchLeadProvider((path,options)=>instantlyRequest(apiKey,path,options),true,true);
  try{
    const preview=await adapter.searchCompanies({countries:[country],industries:[industry],titles:Array.isArray(body?.titles)?body.titles:[],employee_ranges:body?.employee_range?[String(body.employee_range)]:[],technologies:body?.technology?[String(body.technology)]:[],limit,one_lead_per_company:true});
    const leads=(Array.isArray(preview?.leads)?preview.leads:[]).slice(0,limit);const best=new Map<string,any>();for(const item of leads){const companyName=String(item?.companyName||'').trim();const key=canonicalCompanyKey('',companyName);if(!key||GENERIC_ORG.test(companyName)||NON_MERCHANT_ORG.test(companyName))continue;if(!best.has(key))best.set(key,item);}
    const keys=[...best.keys()];const present=keys.length?await service.entities.OutboundLead.filter({canonical_company_key:{$in:keys}},'-created_date',Math.min(5000,keys.length*3)).catch((error:any)=>safeBestEffort(error,{operation:'leadDiscoveryAgent',fallback:[],severity:'secondary'})):[];const existingKeys=new Set(present.map((lead:any)=>String(lead.canonical_company_key)));const rows:any[]=[];for(const [key,item] of best){if(existingKeys.has(key))continue;const pre=cheapDiscoveryPreScore({title:item?.jobTitle,organization:{name:item?.companyName,industry}});rows.push({company_name:item?.companyName||null,company_domain:null,canonical_company_key:key,contact_full_name:item?.fullName||[item?.firstName,item?.lastName].filter(Boolean).join(' ')||null,contact_email:null,contact_title:item?.jobTitle||null,linkedin_url:item?.linkedIn||null,country:countryCode,industry,source:'instantly_supersearch',stage:'lead',reservoir_state:'discovered',reservoir_updated_at:timestamp,external_refs_json:{instantly_company_id:item?.companyId||null,source_adapter:'instantly_supersearch'},source_evidence_json:{source:'instantly_supersearch',source_endpoint:'supersearch-enrichment/preview-leads-from-supersearch',source_observed_at:timestamp,country_source:'CAMBRA:target_profile',pre_score_source:'CAMBRA:deterministic_pre_score',pre_score_reasons:pre.reasons,estimation_boundary:'SuperSearch preview intelligence is not verified merchant savings or a verified email.'},discovered_at:timestamp,last_source_checked_at:timestamp,employee_range:String(body?.employee_range||'')||null,revenue_range:null,detected_technologies:body?.technology?[String(body.technology)]:[],ecommerce_platform:body?.technology||null,probable_payment_stack:[],estimation_status:'UNKNOWN',pre_score:pre.score,enrichment_worthy:false,contactability:'UNAVAILABLE',outreach_eligibility:'NOT_ASSESSED',compliance_status:'REVIEW_REQUIRED',legal_basis:'legitimate_interest',legal_basis_note:`B2B company intelligence for a relevant professional role at a ${industry} merchant in ${country}. Instantly is provenance only; outreach remains separately governed and suppression-aware.`,raw_json:{source_adapter:'instantly_supersearch',company_id:item?.companyId||null}});}
    const created=rows.length?await service.entities.OutboundLead.bulkCreate(rows).catch(async()=>{const output=[];for(const row of rows){const saved=await service.entities.OutboundLead.create(row).catch((error:any)=>safeBestEffort(error,{operation:'leadDiscoveryAgent',fallback:null,severity:'secondary'}));if(saved)output.push(saved);}return output;}):[];const ids=created.map((row:any)=>row.id).filter(Boolean);await settlePaidOperation(service,reservation,{ok:true,usage_json:{endpoint:'supersearch-enrichment/preview-leads-from-supersearch',previewed:leads.length,unique_companies_created:ids.length,enrichment_started:false}});await service.entities.LeadDiscoveryCheckpoint.update(checkpoint.id,{last_success_at:timestamp,next_eligible_at:new Date(Date.now()+3600000).toISOString(),api_calls:Number(checkpoint.api_calls||0)+1,candidates_scanned:Number(checkpoint.candidates_scanned||0)+leads.length,unique_companies_created:Number(checkpoint.unique_companies_created||0)+ids.length,duplicates_rejected:Number(checkpoint.duplicates_rejected||0)+(keys.length-rows.length)});await service.entities.AgentTask.update(task.id,{status:'completed',output_summary:`Previewed ${leads.length} Instantly leads; stored ${ids.length} provider-independent companies`,output_payload_json:{previewed:leads.length,created:ids.length,enrichment_started:false},completed_at:now()});return Response.json({ok:true,provider:'instantly_supersearch',provider_status:'ACTIVE',scanned:leads.length,decision_makers_found:leads.filter((item:any)=>item?.fullName).length,count:ids.length,rejected_count:leads.length-best.size,duplicate_rejected:keys.length-rows.length,created_ids:ids,enrichment_ids:[],source_credit_cost_documented:null,checkpoint_id:checkpoint.id,task_id:task.id});
  }catch(error:any){await settlePaidOperation(service,reservation,{ok:false,usage_json:{endpoint:'supersearch-enrichment/preview-leads-from-supersearch',error_code:String(error?.code||'INSTANTLY_SUPERSEARCH_FAILED')}}).catch((error:any)=>safeBestEffort(error,{operation:'leadDiscoveryAgent',fallback:null,severity:'secondary'}));await service.entities.AgentTask.update(task.id,{status:'failed',error:String(error?.code||'INSTANTLY_SUPERSEARCH_FAILED'),completed_at:now()}).catch((error:any)=>safeBestEffort(error,{operation:'leadDiscoveryAgent',fallback:null,severity:'secondary'}));return Response.json({ok:false,error:String(error?.code||'INSTANTLY_SUPERSEARCH_FAILED'),provider:'instantly_supersearch',secret_exposed:false},{status:Number(error?.status||500)});}
}

Deno.serve(async (req) => {
  let task:any = null;
  let service:any = null;
  let checkpoint:any = null;
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const gate = await requireAdminOrInternal(req, base44, body);
    if (!gate.ok) return gate.response;
    service = base44.asServiceRole;
    if(String(body?.provider||'').toLowerCase()==='instantly_supersearch')return runInstantlyPreviewDiscovery(service,body);
    const apolloKey = Deno.env.get('APOLLO_API_KEY') || '';
    const provider = discoveryProviderStatus(Boolean(apolloKey));
    const providerAdapter = new ApolloLeadProvider((path, options)=>apolloRequest(path, apolloKey, options), Boolean(apolloKey));

    if (body?.action === 'diagnose') {
      let auth = { pass:false, healthy:false, is_logged_in:false, error_code:provider.reason };
      let usage:any = { available:false, reason:'not_requested' };
      if (provider.available) {
        try {
          const result = await apolloRequest('/auth/health', apolloKey, { method:'GET' });
          auth = { pass:result.payload?.healthy === true && result.payload?.is_logged_in === true, healthy:result.payload?.healthy === true, is_logged_in:result.payload?.is_logged_in === true, error_code:null };
        } catch (error:any) {
          auth = { pass:false, healthy:false, is_logged_in:false, error_code:safeErrorCode(error) };
        }
        if (auth.pass) {
          try {
            const result = await apolloRequest('/usage_stats/api_usage_stats', apolloKey);
            usage = safeApolloUsageSnapshot(result.payload);
          } catch (error:any) {
            usage = { available:false, error_code:safeErrorCode(error), observed_at:now(), note:'Usage scope may require a master key; discovery auth is assessed separately.' };
          }
        }
      }
      const key = 'apollo:provider:diagnostic';
      const rows = await service.entities.LeadDiscoveryCheckpoint.filter({ checkpoint_key:key }, '-updated_date', 1).catch((error:any)=>safeBestEffort(error,{operation:'leadDiscoveryAgent',fallback:[],severity:'secondary'}));
      checkpoint = await upsertCheckpoint(service, rows[0], {
        checkpoint_key:key, source_key:'apollo', provider_status:auth.pass ? 'ACTIVE' : provider.status === 'ACTIVE' ? 'DEGRADED' : provider.status,
        provider_expires_at:APOLLO_EXPIRY_AT, partition_json:{ kind:'provider_diagnostic' }, page:1, maximum_page:APOLLO_MAX_PAGE,
        last_attempt_at:now(), ...(auth.pass ? { last_success_at:now(), consecutive_failures:0 } : { consecutive_failures:Number(rows[0]?.consecutive_failures || 0) + 1 }),
        provider_usage_json:{ auth, usage }, last_error_code:auth.error_code || null, engine_version:DISCOVERY_ENGINE_VERSION,
      });
      return Response.json({ ok:true, provider:'apollo', configured:Boolean(apolloKey), status:checkpoint.provider_status, auth, usage, expires_at:APOLLO_EXPIRY_AT, secret_exposed:false });
    }

    if (!provider.available) return Response.json({ ok:false, error:provider.reason, provider_status:provider.status, expires_at:APOLLO_EXPIRY_AT }, { status:409 });

    const country = String(body?.country || 'France').trim();
    const countryCode = String(body?.country_code || country).trim().toUpperCase();
    const titles = Array.isArray(body?.titles) && body.titles.length ? body.titles.map((value:any)=>String(value)).slice(0,30) : ['Founder','CEO','CFO','COO','Finance Director','Head of Finance','Head of Payments','Payments Manager','Head of Ecommerce','Ecommerce Director'];
    const industry = String(body?.industry || body?.vertical || 'ecommerce').trim();
    const perPage = Math.max(1, Math.min(Number(body?.per_page || body?.limit || 100), 100));
    const page = Math.max(1, Math.min(Number(body?.page || 1), APOLLO_MAX_PAGE));
    const manualDomain = normalizeDiscoveryDomain(body?.company_domain || body?.manual_domain || '');
    const partition = { country:countryCode, vertical:industry, employee_range:String(body?.employee_range || ''), technology:String(body?.technology || ''), manual_domain:manualDomain || null };
    const checkpointKey = String(body?.checkpoint_key || discoveryPartitionKey('apollo', partition));
    const existingCheckpoints = body?.checkpoint_id
      ? [await service.entities.LeadDiscoveryCheckpoint.get(String(body.checkpoint_id)).catch((error:any)=>safeBestEffort(error,{operation:'leadDiscoveryAgent',fallback:null,severity:'secondary'}))].filter(Boolean)
      : await service.entities.LeadDiscoveryCheckpoint.filter({ checkpoint_key:checkpointKey }, '-updated_date', 1).catch((error:any)=>safeBestEffort(error,{operation:'leadDiscoveryAgent',fallback:[],severity:'secondary'}));
    checkpoint = existingCheckpoints[0] || null;
    if (checkpoint?.circuit_open_until && Date.parse(checkpoint.circuit_open_until) > Date.now()) return Response.json({ ok:true, status:'circuit_open', checkpoint_id:checkpoint.id, next_eligible_at:checkpoint.circuit_open_until, created_ids:[] });

    task = await service.entities.AgentTask.create({
      brand_id:'_platform', agent_name:AGENT_NAME, task_type:TASK_TYPE, status:'running', requires_approval:false, risk_level:RISK_LEVEL,
      input_summary:`Apollo provider-adapter page ${page}: ${industry} · ${country}; max ${perPage}`, started_at:now(),
    });
    checkpoint = await upsertCheckpoint(service, checkpoint, {
      checkpoint_key:checkpointKey, source_key:'apollo', provider_status:'ACTIVE', provider_expires_at:APOLLO_EXPIRY_AT,
      partition_json:partition, page, maximum_page:APOLLO_MAX_PAGE, last_attempt_at:now(), consecutive_failures:Number(checkpoint?.consecutive_failures || 0), engine_version:DISCOVERY_ENGINE_VERSION,
      api_calls:Number(checkpoint?.api_calls || 0), candidates_scanned:Number(checkpoint?.candidates_scanned || 0), unique_companies_created:Number(checkpoint?.unique_companies_created || 0), duplicates_rejected:Number(checkpoint?.duplicates_rejected || 0), quality_rejected:Number(checkpoint?.quality_rejected || 0), enrichment_candidates:Number(checkpoint?.enrichment_candidates || 0),
    });

    // Discover companies before people. Apollo People Search intentionally omits
    // enough organization detail that using it as the primary warehouse feed can
    // strand records without a canonical company identity.
    const costReservation = await reservePaidOperation(service, { event_key:`api:apollo:organization-search:${checkpointKey}:page:${page}`, category:'api', provider:'apollo', source:'leadDiscoveryAgent', related_entity_type:'LeadDiscoveryCheckpoint', related_entity_id:checkpoint.id });
    const organizationSearchBody:any = { organization_locations:[country], page, per_page:perPage };
    if (manualDomain) organizationSearchBody.q_organization_domains_list = [manualDomain];
    else if (industry) organizationSearchBody.q_organization_keyword_tags = [industry];
    if (body?.employee_range) organizationSearchBody.organization_num_employees_ranges = [String(body.employee_range)];
    if (body?.technology) organizationSearchBody.currently_using_any_of_technology_uids = [String(body.technology)];
    const result = await providerAdapter.searchCompanies(organizationSearchBody);
    const organizations = Array.isArray(result.payload?.organizations)
      ? result.payload.organizations
      : Array.isArray(result.payload?.accounts) ? result.payload.accounts : [];
    const pagination = result.payload?.pagination || {};

    const rejected:any[] = [];
    const bestByCompany = new Map<string, any>();
    for (const organization of organizations) {
      const quality = merchantDiscoveryCandidate(organization);
      if (!quality.ok) { rejected.push({ reason:quality.reason }); continue; }
      const domain = normalizeDiscoveryDomain(organization.primary_domain || organization.website_url);
      const key = canonicalCompanyKey(domain, organization.name);
      const pre = cheapDiscoveryPreScore({ organization });
      if (pre.score < 20) { rejected.push({ reason:'low_pre_score' }); continue; }
      const previous = bestByCompany.get(key);
      if (!previous || pre.score > previous.pre.score) bestByCompany.set(key, { person:null, organization, domain, key, pre });
    }

    // Decision-maker discovery is a second, zero-credit search. A missing person
    // never invalidates a company candidate and never creates an invented contact.
    const organizationIds = [...bestByCompany.values()]
      .map((candidate:any) => String(candidate.organization?.id || candidate.organization?.organization_id || ''))
      .filter(Boolean)
      .slice(0, 100);
    let people:any[] = [];
    if (organizationIds.length) {
      const peopleResult = await providerAdapter.searchPeople({
        organization_ids:organizationIds, person_titles:titles,
        person_seniorities:Array.isArray(body?.seniorities) ? body.seniorities.slice(0,12) : ['owner','founder','c_suite','vp','head','director','manager'],
        include_similar_titles:true, page:1, per_page:100,
      });
      people = Array.isArray(peopleResult.payload?.people) ? peopleResult.payload.people : [];
      const candidateByOrganizationId = new Map<string, any>();
      for (const candidate of bestByCompany.values()) {
        const organizationId = String(candidate.organization?.id || candidate.organization?.organization_id || '');
        if (organizationId) candidateByOrganizationId.set(organizationId, candidate);
      }
      for (const person of people) {
        const organizationId = String(person?.organization_id || person?.organization?.id || person?.organization?.organization_id || '');
        const candidate = candidateByOrganizationId.get(organizationId);
        if (!candidate) continue;
        if (!candidate.person || decisionMakerPriority(person) > decisionMakerPriority(candidate.person)) candidate.person = person;
      }
      for (const candidate of bestByCompany.values()) candidate.pre = cheapDiscoveryPreScore({ ...candidate.person, organization:candidate.organization });
    }

    const candidateKeys = [...bestByCompany.keys()];
    const existingRows = candidateKeys.length
      ? await service.entities.OutboundLead.filter({ canonical_company_key:{ $in:candidateKeys } }, '-created_date', Math.min(5000, candidateKeys.length * 3)).catch((error:any)=>safeBestEffort(error,{operation:'leadDiscoveryAgent',fallback:[],severity:'secondary'}))
      : [];
    const existingKeys = new Set(existingRows.map((lead:any) => String(lead.canonical_company_key || canonicalCompanyKey(lead.company_domain, lead.company_name))).filter(Boolean));
    const duplicates = candidateKeys.filter((key) => existingKeys.has(key)).length;
    const timestamp = now();
    const rows:any[] = [];
    for (const candidate of bestByCompany.values()) {
      if (existingKeys.has(candidate.key)) continue;
      const technologies = observedTechnologies(candidate.organization);
      const stack = detectedStack(technologies);
      const person = candidate.person || {};
      rows.push({
        company_name:candidate.organization.name || null, company_domain:candidate.domain, canonical_company_key:candidate.key,
        contact_full_name:person.name || [person.first_name, person.last_name].filter(Boolean).join(' ') || null, contact_email:null, contact_title:person.title || null, linkedin_url:person.linkedin_url || null,
        country:countryCode, industry:candidate.organization.industry || industry, source:'apollo', stage:'lead', reservoir_state:'discovered', reservoir_updated_at:timestamp,
        external_refs_json:{ apollo_person_id:person.id || person.person_id || null, apollo_organization_id:candidate.organization.id || candidate.organization.organization_id || null, source_adapter:'apollo' },
        source_evidence_json:{ source:'apollo', source_endpoint:'mixed_companies/search + mixed_people/api_search', source_observed_at:timestamp, country_source:'apollo:organization_location', technology_source:'apollo:organization_technologies', pre_score_source:'CAMBRA:deterministic_pre_score', pre_score_reasons:candidate.pre.reasons, provider_expiry_at:APOLLO_EXPIRY_AT, estimation_boundary:'Discovery inference is not verified merchant savings.' },
        discovered_at:timestamp, last_source_checked_at:timestamp, employee_range:employeeRange(candidate.organization.estimated_num_employees || candidate.organization.num_employees),
        revenue_range:candidate.organization.annual_revenue_printed || null, detected_technologies:technologies, ecommerce_platform:stack.commerce, probable_payment_stack:stack.payments,
        estimation_status:'UNKNOWN', pre_score:candidate.pre.score, enrichment_worthy:candidate.pre.enrichment_worthy,
        contactability:'UNAVAILABLE', outreach_eligibility:'NOT_ASSESSED', compliance_status:'REVIEW_REQUIRED',
        legal_basis:'legitimate_interest', legal_basis_note:`B2B company intelligence for a relevant professional role at a ${industry} merchant in ${country}. Apollo is provenance only; outreach remains separately governed, suppression-aware and subject to jurisdiction review.`,
        raw_json:{ source_adapter:'apollo', person_id:person.id || person.person_id || null, organization:{ id:candidate.organization.id || null, name:candidate.organization.name || null, primary_domain:candidate.domain, industry:candidate.organization.industry || null, estimated_num_employees:candidate.organization.estimated_num_employees ?? null, annual_revenue:candidate.organization.annual_revenue ?? null } },
      });
    }
    const created = rows.length ? await service.entities.OutboundLead.bulkCreate(rows).catch(async () => { const output=[]; for (const row of rows) { const saved=await service.entities.OutboundLead.create(row).catch((error:any)=>safeBestEffort(error,{operation:'leadDiscoveryAgent',fallback:null,severity:'secondary'})); if(saved)output.push(saved); } return output; }) : [];
    const createdIds = created.map((row:any)=>row?.id).filter(Boolean);
    const enrichmentThreshold=Number(body?.enrichment_threshold || 45);
    const enrichmentKeys=new Set(rows.filter((row:any)=>row.enrichment_worthy===true||Number(row.pre_score)>=enrichmentThreshold).map((row:any)=>row.canonical_company_key));
    const enrichmentIds = created.filter((row:any,index:number)=>enrichmentKeys.has(row?.canonical_company_key||rows[index]?.canonical_company_key)).map((row:any)=>row.id).filter(Boolean);
    const totalPages = Math.max(0, Math.min(APOLLO_MAX_PAGE, Number(pagination?.total_pages || 0)));
    const nextPage = totalPages && page >= totalPages ? 1 : page >= APOLLO_MAX_PAGE ? 1 : page + 1;
    checkpoint = await service.entities.LeadDiscoveryCheckpoint.update(checkpoint.id, {
      provider_status:'ACTIVE', page:nextPage, total_pages_reported:totalPages, last_success_at:timestamp, next_eligible_at:new Date(Date.now()+60_000).toISOString(), consecutive_failures:0, circuit_open_until:null, last_error_code:null,
      api_calls:Number(checkpoint.api_calls || 0)+(organizationIds.length ? 2 : 1), candidates_scanned:Number(checkpoint.candidates_scanned || 0)+organizations.length,
      unique_companies_created:Number(checkpoint.unique_companies_created || 0)+createdIds.length, duplicates_rejected:Number(checkpoint.duplicates_rejected || 0)+duplicates,
      quality_rejected:Number(checkpoint.quality_rejected || 0)+rejected.length, enrichment_candidates:Number(checkpoint.enrichment_candidates || 0)+enrichmentIds.length,
    });
    const rejectedByReason = rejected.reduce((counts:Record<string,number>, row:any) => { const reason=String(row.reason || 'unknown'); counts[reason]=(counts[reason]||0)+1; return counts; }, {});
    await settlePaidOperation(service, costReservation, { ok:true, usage_json:{ endpoint:'mixed_companies/search', provider_credit_cost_documented:1, decision_maker_endpoint:'mixed_people/api_search', decision_maker_credit_cost_documented:0, page, organizations_returned:organizations.length, people_returned:people.length, unique_companies_created:createdIds.length } });
    await service.entities.AgentTask.update(task.id, { status:'completed', output_summary:`Scanned ${organizations.length} companies; stored ${createdIds.length} unique companies; found ${people.length} decision-maker candidates; rejected ${duplicates} duplicates and ${rejected.length} low-quality candidates`, output_payload_json:{ checkpoint_id:checkpoint.id, page, next_page:nextPage, scanned:organizations.length, decision_makers_found:people.length, created:createdIds.length, enrichment_candidates:enrichmentIds.length, duplicate_rejected:duplicates, quality_rejected:rejected.length, rejected_by_reason:rejectedByReason }, completed_at:timestamp });
    return Response.json({ ok:true, task_id:task.id, checkpoint_id:checkpoint.id, provider:'apollo', provider_status:'ACTIVE', page, next_page:nextPage, scanned:organizations.length, decision_makers_found:people.length, count:createdIds.length, rejected_count:rejected.length, rejected_by_reason:rejectedByReason, duplicate_rejected:duplicates, created_ids:createdIds, enrichment_ids:enrichmentIds, source_credit_cost_documented:1, decision_maker_credit_cost_documented:0, provider_expires_at:APOLLO_EXPIRY_AT });
  } catch (error:any) {
    const code = safeErrorCode(error);
    const failures = Number(checkpoint?.consecutive_failures || 0) + 1;
    if (service && checkpoint?.id) await service.entities.LeadDiscoveryCheckpoint.update(checkpoint.id, { provider_status:failures >= 3 ? 'CIRCUIT_OPEN' : 'DEGRADED', consecutive_failures:failures, circuit_open_until:failures >= 3 ? checkpointBackoff(failures) : null, next_eligible_at:checkpointBackoff(failures), last_error_code:code, last_attempt_at:now() }).catch((error:any)=>safeBestEffort(error,{operation:'leadDiscoveryAgent',fallback:null,severity:'secondary'}));
    if (service && task?.id) await service.entities.AgentTask.update(task.id, { status:'failed', error:code, output_summary:`Discovery provider failed safely: ${code}`, completed_at:now() }).catch((error:any)=>safeBestEffort(error,{operation:'leadDiscoveryAgent',fallback:null,severity:'secondary'}));
    return Response.json({ ok:false, error:code, task_id:task?.id || null, checkpoint_id:checkpoint?.id || null, retryable:['APOLLO_RATE_LIMITED','APOLLO_UPSTREAM_UNAVAILABLE','APOLLO_REQUEST_FAILED'].includes(code), secret_exposed:false }, { status:Number(error?.status || 500) === 429 ? 429 : 500 });
  }
});
