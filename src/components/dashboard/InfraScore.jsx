import { ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";

const SCORE_LABEL = s => s >= 90 ? "Best-in-class" : s >= 80 ? "Strong" : s >= 60 ? "Efficient" : s >= 40 ? "Optimization opportunity detected" : "High optimization potential";
// Bright on navy
const SCORE_COLOR = s => s >= 80 ? "#52EBA4" : s >= 60 ? "#FFB05A" : "#7AA8FF";
const SCORE_GLOW  = s => s >= 80 ? "rgba(82,235,164,0.45)" : s >= 60 ? "rgba(255,176,90,0.45)" : "rgba(122,168,255,0.45)";

export default function InfraScore({ score, resultId }) {
  const scoreColor = SCORE_COLOR(score);
  const scoreGlow = SCORE_GLOW(score);
  return (
    <Link to={`/Results?id=${resultId}`}>
      <div className="cambra-card group p-6 h-full">
        <div className="pointer-events-none absolute -top-20 -right-20 w-52 h-52 rounded-full blur-3xl opacity-70 group-hover:opacity-100 transition-opacity"
             style={{ background: `radial-gradient(closest-side, ${scoreGlow}, transparent)`, zIndex: 0 }} />
        <div className="relative">
          <div className="flex items-center justify-between mb-4">
            <p className="cc-eyebrow">Infrastructure score</p>
            <p className="text-[10px] text-white/50 group-hover:text-white transition-colors flex items-center gap-0.5">
              Details <ChevronRight size={9} />
            </p>
          </div>
          <div className="flex items-center gap-4">
            <div className="relative w-16 h-16 shrink-0">
              <div className="absolute inset-0 rounded-full blur-md opacity-60" style={{ background: scoreGlow }} />
              <svg className="relative w-16 h-16 -rotate-90" viewBox="0 0 60 60">
                <circle cx="30" cy="30" r="26" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="5" />
                <circle cx="30" cy="30" r="26" fill="none" stroke={scoreColor} strokeWidth="5" strokeLinecap="round"
                  strokeDasharray={2 * Math.PI * 26}
                  strokeDashoffset={2 * Math.PI * 26 * (1 - score / 100)}
                  style={{ transition: "stroke-dashoffset 1.5s ease-out" }} />
                <text x="30" y="35" textAnchor="middle" fill={scoreColor} fontSize="12" fontWeight="900" transform="rotate(90 30 30)" className="tabular-nums">{score}</text>
              </svg>
            </div>
            <div className="flex-1">
              <p className="text-xl font-black mb-0.5 tracking-tight" style={{ color: scoreColor }}>{SCORE_LABEL(score)}</p>
              <p className="text-xs text-white/60 leading-snug">
                {score >= 60 ? "Above average. CAMBRA can push this further." : "Optimization opportunities identified — unlock terms to improve."}
              </p>
              <div className="mt-3 h-1.5 rounded-full bg-white/10 overflow-hidden w-full">
                <div className="h-full rounded-full transition-all duration-1500"
                  style={{ width: `${score}%`, background: `linear-gradient(90deg, ${scoreColor}, ${scoreColor}CC)`, boxShadow: `0 0 12px ${scoreGlow}` }} />
              </div>
              <div className="flex justify-between mt-1">
                <span className="text-[9px] text-white/35">0</span>
                <span className="text-[9px] text-white/35">100</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}