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
    <aside className="sticky top-24 rounded-[1.75rem] border border-border/60 bg-card/95 backdrop-blur-md p-6 shadow-[0_18px_50px_rgba(0,0,0,0.06)] overflow-hidden">
      <div className="pointer-events-none absolute -top-24 -right-24 w-56 h-56 rounded-full blur-3xl bg-ambient-mint opacity-[0.18]" />

      <div className="relative">
        <div className="inline-flex items-center gap-2 px-2 py-1 rounded-full border border-border/50 bg-background/70 backdrop-blur-sm">
          <span className="h-1 w-1 rounded-full bg-cambra-mint" />
          <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">CAMBRA Copilot</p>
        </div>
        <h3 className="mt-4 font-display text-2xl font-black tracking-[-0.03em] text-foreground">Not sure where to start?</h3>
        <p className="mt-4 text-sm leading-6 text-foreground/65">
          Start with Payments if you process high GMV. Start with Shipping if fulfillment is your biggest cost.
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