import React from "react";
import { Quote } from "lucide-react";

/**
 * 3 testimonials — photo + quote + EUR figure.
 * Dark editorial cards, fully self-contained.
 */
const TESTIMONIALS = [
  {
    name: "Camille Roux",
    role: "Founder & CEO",
    brand: "Maison Lume",
    photo:
      "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=200&h=200&fit=crop&crop=faces&q=80",
    quote:
      "We were bleeding 1.4% on every transaction and didn't even know. CAMBRA found it, fixed it, and the savings showed up next month.",
    figure: "+€8,400",
    figureLabel: "saved · 3 months",
    vertical: "Payments",
  },
  {
    name: "Daniel Mörch",
    role: "COO",
    brand: "Nord Atelier",
    photo:
      "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=200&h=200&fit=crop&crop=faces&q=80",
    quote:
      "Three carriers, four contracts, zero leverage. CAMBRA renegotiated everything against the network. We cut shipping 23% in a quarter.",
    figure: "+€6,200",
    figureLabel: "saved · 3 months",
    vertical: "Shipping",
  },
  {
    name: "Lucía Hernández",
    role: "Head of Ops",
    brand: "Sereno DTC",
    photo:
      "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200&h=200&fit=crop&crop=faces&q=80",
    quote:
      "We had 14 SaaS tools and no clue what we actually used. CAMBRA mapped everything, killed 7 redundant tools and renegotiated the rest.",
    figure: "+€3,800",
    figureLabel: "saved · 3 months",
    vertical: "SaaS",
  },
];

function TestimonialCard({ t, index }) {
  return (
    <article
      className="relative h-full p-7 rounded-2xl overflow-hidden group transition-transform duration-300 hover:-translate-y-1"
      style={{
        background:
          "linear-gradient(180deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.015) 100%)",
        border: "1px solid rgba(255,255,255,0.10)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
      }}
    >
      {/* hover halo */}
      <div
        aria-hidden
        className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
        style={{
          background:
            "radial-gradient(circle at 30% 0%, rgba(96,165,250,0.16), transparent 65%)",
        }}
      />

      {/* Vertical tag */}
      <div className="relative flex items-center justify-between mb-6">
        <span
          className="text-[10px] uppercase tracking-[0.22em] font-bold"
          style={{ color: "rgba(96,165,250,0.85)" }}
        >
          {t.vertical}
        </span>
        <Quote size={18} className="text-white/15" aria-hidden />
      </div>

      {/* Quote */}
      <p
        className="relative text-white text-[16px] leading-[1.55] mb-7"
        style={{ letterSpacing: "-0.01em" }}
      >
        "{t.quote}"
      </p>

      {/* Figure — the hero number */}
      <div className="relative mb-6">
        <div
          className="font-black tabular-nums text-white"
          style={{
            fontSize: "clamp(28px, 3.4vw, 38px)",
            letterSpacing: "-0.04em",
            lineHeight: 1,
            textShadow: "0 0 24px rgba(34,211,238,0.25)",
            background:
              "linear-gradient(135deg, #ffffff 0%, #b8d8e0 55%, #22d3ee 100%)",
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            WebkitTextFillColor: "transparent",
          }}
        >
          {t.figure}
        </div>
        <div
          className="text-[11px] uppercase tracking-[0.18em] mt-1"
          style={{ color: "rgba(255,255,255,0.45)" }}
        >
          {t.figureLabel}
        </div>
      </div>

      {/* Identity row */}
      <div className="relative flex items-center gap-3 pt-5" style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}>
        <img
          src={t.photo}
          alt={t.name}
          loading="lazy"
          className="w-10 h-10 rounded-full object-cover"
          style={{ border: "1px solid rgba(255,255,255,0.15)" }}
        />
        <div className="min-w-0">
          <p className="text-white text-[13px] font-bold truncate">{t.name}</p>
          <p className="text-[12px] truncate" style={{ color: "rgba(255,255,255,0.55)" }}>
            {t.role} · <span className="text-white/75">{t.brand}</span>
          </p>
        </div>
      </div>

      {/* Index marker */}
      <span
        aria-hidden
        className="absolute top-5 right-5 text-mono text-[10px] font-bold"
        style={{ color: "rgba(255,255,255,0.20)" }}
      >
        0{index + 1}
      </span>
    </article>
  );
}

export default function TestimonialsStrong() {
  return (
    <section className="relative py-24 sm:py-32 overflow-hidden">
      {/* ambient wash */}
      <div
        aria-hidden
        className="absolute pointer-events-none"
        style={{
          width: 800,
          height: 600,
          right: "-15%",
          top: "10%",
          background:
            "radial-gradient(circle, rgba(96,165,250,0.10) 0%, transparent 70%)",
          filter: "blur(90px)",
        }}
      />

      <div className="relative max-w-6xl mx-auto px-6 sm:px-10">
        <div className="mb-14 max-w-3xl">
          <span className="text-[11px] uppercase tracking-[0.22em] font-bold text-white/45">
            Brands like yours
          </span>
          <h2
            className="text-white mt-4"
            style={{
              fontSize: "clamp(32px, 5vw, 60px)",
              fontWeight: 900,
              letterSpacing: "-0.04em",
              lineHeight: 1.0,
            }}
          >
            Real brands. Real money back.
          </h2>
          <p className="mt-5 text-white/55 text-[16px] leading-relaxed max-w-2xl">
            A few of the independent brands already recovering margin through the CAMBRA network.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {TESTIMONIALS.map((t, i) => (
            <TestimonialCard key={t.name} t={t} index={i} />
          ))}
        </div>
      </div>
    </section>
  );
}