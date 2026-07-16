/**
 * Dark gradient stats strip for ConnectTools page.
 * Shows big gradient numbers with labels.
 */
export default function ConnectStatsBar({ connectedCount, uploadedCount }) {
  const stats = [
    { value: "22+", label: "Supported tools" },
    { value: connectedCount || "0", label: "Connected" },
    { value: uploadedCount || "0", label: "Files uploaded" },
    { value: "99%", label: "Accuracy boost" },
  ];

  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-[#06080F]">
      {/* Ambient inner glow */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-20 left-1/4 w-64 h-64 rounded-full blur-3xl" style={{ background: "radial-gradient(closest-side, rgba(31,78,216,0.4), transparent 60%)" }} />
        <div className="absolute -bottom-16 right-1/4 w-56 h-56 rounded-full blur-3xl" style={{ background: "radial-gradient(closest-side, rgba(44,167,193,0.35), transparent 60%)" }} />
        <div className="absolute inset-0 opacity-[0.06]" style={{ backgroundImage: "linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)", backgroundSize: "36px 36px" }} />
      </div>

      <div className="relative grid grid-cols-2 sm:grid-cols-4 divide-x divide-white/[0.06]">
        {stats.map((s, i) => (
          <div key={i} className="px-5 py-5 text-center">
            <p className="font-display text-3xl sm:text-4xl font-black tracking-tight leading-none mb-1.5"
               style={{ background: "linear-gradient(135deg, #ffffff 0%, #B8D8E0 45%, #39C6F0 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text", filter: "drop-shadow(0 0 18px rgba(44,167,193,0.3))" }}>
              {s.value}
            </p>
            <p className="text-[10px] font-semibold tracking-[0.15em] uppercase text-white/35">{s.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}