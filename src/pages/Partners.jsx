import { useEffect } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import PublicPageShell from "@/components/shared/PublicPageShell";
import PublicPageHero from "@/components/shared/PublicPageHero";
import SectionLabel from "@/components/shared/SectionLabel";
import PartnerApplicationForm from "@/components/partners/PartnerApplicationForm";
import { useTranslation } from "@/lib/i18n.jsx";

const fadeUp = {
  initial: { opacity: 0, y: 20 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-60px" },
  transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] },
};

const cardStyle = {
  background: "#FFFFFF",
  border: "1px solid var(--linea)",
  borderRadius: 14,
  boxShadow: "0 8px 24px rgba(12,12,22,.06)",
};

// ── Trimmed to essentials: 3 principles + 3 benefits merged into "why" ──
const WHY = [
  { titleKey: "pt_s2_p1_title", bodyKey: "pt_s2_p1_body" },
  { titleKey: "pt_s4_b1_title", bodyKey: "pt_s4_b1_body" },
  { titleKey: "pt_s4_b4_title", bodyKey: "pt_s4_b4_body" },
];

const WHO_FOR = [
  { titleKey: "pt_s3_c1_title", bodyKey: "pt_s3_c1_body" },
  { titleKey: "pt_s3_c2_title", bodyKey: "pt_s3_c2_body" },
  { titleKey: "pt_s3_c3_title", bodyKey: "pt_s3_c3_body" },
];

function Card({ title, body }) {
  return (
    <motion.div {...fadeUp} className="p-5" style={cardStyle}>
      <h3 className="font-display text-base font-bold mb-1.5" style={{ color: "var(--ink)" }}>{title}</h3>
      <p className="text-[13px] leading-relaxed" style={{ color: "var(--gris-1)" }}>{body}</p>
    </motion.div>
  );
}

export default function Partners() {
  const { t, lang } = useTranslation();

  useEffect(() => {
    document.title = t("pt_meta_title");
    const meta = document.querySelector('meta[name="description"]');
    if (meta) meta.setAttribute("content", t("pt_meta_description"));
    return () => {
      document.title = "CAMBRA — Card payment cost audit for independent brands";
      if (meta) meta.setAttribute("content", "Find out how much you overpay for card payments, online and in-store. CAMBRA compares your effective rate against European payment benchmarks and recovers the negotiable margin. Free analysis — you only pay on verified savings.");
    };
  }, [lang, t]);

  const scrollToApply = () => {
    const el = document.getElementById("apply");
    if (el) el.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <PublicPageShell>
      {/* ── HERO ── */}
      <PublicPageHero
        eyebrow={t("pt_eyebrow")}
        title={<>{t("pt_hero_title")}</>}
        subtitle={t("pt_hero_sub")}
      >
        <div className="flex flex-col sm:flex-row items-center gap-3 justify-center">
          <button onClick={scrollToApply} className="btn-base btn-primary-inverse btn-lg">
            {t("pt_hero_cta")} <ArrowRight className="h-4 w-4" />
          </button>
          <Link to="/HowItWorks" className="btn-base btn-secondary-dark btn-lg">
            {t("pt_hero_cta2")}
          </Link>
        </div>
      </PublicPageHero>

      {/* ── WHY PARTNER ── */}
      <section className="py-16 sm:py-20">
        <div className="max-w-5xl mx-auto px-5 sm:px-8">
          <div className="mb-10 text-center">
            <SectionLabel>{t("pt_s2_label")}</SectionLabel>
            <h2 className="font-display mt-4 text-2xl sm:text-3xl font-black tracking-[-0.03em] max-w-2xl mx-auto" style={{ color: "var(--ink)" }}>
              {t("pt_s4_title")}
            </h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {WHY.map((c) => (
              <Card key={c.titleKey} title={t(c.titleKey)} body={t(c.bodyKey)} />
            ))}
          </div>
        </div>
      </section>

      {/* ── WHO CAN BECOME A PARTNER ── */}
      <section className="py-12 sm:py-16" style={{ background: "rgba(91,76,245,0.02)" }}>
        <div className="max-w-5xl mx-auto px-5 sm:px-8">
          <div className="mb-10 text-center">
            <SectionLabel>{t("pt_s3_label")}</SectionLabel>
            <h2 className="font-display mt-4 text-2xl sm:text-3xl font-black tracking-[-0.03em] max-w-2xl mx-auto" style={{ color: "var(--ink)" }}>
              {t("pt_s3_title")}
            </h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {WHO_FOR.map((c) => (
              <Card key={c.titleKey} title={t(c.titleKey)} body={t(c.bodyKey)} />
            ))}
          </div>
          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3 text-center">
            <p className="text-sm" style={{ color: "var(--gris-1)" }}>{t("pt_s3_provider_note")}</p>
            <Link to="/ForProviders" className="inline-flex items-center gap-1.5 text-sm font-semibold" style={{ color: "var(--voltio)" }}>
              {t("pt_s3_provider_cta")} <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </section>

      {/* ── APPLICATION ── */}
      <section id="apply" className="scroll-mt-20 py-16 sm:py-20">
        <div className="max-w-2xl mx-auto px-5 sm:px-8">
          <div className="mb-8 text-center">
            <SectionLabel>{t("pt_s7_label")}</SectionLabel>
            <h2 className="font-display mt-4 text-2xl sm:text-3xl font-black tracking-[-0.03em]" style={{ color: "var(--ink)" }}>
              {t("pt_s7_title")}
            </h2>
            <p className="mt-4 text-[15px] leading-relaxed" style={{ color: "var(--gris-1)" }}>
              {t("pt_s7_body")}
            </p>
          </div>
          <PartnerApplicationForm />
        </div>
      </section>
    </PublicPageShell>
  );
}