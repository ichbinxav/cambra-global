import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import {
  DOCUMENT_EXTRACTION_VERSION,
  buildAnalyzerProjection,
  crossValidateCandidates,
  decimalMajorToMinor,
  normalizeExtractionCandidate,
  prepareDocumentForExternalExtraction,
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

  it.each(['csv', 'txt', 'json'])('routes a PDF renamed as %s to the binary privacy gate', (extension) => {
    const bytes = new TextEncoder().encode('harmless-prefix\n%PDF-1.7\nprintable PDF body');
    expect(validateDocumentEnvelope({ fileName: `statement.${extension}`, bytes })).toMatchObject({ ok: true, kind: 'pdf', mime: 'application/pdf' });
    expect(prepareDocumentForExternalExtraction({ kind: 'pdf', bytes })).toMatchObject({ ok: false, status: 'needs_review', httpStatus: 422 });
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

describe('document extraction v2 · pre-provider privacy boundary', () => {
  const canaries = [
    'Alice Dupont',
    'alice@example.com',
    '+33 6 12 34 56 78',
    '12 rue de Rivoli, 75001 Paris',
    'FR12345678901',
    'FR7630006000011234567890189',
  ];

  it.each([
    ['csv', 'name,email,phone,address,vat,iban,gross_amount_major\nAlice Dupont,alice@example.com,+33 6 12 34 56 78,"12 rue de Rivoli, 75001 Paris",FR12345678901,FR7630006000011234567890189,10000.00'],
    ['json', JSON.stringify({ name: canaries[0], email: canaries[1], phone: canaries[2], address: canaries[3], vat: canaries[4], iban: canaries[5], gross_amount_major: '10000.00' })],
    ['text', `Name: ${canaries[0]}\nEmail: ${canaries[1]}\nPhone: ${canaries[2]}\nAddress: ${canaries[3]}\nVAT: ${canaries[4]}\nIBAN: ${canaries[5]}\nGross: 10000.00`],
  ])('removes every canary from the effective %s provider payload while retaining financial data', (kind, sourceText) => {
    const prepared = prepareDocumentForExternalExtraction({ kind, bytes: new TextEncoder().encode(sourceText) });
    expect(prepared.ok).toBe(true);
    const effectivePayload = new TextDecoder().decode(prepared.bytes);
    expect(effectivePayload).toBe(prepared.text);
    for (const canary of canaries) expect(effectivePayload).not.toContain(canary);
    expect(effectivePayload).toContain('10000.00');
    expect(prepared.redactedCategories).toEqual(expect.arrayContaining(['email', 'phone', 'address', 'vat', 'iban', 'name']));
  });

  it.each(['pdf', 'png', 'jpeg', 'webp', 'gif'])('blocks %s before any provider payload exists', (kind) => {
    expect(prepareDocumentForExternalExtraction({ kind, bytes: new Uint8Array([1, 2, 3]) })).toEqual({
      ok: false,
      status: 'needs_review',
      httpStatus: 422,
      reason: 'local_redaction_required_for_binary_document',
    });
  });

  it('fails closed on invalid UTF-8 instead of forwarding replacement characters', () => {
    expect(prepareDocumentForExternalExtraction({ kind: 'text', bytes: new Uint8Array([0xff, 0xfe]) })).toEqual({
      ok: false,
      status: 'needs_review',
      httpStatus: 422,
      reason: 'local_text_decoding_failed',
    });
  });

  it('fails closed when structured sanitization itself cannot complete', () => {
    expect(prepareDocumentForExternalExtraction({ kind: 'json', bytes: new TextEncoder().encode('{not-json') })).toEqual({
      ok: false,
      status: 'needs_review',
      httpStatus: 422,
      reason: 'local_redaction_failed',
    });
  });

  it('uses BOM-safe, quote-aware CSV delimiter detection before mapping PII columns', () => {
    const sourceText = '\uFEFFcustomer_full_name;amount;"notes,a,b,c,d"\nAlice Dupont;10000.00;"safe,a,b,c,d"';
    const prepared = prepareDocumentForExternalExtraction({ kind: 'csv', bytes: new TextEncoder().encode(sourceText) });
    expect(prepared.ok).toBe(true);
    expect(prepared.text).not.toContain('Alice Dupont');
    expect(prepared.text).toContain('[REDACTED_NAME]');
    expect(prepared.text).toContain('10000.00');
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
    // FX-2 (2026-08-16, deliberate R4 update): a non-EUR statement without a
    // resolvable FxSnapshot used to be 'analyzer_requires_eur' (permanently
    // useless); it is now 'analyzer_fx_evidence_required' (fail-closed until
    // evidence exists). Same refusal to guess, more honest reason.
    const usd = crossValidateCandidates(normalize(payment({ currency: 'USD' }), modelA), normalize(payment({ currency: 'USD' }), modelB));
    expect(buildAnalyzerProjection(usd.canonical)).toMatchObject({ eligible: false, reason: 'analyzer_fx_evidence_required' });
  });

  it('FX-2: projects a non-EUR statement when a reliable FxSnapshot resolves at period end', () => {
    // ECB-shaped snapshot (base EUR → quote SEK 11.20), effective the last
    // TARGET business day before the statement period end.
    const sekSnapshot = {
      id: 'fx-sek-1',
      base_currency: 'EUR',
      quote_currency: 'SEK',
      rate_kind: 'REFERENCE',
      rate_decimal: '11.20',
      source: 'ECB',
      source_type: 'CENTRAL_BANK',
      source_url: 'https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml',
      effective_at: '2026-07-31T14:15:00Z',
      status: 'CURRENT',
      version: 1,
    };
    const sek = crossValidateCandidates(normalize(payment({ currency: 'SEK', fields: { gross_amount_major: field('112000.00', 'Gross volume'), fees_amount_major: field('3248.00', 'Total fees'), net_amount_major: field('108752.00', 'Net total') } }), modelA), normalize(payment({ currency: 'SEK', fields: { gross_amount_major: field('112000.00', 'Gross volume'), fees_amount_major: field('3248.00', 'Total fees'), net_amount_major: field('108752.00', 'Net total') } }), modelB));
    expect(sek.accepted).toBe(true);
    const projection = buildAnalyzerProjection(sek.canonical, [sekSnapshot]);
    expect(projection.eligible).toBe(true);
    // 112,000 SEK at 11.20 SEK/EUR = 10,000 EUR. fee_pct computed on the
    // ORIGINAL amounts (ratio is currency-invariant): 3248/112000 = 2.9%.
    expect(projection.aggregates.payments.total_volume_eur).toBeCloseTo(10000, 2);
    expect(projection.aggregates.payments.fee_pct).toBeCloseTo(2.9, 4);
    // The applied rate is frozen onto the projection for reproducibility.
    expect(projection.aggregates.payments.fx).toMatchObject({
      currency_original: 'SEK',
      source: 'ECB',
      resolved_effective_at: '2026-07-31T14:15:00.000Z',
    });
    // Same statement WITHOUT the snapshot fails closed, never a guessed rate.
    expect(buildAnalyzerProjection(sek.canonical, [])).toMatchObject({ eligible: false, reason: 'analyzer_fx_evidence_required' });
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

  it('uses OpenAI Responses structured output with sanitized text only', () => {
    expect(source).toContain("https://api.openai.com/v1/responses");
    expect(source).toContain("type: 'input_text'");
    expect(source).toContain("type: 'json_schema'");
    expect(source).toContain('store: false');
    expect(source).not.toContain("type: 'input_file'");
    expect(source).not.toContain("type: 'input_image'");
    expect(source).toContain("!['csv', 'json', 'text'].includes(kind)");
  });

  it('rejects oversized text documents before either independent reader is called', () => {
    expect(source).toContain("['csv', 'json', 'text'].includes(envelope.kind) && envelope.size > MAX_TEXT_DOCUMENT_BYTES");
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

  it('consumes Anthropic and OpenAI as the two independent readers and routes disagreement to review', () => {
    expect(source).toMatch(/const \[primaryRaw, secondaryRaw\] = await Promise\.all\(\[\s*callAnthropic\([\s\S]*?callOpenAI\(/u);
    expect(source).toContain('const secondary = secondaryRaw.ok ? normalizeExtractionCandidate(secondaryRaw.parsed');
    expect(source).toContain('const comparison = crossValidateCandidates(primary, secondary)');
    expect(source).toContain("const status = comparison.accepted ? 'success' : (primaryRaw.ok || secondaryRaw.ok ? 'needs_review' : 'format_unknown')");
    expect(source).toContain('if (comparison.accepted && projection.eligible) projected = await projectAccepted');
    expect(source.match(/callAnthropic\(svc, checksum/g)).toHaveLength(1);
    expect(source.match(/callOpenAI\(svc, checksum/g)).toHaveLength(1);
    expect(source).toContain("outcome: status === 'format_unknown' ? 'FAILED' : 'SUCCEEDED'");
  });

  it('constructs both effective provider payloads only from the locally sanitized text', () => {
    expect(source).toContain('const prepared = prepareDocumentForExternalExtraction({ kind: envelope.kind, bytes })');
    expect(source).toContain('callAnthropic(svc, checksum, envelope.kind, prepared.text)');
    expect(source).toContain('callOpenAI(svc, checksum, envelope.kind, prepared.text)');
    expect(source).not.toContain('bytesToBase64(bytes)');
    expect(source).not.toMatch(/call(?:Anthropic|OpenAI)\([^\n]+\bbytes\b/u);
    expect(source).not.toMatch(/call(?:Anthropic|OpenAI)\([^\n]+\bfileName\b/u);
  });

  it('records binary uploads as needs_review/422 without provider calls and never logs exception objects', () => {
    const privacyGate = source.indexOf('if (prepared.ok === false)');
    const providerCalls = source.indexOf('const [primaryRaw, secondaryRaw] = await Promise.all');
    expect(privacyGate).toBeGreaterThan(-1);
    expect(privacyGate).toBeLessThan(providerCalls);
    expect(source).toContain("parsed_status: 'needs_review'");
    expect(source).toContain('status: prepared.httpStatus');
    expect(source).toContain('provider_calls: 0');
    expect(source).toContain("const replayBlockReason = replay.metadata_json.privacy_boundary.reason || 'local_redaction_required_for_binary_document'");
    expect(source).toContain('error: replayBlockReason');
    expect(source).not.toContain("console.error('processUploadedFile failed', error)");
  });

  it('records the actual number of external provider attempts instead of claiming two calls', () => {
    expect(source).toContain('providerCalled: false');
    expect(source).toContain('providerCalled: true');
    expect(source).toContain('const providerCallCount = Number(primaryRaw.providerCalled === true) + Number(secondaryRaw.providerCalled === true)');
    expect(source).toContain('provider_calls: providerCallCount');
    expect(source).not.toContain('blocked: false, provider_calls: 2');
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
