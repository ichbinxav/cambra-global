// PaymentsInStoreInsights — Phase-3 IN-STORE (TPE/TPV) tiles.
//
// Renders three tiles, ONLY for in-store or combined analyses:
//   1. Terminal rental as its own cost — read from PaymentsRateTable (NOT
//      engine_result), presented as "of your rate, this is rental" with a
//      coherence proof (rental + rest === current_effective_bps). Never summed
//      on top of the total.
//   2. Online vs in-store split — combined analyses only (details.per_channel).
//      Auto-hides today (no combined analyses exist in prod). Sum-checked.
//   3. Subscription (abono) vs pay-as-you-go crossover — informative market
//      insight at the merchant's real volume.
//
// GUARDA: TPV provider rows are used ONLY as an internal market rate reference
// for the sub-vs-payg crossover. This component NEVER names a TPV as a
// destination/recommendation. The recovery destination stays CAMBRA's offer —
// the CTA lives elsewhere (DashboardHeroV2 / PaymentsResults), untouched here.
//
// SINGLE SOURCE OF TRUTH: current rate + GMV from engine_result / input_snapshot.
// Rental + market rates from PaymentsRateTable (public read). Nothing fabricated
// — every tile self-hides when its data is absent.

import { useEffect, useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useTranslation } from "@/lib/i18n.jsx";
import { deriveTerminalRental, deriveChannelSplit, deriveSubVsPayg } from "@/lib/paymentsInStore.js";
import InsightCard, { INSIGHT_MONO as MONO } from "@/components/paymentsResults/InsightCard";

const eur = (n) => (isFinite(n) ? "€" + Math.round(n).toLocaleString("en-US") : "—");
const pct = (n) => (isFinite(n) ? n.toFixed(2) + "%" : "—");
const bigNum = { fontFamily: MONO, fontSize: 28, fontWeight: 800, letterSpacing: "-0.02em", lineHeight: 1 };

// One horizontal proportion bar (rental vs rest of the rate).
function RateBar({ label, valueLabel, pctOfMax, color, note = null }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[12px] font-semibold text-white/85 truncate">{label}</span>
        <span className="tabular-nums text-white/80 text-[12px] font-bold shrink-0" style={{ fontFamily: MONO }}>{valueLabel}</span>
      </div>
      <div className="h-2 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.05)" }}>
        <div className="h-full rounded-full" style={{ width: `${Math.max(2, Math.min(100, pctOfMax))}%`, background: color }} />
      </div>
      {note && <p className="text-[10px] text-white/40">{note}</p>}
    </div>
  );
}

export default function PaymentsInStoreInsights({ engineResult, inputSnapshot, perChannel = null }) {
  const { t } = useTranslation();
  const [rows, setRows] = useState(null);

  const channel = engineResult?.cohort?.channel === "in_store" ? "in_store" : "online";
  const isCombined = Array.isArray(perChannel) && perChannel.length >= 2;
  const region = (inputSnapshot?.region && ["EU", "UK", "US", "RoW"].includes(inputSnapshot.region)) ? inputSnapshot.region : "EU";
  const providerSlug = inputSnapshot?.provider_slug || null;
  const country = inputSnapshot?.country || null;

  // Only fetch rate rows for in-store / combined — online analyses never render.
  useEffect(() => {
    if (channel !== "in_store" && !isCombined) { setRows(null); return; }
    let cancelled = false;
    (async () => {
      try {
        const r = await base44.entities.PaymentsRateTable.filter({ active: true, channel: "in_store" }, "-created_date", 200);
        if (!cancelled) setRows(Array.isArray(r) ? r : []);
      } catch {
        if (!cancelled) setRows([]);
      }
    })();
    return () => { cancelled = true; };
  }, [channel, isCombined]);

  // ── derive tiles ──────────────────────────────────────────────────────────
  // COHERENCE-1 Tarea 1.1 (2026-07-24) — country rule, mirror of the engine's
  // selectRow (M5): country-less rows are ALWAYS eligible; a row pinned to a
  // DIFFERENT country is NEVER eligible; without a snapshot country only
  // country-less rows enter the pool. Field-based — cohort_key never parsed.
  const pool = useMemo(() => {
    if (!rows) return null;
    return rows.filter((x) => !x.country || (country && x.country === country));
  }, [rows, country]);

  /** @type {ReturnType<typeof deriveTerminalRental>} */
  const rental = useMemo(() => {
    if (!pool) return { available: false, reason: "rates_pending" };
    // COHERENCE-1 Tarea 1.3 — merchant's own row, FIELD-based and country-
    // aware, replicating the engine's preference order: (1) row pinned to the
    // merchant's country matching slug/region/channel, (2) pan-regional row,
    // (3) regional in-store fallback. tier must be ANY — PLUS plan-anchor
    // rows are never the merchant's CURRENT row (same rule as the engine).
    const own = (x) => x.provider_slug === providerSlug && x.region === region && x.tier === "ANY";
    const row =
      (providerSlug && country && pool.find((x) => own(x) && x.country === country)) ||
      (providerSlug && pool.find((x) => own(x) && !x.country)) ||
      pool.find((x) => x.provider_slug === "ANY" && x.region === region && !x.country) ||
      null;
    return deriveTerminalRental(engineResult, inputSnapshot, row);
  }, [pool, engineResult, inputSnapshot, providerSlug, region, country]);

  const split = useMemo(() => deriveChannelSplit(perChannel), [perChannel]);

  /** @type {ReturnType<typeof deriveSubVsPayg>} */
  const subVsPayg = useMemo(() => {
    if (!pool) return { available: false, reason: "rates_pending" };
    // Market references (internal only — NEVER shown as destinations):
    //   payg = the lowest-% no-rental verified in-store row in the region.
    //   sub  = the lowest-% WITH-rental in-store row in the region.
    // COHERENCE-1 Tarea 1.2 — VERIFIED only, for real: the comment above
    // always promised verified rows; the code now enforces verified === true.
    // DRAFT (unverified) rows are not publicly recommendable references.
    const verifiedRegion = pool.filter((x) => x.verified === true && x.region === region && isFinite(Number(x.percent_bps)));
    const paygCandidates = verifiedRegion
      .filter((x) => (Number(x.terminal_rental_monthly_minor) || 0) === 0)
      .sort((a, b) => a.percent_bps - b.percent_bps);
    const subCandidates = verifiedRegion
      .filter((x) => (Number(x.terminal_rental_monthly_minor) || 0) > 0)
      .sort((a, b) => a.percent_bps - b.percent_bps);
    const paygRow = paygCandidates[0] || null;
    const subRow = subCandidates[0] || null;
    return deriveSubVsPayg(inputSnapshot, paygRow, subRow);
  }, [pool, inputSnapshot, region]);

  if (channel !== "in_store" && !isCombined) return null;
  if (!rental.available && !split.available && !subVsPayg.available) return null;

  const rentalMaxBps = rental.available ? rental.current_bps : 1;

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-white font-black" style={{ fontFamily: "'Space Grotesk','Inter',sans-serif", fontSize: 20, letterSpacing: "-0.02em" }}>
          {t("instore_section_title")}
        </h3>
        <p className="text-[12px] text-white/45 mt-1">{t("instore_section_sub")}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* 1 — Terminal rental as its own cost (inside the rate, not on top) */}
        {rental.available && (
          <InsightCard
            label={t("instore_rental_title")}
            note={t("instore_rental_note", { month: eur(rental.rental_month_eur), impact: pct(rental.rental_pct) })}
            span={2}
            accent="amber"
          >
            <div className="flex items-baseline gap-2 mb-3">
              <span className="tabular-nums" style={{ ...bigNum, color: "rgb(245,181,68)" }}>{eur(rental.rental_month_eur)}</span>
              <span className="text-[11px] text-white/40">{t("instore_rental_per_month")}</span>
              <span className="text-[12px] text-white/50 ml-2" style={{ fontFamily: MONO }}>
                = +{pct(rental.rental_pct)} {t("instore_rental_effective")}
              </span>
            </div>
            <div className="space-y-3.5 mt-1">
              <RateBar
                label={`${t("instore_rental_part")} · ${pct(rental.rental_pct)}`}
                valueLabel={`${eur(rental.rental_year_eur)}${t("ins_layer_per_year")}`}
                pctOfMax={(rental.rental_bps / rentalMaxBps) * 100}
                color="rgba(245,181,68,0.8)"
              />
              <RateBar
                label={`${t("instore_rental_rest")} · ${pct(rental.rest_pct)}`}
                valueLabel={pct(rental.rest_pct)}
                pctOfMax={(rental.rest_bps / rentalMaxBps) * 100}
                color="rgba(255,255,255,0.4)"
              />
            </div>
            <p className="text-[10px] text-white/40 mt-3">
              {t("instore_rental_coherence", { total: pct(rental.current_pct) })}
            </p>
          </InsightCard>
        )}

        {/* 2 — Online vs in-store split (combined only; auto-hides today) */}
        {split.available && (
          <InsightCard label={t("instore_split_title")} note={t("instore_split_note")} span={2} accent="cyan">
            <div className="space-y-3 mt-1">
              {split.channels.map((c) => (
                <div key={c.channel} className="flex items-baseline justify-between gap-3">
                  <span className="text-[12px] font-semibold text-white/85">
                    {c.channel === "in_store" ? t("acct_channels_in_store") : t("acct_channels_online")} · {pct(c.rate_pct)}
                  </span>
                  <span className="tabular-nums text-white/80 text-[12px] font-bold" style={{ fontFamily: MONO }}>
                    {eur(c.annual_fees_eur)}{t("ins_layer_per_year")} · {eur(c.annual_savings_eur)} {t("instore_split_savings")}
                  </span>
                </div>
              ))}
              <div className="pt-2 mt-1 flex items-baseline justify-between gap-3" style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}>
                <span className="text-[11px] uppercase tracking-[0.14em] font-bold text-white/50">{t("instore_split_total")}</span>
                <span className="tabular-nums text-cyan-300 text-[13px] font-bold" style={{ fontFamily: MONO }}>{eur(split.total_savings_eur)}</span>
              </div>
            </div>
          </InsightCard>
        )}

        {/* 3 — Subscription vs pay-as-you-go crossover (informative, neutral) */}
        {subVsPayg.available && (
          <InsightCard
            label={t("instore_subpayg_title")}
            note={t("instore_subpayg_disclaimer")}
            span={2}
            accent="cyan"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 mt-1">
              <div>
                <p className="text-[10px] uppercase tracking-[0.14em] text-white/40 mb-1" style={{ fontFamily: MONO }}>{t("instore_subpayg_crossover")}</p>
                <span className="tabular-nums" style={{ ...bigNum, color: "#7BD9F0", fontSize: 24 }}>{eur(subVsPayg.crossover_gmv_eur)}</span>
                <span className="text-[11px] text-white/40 ml-1">{t("ins_per_month_full")}</span>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-[0.14em] text-white/40 mb-1" style={{ fontFamily: MONO }}>{t("instore_subpayg_yours")}</p>
                <span className="tabular-nums text-white/85" style={{ fontFamily: MONO, fontSize: 20, fontWeight: 700 }}>{eur(subVsPayg.monthly_gmv)}</span>
                <span className="text-[11px] text-white/40 ml-1">{t("ins_per_month_full")}</span>
              </div>
            </div>
            <p className="text-[12px] mt-3 font-semibold" style={{ color: subVsPayg.sub_wins ? "rgb(45,212,191)" : "rgba(255,255,255,0.7)" }}>
              {subVsPayg.sub_wins
                ? t("instore_subpayg_verdict_sub", { delta: eur(subVsPayg.monthly_delta_eur) })
                : t("instore_subpayg_verdict_payg", { delta: eur(subVsPayg.monthly_delta_eur) })}
            </p>
            <p className="text-[10px] text-white/40 mt-2">{t("instore_subpayg_cambra")}</p>
          </InsightCard>
        )}
      </div>
    </div>
  );
}