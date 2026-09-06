import { laneAuthority } from "./pipelineStageRegistry.ts";

const MERCHANT_LANE = "MERCHANT_ACQUISITION";

/** Updates company/contact evidence while fail-closing on every stage field. */
export async function updateOutboundLeadEvidence(input: {
  svc: any;
  leadId: string;
  patch: Record<string, unknown>;
}) {
  const protectedFields = new Set(
    laneAuthority(MERCHANT_LANE)?.columns || [],
  );
  const attemptedStageFields = Object.keys(input.patch || {}).filter((field) =>
    protectedFields.has(field)
  );
  if (attemptedStageFields.length) {
    throw new Error(
      `outbound_lead_evidence_patch_refused_stage_fields:${attemptedStageFields.join(",")}`,
    );
  }
  return input.svc.entities.OutboundLead.update(input.leadId, input.patch);
}
