// Map text color class to halo glow rgba — used inside navy card
const GLOW = {
  "text-chart-1":     "rgba(56,123,255,0.55)",
  "text-chart-2":     "rgba(82,235,164,0.45)",
  "text-chart-3":     "rgba(255,176,90,0.50)",
  "text-orange-500":  "rgba(255,160,90,0.50)",
  "text-amber-500":   "rgba(255,200,90,0.45)",
  "text-cyan-500":    "rgba(80,210,235,0.50)",
  "text-yellow-500":  "rgba(255,220,90,0.45)",
  "text-pink-500":    "rgba(255,120,180,0.45)",
  "text-foreground":  "rgba(80,210,235,0.45)",
};

// Map legacy text color class to bright variant that works on navy
const TEXT_ON_NAVY = {
  "text-chart-1":     "text-[#7AA8FF]",
  "text-chart-2":     "text-[#52EBA4]",
  "text-chart-3":     "text-[#FFB05A]",
  "text-orange-500":  "text-[#FFA05A]",
  "text-amber-500":   "text-[#FFC85A]",
  "text-cyan-500":    "text-[#7BD9F0]",
  "text-yellow-500":  "text-[#FFDC5A]",
  "text-pink-500":    "text-[#FF8AC0]",
  "text-foreground":  "text-white",
};

export default function MetricCard({ label, value, icon: Icon, color, note }) {
  const glow = GLOW[color] || "rgba(80,210,235,0.4)";
  const textClass = TEXT_ON_NAVY[color] || "text-white";
  return (
    <div className="cambra-card cambra-card--soft cambra-card--compact group p-4 flex flex-col">
      <div className="pointer-events-none absolute -top-14 -right-14 w-36 h-36 rounded-full blur-3xl opacity-60 group-hover:opacity-100 transition-opacity"
           style={{ background: `radial-gradient(closest-side, ${glow}, transparent)`, zIndex: 0 }} />
      <div className="relative">
        <Icon size={13} className={`mb-2 ${textClass}`} />
        <p className="text-[10px] uppercase tracking-[0.12em] text-white/55 mb-1 font-semibold">{label}</p>
        <p className={`text-lg sm:text-xl font-black tabular-nums tracking-tight ${textClass}`}>
          €{(value || 0).toLocaleString()}
        </p>
        {note && <p className="text-[10px] text-white/45 mt-0.5 hidden sm:block">{note}</p>}
      </div>
    </div>
  );
}