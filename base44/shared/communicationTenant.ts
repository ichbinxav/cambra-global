import { attemptFailClosedOperation } from "./criticalExecution.ts";

export const COMMUNICATION_TENANT_RESOLVER_VERSION =
  "communication-tenant-v1.0.0";

export type CommunicationThreadTenantBinding = {
  tenant_scope: "platform" | "tenant";
  brand_id: string;
  tenant_resolution_status: "RESOLVED";
  tenant_resolution_reason: string;
  tenant_resolver_version: string;
};

export type CommunicationThreadTenantAuthority =
  | {
    ok: true;
    blocker: null;
    blockers: string[];
    thread: any;
    binding: CommunicationThreadTenantBinding;
  }
  | {
    ok: false;
    blocker: string;
    blockers: string[];
    thread: any | null;
    binding: CommunicationThreadTenantBinding | null;
  };

/** Resolve the only tenant allowed to own a commercial thread. Fail closed on ambiguity. */
export async function resolveCommunicationThreadBrandId(svc: any, thread: any) {
  if (!thread?.id) throw new Error("communication_thread_required");
  const candidates = new Set<string>();
  if (thread.related_entity_type === "Brand" && thread.related_entity_id) {
    const brand = await svc.entities.Brand.get(
      String(thread.related_entity_id),
    );
    if (!brand?.id) throw new Error("communication_thread_brand_unresolved");
    candidates.add(String(brand.id));
  }
  if (
    thread.related_entity_type === "NegotiationCase" &&
    thread.related_entity_id
  ) {
    const c = await svc.entities.NegotiationCase.get(
      String(thread.related_entity_id),
    );
    if (!c?.brand_id) throw new Error("negotiation_thread_brand_unresolved");
    if (
      String(thread.engine) === "aggregate_procurement" &&
      String(c.negotiation_scope || "") !== "aggregate"
    ) {
      throw new Error("aggregate_thread_scope_mismatch");
    }
    candidates.add(String(c.brand_id));
  }
  if (thread.recover_id) {
    const activation = await svc.entities.DealActivation.get(
      String(thread.recover_id),
    );
    if (!activation?.brand_id) {
      throw new Error("recover_thread_brand_unresolved");
    }
    candidates.add(String(activation.brand_id));
  }
  if (
    thread.related_entity_type === "OutboundLead" &&
    thread.engine === "merchant_acquisition"
  ) {
    const lead = await svc.entities.OutboundLead.get(
      String(thread.related_entity_id || thread.lead_id || ""),
    );
    if (!lead?.id) throw new Error("merchant_outbound_lead_unresolved");
    candidates.add("_platform");
  }
  if (
    thread.related_entity_type === "PartnerProspect" &&
    thread.engine === "partner_acquisition"
  ) {
    const partner = await svc.entities.PartnerProspect.get(
      String(thread.related_entity_id || ""),
    );
    if (!partner?.id) throw new Error("partner_prospect_unresolved");
    candidates.add("_platform");
  }
  if (
    thread.related_entity_type === "MerchantInformationRequest" &&
    thread.related_entity_id
  ) {
    const request = await svc.entities.MerchantInformationRequest.get(
      String(thread.related_entity_id),
    );
    if (!request?.brand_id) {
      throw new Error("merchant_information_thread_brand_unresolved");
    }
    candidates.add(String(request.brand_id));
  }
  if (thread.related_entity_type === "Invoice" && thread.related_entity_id) {
    const invoice = await svc.entities.Invoice.get(
      String(thread.related_entity_id),
    );
    if (!invoice?.brand_id) throw new Error("invoice_thread_brand_unresolved");
    candidates.add(String(invoice.brand_id));
  }
  if (String(thread.engine) === "aggregate_procurement") {
    // Aggregate procurement is a platform-owned capability even though its
    // NegotiationCase carries `_platform` for schema compatibility.
    if ([...candidates].some((candidate) => candidate !== "_platform")) {
      throw new Error("aggregate_thread_tenant_must_be_platform");
    }
    candidates.add("_platform");
  }
  if (candidates.size === 0) {
    throw new Error("communication_thread_brand_unresolved");
  }
  if (candidates.size !== 1) {
    throw new Error("communication_thread_tenant_ambiguous");
  }
  return [...candidates][0];
}

export function communicationThreadTenantBinding(
  thread: any,
  resolvedBrandId: unknown,
): CommunicationThreadTenantBinding {
  const brandId = String(resolvedBrandId || "").trim();
  if (!thread?.id || !brandId) {
    throw new Error("communication_thread_tenant_binding_required");
  }
  const platform = brandId === "_platform";
  return {
    tenant_scope: platform ? "platform" : "tenant",
    brand_id: brandId,
    tenant_resolution_status: "RESOLVED",
    tenant_resolution_reason: platform
      ? "platform_acquisition_or_aggregate_scope"
      : "exact_brand_relationship_resolved",
    tenant_resolver_version: COMMUNICATION_TENANT_RESOLVER_VERSION,
  };
}

export function verifyCommunicationThreadTenantBinding(
  thread: any,
  expected: any,
) {
  const blockers: string[] = [];
  if (!thread?.id) blockers.push("communication_thread_unavailable");
  if (thread?.tenant_resolution_status !== "RESOLVED") {
    blockers.push("communication_thread_tenant_unresolved");
  }
  if (String(thread?.tenant_scope || "") !== expected?.tenant_scope) {
    blockers.push("communication_thread_tenant_scope_mismatch");
  }
  if (String(thread?.brand_id || "") !== expected?.brand_id) {
    blockers.push("communication_thread_brand_mismatch");
  }
  if (
    String(thread?.tenant_resolver_version || "") !==
      COMMUNICATION_TENANT_RESOLVER_VERSION
  ) blockers.push("communication_thread_tenant_resolver_stale");
  if (
    expected?.tenant_scope === "platform" && expected?.brand_id !== "_platform"
  ) blockers.push("platform_tenant_requires_platform_brand");
  if (
    expected?.tenant_scope === "tenant" &&
    (!expected?.brand_id || expected?.brand_id === "_platform")
  ) blockers.push("tenant_scope_requires_exact_brand");
  return { ok: blockers.length === 0, blockers: [...new Set(blockers)] };
}

/**
 * Backfills a legacy row, then reads back the exact binding. Resolution and
 * persistence errors are surfaced; no inferred value can authorize a send.
 */
export async function ensureCommunicationThreadTenantBinding(
  svc: any,
  thread: any,
): Promise<CommunicationThreadTenantAuthority> {
  let brandId: string;
  try {
    brandId = await resolveCommunicationThreadBrandId(svc, thread);
  } catch (error: any) {
    await attemptFailClosedOperation("communication_tenant_review_pause", () => svc.entities.CommunicationThread.update(thread.id, {
      automation_paused: true,
      pause_reason: "communication_thread_tenant_review_required",
      tenant_resolution_status: "REVIEW_REQUIRED",
      tenant_resolution_reason: String(
        error?.message || "communication_thread_brand_unresolved",
      ).slice(0, 200),
      tenant_resolver_version: COMMUNICATION_TENANT_RESOLVER_VERSION,
      tenant_resolved_at: new Date().toISOString(),
    }));
    return {
      ok: false,
      blocker: String(
        error?.message || "communication_thread_brand_unresolved",
      ),
      thread: null,
      binding: null,
      blockers: [String(
        error?.message || "communication_thread_brand_unresolved",
      )],
    };
  }
  const binding = communicationThreadTenantBinding(thread, brandId);
  const current = verifyCommunicationThreadTenantBinding(thread, binding);
  if (!current.ok) {
    const existingScope = String(thread?.tenant_scope || "").trim();
    const existingBrand = String(thread?.brand_id || "").trim();
    const conflictingDurableBinding =
      (existingScope && existingScope !== binding.tenant_scope) ||
      (existingBrand && existingBrand !== binding.brand_id);
    if (conflictingDurableBinding) {
      const blocker = "communication_thread_tenant_binding_conflict";
      await attemptFailClosedOperation("communication_tenant_conflict_pause", () => svc.entities.CommunicationThread.update(thread.id, {
        automation_paused: true,
        pause_reason: blocker,
        tenant_resolution_status: "REVIEW_REQUIRED",
        tenant_resolution_reason: blocker,
        tenant_resolver_version: COMMUNICATION_TENANT_RESOLVER_VERSION,
        tenant_resolved_at: new Date().toISOString(),
      }));
      return {
        ok: false,
        blocker,
        blockers: [blocker],
        thread: null,
        binding,
      };
    }
    try {
      await svc.entities.CommunicationThread.update(thread.id, {
        ...binding,
        tenant_resolved_at: new Date().toISOString(),
      });
    } catch (_) {
      return {
        ok: false,
        blocker: "communication_thread_tenant_persistence_failed",
        blockers: ["communication_thread_tenant_persistence_failed"],
        thread: null,
        binding,
      };
    }
  }
  let persisted: any;
  try {
    persisted = await svc.entities.CommunicationThread.get(thread.id);
  } catch (_) {
    return {
      ok: false,
      blocker: "communication_thread_tenant_readback_unavailable",
      blockers: ["communication_thread_tenant_readback_unavailable"],
      thread: null,
      binding,
    };
  }
  const verified = verifyCommunicationThreadTenantBinding(persisted, binding);
  return verified.ok
    ? { ok: true, blocker: null, blockers: [], thread: persisted, binding }
    : {
      ok: false,
      blocker: verified.blockers[0],
      blockers: verified.blockers,
      thread: persisted,
      binding,
    };
}
