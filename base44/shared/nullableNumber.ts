// DASHBOARD (2026-08-17) — the single nullable numeric coercion.
//
// This module exists because ONE mistake was made twice in this repo:
//
//   const parsed = Number(value);
//   return Number.isFinite(parsed) ? parsed : null;
//
// `Number(null)` is `0` and `Number.isFinite(0)` is `true`, so an ABSENT figure
// comes back as a confident zero. It first appeared in founderOSData, where a
// failed Invoice read produced `collected_revenue: 0` labelled "verified" on the
// founder's home page. It reappeared in auditsCore, where an opportunity with no
// expected recoverable savings reported EUR 0 recoverable AND passed the Recover
// eligibility check.
//
// Both were caught by tests, and both would have been prevented by having one
// implementation instead of three. Every new financial or metric read must use
// these helpers, and `audits-opportunities:check` enforces it.

export const NULLABLE_NUMBER_VERSION = 'nullable-number-1.0.0';

/**
 * Reads a number that may legitimately be absent.
 *
 * Returns `null` for null, undefined, empty string, whitespace, NaN and Infinity.
 * Returns the number for everything else — INCLUDING a genuine `0`, because a real
 * zero and a missing value are different facts and both must survive.
 */
export function nullableNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  if (typeof value === 'boolean') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Minor-unit money read. Same rules; named separately so a financial call site
 * reads as money rather than as an arbitrary number.
 */
export function nullableMinor(value: unknown): number | null {
  return nullableNumber(value);
}

/**
 * Sums a set of possibly-absent values and reports what was excluded.
 *
 * A total is only `COMPLETE` when every row carried a value. Otherwise it is a
 * lower bound and says so, because a sum that silently skips rows is a total
 * presented as a fact.
 */
export function nullableSum(values: unknown[]): {
  total: number | null;
  counted: number;
  missing: number;
  completeness: 'COMPLETE' | 'LOWER_BOUND' | 'UNKNOWN';
} {
  const rows = Array.isArray(values) ? values : [];
  const parsed = rows.map(nullableNumber);
  const present = parsed.filter((value): value is number => value !== null);
  if (!rows.length) return { total: null, counted: 0, missing: 0, completeness: 'UNKNOWN' };
  if (!present.length) return { total: null, counted: 0, missing: rows.length, completeness: 'UNKNOWN' };
  return {
    total: present.reduce((sum, value) => sum + value, 0),
    counted: present.length,
    missing: rows.length - present.length,
    completeness: present.length === rows.length ? 'COMPLETE' : 'LOWER_BOUND',
  };
}

/** True when a value is a usable number. The inverse of "renders as an em dash". */
export function isKnownNumber(value: unknown): boolean {
  return nullableNumber(value) !== null;
}
