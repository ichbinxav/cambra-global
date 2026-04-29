const STEPS = [
  "Share your current costs",
  "CAMBRA benchmarks your rates",
  "See savings opportunities",
  "Activate better conditions",
];

export default function HowItWorksSection() {
  return (
    <section className="rounded-[1.75rem] border border-border/60 bg-card p-7 shadow-[0_14px_40px_rgba(0,0,0,0.05)] md:p-9">
      <div className="max-w-2xl">
        <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">How it works</p>
        <h2 className="mt-4 text-3xl font-black tracking-[-0.03em] text-foreground">A structured commerce cost audit.</h2>
      </div>
      <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {STEPS.map((step, index) => (
          <div key={step} className="rounded-[1.25rem] border border-border/60 bg-background p-5">
            <div className="text-sm font-semibold text-muted-foreground">0{index + 1}</div>
            <p className="mt-8 text-base font-semibold leading-6 text-foreground">{step}</p>
          </div>
        ))}
      </div>
    </section>
  );
}