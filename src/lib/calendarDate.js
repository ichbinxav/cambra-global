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