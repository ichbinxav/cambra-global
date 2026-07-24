import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * CAMBRA — Layered invoice extractor.
 *
 * Single source of truth for turning a user-uploaded document into numbers
 * that scoreEngine can consume. Three layers, each with a distinct job:
 *
 *   Layer 1 — LLM extraction with per-field confidence + evidence.
 *     Runs Anthropic (via ANTHROPIC_API_KEY) as the primary model. Currently
 *     gated: no bytes are sent to any LLM provider while
 *     EXTRACTION_LLM_ENABLED !== "true". The whole layer is wired end-to-end
 *     so flipping the flag turns it on; nothing else changes.
 *
 *   Layer 2 — deterministic validators (JS, no LLM).
 *     Rejects impossible ratios (34 % fee), units bugs (cents-as-euros),
 *     provider-specific out-of-range values. Lives in
 *     src/lib/invoiceExtraction/layer2Validators.js — the same module tests
 *     exercise. Duplicated below because Deno cannot import from src/.
 *
 *   Layer 3 — cross-check with a different model family.
 *     Calls OpenAI (GPT) directly via the tenant's own OPENAI_API_KEY over
 *     the same document, compares field-by-field. Chosen over Gemini-via-
 *     InvokeLLM so BOTH legs of the pipeline stay under direct legal control
 *     (own keys, own DPAs) while preserving cross-family diversity (Claude
 *     vs GPT).
 *
 * Two INDEPENDENT gates (fixed 2026-07-08 audit):
 *   • EXTRACTION_LLM_ENABLED='true' → allows Layer 1 (Anthropic) to run.
 *   • EXTRACTION_L3_ENABLED='true'  → allows Layer 3 (OpenAI) to run.
 * Missing/absent env var means gate is CLOSED. Layer 3 being off is a
 * legitimate operating mode: the extractor still runs L1 + L2 and degrades
 * to "L3 did not run" — never an error. This lets us adopt Anthropic first
 * and only enable OpenAI once its retention/DPA is confirmed (one less
 * provider seeing tenant invoices until then).
 *
 * Rule of gold: if any layer rejects a field, that field NEVER enters the
 * canonical AnalyzerInput / *Profile writes. The record is stored with
 * parsed_status = "format_unknown" | "needs_review" and the file remains in
 * the user's Vault. The upload flow does not break.
 *
 * IMPORTANT: this rewrite preserves the endpoint signature. Callers that
 * expect { detected, aggregates, updates } still get one — but shapes are
 * extended with { extraction_confidence, statement_import_id, layer_verdicts }.
 * Missing/rejected fields are omitted from aggregates rather than filled
 * with fabricated numbers.
 */

// ─── Feature gates ───────────────────────────────────────────────────────────
// Two INDEPENDENT env-var gates. Both flipped from env so nothing lives in
// source control, and both default to CLOSED when absent — safest possible
// posture while retention/DPA reviews are pending.
//
//   isLlmExtractionEnabled()      → Layer 1 (Anthropic).
//   isValidationLayerEnabled()    → Layer 3 (OpenAI cross-check).
//
// Splitting the gates lets us turn Anthropic on for real usage while keeping
// OpenAI off until its DPA is confirmed — one fewer provider seeing tenant
// invoices in the meantime. When L3 is off the extractor still runs L1 + L2
// and simply reports "L3 did not run" in the verdict, degrading gracefully.
function isLlmExtractionEnabled(): boolean {
  return Deno.env.get('EXTRACTION_LLM_ENABLED') === 'true';
}
function isValidationLayerEnabled(): boolean {
  return Deno.env.get('EXTRACTION_L3_ENABLED') === 'true';
}

// ─── Layer 2 duplicated inline (Deno cannot import from src/) ────────────────
// Any change here MUST mirror src/lib/invoiceExtraction/layer2Validators.js.
// The test suite for the shared logic lives in the src/ copy — that's the
// spec both copies satisfy.
const PROVIDER_RATE_RANGES: Record<string, { min: number; max: number }> = {
  stripe:             { min: 1.2, max: 3.5 },
  adyen:              { min: 0.8, max: 3.5 },
  mollie:             { min: 1.2, max: 3.5 },
  paypal:             { min: 1.9, max: 4.5 },
  klarna:             { min: 1.9, max: 5.5 },
  square:             { min: 1.4, max: 3.5 },
  braintree:          { min: 1.2, max: 3.5 },
  "checkout.com":     { min: 1.0, max: 3.5 },
  worldpay:           { min: 1.0, max: 3.5 },
  "shopify payments": { min: 1.4, max: 3.5 },
  sumup:              { min: 1.4, max: 3.5 },
};
const GENERIC_RATE_RANGE = { min: 0.3, max: 6.0 };
const SHIPPING_PER_UNIT_RANGE = { min: 1.5, max: 40 };

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}
function normalizeProvider(p: unknown): string {
  return typeof p === 'string' ? p.trim().toLowerCase() : '';
}
function validateProcessingRateRange({ fees, gross_volume, provider }: any) {
  if (!isFiniteNumber(fees) || !isFiniteNumber(gross_volume)) return { passed: false, reason: 'missing_or_non_numeric_inputs' };
  if (gross_volume <= 0) return { passed: false, reason: 'zero_or_negative_volume' };
  if (fees < 0) return { passed: false, reason: 'negative_fees' };
  const ratio = (fees / gross_volume) * 100;
  const range = PROVIDER_RATE_RANGES[normalizeProvider(provider)] || GENERIC_RATE_RANGE;
  if (ratio < range.min) return { passed: false, reason: 'ratio_below_plausible_range', ratio, range };
  if (ratio > range.max) return { passed: false, reason: 'ratio_above_plausible_range', ratio, range };
  return { passed: true, ratio, range };
}
function validateShippingCostPerUnit({ total_cost, shipment_count }: any) {
  if (!isFiniteNumber(total_cost) || !isFiniteNumber(shipment_count)) return { passed: false, reason: 'missing_or_non_numeric_inputs' };
  if (shipment_count <= 0) return { passed: false, reason: 'zero_or_negative_count' };
  if (total_cost < 0) return { passed: false, reason: 'negative_cost' };
  const perUnit = total_cost / shipment_count;
  if (perUnit < SHIPPING_PER_UNIT_RANGE.min) return { passed: false, reason: 'per_unit_below_plausible_range', perUnit };
  if (perUnit > SHIPPING_PER_UNIT_RANGE.max) return { passed: false, reason: 'per_unit_above_plausible_range', perUnit };
  return { passed: true, perUnit };
}
function validateSaasSpendVsRevenue({ monthly_saas_spend, monthly_revenue }: any) {
  if (!isFiniteNumber(monthly_saas_spend)) return { passed: false, reason: 'non_numeric_spend' };
  if (monthly_saas_spend < 0) return { passed: false, reason: 'negative_spend' };
  if (!isFiniteNumber(monthly_revenue) || monthly_revenue <= 0) return { passed: false, reason: 'no_revenue_context' };
  if (monthly_saas_spend > monthly_revenue) return { passed: false, reason: 'saas_exceeds_revenue' };
  if (monthly_saas_spend > 0 && monthly_saas_spend < 1) return { passed: false, reason: 'implausibly_small_spend' };
  return { passed: true };
}

// ─── Layer 1 — Anthropic extraction (GATED) ──────────────────────────────────
/**
 * Prepared but NOT executed while EXTRACTION_LLM_ENABLED !== "true".
 *
 * When enabled, this function POSTs to the Anthropic Messages API with:
 *   - model: claude-3-5-sonnet (vision-capable, handles PDF pages as images
 *     and native PDF text; the exact model id will be pinned once retention
 *     / DPA is confirmed with Anthropic)
 *   - a system prompt instructing the model to return "no_encontrado" for
 *     any field it cannot extract with certainty (the "prefer no answer over
 *     a guess" contract from the spec)
 *   - the document as an image_url part (Anthropic supports remote URLs)
 *   - a strict JSON schema in the user message
 *
 * Return contract (what callers expect):
 *   {
 *     provider_detected: string | "",
 *     fields: {
 *       fees:                    { value: number | null, confidence: 'high'|'medium'|'low', evidence: string },
 *       gross_volume:            { value: number | null, confidence, evidence },
 *       period_start:            { value: string | null, confidence, evidence },
 *       period_end:              { value: string | null, confidence, evidence },
 *       shipping_total_cost:     { value: number | null, confidence, evidence },
 *       shipping_shipment_count: { value: number | null, confidence, evidence },
 *       monthly_saas_spend:      { value: number | null, confidence, evidence },
 *     },
 *     raw_response: string   // exact JSON string returned by the model, for audit
 *   }
 *
 * A malformed JSON response from Anthropic never throws — it degrades to a
 * "format_unknown" verdict at the extractor level.
 */
async function runLayer1Anthropic(fileUrl: string, fileName: string) {
  // GATE — no bytes leave the tenant while this returns null.
  if (!isLlmExtractionEnabled()) {
    return null;
  }

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) return null;

  // Detect media type from filename — Anthropic's document/image blocks need it.
  const lower = (fileName || fileUrl).toLowerCase();
  const isPdf = lower.endsWith('.pdf');
  const isImage = /\.(png|jpe?g|webp|gif)$/i.test(lower);
  if (!isPdf && !isImage) return null; // CSV/XLSX/JSON go through other paths

  const mediaType = isPdf ? 'application/pdf'
    : lower.endsWith('.png') ? 'image/png'
    : lower.endsWith('.webp') ? 'image/webp'
    : lower.endsWith('.gif') ? 'image/gif'
    : 'image/jpeg';

  // Fetch the file bytes and base64-encode — Anthropic requires inline base64
  // for both PDF (document block) and images (image block).
  let base64Data: string;
  try {
    const fileRes = await fetch(fileUrl);
    if (!fileRes.ok) return null;
    const buf = new Uint8Array(await fileRes.arrayBuffer());
    if (buf.length > 15 * 1024 * 1024) return null; // CONSOLIDATE-1 T3 — 15MB cap, degrades to format_unknown
    // Chunked base64 to avoid call-stack blowup on large PDFs.
    let bin = '';
    const chunk = 0x8000;
    for (let i = 0; i < buf.length; i += chunk) {
      bin += String.fromCharCode.apply(null, Array.from(buf.subarray(i, i + chunk)) as any);
    }
    base64Data = btoa(bin);
  } catch {
    return null;
  }

  const systemPrompt = `You extract structured data from commerce invoices (payment processor statements, shipping carrier invoices, SaaS bills).

RULES:
- Return valid JSON ONLY, matching the schema exactly. No prose, no markdown.
- For every field you cannot extract with certainty, set value = null. NEVER guess.
- confidence is one of: "high" | "medium" | "low".
- evidence is a short string quoting the line/label you read the number from.
- Amounts in EUR, as raw numbers (no currency symbols, no thousand separators).
- provider_detected: lowercase slug (e.g. "stripe", "shopify_payments", "sumup", "adyen", "ups", "dhl", "colissimo"). Empty string if unknown.
- period_start/period_end: ISO date strings (YYYY-MM-DD) if visible on the invoice, else null.`;

  const userPrompt = `Extract the following fields from this invoice. Return the JSON object exactly matching this schema:

{
  "provider_detected": "string (lowercase slug or empty string)",
  "fields": {
    "fees":                    { "value": number|null, "confidence": "high|medium|low", "evidence": "string" },
    "gross_volume":            { "value": number|null, "confidence": "high|medium|low", "evidence": "string" },
    "period_start":            { "value": "YYYY-MM-DD"|null, "confidence": "high|medium|low", "evidence": "string" },
    "period_end":              { "value": "YYYY-MM-DD"|null, "confidence": "high|medium|low", "evidence": "string" },
    "shipping_total_cost":     { "value": number|null, "confidence": "high|medium|low", "evidence": "string" },
    "shipping_shipment_count": { "value": number|null, "confidence": "high|medium|low", "evidence": "string" },
    "monthly_saas_spend":      { "value": number|null, "confidence": "high|medium|low", "evidence": "string" }
  }
}

- fees / gross_volume: fill for PAYMENT processor invoices only.
- shipping_*: fill for SHIPPING carrier invoices only.
- monthly_saas_spend: fill for SaaS/software subscription invoices only.
- All other fields on a mismatched invoice type: value = null.`;

  const contentBlock = isPdf
    ? { type: 'document', source: { type: 'base64', media_type: mediaType, data: base64Data } }
    : { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64Data } };

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: 1024,
        temperature: 0,
        system: systemPrompt,
        messages: [{
          role: 'user',
          content: [contentBlock, { type: 'text', text: userPrompt }],
        }],
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      console.error('Anthropic Layer 1 error', res.status, data?.error?.message);
      return null;
    }
    const raw = data?.content?.[0]?.text || '';
    // Strip markdown fences if the model wrapped the JSON despite the prompt.
    const clean = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
    let parsed: any;
    try {
      parsed = JSON.parse(clean);
    } catch {
      console.error('Anthropic Layer 1 returned non-JSON', raw.slice(0, 200));
      return null;
    }
    return {
      provider_detected: parsed?.provider_detected || '',
      fields: parsed?.fields || {},
      raw_response: raw,
    };
  } catch (err) {
    console.error('Anthropic Layer 1 fetch failed', (err as Error).message);
    return null;
  }
}

// ─── Layer 3 — cross-check with OpenAI (GATED) ───────────────────────────────
/**
 * Second opinion for cross-validation. Uses OpenAI (GPT) via the caller's own
 * OPENAI_API_KEY so BOTH layers stay under direct legal control:
 *   - Layer 1: Anthropic (own key, own DPA, own zero-retention)
 *   - Layer 3: OpenAI   (own key, own DPA, own zero-retention)
 *
 * Trade-off analysis:
 *   • Family diversity preserved — Claude vs GPT are distinct families,
 *     so a family-specific hallucination in one is unlikely to be
 *     autoconfirmed by the other. That was the whole point of a second
 *     opinion; we keep it.
 *   • Legal control complete — no leg of the pipeline goes through Base44
 *     without a contract the tenant controls. No dependency on the
 *     Base44↔Google contract for InvokeLLM/Gemini.
 *   • Trade-off: two legal relationships to maintain (Anthropic + OpenAI)
 *     instead of one. Both offer enterprise zero-retention + DPA for free.
 *
 * When enabled, this function POSTs to https://api.openai.com/v1/chat/completions
 * with:
 *   - model: gpt-4o (vision-capable; the exact model id will be pinned
 *     once retention / DPA is confirmed with OpenAI)
 *   - the document referenced as an image_url content part
 *   - response_format: { type: "json_schema" } matching Layer 1's shape
 *   - the same "return no_encontrado when uncertain" system contract
 *
 * Return contract: identical to runLayer1Anthropic — same fields, same
 * confidence/evidence structure — so compareLayers() can diff them
 * field-by-field with the existing 2% numeric tolerance.
 *
 * A malformed JSON response from OpenAI never throws — it degrades to
 * "L3 did not run" and the extractor falls back to Layer 1 + Layer 2 only.
 */
async function runLayer3OpenAI(fileUrl: string, fileName: string) {
  // GATE — independent from Layer 1. When EXTRACTION_L3_ENABLED !== 'true'
  // no bytes are sent to OpenAI and the extractor keeps running with L1+L2
  // only (the "L3 did not run" path in compareLayers/runExtraction).
  if (!isValidationLayerEnabled()) {
    return null;
  }

  const apiKey = Deno.env.get('OPENAI_API_KEY');
  if (!apiKey) return null;

  // OpenAI's vision endpoint supports images natively; PDFs are handled via
  // the `file` content part (Responses API / gpt-4o). We only cross-check
  // formats OpenAI can read directly — PDFs and images.
  const lower = (fileName || fileUrl).toLowerCase();
  const isPdf = lower.endsWith('.pdf');
  const isImage = /\.(png|jpe?g|webp|gif)$/i.test(lower);
  if (!isPdf && !isImage) return null;

  const systemPrompt = `You extract structured data from commerce invoices (payment processor statements, shipping carrier invoices, SaaS bills).

RULES:
- Return valid JSON ONLY, matching the schema exactly. No prose, no markdown.
- For every field you cannot extract with certainty, set value = null. NEVER guess.
- confidence is one of: "high" | "medium" | "low".
- evidence is a short string quoting the line/label you read the number from.
- Amounts in EUR, as raw numbers (no currency symbols, no thousand separators).
- provider_detected: lowercase slug (e.g. "stripe", "shopify_payments", "sumup", "adyen", "ups", "dhl", "colissimo"). Empty string if unknown.
- period_start/period_end: ISO date strings (YYYY-MM-DD) if visible on the invoice, else null.`;

  const schemaText = `{
  "provider_detected": "string (lowercase slug or empty string)",
  "fields": {
    "fees":                    { "value": number|null, "confidence": "high|medium|low", "evidence": "string" },
    "gross_volume":            { "value": number|null, "confidence": "high|medium|low", "evidence": "string" },
    "period_start":            { "value": "YYYY-MM-DD"|null, "confidence": "high|medium|low", "evidence": "string" },
    "period_end":              { "value": "YYYY-MM-DD"|null, "confidence": "high|medium|low", "evidence": "string" },
    "shipping_total_cost":     { "value": number|null, "confidence": "high|medium|low", "evidence": "string" },
    "shipping_shipment_count": { "value": number|null, "confidence": "high|medium|low", "evidence": "string" },
    "monthly_saas_spend":      { "value": number|null, "confidence": "high|medium|low", "evidence": "string" }
  }
}`;

  // Build the content parts. For images: image_url with the direct URL
  // (OpenAI fetches it). For PDFs: fetch bytes → base64 → file part.
  let contentParts: any[];
  if (isImage) {
    contentParts = [
      { type: 'text', text: `Extract fields per this schema:\n${schemaText}` },
      { type: 'image_url', image_url: { url: fileUrl } },
    ];
  } else {
    // PDF path — fetch + base64 inline as a file part.
    try {
      const fileRes = await fetch(fileUrl);
      if (!fileRes.ok) return null;
      const buf = new Uint8Array(await fileRes.arrayBuffer());
    if (buf.length > 15 * 1024 * 1024) return null; // CONSOLIDATE-1 T3 — 15MB cap, degrades to format_unknown
      let bin = '';
      const chunk = 0x8000;
      for (let i = 0; i < buf.length; i += chunk) {
        bin += String.fromCharCode.apply(null, Array.from(buf.subarray(i, i + chunk)) as any);
      }
      const base64Data = btoa(bin);
      contentParts = [
        { type: 'text', text: `Extract fields per this schema:\n${schemaText}` },
        {
          type: 'file',
          file: {
            filename: fileName || 'invoice.pdf',
            file_data: `data:application/pdf;base64,${base64Data}`,
          },
        },
      ];
    } catch {
      return null;
    }
  }

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        temperature: 0,
        max_tokens: 1024,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: contentParts },
        ],
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      console.error('OpenAI Layer 3 error', res.status, data?.error?.message);
      return null;
    }
    const raw = data?.choices?.[0]?.message?.content || '';
    let parsed: any;
    try {
      parsed = JSON.parse(raw);
    } catch {
      console.error('OpenAI Layer 3 returned non-JSON', raw.slice(0, 200));
      return null;
    }
    return {
      provider_detected: parsed?.provider_detected || '',
      fields: parsed?.fields || {},
      raw_response: raw,
    };
  } catch (err) {
    console.error('OpenAI Layer 3 fetch failed', (err as Error).message);
    return null;
  }
}

/** Compare Layer 1 and Layer 3 field-by-field, within numeric tolerance. */
function compareLayers(l1: any, l3: any) {
  if (!l1 || !l3) return { ran: false, agreements: [], disagreements: [] };
  const agreements: string[] = [];
  const disagreements: string[] = [];
  const fields = ['fees', 'gross_volume', 'shipping_total_cost', 'shipping_shipment_count', 'monthly_saas_spend'];
  for (const f of fields) {
    const a = l1.fields?.[f]?.value;
    const b = l3.fields?.[f]?.value;
    if (a == null || b == null) continue;
    if (typeof a === 'number' && typeof b === 'number') {
      // Tolerance: 2% of the larger value. Different models sometimes round
      // differently; that's not disagreement worth flagging.
      const tol = Math.max(1, Math.max(Math.abs(a), Math.abs(b)) * 0.02);
      if (Math.abs(a - b) <= tol) agreements.push(f);
      else disagreements.push(f);
    }
  }
  return { ran: true, agreements, disagreements };
}

// ─── Extractor orchestration ─────────────────────────────────────────────────
/**
 * Runs Layer 1, then Layer 2 on Layer 1's output, then Layer 3 (if L1 gave
 * anything). Returns a per-field verdict + an overall confidence label.
 *
 * When Layer 1 is gated off, the returned status is "format_unknown" — the
 * file is still persisted (see the Deno.serve handler) but no field enters
 * the AnalyzerInput / *Profile writes.
 */
async function runExtraction(base44: any, fileUrl: string, fileName: string, monthlyRevenue: number) {
  const l1 = await runLayer1Anthropic(fileUrl, fileName);

  if (!l1) {
    return {
      status: 'format_unknown' as const,
      provider_detected: '',
      extraction_confidence: 'unverified' as const,
      layer_verdicts: {
        layer1: { ran: false, reason: 'llm_disabled_or_returned_null' },
        layer2: null,
        layer3: { ran: false, agreements: [], disagreements: [] },
      },
      fields: {},
    };
  }

  // Layer 2 — deterministic sanity, no LLM.
  const l2FeesVerdict = validateProcessingRateRange({
    fees: l1.fields?.fees?.value,
    gross_volume: l1.fields?.gross_volume?.value,
    provider: l1.provider_detected,
  });
  const l2ShippingVerdict = (l1.fields?.shipping_total_cost?.value != null || l1.fields?.shipping_shipment_count?.value != null)
    ? validateShippingCostPerUnit({
        total_cost: l1.fields?.shipping_total_cost?.value,
        shipment_count: l1.fields?.shipping_shipment_count?.value,
      })
    : null;
  const l2SaasVerdict = (l1.fields?.monthly_saas_spend?.value != null)
    ? validateSaasSpendVsRevenue({
        monthly_saas_spend: l1.fields?.monthly_saas_spend?.value,
        monthly_revenue: monthlyRevenue,
      })
    : null;

  // Layer 3 — second opinion (OpenAI, tenant-controlled key).
  const l3 = await runLayer3OpenAI(fileUrl, fileName);
  const l3Verdict = compareLayers(l1, l3);

  // Combine — a field is kept only if L2 passed for it (or wasn't applicable)
  // AND (L3 agreed OR L3 didn't run). L3-disagreement demotes to "needs_review".
  const fields: Record<string, any> = {};
  const keep = (name: string, l2Ok: boolean, l3Ok: boolean) => {
    const v = l1.fields?.[name];
    if (!v || v.value == null) return;
    if (!l2Ok) {
      fields[name] = { value: null, confidence: 'rejected', evidence: v.evidence, rejected_by_layer: 2 };
      return;
    }
    if (!l3Ok) {
      fields[name] = { value: null, confidence: 'rejected', evidence: v.evidence, rejected_by_layer: 3 };
      return;
    }
    fields[name] = { value: v.value, confidence: v.confidence || 'medium', evidence: v.evidence };
  };

  const l3AgreedFees = !l3Verdict.ran || l3Verdict.agreements.includes('fees');
  const l3AgreedVolume = !l3Verdict.ran || l3Verdict.agreements.includes('gross_volume');
  const l3AgreedShipCost = !l3Verdict.ran || l3Verdict.agreements.includes('shipping_total_cost');
  const l3AgreedShipCount = !l3Verdict.ran || l3Verdict.agreements.includes('shipping_shipment_count');
  const l3AgreedSaas = !l3Verdict.ran || l3Verdict.agreements.includes('monthly_saas_spend');

  const l2FeesOk = l2FeesVerdict.passed !== false; // treat "not run" as passthrough for the pair
  keep('fees', l2FeesOk, l3AgreedFees);
  keep('gross_volume', l2FeesOk, l3AgreedVolume);
  const l2ShipOk = !l2ShippingVerdict || l2ShippingVerdict.passed !== false;
  keep('shipping_total_cost', l2ShipOk, l3AgreedShipCost);
  keep('shipping_shipment_count', l2ShipOk, l3AgreedShipCount);
  const l2SaasOk = !l2SaasVerdict || l2SaasVerdict.passed !== false;
  keep('monthly_saas_spend', l2SaasOk, l3AgreedSaas);

  const anyRejected = Object.values(fields).some((f: any) => f.confidence === 'rejected');
  const anyKept = Object.values(fields).some((f: any) => f.value != null);

  let extraction_confidence: 'high' | 'medium' | 'low' | 'unverified' = 'unverified';
  if (anyKept && !anyRejected && l3Verdict.ran) extraction_confidence = 'high';
  else if (anyKept && !anyRejected) extraction_confidence = 'medium';
  else if (anyKept) extraction_confidence = 'low';

  const status = anyRejected ? ('needs_review' as const)
              : anyKept    ? ('success' as const)
              :              ('format_unknown' as const);

  return {
    status,
    provider_detected: l1.provider_detected || '',
    extraction_confidence,
    layer_verdicts: {
      layer1: { ran: true, raw_response: l1.raw_response },
      layer2: {
        fees_and_volume: l2FeesVerdict,
        shipping_per_unit: l2ShippingVerdict,
        saas_spend: l2SaasVerdict,
      },
      layer3: l3Verdict,
    },
    fields,
  };
}

// ─── HTTP endpoint ───────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { file_url, file_name, brand_id: requestedBrandId } = body || {};
    if (!file_url) return Response.json({ error: 'file_url is required' }, { status: 400 });

    // CONSOLIDATE-1 T3 — pure input validation: extension allowlist. Covers
    // every format any layer can actually parse (csv/xlsx/pdf/images/json);
    // anything else was already dead weight ('other' parser, no extraction).
    const extName = String(file_name || file_url).split('?')[0].toLowerCase();
    if (!/\.(csv|xlsx?|pdf|png|jpe?g|webp|gif|json)$/.test(extName)) {
      return Response.json({ error: 'unsupported_file_type' }, { status: 400 });
    }

    // Resolve brand (owned by user). Same pattern as before — explicit id if
    // passed, else user's latest brand for legacy single-brand callers.
    let brandId: string | null = null;
    if (requestedBrandId) {
      const owned = await base44.entities.Brand.filter({ created_by: user.email, id: requestedBrandId });
      if (!owned.length) return Response.json({ error: 'Brand not found or access denied' }, { status: 403 });
      brandId = requestedBrandId;
    } else {
      const list = await base44.entities.Brand.filter({ created_by: user.email }, '-created_date', 1);
      if (Array.isArray(list) && list[0]?.id) brandId = list[0].id;
    }

    // Pull the brand's current monthly_revenue as context for Layer 2's
    // SaaS-vs-revenue rule. Missing revenue means that particular rule
    // stays inconclusive — never a false pass.
    let monthlyRevenue = 0;
    if (brandId) {
      const [ai] = await base44.entities.AnalyzerInput.filter({ brand_id: brandId }, '-updated_date', 1);
      monthlyRevenue = Number(ai?.monthly_revenue) || 0;
    }

    // Run the 3-layer extractor. Everything downstream reads its verdict.
    const verdict = await runExtraction(base44, file_url, file_name || '', monthlyRevenue);

    // Persist the audit trail on StatementImport regardless of outcome — the
    // whole point is that we can show the founder "we tried, here's what we
    // saw, here's what we refused to trust". File itself remains in Vault.
    let statementImportId: string | null = null;
    if (brandId) {
      const parserGuess = (() => {
        const n = (file_name || '').toLowerCase();
        if (n.endsWith('.csv')) return 'csv';
        if (n.endsWith('.xlsx') || n.endsWith('.xls')) return 'xlsx';
        if (n.endsWith('.pdf')) return 'pdf';
        if (n.endsWith('.png') || n.endsWith('.jpg') || n.endsWith('.jpeg')) return 'image';
        if (n.endsWith('.json')) return 'json';
        return 'other';
      })();
      const created = await base44.entities.StatementImport.create({
        brand_id: brandId,
        file_url,
        parser: parserGuess,
        parsed_status: verdict.status,
        extraction_confidence: verdict.extraction_confidence,
        provider_detected: verdict.provider_detected,
        imported_at: new Date().toISOString(),
        metadata_json: {
          layer1: verdict.layer_verdicts.layer1,
          layer2: verdict.layer_verdicts.layer2,
          layer3: verdict.layer_verdicts.layer3,
          fields: verdict.fields,
          format_detected: verdict.provider_detected || 'unknown',
          llm_enabled: isLlmExtractionEnabled(),
        },
      });
      statementImportId = created?.id || null;
    }

    // Only KEPT numeric fields flow to the profiles + AnalyzerInput.
    // Rejected fields are omitted — never fabricated.
    const aggregates: Record<string, any> = {};
    const updates = { payments: false, shipping: false, saas: false };

    if (verdict.status === 'success' && brandId) {
      const fees = verdict.fields.fees?.value;
      const vol = verdict.fields.gross_volume?.value;
      if (isFiniteNumber(fees) && isFiniteNumber(vol) && vol > 0) {
        const pct = (fees / vol) * 100;
        aggregates.payments = {
          total_volume_eur: vol,
          fee_pct: Number(pct.toFixed(2)),
          provider: verdict.provider_detected || null,
        };
        const [pp] = await base44.entities.PaymentsProfile.filter({ brand_id: brandId }, '-updated_date', 1);
        const patch: any = {
          brand_id: brandId,
          monthly_volume_eur: vol,
          blended_rate_percent: Number(pct.toFixed(2)),
        };
        if (verdict.provider_detected) patch.current_psp = verdict.provider_detected;
        if (pp?.id) await base44.entities.PaymentsProfile.update(pp.id, patch);
        else await base44.entities.PaymentsProfile.create(patch);
        updates.payments = true;
      }

      const shipCost = verdict.fields.shipping_total_cost?.value;
      const shipCount = verdict.fields.shipping_shipment_count?.value;
      if (isFiniteNumber(shipCost) && isFiniteNumber(shipCount) && shipCount > 0) {
        aggregates.shipping = { monthly_shipping_cost: shipCost, monthly_shipments: shipCount };
        const [sp] = await base44.entities.ShippingProfile.filter({ brand_id: brandId }, '-updated_date', 1);
        const patch: any = { brand_id: brandId, monthly_orders: shipCount, shipping_cost_eur: shipCost };
        if (sp?.id) await base44.entities.ShippingProfile.update(sp.id, patch);
        else await base44.entities.ShippingProfile.create(patch);
        updates.shipping = true;
      }

      const saas = verdict.fields.monthly_saas_spend?.value;
      if (isFiniteNumber(saas) && saas > 0) {
        aggregates.saas = { total_saas_spend: saas };
        const [sa] = await base44.entities.SaaSProfile.filter({ brand_id: brandId }, '-updated_date', 1);
        const patch: any = { brand_id: brandId };
        if (sa?.id) await base44.entities.SaaSProfile.update(sa.id, patch);
        else await base44.entities.SaaSProfile.create(patch);
        updates.saas = true;
      }

      // Patch AnalyzerInput only with fields that actually survived.
      try {
        const [ai] = await base44.entities.AnalyzerInput.filter({ brand_id: brandId }, '-updated_date', 1);
        const patch: any = { brand_id: brandId };
        if (aggregates.payments) {
          patch.monthly_revenue = Math.max(aggregates.payments.total_volume_eur || 0, 0);
          patch.payment_fee_pct = Math.max(aggregates.payments.fee_pct || 0, 0);
          if (aggregates.payments.provider) patch.payment_provider = aggregates.payments.provider;
        }
        if (aggregates.shipping) {
          patch.monthly_shipping_cost = Math.max(aggregates.shipping.monthly_shipping_cost || 0, 0);
          patch.monthly_shipments = Math.max(aggregates.shipping.monthly_shipments || 0, 0);
        }
        if (aggregates.saas) {
          patch.total_saas_spend = Math.max(aggregates.saas.total_saas_spend || 0, 0);
        }
        if (Object.keys(patch).length > 1) {
          if (ai?.id) await base44.entities.AnalyzerInput.update(ai.id, patch);
          else await base44.entities.AnalyzerInput.create(patch);
        }
      } catch (_) { /* non-fatal */ }
    }

    return Response.json({
      // Legacy-compatible surface for existing callers.
      detected: verdict.status === 'success' && aggregates.payments ? 'payments'
              : verdict.status === 'success' && aggregates.shipping ? 'shipping'
              : verdict.status === 'success' && aggregates.saas ? 'saas'
              : 'unknown',
      aggregates,
      updates,
      // New surface — never omit these, callers can ignore.
      status: verdict.status,
      extraction_confidence: verdict.extraction_confidence,
      provider_detected: verdict.provider_detected,
      statement_import_id: statementImportId,
      llm_enabled: isLlmExtractionEnabled(),
      layer_verdicts: verdict.layer_verdicts,
      fields: verdict.fields,
    });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
});