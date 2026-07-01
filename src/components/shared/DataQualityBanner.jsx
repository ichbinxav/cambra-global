import { Link } from "react-router-dom";
import { Zap, Upload, X } from "lucide-react";
import { useState } from "react";

/**
 * DataQualityBanner — shown when user has no real data connected.
 * variant: "banner" (top of dashboard) | "card" (inline card) | "empty" (empty state)
 */
export default function DataQualityBanner({ variant = "banner", onDismiss }) {
  const [dismissed, setDismissed] = useState(false);

  const dismiss = () => {
    setDismissed(true);
    onDismiss?.();
  };

  if (dismissed) return null;

  if (variant === "banner") {
    return (
      <div className="relative flex items-center gap-4 p-4 rounded-2xl border border-border/50 bg-secondary/30 mb-6">
        <div className="w-9 h-9 rounded-xl bg-foreground flex items-center justify-center shrink-0">
          <Zap size={14} className="text-background" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold mb-0.5">Get a more accurate analysis</p>
          <p className="text-[11px] text-muted-foreground/60 leading-relaxed hidden sm:block">
            Connect your tools or upload your data to turn estimates into real infrastructure intelligence.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Link to="/ConnectTools">
            <button className="h-8 px-4 rounded-full bg-foreground text-background text-xs font-bold flex items-center gap-1.5 hover:bg-foreground/90 transition-colors">
              <Zap size={10} /> Connect tools
            </button>
          </Link>
          <button
            onClick={dismiss}
            className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-secondary transition-colors text-muted-foreground/30 hover:text-muted-foreground"
          >
            <X size={13} />
          </button>
        </div>
      </div>
    );
  }

  if (variant === "card") {
    return (
      <div className="p-5 rounded-2xl border border-border/50 bg-card">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-orange-400" />
            <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground/50">Data accuracy</p>
          </div>
          <span className="text-[10px] px-2.5 py-1 rounded-full bg-orange-500/[0.08] text-orange-500 border border-orange-500/20 font-semibold">
            Low — estimated
          </span>
        </div>
        <p className="text-sm font-semibold mb-1">Based on manual inputs</p>
        <p className="text-[11px] text-muted-foreground/50 leading-relaxed mb-4">
          Connect your tools to turn this estimate into real infrastructure data.
        </p>
        <div className="flex gap-2">
          <Link to="/ConnectTools">
            <button className="h-8 px-3.5 rounded-full bg-foreground text-background text-xs font-bold flex items-center gap-1.5">
              <Zap size={10} /> Improve accuracy
            </button>
          </Link>
          <Link to="/ConnectTools?mode=upload">
            <button className="h-8 px-3.5 rounded-full border border-border/60 text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1.5">
              <Upload size={10} /> Upload data
            </button>
          </Link>
        </div>
      </div>
    );
  }

  if (variant === "empty") {
    return (
      <div className="text-center py-10 px-6 rounded-2xl border border-dashed border-border/50">
        <div className="w-12 h-12 rounded-2xl bg-secondary flex items-center justify-center mx-auto mb-4">
          <Zap size={18} className="text-muted-foreground/30" />
        </div>
        <p className="font-semibold mb-1">No data connected yet</p>
        <p className="text-sm text-muted-foreground/60 mb-5 max-w-xs mx-auto leading-relaxed">
          Connect your tools or upload invoices to unlock real savings insights.
        </p>
        <div className="flex gap-2 justify-center flex-wrap">
          <Link to="/ConnectTools">
            <button className="h-9 px-5 rounded-full bg-foreground text-background text-xs font-bold flex items-center gap-1.5">
              <Zap size={11} /> Connect tools
            </button>
          </Link>
          <Link to="/ConnectTools?mode=upload">
            <button className="h-9 px-5 rounded-full border border-border/60 text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1.5">
              <Upload size={11} /> Upload data
            </button>
          </Link>
        </div>
      </div>
    );
  }

  return null;
}