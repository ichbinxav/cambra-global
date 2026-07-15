// InsightCard — the shared tech-styled shell for every Phase-1 insight tile.
// Dark surface, subtle grid, monospace numbers, soft glow. Kept tiny + generic
// so PaymentsDataInsights composes tiles without repeating chrome.

const MONO = "'IBM Plex Mono', ui-monospace, monospace";

export default function InsightCard({ label, note, accent = "cyan", children, className = "", span = 1 }) {
  const accentColor = accent === "amber" ? "rgb(245,181,68)"
    : accent === "red" ? "rgb(248,113,113)"
    : accent === "neutral" ? "rgba(255,255,255,0.6)"
    : "rgb(103,232,249)"; // cyan default
  return (
    <div
      className={`relative rounded-2xl p-5 overflow-hidden ${span === 2 ? "sm:col-span-2" : ""} ${className}`}
      style={{
        background: "rgba(255,255,255,0.025)",
        border: "1px solid rgba(255,255,255,0.08)",
      }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)",
          backgroundSize: "28px 28px",
          opacity: 0.5,
          maskImage: "radial-gradient(ellipse 90% 90% at 50% 0%, #000 30%, transparent 90%)",
          WebkitMaskImage: "radial-gradient(ellipse 90% 90% at 50% 0%, #000 30%, transparent 90%)",
        }}
      />
      <div className="relative z-10">
        {label && (
          <p className="uppercase font-bold mb-3" style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.18em", color: accentColor, opacity: 0.85 }}>
            {label}
          </p>
        )}
        {children}
        {note && <p className="text-[11px] text-white/45 mt-2.5 leading-snug">{note}</p>}
      </div>
    </div>
  );
}

export const INSIGHT_MONO = MONO;