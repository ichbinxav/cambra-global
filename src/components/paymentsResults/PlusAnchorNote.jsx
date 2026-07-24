// PlusAnchorNote — COHERENCE-1 Tarea 2 (2026-07-24).
//
// Plan-anchor transparency: when the engine's multi-anchor winner is a
// PLUS-tier (subscription plan) row — today only SumUp Pagos Plus ES — the
// visible achievable note must state the plan and its fixed monthly cost.
//
// Detection is FIELD-based against the already-fetched rate table (never
// parses cohort_key, never hardcodes 75/1900): we recompute each candidate
// PLUS row's effective bps with the engine's own amortization arithmetic
// (percent + fixed/ticket + rental/GMV) and match it against
// benchmark_resolution.winner_effective_bps. Same country rule as the engine:
// country-less always eligible, different country never.
//
// Presentation-only. Zero engine changes. Self-hides when no PLUS anchor won.

import { useTranslation } from "@/lib/i18n.jsx";

const BPS = 10000;

function effectiveBps(row, ticketEur, monthlyGmvEur) {
  let eff = Number(row.percent_bps) || 0;
  const fixedMinor = Number(row.fixed_fee_minor_units) || 0;
  const rentalMinor = Number(row.terminal_rental_monthly_minor) || 0;
  if (fixedMinor > 0 && ticketEur > 0) eff += (fixedMinor / 100 / ticketEur) * BPS;
  if (rentalMinor > 0 && monthlyGmvEur > 0) eff += (rentalMinor / 100 / monthlyGmvEur) * BPS;
  return eff;
}

export default function PlusAnchorNote({ engineResult, inputSnapshot, rateTable }) {
  const { t } = useTranslation();
  const channel = engineResult?.cohort?.channel;
  if (channel !== "in_store" || !Array.isArray(rateTable)) return null;

  const country = inputSnapshot?.country || null;
  const ticket = Number(inputSnapshot?.avg_ticket_eur) || 0;
  const gmv = Number(inputSnapshot?.monthly_gmv_eur) || 0;
  // The anonymous teaser allowlist strips benchmark_resolution, so we anchor
  // the match on achievable_effective_bps — present on BOTH reader paths and
  // equal to the winner's effective bps by construction (multi-anchor winner
  // IS the achievable). When benchmark_resolution is present, its winner slug
  // is enforced as an extra guard.
  const br = engineResult?.benchmark_resolution;
  const winnerBps = Number(br?.winner_effective_bps ?? engineResult?.achievable_effective_bps);
  if (!isFinite(winnerBps)) return null;

  const plusWon = rateTable.some(
    (x) =>
      x.active !== false &&
      x.tier === "PLUS" &&
      x.channel === "in_store" &&
      (!br?.winner || x.provider_slug === br.winner) &&
      (!x.country || (country && x.country === country)) &&
      Math.abs(effectiveBps(x, ticket, gmv) - winnerBps) < 0.5
  );
  if (!plusWon) return null;

  return (
    <div
      className="rounded-xl p-4"
      style={{ background: "rgba(47,224,168,0.05)", border: "1px solid rgba(47,224,168,0.25)" }}
    >
      <p
        className="text-[10px] uppercase tracking-[0.22em] font-bold mb-2"
        style={{ color: "rgba(47,224,168,0.85)" }}
      >
        SumUp Pagos Plus
      </p>
      <p className="text-[12.5px] text-white/75 leading-relaxed">{t("plus_anchor_note")}</p>
    </div>
  );
}