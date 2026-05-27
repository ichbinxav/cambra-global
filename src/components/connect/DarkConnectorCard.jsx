import { Plug, CheckCircle2, ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";

/**
 * Premium dark glassmorphic connector card — replaces the flat list items.
 */
export default function DarkConnectorCard({ connector, connected, onToggle }) {
  const c = connector;
  const isSoon = c.status === "soon";

  return (
    <div className={`group relative overflow-hidden rounded-2xl border transition-all duration-200 ${
      connected
        ? "border-emerald-400/30 bg-[#0a1a14] shadow-[0_0_32px_rgba(52,211,153,0.08)]"
        : "border-white/[0.08] bg-[#0b0d14] hover:border-white/[0.16] hover:shadow-[0_12px_40px_-12px_rgba(0,0,0,0.5)]"
    }`}>
      {/* Ambient halo on hover */}
      {!connected && !isSoon && (
        <div className="pointer-events-none absolute -top-16 -right-16 w-40 h-40 rounded-full blur-3xl opacity-0 group-hover:opacity-60 transition-opacity duration-300"
             style={{ background: `radial-gradient(closest-side, ${c.color}40, transparent 65%)` }} />
      )}
      {connected && (
        <div className="pointer-events-none absolute -bottom-12 -left-12 w-36 h-36 rounded-full blur-3xl opacity-40"
             style={{ background: "radial-gradient(closest-side, rgba(52,211,153,0.35), transparent 60%)" }} />
      )}

      <div className="relative flex items-center gap-4 p-4">
        {/* Avatar */}
        <div className="w-11 h-11 rounded-xl flex items-center justify-center font-black text-xs shrink-0"
             style={{ background: `linear-gradient(135deg, ${c.color}25, ${c.color}10)`, border: `1px solid ${c.color}35` }}>
          <span style={{ color: c.color }}>{c.name.slice(0, 2).toUpperCase()}</span>
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <p className="text-sm font-bold text-white/90">{c.name}</p>
            {isSoon && (
              <span className="text-[8px] uppercase tracking-[0.18em] px-2 py-0.5 rounded-full bg-white/[0.06] text-white/30 font-bold border border-white/[0.06]">Soon</span>
            )}
            {connected && (
              <span className="flex items-center gap-1 text-[9px] uppercase tracking-[0.15em] text-emerald-400 font-bold">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-50 animate-ping" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
                </span>
                Live
              </span>
            )}
          </div>
          <p className="text-[11px] text-white/30 truncate">{c.desc}</p>
        </div>

        {/* Category pill */}
        <span className="text-[9px] uppercase tracking-[0.12em] text-white/20 font-medium hidden sm:block">{c.cat}</span>

        {/* Action */}
        {connected ? (
          <button
            onClick={() => onToggle(c.name)}
            className="flex items-center gap-1.5 h-8 px-4 rounded-full text-xs font-bold shrink-0 transition-all text-emerald-400 bg-emerald-400/[0.08] border border-emerald-400/25 hover:bg-emerald-400/[0.15]"
          >
            <CheckCircle2 size={11} /> Connected
          </button>
        ) : c.name === "Stripe" && !isSoon ? (
          <Link to="/StripeAnalyzer">
            <button className="h-8 px-4 rounded-full text-xs font-bold shrink-0 transition-all flex items-center gap-1.5 text-white border border-white/15 hover:border-white/30"
                    style={{ background: "linear-gradient(135deg, #635BFF33, #635BFF11)" }}>
              <Plug size={11} /> Analyze <ArrowRight size={10} />
            </button>
          </Link>
        ) : (
          <button
            onClick={() => !isSoon && onToggle(c.name)}
            className={`h-8 px-4 rounded-full text-xs font-bold shrink-0 transition-all flex items-center gap-1.5 ${
              isSoon
                ? "border border-white/[0.06] text-white/20 cursor-default"
                : "border border-white/15 text-white/60 hover:text-white hover:border-white/30 hover:bg-white/[0.04]"
            }`}
          >
            {isSoon ? "Coming soon" : <><Plug size={11} /> Connect</>}
          </button>
        )}
      </div>
    </div>
  );
}