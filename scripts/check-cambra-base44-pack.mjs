#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const EXPECTED = Object.freeze({
  rates: 548,
  rateCountries: 30,
  rateProviders: 18,
  blocked: 9,
  banks: 36,
  baselines: 41,
  contracts: 36,
  surcharges: 22,
});

const REQUIRED_FILES = [
  'PROMPT_1_DATOS.md',
  'rates_merged.csv',
  'blocked.csv',
  'surcharges_seed_v3.csv',
  'bancos_seed_v1.csv',
  'linea_base_10.csv',
];

const ENUMS = Object.freeze({
  scheme: new Set(['visa', 'mastercard', 'amex', 'dankort', 'cb', 'girocard', 'bancontact', 'pagobancomat', 'multibanco', 'bankaxept', 'any']),
  funding: new Set(['debit', 'credit', 'prepaid', 'any']),
  issuer_region: new Set(['domestic', 'eea', 'uk', 'non_eea', 'any']),
  tier: new Set(['standard', 'premium', 'commercial', 'any']),
});

const LAUNCH_MARKETS = new Set(['ES', 'IT', 'PT', 'GB', 'GR', 'HR', 'DE', 'PL', 'CZ', 'CY']);
const TRUNCATION_CAPS = new Set([20, 60, 90, 100, 110]);
const NARRATIVE_OR_URL = /(?:url|quote|note|nota|cita|segmento|confidence|confianza|penalizacion|regimen|exclusividad)/iu;

export function parseCsv(text) {
  const rows = []; const diagnostics = []; let row = []; let cell = ''; let quoted = false;
  const input = String(text).replace(/^\uFEFF/u, '');
  for (let index = 0; index < input.length; index++) {
    const char = input[index];
    if (quoted) {
      if (char === '"' && input[index + 1] === '"') { cell += '"'; index++; }
      else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') { row.push(cell); cell = ''; }
    else if (char === '\n') { row.push(cell.replace(/\r$/u, '')); rows.push(row); row = []; cell = ''; }
    else cell += char;
  }
  if (quoted) diagnostics.push({ reason: 'unclosed_quote' });
  if (cell || row.length) { row.push(cell.replace(/\r$/u, '')); rows.push(row); }
  while (rows.length && rows.at(-1).every((value) => !value)) rows.pop();
  if (!rows.length) return { headers: [], rows: [], diagnostics: [{ reason: 'empty_csv' }, ...diagnostics] };
  const headers = rows[0].map((header) => header.trim());
  if (headers.some((header) => !header)) diagnostics.push({ reason: 'empty_header' });
  if (new Set(headers).size !== headers.length) diagnostics.push({ reason: 'duplicate_header' });
  rows.slice(1).forEach((values, index) => {
    if (values.every((value) => !value)) diagnostics.push({ reason: 'blank_record', row: index + 2 });
    if (values.length !== headers.length) diagnostics.push({ reason: 'column_count_mismatch', row: index + 2, expected: headers.length, actual: values.length });
  });
  return {
    headers,
    rows: rows.slice(1).map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? '']))),
    diagnostics,
  };
}

function finding(code, message, details = {}) {
  return { severity: 'BLOCKER', code, message, ...details };
}

function countMismatch(findings, code, label, actual, expected) {
  if (actual !== expected) findings.push(finding(code, `${label}: expected ${expected}, found ${actual}.`, { actual, expected }));
}

function readCsv(directory, fileName, findings) {
  const target = path.join(directory, fileName);
  if (!fs.existsSync(target)) return { headers: [], rows: [] };
  try {
    const table = parseCsv(fs.readFileSync(target, 'utf8'));
    if (table.diagnostics.length) findings.push(finding('MALFORMED_CSV', `${fileName} has structural CSV errors.`, { file: fileName, diagnostics: table.diagnostics.slice(0, 20) }));
    return table;
  }
  catch { findings.push(finding('CSV_UNREADABLE', `${fileName} could not be parsed as a local CSV.`, { file: fileName })); return { headers: [], rows: [] }; }
}

function inspectTruncation(fileName, table, findings) {
  const hits = [];
  table.rows.forEach((row, rowIndex) => {
    for (const [field, value] of Object.entries(row)) {
      const text = String(value || '').trim();
      const capped = NARRATIVE_OR_URL.test(field) && TRUNCATION_CAPS.has(text.length);
      const brokenUrlSuffix = /\.(?:pd|ht|htm)$/iu.test(text);
      if (capped || brokenUrlSuffix) hits.push({ row: rowIndex + 2, field, length: text.length, reason: brokenUrlSuffix ? 'incomplete_url_suffix' : 'exact_export_cap' });
    }
  });
  if (hits.length) findings.push(finding('TRUNCATED_FIELDS', `${fileName} contains ${hits.length} fields consistent with export truncation.`, { file: fileName, count: hits.length, samples: hits.slice(0, 12) }));
}

export function auditCambraBase44Pack(inputDirectory) {
  const directory = path.resolve(String(inputDirectory || ''));
  const findings = [];
  const metrics = {};

  if (!inputDirectory || !fs.existsSync(directory) || !fs.statSync(directory).isDirectory()) {
    return { directory, verdict: 'NO-GO', metrics, findings: [finding('PACK_DIRECTORY_INVALID', 'The supplied pack directory does not exist or is not a directory.')] };
  }

  for (const fileName of REQUIRED_FILES) {
    if (!fs.existsSync(path.join(directory, fileName))) findings.push(finding('MISSING_FILE', `Required pack file is missing: ${fileName}.`, { file: fileName }));
  }

  const hasBContracts = fs.existsSync(path.join(directory, 'B_contratos.csv'));
  const hasSeedContracts = fs.existsSync(path.join(directory, 'contratos_seed_v1.csv'));
  if (hasBContracts && hasSeedContracts) findings.push(finding('AMBIGUOUS_CONTRACT_ATTACHMENTS', 'Both contract attachment names are present; the checker will not infer which one is authoritative.'));
  const contractFileName = hasBContracts ? 'B_contratos.csv' : hasSeedContracts ? 'contratos_seed_v1.csv' : null;
  if (!contractFileName) findings.push(finding('MISSING_FILE', 'A contracts attachment is required (B_contratos.csv or contratos_seed_v1.csv).', { file: 'contracts_csv' }));

  const promptPath = path.join(directory, 'PROMPT_1_DATOS.md');
  if (fs.existsSync(promptPath)) {
    try {
      const prompt = fs.readFileSync(promptPath, 'utf8');
      if (/\bB_contratos\.csv\b/u.test(prompt) && !hasBContracts) {
        findings.push(finding('ATTACHMENT_NAME_MISMATCH', 'PROMPT_1_DATOS.md requires B_contratos.csv, but that attachment is absent.', {
          expected: 'B_contratos.csv',
          observedAlternative: hasSeedContracts ? 'contratos_seed_v1.csv' : null,
        }));
      }
      if (/\bcontratos_seed_v1\.csv\b/u.test(prompt) && !hasSeedContracts) findings.push(finding('ATTACHMENT_NAME_MISMATCH', 'PROMPT_1_DATOS.md requires contratos_seed_v1.csv, but that attachment is absent.', { expected: 'contratos_seed_v1.csv', observedAlternative: hasBContracts ? 'B_contratos.csv' : null }));
    } catch {
      findings.push(finding('PROMPT_UNREADABLE', 'PROMPT_1_DATOS.md could not be read as a local text file.', { file: 'PROMPT_1_DATOS.md' }));
    }
  }

  const rates = readCsv(directory, 'rates_merged.csv', findings);
  const blocked = readCsv(directory, 'blocked.csv', findings);
  const banks = readCsv(directory, 'bancos_seed_v1.csv', findings);
  const baselines = readCsv(directory, 'linea_base_10.csv', findings);
  const contracts = contractFileName ? readCsv(directory, contractFileName, findings) : { headers: [], rows: [] };
  const surcharges = readCsv(directory, 'surcharges_seed_v3.csv', findings);

  Object.assign(metrics, {
    rates: rates.rows.length,
    rateCountries: new Set(rates.rows.map((row) => row.cc).filter(Boolean)).size,
    rateProviders: new Set(rates.rows.map((row) => row.provider).filter(Boolean)).size,
    blocked: blocked.rows.length,
    banks: banks.rows.length,
    baselines: baselines.rows.length,
    contracts: contracts.rows.length,
    surcharges: surcharges.rows.length,
  });

  countMismatch(findings, 'RATE_ROW_COUNT', 'rates_merged.csv row count', metrics.rates, EXPECTED.rates);
  countMismatch(findings, 'RATE_COUNTRY_COUNT', 'rates_merged.csv country count', metrics.rateCountries, EXPECTED.rateCountries);
  countMismatch(findings, 'RATE_PROVIDER_COUNT', 'rates_merged.csv provider count', metrics.rateProviders, EXPECTED.rateProviders);
  countMismatch(findings, 'BLOCKED_ROW_COUNT', 'blocked.csv row count', metrics.blocked, EXPECTED.blocked);
  countMismatch(findings, 'BANK_ROW_COUNT', 'bancos_seed_v1.csv row count', metrics.banks, EXPECTED.banks);
  countMismatch(findings, 'BASELINE_ROW_COUNT', 'linea_base_10.csv row count', metrics.baselines, EXPECTED.baselines);
  countMismatch(findings, 'CONTRACT_ROW_COUNT', `${contractFileName || 'contracts CSV'} row count`, metrics.contracts, EXPECTED.contracts);
  countMismatch(findings, 'SURCHARGE_ROW_COUNT', 'surcharges_seed_v3.csv row count', metrics.surcharges, EXPECTED.surcharges);

  if (rates.headers.includes('card_class')) findings.push(finding('PROHIBITED_CARD_CLASS_COLUMN', 'rates_merged.csv still contains card_class although the prompt says it must be derived and not stored.'));

  for (const [field, allowed] of Object.entries(ENUMS)) {
    const invalid = rates.rows.filter((row) => row[field] && !allowed.has(row[field])).map((row, index) => ({ row: rates.rows.indexOf(row) + 2, value: row[field] })).slice(0, 12);
    if (invalid.length) findings.push(finding('INVALID_ENUM', `rates_merged.csv contains values outside the declared ${field} enum.`, { field, samples: invalid }));
  }

  for (const field of ['rate_is_blended', 'comparison_eligible']) {
    const invalidRows = rates.rows.flatMap((row, index) => row[field] && !['true', 'false'].includes(row[field]) ? [{ row: index + 2, value: row[field] }] : []);
    if (invalidRows.length) findings.push(finding('INVALID_BOOLEAN', `${field} contains non-canonical boolean values.`, { field, count: invalidRows.length, samples: invalidRows.slice(0, 12) }));
  }

  const seedable = rates.rows.filter((row) => !String(row.seed_status || '').toUpperCase().startsWith('BLOQUEADO'));
  const missingEvidence = seedable.filter((row) => !row.verified_url && !row.verified_quote).length;
  const claimedVerifiedWithoutEvidence = seedable.filter((row) => row.provenance === 'primary_verified' && !row.verified_url && !row.verified_quote).length;
  const missingProvenance = seedable.filter((row) => !row.provenance).length;
  const missingConfidence = seedable.filter((row) => !row.confidence).length;
  Object.assign(metrics, { missingEvidence, claimedVerifiedWithoutEvidence, missingProvenance, missingConfidence });
  if (missingEvidence || claimedVerifiedWithoutEvidence || missingProvenance || missingConfidence) {
    findings.push(finding('INCOMPLETE_EVIDENCE', 'Seedable rate rows do not satisfy the evidence/provenance contract.', { missingEvidence, claimedVerifiedWithoutEvidence, missingProvenance, missingConfidence }));
  }

  const baselineCountries = new Set(baselines.rows.map((row) => row.cc).filter(Boolean));
  const missingLaunchBaselines = [...LAUNCH_MARKETS].filter((country) => !baselineCountries.has(country));
  if (missingLaunchBaselines.length) findings.push(finding('BASELINE_MARKET_COVERAGE', 'MarketBaseline does not cover every launch market.', { missingLaunchBaselines }));

  for (const [fileName, table] of [
    ['rates_merged.csv', rates],
    ['blocked.csv', blocked],
    ['bancos_seed_v1.csv', banks],
    ['linea_base_10.csv', baselines],
    [contractFileName || 'contracts CSV', contracts],
    ['surcharges_seed_v3.csv', surcharges],
  ]) inspectTruncation(fileName, table, findings);

  return { directory, verdict: findings.some((item) => item.severity === 'BLOCKER') ? 'NO-GO' : 'GO', metrics, findings };
}

function printHuman(report) {
  console.log(`CAMBRA Base44 pack: ${report.verdict}`);
  console.log(`Directory: ${report.directory}`);
  console.log(`Metrics: ${JSON.stringify(report.metrics)}`);
  for (const item of report.findings) console.log(`[${item.severity}] ${item.code}: ${item.message}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  const directory = args.find((arg) => !arg.startsWith('--'));
  const report = auditCambraBase44Pack(directory);
  if (args.includes('--json')) console.log(JSON.stringify(report, null, 2));
  else printHuman(report);
  process.exitCode = report.verdict === 'GO' ? 0 : 1;
}
