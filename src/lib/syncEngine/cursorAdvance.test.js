import { describe, it, expect } from "vitest";
import { computeNewCursor } from "./cursorAdvance.js";

// BUG-4 write-side tests. The read-side (24h overlap in computeSyncWindow)
// is covered separately in dateRange.test.js. These tests protect the
// cursor-advance semantics that were broken in BUG-4 — the cursor used to
// jump to `window.until` (clock-now), so the next sync opened a ~0s window.

describe("computeNewCursor — BUG-4 write-side guarantees", () => {
  const PREV = "2026-06-01T00:00:00.000Z";
  const PREV_MS = new Date(PREV).getTime();

  it("cursor advances to max(occurred_at) of the batch", () => {
    const records = [
      { occurred_at: "2026-06-05T10:00:00.000Z" },
      { occurred_at: "2026-06-08T14:30:00.000Z" }, // max
      { occurred_at: "2026-06-06T09:15:00.000Z" },
    ];
    const out = computeNewCursor({ endpointRecords: records, previousCursor: PREV, partial: false });
    expect(out).toBe("2026-06-08T14:30:00.000Z");
  });

  it("MONOTONICITY GUARD — batch entirely older than previous cursor → cursor UNCHANGED", () => {
    // Backfill / clock skew / upstream reordering scenario.
    const records = [
      { occurred_at: "2026-05-15T10:00:00.000Z" },
      { occurred_at: "2026-05-20T10:00:00.000Z" },
    ];
    const out = computeNewCursor({ endpointRecords: records, previousCursor: PREV, partial: false });
    expect(out).toBe(PREV);
    // Sanity: the newest record IS older than PREV.
    expect(new Date(records[1].occurred_at).getTime()).toBeLessThan(PREV_MS);
  });

  it("empty batch → cursor UNCHANGED (does NOT drift to Date.now)", () => {
    const out = computeNewCursor({ endpointRecords: [], previousCursor: PREV, partial: false });
    expect(out).toBe(PREV);
  });

  it("batch with no valid occurred_at at all → cursor UNCHANGED", () => {
    const records = [
      { occurred_at: null },
      { occurred_at: undefined },
      { /* missing */ },
      { occurred_at: "not-a-date" }, // NaN.getTime()
    ];
    const out = computeNewCursor({ endpointRecords: records, previousCursor: PREV, partial: false });
    expect(out).toBe(PREV);
  });

  it("partial sync (cap hit) → cursor UNCHANGED even if records are newer", () => {
    const records = [{ occurred_at: "2026-07-01T00:00:00.000Z" }]; // newer than PREV
    const out = computeNewCursor({ endpointRecords: records, previousCursor: PREV, partial: true });
    expect(out).toBe(PREV);
  });

  it("no previous cursor + valid batch → cursor set to batch max", () => {
    const records = [
      { occurred_at: "2026-06-05T00:00:00.000Z" },
      { occurred_at: "2026-06-10T00:00:00.000Z" },
    ];
    const out = computeNewCursor({ endpointRecords: records, previousCursor: null, partial: false });
    expect(out).toBe("2026-06-10T00:00:00.000Z");
  });

  it("no previous cursor + empty batch → null (nothing to persist)", () => {
    const out = computeNewCursor({ endpointRecords: [], previousCursor: null, partial: false });
    expect(out).toBeNull();
  });

  it("mixed batch (some valid, some junk) → uses only valid timestamps for max", () => {
    const records = [
      { occurred_at: "2026-06-05T00:00:00.000Z" },
      { occurred_at: null },
      { occurred_at: "2026-06-09T00:00:00.000Z" }, // max valid
      { occurred_at: "garbage" },
    ];
    const out = computeNewCursor({ endpointRecords: records, previousCursor: PREV, partial: false });
    expect(out).toBe("2026-06-09T00:00:00.000Z");
  });

  it("batch max EQUAL to previous cursor → cursor UNCHANGED (>= keeps identity, no regression)", () => {
    const records = [{ occurred_at: PREV }];
    const out = computeNewCursor({ endpointRecords: records, previousCursor: PREV, partial: false });
    // Identity holds — the ISO string round-trips through Date().toISOString().
    expect(out).toBe(PREV);
  });

  it("garbage previous cursor + valid batch → treats prev as 0 and advances", () => {
    const records = [{ occurred_at: "2026-06-05T00:00:00.000Z" }];
    const out = computeNewCursor({ endpointRecords: records, previousCursor: "not-a-date", partial: false });
    expect(out).toBe("2026-06-05T00:00:00.000Z");
  });
});