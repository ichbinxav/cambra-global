export type SingletonAuthorityStatus='EXACTLY_ONE'|'MISSING'|'DUPLICATE'|'UNAVAILABLE';

export type SingletonAuthorityRead<T=any>={
  ok:boolean;
  status:SingletonAuthorityStatus;
  row:T|null;
  rows:T[];
  count:number;
  authority:string;
  blocker:string|null;
  error?:string;
};

const compact=(value:any)=>String(value?.code||value?.message||value||'authority_read_failed').replace(/[\r\n]+/g,' ').slice(0,160);

/**
 * Reads a global authority as a singleton, never as "latest wins".
 *
 * A limit of two is intentional: one row proves uniqueness, while a second
 * row is enough to prove split-brain and deny material execution. Callers
 * must not select rows[0] when this result is not ok.
 */
export async function readSingletonAuthority<T=any>(svc:any,input:{
  entity:string;
  query:any;
  sort?:string;
  authority?:string;
}):Promise<SingletonAuthorityRead<T>>{
  const authority=String(input.authority||input.entity||'singleton').toLowerCase();
  try{
    const rows=await svc.entities[input.entity].filter(input.query,input.sort||'-updated_at',2);
    if(!Array.isArray(rows))return{ok:false,status:'UNAVAILABLE',row:null,rows:[],count:0,authority,blocker:`${authority}_authority_unavailable`};
    if(rows.length===1)return{ok:true,status:'EXACTLY_ONE',row:rows[0] as T,rows:rows as T[],count:1,authority,blocker:null};
    if(rows.length===0)return{ok:false,status:'MISSING',row:null,rows:[],count:0,authority,blocker:`${authority}_authority_missing`};
    return{ok:false,status:'DUPLICATE',row:null,rows:rows as T[],count:rows.length,authority,blocker:`${authority}_authority_duplicate`};
  }catch(error){
    return{ok:false,status:'UNAVAILABLE',row:null,rows:[],count:0,authority,blocker:`${authority}_authority_unavailable`,error:compact(error)};
  }
}

export async function requireSingletonAuthority<T=any>(svc:any,input:{entity:string,query:any,sort?:string,authority?:string}):Promise<T>{
  const result=await readSingletonAuthority<T>(svc,input);
  if(result.ok&&result.row)return result.row;
  const error:any=new Error(result.blocker||'singleton_authority_unavailable');
  error.code='SINGLETON_AUTHORITY_BLOCKED';
  error.status=409;
  error.authority_state=result;
  throw error;
}

/**
 * Bootstraps only a genuinely missing authority and keeps the candidate
 * contained until a post-create uniqueness read proves there is exactly one.
 * Concurrent bootstrap candidates therefore remain fail-closed and surface a
 * split-brain blocker instead of making either row authoritative.
 */
export async function bootstrapContainedSingleton<T=any>(svc:any,input:{
  entity:string;
  query:any;
  sort?:string;
  authority?:string;
  containedCandidate:()=>any;
}):Promise<SingletonAuthorityRead<T>&{created?:boolean,created_id?:string|null}>{
  const initial=await readSingletonAuthority<T>(svc,input);
  if(initial.status!=='MISSING')return initial;
  let created:any;
  try{created=await svc.entities[input.entity].create(input.containedCandidate());}
  catch(error){return{...initial,status:'UNAVAILABLE',blocker:`${initial.authority}_authority_bootstrap_failed`,error:compact(error),created:false};}
  const verified=await readSingletonAuthority<T>(svc,input);
  const same=verified.ok&&String((verified.row as any)?.id||'')===String(created?.id||'');
  if(same)return{...verified,created:true,created_id:String(created?.id||'')||null};
  return{...verified,ok:false,row:null,blocker:verified.status==='DUPLICATE'?`${initial.authority}_authority_bootstrap_conflict`:(verified.blocker||`${initial.authority}_authority_bootstrap_unverified`),created:true,created_id:String(created?.id||'')||null};
}

/**
 * Emergency containment is the one operation that must visit every conflicting
 * row. A full page is treated as truncated, so the caller can contain the rows
 * it saw while still returning a visible failure rather than claiming PASS.
 */
export async function readAuthorityRowsForContainment<T=any>(svc:any,input:{
  entity:string;
  query:any;
  sort?:string;
  authority?:string;
  limit?:number;
}):Promise<{ok:boolean,rows:T[],count:number,complete:boolean,authority:string,blocker:string|null,error?:string}>{
  const authority=String(input.authority||input.entity||'singleton').toLowerCase();
  const limit=Math.max(2,Math.min(5000,Number(input.limit||1000)));
  try{
    const rows=await svc.entities[input.entity].filter(input.query,input.sort||'-updated_at',limit);
    if(!Array.isArray(rows))return{ok:false,rows:[],count:0,complete:false,authority,blocker:`${authority}_containment_read_unavailable`};
    const complete=rows.length<limit;
    return{ok:complete,rows:rows as T[],count:rows.length,complete,authority,blocker:complete?null:`${authority}_containment_scope_truncated`};
  }catch(error){return{ok:false,rows:[],count:0,complete:false,authority,blocker:`${authority}_containment_read_unavailable`,error:compact(error)};}
}
