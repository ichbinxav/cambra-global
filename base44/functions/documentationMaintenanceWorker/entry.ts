import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import { requireAdminOrInternal } from '../../shared/internalGate.ts';
import { DOCUMENTATION_TOPICS, DOCUMENTATION_REGISTRY_VERSION, DOCUMENTATION_SYSTEM_VERSION } from '../../shared/documentationRegistry.ts';

const now = () => new Date().toISOString();

async function hash(value:any) {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest)).map(x => x.toString(16).padStart(2, '0')).join('');
}

async function ensureVersion(s:any, topic:any, version:string, contentHash:string, content:any, at:string) {
  const versionKey = `${topic.key}:${contentHash}`;
  const existing = await s.entities.DocumentationVersion.filter({ version_key:versionKey }, '-created_at', 1).catch(() => []);
  if (existing[0]) return false;
  await s.entities.DocumentationVersion.create({
    version_key:versionKey,
    doc_key:topic.key,
    version,
    system_version:DOCUMENTATION_SYSTEM_VERSION,
    content_hash:contentHash,
    content_json:content,
    source_paths:topic.source_paths,
    created_at:at,
    created_by:'documentation_maintenance',
  });
  return true;
}

async function ensureProposal(s:any, input:any) {
  const old = await s.entities.DocumentationChangeProposal.filter({ proposal_key:input.proposal_key }, '-detected_at', 1).catch(() => []);
  if (old[0]) return false;
  await s.entities.DocumentationChangeProposal.create(input);
  return true;
}

Deno.serve(async (req) => {
  try {
    const b = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const gate = await requireAdminOrInternal(req, b, body);
    if (!gate.ok) return gate.response;
    const s = b.asServiceRole;
    const at = now();
    let changed = 0, created = 0, versionsCreated = 0;
    const details:any[] = [];

    for (const topic of DOCUMENTATION_TOPICS) {
      const content = {
        title:topic.title,
        category:topic.category,
        implementation_status:topic.implementation_status,
        critical:topic.critical,
        summary:topic.summary,
        how_it_works:topic.how_it_works,
        founder_action:topic.founder_action,
        truth_boundary:topic.truth_boundary,
        controls:topic.controls || [],
      };
      const contentHash = await hash(content);
      const version = `${DOCUMENTATION_REGISTRY_VERSION}:${contentHash.slice(0,12)}`;
      const old = (await s.entities.DocumentationObject.filter({ doc_key:topic.key }, '-last_verified_at', 1).catch(() => []))[0] || null;
      const row = {
        doc_key:topic.key,
        title:topic.title,
        category:topic.category,
        implementation_status:topic.implementation_status,
        drift_status:'CURRENT',
        version,
        system_version:DOCUMENTATION_SYSTEM_VERSION,
        owner:topic.owner,
        last_verified_at:at,
        source_paths:topic.source_paths,
        content_json:content,
        content_hash:contentHash,
      };
      if (!old) {
        await s.entities.DocumentationObject.create(row);
        created++;
        changed++;
      } else {
        if (old.content_hash !== contentHash) changed++;
        await s.entities.DocumentationObject.update(old.id, row);
      }
      if (await ensureVersion(s, topic, version, contentHash, content, at)) versionsCreated++;
      details.push({ key:topic.key, implementation_status:topic.implementation_status, drift_status:'CURRENT', critical:topic.critical, content_hash:contentHash });
    }

    // Real failures feed the living-documentation queue. The worker NEVER invents
    // source-controlled prose automatically; it proposes a bounded documentation
    // impact so a verified code/docs change can close it through release gates.
    const resolvedCritical = await s.entities.AutonomyIncident.filter({ status:'resolved', severity:'critical' }, '-resolved_at', 100).catch(() => []);
    let proposalsCreated = 0;
    for (const incident of resolvedCritical) {
      if (!incident?.id) continue;
      const proposal = {
        proposal_key:`incident:${incident.id}`,
        trigger_type:'incident',
        source_entity_type:'AutonomyIncident',
        source_entity_id:incident.id,
        doc_key:'maintenance',
        status:'pending',
        impact_summary:`Review troubleshooting/incident documentation after critical ${incident.domain || 'system'} incident: ${String(incident.summary || '').slice(0,300)}`,
        proposed_update_json:{
          root_cause:incident.root_cause || null,
          actions_taken:incident.actions_taken_json || [],
          recovery:incident.recovery_json || {},
          prevention:incident.prevention_json || {},
          target_docs:['src/docs/P18_TROUBLESHOOTING_PLAYBOOKS.md','src/docs/P18_INCIDENT_PLAYBOOKS.md','src/docs/CAMBRA_OPERATING_BIBLE.md'],
          instruction:'Update only when the incident teaches a durable behavior/failure mode; verify against actual implementation before closing the proposal.',
        },
        detected_at:at,
        owner:'engineering',
      };
      if (await ensureProposal(s, proposal)) proposalsCreated++;
    }

    const learnedRemediations = await s.entities.RemediationKnowledge.list('-last_verified_at', 100).catch(() => []);
    for (const item of learnedRemediations.filter((x:any) => Number(x.success_count || 0) + Number(x.failure_count || 0) > 0)) {
      if (!item?.id) continue;
      const proposal = {
        proposal_key:`remediation:${item.id}:${Number(item.success_count || 0)}:${Number(item.failure_count || 0)}`,
        trigger_type:'remediation',
        source_entity_type:'RemediationKnowledge',
        source_entity_id:item.id,
        doc_key:'maintenance',
        status:'pending',
        impact_summary:`Review troubleshooting knowledge for ${item.incident_type || item.domain || 'maintenance'} after observed remediation outcomes.`,
        proposed_update_json:{ successful_action:item.successful_action || null, success_count:item.success_count || 0, failure_count:item.failure_count || 0, confidence:item.confidence || 0, target_docs:['src/docs/P18_TROUBLESHOOTING_PLAYBOOKS.md'] },
        detected_at:at,
        owner:'engineering',
      };
      if (await ensureProposal(s, proposal)) proposalsCreated++;
    }

    const pending = await s.entities.DocumentationChangeProposal.filter({ status:'pending' }, '-detected_at', 500).catch(() => []);
    const criticalPending = pending.filter((x:any) => x.trigger_type === 'incident').length;
    const implementation = {
      implemented:DOCUMENTATION_TOPICS.filter(x => x.implementation_status === 'IMPLEMENTED').length,
      partial:DOCUMENTATION_TOPICS.filter(x => x.implementation_status === 'PARTIALLY_IMPLEMENTED').length,
      planned:DOCUMENTATION_TOPICS.filter(x => x.implementation_status === 'PLANNED').length,
      missing:DOCUMENTATION_TOPICS.filter(x => x.implementation_status === 'MISSING').length,
      deprecated:DOCUMENTATION_TOPICS.filter(x => x.implementation_status === 'DEPRECATED').length,
    };
    const score = Math.max(0, 100 - Math.min(60, pending.length * 3 + criticalPending * 5));
    const assessment = {
      assessment_key:`documentation-health:${at.slice(0,10)}`,
      score,
      current_count:DOCUMENTATION_TOPICS.length,
      outdated_count:0,
      incomplete_count:pending.length,
      contradictory_count:0,
      unverified_count:0,
      critical_drift_count:criticalPending,
      system_version:DOCUMENTATION_SYSTEM_VERSION,
      registry_version:DOCUMENTATION_REGISTRY_VERSION,
      details_json:{
        topics:details,
        implementation,
        changed,
        created,
        versions_created:versionsCreated,
        pending_change_proposals:pending.slice(0,100).map((x:any) => ({ id:x.id, proposal_key:x.proposal_key, trigger_type:x.trigger_type, impact_summary:x.impact_summary, detected_at:x.detected_at })),
        proposals_created:proposalsCreated,
        truth:'Runtime objects/version history are derived from the source-controlled registry. Source-path drift is independently enforced by documentation:check/release:check. Incident proposals never auto-edit canonical source documentation.',
      },
      calculated_at:at,
    };
    const previous = (await s.entities.DocumentationHealthAssessment.filter({ assessment_key:assessment.assessment_key }, '-calculated_at', 1).catch(() => []))[0];
    if (previous) await s.entities.DocumentationHealthAssessment.update(previous.id, assessment);
    else await s.entities.DocumentationHealthAssessment.create(assessment);

    return Response.json({ ok:true, topics:DOCUMENTATION_TOPICS.length, changed, created, versions_created:versionsCreated, proposals_created:proposalsCreated, pending_proposals:pending.length, assessment });
  } catch (e) {
    console.error(e);
    return Response.json({ ok:false, error:'documentation_maintenance_failed', message:String((e as Error)?.message || e).slice(0,300) }, { status:500 });
  }
});
