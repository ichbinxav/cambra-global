// CAMP-C3 (2026-08-16) — audience construction and reconciliation
// (PROMPT_FIX_DISCOVERY_V2 Parte 4, chunk C3, spec §7.3.3-4).
//
// Pure and deterministic: the caller reads the rows, this module decides who
// is eligible and WHY everyone else is not. The reconciliation table is
// durable evidence stored on CampaignAudienceVersion, not a UI recalculation.
//
// Exclusion order is fixed and matches the spec's reconciliation table, so the
// funnel always subtracts in the same sequence and the numbers reconcile
// exactly: selected → person dedupe → company dedupe → recently contacted →
// suppressed → invalid email → protected market → already merchant →
// policy blocked → final eligible.
import { commercialMarketDecision } from './marketLaunchScope.ts';
import { suppressionMatches } from './campaignsCore.ts';

export const CAMPAIGN_AUDIENCE_BUILDER_VERSION = 'campaign-audience-builder-1.0.0';

/** Ordered exclusion reasons — the reconciliation table renders in this order. */
export const AUDIENCE_EXCLUSION_REASONS = Object.freeze([
  'DUPLICATE_PERSON',
  'DUPLICATE_COMPANY',
  'RECENTLY_CONTACTED',
  'SUPPRESSED',
  'INVALID_EMAIL',
  'PROTECTED_MARKET',
  'ALREADY_MERCHANT',
  'POLICY_BLOCKED',
  'COMPANY_CONTACT_LIMIT',
] as const);

const text = (value: unknown) => String(value ?? '').trim();

/**
 * Conservative RFC-shaped check. This is a gate, not a parser: anything it is
 * not sure about is INVALID_EMAIL, because sending to a malformed address
 * burns sender reputation.
 */
export function normalizeEmail(value: unknown): string | null {
  const raw = text(value).toLowerCase();
  if (!raw || raw.length > 254) return null;
  const at = raw.indexOf('@');
  if (at <= 0 || at !== raw.lastIndexOf('@')) return null;
  const local = raw.slice(0, at);
  const domain = raw.slice(at + 1);
  if (!local || !domain) return null;
  if (domain.indexOf('.') <= 0 || domain.endsWith('.')) return null;
  if (/\s/.test(raw)) return null;
  if (/\.\./.test(raw)) return null;
  return raw;
}

export function emailDomain(email: string | null): string | null {
  if (!email) return null;
  const domain = email.slice(email.indexOf('@') + 1);
  return domain || null;
}

/** Company identity for company-level dedupe: canonical key, else domain. */
function companyKeyOf(candidate: any, email: string | null): string | null {
  return text(candidate?.company_key || candidate?.canonical_company_key).toLowerCase() ||
    emailDomain(email);
}

export type AudienceCandidate = {
  subject_type?: string;
  subject_id?: string;
  contact_id?: string;
  email?: string;
  company_key?: string;
  canonical_company_key?: string;
  company_name?: string;
  company_domain?: string;
  country?: string;
  city?: string;
  language?: string;
  contact_priority?: number;
  is_merchant?: boolean;
  policy_blocked?: boolean;
  policy_block_reason?: string;
  last_contacted_at?: string;
  [key: string]: unknown;
};

export type AudienceBuildContext = {
  suppressions?: any[];
  /** Cooldown in days; a candidate contacted inside the window is excluded. */
  contact_cooldown_days?: number;
  /** Reference time for the cooldown window — passed in, never Date.now() here. */
  now?: string;
  /** Max contacts kept per company (spec §7.3.5). 0/absent = no limit. */
  max_contacts_per_company?: number;
  /** Lane decides whether "already a merchant" is an exclusion. */
  exclude_existing_merchants?: boolean;
};

export type AudienceReconciliation = {
  selected_count: number;
  deduplicated_person_count: number;
  deduplicated_company_count: number;
  recently_contacted_excluded_count: number;
  suppressed_count: number;
  invalid_email_count: number;
  protected_market_count: number;
  existing_merchant_excluded_count: number;
  policy_blocked_count: number;
  final_eligible_count: number;
};

/**
 * Runs the full exclusion ladder over the candidate list.
 *
 * Every excluded candidate keeps an explicit reason so the founder can inspect
 * any row of the reconciliation table. A candidate is counted in exactly one
 * exclusion bucket (the first that fires), so the buckets sum to
 * selected - final_eligible with no double counting.
 */
export function buildAudienceReconciliation(
  candidates: AudienceCandidate[],
  context: AudienceBuildContext = {},
) {
  const rows = Array.isArray(candidates) ? candidates : [];
  const suppressions = Array.isArray(context.suppressions) ? context.suppressions : [];
  const cooldownDays = Number(context.contact_cooldown_days || 0);
  const nowMs = context.now ? Date.parse(context.now) : NaN;
  const cooldownMs = Number.isFinite(cooldownDays) && cooldownDays > 0
    ? cooldownDays * 86_400_000
    : 0;
  const maxPerCompany = Math.max(0, Number(context.max_contacts_per_company || 0));

  const eligible: any[] = [];
  const excluded: any[] = [];
  const seenPersons = new Set<string>();
  const seenCompanies = new Map<string, number>();
  const counts: Record<string, number> = {};
  const bump = (reason: string) => { counts[reason] = (counts[reason] || 0) + 1; };

  for (const candidate of rows) {
    const email = normalizeEmail(candidate?.email);
    const personKey = text(candidate?.contact_id).toLowerCase() || email || '';
    const companyKey = companyKeyOf(candidate, email);
    const exclude = (reason: string, detail?: string) => {
      bump(reason);
      excluded.push({
        subject_id: candidate?.subject_id ?? null,
        contact_id: candidate?.contact_id ?? null,
        email_normalized: email,
        company_key: companyKey,
        reason,
        ...(detail ? { detail } : {}),
      });
    };

    // 1-2. Dedupe. Person first, then company, so a second contact at an
    // already-seen company is reported as a COMPANY duplicate rather than
    // hiding inside the person bucket. These are distinct and both visible.
    if (personKey && seenPersons.has(personKey)) { exclude('DUPLICATE_PERSON'); continue; }
    if (companyKey && !maxPerCompany && seenCompanies.has(companyKey)) { exclude('DUPLICATE_COMPANY'); continue; }

    // 3. Contact cooldown. An unparseable timestamp is NOT treated as "never
    // contacted" — it is a review-worthy exclusion, because assuming freshness
    // is what produces double outreach.
    if (cooldownMs > 0 && candidate?.last_contacted_at !== undefined && candidate?.last_contacted_at !== null && text(candidate.last_contacted_at) !== '') {
      const last = Date.parse(text(candidate.last_contacted_at));
      if (!Number.isFinite(last) || !Number.isFinite(nowMs)) {
        exclude('RECENTLY_CONTACTED', 'unreadable_last_contacted_at');
        continue;
      }
      if (nowMs - last < cooldownMs) { exclude('RECENTLY_CONTACTED'); continue; }
    }

    // 4. Suppression across every scope (email/person/company/domain/campaign).
    const suppression = suppressionMatches(suppressions, {
      email: email || undefined,
      contact_id: candidate?.contact_id,
      company_key: companyKey || undefined,
      domain: emailDomain(email) || undefined,
    });
    if (suppression.suppressed) {
      exclude('SUPPRESSED', text(suppression.matches[0]?.reason) || undefined);
      continue;
    }

    // 5. Deliverable address.
    if (!email) { exclude('INVALID_EMAIL'); continue; }

    // 6. Market authority. An unknown market is UNKNOWN_BLOCKED in the scope
    // primitive, so it lands here too — fail closed, never "probably fine".
    const market = commercialMarketDecision(candidate?.country);
    if (!market.ok) {
      exclude('PROTECTED_MARKET', market.scope.scope_status);
      continue;
    }

    // 7. Already a customer (lane-dependent).
    if (context.exclude_existing_merchants === true && candidate?.is_merchant === true) {
      exclude('ALREADY_MERCHANT');
      continue;
    }

    // 8. Explicit policy block carried on the candidate.
    if (candidate?.policy_blocked === true) {
      exclude('POLICY_BLOCKED', text(candidate?.policy_block_reason) || undefined);
      continue;
    }

    // 9. Company contact cap (only when a positive limit is configured).
    if (maxPerCompany > 0 && companyKey) {
      const used = seenCompanies.get(companyKey) || 0;
      if (used >= maxPerCompany) { exclude('COMPANY_CONTACT_LIMIT'); continue; }
      seenCompanies.set(companyKey, used + 1);
    } else if (companyKey) {
      seenCompanies.set(companyKey, 1);
    }
    if (personKey) seenPersons.add(personKey);
    eligible.push({
      ...candidate,
      email_normalized: email,
      company_key: companyKey,
      company_contact_rank: companyKey ? (seenCompanies.get(companyKey) || 1) : 1,
    });
  }

  const reconciliation: AudienceReconciliation = {
    selected_count: rows.length,
    deduplicated_person_count: counts.DUPLICATE_PERSON || 0,
    deduplicated_company_count: (counts.DUPLICATE_COMPANY || 0) + (counts.COMPANY_CONTACT_LIMIT || 0),
    recently_contacted_excluded_count: counts.RECENTLY_CONTACTED || 0,
    suppressed_count: counts.SUPPRESSED || 0,
    invalid_email_count: counts.INVALID_EMAIL || 0,
    protected_market_count: counts.PROTECTED_MARKET || 0,
    existing_merchant_excluded_count: counts.ALREADY_MERCHANT || 0,
    policy_blocked_count: counts.POLICY_BLOCKED || 0,
    final_eligible_count: eligible.length,
  };
  return {
    eligible,
    excluded,
    reconciliation,
    // Self-check: the ladder must account for every candidate exactly once.
    reconciles:
      reconciliation.selected_count ===
        reconciliation.final_eligible_count +
          reconciliation.deduplicated_person_count +
          reconciliation.deduplicated_company_count +
          reconciliation.recently_contacted_excluded_count +
          reconciliation.suppressed_count +
          reconciliation.invalid_email_count +
          reconciliation.protected_market_count +
          reconciliation.existing_merchant_excluded_count +
          reconciliation.policy_blocked_count,
    builder_version: CAMPAIGN_AUDIENCE_BUILDER_VERSION,
  };
}

/**
 * Stable, reproducible membership hash. Sorted so the same membership always
 * hashes the same regardless of source ordering; the approval binds to it.
 */
export async function audienceContentHash(
  sha256: (value: unknown) => Promise<string>,
  input: { campaign_id: string; filters?: unknown; eligible: any[] },
) {
  const members = input.eligible
    .map((row) => `${text(row.email_normalized)}|${text(row.company_key)}`)
    .sort((left, right) => left.localeCompare(right, 'en'));
  return sha256({
    campaign_id: input.campaign_id,
    filters: input.filters ?? null,
    members,
    builder_version: CAMPAIGN_AUDIENCE_BUILDER_VERSION,
  });
}
