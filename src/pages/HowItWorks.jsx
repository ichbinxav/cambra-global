import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight, Activity, BarChart3, PencilLine, Plug, Sparkles, Upload } from "lucide-react";
import PublicPageShell from "@/components/shared/PublicPageShell";
import PublicPageHero from "@/components/shared/PublicPageHero";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/lib/i18n.jsx";

// Shared paper card style — white, --linea border, radius 14, spec shadow.
const CARD_STYLE = {
  background: "#FFFFFF",
  border: "1px solid var(--linea)",
  borderRadius: 14,
  boxShadow: "0 8px 24px rgba(12,12,22,.06)",
};

export default function HowItWorks() {
  const { t } = useTranslation();
  const ENTRY_PATHS = [
    { icon: PencilLine, title: t("az_entry_manual_title"), detail: t("az_entry_manual_body"), badge: t("az_entry_manual_badge"), cta: t("az_entry_manual_cta"), href: "/Analyzer", accent: "#5B4CF5" },
    { icon: Plug, title: t("az_entry_connect_title"), detail: t("az_entry_connect_body"), badge: t("az_entry_connect_badge"), cta: t("az_entry_connect_cta"), href: "/ConnectStripe", accent: "#3C72F2" },
    { icon: Upload, title: t("az_entry_upload_title"), detail: t("az_entry_upload_body"), badge: t("az_entry_upload_badge"), cta: t("az_entry_upload_cta"), href: "/UploadStatement", accent: "#26A9C9" },
  ];
  const STEPS = [
    { n: "01", eyebrow: t("hiw_s1_eyebrow"), icon: Activity,  title: t("hiw_s1_title"), detail: t("hiw_s1_detail"), cta: { label: t("hiw_s1_cta"), href: "/Analyzer" } },
    { n: "02", eyebrow: t("hiw_s2_eyebrow"), icon: BarChart3, title: t("hiw_s2_title"), detail: t("hiw_s2_detail"), cta: { label: t("hiw_s2_cta"), href: "/Analyzer" } },
    { n: "03", eyebrow: t("hiw_s3_eyebrow"), icon: Sparkles,  title: t("hiw_s3_title"), detail: t("hiw_s3_detail"), cta: { label: t("hiw_s3_cta"), href: "/pricing" } },
  ];
  return (
    <PublicPageShell>
      <PublicPageHero
        eyebrow={t("hiw_hero_badge")}
        title={t("hiw_hero_h1")}
        subtitle={t("hiw_hero_sub")}
      />

      <div className="relative pt-16 pb-20">
        <div className="cambra-public-container">

          <section className="mb-16 sm:mb-20" aria-labelledby="entry-paths-title">
            <div className="mb-8 flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[.22em] text-[#5B4CF5]">{t("how_step_label")} 01</p>
                <h2 id="entry-paths-title" className="mt-3 text-[clamp(30px,4vw,48px)] font-black leading-[1.02] tracking-[-.045em] text-[#0B1228]">
                  {t("az_entry_label")}
                </h2>
              </div>
              <p className="max-w-md text-[13px] leading-relaxed text-[#667087] sm:text-right">{t("hiw_s1_detail")}</p>
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
              {ENTRY_PATHS.map(({ icon: Icon, title, detail, badge, cta, href, accent }, index) => (
                <motion.article
                  key={href}
                  initial={{ opacity: 0, y: 18 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-50px" }}
                  transition={{ duration: .5, delay: index * .07 }}
                  className={`relative flex min-h-[300px] flex-col overflow-hidden rounded-[24px] p-7 ${index === 1 ? "text-white" : "text-[#0B1228]"}`}
                  style={index === 1
                    ? { background: "radial-gradient(circle at 100% 0,rgba(57,198,240,.20),transparent 44%),linear-gradient(145deg,#0B1731,#080D1D)", border: "1px solid rgba(255,255,255,.1)" }
                    : { background: "rgba(255,255,255,.88)", border: "1px solid rgba(91,76,245,.14)", boxShadow: "0 24px 60px -48px rgba(10,18,40,.5)" }}
                >
                  <div className="flex items-center justify-between gap-4">
                    <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl" style={{ color: index === 1 ? "#fff" : accent, background: index === 1 ? "rgba(255,255,255,.08)" : `${accent}12`, border: `1px solid ${index === 1 ? "rgba(255,255,255,.12)" : `${accent}2d`}` }}><Icon size={20} /></span>
                    <span className="rounded-full px-3 py-1 text-[9px] font-bold uppercase tracking-[.16em]" style={{ color: index === 1 ? "#9EDFFF" : accent, background: index === 1 ? "rgba(57,198,240,.09)" : `${accent}0d` }}>{badge}</span>
                  </div>
                  <h3 className="mt-7 text-[21px] font-bold leading-tight tracking-[-.03em]">{title}</h3>
                  <p className={`mt-3 text-[13px] leading-relaxed ${index === 1 ? "text-white/65" : "text-[#667087]"}`}>{detail}</p>
                  <Link to={href} className="mt-auto inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-5 text-[12px] font-bold" style={{ color: index === 1 ? "#0B1228" : "#fff", background: index === 1 ? "#fff" : `linear-gradient(120deg,${accent},#39C6F0)` }}>
                    {cta} <ArrowRight size={14} />
                  </Link>
                </motion.article>
              ))}
            </div>
          </section>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {STEPS.map((step, i) => {
              const Icon = step.icon;
              return (
                <motion.article
                  key={step.n}
                  initial={{ opacity: 0, y: 16 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-80px" }}
                  transition={{ duration: 0.5, delay: i * 0.05 }}
                  className="p-7 sm:p-8 flex flex-col min-h-[390px]"
                  style={{ ...CARD_STYLE, borderRadius: 24 }}
                >
                  <div className="flex items-start justify-between gap-4 mb-8">
                    {/* Giant cinematic number — navy gradient on paper */}
                    <div
                      className="cambra-step-number-light"
                      style={{
                        fontSize: "clamp(3.5rem, 7vw, 5.6rem)",
                        lineHeight: 1,
                        background: "linear-gradient(180deg, #3A2BB0 0%, var(--voltio-2) 100%)",
                        WebkitBackgroundClip: "text",
                        backgroundClip: "text",
                        WebkitTextFillColor: "transparent",
                      }}
                    >
                      {step.n}
                    </div>

                    {/* CTA row — aligned with number */}
                    <Link
                      to={step.cta.href}
                      className="group/cta inline-flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 rounded-full transition-all mt-1 flex-shrink-0"
                      style={{ background: "rgba(12,12,22,0.04)", border: "1px solid var(--linea)", position: "relative", zIndex: 20 }}
                    >
                      <span className="text-[9px] sm:text-[10px] font-bold tracking-[0.08em] uppercase whitespace-nowrap" style={{ color: "var(--ink)" }}>
                        {step.cta.label}
                      </span>
                      <span className="h-4 w-4 rounded-full flex items-center justify-center transition-transform group-hover/cta:translate-x-0.5" style={{ background: "var(--voltio)" }}>
                        <ArrowRight className="h-2.5 w-2.5 text-white" strokeWidth={3} />
                      </span>
                    </Link>
                  </div>

                  <div className="mt-auto">
                    <div className="min-w-0">
                      <div
                        className="inline-flex items-center gap-2 mb-3 px-2.5 py-1.5 rounded-full"
                        style={{ background: "rgba(12,12,22,0.04)", border: "1px solid var(--linea)" }}
                      >
                        <Icon size={11} style={{ color: "var(--voltio)" }} />
                        <span className="text-[10px] font-bold tracking-[0.22em] uppercase" style={{ color: "var(--gris-1)" }}>
                          {step.eyebrow}
                        </span>
                      </div>

                      <h2
                        className="font-display font-black mb-3"
                        style={{
                          color: "var(--ink)",
                          fontSize: "clamp(1.5rem, 4vw, 2.25rem)",
                          letterSpacing: "-0.035em",
                          lineHeight: 1,
                        }}
                      >
                        {step.title}
                      </h2>

                      <p className="text-sm sm:text-base leading-relaxed max-w-2xl" style={{ color: "var(--gris-1)" }}>
                        {step.detail}
                      </p>
                    </div>
                  </div>
                </motion.article>
              );
            })}
          </div>

          {/* CTA */}
          <div className="mt-16 text-center">
            <Link to="/Analyzer">
              <Button className="h-12 rounded-full px-8 text-sm font-bold gap-2 text-white hover:opacity-90" style={{ background: "var(--g-voltio)", boxShadow: "0 12px 32px -12px rgba(91,76,245,0.5)" }}>
                {t("hiw_cta_button")} <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <p className="text-xs mt-4" style={{ color: "var(--gris-2)" }}>
              {t("hiw_cta_note")}
            </p>
          </div>

        </div>
      </div>
    </PublicPageShell>
  );
}
