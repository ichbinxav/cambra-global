import { safeBestEffort } from '../../shared/bestEffort.ts';
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import { buildFounderSnapshot } from '../../shared/founderOSData.ts';
// COMMAND-C5: routed across both providers by task class instead of pinned to
// Anthropic. Every routed call — including a refusal — writes a
// ModelRouteDecision, so "declined to answer" and "never asked" stay distinct.
import { callCambraModel } from '../../shared/commandModelRouter.ts';
// COMMAND-C3: model-authored citations are validated against the evidence the
// model was actually given, instead of being trusted as free text.
import{guardBriefCitations,briefEpistemicCeiling,citableRefsFromEvidence}from'../../shared/commandCitationGuard.ts';

function parse(text:string) {
  const clean=text.replace(/```json\s*/gi,'').replace(/```/g,'').trim();
  try{return JSON.parse(clean);}catch(error){safeBestEffort(error,{operation:'founderChiefOfStaff',fallback:null,severity:'secondary'})}
  const match=clean.match(/\{[\s\S]*\}/);if(match)try{return JSON.parse(match[0]);}catch(error){safeBestEffort(error,{operation:'founderChiefOfStaff',fallback:null,severity:'secondary'})}
  return null;
}

Deno.serve(async(req)=>{
  try{
    const base44=createClientFromRequest(req);const user=await base44.auth.me().catch((error:any)=>safeBestEffort(error,{operation:'founderChiefOfStaff',fallback:null,severity:'secondary'}));
    if(!user||user.role!=='admin')return Response.json({ok:false,error:'Forbidden'},{status:403});
    const svc=base44.asServiceRole;
    const [snapshot,directives,meetings]=await Promise.all([
      buildFounderSnapshot(svc),
      svc.entities.StrategyDirective.filter({status:'active'},'-priority',50).catch((error:any)=>safeBestEffort(error,{operation:'founderChiefOfStaff',fallback:[],severity:'secondary'})),
      svc.entities.CommunicationThread.filter({meeting_start_at:{$gte:new Date().toISOString()},meeting_status:'booked'},'meeting_start_at',20).catch((error:any)=>safeBestEffort(error,{operation:'founderChiefOfStaff',fallback:[],severity:'secondary'})),
    ]);
    const upcomingMeetings=meetings.map((thread:any)=>({time:thread.meeting_start_at,counterparty:thread.counterparty_name||thread.counterparty_email,company:thread.company_name||'',reason:(thread.founder_escalation_reasons||[]).join(', '),expected_value_minor:Number(thread.founder_expected_value_minor||0),currency:thread.meeting_brief_json?.economics?.currency||'',objective:thread.meeting_brief_json?.objective||'',thread_id:thread.id,brief:thread.meeting_brief_json||{}}));
    const evidence={generated_at:snapshot.generated_at,metrics:snapshot.metrics,attention:snapshot.attention.slice(0,10),opportunities:snapshot.opportunities.slice(0,10),risks:snapshot.risks.slice(0,10),operations:snapshot.operations,ai_workforce:{task_count_7d:snapshot.ai_workforce.task_count_7d,failed_7d:snapshot.ai_workforce.failed_7d},directives:directives.map((item:any)=>({scope:item.scope,directive:item.directive,priority:item.priority})),upcoming_founder_meetings:upcomingMeetings};
    const prompt=['You are CAMBRA Chief of Staff. Produce an executive brief using ONLY supplied internal evidence. Never invent a metric, trend, target, forecast or causal claim. Never invent a fact about a counterparty. If comparison data is absent, do not say a metric increased/decreased. Separate facts from hypotheses. Prioritize founder-only material attention; routine autonomous work should not create cognitive load. Include upcoming founder meetings with time, counterparty, company, reason, expected value and one-line objective only when supplied. Return ONLY JSON:',`{"status":"normal|attention|critical","headline":"","changed_since_last_view":[{"text":"","evidence_refs":[]}],"money":"","growth":"","merchant_value":"","aggregate":"","providers":"","operations":"","ai_workforce":"","upcoming_meetings":[{"time":"","counterparty":"","company":"","reason":"","expected_value":"","objective":"","thread_id":""}],"founder_actions":[{"priority":0,"title":"","why":"","recommended_action":"","evidence_refs":[]}],"unknowns":[]}`,'You may cite ONLY the identifiers listed under CITABLE_REFS, verbatim. If no listed identifier supports a statement, return an empty evidence_refs for it rather than inventing one. A fabricated reference is worse than no reference.','CITABLE_REFS',JSON.stringify([...citableRefsFromEvidence(evidence)].sort()),'EVIDENCE',JSON.stringify(evidence)].join('\n');
    const routed=await callCambraModel(prompt,{task_class:'REASONING',maxTokens:2400,svc,eventKey:`brief:${snapshot.generated_at}`,source:'founderChiefOfStaff'});
    const brief=parse(routed.text);
    if(!brief)return Response.json({ok:false,error:'chief_of_staff_unparseable',fallback:evidence},{status:500});
    const guarded=guardBriefCitations(brief,evidence);
    return Response.json({ok:true,brief:guarded.brief,citation_audit:guarded.citation_audit,answered_by:{provider:routed.provider,model:routed.model},epistemic_ceiling:briefEpistemicCeiling(snapshot),evidence_snapshot:evidence,generated_at:snapshot.generated_at,snapshot_data_complete:snapshot.data_complete!==false,snapshot_degraded_sources:snapshot.degraded_sources||[],truth_boundary:'Narrative is AI-generated; all authoritative values come from evidence_snapshot. Every evidence_ref is validated against that snapshot: unresolved_evidence_refs means the model cited something it was never given. Missing evidence remains unknown.'});
  }catch(error){console.error('founderChiefOfStaff failed',error);return Response.json({ok:false,error:'founder_chief_of_staff_failed'},{status:500});}
});
