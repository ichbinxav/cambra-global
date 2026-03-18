export default function MetricCard({ label, value, icon: Icon, color, border, bg, note }) {
  return (
    <div className={`p-4 rounded-2xl border ${border} ${bg} flex flex-col`}>
      <Icon size={13} className={`mb-2 ${color}`} />
      <p className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground/50 mb-1">{label}</p>
      <p className={`text-lg sm:text-xl font-black tabular-nums ${color}`}>
        €{(value || 0).toLocaleString()}
      </p>
      {note && <p className="text-[10px] text-muted-foreground/35 mt-0.5 hidden sm:block">{note}</p>}
    </div>
  );
}