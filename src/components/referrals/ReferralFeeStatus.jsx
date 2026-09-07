import { Check } from "lucide-react";
import { FLOOR_FEE_PCT, feeForActivated, nextFeePct } from "@/lib/referralProgram";
import { effectiveRecoverFeeForPhase } from "@/lib/recoveryEconomicsV2";
import { useTranslation } from "@/lib/i18n.jsx";

const LADDER = [25, 20, 15, 10, 5];

export default function ReferralFeeStatus({
  activatedCount,
  registeredCount = 0,
  timesUsed,
  economicsVersion = "legacy-v1",
  entryDiscountPoints = 0,
}) {
  const { t } = useTranslation();
  const isV2 = economicsVersion === "recover-economics-v2";
  const entryPoints = Math.max(0, Number(entryDiscountPoints) || 0);
  const legacyFee = feeForActivated(activatedCount, entryPoints);
  const legacyNext = nextFeePct(activatedCount, entryPoints);
  const year1Fee = effectiveRecoverFeeForPhase(25 - entryPoints, activatedCount);
  const year2Fee = effectiveRecoverFeeForPhase(15 - entryPoints, activatedCount);
  const nextYear1 = year1Fee > FLOOR_FEE_PCT ? effectiveRecoverFeeForPhase(25 - entryPoints, activatedCount + 1) : null;
  const nextYear2 = year2Fee > FLOOR_FEE_PCT ? effectiveRecoverFeeForPhase(15 - entryPoints, activatedCount + 1) : null;
  const currentFee = isV2 ? year1Fee : legacyFee;
  const nextCopy = isV2
    ? (nextYear1 !== null || nextYear2 !== null
        ? t("ref_next_step_v2", { y1: `${nextYear1 ?? FLOOR_FEE_PCT}%`, y2: `${nextYear2 ?? FLOOR_FEE_PCT}%` })
        : t("ref_floor_note", { floor: `${FLOOR_FEE_PCT}%` }))
    : (legacyNext !== null
        ? t("ref_next_step", { next: `${legacyNext}%` })
        : t("ref_floor_note", { floor: `${FLOOR_FEE_PCT}%` }));

  return (
    <div className="cambra-dark-panel min-h-[430px] p-7 sm:p-9">
      <div className="flex items-start justify-between gap-5">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[.16em] text-[#AFA2FF]">{t("ref_fee_label")}</p>
          <h2 className="mt-3 text-[clamp(30px,3.3vw,46px)] font-bold tracking-[-.05em] text-white">{currentFee}%</h2>
        </div>
        <span className="rounded-full border border-white/15 bg-white/[.06] px-3 py-1.5 text-[10px] font-bold text-white/70">{activatedCount} · {t("ref_activated_label")}</span>
      </div>

      <div className="mt-10 grid grid-cols-5">
        {LADDER.map((fee, index) => {
          const reached = fee >= currentFee;
          const current = fee === currentFee;
          return (
            <div key={fee} className="relative text-center">
              {index < LADDER.length - 1 && <span aria-hidden="true" className={`absolute left-1/2 top-[38px] h-px w-full ${reached && LADDER[index + 1] >= currentFee ? "bg-[#7867FF]" : "bg-white/24"}`} />}
              <strong className={`block text-[18px] font-bold tabular-nums ${reached ? "text-white" : "text-white/43"}`}>{fee}%</strong>
              <span className={`relative z-10 mx-auto mt-4 flex h-5 w-5 items-center justify-center rounded-full border-2 ${current ? "border-white bg-[#6D5AFF] shadow-[0_0_0_7px_rgba(109,90,255,.17),0_0_24px_rgba(109,90,255,.86)]" : reached ? "border-[#8B7BFF] bg-[#5B4CF5]" : "border-white/55 bg-[#0B1731]"}`}>
                {reached && !current && <Check size={10} strokeWidth={3} />}
              </span>
              <span className={`mt-4 block text-[9px] font-semibold leading-tight ${current ? "text-[#B8AEFF]" : "text-white/42"}`}>{current ? t("ref_fee_label") : index === 4 ? t("ref_land_t2_label") : `${index}`}</span>
            </div>
          );
        })}
      </div>

      <p className="mt-9 border-t border-white/10 pt-6 text-[13px] leading-relaxed text-white/70">{nextCopy}</p>

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        {isV2 && <div className="rounded-xl border border-white/10 bg-white/[.045] p-3"><span className="block text-[9px] font-bold uppercase tracking-[.12em] text-white/42">{t("ref_fee_y2_label")}</span><strong className="mt-2 block text-[21px] font-bold text-white">{year2Fee}%</strong></div>}
        <div className="rounded-xl border border-white/10 bg-white/[.045] p-3"><span className="block text-[9px] font-bold uppercase tracking-[.12em] text-white/42">{t("ref_registered_label")}</span><strong className="mt-2 block text-[21px] font-bold text-white">{registeredCount}</strong></div>
        <div className="rounded-xl border border-white/10 bg-white/[.045] p-3"><span className="block text-[9px] font-bold uppercase tracking-[.12em] text-white/42">{t("ref_used_label")}</span><strong className="mt-2 block text-[21px] font-bold text-white">{timesUsed}</strong></div>
      </div>
    </div>
  );
}
