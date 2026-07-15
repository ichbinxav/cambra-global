import { describe, it, expect } from "vitest";
import { deriveTerminalRental, deriveChannelSplit, deriveSubVsPayg } from "./paymentsInStore.js";

// Representative in-store engine_result (Yavin EU, €40k/mo, ticket €22, €29/mo
// rental). current_effective_bps = 87.25 = 80 (percent) + 7.25 (rental).
const inStoreER = {
  current_effective_bps: 87.25,
  achievable_effective_bps: 155,
  annual_savings_eur: { lo: 0, point: 0, hi: 0 },
  cohort: { channel: "in_store" },
  assumptions: [],
};
const inStoreSnap = { monthly_gmv_eur: 40000, avg_ticket_eur: 22 };
const yavinRow = { terminal_rental_monthly_minor: 2900, percent_bps: 80 };

describe("deriveTerminalRental", () => {
  it("hides for online channel", () => {
    const r = deriveTerminalRental({ cohort: { channel: "online" }, current_effective_bps: 150 }, { monthly_gmv_eur: 40000 }, yavinRow);
    expect(r.available).toBe(false);
  });

  it("hides when rental is 0 (modern TPV)", () => {
    const r = deriveTerminalRental(inStoreER, inStoreSnap, { terminal_rental_monthly_minor: 0 });
    expect(r.available).toBe(false);
  });

  it("surfaces rental and PROVES no double count (rental + rest === current)", () => {
    const r = deriveTerminalRental(inStoreER, inStoreSnap, yavinRow);
    expect(r.available).toBe(true);
    expect(r.rental_month_eur).toBe(29);
    expect(r.rental_year_eur).toBe(348);
    // 348 / 480000 * 10000 = 7.25 bps
    expect(r.rental_bps).toBeCloseTo(7.25, 4);
    expect(r.rental_pct).toBeCloseTo(0.0725, 4);
    expect(r.rest_bps).toBeCloseTo(80, 4);
    // coherence: rental + rest === current_effective_bps
    expect(r.rental_bps + r.rest_bps).toBeCloseTo(r.current_bps, 6);
    expect(r.coherent).toBe(true);
  });
});

describe("deriveChannelSplit", () => {
  it("hides when not combined (single channel)", () => {
    expect(deriveChannelSplit(null).available).toBe(false);
    expect(deriveChannelSplit([{ channel: "online" }]).available).toBe(false);
  });

  it("splits two channels and sums savings to the combined total", () => {
    const perChannel = [
      { channel: "online",   engine_result: { current_effective_bps: 200, annual_savings_eur: { point: 3000 } }, input_snapshot: { monthly_gmv_eur: 50000 } },
      { channel: "in_store", engine_result: { current_effective_bps: 90,  annual_savings_eur: { point: 1200 } }, input_snapshot: { monthly_gmv_eur: 20000 } },
    ];
    const r = deriveChannelSplit(perChannel);
    expect(r.available).toBe(true);
    expect(r.channels).toHaveLength(2);
    expect(r.total_savings_eur).toBe(4200); // 3000 + 1200
    // online fees: 600000 * 0.02 = 12000
    expect(r.channels[0].annual_fees_eur).toBeCloseTo(12000, 2);
    // in-store fees: 240000 * 0.009 = 2160
    expect(r.channels[1].annual_fees_eur).toBeCloseTo(2160, 2);
  });
});

describe("deriveSubVsPayg", () => {
  // payg: SumUp 1.75% no fee. sub: 0.65% + €29/mo. rate gap = 110 bps.
  const paygRow = { percent_bps: 175, terminal_rental_monthly_minor: 0 };
  const subRow = { percent_bps: 65, terminal_rental_monthly_minor: 2900 };

  it("hides when no GMV or missing rows", () => {
    expect(deriveSubVsPayg({}, paygRow, subRow).available).toBe(false);
    expect(deriveSubVsPayg({ monthly_gmv_eur: 40000 }, null, subRow).available).toBe(false);
  });

  it("computes crossover and picks subscription at high volume", () => {
    const r = deriveSubVsPayg({ monthly_gmv_eur: 40000 }, paygRow, subRow);
    expect(r.available).toBe(true);
    // crossover = 29 / 0.011 = 2636.36
    expect(r.crossover_gmv_eur).toBeCloseTo(2636.36, 1);
    // at €40k/mo, subscription wins
    expect(r.sub_wins).toBe(true);
  });

  it("picks pay-as-you-go below the crossover volume", () => {
    const r = deriveSubVsPayg({ monthly_gmv_eur: 1500 }, paygRow, subRow);
    expect(r.available).toBe(true);
    expect(r.sub_wins).toBe(false); // 1500 < 2636 crossover
  });
});