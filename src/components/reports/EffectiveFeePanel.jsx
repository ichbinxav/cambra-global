// EffectiveFeePanel — REFERRAL-2 T3 (2026-08-03).
//
// AUTHENTICATED SURFACE ONLY (rendered inside /Reports, behind DashboardLayout).
// Shows the merchant's REAL success fee — 25%, 20%, 15%, 10% or 5% — instead of
// the generic 25%, plus what they keep after it. The percentage is derived from
// their own activated_count through the shared ladder (src/lib/referralProgram),
// the same module that feeds the BillingRule written server-side.
//
// The anonymous teaser is untouched: this component is never mounted there and
// getPaymentsGapTeaser's allowlist gained no field.

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useTranslation } from "@/lib/i18n.jsx";
import { feeForActivated, BASE_FEE_PCT } from "@/lib/referralProgram";
import { ArrowRight } from "lucide-react";

export default function EffectiveFeePanel({ report }) {
  const { t } = useTranslation();
  const [activated, setActivated] = useState(null);

  useEffect(() => {
    base44.functions.invoke("getMyReferralStatus", {})
      .then((r) => setActivated(Number(r?.data?.activated_count) || 0))
      .catch(() => setActivated(0));
  }, []);

  if (activated === null) return null;

  const fee = feeForActivated(activated);
  const discounted = fee < BASE_FEE_PCT;
  const savings = Number(report?.savings || 0);
  const feeAmount = savings > 0 ? savings * (fee / 100) : 0;
  const net = Math.max(0, savings - feeAmount);
  const eur = (n) => `€${Math.round(n).toLocaleString()}`;

  return (
    <div className="cambra-card p-7 mb-6">
      <div className="relative">
        <p className="cc-eyebrow mb-1">{t("rep_fee_eyebrow")}</p>
        <p className="text-sm font-semibold text-white mb-5">{t("rep_fee_title")}</p>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-white/10 p-4 bg-white/[0.04]">
            <p className="text-xs text-white/55 mb-2">{t("rep_fee_current")}</p>
            <p className="text-lg font-black text-white tabular-nums">{fee}%</p>
          </div>
          <div className="rounded-xl border border-white/10 p-4 bg-white/[0.04]">
            <p className="text-xs text-white/55 mb-2">{t("rep_fee_savings")}</p>
            <p className="text-lg font-black text-white tabular-nums">
              {savings > 0 ? eur(savings) : "—"}
            </p>
          </div>
          <div className="rounded-xl border border-white/10 p-4 bg-white/[0.04]">
            <p className="text-xs text-white/55 mb-2">{t("rep_fee_net")}</p>
            <p className="text-lg font-black tabular-nums" style={{ color: "#2FE0A8" }}>
              {savings > 0 ? eur(net) : "—"}
            </p>
          </div>
        </div>

        <p className="mt-4 text-[12.5px] text-white/60 leading-relaxed">
          {discounted
            ? t(activated === 1 ? "rep_fee_discount_one" : "rep_fee_discount_other")
                .replace("{fee}", `${fee}%`)
                .replace("{n}", String(activated))
            : t("rep_fee_standard")}
        </p>
        <Link
          to="/Referrals"
          className="mt-3 inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-white/75 hover:text-white transition-colors"
        >
          {t("rep_fee_link")} <ArrowRight size={13} />
        </Link>
      </div>
    </div>
  );
}