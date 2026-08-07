// GENERATED FILE — DO NOT EDIT DIRECTLY.
// Source (concatenated, in dependency order):
//   · src/lib/calendarDate.js
//   · src/lib/eclSerialize.js
//   · src/lib/normalizedEvidence.js
//   · src/lib/confidenceResult.js
//   · src/lib/eclGates.js
//   · src/lib/eclLifecycle.js
//   · src/lib/eclReconcile.js
//   · src/lib/eclStrikes.js
//   · src/lib/eclEngine.js
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
export function deepFreeze(value, seen = undefined) {
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

// ──── src/lib/eclLifecycle.js ────
// v62.5 — ECL P3: evidence lifecycle state machine (canonical, pure).
//
// PURE. No I/O, no writes, and NO wall clock: every time-dependent decision
// takes an injected instant. This module owns the TRANSITION GRAPH over the
// P2 evidence statuses (confidenceResult.EVIDENCE_STATUSES — reused, never
// redeclared) and produces EvidenceLifecycleEvent RECORD INTENTS matching the
// P1 schema exactly. It never persists anything: handlers do, idempotently,
// keyed on the deterministic idempotency_key computed here.
//
// base44/shared/generated/eclDomain.ts is GENERATED from this file.


export const ECL_LIFECYCLE_VERSION = "ecl-lifecycle-1";

export const LIFECYCLE_ACTORS = ["system", "user", "reviewer"];

export const EVIDENCE_ENTITY_TYPES = ["statement_import", "savings_evidence"];

// Terminal: a superseded record is history; new facts create NEW records.
export const TERMINAL_STATUSES = ["superseded"];

// The declared transition graph. Anything not literally listed is illegal —
// the engine routes illegal targets to under_review, never forces them.
export const LIFECYCLE_TRANSITIONS = deepFreeze({
  pending: ["processing", "estimated", "accepted_provisionally", "verified", "under_review", "rejected", "superseded"],
  processing: ["estimated", "accepted_provisionally", "verified", "under_review", "rejected", "superseded"],
  estimated: ["accepted_provisionally", "verified", "under_review", "superseded", "rejected"],
  accepted_provisionally: ["verified", "expired", "under_review", "superseded", "rejected"],
  verified: ["under_review", "superseded"],
  expired: ["under_review", "superseded", "rejected"],
  under_review: ["estimated", "accepted_provisionally", "verified", "rejected", "superseded"],
  rejected: ["superseded"],
  superseded: [],
});

export class EclLifecycleError extends Error {
  constructor(message) {
    super(message);
    this.name = "EclLifecycleError";
  }
}

const lcRequire = (cond, msg) => {
  if (!cond) throw new EclLifecycleError(msg);
};
const lcNonEmpty = (v) => typeof v === "string" && v.length > 0;

export function assertLifecycleStatus(status) {
  lcRequire(EVIDENCE_STATUSES.includes(status), `unknown evidence status: ${String(status)}`);
  return status;
}

export function isTerminalStatus(status) {
  return TERMINAL_STATUSES.includes(status);
}

export function canTransition(fromStatus, toStatus) {
  assertLifecycleStatus(fromStatus);
  assertLifecycleStatus(toStatus);
  return (LIFECYCLE_TRANSITIONS[fromStatus] || []).includes(toStatus);
}

/** Deterministic idempotency key over a stable-serialized part bag. */
export function lifecycleIdempotencyKey(parts) {
  return `eclp3:${sha256Hex(stableSerialize(parts)).slice(0, 40)}`;
}

/**
 * Build one EvidenceLifecycleEvent record intent. from === to is an IDEMPOTENT
 * NO-OP ({ changed: false }, no record) — replaying a decision must never
 * append a duplicate event. An illegal transition THROWS here: the caller
 * (engine) decides the fail-closed rerouting, this module never invents one.
 */
export function buildLifecycleTransition(input) {
  const i = input && typeof input === "object" ? input : {};
  lcRequire(EVIDENCE_ENTITY_TYPES.includes(i.evidenceEntityType), `evidenceEntityType must be one of ${EVIDENCE_ENTITY_TYPES.join(", ")}`);
  lcRequire(lcNonEmpty(i.evidenceId), "evidenceId is required");
  lcRequire(lcNonEmpty(i.brandId), "brandId is required");
  lcRequire(lcNonEmpty(i.ownerEmail), "ownerEmail is required");
  lcRequire(lcNonEmpty(i.event), "event is required");
  lcRequire(lcNonEmpty(i.correlationId), "correlationId is required");
  lcRequire(LIFECYCLE_ACTORS.includes(i.actor), `actor must be one of ${LIFECYCLE_ACTORS.join(", ")}`);
  assertLifecycleStatus(i.fromStatus);
  assertLifecycleStatus(i.toStatus);

  const idempotencyKey = lifecycleIdempotencyKey({
    kind: "lifecycle_event",
    evidenceEntityType: i.evidenceEntityType,
    evidenceId: i.evidenceId,
    fromStatus: i.fromStatus,
    toStatus: i.toStatus,
    event: i.event,
    correlationId: i.correlationId,
  });

  if (i.fromStatus === i.toStatus) {
    return deepFreeze({ changed: false, fromStatus: i.fromStatus, toStatus: i.toStatus, event: i.event, idempotencyKey, record: null });
  }
  lcRequire(!isTerminalStatus(i.fromStatus), `status ${i.fromStatus} is terminal: new facts require a new record`);
  lcRequire(
    canTransition(i.fromStatus, i.toStatus),
    `illegal transition ${i.fromStatus} → ${i.toStatus} (allowed: ${(LIFECYCLE_TRANSITIONS[i.fromStatus] || []).join(", ") || "none"})`,
  );

  return deepFreeze({
    changed: true,
    fromStatus: i.fromStatus,
    toStatus: i.toStatus,
    event: i.event,
    idempotencyKey,
    record: {
      evidence_entity_type: i.evidenceEntityType,
      evidence_id: i.evidenceId,
      brand_id: i.brandId,
      owner_email: i.ownerEmail,
      from_status: i.fromStatus,
      to_status: i.toStatus,
      event: i.event,
      actor: i.actor,
      correlation_id: i.correlationId,
      idempotency_key: idempotencyKey,
      payload: i.payload && typeof i.payload === "object" ? { ...i.payload } : {},
    },
  });
}

/**
 * Provisional expiry, derived EXCLUSIVELY from the policy window. No fallback
 * constant: a policy without a valid provisionalDays is refused, never patched.
 */
export function deriveProvisionalExpiry(provisionalStartedAt, policy) {
  const t = Date.parse(String(provisionalStartedAt));
  lcRequire(!Number.isNaN(t), "provisionalStartedAt must be a parseable instant");
  const days = policy && policy.windows ? policy.windows.provisionalDays : undefined;
  lcRequire(Number.isInteger(days) && days > 0, "policy.windows.provisionalDays must be a positive integer (no fallback)");
  return new Date(t + days * 86400000).toISOString();
}

/**
 * Resolve whether a provisional acceptance has lapsed at the injected instant.
 * Returns { lapsed, expiresAt, ambiguous }: ambiguous=true means the record is
 * accepted_provisionally but carries NO recoverable window — the engine must
 * route that to review, never assume it is still valid.
 */
export function resolveExpiry(state, policy, context) {
  const s = state && typeof state === "object" ? state : {};
  const nowMs = Date.parse(String(context && context.now));
  lcRequire(!Number.isNaN(nowMs), "context.now must be a parseable instant");
  if (s.status !== "accepted_provisionally") {
    return deepFreeze({ lapsed: false, expiresAt: s.expiresAt || null, ambiguous: false });
  }
  let exp = null;
  if (s.expiresAt && !Number.isNaN(Date.parse(String(s.expiresAt)))) {
    exp = new Date(Date.parse(String(s.expiresAt))).toISOString();
  } else if (s.provisionalStartedAt && !Number.isNaN(Date.parse(String(s.provisionalStartedAt)))) {
    exp = deriveProvisionalExpiry(s.provisionalStartedAt, policy);
  }
  if (!exp) return deepFreeze({ lapsed: false, expiresAt: null, ambiguous: true });
  return deepFreeze({ lapsed: nowMs > Date.parse(exp), expiresAt: exp, ambiguous: false });
}

// ── EvidenceAttestation record intent ────────────────────────────────────
export const ATTESTATION_LANGUAGES = ["es", "fr", "en"];

/**
 * Build an EvidenceAttestation record intent (P1 schema, unchanged). The legal
 * text hash is computed HERE from the exact text shown, so a later template
 * edit can never be retro-attributed. ip/ua HMACs are deliberately NOT set by
 * this pure function: absent honest evidence beats fabricated digests.
 */
export function buildAttestationIntent(input) {
  const i = input && typeof input === "object" ? input : {};
  lcRequire(lcNonEmpty(i.attestorUserId), "attestorUserId is required");
  lcRequire(lcNonEmpty(i.brandId), "brandId is required");
  lcRequire(lcNonEmpty(i.ownerEmail), "ownerEmail is required");
  lcRequire(EVIDENCE_ENTITY_TYPES.includes(i.evidenceEntityType), `evidenceEntityType must be one of ${EVIDENCE_ENTITY_TYPES.join(", ")}`);
  lcRequire(lcNonEmpty(i.evidenceId), "evidenceId is required");
  lcRequire(
    i.declaredMetrics && typeof i.declaredMetrics === "object" && Object.keys(i.declaredMetrics).length > 0,
    "declaredMetrics must be a non-empty object: an attestation without figures asserts nothing",
  );
  lcRequire(lcNonEmpty(i.legalTextVersion), "legalTextVersion is required");
  lcRequire(lcNonEmpty(i.legalText), "legalText (the exact text shown) is required");
  lcRequire(ATTESTATION_LANGUAGES.includes(i.language), `language must be one of ${ATTESTATION_LANGUAGES.join(", ")}`);
  if (i.declaredPeriodStart !== undefined && i.declaredPeriodStart !== null) {
    lcRequire(isCalendarDate(i.declaredPeriodStart), "declaredPeriodStart must be a real calendar date");
  }
  if (i.declaredPeriodEnd !== undefined && i.declaredPeriodEnd !== null) {
    lcRequire(isCalendarDate(i.declaredPeriodEnd), "declaredPeriodEnd must be a real calendar date");
  }

  const legalTextHash = sha256Hex(i.legalText);
  const idempotencyKey = lifecycleIdempotencyKey({
    kind: "attestation",
    evidenceEntityType: i.evidenceEntityType,
    evidenceId: i.evidenceId,
    attestorUserId: i.attestorUserId,
    legalTextHash,
    language: i.language,
    declaredMetrics: i.declaredMetrics,
  });

  const record = {
    attestor_user_id: i.attestorUserId,
    brand_id: i.brandId,
    owner_email: i.ownerEmail,
    evidence_entity_type: i.evidenceEntityType,
    evidence_id: i.evidenceId,
    declared_metrics: { ...i.declaredMetrics },
    legal_text_version: i.legalTextVersion,
    legal_text_hash: legalTextHash,
    language: i.language,
    idempotency_key: idempotencyKey,
  };
  if (i.declaredPeriodStart) record.declared_period_start = i.declaredPeriodStart;
  if (i.declaredPeriodEnd) record.declared_period_end = i.declaredPeriodEnd;
  if (lcNonEmpty(i.declaredSource)) record.declared_source = i.declaredSource;
  if (lcNonEmpty(i.evidenceChecksum)) record.evidence_checksum = i.evidenceChecksum;

  return deepFreeze({ legalTextHash, idempotencyKey, record });
}

// ──── src/lib/eclReconcile.js ────
// v62.5 — ECL P3: reconciliation of new vs existing evidence (canonical, pure).
//
// Deterministic deduplication + contradiction detection. This module states
// FACTS about how the new evidence relates to the existing set; the ENGINE
// (eclEngine.js) decides what those facts mean for the lifecycle. Tolerances
// come EXCLUSIVELY from the ECL policy — no fallback constant lives here, and
// an unreadable policy value is refused, never patched.
//
// base44/shared/generated/eclDomain.ts is GENERATED from this file.


export const ECL_RECONCILE_VERSION = "ecl-reconcile-1";

// Statuses whose records still SPEAK for the merchant. rejected/superseded
// evidence is history: it can still be recognized (checksum replay) but never
// contradicts or gets superseded again.
export const RECONCILE_LIVE_STATUSES = [
  "pending",
  "processing",
  "estimated",
  "accepted_provisionally",
  "verified",
  "under_review",
  "expired",
];

export class EclReconcileError extends Error {
  constructor(message) {
    super(message);
    this.name = "EclReconcileError";
  }
}

const rcRequire = (cond, msg) => {
  if (!cond) throw new EclReconcileError(msg);
};

/** |a−b| relative to the larger magnitude, in percent. Both zero → 0. */
export function relativeDeltaPct(a, b) {
  const base = Math.max(Math.abs(a), Math.abs(b));
  if (base === 0) return 0;
  return (Math.abs(a - b) / base) * 100;
}

const rcDateMs = (v) => {
  if (v === null || v === undefined || v === "") return null;
  const t = Date.parse(`${String(v)}T00:00:00.000Z`);
  return Number.isNaN(t) ? null : t;
};

export function periodsEqual(a, b) {
  return (
    a.periodStart !== null && a.periodStart !== undefined &&
    a.periodEnd !== null && a.periodEnd !== undefined &&
    a.periodStart === b.periodStart && a.periodEnd === b.periodEnd
  );
}

export function periodsOverlap(a, b) {
  const aS = rcDateMs(a.periodStart);
  const aE = rcDateMs(a.periodEnd);
  const bS = rcDateMs(b.periodStart);
  const bE = rcDateMs(b.periodEnd);
  if (aS === null || aE === null || bS === null || bE === null) return false;
  return aS <= bE && bS <= aE;
}

const GROSS_FIELD_BY_DOMAIN = { payments: "grossAmountMinor", commerce: "grossSalesAmountMinor" };

function rcSharedMetricDeltas(aMetrics, bMetrics) {
  const deltas = [];
  const a = aMetrics || {};
  const b = bMetrics || {};
  for (const key of Object.keys(a)) {
    if (b[key] === undefined) continue;
    const deltaPct = relativeDeltaPct(a[key], b[key]);
    if (deltaPct > 0) deltas.push({ field: key, a: a[key], b: b[key], deltaPct: Math.round(deltaPct * 100) / 100 });
  }
  return deltas;
}

/**
 * Reconcile ONE new normalized evidence against the existing set.
 *   evidence — a NormalizedEvidence envelope (domain, checksum, importId,
 *              periodStart/End, currency, metrics).
 *   existing — [{ id, status, evidence }] where `evidence` carries at least
 *              the same envelope fields for the prior record.
 * Returns deep-frozen FACTS:
 *   duplicates      [{ existingId, reason, live }]
 *   supersedes      [{ existingId, reason }]           (live records only)
 *   contradictions  [{ existingId, code, detail, deltaPct? }]
 *   crossChecks     [{ existingId, deltaPct, withinTolerance }]
 *   ambiguities     [{ existingId, code }]              (fail-closed → review)
 */
export function reconcileEvidence(evidence, existing, policy) {
  rcRequire(evidence && typeof evidence === "object" && typeof evidence.domain === "string", "evidence must be a normalized envelope with a domain");
  rcRequire(Array.isArray(existing), "existing must be an array (pass [] when there is none)");
  const tolerancePct = policy && policy.reconciliation ? policy.reconciliation.commerceVsPaymentsMaxDeltaPct : undefined;
  rcRequire(
    typeof tolerancePct === "number" && Number.isFinite(tolerancePct) && tolerancePct >= 0 && tolerancePct <= 100,
    "policy.reconciliation.commerceVsPaymentsMaxDeltaPct must be a number in [0,100] (no fallback)",
  );

  const duplicates = [];
  const supersedes = [];
  const contradictions = [];
  const crossChecks = [];
  const ambiguities = [];

  for (const ex of existing) {
    if (!ex || typeof ex !== "object" || !ex.id || !ex.evidence || typeof ex.evidence !== "object") {
      ambiguities.push({ existingId: (ex && ex.id) || null, code: "existing_entry_unreadable" });
      continue;
    }
    const live = RECONCILE_LIVE_STATUSES.includes(ex.status);
    const old = ex.evidence;
    const sameDomain = old.domain === evidence.domain;

    // Exact byte-identity replay — recognized against live AND historical rows.
    if (sameDomain && evidence.checksum && old.checksum && evidence.checksum === old.checksum) {
      duplicates.push({ existingId: ex.id, reason: "checksum_match", live });
      continue;
    }

    if (sameDomain && live) {
      // A corrected re-import of the same logical source: supersede, never edit.
      if (evidence.importId && old.importId && evidence.importId === old.importId && evidence.checksum !== old.checksum) {
        supersedes.push({ existingId: ex.id, reason: "same_import_corrected" });
        continue;
      }
      if (periodsEqual(evidence, old) && evidence.sourceType && evidence.sourceType === old.sourceType) {
        if (evidence.currency && old.currency && evidence.currency !== old.currency) {
          contradictions.push({
            existingId: ex.id,
            code: "currency_mismatch",
            detail: `${old.currency} vs ${evidence.currency} for the same period and source`,
          });
          continue;
        }
        const deltas = rcSharedMetricDeltas(evidence.metrics, old.metrics);
        if (deltas.length === 0) {
          supersedes.push({ existingId: ex.id, reason: "same_period_re_export" });
        } else {
          const worst = deltas.reduce((m, d) => (d.deltaPct > m.deltaPct ? d : m), deltas[0]);
          contradictions.push({
            existingId: ex.id,
            code: "same_period_metric_mismatch",
            detail: `${worst.field}: ${worst.b} vs ${worst.a}`,
            deltaPct: worst.deltaPct,
          });
        }
        continue;
      }
      if (periodsOverlap(evidence, old) && evidence.sourceType && evidence.sourceType === old.sourceType && !periodsEqual(evidence, old)) {
        // A partial overlap cannot be resolved deterministically — review it.
        ambiguities.push({ existingId: ex.id, code: "overlapping_period_ambiguous" });
        continue;
      }
    }

    // Cross-domain check: commerce gross vs payments gross for the same period.
    if (!sameDomain && live && GROSS_FIELD_BY_DOMAIN[evidence.domain] && GROSS_FIELD_BY_DOMAIN[old.domain]) {
      if (periodsEqual(evidence, old)) {
        if (evidence.currency && old.currency && evidence.currency !== old.currency) {
          ambiguities.push({ existingId: ex.id, code: "cross_domain_currency_mismatch" });
          continue;
        }
        const mine = (evidence.metrics || {})[GROSS_FIELD_BY_DOMAIN[evidence.domain]];
        const theirs = (old.metrics || {})[GROSS_FIELD_BY_DOMAIN[old.domain]];
        if (typeof mine === "number" && typeof theirs === "number") {
          const deltaPct = Math.round(relativeDeltaPct(mine, theirs) * 100) / 100;
          const withinTolerance = deltaPct <= tolerancePct;
          crossChecks.push({ existingId: ex.id, deltaPct, withinTolerance });
          if (!withinTolerance) {
            contradictions.push({
              existingId: ex.id,
              code: "commerce_vs_payments_delta_exceeded",
              detail: `gross delta ${deltaPct}% exceeds tolerance ${tolerancePct}%`,
              deltaPct,
            });
          }
        }
      }
    }
  }

  return deepFreeze({
    reconcileVersion: ECL_RECONCILE_VERSION,
    duplicates,
    supersedes,
    contradictions,
    crossChecks,
    ambiguities,
  });
}

// ──── src/lib/eclStrikes.js ────
// v62.5 — ECL P3: functional strikes (canonical, pure).
//
// Strike ISSUANCE and COUNTING per the ECL policy. Scoped per domain (a
// payments strike never blocks accounting), time-boxed by policy.strikes
// .windowDays (no fallback constant), withdrawable (withdrawn_at makes a row
// inactive without deleting it). The two-strike CONSEQUENCE stays where P2 put
// it: the create_invoice gate reads activeStrikeCountByScope — this module
// only produces honest counts and record intents matching the P1 schema.
//
// base44/shared/generated/eclDomain.ts is GENERATED from this file.


export const ECL_STRIKES_VERSION = "ecl-strikes-1";

export const STRIKE_SCOPES = ["payments", "commerce", "accounting"];

export class EclStrikeError extends Error {
  constructor(message) {
    super(message);
    this.name = "EclStrikeError";
  }
}

const skRequire = (cond, msg) => {
  if (!cond) throw new EclStrikeError(msg);
};
const skNonEmpty = (v) => typeof v === "string" && v.length > 0;

export function strikeScopeForDomain(domain) {
  skRequire(STRIKE_SCOPES.includes(domain), `no strike scope for domain: ${String(domain)}`);
  return domain;
}

/**
 * A strike counts only while: not withdrawn AND expires_at is in the future.
 * An UNREADABLE expiry does NOT count — a sanction that cannot prove its own
 * validity window must never punish a merchant.
 */
export function isStrikeActive(strike, nowMs) {
  if (!strike || typeof strike !== "object") return false;
  if (strike.withdrawn_at) return false;
  const exp = Date.parse(String(strike.expires_at));
  if (Number.isNaN(exp)) return false;
  return exp > nowMs;
}

/** Counts by scope, every declared scope present (0 included) — the exact shape the gate context consumes. */
export function countActiveStrikesByScope(strikes, nowMs) {
  const counts = {};
  for (const scope of STRIKE_SCOPES) counts[scope] = 0;
  for (const s of Array.isArray(strikes) ? strikes : []) {
    if (!isStrikeActive(s, nowMs)) continue;
    const scope = s.scope;
    if (STRIKE_SCOPES.includes(scope)) counts[scope] += 1;
  }
  return deepFreeze(counts);
}

/** Strike expiry from the policy window ONLY — a missing windowDays is refused. */
export function deriveStrikeExpiry(now, policy) {
  const t = Date.parse(String(now));
  skRequire(!Number.isNaN(t), "now must be a parseable instant");
  const days = policy && policy.strikes ? policy.strikes.windowDays : undefined;
  skRequire(Number.isInteger(days) && days > 0, "policy.strikes.windowDays must be a positive integer (no fallback)");
  return new Date(t + days * 86400000).toISOString();
}

/**
 * Build one EvidenceStrike record intent (P1 schema, unchanged). Idempotency:
 * the key is derived from the INCIDENT (brand, scope, reason, evidence,
 * correlation), never from the instant — a replayed decision finds the same
 * key and must not produce a second strike.
 */
export function buildStrikeIntent(input, policy, context) {
  const i = input && typeof input === "object" ? input : {};
  skRequire(skNonEmpty(i.brandId), "brandId is required");
  skRequire(skNonEmpty(i.ownerEmail), "ownerEmail is required");
  skRequire(STRIKE_SCOPES.includes(i.scope), `scope must be one of ${STRIKE_SCOPES.join(", ")}`);
  skRequire(skNonEmpty(i.reasonCode), "reasonCode is required");
  skRequire(skNonEmpty(i.correlationId), "correlationId is required");

  const expiresAt = deriveStrikeExpiry(context && context.now, policy);
  const idempotencyKey = `eclp3:${sha256Hex(
    stableSerialize({
      kind: "strike",
      brandId: i.brandId,
      scope: i.scope,
      reasonCode: i.reasonCode,
      evidenceEntityType: i.evidenceEntityType || null,
      evidenceId: i.evidenceId || null,
      correlationId: i.correlationId,
    }),
  ).slice(0, 40)}`;

  const record = {
    brand_id: i.brandId,
    owner_email: i.ownerEmail,
    scope: i.scope,
    reason_code: i.reasonCode,
    expires_at: expiresAt,
    idempotency_key: idempotencyKey,
  };
  if (skNonEmpty(i.evidenceEntityType)) record.evidence_entity_type = i.evidenceEntityType;
  if (skNonEmpty(i.evidenceId)) record.evidence_id = i.evidenceId;

  return deepFreeze({ idempotencyKey, expiresAt, record });
}

/** Scopes whose active count has reached the policy threshold → human review. */
export function scopesRequiringEscalation(countsByScope, policy) {
  const threshold = policy && policy.strikes ? policy.strikes.threshold : undefined;
  skRequire(Number.isInteger(threshold) && threshold >= 1, "policy.strikes.threshold must be a positive integer (no fallback)");
  const counts = countsByScope && typeof countsByScope === "object" ? countsByScope : {};
  return deepFreeze(STRIKE_SCOPES.filter((scope) => Number(counts[scope] || 0) >= threshold));
}

// ──── src/lib/eclEngine.js ────
// v62.5 — ECL P3: the Evidence Lifecycle Engine (canonical, pure).
//
// ONE pure function — runEclEngine — takes NormalizedEvidence + the ECL policy
// + an injected context and produces a fully-traceable DECISION: the finalized
// ConfidenceResult (via the P2 gate layer, exclusively), the lifecycle
// transition, and the record INTENTS (events, review cases, strikes) matching
// the P1 schemas. It performs NO I/O and reads NO clock: `now` is injected,
// and replaying the same inputs yields byte-identical outputs and hashes.
//
// FAIL-CLOSED DOCTRINE: any ambiguity, contradiction, unreadable evidence or
// blocked critical gate routes to under_review with a ReviewCase intent.
// Nothing is ever inferred favorably; nothing here touches billing — the
// economic gates stay exactly where P2 put them.
//
// base44/shared/generated/eclDomain.ts is GENERATED from this file.


export const ECL_ENGINE_VERSION = "ecl-engine-1";
export const ECL_RULESET_VERSION = "ecl-rules-1";

export class EclEngineError extends Error {
  constructor(message) {
    super(message);
    this.name = "EclEngineError";
  }
}

const enRequire = (cond, msg) => {
  if (!cond) throw new EclEngineError(msg);
};
const enNonEmpty = (v) => typeof v === "string" && v.length > 0;

// sourceType → verification method. manual_declaration is independent of
// nothing: with an attestation it is attested_only, without one it is none.
const METHOD_BY_SOURCE = {
  api: "independent_api",
  provider_statement: "independent_document",
  bank_statement: "independent_document",
  commerce_export: "independent_document",
  accounting_export: "independent_document",
  fec: "independent_document",
  manual_declaration: null,
};

const CORE_METRICS_BY_DOMAIN = {
  payments: ["grossAmountMinor", "feesAmountMinor"],
  commerce: ["grossSalesAmountMinor"],
  accounting: [],
};

function deriveVerificationMethod(evidence, hasAttestation) {
  const mapped = METHOD_BY_SOURCE[evidence.sourceType];
  if (mapped) return mapped;
  if (evidence.sourceType === "manual_declaration") return hasAttestation === true ? "attested_only" : "none";
  return "none";
}

/**
 * Deterministic confidence classification (ruleset ecl-rules-1). Every rule
 * that RAN is either in passedRules or failedRules — a rule that could not run
 * (missing reference) is deliberately in neither, so absence is visible.
 */
export function classifyConfidence(evidence, reconciliation, options) {
  const opts = options && typeof options === "object" ? options : {};
  const passedRules = [];
  const failedRules = [];
  const warnings = [...(evidence.normalizationWarnings || [])];

  const invalids = evidence.invalidFields || [];
  if (invalids.length === 0) passedRules.push("E-01_fields_valid");
  else failedRules.push({ id: "E-01_fields_valid", detail: invalids.map((v) => `${v.field}:${v.reason}`).join("; ") });

  const core = CORE_METRICS_BY_DOMAIN[evidence.domain] || [];
  const metrics = evidence.metrics || {};
  const missingCore = core.filter((m) => metrics[m] === undefined);
  const accountingEmpty = evidence.domain === "accounting" && (!Array.isArray(evidence.entries) || evidence.entries.length === 0);
  if (missingCore.length === 0 && !accountingEmpty) passedRules.push("E-02_core_metrics_present");
  else failedRules.push({ id: "E-02_core_metrics_present", detail: accountingEmpty ? "no readable ledger entries" : `missing: ${missingCore.join(", ")}` });

  if (evidence.currency && evidence.periodStart && evidence.periodEnd) passedRules.push("E-03_envelope_complete");
  else failedRules.push({ id: "E-03_envelope_complete", detail: `missing: ${["currency", "periodStart", "periodEnd"].filter((k) => !evidence[k]).join(", ")}` });

  if (reconciliation.contradictions.length === 0) passedRules.push("E-04_no_contradictions");
  else failedRules.push({ id: "E-04_no_contradictions", detail: reconciliation.contradictions.map((c) => c.code).join("; ") });

  if (reconciliation.crossChecks.length > 0) {
    if (reconciliation.crossChecks.every((c) => c.withinTolerance)) passedRules.push("E-05_cross_domain_agreement");
    else failedRules.push({ id: "E-05_cross_domain_agreement", detail: "cross-domain gross delta beyond tolerance" });
  }

  // Internal fee coherence: declared feeRateBps vs the rate the amounts imply.
  const gross = metrics.grossAmountMinor;
  const fees = metrics.feesAmountMinor;
  const declaredBps = metrics.feeRateBps;
  if (typeof gross === "number" && gross > 0 && typeof fees === "number" && typeof declaredBps === "number") {
    const impliedBps = (fees / gross) * 10000;
    if (Math.abs(impliedBps - declaredBps) <= Math.max(1, declaredBps * 0.05)) passedRules.push("E-06_fee_rate_coherent");
    else failedRules.push({ id: "E-06_fee_rate_coherent", detail: `declared ${declaredBps}bps vs implied ${Math.round(impliedBps)}bps` });
  }

  // Plausibility vs an injected reference rate — runs ONLY when the caller
  // supplies one; the engine never invents a benchmark.
  if (typeof opts.referenceFeeRateBps === "number" && opts.referenceFeeRateBps > 0 && typeof declaredBps === "number") {
    const maxMultiple = opts.feeVsRateTableMaxMultiple;
    enRequire(typeof maxMultiple === "number" && maxMultiple > 0, "plausibility multiple must come from the policy (no fallback)");
    if (declaredBps <= opts.referenceFeeRateBps * maxMultiple) passedRules.push("E-07_fee_plausible");
    else failedRules.push({ id: "E-07_fee_plausible", detail: `${declaredBps}bps exceeds ${maxMultiple}× reference ${opts.referenceFeeRateBps}bps` });
  }

  const method = deriveVerificationMethod(evidence, opts.hasAttestation);
  const failedIds = failedRules.map((r) => r.id);
  const structurallySound = !failedIds.includes("E-01_fields_valid") && !failedIds.includes("E-02_core_metrics_present") && !failedIds.includes("E-03_envelope_complete");
  const noConflicts = !failedIds.includes("E-04_no_contradictions") && !failedIds.includes("E-05_cross_domain_agreement") && !failedIds.includes("E-07_fee_plausible");

  let confidenceLevel = "unknown";
  const nothingReadable = Object.keys(metrics).length === 0 && (!Array.isArray(evidence.entries) || evidence.entries.length === 0);
  if (!nothingReadable) {
    if (!structurallySound || !noConflicts) confidenceLevel = "low";
    else if (method === "independent_api" || method === "independent_document") confidenceLevel = "high";
    else if (method === "attested_only") confidenceLevel = "medium";
    else confidenceLevel = "low";
  }

  return deepFreeze({
    ruleSetVersion: ECL_RULESET_VERSION,
    confidenceLevel,
    verificationMethod: method,
    passedRules,
    failedRules,
    warnings,
    nothingReadable,
  });
}

function reviewIntent(identity, reasonCode, severity, blockingActions, correlationId, extra) {
  const idempotencyKey = `eclp3:${sha256Hex(
    stableSerialize({ kind: "review_case", brandId: identity.brandId, evidenceEntityType: identity.evidenceEntityType, evidenceId: identity.evidenceId, reasonCode, correlationId }),
  ).slice(0, 40)}`;
  const record = {
    brand_id: identity.brandId,
    owner_email: identity.ownerEmail,
    reason_code: reasonCode,
    severity,
    status: "open",
    idempotency_key: idempotencyKey,
    evidence_entity_type: identity.evidenceEntityType,
    evidence_id: identity.evidenceId,
    blocking_actions: { actions: blockingActions, descriptive_only: false, ...(extra && typeof extra === "object" ? extra : {}) },
  };
  return { idempotencyKey, record };
}

/**
 * THE ENGINE. input = {
 *   identity: { evidenceEntityType, evidenceId, brandId, ownerEmail },
 *   evidence: NormalizedEvidence (from the P2 normalizers),
 *   existing: [{ id, status, evidence }],
 *   state:   { status, provisionalStartedAt?, expiresAt? }  — current lifecycle state,
 *   strikes: [ EvidenceStrike rows ],
 *   context: { now, hasAttestation, baselineLocked, hasBlockingReviewCase, referenceFeeRateBps? },
 *   actor:   "system" | "user" | "reviewer",
 * }
 * Returns a deep-frozen, hashable DECISION. Throws EclEngineError on missing
 * inputs — a guess here would silently answer a question nobody asked.
 */
export function runEclEngine(input, policy) {
  const i = input && typeof input === "object" ? input : {};
  const identity = i.identity && typeof i.identity === "object" ? i.identity : {};
  enRequire(enNonEmpty(identity.evidenceEntityType) && enNonEmpty(identity.evidenceId) && enNonEmpty(identity.brandId) && enNonEmpty(identity.ownerEmail), "identity requires evidenceEntityType, evidenceId, brandId, ownerEmail");
  enRequire(i.evidence && typeof i.evidence === "object" && enNonEmpty(i.evidence.domain), "evidence must be a normalized envelope");
  enRequire(Array.isArray(i.existing), "existing must be an array (pass [] when none)");
  enRequire(i.state && typeof i.state === "object" && enNonEmpty(i.state.status), "state.status (current lifecycle status) is required");
  enRequire(Array.isArray(i.strikes), "strikes must be an array (pass [] when none)");
  enRequire(policy && typeof policy === "object" && policy.gates, "policy is required");
  const ctx = i.context && typeof i.context === "object" ? i.context : {};
  const nowMs = Date.parse(String(ctx.now));
  enRequire(!Number.isNaN(nowMs), "context.now must be an injected, parseable instant (no implicit clock)");
  enRequire(ctx.hasAttestation !== undefined && ctx.hasAttestation !== null, "context.hasAttestation is required");
  enRequire(ctx.baselineLocked !== undefined && ctx.baselineLocked !== null, "context.baselineLocked is required");
  enRequire(ctx.hasBlockingReviewCase !== undefined && ctx.hasBlockingReviewCase !== null, "context.hasBlockingReviewCase is required");
  const actor = ["system", "user", "reviewer"].includes(i.actor) ? i.actor : "system";
  const nowIso = new Date(nowMs).toISOString();

  // ── Trazabilidad: every decision is reproducible from this hash ─────────
  const inputsHash = sha256Hex(
    stableSerialize({
      engineVersion: ECL_ENGINE_VERSION,
      ruleSetVersion: ECL_RULESET_VERSION,
      policyVersion: policy.policyVersion || null,
      identity,
      evidence: i.evidence,
      existing: i.existing.map((e) => ({ id: e && e.id, status: e && e.status, checksum: e && e.evidence && e.evidence.checksum })),
      state: i.state,
      strikes: i.strikes.map((s) => ({ scope: s && s.scope, expires_at: s && s.expires_at, withdrawn_at: (s && s.withdrawn_at) || null })),
      context: { now: nowIso, hasAttestation: ctx.hasAttestation === true, baselineLocked: ctx.baselineLocked === true, hasBlockingReviewCase: ctx.hasBlockingReviewCase === true, referenceFeeRateBps: ctx.referenceFeeRateBps === undefined ? null : ctx.referenceFeeRateBps },
    }),
  );
  const correlationId = `eclp3:${inputsHash.slice(0, 40)}`;

  // ── 1. Reconciliation (dedup, supersession, contradictions) ─────────────
  const reconciliation = reconcileEvidence(i.evidence, i.existing, policy);

  // Exact replay: the SAME bytes were already processed. Idempotent no-op.
  if (reconciliation.duplicates.length > 0) {
    return deepFreeze({
      engineVersion: ECL_ENGINE_VERSION,
      ruleSetVersion: ECL_RULESET_VERSION,
      policyVersion: policy.policyVersion || null,
      correlationId,
      inputsHash,
      outcome: "duplicate_replay",
      duplicateOf: reconciliation.duplicates.map((d) => d.existingId),
      reconciliation,
      confidenceResult: null,
      confidenceResultHash: null,
      transition: null,
      supersessions: [],
      reviewCaseIntents: [],
      strikeIntents: [],
      provisional: null,
      decisionHash: sha256Hex(stableSerialize({ inputsHash, outcome: "duplicate_replay" })),
    });
  }

  // ── 2. Classification ────────────────────────────────────────────────────
  const classification = classifyConfidence(i.evidence, reconciliation, {
    hasAttestation: ctx.hasAttestation === true,
    referenceFeeRateBps: ctx.referenceFeeRateBps,
    feeVsRateTableMaxMultiple: policy.plausibility ? policy.plausibility.feeVsRateTableMaxMultiple : undefined,
  });

  // ── 3. Strikes: economic contradictions strike the scope, per policy ─────
  const scope = strikeScopeForDomain(i.evidence.domain);
  const strikeIntents = [];
  for (const c of reconciliation.contradictions) {
    strikeIntents.push(
      buildStrikeIntent(
        { brandId: identity.brandId, ownerEmail: identity.ownerEmail, scope, reasonCode: `evidence_contradiction:${c.code}`, evidenceEntityType: identity.evidenceEntityType, evidenceId: identity.evidenceId, correlationId },
        policy,
        { now: nowIso },
      ),
    );
  }
  const activeStrikeCountByScope = countActiveStrikesByScope(i.strikes, nowMs);
  // Prospective counts (existing + would-be strikes) drive the escalation.
  const prospectiveCounts = { ...activeStrikeCountByScope };
  if (strikeIntents.length > 0) prospectiveCounts[scope] = Number(prospectiveCounts[scope] || 0) + strikeIntents.length;
  const escalatedScopes = scopesRequiringEscalation(prospectiveCounts, policy);

  // ── 4. Fail-closed review routing ────────────────────────────────────────
  const reviewCaseIntents = [];
  const reviewReasons = [];
  if (reconciliation.contradictions.length > 0) {
    reviewReasons.push("evidence_contradiction");
    reviewCaseIntents.push(reviewIntent(identity, "evidence_contradiction", "economic", ["freeze_baseline", "create_invoice"], correlationId, { contradictions: reconciliation.contradictions.map((c) => c.code) }));
  }
  if (reconciliation.ambiguities.length > 0) {
    reviewReasons.push("reconciliation_ambiguous");
    reviewCaseIntents.push(reviewIntent(identity, "reconciliation_ambiguous", "quality", ["freeze_baseline"], correlationId, { ambiguities: reconciliation.ambiguities.map((a) => a.code) }));
  }
  if (classification.nothingReadable) {
    reviewReasons.push("evidence_unreadable");
    reviewCaseIntents.push(reviewIntent(identity, "evidence_unreadable", "quality", ["show_dashboard"], correlationId, null));
  }
  for (const s of escalatedScopes) {
    reviewReasons.push(`strike_threshold_reached:${s}`);
    reviewCaseIntents.push(reviewIntent(identity, `strike_threshold_reached:${s}`, "economic", ["create_invoice"], correlationId, { scope: s }));
  }

  // ── 5. Expiry of the CURRENT state, from the injected instant only ───────
  const expiry = resolveExpiry(i.state, policy, { now: nowIso });
  if (expiry.ambiguous) {
    reviewReasons.push("provisional_window_unrecoverable");
    reviewCaseIntents.push(reviewIntent(identity, "provisional_window_unrecoverable", "quality", ["recover_proposal"], correlationId, null));
  }

  // ── 6. Target status (never inferred favorably) ──────────────────────────
  let toStatus;
  if (reviewReasons.length > 0) {
    toStatus = "under_review";
  } else if (expiry.lapsed) {
    toStatus = "expired";
  } else if (classification.confidenceLevel === "high" && (classification.verificationMethod === "independent_api" || classification.verificationMethod === "independent_document")) {
    toStatus = "verified";
  } else if (classification.confidenceLevel === "medium" && ctx.hasAttestation === true) {
    toStatus = "accepted_provisionally";
  } else if (classification.confidenceLevel === "low" || classification.confidenceLevel === "medium") {
    toStatus = "estimated";
  } else {
    toStatus = "under_review";
  }

  // A target the graph does not allow from the current state is itself an
  // ambiguity → review, unless review is the target already. Terminal states
  // never move.
  if (isTerminalStatus(i.state.status)) {
    toStatus = i.state.status;
  } else if (toStatus !== i.state.status && !canTransition(i.state.status, toStatus)) {
    if (toStatus !== "under_review" && canTransition(i.state.status, "under_review")) {
      reviewReasons.push("illegal_transition_requested");
      reviewCaseIntents.push(reviewIntent(identity, "illegal_transition_requested", "quality", [], correlationId, { requested: toStatus, from: i.state.status }));
      toStatus = "under_review";
    } else {
      toStatus = i.state.status;
    }
  }

  const provisional =
    toStatus === "accepted_provisionally"
      ? deepFreeze({ startedAt: nowIso, expiresAt: deriveProvisionalExpiry(nowIso, policy) })
      : null;

  // ── 7. Lifecycle event intents ───────────────────────────────────────────
  const eventName =
    reviewReasons.length > 0 ? `evidence_review_opened:${reviewReasons[0]}` : expiry.lapsed ? "provisional_expired" : `evidence_${toStatus}`;
  const transition = buildLifecycleTransition({
    evidenceEntityType: identity.evidenceEntityType,
    evidenceId: identity.evidenceId,
    brandId: identity.brandId,
    ownerEmail: identity.ownerEmail,
    fromStatus: i.state.status,
    toStatus,
    event: eventName,
    actor,
    correlationId,
    payload: { inputsHash, ruleSetVersion: ECL_RULESET_VERSION, reviewReasons },
  });

  const supersessions = reconciliation.supersedes
    .map((s) => {
      const prior = i.existing.find((e) => e && e.id === s.existingId);
      if (!prior || isTerminalStatus(prior.status) || !canTransition(prior.status, "superseded")) return null;
      return buildLifecycleTransition({
        evidenceEntityType: identity.evidenceEntityType,
        evidenceId: s.existingId,
        brandId: identity.brandId,
        ownerEmail: identity.ownerEmail,
        fromStatus: prior.status,
        toStatus: "superseded",
        event: `evidence_superseded:${s.reason}`,
        actor,
        correlationId,
        payload: { supersededById: identity.evidenceId, inputsHash },
      });
    })
    .filter((t) => t !== null);

  // ── 8. Finalized ConfidenceResult through the P2 gate layer ──────────────
  const gateContext = {
    now: nowIso,
    hasAttestation: ctx.hasAttestation === true,
    hasOpenConflicts: reconciliation.contradictions.length > 0,
    baselineLocked: ctx.baselineLocked === true,
    activeStrikeCountByScope: prospectiveCounts,
    hasBlockingReviewCase: ctx.hasBlockingReviewCase === true || reviewCaseIntents.length > 0,
  };
  const confidenceResult = finalizeConfidenceResult(
    {
      evidenceType: i.evidence.evidenceType,
      sourceType: i.evidence.sourceType,
      confidenceLevel: classification.confidenceLevel,
      verificationMethod: classification.verificationMethod,
      evidenceStatus: toStatus,
      passedRules: classification.passedRules,
      failedRules: classification.failedRules,
      warnings: classification.warnings,
      missingFields: i.evidence.missingFields,
      invalidFields: i.evidence.invalidFields,
      conflicts: reconciliation.contradictions,
      metrics: i.evidence.metrics,
      period: { periodStart: i.evidence.periodStart, periodEnd: i.evidence.periodEnd, coverageDays: i.evidence.coverageDays },
      provenance: { importId: i.evidence.importId, checksum: i.evidence.checksum, parserVersion: i.evidence.parserVersion, inputsHash, correlationId },
      expiresAt: provisional ? provisional.expiresAt : (i.state.expiresAt || null),
      reviewRequired: reviewReasons.length > 0,
      ruleSetVersion: ECL_RULESET_VERSION,
      explanation: {
        reason: reviewReasons.length > 0 ? `routed to human review: ${reviewReasons.join(", ")}` : `classified ${classification.confidenceLevel} via ${classification.verificationMethod}`,
        actionsToImprove: classification.failedRules.map((r) => `resolve ${r.id}`),
      },
    },
    policy,
    gateContext,
  );

  const decision = {
    engineVersion: ECL_ENGINE_VERSION,
    ruleSetVersion: ECL_RULESET_VERSION,
    policyVersion: policy.policyVersion || null,
    correlationId,
    inputsHash,
    outcome: reviewReasons.length > 0 ? "under_review" : toStatus === i.state.status ? "no_change" : toStatus,
    duplicateOf: [],
    reconciliation,
    confidenceResult,
    confidenceResultHash: hashConfidenceResult(confidenceResult),
    transition,
    supersessions,
    reviewCaseIntents,
    strikeIntents,
    provisional,
  };
  return deepFreeze({ ...decision, decisionHash: sha256Hex(stableSerialize(decision)) });
}
// NOTE: no "summarize gates with assumed context" helper exists ON PURPOSE —
// a gate verdict computed with invented context (assumed attestation, assumed
// locked baseline) would be a favorable inference, which P3 forbids. Gate
// evaluation always goes through eclGates.evaluateGate with REAL context.