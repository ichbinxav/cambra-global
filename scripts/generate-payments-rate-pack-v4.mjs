import { createHash } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = path.join(ROOT, 'config', 'payments-rate-pack-v4');
const GENERATED_PATH = path.join(ROOT, 'base44', 'shared', 'generated', 'paymentsRatePackV4.ts');
const MANIFEST_PATH = path.join(DATA_DIR, 'manifest.json');
const CHECK = process.argv.includes('--check');

const PACK_VERSION = 'CAMBRA_RATE_PACK_V4_2026_08_20';
const MATERIALIZATION_VERSION = 'payments-rate-pack-v4-materializer-1.0.0';
const EXPECTED_COUNTS = Object.freeze({
  'rates_merged.csv': 548,
  'blocked.csv': 9,
  'surcharges_seed_v4.csv': 22,
  'bancos_seed_v2.csv': 36,
  'linea_base_10_v2.csv': 41,
  'contratos_seed_v1.csv': 36,
});

const ACTIVE_MARKETS = new Set(['ES', 'IT', 'PT', 'GB', 'GR', 'HR', 'DE', 'PL', 'CZ', 'CY']);
const LICENSING_MARKETS = new Set(['FR', 'BE', 'NL']);

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function parseCsv(text, fileName) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n') {
      row.push(field.endsWith('\r') ? field.slice(0, -1) : field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += char;
    }
  }

  if (quoted) throw new Error(`${fileName}: unterminated quoted field`);
  if (field.length > 0 || row.length > 0) {
    row.push(field.endsWith('\r') ? field.slice(0, -1) : field);
    rows.push(row);
  }
  while (rows.length && rows.at(-1).every((value) => value === '')) rows.pop();
  if (rows.length < 2) throw new Error(`${fileName}: CSV has no data rows`);

  const headers = rows[0].map((value, index) => index === 0 ? value.replace(/^\uFEFF/, '') : value);
  const records = rows.slice(1).map((values, index) => {
    if (values.length !== headers.length) {
      throw new Error(`${fileName}:${index + 2}: expected ${headers.length} columns, got ${values.length}`);
    }
    return Object.fromEntries(headers.map((header, column) => [header, values[column]]));
  });
  return { headers, records };
}

function optionalString(value) {
  const normalized = String(value ?? '').trim();
  return normalized === '' ? undefined : normalized;
}

function optionalNumber(value, label) {
  const normalized = optionalString(value);
  if (normalized === undefined) return undefined;
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) throw new Error(`${label}: expected a finite number, got ${JSON.stringify(value)}`);
  return parsed;
}

function optionalScalarNumber(value) {
  const normalized = optionalString(value);
  if (normalized === undefined) return undefined;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function optionalBoolean(value) {
  const normalized = optionalString(value)?.toLowerCase();
  if (normalized === undefined) return undefined;
  if (['true', 'yes', 'y', '1', 'si', 'sí', 's'].includes(normalized)) return true;
  if (['false', 'no', 'n', '0'].includes(normalized)) return false;
  return undefined;
}

function dateTime(value) {
  const normalized = optionalString(value);
  if (!normalized) return undefined;
  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return `${normalized}T00:00:00.000Z`;
  const parsed = Date.parse(normalized);
  if (!Number.isFinite(parsed)) return undefined;
  return new Date(parsed).toISOString();
}

function slugify(value) {
  return String(value || 'unknown')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'unknown';
}

function marketStatus(country) {
  if (ACTIVE_MARKETS.has(country)) return 'ACTIVE_MARKET';
  if (LICENSING_MARKETS.has(country)) return 'LICENSING_PROTECTED';
  return 'INACTIVE_MARKET';
}

function regionFor(country) {
  if (country === 'GB') return 'UK';
  if (country === 'US') return 'US';
  return 'EU';
}

function isPendingReference(value) {
  return /URL_PENDIENTE_REVERIFICACION|PENDIENTE_REVERIFICACION/i.test(String(value || ''));
}

function hasReference(value) {
  const normalized = optionalString(value);
  return Boolean(normalized && !isPendingReference(normalized) && normalized !== 'NO_ENCONTRADO');
}

function isStale(value) {
  const timestamp = Date.parse(dateTime(value) || '');
  const referenceNow = Date.parse('2026-08-27T00:00:00.000Z');
  return Number.isFinite(timestamp) ? referenceNow - timestamp > 90 * 86_400_000 : true;
}

function verificationStatus({ url, quote, verifiedAt, provenance, declaredStatus, note }) {
  if (isPendingReference(url) || isPendingReference(note)) return 'PENDING_URL_REVERIFICATION';
  if (!hasReference(url)) return 'SOURCE_NOT_FOUND';
  if (optionalString(verifiedAt) && isStale(verifiedAt)) return 'STALE_SOURCE_REFERENCE';
  const primary = String(provenance || '').toLowerCase() === 'primary_verified';
  const declaredVerified = /^VERIFICADO/.test(String(declaredStatus || '').toUpperCase());
  if ((primary || declaredVerified) && optionalString(quote)) return 'VERIFIED_PRIMARY_WITH_QUOTE';
  if (primary || declaredVerified) return 'PRIMARY_REFERENCE_NO_QUOTE';
  return 'SOURCE_REFERENCE_PRESENT';
}

function compact(record) {
  return Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined && value !== ''));
}

function rowMeta({ fileName, fileHash, headers, row, rowNumber, kind }) {
  const orderedValues = headers.map((header) => [header, row[header] ?? '']);
  const sourceRowSha256 = sha256(JSON.stringify(orderedValues));
  return {
    pack_id: PACK_VERSION,
    pack_source_file: fileName,
    pack_source_file_sha256: fileHash,
    source_row_number: rowNumber,
    source_row_sha256: sourceRowSha256,
    source_row_key: `${PACK_VERSION}:${kind}:${sourceRowSha256}`,
    materialization_version: MATERIALIZATION_VERSION,
  };
}

function mapRateRow(context) {
  const { row } = context;
  const meta = rowMeta({ ...context, kind: 'rate' });
  const country = String(row.cc || '').toUpperCase();
  const status = verificationStatus({
    url: row.verified_url,
    quote: row.verified_quote,
    verifiedAt: row.verified_at,
    provenance: row.provenance,
    note: row.note,
  });
  const percentBps = optionalNumber(row.rate_bps, `${context.fileName}:${context.rowNumber}:rate_bps`);
  const fixedMinor = optionalNumber(row.fixed_minor, `${context.fileName}:${context.rowNumber}:fixed_minor`);
  const comparisonDeclared = optionalBoolean(row.comparison_eligible);
  const calculationEligible = row.seed_status === 'SEEDABLE'
    && marketStatus(country) === 'ACTIVE_MARKET'
    && ['VERIFIED_PRIMARY_WITH_QUOTE', 'PRIMARY_REFERENCE_NO_QUOTE'].includes(status)
    && !isStale(row.verified_at)
    && comparisonDeclared !== false
    && (percentBps !== undefined || fixedMinor !== undefined);

  return compact({
    ...meta,
    cohort_key: `packv4|${meta.source_row_sha256}`,
    provider_slug: slugify(row.provider),
    provider_name: optionalString(row.provider),
    plan: optionalString(row.plan),
    channel: optionalString(row.channel)?.toLowerCase() || 'any',
    country,
    tier: optionalString(row.tier)?.toLowerCase() || 'any',
    region: regionFor(country),
    percent_bps: percentBps,
    fixed_fee_minor_units: fixedMinor,
    fixed_fee_currency: optionalString(row.fee_currency) || optionalString(row.currency),
    monthly_fee_minor: optionalNumber(row.monthly_fee_minor, `${context.fileName}:${context.rowNumber}:monthly_fee_minor`),
    small_ticket_threshold_minor: optionalNumber(row.small_ticket_threshold_minor, `${context.fileName}:${context.rowNumber}:small_ticket_threshold_minor`),
    small_ticket_monthly_cap_minor: optionalNumber(row.small_ticket_monthly_cap_minor, `${context.fileName}:${context.rowNumber}:small_ticket_monthly_cap_minor`),
    published_breakeven_minor: optionalNumber(row.published_breakeven_minor, `${context.fileName}:${context.rowNumber}:published_breakeven_minor`),
    scheme: optionalString(row.scheme),
    funding: optionalString(row.funding),
    issuer_region: optionalString(row.issuer_region),
    translation_marker: optionalString(row._traducida),
    rate_is_blended: optionalBoolean(row.rate_is_blended),
    online_surface: optionalString(row.online_surface),
    research_round: optionalString(row._ronda),
    origin_file: optionalString(row._origen),
    monthly_minimum_fee_minor: optionalNumber(row.monthly_minimum_fee_minor, `${context.fileName}:${context.rowNumber}:monthly_minimum_fee_minor`),
    currency: optionalString(row.currency),
    volume_band_min: optionalNumber(row.volume_band_min, `${context.fileName}:${context.rowNumber}:volume_band_min`),
    volume_band_max: optionalNumber(row.volume_band_max, `${context.fileName}:${context.rowNumber}:volume_band_max`),
    pricing_band_basis: optionalString(row.pricing_band_basis),
    txn_count_band_min: optionalNumber(row.txn_count_band_min, `${context.fileName}:${context.rowNumber}:txn_count_band_min`),
    txn_count_band_max: optionalNumber(row.txn_count_band_max, `${context.fileName}:${context.rowNumber}:txn_count_band_max`),
    source_type: optionalString(row.source_type),
    seed_status: optionalString(row.seed_status),
    source_notes: optionalString(row.note),
    eligible_mix_prior: optionalNumber(row.eligible_mix_prior, `${context.fileName}:${context.rowNumber}:eligible_mix_prior`),
    source_round: optionalString(row.source_round),
    provenance: optionalString(row.provenance),
    product: optionalString(row.product),
    standard_monthly_fee_minor: optionalNumber(row.standard_monthly_fee_minor, `${context.fileName}:${context.rowNumber}:standard_monthly_fee_minor`),
    promo_free_months: optionalNumber(row.promo_free_months, `${context.fileName}:${context.rowNumber}:promo_free_months`),
    installation_fee_minor: optionalNumber(row.installation_fee_minor, `${context.fileName}:${context.rowNumber}:installation_fee_minor`),
    deinstallation_fee_minor: optionalNumber(row.deinstallation_fee_minor, `${context.fileName}:${context.rowNumber}:deinstallation_fee_minor`),
    comparison_eligible: comparisonDeclared,
    valid_until: optionalString(row.valid_until),
    verified: status === 'VERIFIED_PRIMARY_WITH_QUOTE',
    source_url: optionalString(row.verified_url),
    source_quote: optionalString(row.verified_quote),
    verified_at: dateTime(row.verified_at),
    source_verification_status: status,
    commercial_eligibility: marketStatus(country),
    calculation_eligible_v4: calculationEligible,
    record_status: 'LOADED_REFERENCE',
    is_synthetic: false,
    active: false,
  });
}

function mapBlockedRow(context) {
  const { row } = context;
  const meta = rowMeta({ ...context, kind: 'blocked' });
  const country = String(row.cc || '').toUpperCase();
  const blockedRecordJson = Object.fromEntries(Object.entries(row).filter(([key]) => key !== 'card_class'));
  return compact({
    ...meta,
    country,
    provider_name: optionalString(row.provider),
    provider_slug: slugify(row.provider),
    plan: optionalString(row.plan),
    channel: optionalString(row.channel),
    rate_bps: optionalNumber(row.rate_bps, `${context.fileName}:${context.rowNumber}:rate_bps`),
    fixed_minor: optionalNumber(row.fixed_minor, `${context.fileName}:${context.rowNumber}:fixed_minor`),
    currency: optionalString(row.fee_currency) || optionalString(row.currency),
    source_url: optionalString(row.verified_url),
    source_quote: optionalString(row.verified_quote),
    verified_at: dateTime(row.verified_at),
    scheme: optionalString(row.scheme),
    funding: optionalString(row.funding),
    issuer_region: optionalString(row.issuer_region),
    tier: optionalString(row.tier),
    source_type: optionalString(row.source_type),
    seed_status: optionalString(row.seed_status),
    blocked_reason: optionalString(row.note) || 'BLOQUEADO_CONFLICTO_FUENTE',
    provenance: optionalString(row.provenance),
    blocked_record_json: blockedRecordJson,
    commercial_eligibility: marketStatus(country),
    quarantine_status: 'BLOCKED_SOURCE_CONFLICT',
    active: false,
    is_synthetic: false,
  });
}

function mapSurchargeRow(context) {
  const { row } = context;
  const meta = rowMeta({ ...context, kind: 'surcharge' });
  const country = String(row.cc || '').toUpperCase();
  const status = verificationStatus({ url: row.verified_url, verifiedAt: row.verified_at });
  return compact({
    ...meta,
    provider_name: optionalString(row.provider),
    provider_slug: slugify(row.provider),
    country,
    layer: optionalString(row.layer),
    intl_surcharge_bps_text: optionalString(row.intl_surcharge_bps),
    intl_surcharge_bps: optionalScalarNumber(row.intl_surcharge_bps),
    fx_fee_bps_text: optionalString(row.fx_fee_bps),
    fx_fee_bps: optionalScalarNumber(row.fx_fee_bps),
    who_pays: optionalString(row.who_pays),
    can_be_avoided: optionalString(row.can_be_avoided),
    double_count_risk: optionalString(row.double_count_risk),
    confidence: optionalString(row.confidence),
    verified_at: dateTime(row.verified_at),
    source_notes: optionalString(row.note),
    source_url: optionalString(row.verified_url),
    source_verification_status: status,
    commercial_eligibility: country === 'ALL' ? 'CROSS_MARKET_REFERENCE' : marketStatus(country),
    active_reference: status !== 'PENDING_URL_REVERIFICATION' && status !== 'SOURCE_NOT_FOUND',
    is_synthetic: false,
  });
}

function mapBankRow(context) {
  const { row } = context;
  const meta = rowMeta({ ...context, kind: 'bank' });
  const country = String(row.cc || '').toUpperCase();
  const status = verificationStatus({ url: row.fuente_url, quote: row.cita, verifiedAt: row.fecha });
  return compact({
    ...meta,
    country,
    bank_name: optionalString(row.banco),
    document_name: optionalString(row.documento),
    rate_text: optionalString(row.pct),
    minimum_per_transaction_text: optionalString(row.minimo_por_operacion),
    monthly_fee_text: optionalString(row.cuota_mensual),
    according_to_agreement: optionalString(row['segun_acuerdo(s/n)']),
    source_url: optionalString(row.fuente_url),
    source_quote: optionalString(row.cita),
    verified_at: dateTime(row.fecha),
    source_verification_status: status,
    commercial_eligibility: marketStatus(country),
    active_reference: status !== 'PENDING_URL_REVERIFICATION' && status !== 'SOURCE_NOT_FOUND',
    is_synthetic: false,
  });
}

function mapBaselineRow(context) {
  const { row } = context;
  const meta = rowMeta({ ...context, kind: 'baseline' });
  const country = String(row.cc || '').toUpperCase();
  const status = verificationStatus({ url: row.fuente_url, quote: row.cita, verifiedAt: row['año'] });
  return compact({
    ...meta,
    country,
    metric: optionalString(row.dato),
    value_text: optionalString(row.valor),
    value_numeric: optionalScalarNumber(row.valor),
    unit: optionalString(row.unidad),
    segment: optionalString(row.segmento),
    period: optionalString(row['año']),
    source_url: optionalString(row.fuente_url),
    source_quote: optionalString(row.cita),
    confidence: optionalString(row.confianza),
    source_verification_status: status,
    commercial_eligibility: marketStatus(country),
    active_reference: status !== 'PENDING_URL_REVERIFICATION' && status !== 'SOURCE_NOT_FOUND',
    is_synthetic: false,
  });
}

function mapContractRow(context) {
  const { row } = context;
  const meta = rowMeta({ ...context, kind: 'contract' });
  const country = String(row.cc || '').toUpperCase();
  const status = verificationStatus({
    url: row.fuente_url,
    quote: row.cita_exclusividad,
    verifiedAt: row.fecha,
    declaredStatus: row.estado,
  });
  return compact({
    ...meta,
    country,
    provider_name: optionalString(row.provider),
    provider_slug: slugify(row.provider),
    minimum_duration_months_text: optionalString(row.duracion_min_meses),
    auto_renewal_text: optionalString(row.renovacion_auto),
    notice_days_text: optionalString(row.preaviso_dias),
    penalty_text: optionalString(row.penalizacion),
    terminal_regime_text: optionalString(row.terminal_regimen),
    monthly_minimum_text: optionalString(row.minimo_mensual),
    exclusivity_text: optionalString(row.exclusividad),
    exclusivity_quote: optionalString(row.cita_exclusividad),
    source_url: optionalString(row.fuente_url),
    verified_at: dateTime(row.fecha),
    declared_status: optionalString(row.estado),
    source_verification_status: status,
    commercial_eligibility: marketStatus(country),
    active_reference: status !== 'PENDING_URL_REVERIFICATION' && status !== 'SOURCE_NOT_FOUND',
    is_synthetic: false,
  });
}

const FILES = [
  { fileName: 'rates_merged.csv', entityName: 'PaymentsRateTable', mapper: mapRateRow },
  { fileName: 'blocked.csv', entityName: 'PaymentsRateImportQuarantine', mapper: mapBlockedRow },
  { fileName: 'surcharges_seed_v4.csv', entityName: 'ProviderSurcharges', mapper: mapSurchargeRow },
  { fileName: 'bancos_seed_v2.csv', entityName: 'BankReference', mapper: mapBankRow },
  { fileName: 'linea_base_10_v2.csv', entityName: 'MarketBaseline', mapper: mapBaselineRow },
  { fileName: 'contratos_seed_v1.csv', entityName: 'ProviderContractTerms', mapper: mapContractRow },
];

function countBy(values) {
  return Object.fromEntries([...values.reduce((map, value) => map.set(String(value), (map.get(String(value)) || 0) + 1), new Map())]
    .sort(([a], [b]) => a.localeCompare(b)));
}

async function buildArtifacts() {
  const tables = [];
  const fileManifest = {};
  const allKeys = new Set();

  for (const spec of FILES) {
    const source = await readFile(path.join(DATA_DIR, spec.fileName), 'utf8');
    const fileHash = sha256(source);
    const { headers, records } = parseCsv(source, spec.fileName);
    if (records.length !== EXPECTED_COUNTS[spec.fileName]) {
      throw new Error(`${spec.fileName}: expected ${EXPECTED_COUNTS[spec.fileName]} rows, got ${records.length}`);
    }
    const mapped = records.map((row, index) => spec.mapper({
      fileName: spec.fileName,
      fileHash,
      headers,
      row,
      rowNumber: index + 2,
    })).map((record) => ({
      ...record,
      materialized_row_sha256: sha256(JSON.stringify(record)),
    }));
    for (const record of mapped) {
      if (allKeys.has(record.source_row_key)) throw new Error(`Duplicate source row key: ${record.source_row_key}`);
      allKeys.add(record.source_row_key);
    }
    tables.push({ fileName: spec.fileName, entityName: spec.entityName, rows: mapped });
    fileManifest[spec.fileName] = { sha256: fileHash, rows: records.length, columns: headers.length, headers };
  }

  const rateRows = tables.find((table) => table.entityName === 'PaymentsRateTable').rows;
  const blockedRows = tables.find((table) => table.entityName === 'PaymentsRateImportQuarantine').rows;
  const pendingUrlRows = rateRows.filter((row) => row.source_verification_status === 'PENDING_URL_REVERIFICATION').length;
  const missingSourceRows = rateRows.filter((row) => row.source_verification_status === 'SOURCE_NOT_FOUND').length;
  if (blockedRows.some((row) => row.active !== false || row.quarantine_status !== 'BLOCKED_SOURCE_CONFLICT')) {
    throw new Error('Blocked rows must remain inactive and quarantined');
  }

  const aggregateSha256 = sha256(JSON.stringify({
    version: PACK_VERSION,
    files: Object.entries(fileManifest).map(([name, value]) => [name, value.sha256]),
    rowKeys: tables.flatMap((table) => table.rows.map((row) => row.source_row_key)),
  }));
  const manifest = {
    pack_id: PACK_VERSION,
    aggregate_sha256: aggregateSha256,
    source_policy: 'CSV_VALUES_PRESERVED_NO_MANUAL_CORRECTION',
    legacy_engine_policy: 'PACK_ROWS_LOADED_INACTIVE_UNTIL_DIMENSION_AWARE_V4_SELECTION',
    files: fileManifest,
    totals: {
      records: tables.reduce((sum, table) => sum + table.rows.length, 0),
      rates: rateRows.length,
      blocked_quarantine: blockedRows.length,
      surcharges: tables.find((table) => table.entityName === 'ProviderSurcharges').rows.length,
      bank_references: tables.find((table) => table.entityName === 'BankReference').rows.length,
      market_baselines: tables.find((table) => table.entityName === 'MarketBaseline').rows.length,
      contract_terms: tables.find((table) => table.entityName === 'ProviderContractTerms').rows.length,
      evidence_index_declared_pending_url_reverification: 174,
      row_marked_pending_url_reverification: pendingUrlRows,
      source_reference_missing: missingSourceRows,
      evidence_index_unmapped_rows: 174 - pendingUrlRows - missingSourceRows,
      calculation_eligible_v4: rateRows.filter((row) => row.calculation_eligible_v4).length,
    },
    active_launch_markets: [...ACTIVE_MARKETS],
    licensing_protected_markets: [...LICENSING_MARKETS],
    rate_market_status_counts: countBy(rateRows.map((row) => row.commercial_eligibility)),
    rate_verification_status_counts: countBy(rateRows.map((row) => row.source_verification_status)),
    rate_country_counts: countBy(rateRows.map((row) => row.country)),
    rate_channel_counts: countBy(rateRows.map((row) => row.channel)),
  };

  const generated = `// Generated by scripts/generate-payments-rate-pack-v4.mjs. Do not edit by hand.\n`
    + `export const PAYMENTS_RATE_PACK_V4_MANIFEST = ${JSON.stringify(manifest, null, 2)} as const;\n\n`
    + `export const PAYMENTS_RATE_PACK_V4_TABLES: Array<{ fileName: string; entityName: string; rows: Array<Record<string, unknown>> }> = ${JSON.stringify(tables, null, 2)};\n`;
  const manifestText = `${JSON.stringify(manifest, null, 2)}\n`;
  return { generated, manifestText, manifest };
}

async function assertCurrent(filePath, expected) {
  const current = await readFile(filePath, 'utf8').catch(() => null);
  if (current !== expected) throw new Error(`${path.relative(ROOT, filePath)} is missing or stale; run npm run rates:generate`);
}

const artifacts = await buildArtifacts();
if (CHECK) {
  await assertCurrent(GENERATED_PATH, artifacts.generated);
  await assertCurrent(MANIFEST_PATH, artifacts.manifestText);
  console.log(`rates:check PASS - ${artifacts.manifest.totals.records} records, ${artifacts.manifest.aggregate_sha256}`);
} else {
  await mkdir(path.dirname(GENERATED_PATH), { recursive: true });
  await writeFile(GENERATED_PATH, artifacts.generated);
  await writeFile(MANIFEST_PATH, artifacts.manifestText);
  console.log(`rates:generate wrote ${artifacts.manifest.totals.records} records, ${artifacts.manifest.aggregate_sha256}`);
}
