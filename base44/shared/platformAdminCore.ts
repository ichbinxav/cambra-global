// DASHBOARD-C15 (2026-08-17) — governed Organization and AdminNote writes.
//
// The last three direct browser writes the ratchet carried, and all three are worse than
// "direct CRUD" suggested.
//
// 1. ORGANIZATION PLAN TERMS CAME FROM A BROWSER ARRAY, AND PRODUCTION ENFORCES THEM.
//    OrganizationsPanel.jsx held a `PLANS` array mapping plan id to `monthly_api_quota`,
//    `overage_price_per_1k` and `rate_limit_per_minute`, and wrote those values into the
//    entity. Those three fields ARE read in production: apiV1 and mcpServer gate access on the
//    rate limit and quota, and apiUsageBilling bills the overage. So unlike C11's
//    `revenue_share_pct` — which nothing read — this was commercial terms set from a form that
//    the platform then enforces and invoices against. The catalogue is now server-side and the
//    caller may only name a plan.
//
// 2. THERE IS NO SUSPEND. The panel's button said "Suspend this organization? All keys will be
//    rejected" and wrote `billing_status: 'canceled'`. Organization.billing_status enumerates
//    active | past_due | canceled | trial — there is no suspended state. So the UI offered a
//    reversible-sounding action that performed a terminal one. The action is named `cancel`
//    here, it says it is terminal, and it requires a reason.
//
// 3. AN UNKNOWN NOTE AUTHOR WAS RECORDED AS THE STRING "admin". Both note creators used
//    `author: me?.email || "admin"`, so a note written when the current user could not be read
//    was stored as if a person called "admin" had written it — indistinguishable from a real
//    one. This is the audit-trail form of `Number(null) === 0`: an absent fact rendered as a
//    confident value. The author is now the authenticated actor and the write REFUSES when
//    there is no actor.

import { nullableNumber } from './nullableNumber.ts';

export const PLATFORM_ADMIN_VERSION = 'platform-admin-1.0.0';

const text = (value: unknown) => String(value ?? '').trim();

/**
 * The plan catalogue, server-side.
 *
 * Copied from the browser array it replaces, so the terms are unchanged — what changes is who
 * gets to state them. `apiUsageBilling` falls back to a 10,000 quota when the field is absent,
 * so a wrong value here is not a cosmetic error.
 */
export const PLAN_CATALOG = Object.freeze({
  free: { monthly_api_quota: 1000, overage_price_per_1k: 1.00, rate_limit_per_minute: 60 },
  starter: { monthly_api_quota: 10000, overage_price_per_1k: 0.50, rate_limit_per_minute: 120 },
  growth: { monthly_api_quota: 100000, overage_price_per_1k: 0.30, rate_limit_per_minute: 300 },
  enterprise: { monthly_api_quota: 1000000, overage_price_per_1k: 0.10, rate_limit_per_minute: 1000 },
} as const);

export type PlanId = keyof typeof PLAN_CATALOG;

/** Fields an organization form may set. The plan terms are deliberately absent. */
export const ORGANIZATION_INPUT_FIELDS = Object.freeze(['name', 'slug', 'owner_email', 'plan'] as const);

export const ORGANIZATION_SERVER_OWNED: ReadonlyArray<{ field: string; why: string }> = Object.freeze([
  { field: 'monthly_api_quota', why: 'derived from the plan. apiV1 and mcpServer gate access on it, so a caller-supplied quota grants itself capacity' },
  { field: 'overage_price_per_1k', why: 'derived from the plan. apiUsageBilling invoices against it, so a caller-supplied price sets what it is charged' },
  { field: 'rate_limit_per_minute', why: 'derived from the plan and enforced at the API boundary' },
  { field: 'billing_status', why: 'moved by the cancel action, which records who did it and why' },
  { field: 'suspended_at', why: 'set by the cancel action' },
  { field: 'trial_ends_at', why: 'set from the server clock, not the browser clock' },
]);

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const slugify = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

type Preview = {
  ok: boolean;
  error?: string;
  reason?: string;
  preview?: Record<string, unknown>;
  preview_hash?: string;
};

/**
 * Previews an organization registration.
 *
 * The preview states the plan terms that will be applied, because those terms decide what the
 * organization may consume and what it will be billed — and the browser form showed only a plan
 * name.
 */
export async function previewOrganization(input: {
  svc: any;
  patch: Record<string, unknown>;
  now: string;
  sha256: (value: unknown) => Promise<string>;
}): Promise<Preview> {
  const patch = input.patch || {};
  const supplied = Object.keys(patch);

  const owned = ORGANIZATION_SERVER_OWNED.find((row) => supplied.includes(row.field));
  if (owned) return { ok: false, error: 'server_owned_field_in_patch', reason: `${owned.field}: ${owned.why}` };
  const unknownField = supplied.filter((key) => !(ORGANIZATION_INPUT_FIELDS as readonly string[]).includes(key));
  if (unknownField.length) {
    return { ok: false, error: 'unknown_field_in_patch', reason: `not accepted: ${unknownField.join(', ')}` };
  }

  const name = text(patch.name);
  if (!name) return { ok: false, error: 'name_required' };

  const ownerEmail = text(patch.owner_email);
  if (!ownerEmail) return { ok: false, error: 'owner_email_required' };
  if (!EMAIL.test(ownerEmail)) return { ok: false, error: 'owner_email_malformed' };

  const plan = text(patch.plan) || 'starter';
  if (!Object.prototype.hasOwnProperty.call(PLAN_CATALOG, plan)) {
    return {
      ok: false, error: 'plan_not_in_catalog',
      reason: `${plan} is not a plan. The catalogue is ${Object.keys(PLAN_CATALOG).join(', ')} and its terms are server-side because apiV1, mcpServer and apiUsageBilling enforce them.`,
    };
  }

  const slug = text(patch.slug) ? slugify(text(patch.slug)) : slugify(name);
  if (!SLUG.test(slug)) {
    return { ok: false, error: 'slug_invalid', reason: `"${slug}" is not a usable slug` };
  }

  // A duplicate slug would give two organizations the same identifier.
  try {
    const existing = await input.svc.entities.Organization.filter({ slug }, '-created_date', 1);
    if (Array.isArray(existing) && existing.length) {
      return { ok: false, error: 'slug_taken', reason: `slug "${slug}" already belongs to another organization` };
    }
  } catch {
    // An unreadable check is not a passed check.
    return { ok: false, error: 'slug_uniqueness_unverifiable' };
  }

  const terms = PLAN_CATALOG[plan as PlanId];
  const preview = {
    name, slug, owner_email: ownerEmail, plan,
    // Stated, not accepted. These are what the platform will enforce and invoice.
    applies_terms: { ...terms },
    billing_status: 'trial',
    trial_ends_at: new Date(Date.parse(input.now) + 14 * 24 * 60 * 60 * 1000).toISOString(),
    terms_note: 'These terms gate API access and bill overage. They come from the server catalogue, not from the form.',
  };

  return { ok: true, preview, preview_hash: await input.sha256(preview) };
}

export async function applyOrganization(input: {
  svc: any;
  actor: string;
  patch: Record<string, unknown>;
  expected_preview_hash: string;
  now: string;
  sha256: (value: unknown) => Promise<string>;
}) {
  const previewed = await previewOrganization({
    svc: input.svc, patch: input.patch, now: input.now, sha256: input.sha256,
  });
  if (!previewed.ok) return previewed;
  if (previewed.preview_hash !== text(input.expected_preview_hash)) {
    return { ok: false, error: 'preview_hash_mismatch', current_preview_hash: previewed.preview_hash };
  }

  const preview = previewed.preview as any;
  try {
    const created = await input.svc.entities.Organization.create({
      name: preview.name,
      slug: preview.slug,
      owner_email: preview.owner_email,
      plan: preview.plan,
      monthly_api_quota: preview.applies_terms.monthly_api_quota,
      overage_price_per_1k: preview.applies_terms.overage_price_per_1k,
      rate_limit_per_minute: preview.applies_terms.rate_limit_per_minute,
      billing_status: 'trial',
      trial_ends_at: preview.trial_ends_at,
    });
    return {
      ok: true, organization_id: text(created?.id), slug: preview.slug,
      plan: preview.plan, applied_terms: preview.applies_terms,
      actor: input.actor, at: input.now,
    };
  } catch (error: any) {
    return { ok: false, error: 'organization_create_failed', reason: text(error?.message) || null };
  }
}

/**
 * Cancels an organization.
 *
 * Named for what it does. The panel called this "suspend" and wrote `canceled`, because
 * Organization.billing_status has no suspended state — the enum is active | past_due |
 * canceled | trial. Offering a reversible-sounding action that performs a terminal one is the
 * defect; the fix is the honest name, not a new state invented here.
 */
export async function cancelOrganization(input: {
  svc: any; actor: string; organization_id: string; reason: string; now: string;
}) {
  if (!text(input.organization_id)) return { ok: false, error: 'organization_id_required' };
  if (!text(input.reason)) return { ok: false, error: 'reason_required' };

  let org: any = null;
  try {
    const found = await input.svc.entities.Organization.filter({ id: text(input.organization_id) }, '-created_date', 1);
    org = Array.isArray(found) ? found[0] : null;
  } catch {
    return { ok: false, error: 'organization_unreadable' };
  }
  if (!org) return { ok: false, error: 'organization_not_found' };
  if (text(org.billing_status) === 'canceled') return { ok: false, error: 'already_canceled' };

  try {
    await input.svc.entities.Organization.update(text(input.organization_id), {
      billing_status: 'canceled', suspended_at: input.now,
    });
  } catch (error: any) {
    return { ok: false, error: 'organization_update_failed', reason: text(error?.message) || null };
  }

  return {
    ok: true,
    organization_id: text(input.organization_id),
    billing_status: 'canceled',
    actor: input.actor, at: input.now, reason: text(input.reason),
    // Said plainly, because the button used to imply otherwise.
    terminal: true,
    reversible: false,
    effect_note: 'API keys for this organization are rejected from now on. There is no suspended state to '
      + 'return to: reinstating it means setting the billing status back deliberately.',
    keys_rejected: true,
  };
}

/**
 * Records an admin note.
 *
 * The author is the authenticated actor. Both note creators used `me?.email || "admin"`, which
 * stored an unknown author as a person called "admin" — an absent fact written as a confident
 * value, and indistinguishable from a real note afterwards. With no actor this refuses rather
 * than attributing the note to nobody.
 */
export async function recordAdminNote(input: {
  svc: any;
  actor: string;
  target_type: string;
  target_id: string;
  note: string;
  now: string;
}) {
  const actor = text(input.actor);
  if (!actor) {
    return {
      ok: false, error: 'unidentified_author',
      reason: 'A note with no identified author is worse than no note: it reads as attributable and is not.',
    };
  }
  if (!text(input.target_type)) return { ok: false, error: 'target_type_required' };
  if (!text(input.target_id)) return { ok: false, error: 'target_id_required' };
  if (!text(input.note)) return { ok: false, error: 'note_required' };

  try {
    const created = await input.svc.entities.AdminNote.create({
      target_type: text(input.target_type),
      target_id: text(input.target_id),
      note: text(input.note),
      author: actor,
    });
    return { ok: true, note_id: text(created?.id), author: actor, at: input.now };
  } catch (error: any) {
    return { ok: false, error: 'note_create_failed', reason: text(error?.message) || null };
  }
}

/**
 * Refuses to write DealApplication, and says why.
 *
 * AdminApplicationDetail wrote `estimated_savings` and `provider_response` onto this entity. The
 * pipeline registry declares it ZERO_PRODUCERS with the evidence that no `.create()` exists
 * anywhere in the tree and the entity stands at zero rows, under the rule "do not extend, do not
 * project, do not resurrect". Writing a savings estimate onto rows that do not exist produces
 * nothing; keeping the control implies a surface that works.
 */
export function refuseDealApplicationWrite(field: unknown) {
  return {
    ok: false as const,
    error: 'deal_application_retired',
    field: text(field),
    reason: 'DealApplication is declared ZERO_PRODUCERS in config/dashboard/pipeline-stage-registry.v1.json: '
      + 'no .create() exists anywhere in the tree and the entity stands at zero rows. The rule is "do not '
      + 'extend, do not project, do not resurrect", so this write is refused rather than silently doing nothing.',
  };
}

/** Reports the plan catalogue and what each term controls, for the UI to render. */
export function planCatalogView() {
  return {
    ok: true as const,
    plans: Object.entries(PLAN_CATALOG).map(([id, terms]) => ({
      id,
      monthly_api_quota: nullableNumber(terms.monthly_api_quota),
      overage_price_per_1k: nullableNumber(terms.overage_price_per_1k),
      rate_limit_per_minute: nullableNumber(terms.rate_limit_per_minute),
    })),
    enforced_by: {
      monthly_api_quota: ['apiV1', 'mcpServer', 'apiUsage'],
      overage_price_per_1k: ['apiUsageBilling'],
      rate_limit_per_minute: ['apiV1', 'mcpServer'],
    },
    server_owned: ORGANIZATION_SERVER_OWNED.map((row) => ({ ...row })),
  };
}
