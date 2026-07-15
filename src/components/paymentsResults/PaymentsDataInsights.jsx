// PaymentsDataInsights — Phase-1 "data insights" grid, shared by the report
// (PaymentsResults) and the dashboard.
//
// SINGLE SOURCE OF TRUTH: everything is derived by derivePaymentsInsights()
// from engine_result + input_snapshot — the SAME numbers the hero shows. No
// insight is ever fabricated: when the data isn't there, the tile is hidden.
//
// Tiles (Phase 1): total fees · GMV+effective% · layered blended → margin ·
// card mix (debit/credit + domestic/intl, €/segment + IFR note) · cost per
// transaction + tx/month · cross-border cost · fixed-fee drag.
// (Gap-to-peer lives in PeerBenchmark, which owns the benchmark source.)

import { useMemo } from "react";
import { useTranslation } from "@/lib/i18n.jsx";
import { derivePaymentsInsights } from "@/lib/paymentsInsights.js";
import InsightCard, { INSIGHT_MONO as MONO } from "@/components/paymentsResults/InsightCard";
import EuroCountUp from "@/components/paymentsResults/EuroCountUp";

const eur = (n) => (isFinite(n) ? "€" + Math.round(n).toLocaleString("en-US") : "—");
const eur2 = (n) => (isFinite(n) ? "€" + Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—");
const pct = (n) => (isFinite(n) ? n.toFixed(2) + "%" : "—");
const int = (n) => (isFinite(n) ? Math.round(n).toLocaleString("en-US") : "—");

const bigNum = { fontFamily: MONO, fontSize: 28, fontWeight: 800, letterSpacing: "-0.02em", lineHeight: 1 };

// One horizontal bar in the layered / segment breakdowns.
function SegBar({ label, valueLabel, pctOfMax, color, negotiable, negotiableLabel, note }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-[12px] font-semibold text-white/85 truncate">{label}</span>
          {negotiable && (
            <span className="inline-flex items-center gap-1 text-[9px] uppercase tracking-[0.12em] font-bold px-1.5 py-0.5 rounded-full shrink-0"
              style={{ background: "rgba(34,211,238,0.14)", color: "rgb(34,211,238)", border: "1px solid rgba(34,211,238,0.35)" }}>
              {negotiableLabel}
            </span>
          )}
        </div>
        <span className="tabular-nums text-white/80 text-[12px] font-bold shrink-0" style={{ fontFamily: MONO }}>{valueLabel}</span>
      </div>
      <div className="h-2 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.05)" }}>
        <div className="h-full rounded-full transition-all" style={{ width: `${Math.max(2, Math.min(100, pctOfMax))}%`, background: color }} />
      </div>
      {note && <p className="text-[10px] text-white/40">{note}</p>}
    </div>
  );
}

export default function PaymentsDataInsights({ engineResult, inputSnapshot }) {
  const { t } = useTranslation();
  const ins = useMemo(() => derivePaymentsInsights(engineResult, inputSnapshot), [engineResult, inputSnapshot]);

  if (!engineResult) return null;

  const { totalFees, gmvEffective, layered, debitCredit, domesticIntl, perTransaction, crossBorder, fixedDrag } = ins;

  // Nothing to show → render nothing (honest).
  const anyAvailable =
    totalFees.available || gmvEffective.available || layered.available ||
    debitCredit.available || domesticIntl.available || perTransaction.available ||
    crossBorder.available || fixedDrag.available;
  if (!anyAvailable) return null;

  // Layered bars scale to the largest layer.
  const maxLayerBps = layered.available ? Math.max(...layered.layers.map((l) => l.bps)) : 1;

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-white font-black" style={{ fontFamily: "'Space Grotesk','Inter',sans-serif", fontSize: 20, letterSpacing: "-0.02em" }}>
          {t("ins_section_title")}
        </h3>
        <p className="text-[12px] text-white/45 mt-1">{t("ins_section_sub")}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* 1 — Total fees paid (gross cost) */}
        {totalFees.available && (
          <InsightCard label={t("ins_total_fees_label")} note={t("ins_total_fees_note")} accent="red">
            <div className="flex items-baseline gap-2">
              <EuroCountUp value={totalFees.annual} className="tabular-nums" style={{ ...bigNum, color: "#f87171" }} />
              <span className="text-[11px] text-white/40">{t("ins_per_year_full")}</span>
            </div>
            <p className="text-[12px] text-white/50 mt-1" style={{ fontFamily: MONO }}>{eur(totalFees.monthly)} {t("ins_per_month_full")}</p>
          </InsightCard>
        )}

        {/* 2 — GMV + effective % */}
        {gmvEffective.available && (
          <InsightCard label={t("ins_effective_label")} note={t("ins_effective_note", { pct: pct(gmvEffective.effective_pct) })} accent="cyan">
            <div className="flex items-baseline gap-2">
              <span className="tabular-nums" style={{ ...bigNum, color: "#67e8f9" }}>{pct(gmvEffective.effective_pct)}</span>
            </div>
            <p className="text-[12px] text-white/50 mt-1" style={{ fontFamily: MONO }}>
              {t("ins_gmv_label")}: {eur(gmvEffective.annual_gmv)}/{t("ins_per_year_full")}
            </p>
          </InsightCard>
        )}

        {/* 3 — Blended → layered (interchange + scheme + negotiable margin) */}
        {layered.available && (
          <InsightCard label={t("ins_layered_title")} note={t("ins_layered_sub")} span={2} accent="cyan">
            <div className="space-y-3.5 mt-1">
              {layered.layers.map((l) => (
                <SegBar
                  key={l.key}
                  label={l.key === "interchange" ? t("ins_layer_interchange") : l.key === "scheme" ? t("ins_layer_scheme") : t("ins_layer_margin")}
                  valueLabel={`${eur(l.annual_eur)}${t("ins_layer_per_year")}`}
                  pctOfMax={(l.bps / maxLayerBps) * 100}
                  color={l.negotiable ? "linear-gradient(90deg, #22d3ee 0%, #3b82f6 100%)" : l.key === "interchange" ? "rgba(255,255,255,0.55)" : "rgba(255,255,255,0.38)"}
                  negotiable={l.negotiable}
                  negotiableLabel={t("ins_layer_negotiable")}
                  note={l.key === "interchange" ? t("ins_layer_interchange_note") : l.key === "scheme" ? t("ins_layer_scheme_note") : t("ins_layer_margin_note")}
                />
              ))}
            </div>
          </InsightCard>
        )}

        {/* 4 — Card mix & cost (debit/credit + domestic/intl) */}
        {(debitCredit.available || domesticIntl.available) && (
          <InsightCard label={t("ins_cardmix_title")} accent="cyan" span={2}
            note={debitCredit.available && debitCredit.debit_overpay_annual > 0
              ? t("ins_cardmix_ifr_note", { ideal: debitCredit.ifr_debit_pct.toFixed(2), overpay: eur(debitCredit.debit_overpay_annual) })
              : null}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3.5 mt-1">
              {debitCredit.available && (
                <>
                  <SegBar label={`${t("ins_cardmix_debit")} · ${debitCredit.debit_pct.toFixed(0)}%`} valueLabel={`${eur(debitCredit.debit_fees_annual)}${t("ins_layer_per_year")}`} pctOfMax={debitCredit.debit_pct} color="rgba(96,165,250,0.75)" />
                  <SegBar label={`${t("ins_cardmix_credit")} · ${debitCredit.credit_pct.toFixed(0)}%`} valueLabel={`${eur(debitCredit.credit_fees_annual)}${t("ins_layer_per_year")}`} pctOfMax={debitCredit.credit_pct} color="rgba(168,85,247,0.7)" />
                </>
              )}
              {domesticIntl.available && (
                <>
                  <SegBar label={`${t("ins_cardmix_domestic")} · ${domesticIntl.domestic_pct.toFixed(0)}%`} valueLabel={`${eur(domesticIntl.domestic_fees_annual)}${t("ins_layer_per_year")}`} pctOfMax={domesticIntl.domestic_pct} color="rgba(255,255,255,0.5)" />
                  <SegBar label={`${t("ins_cardmix_intl")} · ${domesticIntl.intl_pct.toFixed(0)}%`} valueLabel={`${eur(domesticIntl.intl_fees_annual)}${t("ins_layer_per_year")}`} pctOfMax={domesticIntl.intl_pct} color="rgba(45,212,191,0.7)" />
                </>
              )}
            </div>
          </InsightCard>
        )}

        {/* 5 — Cost per transaction + tx/month */}
        {perTransaction.available && (
          <InsightCard label={t("ins_pertx_title")} note={t("ins_pertx_ticket", { ticket: eur2(perTransaction.avg_ticket) })} accent="cyan">
            <div className="flex items-baseline justify-between gap-3">
              <div>
                <span className="tabular-nums" style={{ ...bigNum, color: "#67e8f9", fontSize: 24 }}>{eur2(perTransaction.cost_per_tx)}</span>
                <p className="text-[10px] uppercase tracking-[0.14em] text-white/40 mt-1" style={{ fontFamily: MONO }}>{t("ins_pertx_cost")}</p>
              </div>
              <div className="text-right">
                <span className="tabular-nums text-white/85" style={{ fontFamily: MONO, fontSize: 20, fontWeight: 700 }}>{int(perTransaction.tx_per_month)}</span>
                <p className="text-[10px] uppercase tracking-[0.14em] text-white/40 mt-1" style={{ fontFamily: MONO }}>{t("ins_pertx_count")}</p>
              </div>
            </div>
          </InsightCard>
        )}

        {/* 6 — Cross-border cost */}
        {crossBorder.available ? (
          <InsightCard label={t("ins_crossborder_title")} note={t("ins_crossborder_note", { pct: crossBorder.intl_pct.toFixed(0) })} accent="amber">
            <div className="flex items-baseline gap-2">
              <EuroCountUp value={crossBorder.annual_eur} className="tabular-nums" style={{ ...bigNum, color: "rgb(245,181,68)", fontSize: 24 }} />
              <span className="text-[11px] text-white/40">{t("ins_per_year_full")}</span>
            </div>
          </InsightCard>
        ) : crossBorder.reason === "not_modeled" ? (
          <InsightCard label={t("ins_crossborder_title")} note={t("ins_crossborder_notmodeled")} accent="neutral">
            <span className="tabular-nums text-white/35" style={{ ...bigNum, fontSize: 24 }}>—</span>
          </InsightCard>
        ) : null}

        {/* 8 — Fixed-fee drag */}
        {fixedDrag.available && (
          <InsightCard label={t("ins_fixeddrag_title")} accent="cyan"
            note={t("ins_fixeddrag_note", { ticket: eur2(fixedDrag.avg_ticket), fee: eur2(fixedDrag.fixed_fee_eur), drag: fixedDrag.drag_pct.toFixed(2) })}>
            <div className="flex items-baseline gap-2">
              <span className="tabular-nums" style={{ ...bigNum, color: "#67e8f9", fontSize: 24 }}>+{pct(fixedDrag.drag_pct)}</span>
            </div>
          </InsightCard>
        )}
      </div>
    </div>
  );
}