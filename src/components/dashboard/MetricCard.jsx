// Map text color class to halo glow rgba
const GLOW = {
  "text-chart-1":     "rgba(31,78,216,0.32)",
  "text-chart-2":     "rgba(34,197,94,0.30)",
  "text-chart-3":     "rgba(251,146,60,0.32)",
  "text-orange-500":  "rgba(249,115,22,0.32)",
  "text-amber-500":   "rgba(245,158,11,0.32)",
  "text-cyan-500":    "rgba(6,182,212,0.32)",
  "text-yellow-500":  "rgba(234,179,8,0.32)",
  "text-pink-500":    "rgba(236,72,153,0.32)",
  "text-foreground":  "rgba(44,167,193,0.28)",
};

export default function MetricCard({ label, value, icon: Icon, color, border, bg, note }) {
  const glow = GLOW[color] || "rgba(31,78,216,0.25)";
  return (
    <div className={`group relative p-4 rounded-2xl border ${border} ${bg} flex flex-col overflow-hidden backdrop-blur-sm transition-all hover:-translate-y-0.5 hover:shadow-[0_18px_40px_-18px_rgba(0,0,0,0.18)]`}>
      <div className="pointer-events-none absolute -top-14 -right-14 w-36 h-36 rounded-full blur-3xl opacity-50 group-hover:opacity-90 transition-opacity"
           style={{ background: `radial-gradient(closest-side, ${glow}, transparent)` }} />
      <div className="relative">
        <Icon size={13} className={`mb-2 ${color}`} />
        <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground/65 mb-1 font-semibold">{label}</p>
        <p className={`text-lg sm:text-xl font-black tabular-nums tracking-tight ${color}`}>
          €{(value || 0).toLocaleString()}
        </p>
        {note && <p className="text-[10px] text-muted-foreground/50 mt-0.5 hidden sm:block">{note}</p>}
      </div>
    </div>
  );
}