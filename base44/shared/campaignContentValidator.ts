// CAMP-C3 (2026-08-16) — Content Studio validation and the claims gate
// (PROMPT_FIX_DISCOVERY_V2 Parte 4, chunk C3, spec §7.3.6).
//
// Two independent jobs, both pure:
//  1. Variable resolution — a REQUIRED variable that cannot be resolved blocks
//     the enrollment or uses an EXPLICIT fallback. It is never silently left
//     as a raw {{token}} and never invented.
//  2. Claims gate — merchant-specific economic claims, guarantees and audit
//     assertions are blocked unless backed by evidence for THAT recipient.
//     Honest capability statements and provenance-backed observations pass.
//
// The gate is deliberately conservative: it would rather block a legitimate
// sentence than let one unproven savings claim reach a merchant.

export const CAMPAIGN_CONTENT_VALIDATOR_VERSION = 'campaign-content-validator-1.0.0';

const text = (value: unknown) => String(value ?? '').trim();

/** Variables the Content Studio understands (spec §7.3.6). */
export const SUPPORTED_CONTENT_VARIABLES = Object.freeze([
  'first_name', 'company_name', 'city', 'country', 'vertical', 'detected_psp',
  'specific_observation', 'sender_name', 'calendar_link', 'analyzer_link',
  'connection_link',
] as const);

const VARIABLE_PATTERN = /\{\{\s*([a-z0-9_]+)\s*\}\}/gi;

export function extractVariables(...parts: unknown[]): string[] {
  const found = new Set<string>();
  for (const part of parts) {
    const value = text(part);
    if (!value) continue;
    for (const match of value.matchAll(VARIABLE_PATTERN)) {
      found.add(String(match[1]).toLowerCase());
    }
  }
  return [...found].sort((left, right) => left.localeCompare(right, 'en'));
}

export type VariableSpec = {
  source?: string;
  truth_state?: string;
  freshness?: string | null;
  fallback?: string | null;
  required?: boolean;
};

/**
 * Resolves the content variables for one recipient.
 *
 * A required variable with no value and no fallback BLOCKS. A required
 * variable with an explicit fallback resolves to the fallback and is reported
 * as `used_fallback` so the founder can see it was not real data.
 */
export function resolveContentVariables(input: {
  variables: string[];
  schema?: Record<string, VariableSpec>;
  values?: Record<string, unknown>;
}) {
  const schema = input.schema || {};
  const values = input.values || {};
  const resolved: Record<string, string> = {};
  const unresolved: string[] = [];
  const usedFallback: string[] = [];
  const unknownVariables: string[] = [];
  for (const name of input.variables) {
    if (!(SUPPORTED_CONTENT_VARIABLES as readonly string[]).includes(name)) {
      unknownVariables.push(name);
    }
    const spec = schema[name] || {};
    const raw = text(values[name]);
    if (raw) { resolved[name] = raw; continue; }
    const fallback = spec.fallback === null || spec.fallback === undefined ? '' : text(spec.fallback);
    if (fallback) { resolved[name] = fallback; usedFallback.push(name); continue; }
    // Required is the default for an unknown/undeclared variable: an
    // undeclared token in the body must not silently render empty.
    if (spec.required !== false) unresolved.push(name);
  }
  return {
    resolved,
    unresolved: unresolved.sort((a, b) => a.localeCompare(b, 'en')),
    used_fallback: usedFallback.sort((a, b) => a.localeCompare(b, 'en')),
    unknown_variables: unknownVariables.sort((a, b) => a.localeCompare(b, 'en')),
    blocked: unresolved.length > 0 || unknownVariables.length > 0,
  };
}

/**
 * Claim patterns that require merchant-specific evidence, plus patterns that
 * are never allowed regardless of evidence.
 */
const ALWAYS_BLOCKED = [
  { key: 'GUARANTEED_SAVINGS', pattern: /\b(we\s+guarantee|guaranteed\s+savings|garantizamos|nous\s+garantissons)\b/i },
  { key: 'RISK_FREE_PROMISE', pattern: /\b(risk[-\s]?free|sin\s+riesgo|sans\s+risque)\b/i },
];

const EVIDENCE_REQUIRED = [
  // A specific amount attached to overpayment/saving language.
  { key: 'SPECIFIC_ECONOMIC_CLAIM', pattern: /\b(overpay\w*|sobrepag\w*|surpay\w*|save|saving[s]?|ahorr\w*|économis\w*)\b[^.!?]{0,60}?[€$£]\s?\d|[€$£]\s?[\d.,]+[^.!?]{0,60}?\b(overpay\w*|saving[s]?|ahorr\w*|économis\w*)\b/i },
  // Claiming we already inspected their payments.
  { key: 'AUDIT_PERFORMED_CLAIM', pattern: /\b(we\s+have\s+audited|hemos\s+auditado|nous\s+avons\s+audité|our\s+audit\s+of\s+your)\b/i },
  // Asserting their exact rate/fee as known fact.
  { key: 'ASSERTED_RATE_CLAIM', pattern: /\byour\s+(current\s+)?(rate|fee|cost)s?\s+(is|are)\s+[\d.,]+\s?%/i },
];

export type ClaimEvidence = {
  claim_key?: string;
  subject_id?: string;
  truth_state?: string;
  source?: string;
  observed_at?: string | null;
};

/**
 * Runs the claims gate over a rendered body.
 *
 * `evidence` must be merchant-specific: evidence attached to a different
 * subject, or with a non-observed truth state, does not unlock a claim.
 */
export function evaluateClaimsGate(input: {
  body: string;
  subject_id?: string;
  evidence?: ClaimEvidence[];
}) {
  const body = text(input.body);
  const evidence = Array.isArray(input.evidence) ? input.evidence : [];
  const blocked: any[] = [];
  const allowed: any[] = [];

  for (const rule of ALWAYS_BLOCKED) {
    if (rule.pattern.test(body)) {
      blocked.push({
        claim_key: rule.key,
        reason: 'claim_never_permitted',
        detail: 'CAMBRA does not guarantee outcomes; no evidence can unlock this wording.',
      });
    }
  }

  for (const rule of EVIDENCE_REQUIRED) {
    if (!rule.pattern.test(body)) continue;
    const supporting = evidence.filter((row) =>
      text(row.claim_key) === rule.key &&
      // Evidence must belong to this exact recipient — a neighbour's audit
      // never justifies a claim about this merchant.
      (!input.subject_id || text(row.subject_id) === text(input.subject_id)) &&
      text(row.truth_state).toUpperCase() === 'OBSERVED' &&
      Boolean(text(row.source))
    );
    if (supporting.length > 0) {
      allowed.push({ claim_key: rule.key, evidence_count: supporting.length });
    } else {
      blocked.push({
        claim_key: rule.key,
        reason: 'merchant_specific_evidence_required',
        detail: 'This sentence asserts something about the recipient that CAMBRA has not observed for them.',
      });
    }
  }

  return {
    blocked_claims: blocked,
    allowed_claims: allowed,
    passed: blocked.length === 0,
    gate_version: CAMPAIGN_CONTENT_VALIDATOR_VERSION,
  };
}

/**
 * Full content validation for one version. Returns a status the campaign
 * status machine consumes; VALIDATED means every required variable resolves
 * for the sample and no claim is blocked.
 */
export function validateCampaignContent(input: {
  content: {
    subject?: string;
    text_body?: string;
    html_body?: string;
    language?: string;
    variable_schema_json?: Record<string, VariableSpec>;
  };
  /** Representative recipients used to prove the variables actually resolve. */
  sample?: Array<{ subject_id?: string; values?: Record<string, unknown>; evidence?: ClaimEvidence[] }>;
  require_unsubscribe?: boolean;
}) {
  const content = input.content || {};
  const subject = text(content.subject);
  const body = text(content.text_body);
  const blockers: string[] = [];
  if (!subject) blockers.push('subject_required');
  if (!body) blockers.push('text_body_required');
  if (!text(content.language)) blockers.push('language_required');
  // An unsubscribe path is mandatory where policy requires it (spec §20.3).
  if (input.require_unsubscribe !== false && !/\{\{\s*unsubscribe\w*\s*\}\}|unsubscribe|désabonn|baja|darse de baja/i.test(body)) {
    blockers.push('unsubscribe_line_required');
  }

  const variables = extractVariables(subject, body, content.html_body);
  const samples = Array.isArray(input.sample) && input.sample.length ? input.sample : [{}];
  const unresolvedAll = new Set<string>();
  const unknownAll = new Set<string>();
  const blockedClaims: any[] = [];
  let fallbackUses = 0;

  for (const sampleRow of samples) {
    const resolution = resolveContentVariables({
      variables,
      schema: content.variable_schema_json,
      values: sampleRow.values,
    });
    resolution.unresolved.forEach((name) => unresolvedAll.add(name));
    resolution.unknown_variables.forEach((name) => unknownAll.add(name));
    fallbackUses += resolution.used_fallback.length;
    // The claims gate runs on the RENDERED body: a claim assembled from a
    // variable must not slip past because the template looked innocent.
    let rendered = body;
    for (const [name, value] of Object.entries(resolution.resolved)) {
      rendered = rendered.replaceAll(new RegExp(`\\{\\{\\s*${name}\\s*\\}\\}`, 'gi'), value);
    }
    const gate = evaluateClaimsGate({
      body: rendered,
      subject_id: sampleRow.subject_id,
      evidence: sampleRow.evidence,
    });
    blockedClaims.push(...gate.blocked_claims);
  }

  const unresolved = [...unresolvedAll].sort((a, b) => a.localeCompare(b, 'en'));
  const unknownVariables = [...unknownAll].sort((a, b) => a.localeCompare(b, 'en'));
  if (unresolved.length) blockers.push('required_variables_unresolved');
  if (unknownVariables.length) blockers.push('unsupported_variables_used');
  if (blockedClaims.length) blockers.push('claims_blocked');

  return {
    status: blockers.length ? 'REVIEW_REQUIRED' : 'VALIDATED',
    blockers,
    variables,
    unresolved_variables: unresolved,
    unknown_variables: unknownVariables,
    fallback_uses: fallbackUses,
    blocked_claims: dedupeClaims(blockedClaims),
    validator_version: CAMPAIGN_CONTENT_VALIDATOR_VERSION,
  };
}

function dedupeClaims(rows: any[]) {
  const byKey = new Map<string, any>();
  for (const row of rows) if (!byKey.has(row.claim_key)) byKey.set(row.claim_key, row);
  return [...byKey.values()];
}
