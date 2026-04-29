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
    <aside className="sticky top-24 rounded-[1.75rem] border border-border/60 bg-card p-6 shadow-[0_18px_50px_rgba(0,0,0,0.06)]">
      <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">CAMBRA Copilot</p>
      <h3 className="mt-4 text-2xl font-black tracking-[-0.03em] text-foreground">Not sure where to start?</h3>
      <p className="mt-4 text-sm leading-6 text-muted-foreground">
        Start with Payments if you process high GMV. Start with Shipping if fulfillment is your biggest cost.
      </p>
      <div className="mt-6 space-y-3">
        {PROMPTS.map((prompt) => (
          <button
            key={prompt}
            onClick={() => onSelectPrompt(prompt)}
            className="w-full rounded-2xl border border-border bg-background px-4 py-3 text-left text-sm font-medium text-foreground transition hover:bg-secondary"
          >
            {prompt}
          </button>
        ))}
      </div>
    </aside>
  );
}