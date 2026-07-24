// AccountSummaryPanel — Phase 2 account aggregate (dashboard).
//
// Shown ONLY when the aggregate spans >1 DISTINCT channel (online + in-store)
// AND passes its own coherence check (_coherent). Re-runs of the same channel
// are deduped to the latest by derivePaymentsAccount — never summed — so a
// single-channel account (re-runs of one business) adds nothing over the hero
// and this panel stays hidden. Honest over pretty.
//
// SINGLE SOURCE OF TRUTH: everything is derivePaymentsAccount() over the
// persisted AnalyzerResult rows — money summed, blended rate GMV-weighted,
// nothing recomputed against a different model, nothing fabricated.

import { useMemo } from "react";
import { useTranslation } from "@/lib/i18n.jsx";
import { derivePaymentsAccount } from "@/lib/paymentsAccount.js";
import { INSIGHT_MONO as MONO } from "@/components/paymentsResults/InsightCard";
import EuroCountUp from "@/components/paymentsResults/EuroCountUp";
import { Layers } from "lucide-react";

const eur = (n) => (isFinite(n) ? "€" + Math.round(n).toLocaleString("en-US") : "—");
const pct = (n) => (isFinite(n) ? n.toFixed(2) + "%" : "—");
const bigNum = { fontFamily: MONO, fontSize: 26, fontWeight: 800, letterSpacing: "-0.02em", lineHeight: 1 };

// Confidence meter — 3 filled segments = verified, 2 = provisional, 1 = estimated.
const CONF_LEVEL = { verified: 3, pending_verification: 2, estimated: 1 };
const CONF_COLOR = {
  verified: "#2FE0A8",           // emerald
  pending_verification: "var(--voltio-2)", // violet
  estimated: "#F5A623",          // amber
};
const CONF_KEY = {
  verified: "acct_conf_verified",
  pending_verification: "acct_conf_provisional",
  estimated: "acct_conf_estimated",
};

function ConfidenceMeter({ level }) {
  const filled = CONF_LEVEL[level] || 1;
  const color = CONF_COLOR[level] || CONF_COLOR.estimated;
  return (
    <div className="flex items-center gap-1.5">
      {[1, 2, 3].map((seg) => (
        <span
          key={seg}
          className="h-1.5 w-6 rounded-full transition-all"
          style={{ background: seg <= filled ? color : "rgba(255,255,255,0.10)" }}
        />
      ))}
    </div>
  );
}

function Stat({ label, children, note, accent = "cyan" }) {
  const accentColor = accent === "red" ? "rgb(248,113,113)" : accent === "emerald" ? "rgb(52,211,153)" : "rgb(103,232,249)";
  return (
    <div>
      <p className="uppercase font-bold mb-2" style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: "0.16em", color: accentColor, opacity: 0.85 }}>
        {label}
      </p>
      {children}
      {note && <p className="text-[10.5px] text-white/40 mt-1.5 leading-snug">{note}</p>}
    </div>
  );
}

export default function AccountSummaryPanel({ rows }) {
  const { t } = useTranslation();
  const acc = useMemo(() => derivePaymentsAccount(rows), [rows]);

  // Guard: aggregate must span >1 distinct channel (else it duplicates the hero)
  // and pass its own coherence check (honest over pretty).
  if (!acc.available || !acc.adds_value_over_hero || !acc._coherent) return null;

  const channelLabel = acc.channels
    .map((c) => (c === "in_store" ? t("acct_channels_in_store") : t("acct_channels_online")))
    .join(" · ");

  return (
    <div
      className="relative rounded-3xl p-6 overflow-hidden"
      style={{
        background:
          "radial-gradient(120% 80% at 0% 0%, rgba(31,78,216,0.14) 0%, transparent 55%), radial-gradient(100% 100% at 100% 100%, rgba(44,167,193,0.10) 0%, transparent 60%), linear-gradient(180deg, #0b1020 0%, #070c16 100%)",
        border: "1px solid rgba(255,255,255,0.10)",
        boxShadow: "0 24px 64px -28px rgba(0,0,0,0.55)",
      }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.035) 1px, transparent 1px)",
          backgroundSize: "40px 40px",
          opacity: 0.5,
          maskImage: "radial-gradient(ellipse 90% 90% at 50% 0%, #000 30%, transparent 80%)",
          WebkitMaskImage: "radial-gradient(ellipse 90% 90% at 50% 0%, #000 30%, transparent 80%)",
        }}
      />
      <div className="relative z-10">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 mb-5">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1.5">
              <Layers size={13} className="text-cyan-300" />
              <span className="uppercase font-bold" style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.2em", color: "#585868" }}>
                {channelLabel}
              </span>
            </div>
            <h3 className="text-white font-black" style={{ fontFamily: "'Space Grotesk','Inter',sans-serif", fontSize: 22, letterSpacing: "-0.03em", lineHeight: 1.05 }}>
              {t("acct_title")}
            </h3>
            <p className="text-[12px] text-white/45 mt-1">{t("acct_sub", { n: acc.count })}</p>
          </div>
          <div className="text-right shrink-0">
            <p className="uppercase font-bold mb-1.5" style={{ fontFamily: MONO, fontSize: 9, letterSpacing: "0.16em", color: "#585868" }}>
              {t("acct_confidence")}
            </p>
            <ConfidenceMeter level={acc.confidence} />
          </div>
        </div>

        {/* Stat grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-5">
          <Stat label={t("acct_total_gmv")} accent="cyan">
            <span className="tabular-nums text-white/90" style={bigNum}>{eur(acc.total_annual_gmv)}</span>
          </Stat>
          <Stat label={t("acct_total_fees")} accent="red">
            <EuroCountUp value={acc.total_annual_fees} className="tabular-nums" style={{ ...bigNum, color: "#F45B69" }} />
          </Stat>
          <Stat label={t("acct_blended_rate")} accent="cyan" note={t("acct_blended_note")}>
            <span className="tabular-nums" style={{ ...bigNum, color: "#7BD9F0" }}>{pct(acc.blended_effective_pct)}</span>
          </Stat>
          <Stat label={t("acct_total_savings")} accent="emerald" note={t("acct_savings_note")}>
            <EuroCountUp value={acc.total_annual_savings} className="tabular-nums" style={{ ...bigNum, color: "#2FE0A8" }} />
          </Stat>
        </div>

        {/* Confidence caption */}
        <p className="text-[11px] text-white/45 mt-5 pt-4" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
          {t(CONF_KEY[acc.confidence] || "acct_conf_estimated")}
        </p>
      </div>
    </div>
  );
}