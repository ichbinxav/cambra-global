import { ArrowRight, BadgeCheck, Link2, ShieldCheck, TrendingDown } from "lucide-react";
import { Link } from "react-router-dom";
import PublicPageShell from "@/components/shared/PublicPageShell";
import SectionLabel from "@/components/shared/SectionLabel";
import { useAuth } from "@/lib/AuthContext";
import { useTranslation } from "@/lib/i18n.jsx";
import {
  BASE_FEE_PCT,
  ENTRY_FEE_PCT,
  FLOOR_FEE_PCT,
  STEP_POINTS,
} from "@/lib/referralProgram";

const LADDER = [25, 20, 15, 10, 5];

export default function ReferralProgramme() {
  const { isAuthenticated } = useAuth();
  const { t } = useTranslation();
  const referralTarget = isAuthenticated
    ? "/Referrals"
    : `/LoginGate?next=${encodeURIComponent("/Referrals")}`;

  const steps = [
    { icon: Link2, copy: t("ref_how_1") },
    { icon: BadgeCheck, copy: t("ref_how_2") },
    { icon: TrendingDown, copy: t("ref_how_3") },
  ];

  return (
    <PublicPageShell>
      <section className="cambra-public-hero cambra-referral-page">
        <div className="cambra-public-container grid items-center gap-10 lg:grid-cols-[minmax(0,1.04fr)_minmax(520px,.96fr)] lg:gap-8 xl:gap-12">
          <div className="max-w-[660px]">
            <SectionLabel>{t("ref_land_eyebrow")}</SectionLabel>
            <h1 className="cambra-public-title cambra-referral-title mt-7">
              <span className="cambra-referral-title-line">{t("ref_land_h2_l1")}</span>
              <span className="cambra-referral-title-line kw">{t("ref_land_h2_kw")}</span>
            </h1>
            <p className="cambra-public-lead mt-7">
              {t("ref_land_sub", {
                step: STEP_POINTS,
                floor: `${FLOOR_FEE_PCT}%`,
                entry: `${ENTRY_FEE_PCT}%`,
                base: `${BASE_FEE_PCT}%`,
              })}
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <Link to={referralTarget} className="btn-primary inline-flex min-h-[54px] items-center justify-center gap-2 rounded-xl px-7 text-[14px] font-bold text-white">
                {t("ref_your_link")} <ArrowRight size={16} />
              </Link>
              <Link to="/Analyzer" className="inline-flex min-h-[54px] items-center justify-center px-2 text-[14px] font-bold text-[#3829E8]">
                {t("ref_land_cta")} <ArrowRight className="ml-2" size={15} />
              </Link>
            </div>
            <p className="mt-5 flex items-start gap-2 text-[12px] font-semibold leading-relaxed text-[#656D84]">
              <ShieldCheck className="mt-0.5 shrink-0 text-[#5B4CF5]" size={15} />
              {t("ref_land_trigger")}
            </p>
          </div>

          <div className="cambra-dark-panel cambra-referral-ladder">
            <div className="relative">
              <SectionLabel tone="dark">{t("ref_fee_label")}</SectionLabel>
              <h2 className="mt-5 text-[clamp(26px,3vw,40px)] font-bold tracking-[-.045em] text-white">
                {BASE_FEE_PCT}% → {FLOOR_FEE_PCT}%
              </h2>
              <div className="mt-11 grid grid-cols-5">
                {LADDER.map((fee, index) => (
                  <div key={fee} className="relative text-center">
                    {index < LADDER.length - 1 && <span aria-hidden="true" className="absolute left-1/2 top-[40px] h-px w-full bg-white/35" />}
                    <strong className="block text-[20px] font-black tabular-nums text-white">{fee}%</strong>
                    <span className={`relative z-10 mx-auto mt-4 block h-5 w-5 rounded-full border-2 ${index === 0 ? "border-white bg-[#6D5AFF] shadow-[0_0_0_7px_rgba(109,90,255,.18),0_0_24px_rgba(109,90,255,.9)]" : "border-white/70 bg-[#0B1731]"}`} />
                    <span className="mt-4 block text-[10px] font-semibold leading-tight text-white/55">
                      {index === 0 ? t("ref_fee_label") : index === LADDER.length - 1 ? t("ref_land_t2_label") : `${index}`}
                    </span>
                  </div>
                ))}
              </div>
              <p className="mt-11 border-t border-white/10 pt-6 leading-relaxed">
                <span className="mr-3 text-[22px] font-black text-white">−{STEP_POINTS} pts</span>
                <span className="text-[13px] font-bold text-white/88">{t("ref_land_t1_label")}</span>
                <span className="mt-1 block text-[12px] text-white/58">{t("ref_land_t1_note")}</span>
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="cambra-public-section pt-2">
        <div className="cambra-public-container">
          <div className="mx-auto max-w-2xl text-center">
            <SectionLabel>{t("ref_how_title")}</SectionLabel>
            <h2 className="mt-5 text-[clamp(34px,4.4vw,58px)] font-bold leading-[1.02] tracking-[-.05em] text-[#0B1228]">
              {t("ref_land_h2_l1")} {t("ref_land_h2_kw")}
            </h2>
          </div>
          <ol className="mt-12 grid gap-5 md:grid-cols-3">
            {steps.map(({ icon: Icon, copy }, index) => (
              <li key={copy} className="cambra-paper-card p-7">
                <div className="flex items-center justify-between">
                  <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-[#EFEDFF] text-[#4D3DF1]"><Icon size={21} /></span>
                  <span className="font-mono text-[11px] font-bold tracking-[.18em] text-[#8A91A4]">0{index + 1}</span>
                </div>
                <p className="mt-8 text-[15px] font-semibold leading-relaxed text-[#26304B]">{copy}</p>
              </li>
            ))}
          </ol>
          <div className="cambra-trust-strip mt-6 grid gap-0 md:grid-cols-3">
            <div><strong>−{STEP_POINTS}</strong><span>{t("ref_land_t1_label")}</span></div>
            <div><strong>{ENTRY_FEE_PCT}%</strong><span>{t("ref_land_t3_label")}</span></div>
            <div><strong>{FLOOR_FEE_PCT}%</strong><span>{t("ref_land_t2_label")}</span></div>
          </div>
        </div>
      </section>
    </PublicPageShell>
  );
}
