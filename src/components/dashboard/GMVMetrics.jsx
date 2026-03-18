export default function GMVMetrics({ gmvTotal, gmvAverage }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="p-4 rounded-2xl border border-purple-500/15 bg-purple-500/[0.05] flex flex-col">
        <p className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground/50 mb-1">Total GMV</p>
        <p className="text-lg sm:text-xl font-black tabular-nums text-purple-600">
          €{(gmvTotal || 0).toLocaleString()}
        </p>
        <p className="text-[10px] text-muted-foreground/35 mt-0.5 hidden sm:block">annual turnover</p>
      </div>
      <div className="p-4 rounded-2xl border border-indigo-500/15 bg-indigo-500/[0.05] flex flex-col">
        <p className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground/50 mb-1">Avg GMV/Brand</p>
        <p className="text-lg sm:text-xl font-black tabular-nums text-indigo-600">
          €{(gmvAverage || 0).toLocaleString()}
        </p>
        <p className="text-[10px] text-muted-foreground/35 mt-0.5 hidden sm:block">network average</p>
      </div>
    </div>
  );
}