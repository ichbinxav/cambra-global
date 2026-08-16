import { attemptFailClosedOperation } from './criticalExecution.ts';

export const RATE_LIMIT_VERSION='rate-limit-cas-v2.0.0';
export const RATE_LIMIT_FINGERPRINT_VERSION='rate-limit-hmac-sha256-v1';
export const RATE_LIMIT_MAX_CAS_ATTEMPTS=6;

type PrincipalType='api_key'|'oauth_token'|'network_hmac';
type FingerprintConfig={
  secret?:string;
  secret_version?:string;
  previous_secret?:string;
  previous_secret_version?:string;
  trusted_header?:string;
};

export class RateLimitFingerprintError extends Error{
  code:string;status:number;
  constructor(code:string,status=503){super(code);this.name='RateLimitFingerprintError';this.code=code;this.status=status;}
}

const env=(key:string)=>typeof Deno!=='undefined'?String(Deno.env.get(key)||''):'';
const clean=(value:unknown)=>String(value??'').trim();
const ALLOWED_TRUSTED_HEADERS=new Set(['x-real-ip','cf-connecting-ip','x-forwarded-for']);

function normalizeAddress(value:string){
  let raw=clean(value).toLowerCase();
  if(!raw)throw new RateLimitFingerprintError('rate_limit_trusted_address_unavailable');
  if(raw.startsWith('[')){
    const match=raw.match(/^\[([^\]]+)\](?::\d{1,5})?$/);
    if(!match)throw new RateLimitFingerprintError('rate_limit_trusted_address_invalid');
    raw=match[1];
  }
  else if(/^\d{1,3}(?:\.\d{1,3}){3}:\d+$/.test(raw))raw=raw.slice(0,raw.lastIndexOf(':'));
  if(/^\d{1,3}(?:\.\d{1,3}){3}$/.test(raw)){
    const parts=raw.split('.').map(Number);
    if(parts.every((part)=>Number.isInteger(part)&&part>=0&&part<=255))return parts.join('.');
    throw new RateLimitFingerprintError('rate_limit_trusted_address_invalid');
  }
  if(raw.includes(':')&&raw.length<=64&&/^[0-9a-f:.]+$/.test(raw)){
    try{return new URL(`http://[${raw}]/`).hostname.replace(/^\[|\]$/g,'').toLowerCase();}
    catch{throw new RateLimitFingerprintError('rate_limit_trusted_address_invalid');}
  }
  throw new RateLimitFingerprintError('rate_limit_trusted_address_invalid');
}

export function readTrustedClientAddress(req:Request,configuredHeader?:string){
  const header=clean(configuredHeader||env('RATE_LIMIT_TRUSTED_PROXY_HEADER')||'x-real-ip').toLowerCase();
  if(!ALLOWED_TRUSTED_HEADERS.has(header))throw new RateLimitFingerprintError('rate_limit_trusted_proxy_header_invalid');
  const value=clean(req.headers.get(header));
  // X-Forwarded-For is accepted only when explicitly configured. Selecting
  // the right-most supplied hop prevents a caller-controlled left prefix from
  // minting unlimited identities; the trusted platform proxy must own/strip
  // the configured header at ingress.
  const forwarded=value.split(',').map(clean).filter(Boolean);
  const selected=header==='x-forwarded-for'?clean(forwarded.at(-1)):value;
  return normalizeAddress(selected);
}

async function hmacHex(secret:string,message:string){
  const encoder=new TextEncoder();
  const key=await crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const signature=await crypto.subtle.sign('HMAC',key,encoder.encode(message));
  return Array.from(new Uint8Array(signature)).map((byte)=>byte.toString(16).padStart(2,'0')).join('');
}

function validateVersion(value:string){
  const version=clean(value);
  if(!/^[a-z0-9][a-z0-9._-]{0,47}$/i.test(version))throw new RateLimitFingerprintError('rate_limit_secret_version_invalid');
  return version;
}

/**
 * Irreversible, domain-separated network fingerprint. Raw addresses are used
 * only in memory and never returned or persisted. Rotation is explicit: while
 * previous_* is configured both buckets are consumed, so rotation cannot reset
 * an attacker's allowance.
 */
export async function deriveRequestNetworkFingerprints(req:Request,namespace:string,config:FingerprintConfig={}){
  const domain=clean(namespace).toLowerCase();
  if(!/^[a-z0-9][a-z0-9:_-]{0,95}$/.test(domain))throw new RateLimitFingerprintError('rate_limit_namespace_invalid',400);
  const secret=clean(config.secret||env('RATE_LIMIT_HMAC_SECRET'));
  if(secret.length<32)throw new RateLimitFingerprintError('rate_limit_secret_unavailable');
  const versionRaw=clean(config.secret_version||env('RATE_LIMIT_HMAC_SECRET_VERSION'));
  if(!versionRaw)throw new RateLimitFingerprintError('rate_limit_secret_version_unavailable');
  const version=validateVersion(versionRaw);
  const address=readTrustedClientAddress(req,config.trusted_header);
  const build=async(key:string,keyVersion:string)=>`rlh:${keyVersion}:${await hmacHex(key,`${RATE_LIMIT_FINGERPRINT_VERSION}|${domain}|${keyVersion}|${address}`)}`;
  const current=await build(secret,version),principals=[current];
  const previousSecret=clean(config.previous_secret||env('RATE_LIMIT_HMAC_PREVIOUS_SECRET'));
  const previousVersionRaw=clean(config.previous_secret_version||env('RATE_LIMIT_HMAC_PREVIOUS_SECRET_VERSION'));
  if(previousSecret||previousVersionRaw){
    if(previousSecret.length<32||!previousVersionRaw)throw new RateLimitFingerprintError('rate_limit_previous_secret_configuration_invalid');
    const previousVersion=validateVersion(previousVersionRaw);
    if(previousVersion===version)throw new RateLimitFingerprintError('rate_limit_secret_versions_must_differ');
    principals.push(await build(previousSecret,previousVersion));
  }
  return{current,principals,secret_version:version,network_address_persisted:false};
}

function updatedExactlyOne(result:any){return Boolean(result&&(result.updated===1||result.modified_count===1||result.matched_count===1));}
export function rateLimitWindow(windowSeconds:number,at=new Date()){
  const seconds=Math.max(1,Math.floor(Number(windowSeconds)||60)),startMs=Math.floor(at.getTime()/(seconds*1000))*seconds*1000;
  return{window_start:new Date(startMs).toISOString(),reset:new Date(startMs+seconds*1000).toISOString(),retry_after_seconds:Math.max(1,Math.ceil((startMs+seconds*1000-at.getTime())/1000))};
}

/**
 * Concurrency-safe even if a missing bucket is created twice: total usage is
 * the sum of every matching row; established rows are incremented with CAS.
 * At a boundary, only one contender can increment a given count revision and
 * losers must reread the aggregate before being allowed.
 */
export async function consumeRateLimit(svc:any,input:{principal_id:string;principal_type?:PrincipalType;limit:number;window_seconds:number;at?:Date}){
  const principalId=String(input.principal_id||'').trim(),principalType=String(input.principal_type||''),limit=Math.floor(Number(input.limit)),windowSeconds=Math.floor(Number(input.window_seconds));
  if(!principalId||!['api_key','oauth_token','network_hmac'].includes(principalType)||!Number.isInteger(limit)||limit<=0||!Number.isInteger(windowSeconds)||windowSeconds<=0)return{ok:false,remaining:0,limit:Number.isInteger(limit)?limit:0,reset:null,retry_after_seconds:windowSeconds||60,reason:'invalid_rate_limit_configuration'};
  const at=input.at||new Date(),window=rateLimitWindow(windowSeconds,at);
  for(let attempt=1;attempt<=RATE_LIMIT_MAX_CAS_ATTEMPTS;attempt++){
    const rows=await attemptFailClosedOperation('rate_limit_counter_read',()=>svc.entities.RateLimitCounter.filter({principal_id:principalId,window_start:window.window_start},'created_date',100));
    if(!Array.isArray(rows))return{ok:false,remaining:0,limit,reset:window.reset,retry_after_seconds:window.retry_after_seconds,reason:'rate_limit_store_unavailable'};
    const total=rows.reduce((sum:number,row:any)=>sum+Math.max(0,Number(row.count||0)),0);
    if(total>=limit)return{ok:false,remaining:0,limit,reset:window.reset,retry_after_seconds:window.retry_after_seconds,reason:'rate_limited'};
    if(rows.length===0){
      const created=await attemptFailClosedOperation('rate_limit_counter_create',()=>svc.entities.RateLimitCounter.create({principal_id:principalId,principal_type:principalType,window_start:window.window_start,count:1,limit_per_minute:limit,window_seconds:windowSeconds}));
      if(created)return{ok:true,remaining:Math.max(0,limit-1),limit,reset:window.reset,retry_after_seconds:window.retry_after_seconds,version:RATE_LIMIT_VERSION};
      continue;
    }
    const target=[...rows].sort((a:any,b:any)=>String(a.created_date||'').localeCompare(String(b.created_date||''))||String(a.id).localeCompare(String(b.id)))[0];const oldCount=Math.max(0,Number(target.count||0));
    const changed=await attemptFailClosedOperation('rate_limit_counter_cas',()=>svc.entities.RateLimitCounter.updateMany({id:target.id,window_start:window.window_start,count:oldCount},{$set:{count:oldCount+1,limit_per_minute:limit,window_seconds:windowSeconds}}));
    if(updatedExactlyOne(changed))return{ok:true,remaining:Math.max(0,limit-total-1),limit,reset:window.reset,retry_after_seconds:window.retry_after_seconds,version:RATE_LIMIT_VERSION};
  }
  return{ok:false,remaining:0,limit,reset:window.reset,retry_after_seconds:window.retry_after_seconds,reason:'rate_limit_concurrency_exhausted'};
}

export async function consumePublicRequestRateLimit(svc:any,req:Request,input:{namespace:string;limit:number;window_seconds:number;at?:Date},config:FingerprintConfig={}){
  let derived;
  try{derived=await deriveRequestNetworkFingerprints(req,input.namespace,config);}
  catch(error){
    const code=error instanceof RateLimitFingerprintError?error.code:'rate_limit_fingerprint_unavailable';
    return{ok:false,remaining:0,limit:input.limit,reset:null,retry_after_seconds:input.window_seconds,status:503,reason:code,network_fingerprint:null};
  }
  let last:any=null;
  for(const principalId of derived.principals){
    last=await consumeRateLimit(svc,{principal_id:principalId,principal_type:'network_hmac',limit:input.limit,window_seconds:input.window_seconds,at:input.at});
    if(!last.ok)return{...last,status:last.reason==='rate_limited'?429:503,network_fingerprint:derived.current,fingerprint_version:derived.secret_version};
  }
  return{...last,ok:true,status:200,network_fingerprint:derived.current,fingerprint_version:derived.secret_version};
}
