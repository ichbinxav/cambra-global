import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Activity, ArrowRight, BarChart3, PencilLine, Plug, Sparkles, Upload } from "lucide-react";
import PublicPageShell from "@/components/shared/PublicPageShell";
import PublicPageHero from "@/components/shared/PublicPageHero";
import SectionLabel from "@/components/shared/SectionLabel";
import { useTranslation } from "@/lib/i18n.jsx";

const STEP_ACCENTS = ["#5B4CF5", "#3478F6", "#20A9C9"];

export default function HowItWorks() {
  const { t } = useTranslation();
  const entryPaths = [
    { icon: PencilLine, title: t("az_entry_manual_title"), detail: t("az_entry_manual_body"), accent: "#8B7BFF" },
    { icon: Plug, title: t("az_entry_connect_title"), detail: t("az_entry_connect_body"), accent: "#58A6FF" },
    { icon: Upload, title: t("az_entry_upload_title"), detail: t("az_entry_upload_body"), accent: "#52D4E9" },
  ];
  const steps = [
    { n: "01", eyebrow: t("hiw_s1_eyebrow"), icon: Activity, title: t("hiw_s1_title"), detail: t("hiw_s1_detail"), cta: t("hiw_s1_cta"), href: "/Analyzer" },
    { n: "02", eyebrow: t("hiw_s2_eyebrow"), icon: BarChart3, title: t("hiw_s2_title"), detail: t("hiw_s2_detail"), cta: t("hiw_s2_cta"), href: "/Analyzer" },
    { n: "03", eyebrow: t("hiw_s3_eyebrow"), icon: Sparkles, title: t("hiw_s3_title"), detail: t("hiw_s3_detail"), cta: t("hiw_s3_cta"), href: "/pricing" },
  ];

  return (
    <PublicPageShell>
      <PublicPageHero
        eyebrow={t("hiw_hero_badge")}
        title={t("hiw_hero_h1")}
        subtitle={t("hiw_hero_sub")}
      />

      <div className="relative pb-20 pt-14 sm:pt-20">
        <div className="cambra-public-container">
          <section aria-label={t("hiw_hero_badge")}>
            <div className="grid gap-5 lg:grid-cols-3">
              {steps.map((step, index) => {
                const Icon = step.icon;
                const accent = STEP_ACCENTS[index];
                return (
                  <motion.article
                    key={step.n}
                    initial={{ opacity: 0, y: 18 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: "-70px" }}
                    transition={{ duration: .55, delay: index * .07, ease: [0.22, 1, 0.36, 1] }}
                    className="relative flex min-h-[410px] flex-col overflow-hidden rounded-[28px] border border-[#DFE2EB] bg-white p-7 shadow-[0_28px_70px_-55px_rgba(12,18,40,.55)] sm:p-8"
                  >
                    <div aria-hidden className="absolute inset-x-0 top-0 h-1" style={{ background: accent }} />
                    <div className="flex items-start justify-between gap-5">
                      <strong className="text-[clamp(64px,7vw,94px)] font-black leading-[.8] tracking-[-.075em] text-[#0B1228]">{step.n}</strong>
                      <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl" style={{ color: accent, background: `${accent}12`, border: `1px solid ${accent}32` }}>
                        <Icon size={20} />
                      </span>
                    </div>

                    <div className="mt-12">
                      <p className="text-[10px] font-bold uppercase tracking-[.2em]" style={{ color: accent }}>{step.eyebrow}</p>
                      <h2 className="mt-3 text-[clamp(27px,3vw,38px)] font-black leading-[1.02] tracking-[-.045em] text-[#0B1228]">{step.title}</h2>
                      <p className="mt-4 text-[14px] leading-[1.7] text-[#626C85]">{step.detail}</p>
                    </div>

                    <Link to={step.href} className="mt-auto inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#0B1228] px-5 text-[12px] font-bold text-white transition hover:-translate-y-0.5 hover:bg-[#151F3A]">
                      {step.cta} <ArrowRight size={14} />
                    </Link>
                  </motion.article>
                );
              })}
            </div>
          </section>

          <motion.section
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-70px" }}
            transition={{ duration: .65, ease: [0.22, 1, 0.36, 1] }}
            className="cambra-dark-panel mt-16 overflow-hidden p-7 sm:p-10 lg:p-12"
            aria-labelledby="intelligence-inputs-title"
          >
            <div className="grid gap-10 lg:grid-cols-[minmax(280px,.72fr)_minmax(0,1.28fr)] lg:gap-14">
              <div>
                <SectionLabel tone="dark">{t("stack_eyebrow")}</SectionLabel>
                <h2 id="intelligence-inputs-title" className="mt-6 max-w-[560px] text-[clamp(34px,4.5vw,58px)] font-black leading-[.98] tracking-[-.052em] text-white">
                  {t("az_entry_label")}
                </h2>
                <p className="mt-6 max-w-[560px] text-[14px] leading-[1.75] text-white/72">{t("hiw_s1_detail")}</p>
                <div className="mt-8 rounded-2xl border border-white/12 bg-white/[.06] p-5">
                  <p className="text-[10px] font-bold uppercase tracking-[.18em] text-[#AFA2FF]">{t("hiw_s2_eyebrow")}</p>
                  <p className="mt-2 text-[17px] font-bold leading-snug text-white">{t("hiw_s2_title")}</p>
                  <p className="mt-2 text-[12px] leading-relaxed text-white/62">{t("hiw_s2_detail")}</p>
                </div>
              </div>

              <div className="divide-y divide-white/10 rounded-[24px] border border-white/12 bg-white/[.035] px-5 sm:px-7">
                {entryPaths.map(({ icon: Icon, title, detail, accent }, index) => (
                  <motion.div
                    key={title}
                    initial={{ opacity: 0, x: 14 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: .45, delay: .12 + index * .08 }}
                    className="grid gap-4 py-6 sm:grid-cols-[52px_minmax(0,1fr)] sm:items-center"
                  >
                    <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl" style={{ color: accent, background: `${accent}14`, border: `1px solid ${accent}38` }}><Icon size={19} /></span>
                    <div>
                      <h3 className="text-[17px] font-bold tracking-[-.02em] text-white">{title}</h3>
                      <p className="mt-1.5 text-[12px] leading-[1.65] text-white/64">{detail}</p>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>

            <div className="mt-10 flex flex-col items-start justify-between gap-5 border-t border-white/12 pt-8 sm:flex-row sm:items-center">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[.18em] text-[#9EDFFF]">{t("hiw_s3_eyebrow")}</p>
                <p className="mt-2 text-[20px] font-bold tracking-[-.025em] text-white">{t("hiw_s3_title")}</p>
              </div>
              <Link to="/Analyzer" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-white px-6 text-[12px] font-bold text-[#0B1228] transition hover:-translate-y-0.5">
                {t("hiw_cta_button")} <ArrowRight size={14} />
              </Link>
            </div>
          </motion.section>

          <div className="mt-14 text-center">
            <Link to="/Analyzer" className="btn-primary inline-flex min-h-12 items-center justify-center gap-2 px-8 text-[13px] font-bold">
              {t("hiw_cta_button")} <ArrowRight size={15} />
            </Link>
            <p className="mt-4 text-[11px] text-[#7B8399]">{t("hiw_cta_note")}</p>
          </div>
        </div>
      </div>
    </PublicPageShell>
  );
}
