import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import {
  DOCUMENT_EXTRACTION_VERSION,
  buildAnalyzerProjection,
  crossValidateCandidates,
  decimalMajorToMinor,
  normalizeExtractionCandidate,
  validateDocumentEnvelope,
} from '../../base44/shared/documentExtraction.ts';

const checksum = 'a'.repeat(64);
const modelA = 'claude-test';
const modelB = 'gpt-test';

function field(value, evidence = 'Total', confidence = 'high') {
  return { value, evidence, confidence };
}

function payment(overrides = {}) {
  const { fields: fieldOverrides = {}, ...rest } = overrides;
  return {
    document_type: 'payments_statement',
    provider_slug: 'stripe',
    currency: 'EUR',
    period_start: '2026-07-01',
    period_end: '2026-07-31',
    fields: {
      gross_amount_major: field('10000.00', 'Gross volume'),
      fees_amount_major: field('290.00', 'Total fees'),
      net_amount_major: field('9710.00', 'Net total'),
      transaction_count: field(420, 'Transactions'),
      shipping_total_major: field(null),
      shipment_count: field(null),
      saas_total_major: field(null),
      invoice_total_major: field(null),
      ...fieldOverrides,
    },
    ...rest,
  };
}

const normalize = (raw, model = modelA) => normalizeExtractionCandidate(raw, { checksum, model });

describe('document extraction v2 · file boundary', () => {
  it('accepts a PDF only when extension and magic bytes agree', () => {
    const bytes = new TextEncoder().encode('%PDF-1.7\nfixture');
    expect(validateDocumentEnvelope({ fileName: 'statement.pdf', bytes })).toMatchObject({ ok: true, kind: 'pdf', mime: 'application/pdf' });
    expect(validateDocumentEnvelope({ fileName: 'statement.png', bytes })).toEqual({ ok: false, reason: 'extension_signature_mismatch' });
  });

  it('rejects renamed binaries, empty files and unsupported XLSX instead of pretending to parse them', () => {
    expect(validateDocumentEnvelope({ fileName: 'malware.pdf', bytes: new Uint8Array([0, 1, 2]) })).toEqual({ ok: false, reason: 'extension_signature_mismatch' });
    expect(validateDocumentEnvelope({ fileName: 'empty.csv', bytes: new Uint8Array() })).toEqual({ ok: false, reason: 'empty_file' });
    expect(validateDocumentEnvelope({ fileName: 'statement.xlsx', bytes: new Uint8Array([0x50, 0x4b, 3, 4]) })).toEqual({ ok: false, reason: 'unsupported_file_type' });
  });

  it('validates JSON content, not only its extension', () => {
    expect(validateDocumentEnvelope({ fileName: 'statement.json', bytes: new TextEncoder().encode('{"ok":true}') }).ok).toBe(true);
    expect(validateDocumentEnvelope({ fileName: 'statement.json', bytes: new TextEncoder().encode('{nope') })).toEqual({ ok: false, reason: 'json_invalid' });
  });
});

describe('document extraction v2 · exact units and semantic validation', () => {
  it('converts decimal strings exactly to minor units', () => {
    expect(decimalMajorToMinor('0.01')).toEqual({ ok: true, value: 1 });
    expect(decimalMajorToMinor('1234.5')).toEqual({ ok: true, value: 123450 });
    expect(decimalMajorToMinor('1234.567')).toEqual({ ok: false, reason: 'invalid_decimal_money' });
  });

  it('rejects JSON numbers for money so float/unit provenance is never ambiguous', () => {
    expect(decimalMajorToMinor(29.99)).toEqual({ ok: false, reason: 'money_must_be_decimal_string' });
  });

  it('normalizes a coherent payment statement in EUR minor units', () => {
    const result = normalize(payment());
    expect(result.ok).toBe(true);
    expect(result.candidate.extractionVersion).toBe(DOCUMENT_EXTRACTION_VERSION);
    expect(result.candidate.fields.gross_amount_minor.value).toBe(1_000_000);
    expect(result.candidate.fields.fees_amount_minor.value).toBe(29_000);
  });

  it('rejects impossible dates, inverted periods and a missing currency instead of assuming EUR', () => {
    const impossible = normalize(payment({ currency: '', period_start: '2026-02-30', period_end: '2026-02-01' }));
    expect(impossible.ok).toBe(false);
    expect(impossible.problems.map((problem) => problem.reason)).toEqual(expect.arrayContaining(['currency_missing_or_invalid', 'invalid_calendar_date']));
  });

  it('rejects the classic 34 percent extraction error', () => {
    const result = normalize(payment({ fields: { fees_amount_major: field('3400.00'), net_amount_major: field('6600.00') } }));
    expect(result.ok).toBe(false);
    expect(result.problems).toContainEqual({ field: 'fees_amount_minor', reason: 'effective_rate_above_1000_bps' });
  });

  it('checks gross minus fees against net and never silently repairs it', () => {
    const result = normalize(payment({ fields: { net_amount_major: field('9000.00') } }));
    expect(result.problems).toContainEqual({ field: 'net_amount_minor', reason: 'gross_minus_fees_mismatch' });
  });

  it('preserves a classified contract without inventing analyzer numbers', () => {
    const contract = normalize({
      ...payment(), document_type: 'contract', currency: 'EUR', period_start: null, period_end: null,
      fields: Object.fromEntries(Object.keys(payment().fields).map((key) => [key, field(null)])),
    });
    expect(contract.ok).toBe(true);
    expect(buildAnalyzerProjection(contract.candidate)).toMatchObject({ eligible: false, reason: 'document_is_auditable_but_not_analyzer_input' });
  });

  it('does not reinterpret an invoice total as a monthly Analyzer run-rate', () => {
    const invoice = normalize({
      ...payment(), document_type: 'saas_invoice', period_start: null, period_end: null,
      fields: { ...payment().fields, gross_amount_major: field(null), fees_amount_major: field(null), net_amount_major: field(null), saas_total_major: field('1200.00') },
    });
    expect(invoice.ok).toBe(true);
    expect(buildAnalyzerProjection(invoice.candidate)).toMatchObject({ eligible: false, reason: 'document_is_auditable_but_not_analyzer_input' });
  });
});

describe('document extraction v2 · independent agreement gate', () => {
  it('accepts two independently normalized candidates that agree within tolerance', () => {
    const primary = normalize(payment(), modelA);
    const secondary = normalize(payment({ fields: { fees_amount_major: field('290.50'), net_amount_major: field('9709.50') } }), modelB);
    const result = crossValidateCandidates(primary, secondary);
    expect(result.accepted).toBe(true);
    expect(result.canonical.verification).toMatchObject({ mode: 'independent_model_agreement', primaryModel: modelA, secondaryModel: modelB });
  });

  it('blocks projection when the second reader is absent', () => {
    const result = crossValidateCandidates(normalize(payment()), { ok: false, problems: [{ field: '$', reason: 'secondary_disabled' }], candidate: null });
    expect(result.accepted).toBe(false);
    expect(result.status).toBe('needs_review');
    expect(result.canonical).toBeNull();
  });

  it('blocks model disagreement on currency, period, type, provider or amount', () => {
    const primary = normalize(payment(), modelA);
    const secondary = normalize(payment({ currency: 'USD', provider_slug: 'adyen', period_end: '2026-08-01', fields: { fees_amount_major: field('450.00'), net_amount_major: field('9550.00') } }), modelB);
    const result = crossValidateCandidates(primary, secondary);
    expect(result.accepted).toBe(false);
    expect(result.disagreements.map((item) => item.field)).toEqual(expect.arrayContaining(['currency', 'periodEnd', 'providerSlug', 'fees_amount_minor']));
  });

  it('projects only independently accepted EUR evidence', () => {
    const agreed = crossValidateCandidates(normalize(payment(), modelA), normalize(payment(), modelB));
    expect(buildAnalyzerProjection(agreed.canonical)).toEqual({ eligible: true, reason: null, aggregates: { payments: { total_volume_eur: 10000, fee_pct: 2.9, provider: 'stripe', period_start: '2026-07-01', period_end: '2026-07-31', period_days: 31 } } });
    const usd = crossValidateCandidates(normalize(payment({ currency: 'USD' }), modelA), normalize(payment({ currency: 'USD' }), modelB));
    expect(buildAnalyzerProjection(usd.canonical)).toMatchObject({ eligible: false, reason: 'analyzer_requires_eur' });
  });

  it('does not reinterpret a quarterly statement as monthly Analyzer volume', () => {
    const quarterly = crossValidateCandidates(normalize(payment({ period_start:'2026-04-01',period_end:'2026-06-30' }), modelA), normalize(payment({ period_start:'2026-04-01',period_end:'2026-06-30' }), modelB));
    expect(quarterly.accepted).toBe(true);
    expect(buildAnalyzerProjection(quarterly.canonical)).toMatchObject({ eligible:false,reason:'statement_period_is_not_monthly' });
  });

  it('requires field-level evidence and confidence from both readers', () => {
    expect(normalize(payment({ fields:{ fees_amount_major:field('290.00','') } })).problems).toContainEqual({ field:'fees_amount_major',reason:'field_evidence_required' });
    expect(normalize(payment({ fields:{ fees_amount_major:field('290.00','Total fees','unknown') } })).problems).toContainEqual({ field:'fees_amount_major',reason:'field_confidence_required' });
  });
});

describe('processUploadedFile v2 · production wiring', () => {
  const source = fs.readFileSync('base44/functions/processUploadedFile/entry.ts', 'utf8');

  it('fetches Base44 storage once, refuses redirects and hashes the fetched bytes', () => {
    expect(source.match(/fetch\(trusted\.url/g)).toHaveLength(1);
    expect(source).toContain("redirect: 'error'");
    expect(source).toContain("crypto.subtle.digest('SHA-256', bytes.slice().buffer)");
  });

  it('uses the official OpenAI Responses file-input and structured-output shapes', () => {
    expect(source).toContain("https://api.openai.com/v1/responses");
    expect(source).toContain("type: 'input_file'");
    expect(source).toContain("type: 'json_schema'");
    expect(source).toContain('store: false');
    expect(source).not.toMatch(/type: 'input_file'[^\n]+detail:/);
    expect(source).toContain("kind === 'json'");
  });

  it('rejects oversized text documents before either independent reader is called', () => {
    expect(source).toContain("['csv', 'json'].includes(envelope.kind) && envelope.size > MAX_TEXT_DOCUMENT_BYTES");
    expect(source).toContain("error: 'text_document_too_large_for_independent_review'");
  });

  it('caps the response stream before buffering an oversized stored object', () => {
    expect(source).toContain('readResponseWithLimit(fileResponse, 15 * 1024 * 1024)');
    expect(source).toContain("response.headers.get('content-length')");
    expect(source).not.toContain('fileResponse.arrayBuffer()');
  });

  it('requires independent acceptance before any profile or AnalyzerInput projection', () => {
    expect(source).toContain('if (comparison.accepted && projection.eligible)');
    expect(source).toContain('crossValidateCandidates(primary, secondary)');
  });

  it('does not persist raw model responses', () => {
    expect(source).not.toMatch(/raw_response|raw_model_output|content:\s*primaryRaw/);
  });

  it('does not revive retired ShippingProfile or SaaSProfile writers', () => {
    expect(source).not.toContain('entities.ShippingProfile');
    expect(source).not.toContain('entities.SaaSProfile');
    expect(source).toContain("data_source: 'file_upload'");
  });

  it('is wired into the Vault and links the audit record to the original document', () => {
    const vault = fs.readFileSync('src/pages/Vault.jsx', 'utf8');
    expect(vault).toContain("base44.functions.invoke('processUploadedFile'");
    expect(vault).toContain("target_type: 'statement_import'");
    expect(vault).toContain('EXTRACTABLE_CATEGORIES');
  });

  it('advertises live extraction only when both model providers are configured', () => {
    const capability = fs.readFileSync('base44/functions/getUploadCapability/entry.ts', 'utf8');
    expect(capability).toContain('primaryConfigured && secondaryConfigured');
    expect(capability).toContain('llmEnabled && l3Enabled && primaryConfigured && secondaryConfigured');
  });
});
