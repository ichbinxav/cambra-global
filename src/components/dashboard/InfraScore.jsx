import { ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";

const SCORE_LABEL = s => s >= 90 ? "Best-in-class" : s >= 80 ? "Strong" : s >= 60 ? "Efficient" : s >= 40 ? "Optimization opportunity detected" : "High optimization potential";
const SCORE_COLOR = s => s >= 80 ? "#22c55e" : s >= 60 ? "#f97316" : "#1F4ED8";
const SCORE_GLOW  = s => s >= 80 ? "rgba(34,197,94,0.35)" : s >= 60 ? "rgba(249,115,22,0.35)" : "rgba(31,78,216,0.35)";

export default function InfraScore({ score, resultId }) {
  const scoreColor = SCORE_COLOR(score);
  const scoreGlow = SCORE_GLOW(score);
  return (
    <Link to={`/Results?id=${resultId}`}>
      <div className="group relative p-6 rounded-2xl border border-border/60 bg-card/95 backdrop-blur-sm h-full overflow-hidden transition-all hover:-translate-y-0.5 hover:shadow-[0_18px_40px_-16px_rgba(0,0,0,0.12)]">
        <div className="pointer-events-none absolute -top-20 -right-20 w-52 h-52 rounded-full blur-3xl opacity-50 group-hover:opacity-80 transition-opacity"
             style={{ background: `radial-gradient(closest-side, ${scoreGlow}, transparent)` }} />
        <div className="relative">
          <div className="flex items-center justify-between mb-4">
            <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground/70 font-semibold">Infrastructure score</p>
            <p className="text-[10px] text-muted-foreground/50 group-hover:text-foreground transition-colors flex items-center gap-0.5">
              Details <ChevronRight size={9} />
            </p>
          </div>
          <div className="flex items-center gap-4">
            <div className="relative w-16 h-16 shrink-0">
              <div className="absolute inset-0 rounded-full blur-md opacity-50" style={{ background: scoreGlow }} />
              <svg className="relative w-16 h-16 -rotate-90" viewBox="0 0 60 60">
                <circle cx="30" cy="30" r="26" fill="none" stroke="hsl(var(--border))" strokeWidth="5" />
                <circle cx="30" cy="30" r="26" fill="none" stroke={scoreColor} strokeWidth="5" strokeLinecap="round"
                  strokeDasharray={2 * Math.PI * 26}
                  strokeDashoffset={2 * Math.PI * 26 * (1 - score / 100)}
                  style={{ transition: "stroke-dashoffset 1.5s ease-out" }} />
                <text x="30" y="35" textAnchor="middle" fill={scoreColor} fontSize="12" fontWeight="900" transform="rotate(90 30 30)" className="tabular-nums">{score}</text>
              </svg>
            </div>
            <div className="flex-1">
              <p className="text-xl font-black mb-0.5 tracking-tight" style={{ color: scoreColor }}>{SCORE_LABEL(score)}</p>
              <p className="text-xs text-muted-foreground leading-snug">
                {score >= 60 ? "Above average. CAMBRA can push this further." : "Optimization opportunities identified — activate deals to improve."}
              </p>
              <div className="mt-3 h-1.5 rounded-full bg-border/40 overflow-hidden w-full">
                <div className="h-full rounded-full transition-all duration-1500"
                  style={{ width: `${score}%`, background: `linear-gradient(90deg, ${scoreColor}, ${scoreColor}CC)`, boxShadow: `0 0 12px ${scoreGlow}` }} />
              </div>
              <div className="flex justify-between mt-1">
                <span className="text-[9px] text-muted-foreground/40">0</span>
                <span className="text-[9px] text-muted-foreground/40">100</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}