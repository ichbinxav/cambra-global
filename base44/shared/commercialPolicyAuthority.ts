import { policyIsActive } from "./commercialAutonomy.ts";
import { sha256 } from "./intelligenceCore.ts";

export const MERCHANT_ACQUISITION_POLICY_BINDING_VERSION =
  "merchant-acquisition-policy-binding.v1";

const SYSTEM_FIELDS = new Set([
  "id",
  "created_date",
  "updated_date",
  "created_by",
  "updated_by",
]);

function authorityMaterial(value: any): any {
  if (Array.isArray(value)) return value.map(authorityMaterial);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !SYSTEM_FIELDS.has(key) && !key.startsWith("_"))
      .map(([key, nested]) => [key, authorityMaterial(nested)]),
  );
}

export async function buildMerchantAcquisitionPolicyBinding(policy: any) {
  const material = authorityMaterial(policy || {});
  return {
    binding_version: MERCHANT_ACQUISITION_POLICY_BINDING_VERSION,
    authority_status: "EXACT_ACTIVE",
    engine: String(policy?.engine || ""),
    policy_key: String(policy?.policy_key || ""),
    policy_version: String(policy?.version || ""),
    policy_content_hash: `sha256:${await sha256(material)}`,
    content_scope:
      "FULL_POLICY_CONTENT_EXCLUDING_BASE44_SYSTEM_ID_AND_AUDIT_METADATA",
  };
}

export function merchantPolicyBindingMatches(
  expected: any,
  observed: any,
) {
  const blockers: string[] = [];
  if (expected?.authority_status !== "EXACT_ACTIVE") {
    blockers.push("adaptive_exact_active_policy_binding_required");
  }
  if (observed?.authority_status !== "EXACT_ACTIVE") {
    blockers.push("current_exact_active_policy_binding_required");
  }
  for (const [field, blocker] of [
    ["engine", "commercial_policy_engine_mismatch"],
    ["policy_key", "commercial_policy_key_mismatch"],
    ["policy_version", "commercial_policy_version_mismatch"],
    ["policy_content_hash", "commercial_policy_content_hash_mismatch"],
  ] as const) {
    const left = String(expected?.[field] || "");
    const right = String(observed?.[field] || "");
    if (!left || !right || left !== right) blockers.push(blocker);
  }
  if (
    String(expected?.engine || "") !== "merchant_acquisition" ||
    String(observed?.engine || "") !== "merchant_acquisition"
  ) blockers.push("merchant_acquisition_policy_binding_required");
  return {
    allowed: blockers.length === 0,
    blockers: [...new Set(blockers)],
  };
}

/**
 * Reads the complete active-policy candidate set. A full 5,000-row page is
 * conservatively treated as truncated. No latest-row/default policy may gain
 * contact or spend authority.
 */
export async function readExactActiveMerchantAcquisitionPolicy(
  service: any,
  at = Date.now(),
) {
  let rows: unknown;
  try {
    rows = await service.entities.CommercialPolicy.filter(
      { engine: "merchant_acquisition", status: "active" },
      "-updated_date",
      5000,
      0,
    );
  } catch (error: any) {
    return {
      allowed: false,
      status: "UNAVAILABLE",
      policy: null,
      binding: null,
      active_count: null,
      rows: [],
      blockers: ["commercial_policy_lookup_unavailable"],
      error: String(error?.code || error?.message || "policy_read_failed")
        .slice(0, 160),
    };
  }
  if (!Array.isArray(rows)) {
    return {
      allowed: false,
      status: "UNAVAILABLE",
      policy: null,
      binding: null,
      active_count: null,
      rows: [],
      blockers: ["commercial_policy_lookup_unavailable"],
    };
  }
  if (rows.length >= 5000) {
    return {
      allowed: false,
      status: "TRUNCATED",
      policy: null,
      binding: null,
      active_count: null,
      rows,
      blockers: ["commercial_policy_authority_scope_truncated"],
    };
  }
  const active = rows.filter((policy: any) => policyIsActive(policy, at));
  if (active.length !== 1) {
    return {
      allowed: false,
      status: active.length > 1 ? "AMBIGUOUS" : "MISSING",
      policy: null,
      binding: null,
      active_count: active.length,
      rows,
      blockers: [
        active.length > 1
          ? "ambiguous_active_commercial_policies"
          : "exactly_one_active_commercial_policy_required",
      ],
    };
  }
  const policy = active[0];
  const binding = await buildMerchantAcquisitionPolicyBinding(policy);
  return {
    allowed: true,
    status: "EXACT_ACTIVE",
    policy,
    binding,
    active_count: 1,
    rows,
    blockers: [],
  };
}
