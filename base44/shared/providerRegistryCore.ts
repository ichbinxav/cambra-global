// DASHBOARD-C11 (2026-08-17) — governed Provider registry writes.
//
// Replaces the browser CRUD at AdminProviders.jsx:38 and :42, which the navigation
// registry flagged HIGHEST SEVERITY because line 36 sets `revenue_share_pct` — provider
// compensation — from a browser form.
//
// WHAT C11 VERIFIED, which sharpens that claim in both directions.
//
// It is NOT currently biasing anything. `Provider.revenue_share_pct` is read by no
// production code at all: the only other references are three rows in seedDemoData. The
// real provider compensation path is `ProviderRevenueLedger`, whose rate lives in
// `rate_bps` bound to an `agreement_id` and an `agreement_terms_hash`. So the field does
// not feed provider revenue today, and the "biases recommendations" framing overstates
// what is happening now.
//
// It is worse in a different way. It is an UNBOUND DUPLICATE of a governed number: a
// field literally labelled "Revenue Share %", editable by anyone with the admin page, with
// no agreement, no hash and no history behind it. The danger is not what reads it today
// but what reads it next — a shadow rate that diverges from the agreement-bound one, and
// whichever of the two a future aggregator happens to pick becomes provider economics.
// That is exactly what the section 4.11 firewall exists to prevent.
//
// A second, smaller defect on the same line: `parseFloat(form.revenue_share_pct) || 0`
// stores an EMPTY field, and any unparseable text, as a confident 0% revenue share.
//
// Decision: `revenue_share_pct` is not writable here at all. It is protected with the
// reason, and the protected list names the governed alternative so the next person does
// not read the refusal as an oversight.

import { nullableNumber } from './nullableNumber.ts';

export const PROVIDER_REGISTRY_VERSION = 'provider-registry-1.0.0';

const text = (value: unknown) => String(value ?? '').trim();

/** Fields the provider form may set. Commercial terms are deliberately absent. */
export const PROVIDER_EDITABLE_FIELDS = Object.freeze([
  'name', 'category', 'contact_email', 'account_manager', 'api_status', 'contract_type', 'notes',
] as const);

/**
 * Fields no provider form may write, each with the reason and where the value belongs.
 *
 * `revenue_share_pct` heads the list: it is the field the browser form was setting.
 */
export const PROVIDER_PROTECTED_FIELDS: ReadonlyArray<{ field: string; why: string; governed_by: string }> = Object.freeze([
  {
    field: 'revenue_share_pct',
    why: 'Provider compensation. No production code reads this field — the real rate is ProviderRevenueLedger.rate_bps, bound to an agreement_id and an agreement_terms_hash. A second, unbound number labelled "Revenue Share %" is a shadow rate: it can diverge from the agreement silently, and whichever of the two a future aggregator picks becomes provider economics.',
    governed_by: 'ProviderRevenueLedger.rate_bps + agreement_id + agreement_terms_hash',
  },
  {
    field: 'revenue_share_bps',
    why: 'same reason as revenue_share_pct, in the other unit',
    governed_by: 'ProviderRevenueLedger.rate_bps',
  },
  {
    field: 'is_demo',
    why: 'demo rows are created by the seeder and excluded from coverage counts; flipping this from a form would make a demo provider look real, or hide a real one',
    governed_by: 'seedDemoData',
  },
]);

/**
 * Categories the entity supports. An unrecognised category is refused, not stored.
 *
 * Copied from Provider.jsonc's own enum, which is the authority. I first wrote this list
 * from memory and it was wrong twice — it invented 'other' and dropped 'insurance' and
 * 'logistics', both of which the page already offers. A handler enum that disagrees with
 * the entity enum refuses valid input, and the gate now checks the two against each other.
 */
export const PROVIDER_CATEGORIES = Object.freeze([
  'payments', 'shipping', 'saas', 'insurance', 'banking', 'logistics',
] as const);

/** API status values the entity supports. Same reason. */
export const PROVIDER_API_STATUSES = Object.freeze(['connected', 'not_connected', 'error'] as const);

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type ProviderPreview = {
  ok: boolean;
  error?: string;
  reason?: string;
  preview?: {
    mode: 'create' | 'update';
    provider_id: string | null;
    changes: Array<{ field: string; from: unknown; to: unknown; clears_existing_value: boolean }>;
    consequences: string[];
    commercial_terms_untouched: true;
  };
  preview_hash?: string;
};

function rejectProtected(patch: Record<string, unknown>) {
  const supplied = Object.keys(patch || {});
  const hit = PROVIDER_PROTECTED_FIELDS.find((row) => supplied.includes(row.field));
  if (hit) {
    return {
      ok: false as const,
      error: 'protected_field_in_patch',
      reason: `${hit.field}: ${hit.why} Set it through ${hit.governed_by}.`,
    };
  }
  const unknown = supplied.filter((key) => !(PROVIDER_EDITABLE_FIELDS as readonly string[]).includes(key));
  if (unknown.length) {
    return { ok: false as const, error: 'unknown_field_in_patch', reason: `not editable here: ${unknown.join(', ')}` };
  }
  return null;
}

function validate(patch: Record<string, unknown>, existing: any | null) {
  const problems: string[] = [];
  const name = 'name' in patch ? text(patch.name) : text(existing?.name);
  if (!name) problems.push('name_required');

  if ('category' in patch) {
    const category = text(patch.category).toLowerCase();
    if (category && !(PROVIDER_CATEGORIES as readonly string[]).includes(category)) {
      problems.push(`category_not_supported:${category}`);
    }
  }
  if ('api_status' in patch) {
    const status = text(patch.api_status);
    if (status && !(PROVIDER_API_STATUSES as readonly string[]).includes(status)) {
      problems.push(`api_status_not_supported:${status}`);
    }
  }
  if ('contact_email' in patch) {
    const email = text(patch.contact_email);
    // An empty contact email is allowed; a malformed one is not, because it silently
    // becomes an address nobody can reach.
    if (email && !EMAIL.test(email)) problems.push('contact_email_malformed');
  }
  return problems;
}

/**
 * Previews a provider create or update.
 *
 * A create is previewed too. The old form created a provider on first click with no
 * confirmation, so a mistyped name became a permanent row that Recover cases could
 * reference.
 */
export async function previewProviderWrite(input: {
  svc: any;
  provider_id?: string | null;
  patch: Record<string, unknown>;
  sha256: (value: unknown) => Promise<string>;
}): Promise<ProviderPreview> {
  const patch = input.patch || {};
  const refusal = rejectProtected(patch);
  if (refusal) return refusal;

  const providerId = text(input.provider_id);
  let existing: any = null;
  if (providerId) {
    try {
      const found = await input.svc.entities.Provider.filter({ id: providerId }, '-created_date', 1);
      existing = Array.isArray(found) ? found[0] : null;
    } catch {
      return { ok: false, error: 'provider_unreadable' };
    }
    if (!existing) return { ok: false, error: 'provider_not_found' };
  }

  const problems = validate(patch, existing);
  if (problems.length) {
    return { ok: false, error: 'provider_invalid', reason: problems.join(', ') };
  }

  const changes: Array<{ field: string; from: unknown; to: unknown; clears_existing_value: boolean }> = [];
  for (const field of PROVIDER_EDITABLE_FIELDS) {
    if (!(field in patch)) continue;
    const next = field === 'category' ? text(patch[field]).toLowerCase() : text(patch[field]);
    const current = text(existing?.[field]);
    if (next === current) continue;
    changes.push({ field, from: existing?.[field] ?? null, to: next, clears_existing_value: Boolean(current) && !next });
  }

  if (!changes.length) return { ok: false, error: 'no_change' };

  const consequences: string[] = [];
  for (const change of changes.filter((row) => row.clears_existing_value)) {
    consequences.push(`${change.field} currently holds a value and would be cleared.`);
  }
  if (!providerId) {
    consequences.push('This creates a new provider. Recover cases, opportunities and the pricing ledger can reference it, so a duplicate is not free to undo.');
  }
  // Stated on every preview, so a reader of this dialogue knows the money did not move.
  consequences.push('Commercial terms are not touched: provider compensation lives in ProviderRevenueLedger.rate_bps against a hashed agreement.');

  const preview = {
    mode: (providerId ? 'update' : 'create') as 'create' | 'update',
    provider_id: providerId || null,
    changes,
    consequences,
    commercial_terms_untouched: true as const,
  };

  return { ok: true, preview, preview_hash: await input.sha256(preview) };
}

/** Applies a previewed provider write. Hash-bound. */
export async function applyProviderWrite(input: {
  svc: any;
  actor: string;
  provider_id?: string | null;
  patch: Record<string, unknown>;
  expected_preview_hash: string;
  now: string;
  sha256: (value: unknown) => Promise<string>;
}) {
  const previewed = await previewProviderWrite({
    svc: input.svc, provider_id: input.provider_id, patch: input.patch, sha256: input.sha256,
  });
  if (!previewed.ok) return previewed;
  if (previewed.preview_hash !== text(input.expected_preview_hash)) {
    return {
      ok: false, error: 'preview_hash_mismatch',
      reason: 'The provider changed since it was previewed.',
      current_preview_hash: previewed.preview_hash,
    };
  }

  const payload: Record<string, unknown> = {};
  for (const change of previewed.preview!.changes) payload[change.field] = change.to;

  try {
    if (previewed.preview!.mode === 'update') {
      await input.svc.entities.Provider.update(text(input.provider_id), payload);
      return {
        ok: true, mode: 'update', provider_id: text(input.provider_id),
        applied_fields: Object.keys(payload), commercial_terms_touched: false,
        actor: input.actor, at: input.now,
      };
    }
    const created = await input.svc.entities.Provider.create({
      ...payload,
      category: text(payload.category) || 'payments',
      api_status: text(payload.api_status) || 'not_connected',
    });
    return {
      ok: true, mode: 'create', provider_id: text(created?.id),
      applied_fields: Object.keys(payload), commercial_terms_touched: false,
      actor: input.actor, at: input.now,
    };
  } catch (error: any) {
    return { ok: false, error: 'provider_write_failed', reason: text(error?.message) || null };
  }
}

/**
 * Reports what a provider's stored revenue share actually is, and what it means.
 *
 * The page has to show something where the editable field used to be, and the honest
 * thing to show is the truth: a legacy number with no agreement behind it, next to the
 * governed rate if one exists. Reading `null` as "no revenue share" would repeat the
 * `|| 0` defect in the display layer.
 */
export async function readProviderCompensation(input: { svc: any; provider_id: string }) {
  const providerId = text(input.provider_id);
  if (!providerId) return { ok: false, error: 'provider_id_required' };

  let provider: any = null;
  try {
    const found = await input.svc.entities.Provider.filter({ id: providerId }, '-created_date', 1);
    provider = Array.isArray(found) ? found[0] : null;
  } catch {
    return { ok: false, error: 'provider_unreadable' };
  }
  if (!provider) return { ok: false, error: 'provider_not_found' };

  let ledgerRows: any[] = [];
  let ledgerReadable = true;
  try {
    ledgerRows = await input.svc.entities.ProviderRevenueLedger.filter({ provider_id: providerId }, '-updated_at', 50) || [];
  } catch {
    ledgerReadable = false;
  }

  const withAgreement = ledgerRows.filter((row: any) => text(row.agreement_id));
  const rates = [...new Set(withAgreement.map((row: any) => nullableNumber(row.rate_bps))
    .filter((rate): rate is number => rate !== null))];

  const legacy = nullableNumber(provider.revenue_share_pct);

  return {
    ok: true,
    provider_id: providerId,
    legacy_revenue_share_pct: legacy,
    // The distinction the old form destroyed: never set vs deliberately zero.
    legacy_state: legacy === null ? 'NEVER_SET' : (legacy === 0 ? 'RECORDED_AS_ZERO' : 'RECORDED'),
    legacy_is_authoritative: false,
    legacy_note: 'Read by no production code. Kept for history; not the commercial rate.',
    governed_rate_bps: ledgerReadable ? (rates.length === 1 ? rates[0] : null) : null,
    governed_rate_state: !ledgerReadable
      ? 'LEDGER_UNREADABLE'
      : (rates.length === 0 ? 'NO_AGREEMENT_BOUND_RATE' : (rates.length === 1 ? 'SINGLE_RATE' : 'MULTIPLE_RATES')),
    agreement_bound_entries: ledgerReadable ? withAgreement.length : null,
    // A legacy number that disagrees with the agreement is the divergence this whole
    // protection exists to prevent, so it is surfaced rather than reconciled silently.
    diverges_from_agreement: ledgerReadable && legacy !== null && rates.length === 1
      ? Math.round(legacy * 100) !== rates[0]
      : null,
  };
}
