// ScoreRecoveryCTA — Report v2. The segmented CTA that sits beside the gauge.
//
// Extracted verbatim from PaymentsScoreBadge (already wired + i18n) so the new
// gauge hero and any legacy badge render the EXACT same action:
//   grade C/D/F → recovery route  (anonymous: "Unlock your plan")
//   grade A/B   → "You're top-tier · monitor drift" (passive, no click dest)
// The action ALWAYS routes to the CAMBRA roadmap — never an external PSP.

import { ArrowRight, ShieldCheck } from "lucide-react";
import { useTranslation } from "@/lib/i18n.jsx";

export default function ScoreRecoveryCTA({ grade, tone, toneColors, isAnonymous = false, onRecoveryClick }) {
  const { t } = useTranslation();
  const c = toneColors;
  const isTopTier = grade === "A" || grade === "B";

  if (isTopTier) {
    return (
      <div className="flex flex-col gap-2 justify-center">
        <div className="inline-flex items-center gap-1.5">
          <ShieldCheck size={15} style={{ color: c.text }} />
          <span className="text-[13px] font-bold" style={{ color: c.text }}>
            {t("roadmap_toptier_title")}
          </span>
        </div>
        <p className="text-[12px] text-white/55 leading-snug">
          {t("roadmap_toptier_body")}
        </p>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onRecoveryClick}
      className="group w-full h-full min-h-[64px] rounded-xl px-4 py-3 flex items-center justify-between gap-2 text-left transition-all hover:brightness-110"
      style={{
        background: `linear-gradient(135deg, ${c.soft} 0%, rgba(255,255,255,0.02) 100%)`,
        border: `1px solid ${c.ring}`,
      }}
    >
      <span className="text-[13px] font-bold leading-snug" style={{ color: c.text }}>
        {isAnonymous ? t("score_cta_unlock") : t("score_cta_recover")}
      </span>
      <ArrowRight
        size={16}
        style={{ color: c.text }}
        className="shrink-0 transition-transform group-hover:translate-x-0.5"
      />
    </button>
  );
}