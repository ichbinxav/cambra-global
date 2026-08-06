// v62.4 — ECL P2: Normalized Evidence Model (canonical, pure).
//
// One implementation; base44/shared/generated/eclDomain.ts is GENERATED from it.
//
// WHAT THIS IS NOT: it does not score, classify or judge evidence. It states,
// in unambiguous units, WHAT was found, WHAT was missing and WHAT was invalid.
// No confidence rule, no threshold and no policy value is read here — those
// live in config/ecl-policy.json and are applied by the gate layer.
//
// GRANULARITY: the live parser (processUploadedFile) extracts AGGREGATES only
// (gross / fees / net / fee_pct / period / provider) and never individual
// transactions, so per-transaction granularity is deliberately NOT required.
// Absent aggregates are reported, not invented.

import { isCalendarDate } from "./calendarDate.js";
import { deepFreeze } from "./eclSerialize.js";

export const NORMALIZED_EVIDENCE_VERSION = "ecl-normalized-1";

export const EVIDENCE_DOMAINS = ["payments", "commerce", "accounting"];

// Metric contracts. `kind` fixes the UNIT, which is why every money field is
// named *Minor: a field called "amount" invites euros and cents to be mixed.
const PAYMENTS_METRICS = [
  { name: "grossAmountMinor", kind: "minor" },
  { name: "feesAmountMinor", kind: "minor" },
  { name: "netAmountMinor", kind: "minor" },
  { name: "feeRateBps", kind: "bps" },
  { name: "transactionCount", kind: "count" },
  { name: "refundsAmountMinor", kind: "minor" },
  { name: "chargebacksAmountMinor", kind: "minor" },
];

const COMMERCE_METRICS = [
  { name: "grossSalesAmountMinor", kind: "minor" },
  { name: "netSalesAmountMinor", kind: "minor" },
  { name: "refundsAmountMinor", kind: "minor" },
  { name: "orderCount", kind: "count" },
];

export const METRIC_CONTRACTS = {
  payments: PAYMENTS_METRICS,
  commerce: COMMERCE_METRICS,
};

// Major-unit aliases that must NEVER be silently converted: seeing "grossAmount"
// (euros?) does not license multiplying by 100. The value is ignored and the
// minor field is reported missing, with a warning naming the ignored input.
const MAJOR_UNIT_ALIASES = {
  grossAmountMinor: ["grossAmount", "gross", "grossEur"],
  feesAmountMinor: ["feesAmount", "fees", "feesEur"],
  netAmountMinor: ["netAmount", "net", "netEur"],
  refundsAmountMinor: ["refundsAmount", "refunds", "refundsEur"],
  chargebacksAmountMinor: ["chargebacksAmount", "chargebacks"],
  grossSalesAmountMinor: ["grossSales", "grossSalesAmount"],
  netSalesAmountMinor: ["netSales", "netSalesAmount"],
  amountMinor: ["amount", "amountEur"],
};

const CURRENCY_SHAPE = /^[A-Z]{3}$/;

const isAbsent = (v) => v === undefined || v === null || v === "";

function validateMetric(kind, value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "not_a_finite_number";
  if (value < 0) return "negative";
  if ((kind === "minor" || kind === "count" || kind === "bps") && !Number.isInteger(value)) {
    return kind === "minor" ? "minor_units_must_be_integer" : "must_be_integer";
  }
  return null;
}

function readMetrics(contract, input, missingFields, invalidFields, warnings) {
  const metrics = {};
  for (const { name, kind } of contract) {
    const raw = input[name];
    if (isAbsent(raw)) {
      missingFields.push(name);
      for (const alias of MAJOR_UNIT_ALIASES[name] || []) {
        if (!isAbsent(input[alias])) {
          warnings.push(`${alias} present but ignored: major-unit value cannot be converted to ${name} without an explicit unit`);
        }
      }
      continue;
    }
    const problem = validateMetric(kind, raw);
    if (problem) {
      invalidFields.push({ field: name, reason: problem });
      continue;
    }
    metrics[name] = raw;
  }
  return metrics;
}

function readPeriod(input, invalidFields, missingFields) {
  const out = { periodStart: null, periodEnd: null, coverageDays: null };
  const start = input.periodStart;
  const end = input.periodEnd;
  let startOk = false;
  let endOk = false;

  if (isAbsent(start)) missingFields.push("periodStart");
  else if (!isCalendarDate(start)) invalidFields.push({ field: "periodStart", reason: "not_a_real_calendar_date" });
  else startOk = true;

  if (isAbsent(end)) missingFields.push("periodEnd");
  else if (!isCalendarDate(end)) invalidFields.push({ field: "periodEnd", reason: "not_a_real_calendar_date" });
  else endOk = true;

  if (startOk && endOk) {
    const s = Date.parse(`${start}T00:00:00.000Z`);
    const e = Date.parse(`${end}T00:00:00.000Z`);
    if (e < s) {
      // An inverted range is not a coverage of -3 days; both bounds are invalid.
      invalidFields.push({ field: "periodStart", reason: "period_inverted" });
      invalidFields.push({ field: "periodEnd", reason: "period_inverted" });
      return out;
    }
    out.periodStart = start;
    out.periodEnd = end;
    // Inclusive: a statement covering 01→31 August covers 31 days, not 30.
    out.coverageDays = Math.round((e - s) / 86400000) + 1;
  }
  return out;
}

function readCurrency(input, missingFields, invalidFields) {
  const raw = input.currency;
  if (isAbsent(raw)) {
    // No default: guessing EUR would fabricate the unit of every figure.
    missingFields.push("currency");
    return null;
  }
  if (typeof raw !== "string" || !CURRENCY_SHAPE.test(raw)) {
    invalidFields.push({ field: "currency", reason: "not_an_iso4217_alpha3_uppercase_code" });
    return null;
  }
  return raw;
}

function envelope(domain, input, metrics, period, currency, missingFields, invalidFields, warnings) {
  return deepFreeze({
    normalizedVersion: NORMALIZED_EVIDENCE_VERSION,
    domain,
    evidenceType: isAbsent(input.evidenceType) ? null : String(input.evidenceType),
    sourceType: isAbsent(input.sourceType) ? null : String(input.sourceType),
    currency,
    periodStart: period.periodStart,
    periodEnd: period.periodEnd,
    coverageDays: period.coverageDays,
    checksum: isAbsent(input.checksum) ? null : String(input.checksum),
    importId: isAbsent(input.importId) ? null : String(input.importId),
    parserVersion: isAbsent(input.parserVersion) ? null : String(input.parserVersion),
    metrics,
    missingFields: [...missingFields],
    invalidFields: [...invalidFields],
    normalizationWarnings: [...warnings],
  });
}

function normalizeAggregate(domain, input) {
  const src = input && typeof input === "object" ? input : {};
  const missingFields = [];
  const invalidFields = [];
  const warnings = [];
  for (const key of ["evidenceType", "sourceType", "checksum", "importId", "parserVersion"]) {
    if (isAbsent(src[key])) missingFields.push(key);
  }
  const currency = readCurrency(src, missingFields, invalidFields);
  const period = readPeriod(src, invalidFields, missingFields);
  const metrics = readMetrics(METRIC_CONTRACTS[domain], src, missingFields, invalidFields, warnings);
  return envelope(domain, src, metrics, period, currency, missingFields, invalidFields, warnings);
}

/** Payments evidence (PSP statement / API aggregate). Never throws on missing data. */
export function normalizePaymentsEvidence(input) {
  return normalizeAggregate("payments", input);
}

/** Commerce evidence (store export aggregate). */
export function normalizeCommerceEvidence(input) {
  return normalizeAggregate("commerce", input);
}

/**
 * Accounting evidence — entry-level by nature (a ledger export IS entries), so
 * this domain carries `entries` instead of the aggregate metric contract.
 */
export function normalizeAccountingEvidence(input) {
  const src = input && typeof input === "object" ? input : {};
  const missingFields = [];
  const invalidFields = [];
  const warnings = [];
  for (const key of ["evidenceType", "sourceType", "checksum", "importId", "parserVersion", "sourceSoftware"]) {
    if (isAbsent(src[key])) missingFields.push(key);
  }
  const currency = readCurrency(src, missingFields, invalidFields);
  const period = readPeriod(src, invalidFields, missingFields);

  const entries = [];
  if (isAbsent(src.entries)) {
    missingFields.push("entries");
  } else if (!Array.isArray(src.entries)) {
    invalidFields.push({ field: "entries", reason: "not_an_array" });
  } else {
    src.entries.forEach((raw, i) => {
      const e = raw && typeof raw === "object" ? raw : {};
      const problem = validateMetric("minor", e.amountMinor);
      if (isAbsent(e.amountMinor)) {
        missingFields.push(`entries[${i}].amountMinor`);
        for (const alias of MAJOR_UNIT_ALIASES.amountMinor) {
          if (!isAbsent(e[alias])) {
            warnings.push(`entries[${i}].${alias} present but ignored: major-unit value cannot be converted without an explicit unit`);
          }
        }
        return;
      }
      if (problem) {
        invalidFields.push({ field: `entries[${i}].amountMinor`, reason: problem });
        return;
      }
      if (isAbsent(e.accountCode)) missingFields.push(`entries[${i}].accountCode`);
      if (isAbsent(e.entryPeriod)) missingFields.push(`entries[${i}].entryPeriod`);
      entries.push({
        amountMinor: e.amountMinor,
        accountCode: isAbsent(e.accountCode) ? null : String(e.accountCode),
        entryPeriod: isAbsent(e.entryPeriod) ? null : String(e.entryPeriod),
      });
    });
  }

  return deepFreeze({
    normalizedVersion: NORMALIZED_EVIDENCE_VERSION,
    domain: "accounting",
    evidenceType: isAbsent(src.evidenceType) ? null : String(src.evidenceType),
    sourceType: isAbsent(src.sourceType) ? null : String(src.sourceType),
    sourceSoftware: isAbsent(src.sourceSoftware) ? null : String(src.sourceSoftware),
    currency,
    periodStart: period.periodStart,
    periodEnd: period.periodEnd,
    coverageDays: period.coverageDays,
    checksum: isAbsent(src.checksum) ? null : String(src.checksum),
    importId: isAbsent(src.importId) ? null : String(src.importId),
    parserVersion: isAbsent(src.parserVersion) ? null : String(src.parserVersion),
    entries,
    metrics: {},
    missingFields: [...missingFields],
    invalidFields: [...invalidFields],
    normalizationWarnings: [...warnings],
  });
}