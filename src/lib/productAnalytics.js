import { base44 } from '@/api/base44Client';

export const PRODUCT_ANALYTICS_SCHEMA_VERSION='cambra-product-events-v1';
export const PRODUCT_ANALYTICS_EVENTS=Object.freeze([
  'onboarding_started','onboarding_completed','integration_started','integration_connected','integration_failed',
  'analysis_started','analysis_completed','analysis_failed','results_viewed','opportunity_viewed',
  'recover_started','recover_accepted','recover_abandoned','document_uploaded','document_processing_failed',
  'provider_connection_started','provider_connection_completed','critical_admin_action',
]);
const EVENT_SET=new Set(PRODUCT_ANALYTICS_EVENTS);
const ALLOWED_PROPERTIES=new Set(['source','channel','provider','status','reason_code','mode','locale','market','step','document_type','action']);
const SENSITIVE=/(email|name|token|secret|document|file_name|body|message|address|phone|company|merchant|brand|url|session|user|id$)/i;

export function hasAnalyticsConsent(){
  try{const parsed=JSON.parse(localStorage.getItem('cambra_cookie_consent')||'null');return parsed?.analytics===true}catch{return false}
}
export function sanitizeAnalyticsProperties(properties={}){
  const safe={};
  for(const [key,value] of Object.entries(properties||{})){
    if(!ALLOWED_PROPERTIES.has(key)||SENSITIVE.test(key))continue;
    if(typeof value==='boolean'||typeof value==='number')safe[key]=value;
    else if(typeof value==='string'&&value.length<=80&&!/@|https?:\/\//i.test(value))safe[key]=value;
  }
  return safe;
}
export function trackProductEvent(eventName,properties={}){
  if(!EVENT_SET.has(eventName)||!hasAnalyticsConsent())return false;
  try{
    base44.analytics.track({eventName,properties:{schema_version:PRODUCT_ANALYTICS_SCHEMA_VERSION,...sanitizeAnalyticsProperties(properties)}});
    return true;
  }catch{return false}
}
