import {
  evaluateMarketLaunchScope,
  MARKET_SCOPE_VERSION,
} from "./marketLaunchScope.ts";
import {
  assertEmergencyEpochUnchanged,
  type EmergencyCapability,
  type EmergencyEpochClaim,
} from "./operationalControl.ts";

/**
 * Vocabulary only. Durable authority remains with the existing domain policy,
 * approval, tenant, EmergencyControl and claim primitives. This facade creates
 * no row, lease, receipt ledger or alternative control plane.
 */
export const EFFECT_AUTHORITY_VERSION = "effect-authority-facade.v1";

export const EFFECT_CLASSES = Object.freeze(
  [
    "SEND",
    "NEGOTIATE",
    "SCHEDULE_MATERIAL",
    "EXECUTE",
    "APPROVE",
    "SIGN_MANDATE",
    "SPEND",
    "BILL_CHARGE",
    "MIGRATE_GO_LIVE",
    "PROMOTE_LEARNING",
  ] as const,
);

export type EffectClass = typeof EFFECT_CLASSES[number];

export const EFFECT_CLASS_LITERAL_LABELS: Readonly<
  Record<EffectClass, string>
> = Object.freeze({
  SEND: "SEND",
  NEGOTIATE: "NEGOTIATE",
  SCHEDULE_MATERIAL: "SCHEDULE_MATERIAL",
  EXECUTE: "EXECUTE",
  APPROVE: "APPROVE",
  SIGN_MANDATE: "SIGN/MANDATE",
  SPEND: "SPEND",
  BILL_CHARGE: "BILL/CHARGE",
  MIGRATE_GO_LIVE: "MIGRATE/GO_LIVE",
  PROMOTE_LEARNING: "PROMOTE_LEARNING",
});

const EFFECT_CLASS_SET = new Set<string>(EFFECT_CLASSES);
const MARKET_SCOPE_REQUIREMENTS = new Set([
  "REQUIRED",
  "NOT_APPLICABLE_PLATFORM",
]);
const EMERGENCY_CAPABILITIES = new Set<EmergencyCapability>([
  "communications",
  "negotiations",
  "migrations",
  "billing_issuance",
  "paid_discovery",
]);
const clean = (value: unknown) => String(value ?? "").trim();
const uniqSorted = (values: EffectClass[]) => [...new Set(values)].sort();

export class EffectAuthorityError extends Error {
  code: "EFFECT_AUTHORITY_DENIED" | "EFFECT_AUTHORITY_UNAVAILABLE";
  blocker: string;
  status: number;
  effects = false;

  constructor(blocker: string, status = 409) {
    super(
      status >= 500
        ? "effect_authority_unavailable"
        : "effect_authority_denied",
    );
    this.name = "EffectAuthorityError";
    this.code = status >= 500
      ? "EFFECT_AUTHORITY_UNAVAILABLE"
      : "EFFECT_AUTHORITY_DENIED";
    this.blocker = blocker;
    this.status = status;
  }
}

export type EffectAuthorityVerdict = {
  status: "AUTHORIZED" | "DENIED" | "UNKNOWN";
  authority_available: boolean;
  effect_classes: EffectClass[];
  actor_id: string;
  tenant_key: string;
  subject_type: string;
  subject_id: string;
  policy_key: string;
  policy_version: string;
  policy_state: "ACTIVE" | "STALE" | "DENIED" | "UNKNOWN";
  authority_ref: string;
  authority_hash?: string | null;
  observed_at: string;
  valid_until?: string | null;
  market_iso2?: string | null;
  market_scope_version?: string | null;
};

export type EffectAuthorityInput = {
  effect_classes: EffectClass[];
  actor: { id: unknown; type: unknown };
  tenant: { key: unknown; scope?: "tenant" | "platform" };
  subject: { type: unknown; id: unknown };
  context: {
    jurisdiction?: unknown;
    market_scope_requirement: "REQUIRED" | "NOT_APPLICABLE_PLATFORM";
    market_scope_not_applicable_reason?: unknown;
    emergency_epoch_claim?: EmergencyEpochClaim | null;
    emergency_capabilities?: EmergencyCapability[];
    emergency_not_applicable?: boolean;
    emergency_not_applicable_reason?: unknown;
    expected_policy_key?: unknown;
    expected_policy_version?: unknown;
    max_authority_age_ms?: number;
    phase?: unknown;
  };
  revalidate: (
    svc: any,
    request: {
      effect_classes: EffectClass[];
      actor_id: string;
      actor_type: string;
      tenant_key: string;
      subject_type: string;
      subject_id: string;
      jurisdiction: string | null;
      market_scope_version: string | null;
      phase: string;
    },
  ) => Promise<EffectAuthorityVerdict>;
};

function block(blocker: string, status = 409): never {
  throw new EffectAuthorityError(blocker, status);
}

function parseTime(value: unknown) {
  const parsed = Date.parse(clean(value));
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeClasses(values: unknown): EffectClass[] {
  if (!Array.isArray(values) || values.length === 0) {
    block("effect_class_required");
  }
  const normalized = values.map((value) => clean(value).toUpperCase());
  if (
    normalized.some((value) => !EFFECT_CLASS_SET.has(value)) ||
    new Set(normalized).size !== normalized.length
  ) block("effect_class_invalid");
  return uniqSorted(normalized as EffectClass[]);
}

function normalizeEmergencyCapabilities(
  values: unknown,
  blocker: string,
): EmergencyCapability[] {
  if (!Array.isArray(values) || values.length === 0) block(blocker, 503);
  const normalized = values.map((value) => clean(value));
  if (
    normalized.some((value) =>
      !EMERGENCY_CAPABILITIES.has(value as EmergencyCapability)
    ) || new Set(normalized).size !== normalized.length
  ) block(blocker, 503);
  return [...normalized].sort() as EmergencyCapability[];
}

/**
 * Revalidates the existing authorities at the commit/provider boundary.
 * `revalidate` must read the domain authority again; an optimistic result
 * captured at request start is not accepted as a substitute.
 */
export async function requireEffectAuthorities(
  svc: any,
  input: EffectAuthorityInput,
) {
  const effectClasses = normalizeClasses(input?.effect_classes);
  const actorId = clean(input?.actor?.id);
  const actorType = clean(input?.actor?.type).toUpperCase();
  const tenantKey = clean(input?.tenant?.key);
  const subjectType = clean(input?.subject?.type);
  const subjectId = clean(input?.subject?.id);
  const phase = clean(input?.context?.phase) || "material_effect";
  if (!actorId || !actorType || actorType === "UNKNOWN") {
    block("effect_actor_unknown");
  }
  if (!tenantKey) block("effect_tenant_key_required");
  if (!subjectType || !subjectId) block("effect_subject_required");
  if (typeof input?.revalidate !== "function") {
    block("effect_authority_revalidator_required", 503);
  }

  const marketRequirement = clean(input?.context?.market_scope_requirement);
  if (!MARKET_SCOPE_REQUIREMENTS.has(marketRequirement)) {
    block("effect_market_scope_requirement_invalid");
  }
  let jurisdiction: string | null = null;
  let marketScopeVersion: string | null = null;
  if (marketRequirement === "REQUIRED") {
    const market = evaluateMarketLaunchScope(input?.context?.jurisdiction);
    if (!market.iso2 || !market.launch_active || market.research_only) {
      block("effect_market_not_launch_active");
    }
    jurisdiction = market.iso2;
    marketScopeVersion = MARKET_SCOPE_VERSION;
  } else {
    if (
      input?.tenant?.scope !== "platform" || tenantKey !== "_platform" ||
      !clean(input?.context?.market_scope_not_applicable_reason)
    ) block("effect_market_scope_exception_invalid");
  }

  const capabilities = Array.isArray(input?.context?.emergency_capabilities) &&
      input.context.emergency_capabilities.length > 0
    ? normalizeEmergencyCapabilities(
      input.context.emergency_capabilities,
      "effect_emergency_capabilities_invalid",
    )
    : [];
  if (capabilities.length > 0) {
    const claim = input?.context?.emergency_epoch_claim;
    if (!claim) {
      block("effect_emergency_epoch_required", 503);
    }
    const claimedCapabilities = normalizeEmergencyCapabilities(
      claim.capabilities,
      "effect_emergency_epoch_capabilities_invalid",
    );
    // A broader captured epoch is conservative: assertEmergencyEpochUnchanged
    // re-checks every claimed capability. Missing any capability required by
    // this effect is never permission (for example communications cannot stand
    // in for negotiations).
    if (
      capabilities.some((capability) =>
        !claimedCapabilities.includes(capability)
      )
    ) block("effect_emergency_capability_binding_mismatch", 503);
    try {
      await assertEmergencyEpochUnchanged(
        svc,
        claim,
        `effect_authority:${phase}`,
      );
    } catch (_) {
      block("effect_emergency_authority_changed");
    }
  } else if (
    input?.context?.emergency_not_applicable !== true ||
    !clean(input?.context?.emergency_not_applicable_reason)
  ) {
    block("effect_emergency_authority_required", 503);
  }

  let verdict: EffectAuthorityVerdict;
  try {
    verdict = await input.revalidate(svc, {
      effect_classes: effectClasses,
      actor_id: actorId,
      actor_type: actorType,
      tenant_key: tenantKey,
      subject_type: subjectType,
      subject_id: subjectId,
      jurisdiction,
      market_scope_version: marketScopeVersion,
      phase,
    });
  } catch (_) {
    block("effect_domain_authority_unavailable", 503);
  }
  if (!verdict || verdict.authority_available !== true) {
    block("effect_domain_authority_unavailable", 503);
  }
  if (verdict.status !== "AUTHORIZED") block("effect_domain_authority_denied");
  if (
    clean(verdict.actor_id) !== actorId ||
    clean(verdict.tenant_key) !== tenantKey ||
    clean(verdict.subject_type) !== subjectType ||
    clean(verdict.subject_id) !== subjectId
  ) block("effect_authority_binding_mismatch");
  if (
    JSON.stringify(normalizeClasses(verdict.effect_classes)) !==
      JSON.stringify(effectClasses)
  ) block("effect_authority_class_mismatch");
  if (
    !clean(verdict.policy_key) || !clean(verdict.policy_version) ||
    verdict.policy_state !== "ACTIVE" || !clean(verdict.authority_ref)
  ) block("effect_policy_authority_invalid");
  const expectedPolicyKey = clean(input?.context?.expected_policy_key);
  const expectedPolicyVersion = clean(input?.context?.expected_policy_version);
  if (
    (expectedPolicyKey && clean(verdict.policy_key) !== expectedPolicyKey) ||
    (expectedPolicyVersion &&
      clean(verdict.policy_version) !== expectedPolicyVersion)
  ) block("effect_policy_binding_changed");
  if (marketRequirement === "REQUIRED") {
    if (
      clean(verdict.market_iso2).toUpperCase() !== jurisdiction ||
      clean(verdict.market_scope_version) !== MARKET_SCOPE_VERSION
    ) block("effect_market_authority_changed");
  }

  const now = Date.now();
  const observedAt = parseTime(verdict.observed_at);
  const maxAge = Math.max(
    1,
    Math.min(60_000, Number(input?.context?.max_authority_age_ms || 15_000)),
  );
  if (
    observedAt === null || observedAt > now + 5_000 ||
    now - observedAt > maxAge
  ) block("effect_authority_stale");
  const validUntil = verdict.valid_until == null
    ? null
    : parseTime(verdict.valid_until);
  if (
    verdict.valid_until != null && (validUntil === null || validUntil <= now)
  ) {
    block("effect_policy_stale");
  }

  return Object.freeze({
    authorized: true,
    version: EFFECT_AUTHORITY_VERSION,
    effect_classes: effectClasses,
    actor_id: actorId,
    actor_type: actorType,
    tenant_key: tenantKey,
    subject_type: subjectType,
    subject_id: subjectId,
    jurisdiction,
    market_scope_version: marketScopeVersion,
    emergency_capabilities: capabilities,
    policy_key: clean(verdict.policy_key),
    policy_version: clean(verdict.policy_version),
    authority_ref: clean(verdict.authority_ref),
    authority_hash: clean(verdict.authority_hash) || null,
    observed_at: verdict.observed_at,
    checked_at: new Date(now).toISOString(),
    phase,
  });
}

export async function requireEffectAuthority(
  svc: any,
  input: Omit<EffectAuthorityInput, "effect_classes"> & {
    effect_class: EffectClass;
  },
) {
  return requireEffectAuthorities(svc, {
    ...input,
    effect_classes: [input.effect_class],
  });
}

export function effectAuthorityErrorResponse(error: unknown) {
  if (!(error instanceof EffectAuthorityError)) return null;
  return Response.json({
    ok: false,
    error: error.message,
    code: error.code,
    effects: false,
    review_required: error.status >= 500,
  }, { status: error.status });
}
