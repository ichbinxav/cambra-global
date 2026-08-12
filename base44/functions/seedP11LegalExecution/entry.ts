import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import { ACTION_POLICIES, EUROPE_33, LEGAL_EXECUTION_VERSION } from '../../shared/legalExecution.ts';

export async function handleSeedP11LegalExecution(req: Request) {
  try{
    const base44=createClientFromRequest(req);
    const user=await base44.auth.me().catch(()=>null);
    if(user?.role!=='admin')return Response.json({ok:false,error:'admin_required'},{status:403});
    const svc=base44.asServiceRole;
    const now=new Date().toISOString();
    let created=0,existing=0;
    for(const jurisdiction of EUROPE_33){
      for(const requestedAction of Object.keys(ACTION_POLICIES)){
        const policyKey=`${LEGAL_EXECUTION_VERSION}:${jurisdiction}:${requestedAction}:conservative`;
        const found=await svc.entities.LegalExecutionPolicy.filter({policy_key:policyKey},'-created_date',1).catch(()=>[]);
        if(found[0]){existing++;continue;}
        await svc.entities.LegalExecutionPolicy.create({
          policy_key:policyKey,jurisdiction,requested_action:requestedAction,status:'LEGAL_REVIEW_REQUIRED',
          confidence:'COUNSEL_REQUIRED',review_status:'DRAFT',version:LEGAL_EXECUTION_VERSION,evidence_refs:[],conditions:[],
          merchant_approval_required:true,signature_requirement:'LEGAL_REVIEW_REQUIRED',signer_capacity_requirement:'VERIFIED',
          counsel_required:true,effective_from:now,active:true,
        });
        created++;
      }
    }
    return Response.json({ok:true,created,existing,markets:EUROPE_33.length,actions:Object.keys(ACTION_POLICIES).length,permission_granted:0,note:'Conservative seed creates review-required rows only.'});
  }catch(error){console.error('seedP11LegalExecution failed',error);return Response.json({ok:false,error:'p11_seed_failed'},{status:500});}
}
