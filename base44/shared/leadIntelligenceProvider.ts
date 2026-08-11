export const LEAD_INTELLIGENCE_PROVIDER_VERSION = 'lead-intelligence-provider-1.0.0';
export const APOLLO_PROVIDER_KEY = 'apollo';
export const INSTANTLY_SUPERSEARCH_PROVIDER_KEY = 'instantly_supersearch';
export const APOLLO_CONTRACT_EXPIRES_AT = '2026-09-07T23:59:59.999Z';

export type LeadProviderStatus = 'NOT_CONFIGURED'|'CONFIGURED'|'AUTHENTICATED'|'ACTIVE'|'DEGRADED'|'ERROR'|'EXPIRED';

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
export class InstantlySuperSearchLeadProvider implements LeadIntelligenceProvider {
  readonly key = INSTANTLY_SUPERSEARCH_PROVIDER_KEY;
  readonly capabilities = ['future_supersearch_preview','future_supersearch_enrichment'];
  constructor(private readonly configured=false, private readonly permissionVerified=false) {}
  status(){
    if(!this.configured)return {status:'NOT_CONFIGURED' as const,available:false,reason:'secret_missing',expires_at:null};
    if(!this.permissionVerified)return {status:'CONFIGURED' as const,available:false,reason:'supersearch_permission_not_verified',expires_at:null};
    return {status:'AUTHENTICATED' as const,available:true,reason:null,expires_at:null};
  }
  async searchCompanies(){throw Object.assign(new Error('instantly_supersearch_not_enabled'),{code:'PROVIDER_NOT_ENABLED'});}
  async searchPeople(){throw Object.assign(new Error('instantly_supersearch_not_enabled'),{code:'PROVIDER_NOT_ENABLED'});}
}

export function leadProviderRegistry(input:{apolloConfigured?:boolean;instantlyConfigured?:boolean;instantlySuperSearchPermission?:boolean}={}) {
  return [
    {key:APOLLO_PROVIDER_KEY,role:'lead_intelligence',...new ApolloLeadProvider(async()=>{throw new Error('request_not_bound')},Boolean(input.apolloConfigured)).status()},
    {key:INSTANTLY_SUPERSEARCH_PROVIDER_KEY,role:'lead_intelligence',...new InstantlySuperSearchLeadProvider(Boolean(input.instantlyConfigured),Boolean(input.instantlySuperSearchPermission)).status()},
  ];
}
