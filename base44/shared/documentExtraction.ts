// CAMBRA document extraction contract v2.
//
// This module is deliberately pure: no SDK, network, database or LLM calls.
// The production worker and the local test suite execute the exact same
// normalization, cross-check and acceptance rules.

export const DOCUMENT_EXTRACTION_VERSION = 'document-extraction-2.0.0';
export const MAX_DOCUMENT_BYTES = 15 * 1024 * 1024;

export const DOCUMENT_TYPES = [
  'payments_statement',
  'payments_invoice',
  'shipping_invoice',
  'saas_invoice',
  'provider_proposal',
  'contract',
  'tax_document',
  'bank_statement',
  'unknown',
] as const;

type DocumentType = typeof DOCUMENT_TYPES[number];
type FileKind = 'pdf' | 'png' | 'jpeg' | 'webp' | 'gif' | 'csv' | 'json';

const ISO_CURRENCY = /^[A-Z]{3}$/;
const PROVIDER_SLUG = /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/;
const SHA256 = /^[a-f0-9]{64}$/;

const FINANCIAL_FIELDS = [
  'gross_amount_major',
  'fees_amount_major',
  'net_amount_major',
  'shipping_total_major',
  'saas_total_major',
  'invoice_total_major',
] as const;

const COUNT_FIELDS = ['transaction_count', 'shipment_count'] as const;

const isRecord = (value: unknown): value is Record<string, any> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

function cleanText(value: unknown, max = 500): string {
  return typeof value === 'string'
    ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max)
    : '';
}

function isCalendarDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

/** Exact decimal-major to integer-minor conversion. It never uses float math. */
export function decimalMajorToMinor(value: unknown): { ok: true; value: number } | { ok: false; reason: string } {
  if (typeof value === 'number') {
    // Model/API callers must transmit money as decimal strings. A JS number has
    // already lost representation/provenance (and may be exponential notation).
    return { ok: false, reason: 'money_must_be_decimal_string' };
  }
  if (typeof value !== 'string') return { ok: false, reason: 'money_missing_or_not_string' };
  const raw = value.trim();
  if (!/^-?(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(raw)) return { ok: false, reason: 'invalid_decimal_money' };
  const negative = raw.startsWith('-');
  if (negative) return { ok: false, reason: 'negative_money' };
  const [whole, fraction = ''] = raw.split('.');
  const minorText = `${whole}${fraction.padEnd(2, '0')}`.replace(/^0+(?=\d)/, '');
  const minor = Number(minorText || '0');
  if (!Number.isSafeInteger(minor)) return { ok: false, reason: 'money_out_of_safe_range' };
  return { ok: true, value: minor };
}

function integerCount(value: unknown): { ok: true; value: number } | { ok: false; reason: string } {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    return { ok: false, reason: 'count_must_be_non_negative_safe_integer' };
  }
  return { ok: true, value };
}

function signatureStarts(bytes: Uint8Array, signature: number[]): boolean {
  return signature.every((byte, index) => bytes[index] === byte);
}

function looksTextual(bytes: Uint8Array): boolean {
  const sample = bytes.subarray(0, Math.min(bytes.length, 4096));
  if (!sample.length) return false;
  let printable = 0;
  for (const byte of sample) {
    if (byte === 9 || byte === 10 || byte === 13 || (byte >= 32 && byte <= 126) || byte >= 128) printable++;
  }
  return printable / sample.length >= 0.95;
}

export function detectFileKind(fileName: unknown, bytes: Uint8Array): { ok: true; kind: FileKind; mime: string } | { ok: false; reason: string } {
  const name = String(fileName || '').split('?')[0].toLowerCase();
  const ext = name.includes('.') ? name.slice(name.lastIndexOf('.') + 1) : '';
  const byMagic = signatureStarts(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d]) ? 'pdf'
    : signatureStarts(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) ? 'png'
    : signatureStarts(bytes, [0xff, 0xd8, 0xff]) ? 'jpeg'
    : signatureStarts(bytes, [0x47, 0x49, 0x46, 0x38]) ? 'gif'
    : bytes.length >= 12 && String.fromCharCode(...bytes.subarray(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.subarray(8, 12)) === 'WEBP' ? 'webp'
    : null;

  const imageExtension: Record<string, FileKind> = { png: 'png', jpg: 'jpeg', jpeg: 'jpeg', webp: 'webp', gif: 'gif' };
  if (ext === 'pdf' || imageExtension[ext]) {
    const expected = ext === 'pdf' ? 'pdf' : imageExtension[ext];
    return byMagic === expected
      ? { ok: true, kind: expected, mime: expected === 'pdf' ? 'application/pdf' : `image/${expected}` }
      : { ok: false, reason: 'extension_signature_mismatch' };
  }
  if (ext === 'csv') return looksTextual(bytes) ? { ok: true, kind: 'csv', mime: 'text/csv' } : { ok: false, reason: 'csv_not_textual' };
  if (ext === 'json') {
    if (!looksTextual(bytes)) return { ok: false, reason: 'json_not_textual' };
    try { JSON.parse(new TextDecoder().decode(bytes)); }
    catch { return { ok: false, reason: 'json_invalid' }; }
    return { ok: true, kind: 'json', mime: 'application/json' };
  }
  return { ok: false, reason: 'unsupported_file_type' };
}

export function validateDocumentEnvelope(input: { fileName?: unknown; bytes?: unknown }):
  { ok: true; kind: FileKind; mime: string; size: number } | { ok: false; reason: string } {
  if (!(input?.bytes instanceof Uint8Array)) return { ok: false, reason: 'bytes_required' };
  if (input.bytes.length === 0) return { ok: false, reason: 'empty_file' };
  if (input.bytes.length > MAX_DOCUMENT_BYTES) return { ok: false, reason: 'file_too_large' };
  const detected = detectFileKind(input.fileName, input.bytes);
  if (detected.ok === false) return detected;
  return { ...detected, size: input.bytes.length };
}

function normalizeField(raw: unknown, kind: 'money' | 'count') {
  if (raw == null) return { present: false as const };
  if (!isRecord(raw)) return { present: true as const, ok: false as const, reason: 'field_not_object' };
  if (raw.value == null) return { present: false as const };
  const evidence = cleanText(raw.evidence, 500);
  const confidence = ['high', 'medium', 'low'].includes(String(raw.confidence)) ? String(raw.confidence) : 'unknown';
  const parsed = kind === 'money' ? decimalMajorToMinor(raw.value) : integerCount(raw.value);
  if (!evidence) return { present: true as const, ok: false as const, reason: 'field_evidence_required', evidence, confidence };
  if (confidence === 'unknown') return { present: true as const, ok: false as const, reason: 'field_confidence_required', evidence, confidence };
  return parsed.ok === true
    ? { present: true as const, ok: true as const, value: parsed.value, evidence, confidence }
    : { present: true as const, ok: false as const, reason: parsed.reason, evidence, confidence };
}

export function normalizeExtractionCandidate(raw: unknown, context: { checksum: string; model: string }) {
  const problems: Array<{ field: string; reason: string }> = [];
  if (!isRecord(raw)) {
    return { ok: false as const, problems: [{ field: '$', reason: 'candidate_not_object' }], candidate: null };
  }
  const docType = DOCUMENT_TYPES.includes(raw.document_type as DocumentType) ? raw.document_type as DocumentType : 'unknown';
  if (docType === 'unknown') problems.push({ field: 'document_type', reason: 'unknown_document_type' });

  const currency = cleanText(raw.currency, 3).toUpperCase();
  if (!ISO_CURRENCY.test(currency)) problems.push({ field: 'currency', reason: 'currency_missing_or_invalid' });
  const provider = cleanText(raw.provider_slug, 100).toLowerCase();
  if (provider && !PROVIDER_SLUG.test(provider)) problems.push({ field: 'provider_slug', reason: 'invalid_provider_slug' });

  const periodStart = cleanText(raw.period_start, 10);
  const periodEnd = cleanText(raw.period_end, 10);
  if (periodStart && !isCalendarDate(periodStart)) problems.push({ field: 'period_start', reason: 'invalid_calendar_date' });
  if (periodEnd && !isCalendarDate(periodEnd)) problems.push({ field: 'period_end', reason: 'invalid_calendar_date' });
  if ((periodStart && !periodEnd) || (!periodStart && periodEnd)) problems.push({ field: 'period', reason: 'partial_period' });
  if (periodStart && periodEnd && isCalendarDate(periodStart) && isCalendarDate(periodEnd) && periodEnd < periodStart) {
    problems.push({ field: 'period', reason: 'inverted_period' });
  }

  const sourceFields = isRecord(raw.fields) ? raw.fields : {};
  const fields: Record<string, any> = {};
  for (const field of FINANCIAL_FIELDS) {
    const result = normalizeField(sourceFields[field], 'money');
    if (result.present) {
      if (result.ok) fields[field.replace('_major', '_minor')] = { value: result.value, evidence: result.evidence, confidence: result.confidence };
      else problems.push({ field, reason: result.reason });
    }
  }
  for (const field of COUNT_FIELDS) {
    const result = normalizeField(sourceFields[field], 'count');
    if (result.present) {
      if (result.ok) fields[field] = { value: result.value, evidence: result.evidence, confidence: result.confidence };
      else problems.push({ field, reason: result.reason });
    }
  }

  const needs: Record<DocumentType, string[]> = {
    payments_statement: ['gross_amount_minor', 'fees_amount_minor'],
    payments_invoice: ['fees_amount_minor', 'invoice_total_minor'],
    shipping_invoice: ['shipping_total_minor'],
    saas_invoice: ['saas_total_minor'],
    provider_proposal: [], contract: [], tax_document: [], bank_statement: [], unknown: [],
  };
  for (const required of needs[docType]) {
    if (!fields[required]) problems.push({ field: required, reason: 'required_for_document_type' });
  }

  if (fields.gross_amount_minor && fields.fees_amount_minor) {
    const gross = fields.gross_amount_minor.value;
    const fees = fields.fees_amount_minor.value;
    if (gross <= 0) problems.push({ field: 'gross_amount_minor', reason: 'gross_must_be_positive' });
    if (fees > gross) problems.push({ field: 'fees_amount_minor', reason: 'fees_exceed_gross' });
    if (gross > 0 && Math.round((fees * 10_000) / gross) > 1_000) {
      problems.push({ field: 'fees_amount_minor', reason: 'effective_rate_above_1000_bps' });
    }
  }
  if (fields.net_amount_minor && fields.gross_amount_minor && fields.fees_amount_minor) {
    const expected = fields.gross_amount_minor.value - fields.fees_amount_minor.value;
    if (Math.abs(fields.net_amount_minor.value - expected) > 1) problems.push({ field: 'net_amount_minor', reason: 'gross_minus_fees_mismatch' });
  }
  if (fields.shipping_total_minor && fields.shipment_count) {
    const perShipment = fields.shipping_total_minor.value / Math.max(1, fields.shipment_count.value);
    if (perShipment < 50 || perShipment > 100_000) problems.push({ field: 'shipping_total_minor', reason: 'shipping_unit_cost_implausible' });
  }

  const candidate = {
    extractionVersion: DOCUMENT_EXTRACTION_VERSION,
    checksum: SHA256.test(context?.checksum || '') ? context.checksum : null,
    model: cleanText(context?.model, 100),
    documentType: docType,
    providerSlug: provider || null,
    currency: ISO_CURRENCY.test(currency) ? currency : null,
    periodStart: isCalendarDate(periodStart) ? periodStart : null,
    periodEnd: isCalendarDate(periodEnd) ? periodEnd : null,
    fields,
  };
  return { ok: problems.length === 0, problems, candidate };
}

const valuesClose = (a: number, b: number) => Math.abs(a - b) <= Math.max(1, Math.round(Math.max(Math.abs(a), Math.abs(b)) * 0.005));

export function crossValidateCandidates(primaryResult: ReturnType<typeof normalizeExtractionCandidate>,
                                        secondaryResult: ReturnType<typeof normalizeExtractionCandidate>) {
  const disagreements: Array<{ field: string; primary: unknown; secondary: unknown }> = [];
  const problems = [...primaryResult.problems.map((x) => ({ ...x, source: 'primary' })), ...secondaryResult.problems.map((x) => ({ ...x, source: 'secondary' }))];
  const primary = primaryResult.candidate;
  const secondary = secondaryResult.candidate;
  if (!primary || !secondary) return { accepted: false, status: 'needs_review', disagreements, problems, canonical: null };

  for (const field of ['documentType', 'currency', 'periodStart', 'periodEnd'] as const) {
    if (primary[field] !== secondary[field]) disagreements.push({ field, primary: primary[field], secondary: secondary[field] });
  }
  if (primary.providerSlug && secondary.providerSlug && primary.providerSlug !== secondary.providerSlug) {
    disagreements.push({ field: 'providerSlug', primary: primary.providerSlug, secondary: secondary.providerSlug });
  }
  const allFields = new Set([...Object.keys(primary.fields), ...Object.keys(secondary.fields)]);
  for (const field of allFields) {
    const a = primary.fields[field]?.value;
    const b = secondary.fields[field]?.value;
    if (a == null || b == null || !valuesClose(a, b)) disagreements.push({ field, primary: a ?? null, secondary: b ?? null });
  }

  const accepted = primaryResult.ok && secondaryResult.ok && disagreements.length === 0 && !!primary.checksum && primary.checksum === secondary.checksum;
  const canonical = accepted ? {
    ...primary,
    providerSlug: primary.providerSlug || secondary.providerSlug,
    verification: {
      mode: 'independent_model_agreement',
      primaryModel: primary.model,
      secondaryModel: secondary.model,
      tolerance: '0.5_percent_or_1_minor_unit',
    },
  } : null;
  return { accepted, status: accepted ? 'success' : 'needs_review', disagreements, problems, canonical };
}

export function buildAnalyzerProjection(canonical: any) {
  if (!canonical || canonical.currency !== 'EUR') return { eligible: false, reason: 'analyzer_requires_eur', aggregates: {} };
  const f = canonical.fields || {};
  if (canonical.documentType === 'payments_statement' && f.gross_amount_minor && f.fees_amount_minor) {
    if (!canonical.periodStart || !canonical.periodEnd) return { eligible: false, reason: 'monthly_statement_period_required', aggregates: {} };
    const start = Date.parse(`${canonical.periodStart}T00:00:00Z`);
    const end = Date.parse(`${canonical.periodEnd}T00:00:00Z`);
    const inclusiveDays = Number.isFinite(start) && Number.isFinite(end) ? Math.round((end - start) / 86400000) + 1 : 0;
    if (inclusiveDays < 20 || inclusiveDays > 35) return { eligible: false, reason: 'statement_period_is_not_monthly', aggregates: {} };
    const gross = f.gross_amount_minor.value;
    const fees = f.fees_amount_minor.value;
    if (gross <= 0) return { eligible: false, reason: 'invalid_gross', aggregates: {} };
    return { eligible: true, reason: null, aggregates: { payments: { total_volume_eur: gross / 100, fee_pct: Number(((fees / gross) * 100).toFixed(4)), provider: canonical.providerSlug, period_start: canonical.periodStart, period_end: canonical.periodEnd, period_days: inclusiveDays } } };
  }
  // An invoice total is not automatically a monthly run-rate. Shipping and
  // SaaS are also retired merchant-facing verticals. Keep those documents
  // auditable, but never project their totals into the active Analyzer.
  return { eligible: false, reason: 'document_is_auditable_but_not_analyzer_input', aggregates: {} };
}
