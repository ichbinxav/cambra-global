// CAMP-C4 (2026-08-16) — metric definition tests (spec §9). The properties
// under test are the ones that decide whether a founder can trust a number:
// acceptance is not delivery, a zero denominator is UNKNOWN not 0%, and
// company-level never gets confused with contact-level.
import { describe, expect, it } from "vitest";
import { buildCampaignMetrics } from "../../base44/shared/campaignMetrics.ts";

const get = (result, key) => result.metrics.find((row) => row.metric_key === key);

function enrollment(state, company_key = "acme") {
  return { state, company_key };
}

describe("C4 — metric contract", () => {
  it("every metric declares numerator, denominator, unit, scope, unique key and attribution", () => {
    const result = buildCampaignMetrics({ enrollments: [enrollment("DELIVERED_OBSERVED")] });
    for (const row of result.metrics) {
      expect(row.numerator, row.metric_key).toBeTruthy();
      expect(row.denominator, row.metric_key).toBeTruthy();
      expect(row.unit, row.metric_key).toBeTruthy();
      expect(row.scope, row.metric_key).toBeTruthy();
      expect(row.unique_key, row.metric_key).toBeTruthy();
      expect(row.attribution_rule, row.metric_key).toBeTruthy();
      expect(["OBSERVED", "UNKNOWN"], row.metric_key).toContain(row.status);
    }
  });

  it("reports UNKNOWN for every metric when the enrollment source is unavailable", () => {
    const result = buildCampaignMetrics({ enrollments: [enrollment("DELIVERED_OBSERVED")], available: false });
    expect(result.data_status).toBe("UNAVAILABLE");
    for (const row of result.metrics) {
      expect(row.status, row.metric_key).toBe("UNKNOWN");
      expect(row.value, row.metric_key).toBeNull();
    }
  });
});

describe("C4 — acceptance is never delivery", () => {
  it("counts a PROVIDER_ACCEPTED enrollment as accepted but not as delivered", () => {
    const result = buildCampaignMetrics({ enrollments: [enrollment("PROVIDER_ACCEPTED")] });
    expect(get(result, "provider_accepted").value).toBe(1);
    expect(get(result, "delivered_observed").value).toBe(0);
  });

  it("keeps reply_rate_delivered and reply_rate_accepted as separate metrics", () => {
    // 10 accepted, 5 with an observed delivery, 1 human reply.
    const enrollments = [
      ...Array.from({ length: 5 }, (_, index) => enrollment("PROVIDER_ACCEPTED", `co-${index}`)),
      ...Array.from({ length: 4 }, (_, index) => enrollment("DELIVERED_OBSERVED", `co-d${index}`)),
      enrollment("REPLIED", "co-reply"),
    ];
    const result = buildCampaignMetrics({ enrollments });
    const delivered = get(result, "reply_rate_delivered");
    const accepted = get(result, "reply_rate_accepted");
    expect(delivered.denominator_value).toBe(5);
    expect(accepted.denominator_value).toBe(10);
    expect(delivered.value).not.toBe(accepted.value);
    expect(delivered.value).toBe(0.2);
    expect(accepted.value).toBe(0.1);
  });
});

describe("C4 — a zero denominator is UNKNOWN, not 0%", () => {
  it("reports UNKNOWN when nothing was delivered", () => {
    const result = buildCampaignMetrics({ enrollments: [enrollment("QUEUED")] });
    const row = get(result, "reply_rate_delivered");
    expect(row.status).toBe("UNKNOWN");
    expect(row.value).toBeNull();
    expect(row.blocker).toBe("denominator_is_zero");
  });

  it("reports a real 0 rate when there IS a denominator and no numerator", () => {
    const result = buildCampaignMetrics({ enrollments: [enrollment("DELIVERED_OBSERVED")] });
    const row = get(result, "reply_rate_delivered");
    expect(row.status).toBe("OBSERVED");
    expect(row.value).toBe(0);
  });
});

describe("C4 — out of office is not a negative reply", () => {
  it("counts OOO separately and keeps it out of the positive-reply denominator", () => {
    const result = buildCampaignMetrics({
      enrollments: [enrollment("OUT_OF_OFFICE"), enrollment("DELIVERED_OBSERVED", "b")],
    });
    expect(get(result, "out_of_office").value).toBe(1);
    // OOO is not a human reply, so the positive-reply denominator is zero.
    expect(get(result, "positive_reply_rate").status).toBe("UNKNOWN");
  });
});

describe("C4 — company level never merges with contact level", () => {
  it("counts a company with two replying contacts once", () => {
    const result = buildCampaignMetrics({
      enrollments: [
        enrollment("REPLIED", "acme"),
        enrollment("REPLIED", "acme"),
        enrollment("DELIVERED_OBSERVED", "globex"),
      ],
    });
    // Two contact-level replies...
    expect(result.counts.human_reply).toBe(2);
    // ...but one company out of two.
    expect(result.company_counts.companies).toBe(2);
    expect(result.company_counts.with_reply).toBe(1);
    expect(get(result, "company_reply_rate").value).toBe(0.5);
  });

  it("labels the company metrics with a company-level scope and unique key", () => {
    const result = buildCampaignMetrics({ enrollments: [enrollment("REPLIED")] });
    const row = get(result, "company_reply_rate");
    expect(row.unique_key).toBe("company_key");
    expect(row.scope).toContain("company");
  });
});

describe("C4 — funnel monotonicity", () => {
  it("a later stage never exceeds an earlier one", () => {
    const result = buildCampaignMetrics({
      enrollments: [
        enrollment("CONVERTED", "a"), enrollment("MEETING_BOOKED", "b"),
        enrollment("REPLIED", "c"), enrollment("DELIVERED_OBSERVED", "d"),
        enrollment("PROVIDER_ACCEPTED", "e"), enrollment("QUEUED", "f"),
      ],
    });
    const { provider_accepted, delivered_observed, human_reply, positive_reply, meeting_booked } = result.counts;
    expect(provider_accepted).toBeGreaterThanOrEqual(delivered_observed);
    expect(delivered_observed).toBeGreaterThanOrEqual(human_reply);
    expect(human_reply).toBeGreaterThanOrEqual(positive_reply);
    expect(positive_reply).toBeGreaterThanOrEqual(meeting_booked);
  });

  it("excludes EXCLUDED enrollments from the eligible base", () => {
    const result = buildCampaignMetrics({
      enrollments: [enrollment("EXCLUDED"), enrollment("QUEUED", "b")],
    });
    expect(get(result, "eligible").value).toBe(1);
  });
});
