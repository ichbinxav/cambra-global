import { Plug, CheckCircle2, ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";

/**
 * Light connector card — uniform white theme.
 */
export default function DarkConnectorCard({ connector, connected, onToggle }) {
  const c = connector;
  const isSoon = c.status === "soon";

  return (
    <div className={`group relative rounded-2xl border transition-all duration-200 ${
      connected
        ? "border-foreground bg-white"
        : "border-border/60 bg-white hover:border-foreground/40"
    }`}>
      <div className="flex items-center gap-4 p-4">
        {/* Avatar */}
        <div className="w-11 h-11 rounded-xl flex items-center justify-center font-black text-xs shrink-0 bg-secondary border border-border/60">
          <span className="text-foreground">{c.name.slice(0, 2).toUpperCase()}</span>
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <p className="text-sm font-bold text-foreground">{c.name}</p>
            {isSoon && (
              <span className="text-[8px] uppercase tracking-[0.18em] px-2 py-0.5 rounded-full bg-secondary text-muted-foreground font-bold border border-border/60">Soon</span>
            )}
            {connected && (
              <span className="flex items-center gap-1 text-[9px] uppercase tracking-[0.15em] text-foreground font-bold">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full rounded-full bg-foreground opacity-30 animate-ping" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-foreground" />
                </span>
                Live
              </span>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground truncate">{c.desc}</p>
        </div>

        {/* Category pill */}
        <span className="text-[9px] uppercase tracking-[0.12em] text-muted-foreground font-medium hidden sm:block">{c.cat}</span>

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