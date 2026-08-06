// GENERATED FILE — DO NOT EDIT DIRECTLY.
// Source (concatenated, in dependency order):
//   · src/lib/calendarDate.js
//   · src/lib/eclSerialize.js
//   · src/lib/normalizedEvidence.js
//   · src/lib/confidenceResult.js
//   · src/lib/eclGates.js
// Regenerate: npm run ecl:generate  ·  Drift check: npm run ecl:check
//
// This is the BACKEND artifact of the ECL P2 domain contracts. It is not a
// second implementation: every function below is generated verbatim from the
// canonical frontend modules, so frontend and backend cannot diverge.
// ──── src/lib/calendarDate.js ────
// v62 C5 — real calendar-date validation.
//
// A regex on /^\d{4}-\d{2}-\d{2}$/ accepts 2026-99-99 and 2026-02-30: it checks
// SHAPE, not existence. This helper parses the value as a UTC date and requires
// a byte-identical round-trip, so only dates that actually exist pass.
const SHAPE = /^\d{4}-\d{2}-\d{2}$/;

export function isCalendarDate(value) {
  if (typeof value !== "string" || !SHAPE.test(value)) return false;
  const d = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return false;
  // Round-trip: JS rolls 2026-02-30 over to 2026-03-02, so the ISO prefix of the
  // parsed date differs from the input whenever the date does not exist.
  return d.toISOString().slice(0, 10) === value;
}

export const CALENDAR_DATE_MESSAGE =
  "must be a real calendar date in YYYY-MM-DD form (UTC)";

// ──── src/lib/eclSerialize.js ────
// v62.4 — ECL P2: deterministic serialization, hashing and real deep freezing.
//
// CANONICAL implementation. The backend artifact base44/shared/generated/
// eclDomain.ts is GENERATED from this file (npm run ecl:generate), so there is
// exactly one implementation of these semantics in the repo.
//
// SHA-256 is implemented here in pure JS on purpose: node:crypto does not exist
// in the browser and WebCrypto is async, so importing either would make the
// frontend and the backend structurally different. A shared synchronous
// implementation is what makes "same result → same hash" provable across both.

/**
 * REAL deep freeze — Object.freeze is shallow, so a frozen envelope with a live
 * array inside is still mutable and would silently let a caller rewrite
 * evidence. Walks arrays, plain objects and nested combinations, and tolerates
 * cycles.
 */
export function deepFreeze(value, seen) {
  const visited = seen || new Set();
  if (value === null || typeof value !== "object") return value;
  if (visited.has(value)) return value;
  visited.add(value);
  Object.freeze(value);
  if (Array.isArray(value)) {
    for (const item of value) deepFreeze(item, visited);
    return value;
  }
  for (const key of Object.keys(value)) deepFreeze(value[key], visited);
  return value;
}

const ISO_DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/;

/**
 * Normalize a value for serialization: Date → ISO, ISO-ish datetime string →
 * canonical ISO (so "2026-08-06T10:00+02:00" and its UTC equivalent serialize
 * identically), everything else untouched. Plain calendar dates (YYYY-MM-DD)
 * are deliberately NOT widened into datetimes: that would invent a time.
 */
function normalizeScalar(value) {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
  if (typeof value === "string" && ISO_DATETIME.test(value)) {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? value : d.toISOString();
  }
  if (typeof value === "number" && !Number.isFinite(value)) return null;
  if (value === undefined) return null;
  return value;
}

function canonical(value) {
  if (value === null || typeof value !== "object") return normalizeScalar(value);
  if (value instanceof Date) return normalizeScalar(value);
  // Arrays keep their order: order is semantic in this model (reminder ladders,
  // rule sequences), so sorting them would destroy meaning, not normalize it.
  if (Array.isArray(value)) return value.map(canonical);
  const out = {};
  for (const key of Object.keys(value).sort()) {
    if (value[key] === undefined) continue;
    out[key] = canonical(value[key]);
  }
  return out;
}

/** Recursively key-sorted, date-normalized JSON. Same content → same string. */
export function stableSerialize(result) {
  return JSON.stringify(canonical(result));
}

// ── SHA-256 (pure, synchronous, isomorphic) ─────────────────────────────
const K = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];

const rotr = (x, n) => (x >>> n) | (x << (32 - n));

function utf8Bytes(str) {
  const out = [];
  for (let i = 0; i < str.length; i++) {
    let c = str.charCodeAt(i);
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else if (c >= 0xd800 && c <= 0xdbff) {
      const c2 = str.charCodeAt(++i);
      c = 0x10000 + ((c & 0x3ff) << 10) + (c2 & 0x3ff);
      out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    } else out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
  }
  return out;
}

/** SHA-256 of a UTF-8 string, lowercase hex. */
export function sha256Hex(input) {
  const bytes = utf8Bytes(String(input));
  const bitLen = bytes.length * 8;
  bytes.push(0x80);
  while (bytes.length % 64 !== 56) bytes.push(0);
  // 64-bit big-endian length (high word is 0 for any realistic payload here).
  for (let i = 0; i < 4; i++) bytes.push(0);
  bytes.push((bitLen >>> 24) & 255, (bitLen >>> 16) & 255, (bitLen >>> 8) & 255, bitLen & 255);

  const H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
  const w = new Array(64);
  for (let off = 0; off < bytes.length; off += 64) {
    for (let i = 0; i < 16; i++) {
      const j = off + i * 4;
      w[i] = ((bytes[j] << 24) | (bytes[j + 1] << 16) | (bytes[j + 2] << 8) | bytes[j + 3]) >>> 0;
    }
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, h] = H;
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (h + S1 + ch + K[i] + w[i]) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const mj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + mj) >>> 0;
      h = g; g = f; f = e; e = (d + t1) >>> 0;
      d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    H[0] = (H[0] + a) >>> 0; H[1] = (H[1] + b) >>> 0; H[2] = (H[2] + c) >>> 0; H[3] = (H[3] + d) >>> 0;
    H[4] = (H[4] + e) >>> 0; H[5] = (H[5] + f) >>> 0; H[6] = (H[6] + g) >>> 0; H[7] = (H[7] + h) >>> 0;
  }
  return H.map((x) => x.toString(16).padStart(8, "0")).join("");
}

/** SHA-256 of stableSerialize(result). Semantic change → different hash. */
export function hashConfidenceResult(result) {
  return sha256Hex(stableSerialize(result));
}

// ──── src/lib/normalizedEvidence.js ────
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

// ──── src/lib/confidenceResult.js ────
// v62.4 — ECL P2: the ConfidenceResult CONTRACT (canonical, pure).
//
// This file defines the SHAPE of a confidence result and the authoritative
// enums it may use. It deliberately does NOT compute confidence: the rules
// (P-01…P-08) belong to a later phase, and the policy-dependent evaluation
// (gates, freeze eligibility, finalization) lives in ./eclGates.js — which
// imports from here, never the other way round, so the layering stays acyclic.
//
// NO `score` FIELD. The parser produces aggregates; a numeric score over
// aggregates would project a precision the evidence does not contain. The
// contract carries a categorical level plus the rules that passed and failed.
//
// base44/shared/generated/eclDomain.ts is GENERATED from this file.


export const CONFIDENCE_LEVELS = ["high", "medium", "low", "unknown"];

export const EVIDENCE_STATUSES = [
  "pending",
  "processing",
  "estimated",
  "accepted_provisionally",
  "verified",
  "rejected",
  "expired",
  "superseded",
  "under_review",
];

export const VERIFICATION_METHODS = ["independent_api", "independent_document", "attested_only", "none"];

export const FREEZE_ELIGIBILITY = ["eligible", "conditionally_eligible", "not_eligible"];

export const SOURCE_TYPES = [
  "api",
  "provider_statement",
  "bank_statement",
  "commerce_export",
  "accounting_export",
  "fec",
  "manual_declaration",
];

// The exact field set of a finalized ConfidenceResult, in contract order.
export const CONFIDENCE_RESULT_FIELDS = [
  "evidenceType",
  "sourceType",
  "confidenceLevel",
  "verificationMethod",
  "evidenceStatus",
  "freezeEligibility",
  "passedRules",
  "failedRules",
  "warnings",
  "missingFields",
  "invalidFields",
  "conflicts",
  "metrics",
  "period",
  "provenance",
  "expiresAt",
  "reviewRequired",
  "policyVersion",
  "ruleSetVersion",
  "explanation",
];

// Fields a caller may never supply: freezeEligibility is ALWAYS derived from
// the policy + context, so accepting it from the caller would let the consumer
// of a gate decide the gate's own outcome.
export const CALLER_FORBIDDEN_FIELDS = ["freezeEligibility"];

export class ConfidenceContractError extends Error {
  constructor(message) {
    super(message);
    this.name = "ConfidenceContractError";
  }
}

const inEnum = (list, value) => list.includes(value);
const asArray = (v) => (Array.isArray(v) ? v : []);

/**
 * Build a validated, deep-frozen ASSESSMENT: everything known about the
 * evidence except the derived verdicts. Throws when the caller supplies a
 * derived field or an out-of-enum value — a silent coercion here would produce
 * a result that looks authoritative and is not.
 */
export function makeConfidenceAssessment(fields) {
  const f = fields && typeof fields === "object" ? fields : {};

  for (const forbidden of CALLER_FORBIDDEN_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(f, forbidden)) {
      throw new ConfidenceContractError(`${forbidden} is always derived and must not be supplied by the caller`);
    }
  }
  if (!inEnum(CONFIDENCE_LEVELS, f.confidenceLevel)) {
    throw new ConfidenceContractError(`confidenceLevel must be one of ${CONFIDENCE_LEVELS.join(", ")}`);
  }
  if (!inEnum(EVIDENCE_STATUSES, f.evidenceStatus)) {
    throw new ConfidenceContractError(`evidenceStatus must be one of ${EVIDENCE_STATUSES.join(", ")}`);
  }
  if (!inEnum(VERIFICATION_METHODS, f.verificationMethod)) {
    throw new ConfidenceContractError(`verificationMethod must be one of ${VERIFICATION_METHODS.join(", ")}`);
  }
  if (f.sourceType !== undefined && f.sourceType !== null && !inEnum(SOURCE_TYPES, f.sourceType)) {
    throw new ConfidenceContractError(`sourceType must be one of ${SOURCE_TYPES.join(", ")}`);
  }

  return deepFreeze({
    evidenceType: f.evidenceType === undefined ? null : f.evidenceType,
    sourceType: f.sourceType === undefined ? null : f.sourceType,
    confidenceLevel: f.confidenceLevel,
    verificationMethod: f.verificationMethod,
    evidenceStatus: f.evidenceStatus,
    passedRules: [...asArray(f.passedRules)],
    // failedRules entries are { id, detail }: an id alone cannot be explained
    // to a merchant, and a free-text reason alone cannot be reasoned about.
    failedRules: asArray(f.failedRules).map((r) => ({
      id: String(r && r.id),
      detail: r && r.detail === undefined ? "" : String(r && r.detail),
    })),
    warnings: [...asArray(f.warnings)],
    missingFields: [...asArray(f.missingFields)],
    invalidFields: asArray(f.invalidFields).map((v) => (typeof v === "object" && v !== null ? { ...v } : v)),
    conflicts: asArray(f.conflicts).map((v) => (typeof v === "object" && v !== null ? { ...v } : v)),
    metrics: f.metrics && typeof f.metrics === "object" ? { ...f.metrics } : {},
    period: f.period && typeof f.period === "object" ? { ...f.period } : { periodStart: null, periodEnd: null, coverageDays: null },
    provenance: f.provenance && typeof f.provenance === "object" ? { ...f.provenance } : {},
    expiresAt: f.expiresAt === undefined ? null : f.expiresAt,
    reviewRequired: f.reviewRequired === true,
    ruleSetVersion: f.ruleSetVersion === undefined ? null : f.ruleSetVersion,
    explanation: {
      reason: f.explanation && f.explanation.reason ? String(f.explanation.reason) : "",
      actionsToImprove: asArray(f.explanation && f.explanation.actionsToImprove).map(String),
    },
  });
}

// ──── src/lib/eclGates.js ────
// v62.4 — ECL P2: pure gate evaluation + freeze-eligibility derivation +
// ConfidenceResult finalization (canonical).
//
// PURE. No writes, no I/O, no effects, and NO `Date.now()`: time enters
// exclusively through context.now, so an expiry decision is reproducible from
// its inputs instead of depending on when the test happened to run.
//
// WHY finalizeConfidenceResult lives HERE and not in confidenceResult.js:
// finalization needs the policy and the context (it derives freezeEligibility,
// which is a gate outcome). Putting it beside the shape definition would force
// confidenceResult.js to import this module while this module imports its
// enums — a cycle. The shape is declared there, the policy-dependent
// evaluation is declared here.
//
// base44/shared/generated/eclDomain.ts is GENERATED from this file.


export const REQUIRED_CONTEXT_KEYS = [
  "now",
  "hasAttestation",
  "hasOpenConflicts",
  "baselineLocked",
  "activeStrikeCountByScope",
  "hasBlockingReviewCase",
];

export class EclContextError extends Error {
  constructor(message) {
    super(message);
    this.name = "EclContextError";
  }
}

/**
 * The context is MANDATORY and complete-or-nothing. A missing `hasAttestation`
 * defaulting to false would look like a safe default and would in fact answer a
 * question nobody asked; a missing `now` would silently reintroduce wall-clock
 * time. Both are refused.
 */
export function assertContext(context) {
  const c = context && typeof context === "object" ? context : {};
  const missing = REQUIRED_CONTEXT_KEYS.filter((k) => c[k] === undefined || c[k] === null);
  if (missing.length) {
    throw new EclContextError(`gate context is missing required key(s): ${missing.join(", ")}`);
  }
  const t = c.now instanceof Date ? c.now.getTime() : Date.parse(String(c.now));
  if (Number.isNaN(t)) throw new EclContextError("context.now must be a Date or a parseable ISO instant");
  return { ...c, nowMs: t };
}

function confidenceRank(policy, level) {
  const order = (policy && policy.confidenceOrder) || CONFIDENCE_LEVELS;
  return order.indexOf(level);
}

function isExpired(result, nowMs) {
  if (!result.expiresAt) return false;
  const exp = Date.parse(String(result.expiresAt));
  if (Number.isNaN(exp)) return false;
  return nowMs > exp;
}

/**
 * Evaluate one policy gate against a result. Returns
 * { allowed, gateName, reasons[], policyVersion } and nothing else: no write,
 * no side effect, no partial application anywhere in the product.
 */
export function evaluateGate(gateName, result, policy, context) {
  const ctx = assertContext(context);
  const policyVersion = (policy && policy.policyVersion) || null;
  const gate = policy && policy.gates ? policy.gates[gateName] : undefined;
  const reasons = [];

  if (!gate) {
    return deepFreeze({ allowed: false, gateName, reasons: ["gate_unknown"], policyVersion });
  }

  // Non-automatable gate: forbidden means forbidden, whatever the evidence says.
  if (gate.automation === "forbidden") {
    reasons.push("automation_forbidden");
    if (gate.requiresHumanReview) reasons.push("requires_human_review");
    if (gate.manualResolution) reasons.push(`manual_resolution:${gate.manualResolution}`);
    return deepFreeze({ allowed: false, gateName, reasons, policyVersion });
  }

  if (gate.minConfidence) {
    const have = confidenceRank(policy, result.confidenceLevel);
    const need = confidenceRank(policy, gate.minConfidence);
    if (have < 0 || need < 0 || have < need) {
      reasons.push(`confidence_below_min:${result.confidenceLevel}<${gate.minConfidence}`);
    }
  }

  if (Array.isArray(gate.allowedStatuses) && !gate.allowedStatuses.includes(result.evidenceStatus)) {
    reasons.push(`status_not_allowed:${result.evidenceStatus}`);
  }

  if (Array.isArray(gate.allowedVerificationMethods) && !gate.allowedVerificationMethods.includes(result.verificationMethod)) {
    reasons.push(`verification_method_not_allowed:${result.verificationMethod}`);
  }

  if (gate.requiresNotExpired && isExpired(result, ctx.nowMs)) {
    reasons.push("evidence_expired");
  }

  if (gate.requiresAttestation && ctx.hasAttestation !== true) {
    reasons.push("attestation_missing");
  }

  if (gate.requiresNoOpenConflicts && (ctx.hasOpenConflicts === true || (Array.isArray(result.conflicts) && result.conflicts.length > 0))) {
    reasons.push("open_conflicts");
  }

  if (gate.requiresBaselineLocked && ctx.baselineLocked !== true) {
    reasons.push("baseline_not_locked");
  }

  if (gate.requiresNoBlockingReviewCase && ctx.hasBlockingReviewCase === true) {
    reasons.push("blocking_review_case");
  }

  if (typeof gate.blockingStrikeThreshold === "number") {
    const scopes = Array.isArray(gate.blockingStrikeScopes) ? gate.blockingStrikeScopes : [];
    const counts = ctx.activeStrikeCountByScope || {};
    for (const scope of scopes) {
      const n = Number(counts[scope] || 0);
      if (n >= gate.blockingStrikeThreshold) {
        reasons.push(`blocking_strikes:${scope}:${n}`);
      }
    }
  }

  return deepFreeze({ allowed: reasons.length === 0, gateName, reasons, policyVersion });
}

/**
 * Freeze eligibility is DERIVED, never declared: it is the answer to "which
 * freeze-related gate does this evidence actually pass?".
 *   freeze_baseline passes      → eligible
 *   baseline_provisional passes → conditionally_eligible
 *   otherwise                   → not_eligible
 */
export function deriveFreezeEligibility(result, policy, context) {
  if (evaluateGate("freeze_baseline", result, policy, context).allowed) return FREEZE_ELIGIBILITY[0];
  if (evaluateGate("baseline_provisional", result, policy, context).allowed) return FREEZE_ELIGIBILITY[1];
  return FREEZE_ELIGIBILITY[2];
}

/**
 * Turn an assessment into a finalized, deep-frozen ConfidenceResult. The
 * assessment may be a plain field bag (it is re-validated through
 * makeConfidenceAssessment) or an already-built assessment.
 */
export function finalizeConfidenceResult(assessment, policy, context) {
  if (assessment && Object.prototype.hasOwnProperty.call(assessment, "freezeEligibility")) {
    throw new ConfidenceContractError("freezeEligibility is always derived and must not be supplied by the caller");
  }
  const a = makeConfidenceAssessment(assessment);
  const ctx = assertContext(context);

  // A result whose expiry has passed is reported as expired here rather than
  // being left to each consumer to notice.
  const expired = isExpired(a, ctx.nowMs);
  const evidenceStatus = expired && a.evidenceStatus === "accepted_provisionally" ? "expired" : a.evidenceStatus;

  const base = { ...a, evidenceStatus };
  const freezeEligibility = deriveFreezeEligibility(base, policy, context);

  return deepFreeze({
    evidenceType: base.evidenceType,
    sourceType: base.sourceType,
    confidenceLevel: base.confidenceLevel,
    verificationMethod: base.verificationMethod,
    evidenceStatus,
    freezeEligibility,
    passedRules: [...base.passedRules],
    failedRules: base.failedRules.map((r) => ({ ...r })),
    warnings: [...base.warnings],
    missingFields: [...base.missingFields],
    invalidFields: base.invalidFields.map((v) => (typeof v === "object" && v !== null ? { ...v } : v)),
    conflicts: base.conflicts.map((v) => (typeof v === "object" && v !== null ? { ...v } : v)),
    metrics: { ...base.metrics },
    period: { ...base.period },
    provenance: { ...base.provenance },
    expiresAt: base.expiresAt,
    reviewRequired: base.reviewRequired === true || expired,
    policyVersion: (policy && policy.policyVersion) || null,
    ruleSetVersion: base.ruleSetVersion,
    explanation: {
      reason: base.explanation.reason,
      actionsToImprove: [...base.explanation.actionsToImprove],
    },
  });
}
