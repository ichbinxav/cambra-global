// FMERC-K (2026-08-16) — the full getFounderControlCenter handler, extracted
// verbatim from base44/functions/getFounderControlCenter/entry.ts so behavior
// tests can invoke it without Deno.serve (same pattern as
// emergencyControlAdminCore.ts, Fase J). entry.ts remains the only trust
// boundary; this module never reads the request or environment directly. The
// `deps` parameter exists only for test injection — every default is the real
// implementation.
import { collectFounderControlSnapshot as realCollectFounderControlSnapshot } from './founderControlV2.ts';
import { collectAdminSettingsSnapshot as realCollectAdminSettingsSnapshot } from './adminSettingsV2.ts';
import { collectFounderMerchantsV2 as realCollectFounderMerchantsV2 } from './founderMerchantsV2.ts';
import { internalErrorResponse } from './publicErrors.ts';

export type FounderControlCenterDeps={
  collectFounderControlSnapshot:typeof realCollectFounderControlSnapshot;
  collectAdminSettingsSnapshot:typeof realCollectAdminSettingsSnapshot;
  collectFounderMerchantsV2:typeof realCollectFounderMerchantsV2;
};

const REAL_DEPS:FounderControlCenterDeps={
  collectFounderControlSnapshot:realCollectFounderControlSnapshot,
  collectAdminSettingsSnapshot:realCollectAdminSettingsSnapshot,
  collectFounderMerchantsV2:realCollectFounderMerchantsV2,
};

export async function handleFounderControlCenter(user:any,body:any,svc:any,deps:FounderControlCenterDeps=REAL_DEPS):Promise<Response>{
  try{
    if(!user)return Response.json({ok:false,error:'Unauthorized'},{status:401});
    if(user.role!=='admin')return Response.json({ok:false,error:'Forbidden'},{status:403});
    if(String(body?.view||'').toLowerCase()==='settings') {
      const snapshot=await deps.collectAdminSettingsSnapshot(svc,user,body?.section);
      return Response.json(snapshot,{status:snapshot.ok===false?400:200});
    }
    if(String(body?.view||'').toLowerCase()==='merchants') {
      const snapshot=await deps.collectFounderMerchantsV2(svc,user,body);
      const status=Number(snapshot?.http_status)||(snapshot?.ok===false?400:200);
      if(snapshot&&typeof snapshot==='object'&&'http_status' in snapshot)delete snapshot.http_status;
      return Response.json(snapshot,{status});
    }
    return Response.json(await deps.collectFounderControlSnapshot(svc));
  }catch(error){
    console.error('getFounderControlCenter failed',error);
    return internalErrorResponse(error,'getFounderControlCenter');
  }
}
