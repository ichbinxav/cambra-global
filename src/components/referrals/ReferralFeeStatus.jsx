import { feeForActivated, nextFeePct, FLOOR_FEE_PCT } from "@/lib/referralProgram";
import { useTranslation } from "@/lib/i18n.jsx";

// REFERRAL-1 — the merchant's own state: current fee, activated referrals,
// link usage, and what the next activated referral would do. Aggregates only:
// no names, no third-party figures.
export default function ReferralFeeStatus({ activatedCount, timesUsed }) {
  const { t } = useTranslation();
  const fee = feeForActivated(activatedCount);
  const next = nextFeePct(activatedCount);

  const tiles = [
    { label: t("ref_fee_label"), value: `${fee}%` },
    { label: t("ref_activated_label"), value: String(activatedCount) },
    { label: t("ref_used_label"), value: String(timesUsed) },
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
        {next !== null
          ? t("ref_next_step").replace("{next}", `${next}%`)
          : t("ref_floor_note").replace("{floor}", `${FLOOR_FEE_PCT}%`)}
      </p>
    </div>
  );
}