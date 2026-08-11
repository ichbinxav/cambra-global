import React from "react";
import { ShieldCheck } from "lucide-react";
import SectionHeading from "@/components/landing/SectionHeading";
import { useTranslation } from "@/lib/i18n.jsx";

const ITEMS = [1, 2, 3, 4, 5];

function ProofCard({ number }) {
  const { t } = useTranslation();
  return (
    <article
      className="relative rounded-2xl overflow-hidden p-6 shrink-0 w-[320px] sm:w-[360px]"
      style={{ background: "linear-gradient(180deg, #0b1020 0%, #07090f 100%)", border: "1px solid rgba(255,255,255,0.10)", boxShadow: "0 20px 50px -20px rgba(0,0,0,0.5)" }}
    >
      <div aria-hidden className="absolute pointer-events-none" style={{ width: 260, height: 260, right: "-20%", top: "-35%", background: "radial-gradient(circle, rgba(139,123,255,0.18) 0%, transparent 70%)", filter: "blur(50px)" }} />
      <div className="relative flex items-center gap-2 mb-5">
        <ShieldCheck size={15} style={{ color: "var(--voltio-2)" }} />
        <span className="text-[9px] uppercase tracking-[0.22em] font-bold" style={{ color: "var(--voltio-2)" }}>
          {t("tst_category")}
        </span>
      </div>
      <h3 className="relative text-white text-base font-bold mb-3">
        {t(`tst_proof_title${number}`)}
      </h3>
      <p className="relative text-sm text-white/70 leading-relaxed">
        {t(`tst_q${number}`)}
      </p>
    </article>
  );
}

export default function TestimonialsCarousel() {
  const { t } = useTranslation();
  return (
    <section id="evidence-standards" className="relative py-12 sm:py-16 overflow-hidden">
      <div className="relative max-w-6xl mx-auto px-6 sm:px-10">
        <SectionHeading eyebrow={t("tst_eyebrow")} className="mb-10">
          {t("tst_h2_pre")}<br /><span className="kw">{t("tst_h2_kw")}</span>
        </SectionHeading>
        <div className="flex gap-5 overflow-x-auto pb-4 snap-x snap-mandatory">
          {ITEMS.map((number) => <div key={number} className="snap-start"><ProofCard number={number} /></div>)}
        </div>
      </div>
    </section>
  );
}
