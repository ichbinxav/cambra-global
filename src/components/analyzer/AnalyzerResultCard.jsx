import { ArrowRight, ShieldCheck, Sparkles, TrendingUp, CreditCard, Truck, Package } from "lucide-react";

/**
 * AnalyzerResultCard — Result preview rendered INSIDE the Analyzer at Step 3.
 *
 * The whole point: the founder sees their savings number IMMEDIATELY after
 * confirming their stack, without having to connect anything. Connect/Upload
 * live BELOW this card as an optional refinement, not as a prerequisite.
 *
 * This is a presentation-only component. The parent (Analyzer.jsx) owns:
 *   - savings numbers (already computed via scoreEngine before Step 3 mount)
 *   - the CTA destination (Results vs AnalyzerTeaser)
 *
 * Props:
 *   - totalSavings:     number  — annual recoverable margin (EUR)
 *   - paymentSavings:   number
 *   - shippingSavings:  number
 *   - saasSavings:      number
 *   - confidence:       "low" | "medium" | "high"
 *   - isAuthed:         bool    — controls CTA label/destination logic
 *   - brandName:        string  — optional, for the lead-in
 *   - onSeeReport:      () => void  — primary CTA handler (navigate to Results / Teaser)
 */
export default function AnalyzerResultCard({
  totalSavings = 0,
  paymentSavings = 0,
  shippingSavings = 0,
  saasSavings = 0,
  confidence = "medium",
  isAuthed = false,
  brandName = "",
  onSeeReport,
}) {
  const formatEur = (n) => {
    const v = Math.max(0, Math.round(Number(n) || 0));
    try {
      return new Intl.NumberFormat("fr-FR", {
        style: "currency", currency: "EUR", maximumFractionDigits: 0,
      }).format(v);
    } catch {
      return `€${v.toLocaleString()}`;
    }
  };

  const confidenceMeta = {
    high:   { label: "High confidence",   color: "#10b981" },
    medium: { label: "Medium confidence", color: "#22d3ee" },
    low:    { label: "Estimated",         color: "#facc15" },
  }[confidence] || { label: "Estimated", color: "#facc15" };

  return (
    <div
      className="rounded-3xl p-6 sm:p-8 relative overflow-hidden"
      style={{
        background:
          "linear-gradient(180deg, rgba(34,211,238,0.06) 0%, rgba(59,130,246,0.04) 50%, rgba(255,255,255,0.02) 100%)",
        border: "1px solid rgba(34,211,238,0.22)",
        boxShadow: "0 32px 80px -32px rgba(34,211,238,0.30), 0 0 0 1px rgba(255,255,255,0.04) inset",
      }}
    >
      {/* Ambient glow */}
      <div
        aria-hidden
        className="absolute -top-20 -right-20 w-64 h-64 pointer-events-none"
        style={{
          background: "radial-gradient(circle, rgba(34,211,238,0.28) 0%, transparent 70%)",
          filter: "blur(40px)",
        }}
      />

      {/* Eyebrow */}
      <div className="flex items-center gap-2 mb-5">
        <div
          className="w-6 h-6 rounded-full flex items-center justify-center"
          style={{
            background: "rgba(34,211,238,0.15)",
            border: "1px solid rgba(34,211,238,0.40)",
          }}
        >
          <Sparkles size={11} className="text-cyan-300" />
        </div>
        <span className="text-[10px] uppercase tracking-[0.22em] font-bold text-cyan-300">
          Your estimated savings
        </span>
      </div>

      {/* Lead-in */}
      <p className="text-[13px] text-white/55 mb-3">
        {brandName
          ? <>For <span className="text-white/85 font-semibold">{brandName}</span>, we identified</>
          : <>We identified</>
        }
      </p>

      {/* The big number */}
      <div
        className="font-black tracking-[-0.055em] leading-none mb-3 tabular-nums"
        style={{
          fontSize: "clamp(2.75rem, 11vw, 5.5rem)",
          background: "linear-gradient(180deg, #ffffff 0%, #B8D8E0 45%, #2CA7C1 100%)",
          WebkitBackgroundClip: "text",
          backgroundClip: "text",
          WebkitTextFillColor: "transparent",
          filter: "drop-shadow(0 0 20px rgba(34,211,238,0.30))",
        }}
      >
        {formatEur(totalSavings)}
      </div>
      <p className="text-white/60 text-[14px] mb-6">
        of recoverable margin per year, across your infrastructure.
      </p>

      {/* Confidence badge */}
      <div
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-[0.18em] mb-6"
        style={{
          background: `${confidenceMeta.color}15`,
          border: `1px solid ${confidenceMeta.color}40`,
          color: confidenceMeta.color,
        }}
      >
        <span className="w-1.5 h-1.5 rounded-full" style={{ background: confidenceMeta.color }} />
        {confidenceMeta.label}
      </div>

      {/* Mini breakdown — payments / shipping / SaaS */}
      <div className="grid grid-cols-3 gap-2 mb-6">
        <Breakdown icon={CreditCard} label="Payments"  value={formatEur(paymentSavings)} />
        <Breakdown icon={Truck}      label="Shipping"  value={formatEur(shippingSavings)} />
        <Breakdown icon={Package}    label="SaaS"      value={formatEur(saasSavings)} />
      </div>

      {/* Primary CTA — different label for authed vs anon */}
      <button
        type="button"
        onClick={onSeeReport}
        className="w-full h-12 rounded-full inline-flex items-center justify-center gap-2 text-sm font-bold text-black bg-white hover:bg-white/90 transition-colors"
        style={{
          boxShadow:
            "0 0 0 1px rgba(255,255,255,0.10), 0 12px 32px -12px rgba(34,211,238,0.55), 0 0 28px rgba(34,211,238,0.22)",
        }}
      >
        {isAuthed ? "See full report" : "Create account & view breakdown"}
        <ArrowRight size={15} />
      </button>

      {/* Trust microcopy */}
      <div className="mt-4 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[10.5px] text-white/40">
        <span className="inline-flex items-center gap-1.5"><ShieldCheck size={10} /> Private audit</span>
        <span className="inline-flex items-center gap-1.5"><TrendingUp size={10} /> Based on benchmarks</span>
      </div>
    </div>
  );
}

function Breakdown({ icon: Icon, label, value }) {
  return (
    <div
      className="rounded-xl p-3 text-center"
      style={{
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(255,255,255,0.08)",
      }}
    >
      <div className="flex items-center justify-center gap-1 mb-1.5">
        <Icon size={10} className="text-white/45" />
        <span className="text-[9px] uppercase tracking-[0.14em] font-bold text-white/45">
          {label}
        </span>
      </div>
      <p className="text-sm font-black text-white tabular-nums leading-none">{value}</p>
    </div>
  );
}