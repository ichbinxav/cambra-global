import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight, Activity, Plug, BarChart3, Sparkles } from "lucide-react";
import Navbar from "@/components/landing/Navbar";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/lib/i18n.jsx";

export default function HowItWorks() {
  const { t } = useTranslation();
  const STEPS = [
    { n: "01", eyebrow: t("hiw_s1_eyebrow"), icon: Activity,  title: t("hiw_s1_title"), detail: t("hiw_s1_detail"), cta: { label: t("hiw_s1_cta"), href: "/Analyzer" } },
    { n: "02", eyebrow: t("hiw_s2_eyebrow"), icon: BarChart3, title: t("hiw_s2_title"), detail: t("hiw_s2_detail"), cta: { label: t("hiw_s2_cta"), href: "/Analyzer" } },
    { n: "03", eyebrow: t("hiw_s3_eyebrow"), icon: Plug,      title: t("hiw_s3_title"), detail: t("hiw_s3_detail"), cta: { label: t("hiw_s3_cta"), href: "/ConnectTools" } },
    { n: "04", eyebrow: t("hiw_s4_eyebrow"), icon: Sparkles,  title: t("hiw_s4_title"), detail: t("hiw_s4_detail"), cta: { label: t("hiw_s4_cta"), href: "/Pricing" } },
  ];
  return (
    <div
      className="relative min-h-screen font-inter overflow-hidden text-white"
      style={{
        background:
          "linear-gradient(180deg, #0a0a0a 0%, #0b0e1a 22%, #0a0d18 48%, #0b1020 72%, #0E0E1A 100%)",
      }}
    >
      <Navbar />

      {/* Ambient backdrop */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px)",
          backgroundSize: "56px 56px",
          opacity: 0.35,
          maskImage: "radial-gradient(ellipse 90% 80% at 50% 30%, #000 35%, transparent 100%)",
          WebkitMaskImage: "radial-gradient(ellipse 90% 80% at 50% 30%, #000 35%, transparent 100%)",
        }}
      />

      <div className="relative pt-24 pb-20">
        <div className="max-w-6xl mx-auto px-5">

          {/* Hero */}
          <div className="text-center mb-16">
            <div
              className="inline-flex items-center gap-2 mb-6 px-2.5 py-1.5 rounded-full backdrop-blur-sm"
              style={{ border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.03)" }}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-cyan-300" />
              <span className="text-[10px] font-semibold tracking-[0.2em] uppercase text-white/60">
                {t("hiw_hero_badge")}
              </span>
            </div>

            <h1 className="font-display text-[clamp(2.4rem,6vw,4.4rem)] font-black tracking-[-0.045em] leading-[0.92] mb-5 text-white">
              <span
                style={{
                  background: "linear-gradient(135deg, #ffffff 0%, #b8d8e0 55%, #39C6F0 100%)",
                  WebkitBackgroundClip: "text",
                  backgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                }}
              >
                {t("hiw_hero_h1")}
              </span>
            </h1>
            <p className="text-base md:text-lg text-white/60 max-w-2xl mx-auto leading-relaxed">
              {t("hiw_hero_sub")}
            </p>
          </div>

          {/* Steps — large cinematic */}
          <div className="space-y-6">
            {STEPS.map((step, i) => {
              const Icon = step.icon;
              return (
                <motion.article
                  key={step.n}
                  initial={{ opacity: 0, y: 16 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-80px" }}
                  transition={{ duration: 0.5, delay: i * 0.05 }}
                  className="cambra-card p-8 sm:p-12"
                >
                  <div className="flex items-start justify-between gap-4 mb-8">
                    {/* Giant cinematic number — on top */}
                    <div className="cambra-step-number">
                      {step.n}
                    </div>

                    {/* CTA row — aligned with number */}
                    <Link
                      to={step.cta.href}
                      className="group/cta inline-flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 rounded-full border border-white/20 bg-cambra-navy-deep/80 hover:bg-cambra-navy-deep hover:border-white/40 transition-all backdrop-blur-md mt-1 flex-shrink-0"
                      style={{ position: 'relative', zIndex: 20 }}
                    >
                      <span className="text-[9px] sm:text-[10px] font-bold text-white tracking-[0.08em] uppercase whitespace-nowrap">
                        {step.cta.label}
                      </span>
                      <span className="h-4 w-4 rounded-full flex items-center justify-center bg-cambra-mint transition-transform group-hover/cta:translate-x-0.5">
                        <ArrowRight className="h-2.5 w-2.5 text-cambra-navy-deep" strokeWidth={3} />
                      </span>
                    </Link>
                  </div>

                  <div>

                    {/* Content */}
                    <div className="min-w-0">
                      <div className="inline-flex items-center gap-2 mb-3 px-2.5 py-1.5 rounded-full border border-white/15 bg-white/[0.04] backdrop-blur-sm">
                        <Icon size={11} className="text-cambra-mint" />
                        <span className="text-[10px] font-bold tracking-[0.22em] uppercase text-white/70">
                          {step.eyebrow}
                        </span>
                      </div>

                      <h2 className="font-display text-2xl sm:text-3xl md:text-4xl font-black tracking-[-0.035em] leading-[1] mb-3">
                        <span style={{ background: "linear-gradient(135deg, #ffffff 0%, #B8D8E0 55%, #39C6F0 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>
                          {step.title}
                        </span>
                      </h2>

                      <p className="text-sm sm:text-base text-white/70 leading-relaxed max-w-2xl">
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
              <Button className="h-12 rounded-full px-8 text-sm font-bold gap-2 bg-white text-black hover:opacity-90">
                {t("hiw_cta_button")} <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <p className="text-xs text-white/50 mt-4">
              {t("hiw_cta_note")}
            </p>
          </div>

        </div>
      </div>
    </div>
  );
}