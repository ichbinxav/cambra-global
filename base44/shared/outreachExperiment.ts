import { OUTREACH_EXPERIMENT_ADVISORY_LABEL_CONTRACT } from "./adaptiveLeadLearning.ts";

export const OUTREACH_VARIANTS: any = {
  merchant_acquisition: {
    diagnostic: {
      instruction:
        "Lead with a concise diagnostic question about payments/infrastructure economics. Do not imply a problem is known.",
    },
    role_relevant: {
      instruction:
        "Connect CAMBRA to the recipient role and one verified company signal. Keep it specific and low-pressure.",
    },
    observation_led: {
      instruction:
        "Open from one verified public/company signal, then explain why CAMBRA may be relevant. Never pretend the signal proves overpayment.",
    },
    direct_value: {
      instruction:
        "State CAMBRA value proposition directly and ask whether a quick infrastructure review is relevant. Avoid fabricated personalization.",
    },
  },
  partner_acquisition: {
    portfolio_value: {
      instruction:
        "Frame CAMBRA as an additional capability for the partner’s merchant/client portfolio without claiming how many clients they have.",
    },
    role_relevant: {
      instruction:
        "Connect the partnership idea to the recipient role and verified organization specialism.",
    },
    direct_founder: {
      instruction:
        "Use a concise founder-to-founder/professional approach: why CAMBRA is exploring this partner category and ask if it is relevant.",
    },
    merchant_outcomes: {
      instruction:
        "Focus on helping merchants improve infrastructure economics, without quoting unverified savings or outcomes.",
    },
  },
};
function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
export function chooseVariant(
  engine: string,
  subjectId: string,
  stats: any[] = [],
) {
  const vars = Object.keys(OUTREACH_VARIANTS[engine] || {});
  if (!vars.length) {
    return {
      key: "default",
      instruction: "Write a relevant concise email.",
      mode: "default",
    };
  }
  const roll = hash(`${engine}:${subjectId}:explore`) % 100;
  const eligible = stats.filter((x: any) =>
    x.engine === engine && vars.includes(x.variant_key) &&
    x.label_contract_version ===
      OUTREACH_EXPERIMENT_ADVISORY_LABEL_CONTRACT.label_version &&
    x.methodology_class ===
      OUTREACH_EXPERIMENT_ADVISORY_LABEL_CONTRACT.methodology_class &&
    x.training_eligible === false && x.probabilistic_calibration === false &&
    Number(x.eligible_sample_size || 0) >= 20
  );
  if (roll < 20 || !eligible.length) {
    const key = vars[hash(`${engine}:${subjectId}:variant`) % vars.length];
    return {
      key,
      instruction: OUTREACH_VARIANTS[engine][key].instruction,
      mode: "explore",
    };
  }
  const best =
    [...eligible].sort((a: any, b: any) =>
      Number(b.performance_score || 0) - Number(a.performance_score || 0)
    )[0];
  const key = best?.variant_key || vars[0];
  return {
    key,
    instruction: OUTREACH_VARIANTS[engine][key].instruction,
    mode: "exploit",
  };
}
export function personalizationFacts(x: any, kind: "merchant" | "partner") {
  if (kind === "merchant") {
    const sb = x?.score_breakdown_json || {};
    const sig = sb.signals || {};
    return {
      company: x.company_name || null,
      contact_name: x.contact_full_name || null,
      contact_title: x.contact_title || null,
      country: x.country || null,
      industry: x.industry || null,
      commerce_platform: sig.commerce_platform || null,
      payment_provider: sig.payment_provider || null,
      employee_count: sig.employees ?? null,
      store_count: sig.store_count ?? null,
      monthly_traffic: sig.monthly_traffic ?? null,
      timing_signal: sb?.reasoning || null,
      evidence_confidence: sb?.evidence_confidence ?? null,
    };
  }
  return {
    organization: x.organization_name || null,
    contact_name: x.contact_name || null,
    contact_title: x.contact_title || null,
    country: x.country || null,
    partner_type: x.partner_type || null,
    specialisms: Array.isArray(x.specialisms) ? x.specialisms.slice(0, 6) : [],
    score: x.score || null,
  };
}
export function compactFacts(f: any) {
  return Object.fromEntries(
    Object.entries(f || {}).filter(([, v]) =>
      v !== null && v !== "" && !(Array.isArray(v) && v.length === 0)
    ),
  );
}
