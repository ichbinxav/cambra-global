import React from "react";
import { Quote, TrendingUp } from "lucide-react";
import InitialsAvatar from "@/components/shared/InitialsAvatar";
import SectionHeading from "@/components/landing/SectionHeading";

// ⚠️ ILLUSTRATIVE / PLACEHOLDER testimonials — invented names + quotes.
// Uses initials avatars (NOT photos) on purpose: a fake photo-realistic face
// + fake quote presented as a real customer is misleading advertising.
// REPLACE with real, consented customer quotes (and real photos) before launch.
const ITEMS = [
  {
    category: "Payments",
    vertical: "Maison Épice",
    quote: "We were paying 2.4% blended and thought that was just the cost of cards. CAMBRA showed us the processor margin was the only movable part — and how much we were leaving on the table.",
    name: "Camille Laurent",
    role: "Founder",
    revenue: "Maison Épice",
    before: "2.40%",
    after: "1.62%",
    savings: "€14K",
  },
  {
    category: "Payments",
    vertical: "Atelier Nord",
    quote: "The 3-minute audit was more transparent about our card fees than our PSP had been in three years. We saw exactly where the money leaked.",
    name: "Théo Mercier",
    role: "COO",
    revenue: "Atelier Nord",
    before: "2.15%",
    after: "1.48%",
    savings: "€11K",
  },
  {
    category: "Payments",
    vertical: "Vela Studio",
    quote: "Joining the collective got us to a rate we'd never have reached negotiating alone at our size. Brands moving as one — that's the whole point.",
    name: "Sofia Ferran",
    role: "Founder",
    revenue: "Vela Studio",
    before: "2.55%",
    after: "1.70%",
    savings: "€9K",
  },
  {
    category: "Payments",
    vertical: "Brün Coffee",
    quote: "No retainer, no contract. They only got paid once our bank statements confirmed the savings. That alignment is rare.",
    name: "Lucas Petit",
    role: "Finance lead",
    revenue: "Brün Coffee",
    before: "2.30%",
    after: "1.55%",
    savings: "€8K",
  },
  {
    category: "Payments",
    vertical: "Lume",
    quote: "CAMBRA benchmarked us against French brands our size — we were in the most expensive third. Seeing that in one number changed how we think about payments.",
    name: "Inès Marchal",
    role: "Founder",
    revenue: "Lume",
    before: "2.60%",
    after: "1.75%",
    savings: "€13K",
  },
];

function TestimonialCard({ item }) {
  return (
    <div
      className="relative rounded-2xl overflow-hidden p-6 shrink-0 w-[340px] sm:w-[380px]"
      style={{
        background: "linear-gradient(180deg, #0b1020 0%, #07090f 100%)",
        border: "1px solid rgba(255,255,255,0.10)",
        boxShadow: "0 20px 50px -20px rgba(0,0,0,0.5)",
      }}
    >
      {/* corner glow */}
      <div
        aria-hidden
        className="absolute pointer-events-none"
        style={{
          width: 300, height: 300, right: "-20%", top: "-30%",
          background: "radial-gradient(circle, rgba(139,123,255,0.18) 0%, transparent 70%)",
          filter: "blur(50px)",
        }}
      />

      {/* category */}
      <div className="relative flex items-center gap-2 mb-4">
        <Quote size={13} style={{ color: "#8B7BFF" }} />
        <span className="text-[9px] uppercase tracking-[0.22em] font-bold" style={{ color: "#8B7BFF" }}>
          {item.category}
        </span>
        <span className="text-white/30">·</span>
        <span className="text-[9px] uppercase tracking-[0.22em] font-bold text-white/55">
          {item.vertical}
        </span>
      </div>

      {/* quote */}
      <p
        className="relative text-white mb-5"
        style={{
          fontSize: "14px",
          lineHeight: 1.45,
          fontWeight: 500,
          letterSpacing: "-0.005em",
        }}
      >
        "{item.quote}"
      </p>

      {/* author */}
      <div className="relative flex items-center gap-2.5 mb-5">
        <InitialsAvatar name={item.name} size={36} />
        <div className="min-w-0">
          <p className="text-white text-[12px] font-bold tracking-tight truncate">
            {item.name}
          </p>
          <p className="text-[10px] text-white/55 truncate">
            {item.role} <span className="text-white/30">·</span> {item.revenue}
          </p>
        </div>
      </div>

      {/* divider */}
      <div className="relative my-5 h-px" style={{ background: "rgba(255,255,255,0.08)" }} />

      {/* before / after / saved */}
      <div className="relative grid grid-cols-3 items-center gap-3">
        <div className="text-center">
          <p className="text-[9px] uppercase tracking-[0.22em] font-bold text-white/40 mb-1">
            Before
          </p>
          <p
            className="font-black tabular-nums text-white/50"
            style={{
              fontSize: "18px",
              letterSpacing: "-0.02em",
              lineHeight: 1,
              textDecoration: "line-through",
            }}
          >
            {item.before}
          </p>
        </div>
        <div className="text-center">
          <p className="text-[9px] uppercase tracking-[0.22em] font-bold mb-1" style={{ color: "rgba(47,224,168,0.85)" }}>
            After
          </p>
          <p
            className="font-black tabular-nums"
            style={{
              color: "#2FE0A8",
              fontSize: "18px",
              letterSpacing: "-0.02em",
              lineHeight: 1,
            }}
          >
            {item.after}
          </p>
        </div>
        <div className="text-center" style={{ borderLeft: "1px solid rgba(255,255,255,0.08)" }}>
          <div className="inline-flex items-center gap-1 mb-1">
            <TrendingUp size={9} style={{ color: "#2FE0A8" }} />
            <p className="text-[9px] uppercase tracking-[0.22em] font-bold" style={{ color: "rgba(47,224,168,0.85)" }}>
              Saved
            </p>
          </div>
          <p
            className="font-black tabular-nums"
            style={{
              fontFamily: "'Space Grotesk', 'Inter', sans-serif",
              fontSize: "24px",
              letterSpacing: "-0.03em",
              lineHeight: 0.95,
              background:
                "linear-gradient(135deg, #2FE0A8 0%, #0FA97A 100%)",
              WebkitBackgroundClip: "text",
              backgroundClip: "text",
              WebkitTextFillColor: "transparent",
              filter: "drop-shadow(0 0 16px rgba(47,224,168,0.35))",
            }}
          >
            {item.savings}
          </p>
          <p className="text-[9px] text-white/40 mt-0.5">/year</p>
        </div>
      </div>
    </div>
  );
}

export default function TestimonialsCarousel() {
  // Duplicate the list so the marquee loops seamlessly (-50% translate).
  const loop = [...ITEMS, ...ITEMS];

  return (
    <section id="testimonials" className="relative py-12 sm:py-16 overflow-hidden">
      <div className="relative max-w-6xl mx-auto px-6 sm:px-10">
        <SectionHeading eyebrow="Real findings" className="mb-10">
          What brands
          <br />
          <span className="kw">actually recovered.</span>
        </SectionHeading>
      </div>

      {/* Continuous marquee ribbon — pauses on hover. Edges fade via mask. */}
      <div
        className="relative group"
        style={{
          maskImage:
            "linear-gradient(90deg, transparent 0%, #000 8%, #000 92%, transparent 100%)",
          WebkitMaskImage:
            "linear-gradient(90deg, transparent 0%, #000 8%, #000 92%, transparent 100%)",
        }}
      >
        <div className="flex gap-5 w-max animate-testimonials-marquee group-hover:[animation-play-state:paused]">
          {loop.map((item, i) => (
            <TestimonialCard key={i} item={item} />
          ))}
        </div>
      </div>

      <style>{`
        @keyframes testimonials-marquee {
          from { transform: translateX(0); }
          to { transform: translateX(-50%); }
        }
        .animate-testimonials-marquee {
          animation: testimonials-marquee 40s linear infinite;
        }
        @media (prefers-reduced-motion: reduce) {
          .animate-testimonials-marquee { animation: none; }
        }
      `}</style>
    </section>
  );
}