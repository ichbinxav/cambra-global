// InStoreBenchmarkPanel — Checkpoint H (2026-08-06).
//
// The in-store terminal (TPV) block, extracted from src/pages/Reports.jsx and
// translated. The arithmetic is byte-for-byte the original: same fields, same
// getBenchmarks fallback, same rounding.

import { useTranslation } from "@/lib/i18n.jsx";
import { getBenchmarks } from "@/lib/scoreEngine";

const eur = (n) => `€${Math.round(n).toLocaleString()}`;

export default function InStoreBenchmarkPanel({ result, brand }) {
  const { t } = useTranslation();

  const details = result?.details || {};
  const effectiveRate = details.tpe_effective_rate || 0;
  const benchmarkRate =
    details.tpe_optimal_rate ||
    getBenchmarks(details.monthly_revenue || 50000, brand?.country || "").tpe.rate;
  const tpeSavings = details.tpe_savings || 0;
  const annualInStoreCost = details.annual_gmv && effectiveRate ? details.annual_gmv * (effectiveRate / 100) : 0;
  const benchmarkCost = details.annual_gmv && benchmarkRate ? details.annual_gmv * (benchmarkRate / 100) : 0;

  const perYear = t("rpt_per_year");

  return (
    <div className="cambra-card p-7 mb-6">
      <div className="relative">
        <div className="mb-4">
          <p className="cc-eyebrow mb-1">{t("rpt_tpv_eyebrow")}</p>
          <p className="text-sm font-semibold text-white">{t("rpt_tpv_title")}</p>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-xl border border-white/10 p-4 bg-white/[0.04]">
            <p className="text-xs text-white/55 mb-2">{t("rpt_tpv_current")}</p>
            <p className="text-lg font-black text-white">{eur(annualInStoreCost)}{perYear}</p>
            <p className="text-xs text-white/55 mt-2">{t("rpt_tpv_eff_rate", { rate: effectiveRate.toFixed(2) })}</p>
          </div>
          <div className="rounded-xl border border-white/10 p-4 bg-white/[0.04]">
            <p className="text-xs text-white/55 mb-2">{t("rpt_tpv_benchmark")}</p>
            <p className="text-lg font-black text-white">{eur(benchmarkCost)}{perYear}</p>
            <p className="text-xs text-white/55 mt-2">{t("rpt_tpv_net_rate", { rate: benchmarkRate.toFixed(2) })}</p>
          </div>
          <div className="rounded-xl border border-white/10 p-4 bg-white/[0.04]">
            <p className="text-xs text-white/55 mb-2">{t("rpt_tpv_opportunity")}</p>
            <p className="text-lg font-black text-[#FFB05A]">{eur(tpeSavings)}{perYear}</p>
            <p className="text-xs text-white/55 mt-2">{t("rpt_tpv_reco")}</p>
          </div>
          <div className="rounded-xl border border-white/10 p-4 bg-white/[0.04]">
            <p className="text-xs text-white/55 mb-2">{t("rpt_tpv_next")}</p>
            <p className="text-sm font-semibold text-white">{t("rpt_tpv_next_val")}</p>
            <p className="text-xs text-white/55 mt-2">{t("rpt_tpv_next_note")}</p>
          </div>
        </div>
      </div>
    </div>
  );
}