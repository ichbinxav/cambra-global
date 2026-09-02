import { FLOOR_FEE_PCT, feeForActivated, nextFeePct } from "@/lib/referralProgram";
import { effectiveRecoverFeeForPhase } from "@/lib/recoveryEconomicsV2";
import { useTranslation } from "@/lib/i18n.jsx";

// REFERRAL-1 — the merchant's own state: current fee, activated referrals,
// link usage, and what the next activated referral would do. Aggregates only:
// no names, no third-party figures.
export default function ReferralFeeStatus({ activatedCount, timesUsed, economicsVersion = "legacy-v1", entryDiscountPoints = 0 }) {
  const { t } = useTranslation();
  const isV2 = economicsVersion === "recover-economics-v2";
  const entryPoints = Math.max(0, Number(entryDiscountPoints) || 0);
  const legacyFee = feeForActivated(activatedCount, entryPoints);
  const legacyNext = nextFeePct(activatedCount, entryPoints);
  const year1Fee = effectiveRecoverFeeForPhase(25 - entryPoints, activatedCount);
  const year2Fee = effectiveRecoverFeeForPhase(15 - entryPoints, activatedCount);
  const nextYear1 = year1Fee > FLOOR_FEE_PCT ? effectiveRecoverFeeForPhase(25 - entryPoints, activatedCount + 1) : null;
  const nextYear2 = year2Fee > FLOOR_FEE_PCT ? effectiveRecoverFeeForPhase(15 - entryPoints, activatedCount + 1) : null;

  const tiles = isV2 ? [
    { label: t("ref_fee_y1_label"), value: `${year1Fee}%` },
    { label: t("ref_fee_y2_label"), value: `${year2Fee}%` },
    { label: t("ref_activated_label"), value: String(activatedCount) },
  ] : [
    { label: t("ref_fee_label"), value: `${legacyFee}%` },
    { label: t("ref_activated_label"), value: String(activatedCount) },
    { label: t("ref_used_label"), value: String(timesUsed) },
  ];

  return (
    <div className="cambra-card p-5 sm:p-6">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {tiles.map((tile) => (
          <div key={tile.label} className="rounded-xl border border-white/[.07] bg-white/[.025] px-4 py-3.5">
            <p className="text-[9.5px] uppercase tracking-[0.16em] font-bold text-white/45 mb-1.5 leading-tight min-h-[24px]">
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
        {isV2
          ? (nextYear1 !== null || nextYear2 !== null
              ? t("ref_next_step_v2").replace("{y1}", `${nextYear1 ?? FLOOR_FEE_PCT}%`).replace("{y2}", `${nextYear2 ?? FLOOR_FEE_PCT}%`)
              : t("ref_floor_note").replace("{floor}", `${FLOOR_FEE_PCT}%`))
          : (legacyNext !== null ? t("ref_next_step").replace("{next}", `${legacyNext}%`) : t("ref_floor_note").replace("{floor}", `${FLOOR_FEE_PCT}%`))}
        {isV2 && <span className="block mt-1 text-white/40">{t("ref_used_label")}: {timesUsed}</span>}
        {entryPoints > 0 && (
          <span className="mt-2 block font-semibold text-cambra-cyan">
            20% · {t("ref_land_t3_note").replace("{base}", "25%")}
          </span>
        )}
      </p>
    </div>
  );
}
