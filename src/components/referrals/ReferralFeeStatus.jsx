import { FLOOR_FEE_PCT } from "@/lib/referralProgram";
import { effectiveFee } from "../../../base44/shared/recoveryEconomicsV2.ts";
import { useTranslation } from "@/lib/i18n.jsx";

// REFERRAL-1 — the merchant's own state: current fee, activated referrals,
// link usage, and what the next activated referral would do. Aggregates only:
// no names, no third-party figures.
export default function ReferralFeeStatus({ activatedCount, timesUsed }) {
  const { t } = useTranslation();
  const year1Fee = effectiveFee(25, activatedCount);
  const year2Fee = effectiveFee(15, activatedCount);
  const nextYear1 = year1Fee > FLOOR_FEE_PCT ? effectiveFee(25, activatedCount + 1) : null;
  const nextYear2 = year2Fee > FLOOR_FEE_PCT ? effectiveFee(15, activatedCount + 1) : null;

  const tiles = [
    { label: t("ref_fee_y1_label"), value: `${year1Fee}%` },
    { label: t("ref_fee_y2_label"), value: `${year2Fee}%` },
    { label: t("ref_activated_label"), value: String(activatedCount) },
  ];

  return (
    <div
      className="rounded-2xl p-5 sm:p-6"
      style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.10)" }}
    >
      <div className="grid grid-cols-3 gap-3">
        {tiles.map((tile) => (
          <div key={tile.label}>
            <p className="text-[9.5px] uppercase tracking-[0.16em] font-bold text-white/45 mb-1.5 leading-tight">
              {tile.label}
            </p>
            <p
              className="font-black tabular-nums text-white"
              style={{ fontFamily: "'Space Grotesk', 'Inter', sans-serif", fontSize: "26px", letterSpacing: "-0.03em" }}
            >
              {tile.value}
            </p>
          </div>
        ))}
      </div>
      <p className="mt-4 pt-4 text-[12.5px] leading-relaxed text-white/60" style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}>
        {nextYear1 !== null || nextYear2 !== null
          ? t("ref_next_step_v2").replace("{y1}", `${nextYear1 ?? FLOOR_FEE_PCT}%`).replace("{y2}", `${nextYear2 ?? FLOOR_FEE_PCT}%`)
          : t("ref_floor_note").replace("{floor}", `${FLOOR_FEE_PCT}%`)}
        <span className="block mt-1 text-white/40">{t("ref_used_label")}: {timesUsed}</span>
      </p>
    </div>
  );
}