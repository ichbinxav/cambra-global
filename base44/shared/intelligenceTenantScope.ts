/**
 * Intelligence tenant boundary.
 *
 * This module is deliberately small and deterministic so every Intelligence
 * writer can enforce the same storage key, dedupe key and lineage boundary.
 * It does not infer a tenant from related records: callers must provide an
 * explicit scope and tenant-scoped records must provide a brand_id.
 */
export const INTELLIGENCE_TENANT_SCOPE_VERSION = 'intelligence-tenant-scope-v1.0.0';

export type IntelligenceTenantScope = 'tenant' | 'global';
export type ScopedIntelligenceKind = 'evidence' | 'observation' | 'claim' | 'outcome';

type GlobalScopePolicy = Readonly<{
  domain: string;
  purpose: string;
  retention_policy_key: string;
  legal_bases: readonly string[];
  record_kinds: readonly ScopedIntelligenceKind[];
}>;

/**
 * Global storage is exceptional, not a default for rows with no brand_id.
 * Each allowed pair is public/platform knowledge with an explicit purpose.
 * Raw outcomes are intentionally absent: cross-tenant outcomes belong in the
 * existing privacy-safe aggregate store, never in a global raw outcome row.
 */
export const GLOBAL_INTELLIGENCE_SCOPE_ALLOWLIST: readonly GlobalScopePolicy[] = Object.freeze([
  Object.freeze({
    domain: 'research_knowledge',
    purpose: 'external_research_ingestion',
    retention_policy_key: 'intelligence_public_research',
    legal_bases: Object.freeze(['public_information']),
    record_kinds: Object.freeze(['evidence', 'observation', 'claim'] as ScopedIntelligenceKind[]),
  }),
  Object.freeze({
    domain: 'rate_intelligence',
    purpose: 'official_provider_pricing_research',
    retention_policy_key: 'intelligence_public_research',
    legal_bases: Object.freeze(['public_information']),
    record_kinds: Object.freeze(['evidence', 'observation', 'claim'] as ScopedIntelligenceKind[]),
  }),
  Object.freeze({
    domain: 'market_intelligence',
    purpose: 'official_market_research',
    retention_policy_key: 'intelligence_public_research',
    legal_bases: Object.freeze(['public_information']),
    record_kinds: Object.freeze(['evidence', 'observation', 'claim'] as ScopedIntelligenceKind[]),
  }),
  Object.freeze({
    domain: 'market_intelligence',
    purpose: 'public_provider_research',
    retention_policy_key: 'intelligence_public_research',
    legal_bases: Object.freeze(['public_information']),
    record_kinds: Object.freeze(['evidence', 'observation', 'claim'] as ScopedIntelligenceKind[]),
  }),
  Object.freeze({
    domain: 'market_intelligence',
    purpose: 'public_provider_market_monitoring',
    retention_policy_key: 'intelligence_public_research',
    legal_bases: Object.freeze(['public_information']),
    record_kinds: Object.freeze(['evidence', 'observation', 'claim'] as ScopedIntelligenceKind[]),
  }),
  Object.freeze({
    domain: 'regulatory_intelligence',
    purpose: 'official_regulatory_research',
    retention_policy_key: 'intelligence_public_research',
    legal_bases: Object.freeze(['public_information', 'legal_obligation']),
    record_kinds: Object.freeze(['evidence', 'observation', 'claim'] as ScopedIntelligenceKind[]),
  }),
]);

const clean = (value: unknown) => String(value ?? '').trim();
const lower = (value: unknown) => clean(value).toLowerCase();

export function canonicalIntelligenceTenantScope(value: unknown): IntelligenceTenantScope | null {
  const scope = lower(value);
  return scope === 'tenant' || scope === 'global' ? scope : null;
}

export function resolveGlobalIntelligencePolicy(input: any, kind: ScopedIntelligenceKind) {
  const domain = lower(input?.domain);
  const purpose = lower(input?.purpose);
  return GLOBAL_INTELLIGENCE_SCOPE_ALLOWLIST.find(
    (policy) => policy.domain === domain && policy.purpose === purpose && policy.record_kinds.includes(kind),
  ) ?? null;
}

export type IntelligenceScopeValidation =
  | {
      ok: true;
      tenant_scope: IntelligenceTenantScope;
      brand_id: string | null;
      domain: string;
      purpose: string;
      scope_key: string;
      policy: GlobalScopePolicy | null;
    }
  | { ok: false; error: string };

export function validateIntelligenceTenantScope(
  input: any,
  kind: ScopedIntelligenceKind,
  options: { require_evidence_governance?: boolean } = {},
): IntelligenceScopeValidation {
  const scope = canonicalIntelligenceTenantScope(input?.tenant_scope);
  if (!scope) return { ok: false, error: 'tenant_scope_required' };

  const brandId = clean(input?.brand_id);
  const domain = lower(input?.domain);
  const purpose = lower(input?.purpose);

  if (scope === 'tenant') {
    if (!brandId) return { ok: false, error: 'brand_id_required_for_tenant_scope' };
    if (brandId === '_platform') return { ok: false, error: 'platform_brand_not_valid_tenant' };
  } else {
    if (brandId) return { ok: false, error: 'brand_id_forbidden_for_global_scope' };
    const policy = resolveGlobalIntelligencePolicy({ domain, purpose }, kind);
    if (!policy) return { ok: false, error: 'global_scope_domain_purpose_not_allowed' };
    if (kind === 'evidence') {
      if (lower(input?.retention_policy_key) !== policy.retention_policy_key) {
        return { ok: false, error: 'global_scope_retention_policy_not_allowed' };
      }
      if (!policy.legal_bases.includes(lower(input?.legal_basis))) {
        return { ok: false, error: 'global_scope_legal_basis_not_allowed' };
      }
    }
    return {
      ok: true,
      tenant_scope: scope,
      brand_id: null,
      domain,
      purpose,
      scope_key: `global:${domain}:${purpose}`,
      policy,
    };
  }

  if (options.require_evidence_governance || kind === 'evidence') {
    if (!purpose) return { ok: false, error: 'purpose_required' };
    if (!clean(input?.retention_policy_key)) return { ok: false, error: 'retention_policy_key_required' };
    if (!clean(input?.legal_basis)) return { ok: false, error: 'legal_basis_required' };
  }

  return {
    ok: true,
    tenant_scope: scope,
    brand_id: brandId,
    domain,
    purpose,
    scope_key: `tenant:${brandId}`,
    policy: null,
  };
}

export function validateStoredIntelligenceRecord(input: any, kind: ScopedIntelligenceKind): IntelligenceScopeValidation {
  return validateIntelligenceTenantScope(input, kind, { require_evidence_governance: kind === 'evidence' });
}

export function intelligenceScopeFilter(input: any, kind: ScopedIntelligenceKind) {
  const binding = validateIntelligenceTenantScope(input, kind, { require_evidence_governance: kind === 'evidence' });
  if (!binding.ok) return binding;
  return {
    ok: true as const,
    filter: binding.tenant_scope === 'tenant'
      ? { tenant_scope: 'tenant', brand_id: binding.brand_id }
      : { tenant_scope: 'global', domain: binding.domain, purpose: binding.purpose },
    binding,
  };
}

export function sameIntelligenceTenantBinding(left: any, right: any, kind: ScopedIntelligenceKind) {
  const a = validateIntelligenceTenantScope(left, kind, { require_evidence_governance: kind === 'evidence' });
  const b = validateIntelligenceTenantScope(right, kind, { require_evidence_governance: kind === 'evidence' });
  return a.ok && b.ok && a.scope_key === b.scope_key;
}

export function scopedIntelligenceKey(rawKey: unknown, input: any, kind: ScopedIntelligenceKind) {
  const binding = validateIntelligenceTenantScope(input, kind, { require_evidence_governance: kind === 'evidence' });
  if (!binding.ok) return binding;
  const raw = clean(rawKey);
  if (!raw) return { ok: false as const, error: 'record_key_required' };
  const prefix = `scope:${binding.scope_key}:`;
  return { ok: true as const, key: raw.startsWith(prefix) ? raw : `${prefix}${raw}`, binding };
}

export function intelligenceScopeHashMaterial(input: any, kind: ScopedIntelligenceKind) {
  const binding = validateIntelligenceTenantScope(input, kind, { require_evidence_governance: kind === 'evidence' });
  if (!binding.ok) return binding;
  return {
    ok: true as const,
    material: {
      tenant_scope: binding.tenant_scope,
      brand_id: binding.brand_id,
      domain: binding.domain,
      purpose: binding.purpose,
      scope_key: binding.scope_key,
    },
    binding,
  };
}

export function quarantineReasonForLegacyIntelligence(input: any, kind: ScopedIntelligenceKind) {
  const validation = validateStoredIntelligenceRecord(input, kind);
  if (validation.ok) return null;
  return `LEGACY_SCOPE_AMBIGUOUS:${'error' in validation ? validation.error : 'tenant_scope_invalid'}`;
}
