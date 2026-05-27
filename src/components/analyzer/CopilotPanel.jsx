const PROMPTS = [
  "Find my biggest overpay",
  "Analyze my payment fees",
  "Review my shipping costs",
  "Analyze my card terminals",
  "Explain an invoice",
  "Compare providers",
];

export default function CopilotPanel({ onSelectPrompt }) {
  return (
    <aside className="sticky top-24 rounded-[1.75rem] border border-border/60 bg-gradient-to-br from-slate-50 via-blue-50/40 to-white backdrop-blur-md p-6 shadow-[0_18px_50px_rgba(0,0,0,0.06)] overflow-hidden">
      <div className="pointer-events-none absolute -top-24 -right-24 w-56 h-56 rounded-full blur-3xl bg-ambient-mint opacity-[0.18]" />

      <div className="relative">
        <div className="inline-flex items-center gap-2 px-2 py-1 rounded-full border border-border/60 bg-background/70 backdrop-blur-sm">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full rounded-full bg-foreground opacity-30" style={{ animation: "ping-soft 1.8s cubic-bezier(0,0,0.2,1) infinite" }} />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-foreground" />
          </span>
          <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">Analyzer Hub · 8 Cost Layers</p>
        </div>
        <h3 className="mt-4 font-display text-2xl font-black tracking-[-0.03em] text-foreground">Where should you start?</h3>
        <p className="mt-4 text-sm leading-6 text-foreground/65">
          High GMV brands typically start with <span className="font-semibold text-foreground">Payments</span>. Logistics-heavy operators start with <span className="font-semibold text-foreground">Shipping</span>.
        </p>
        <div className="mt-6 space-y-2.5">
          {PROMPTS.map((prompt) => (
            <button
              key={prompt}
              onClick={() => onSelectPrompt(prompt)}
              className="w-full rounded-2xl border border-border/60 bg-background/60 backdrop-blur-sm px-4 py-3 text-left text-sm font-medium text-foreground transition hover:bg-secondary hover:border-foreground/30"
            >
              {prompt}
            </button>
          ))}
        </div>
      </div>
    </aside>
  );
}