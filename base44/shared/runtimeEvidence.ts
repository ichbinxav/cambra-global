import { sha256Canonical } from './legalExecution.ts';

export const RUNTIME_EVIDENCE_VERSION = 'runtime-evidence-1.0.0';

export async function recordRuntimeGateEvidence(svc:any, input:any) {
  const observedAt = String(input.observed_at || new Date().toISOString());
  const evidenceKind = String(input.evidence_kind || 'REAL_RUNTIME');
  const status = ['PASS','FAIL','BLOCKED','NOT_RUN'].includes(String(input.status)) ? String(input.status) : 'BLOCKED';
  const payload = {
    gate_key:String(input.gate_key || ''), environment:String(input.environment || 'production'), git_sha:String(input.git_sha || ''),
    source_tree_hash:String(input.source_tree_hash || ''), status, evidence_kind:evidenceKind, source:String(input.source || ''),
    external_run_id:String(input.external_run_id || ''), evidence_refs:Array.isArray(input.evidence_refs) ? input.evidence_refs.filter(Boolean).map(String) : [],
    details_json:{ ...(input.details_json || {}), evidence_version:RUNTIME_EVIDENCE_VERSION }, observed_at:observedAt,
    expires_at:input.expires_at || undefined, recorded_by:String(input.recorded_by || 'runtime_verifier'),
  };
  if (!payload.gate_key || !payload.source) throw new Error('gate_key_and_source_required');
  const evidenceHash = await sha256Canonical(payload);
  return svc.entities.RuntimeGateEvidence.create({ evidence_key:`${payload.gate_key}:${observedAt}:${evidenceHash.slice(0,16)}`, ...payload, evidence_hash:evidenceHash });
}

export function runtimeGitSha(input:any = {}) {
  return String(input.final_sha || Deno.env.get('CAMBRA_GIT_SHA') || '').trim();
}
