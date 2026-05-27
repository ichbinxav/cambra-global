import { Plug, CheckCircle2, ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import ToolLogo from "@/components/shared/ToolLogo";
import { getCategoryAccent } from "@/lib/iconSystem";

/**
 * Connector card — premium infrastructure orchestration row.
 * Uses real brand logo + category accent token.
 */
export default function DarkConnectorCard({ connector, connected, onToggle }) {
  const c = connector;
  const isSoon = c.status === "soon";
  const accent = getCategoryAccent(c.cat);

  return (
    <div
      className={`group relative rounded-2xl border transition-all duration-200 bg-white ${
        connected
          ? "border-foreground/90"
          : "border-border/60 hover:border-foreground/40 hover:-translate-y-[1px]"
      }`}
      style={connected ? { boxShadow: `0 0 0 1px ${accent.color}33, 0 6px 18px -10px ${accent.color}40` } : undefined}
    >
      {/* Soft category glow on hover */}
      <div
        className="pointer-events-none absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity"
        style={{
          background: `radial-gradient(120% 60% at 0% 50%, ${accent.color}0A, transparent 60%)`,
        }}
      />

      <div className="relative flex items-center gap-4 p-4">
        {/* Real brand logo */}
        <ToolLogo name={c.name} category={c.cat?.toLowerCase()} size={22} />

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <p className="text-sm font-bold text-foreground tracking-tight">{c.name}</p>
            {isSoon && (
              <span className="text-[8px] uppercase tracking-[0.18em] px-2 py-0.5 rounded-full bg-secondary text-muted-foreground font-bold border border-border/60">
                Soon
              </span>
            )}
            {connected && (
              <span className="flex items-center gap-1 text-[9px] uppercase tracking-[0.15em] font-bold" style={{ color: accent.color }}>
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full rounded-full opacity-40" style={{ background: accent.color, animation: "ping-soft 1.8s cubic-bezier(0,0,0.2,1) infinite" }} />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full" style={{ background: accent.color }} />
                </span>
                Live
              </span>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground truncate">{c.desc}</p>
        </div>

        {/* Category dot marker (subtle, scannable) */}
        <span
          className="hidden sm:inline-flex items-center gap-1.5 text-[9px] uppercase tracking-[0.14em] font-semibold"
          style={{ color: accent.color }}
        >
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: accent.color }} />
          {c.cat}
        </span>

        {/* Action */}
        {connected ? (
          <button
            onClick={() => onToggle(c.name)}
            className="flex items-center gap-1.5 h-8 px-4 rounded-full text-xs font-bold shrink-0 transition-all text-background bg-foreground border border-foreground hover:opacity-90"
          >
            <CheckCircle2 size={11} /> Connected
          </button>
        ) : c.name === "Stripe" && !isSoon ? (
          <Link to="/StripeAnalyzer">
            <button className="h-8 px-4 rounded-full text-xs font-bold shrink-0 transition-all flex items-center gap-1.5 text-foreground border border-border/60 hover:border-foreground/40 bg-white">
              <Plug size={11} /> Analyze <ArrowRight size={10} />
            </button>
          </Link>
        ) : (
          <button
            onClick={() => !isSoon && onToggle(c.name)}
            className={`h-8 px-4 rounded-full text-xs font-bold shrink-0 transition-all flex items-center gap-1.5 ${
              isSoon
                ? "border border-border/60 text-muted-foreground cursor-default bg-white"
                : "border border-border/60 text-foreground hover:border-foreground/40 bg-white"
            }`}
          >
            {isSoon ? "Coming soon" : <><Plug size={11} /> Connect</>}
          </button>
        )}
      </div>
    </div>
  );
}