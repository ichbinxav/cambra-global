import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import PublicPageShell from "@/components/shared/PublicPageShell";
import PublicPageHero from "@/components/shared/PublicPageHero";
import SectionLabel from "@/components/shared/SectionLabel";
import PartnerApplicationForm from "@/components/partners/PartnerApplicationForm";
import { useTranslation } from "@/lib/i18n.jsx";

// ── Animation helpers ──────────────────────────────────────────────
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

// ── Section data ────────────────────────────────────────────────────
const PRINCIPLES = [
  { titleKey: "pt_s2_p1_title", bodyKey: "pt_s2_p1_body" },
  { titleKey: "pt_s2_p2_title", bodyKey: "pt_s2_p2_body" },
  { titleKey: "pt_s2_p3_title", bodyKey: "pt_s2_p3_body" },
];

const WHO_FOR = [
  { titleKey: "pt_s3_c1_title", bodyKey: "pt_s3_c1_body" },
  { titleKey: "pt_s3_c2_title", bodyKey: "pt_s3_c2_body" },
  { titleKey: "pt_s3_c3_title", bodyKey: "pt_s3_c3_body" },
  { titleKey: "pt_s3_c4_title", bodyKey: "pt_s3_c4_body" },
  { titleKey: "pt_s3_c5_title", bodyKey: "pt_s3_c5_body" },
];

const BENEFITS = [
  { titleKey: "pt_s4_b1_title", bodyKey: "pt_s4_b1_body" },
  { titleKey: "pt_s4_b2_title", bodyKey: "pt_s4_b2_body" },
  { titleKey: "pt_s4_b3_title", bodyKey: "pt_s4_b3_body" },
  { titleKey: "pt_s4_b4_title", bodyKey: "pt_s4_b4_body" },
  { titleKey: "pt_s4_b5_title", bodyKey: "pt_s4_b5_body" },
  { titleKey: "pt_s4_b6_title", bodyKey: "pt_s4_b6_body" },
];

const WORKFLOW = [
  { stepKey: "pt_s5_step1", bodyKey: "pt_s5_step1_body", num: 1 },
  { stepKey: "pt_s5_step2", bodyKey: "pt_s5_step2_body", num: 2 },
  { stepKey: "pt_s5_step3", bodyKey: "pt_s5_step3_body", num: 3 },
  { stepKey: "pt_s5_step4", bodyKey: "pt_s5_step4_body", num: 4 },
];

const PROMISE_ITEMS = [
  "pt_s6_p1", "pt_s6_p2", "pt_s6_p3", "pt_s6_p4", "pt_s6_p5", "pt_s6_p6",
];

const PRINC_A = ["pt_princ_a_1", "pt_princ_a_2", "pt_princ_a_3", "pt_princ_a_4", "pt_princ_a_5", "pt_princ_a_6", "pt_princ_a_7"];
const PRINC_B = ["pt_princ_b_1", "pt_princ_b_2", "pt_princ_b_3", "pt_princ_b_4", "pt_princ_b_5", "pt_princ_b_6", "pt_princ_b_7"];

// ── Card components ────────────────────────────────────────────────
function PrincipleCard({ title, body }) {
  return (
    <motion.div {...fadeUp} className="p-6" style={cardStyle}>
      <h3 className="font-display text-lg font-bold mb-2" style={{ color: "var(--ink)" }}>{title}</h3>
      <p className="text-sm leading-relaxed" style={{ color: "var(--gris-1)" }}>{body}</p>
    </motion.div>
  );
}

function WhoForCard({ title, body }) {
  return (
    <motion.div {...fadeUp} className="p-5" style={cardStyle}>
      <h3 className="font-display text-base font-bold mb-1.5" style={{ color: "var(--ink)" }}>{title}</h3>
      <p className="text-[13px] leading-relaxed" style={{ color: "var(--gris-1)" }}>{body}</p>
    </motion.div>
  );
}

function BenefitCard({ title, body }) {
  return (
    <motion.div {...fadeUp} className="p-5" style={cardStyle}>
      <h3 className="font-display text-base font-bold mb-1.5" style={{ color: "var(--ink)" }}>{title}</h3>
      <p className="text-[13px] leading-relaxed" style={{ color: "var(--gris-1)" }}>{body}</p>
    </motion.div>
  );
}

function WorkflowStep({ step, body, num }) {
  return (
    <div className="flex-1 min-w-[140px] text-center px-2">
      <div className="w-10 h-10 rounded-full mx-auto mb-3 flex items-center justify-center font-display font-black text-lg"
        style={{ background: "var(--voltio)", color: "#fff" }}>
        {num}
      </div>
      <h3 className="font-display text-sm font-bold mb-1.5" style={{ color: "var(--ink)" }}>{step}</h3>
      <p className="text-[12px] leading-relaxed" style={{ color: "var(--gris-1)" }}>{body}</p>
    </div>
  );
}

function PromiseItem({ children }) {
  return (
    <div className="flex items-center gap-3 p-4 rounded-xl" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: "#2FE0A8" }} />
      <span className="text-[14px] font-medium text-white/85">{children}</span>
    </div>
  );
}

function PrinciplesAccordionItem({ titleKey, items }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <div style={cardStyle} className="overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full px-5 py-4 flex items-center justify-between text-left"
        aria-expanded={open}
      >
        <span className="font-display text-sm font-bold" style={{ color: "var(--ink)" }}>{t(titleKey)}</span>
        <span className="text-lg" style={{ color: "var(--gris-2)" }}>{open ? "−" : "+"}</span>
      </button>
      {open && (
        <div className="px-5 pb-4 space-y-1.5">
          {items.map((k) => (
            <p key={k} className="text-[13px] leading-relaxed pl-4" style={{ color: "var(--gris-1)" }}>· {t(k)}</p>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────
export default function Partners() {
  const { t, lang } = useTranslation();

  // SEO — set page-specific title and description based on active language
  useEffect(() => {
    document.title = t("pt_meta_title");
    const meta = document.querySelector('meta[name="description"]');
    if (meta) meta.setAttribute("content", t("pt_meta_description"));
    return () => {
      // Restore default on unmount
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
      {/* ── SECTION 1: HERO ── */}
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
        <p className="mt-4 text-[13px] font-medium" style={{ color: "rgba(255,255,255,0.45)" }}>
          {t("pt_hero_trust")}
        </p>
      </PublicPageHero>

      {/* ── SECTION 2: WHAT A CAMBRA PARTNER IS ── */}
      <section className="py-16 sm:py-20">
        <div className="max-w-5xl mx-auto px-5 sm:px-8">
          <div className="mb-10 text-center">
            <SectionLabel>{t("pt_s2_label")}</SectionLabel>
            <h2 className="font-display mt-4 text-2xl sm:text-3xl font-black tracking-[-0.03em] max-w-2xl mx-auto" style={{ color: "var(--ink)" }}>
              {t("pt_s2_title")}
            </h2>
            <p className="mt-4 text-[15px] leading-relaxed max-w-2xl mx-auto" style={{ color: "var(--gris-1)" }}>
              {t("pt_s2_body")}
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {PRINCIPLES.map((p) => (
              <PrincipleCard key={p.titleKey} title={t(p.titleKey)} body={t(p.bodyKey)} />
            ))}
          </div>
        </div>
      </section>

      {/* ── SECTION 3: WHO CAN BECOME A PARTNER ── */}
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
              <WhoForCard key={c.titleKey} title={t(c.titleKey)} body={t(c.bodyKey)} />
            ))}
          </div>
          {/* Provider redirect note */}
          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3 text-center">
            <p className="text-sm" style={{ color: "var(--gris-1)" }}>{t("pt_s3_provider_note")}</p>
            <Link to="/ForProviders" className="inline-flex items-center gap-1.5 text-sm font-semibold" style={{ color: "var(--voltio)" }}>
              {t("pt_s3_provider_cta")} <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </section>

      {/* ── SECTION 4: WHAT PARTNERS GAIN ── */}
      <section className="py-16 sm:py-20">
        <div className="max-w-5xl mx-auto px-5 sm:px-8">
          <div className="mb-10 text-center">
            <SectionLabel>{t("pt_s4_label")}</SectionLabel>
            <h2 className="font-display mt-4 text-2xl sm:text-3xl font-black tracking-[-0.03em] max-w-2xl mx-auto" style={{ color: "var(--ink)" }}>
              {t("pt_s4_title")}
            </h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {BENEFITS.map((b) => (
              <BenefitCard key={b.titleKey} title={t(b.titleKey)} body={t(b.bodyKey)} />
            ))}
          </div>
        </div>
      </section>

      {/* ── SECTION 5: WHAT THE BUSINESS RECEIVES ── */}
      <section className="py-12 sm:py-16" style={{ background: "rgba(91,76,245,0.02)" }}>
        <div className="max-w-5xl mx-auto px-5 sm:px-8">
          <div className="mb-10 text-center">
            <SectionLabel>{t("pt_s5_label")}</SectionLabel>
            <h2 className="font-display mt-4 text-2xl sm:text-3xl font-black tracking-[-0.03em] max-w-2xl mx-auto" style={{ color: "var(--ink)" }}>
              {t("pt_s5_title")}
            </h2>
          </div>
          {/* Horizontal workflow — stacks vertically on mobile */}
          <div className="flex flex-col sm:flex-row gap-6 sm:gap-2 justify-center max-w-3xl mx-auto">
            {WORKFLOW.map((w, i) => (
              <div key={w.stepKey} className="flex flex-col sm:flex-row items-center flex-1">
                <WorkflowStep step={t(w.stepKey)} body={t(w.bodyKey)} num={w.num} />
                {i < WORKFLOW.length - 1 && (
                  <div className="hidden sm:flex items-center justify-center px-1 pt-8">
                    <ArrowRight className="w-4 h-4" style={{ color: "var(--gris-2)" }} />
                  </div>
                )}
              </div>
            ))}
          </div>
          <p className="mt-8 text-center text-[14px] max-w-2xl mx-auto" style={{ color: "var(--gris-1)" }}>
            {t("pt_s5_note")}
          </p>
        </div>
      </section>

      {/* ── SECTION 6: THE PARTNERSHIP PROMISE (dark) ── */}
      <section className="px-5 py-20 sm:py-24">
        <div className="section-ink px-6 sm:px-12 py-14 sm:py-16 text-center max-w-4xl mx-auto">
          <motion.h2
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.6 }}
            className="font-display text-3xl sm:text-4xl font-black tracking-[-0.04em] text-white mb-10"
          >
            {t("pt_s6_title")}
          </motion.h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-left max-w-2xl mx-auto">
            {PROMISE_ITEMS.map((k) => (
              <PromiseItem key={k}>{t(k)}</PromiseItem>
            ))}
          </div>
          <p className="mt-8 text-[15px] leading-relaxed max-w-xl mx-auto" style={{ color: "rgba(255,255,255,0.55)" }}>
            {t("pt_s6_body")}
          </p>
        </div>
      </section>

      {/* ── SECTION 7: APPLICATION ── */}
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

      {/* ── GOOD PARTNERSHIP PRINCIPLES (accordion) ── */}
      <section className="py-12 sm:py-16" style={{ background: "rgba(91,76,245,0.02)" }}>
        <div className="max-w-2xl mx-auto px-5 sm:px-8">
          <div className="mb-8 text-center">
            <h2 className="font-display text-xl font-bold" style={{ color: "var(--ink)" }}>{t("pt_princ_title")}</h2>
            <p className="mt-3 text-[14px] leading-relaxed" style={{ color: "var(--gris-1)" }}>{t("pt_princ_intro")}</p>
          </div>
          <div className="space-y-3">
            <PrinciplesAccordionItem titleKey="pt_princ_a_title" items={PRINC_A} />
            <PrinciplesAccordionItem titleKey="pt_princ_b_title" items={PRINC_B} />
          </div>
        </div>
      </section>
    </PublicPageShell>
  );
}