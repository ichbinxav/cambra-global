export const LEAD_INTELLIGENCE_PROVIDER_VERSION = 'lead-intelligence-provider-1.0.0';
export const APOLLO_PROVIDER_KEY = 'apollo';
export const INSTANTLY_SUPERSEARCH_PROVIDER_KEY = 'instantly_supersearch';
export const APOLLO_CONTRACT_EXPIRES_AT = '2026-09-07T23:59:59.999Z';

export type LeadProviderStatus = 'NOT_CONFIGURED'|'CONFIGURED'|'AUTHENTICATED'|'ACTIVE'|'DEGRADED'|'ERROR'|'EXPIRED'|'BLOCKED';

export interface LeadIntelligenceProvider {
  readonly key:string;
  readonly capabilities:ReadonlyArray<string>;
  status(now?:Date):{status:LeadProviderStatus;available:boolean;reason:string|null;expires_at:string|null};
  searchCompanies(input:any):Promise<any>;
  searchPeople(input:any):Promise<any>;
  enrichPerson?(input:any):Promise<any>;
}

type ProviderRequest = (path:string, options?:any)=>Promise<any>;

export class ApolloLeadProvider implements LeadIntelligenceProvider {
  readonly key = APOLLO_PROVIDER_KEY;
  readonly capabilities = ['company_search','decision_maker_search','selective_person_enrichment'];
  constructor(private readonly request:ProviderRequest, private readonly configured:boolean) {}
  status(now=new Date()) {
    if (!this.configured) return {status:'NOT_CONFIGURED' as const,available:false,reason:'secret_missing',expires_at:APOLLO_CONTRACT_EXPIRES_AT};
    if (now.getTime()>Date.parse(APOLLO_CONTRACT_EXPIRES_AT)) return {status:'EXPIRED' as const,available:false,reason:'provider_contract_expired',expires_at:APOLLO_CONTRACT_EXPIRES_AT};
    return {status:'ACTIVE' as const,available:true,reason:null,expires_at:APOLLO_CONTRACT_EXPIRES_AT};
  }
  searchCompanies(input:any){return this.request('/mixed_companies/search',{method:'POST',body:input});}
  searchPeople(input:any){return this.request('/mixed_people/api_search',{method:'POST',body:input});}
  enrichPerson(input:any){return this.request('/people/match',{method:'POST',body:input});}
}

/**
 * Explicit future provider boundary. SuperSearch is not called until a real API
 * key, plan permission and founder-approved cost policy are all evidenced.
 */
const list=(value:any,max=100)=>[...new Set((Array.isArray(value)?value:[]).map((item:any)=>String(item||'').trim()).filter(Boolean))].slice(0,max);

/** Maps the same CAMBRA ICP into Instantly's documented SuperSearch schema. */
export function instantlySuperSearchPayload(input:any={}){
  const countries=list(input.countries||input.locations,33);
  const industries=list(input.industries||input.verticals,50);
  const includeKeywords=list(input.include_keywords,50);
  const excludeKeywords=list(input.exclude_keywords,50);
  const search_filters:any={
    ...(countries.length?{locations:countries.map((label:string)=>({label}))}:{}),
    ...(list(input.employee_ranges,20).length?{employeeCount:list(input.employee_ranges,20)}:{}),
    ...(list(input.revenue_ranges,20).length?{revenue:list(input.revenue_ranges,20)}:{}),
    ...(list(input.titles,100).length?{title:{include:list(input.titles,100),exclude:list(input.excluded_titles,100)}}:{}),
    ...(industries.length?{industry:{include:industries,exclude:list(input.excluded_industries,50)}}:{}),
    ...(list(input.technologies,100).length?{technologies:list(input.technologies,100)}:{}),
    ...(list(input.domains,1000).length?{domains:list(input.domains,1000)}:{}),
    ...((includeKeywords.length||excludeKeywords.length)?{keyword_filter:{include:includeKeywords.join(' '),exclude:excludeKeywords.join(' '),include_mode:'ANY'}}:{}),
    skip_owned_leads:input.skip_owned_leads!==false,
    show_one_lead_per_company:input.one_lead_per_company!==false,
    location_mode:'contact',
  };
  return{search_filters,limit:Math.max(1,Math.min(1_000_000,Math.floor(Number(input.limit||100)))),search_name:String(input.search_name||'CAMBRA governed discovery').slice(0,120),work_email_enrichment:input.work_email_enrichment===true,fully_enriched_profile:input.fully_enriched_profile===true,skip_rows_without_email:input.skip_rows_without_email!==false};
}

export class InstantlySuperSearchLeadProvider implements LeadIntelligenceProvider {
  readonly key = INSTANTLY_SUPERSEARCH_PROVIDER_KEY;
  readonly capabilities = ['contact_search','decision_maker_search','supersearch_preview','supersearch_count','selective_contact_enrichment'];
  constructor(private readonly request:ProviderRequest,private readonly configured=false, private readonly permissionVerified=false) {}
  status(){
    if(!this.configured)return {status:'NOT_CONFIGURED' as const,available:false,reason:'secret_missing',expires_at:null};
    if(!this.permissionVerified)return {status:'CONFIGURED' as const,available:false,reason:'supersearch_permission_not_verified',expires_at:null};
    return {status:'BLOCKED' as const,available:false,reason:'contact_person_only_company_search_unsupported',expires_at:null,outbound_transport_affected:false};
  }
  async searchCompanies(_input:any){const error:any=new Error('instantly_company_search_unsupported_contact_person_only');error.code='INSTANTLY_COMPANY_SEARCH_UNSUPPORTED_CONTACT_PERSON_ONLY';error.status=409;throw error;}
  searchPeople(input:any){const payload=instantlySuperSearchPayload(input);return this.request('/supersearch-enrichment/preview-leads-from-supersearch',{method:'POST',body:{search_filters:payload.search_filters}});}
  count(input:any){const payload=instantlySuperSearchPayload(input);return this.request('/supersearch-enrichment/count-leads-from-supersearch',{method:'POST',body:{search_filters:payload.search_filters}});}
  enrichPerson(input:any){return this.request('/supersearch-enrichment/enrich-leads-from-supersearch',{method:'POST',body:instantlySuperSearchPayload({...input,work_email_enrichment:input?.work_email_enrichment!==false})});}
}

export function selectLeadIntelligenceProvider(input:{mode?:string;apolloConfigured?:boolean;instantlyConfigured?:boolean;instantlySuperSearchPermission?:boolean;now?:Date}={}){
  const mode=String(input.mode||'AUTO').toUpperCase();const now=input.now||new Date();const apollo=new ApolloLeadProvider(async()=>{throw new Error('request_not_bound')},Boolean(input.apolloConfigured)).status(now);const instantly=new InstantlySuperSearchLeadProvider(async()=>{throw new Error('request_not_bound')},Boolean(input.instantlyConfigured),Boolean(input.instantlySuperSearchPermission)).status();
  if(mode==='APOLLO')return{selected:apollo.available?APOLLO_PROVIDER_KEY:null,reason:apollo.available?'founder_selected_apollo':apollo.reason,apollo,instantly};
  if(mode==='INSTANTLY')return{selected:instantly.available?INSTANTLY_SUPERSEARCH_PROVIDER_KEY:null,reason:instantly.available?'founder_selected_instantly':instantly.reason,apollo,instantly};
  if(apollo.available)return{selected:APOLLO_PROVIDER_KEY,reason:'apollo_active_until_contract_expiry',apollo,instantly};
  if(instantly.available)return{selected:INSTANTLY_SUPERSEARCH_PROVIDER_KEY,reason:'instantly_company_source_runtime_verified',apollo,instantly};
  return{selected:null,reason:apollo.reason==='provider_contract_expired'&&instantly.reason==='contact_person_only_company_search_unsupported'?'apollo_expired_and_instantly_contact_person_only':apollo.reason==='provider_contract_expired'?'apollo_expired_and_instantly_unavailable':'no_available_lead_provider',apollo,instantly};
}

export function leadProviderRegistry(input:{apolloConfigured?:boolean;instantlyConfigured?:boolean;instantlySuperSearchPermission?:boolean}={}) {
  return [
    {key:APOLLO_PROVIDER_KEY,role:'lead_intelligence',...new ApolloLeadProvider(async()=>{throw new Error('request_not_bound')},Boolean(input.apolloConfigured)).status()},
    {key:INSTANTLY_SUPERSEARCH_PROVIDER_KEY,role:'lead_intelligence',...new InstantlySuperSearchLeadProvider(async()=>{throw new Error('request_not_bound')},Boolean(input.instantlyConfigured),Boolean(input.instantlySuperSearchPermission)).status()},
  ];
}
