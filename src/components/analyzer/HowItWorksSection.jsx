import { ArrowUpRight, Sparkles } from "lucide-react";

const STEPS = [
  {
    number: "01",
    title: "Share your costs",
    detail: "Upload invoices or a few core metrics.",
  },
  {
    number: "02",
    title: "Benchmark your rates",
    detail: "CAMBRA compares them with network terms.",
  },
  {
    number: "03",
    title: "See the savings",
    detail: "Spot the biggest margin leaks fast.",
  },
  {
    number: "04",
    title: "Activate better terms",
    detail: "Move into stronger commercial conditions.",
  },
];

export default function HowItWorksSection() {
  return (
    <section className="relative overflow-hidden rounded-[2rem] border border-border/60 bg-card/95 backdrop-blur-md p-6 md:p-8 shadow-[0_18px_60px_rgba(0,0,0,0.06)]">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-24 -left-24 w-[26rem] h-[26rem] rounded-full blur-3xl bg-ambient-lilac opacity-[0.18]" />
        <div className="absolute -bottom-24 -right-24 w-[24rem] h-[24rem] rounded-full blur-3xl bg-ambient-mint opacity-[0.15]" />
        <div className="absolute inset-0 dot-grid opacity-40" />
      </div>

      <div className="relative">
        <div className="max-w-xl">
          <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground backdrop-blur">
            <Sparkles className="h-3.5 w-3.5" />
            How it works
          </div>
          <h2 className="mt-4 max-w-2xl font-display text-2xl font-black tracking-[-0.04em] text-foreground md:text-4xl">
            A structured commerce <span className="text-saas-gradient">cost audit.</span>
          </h2>
          <p className="mt-3 max-w-xl text-sm leading-6 text-foreground/65">
            A faster path from raw cost data to benchmarked savings opportunities.
          </p>
        </div>

        <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {STEPS.map((step) => (
            <article
              key={step.number}
              className="group relative overflow-hidden rounded-[1.4rem] border border-border/70 bg-background/90 backdrop-blur-sm p-5 shadow-[0_8px_24px_rgba(0,0,0,0.04)] transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_14px_30px_rgba(0,0,0,0.08)] hover:border-foreground/30"
            >
              <div className="relative flex items-start justify-between gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl text-sm font-black tracking-[0.16em] bg-foreground text-background">
                  {step.number}
                </div>
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-secondary text-foreground transition group-hover:bg-foreground group-hover:text-background">
                  <ArrowUpRight className="h-4 w-4" />
                </div>
              </div>

              <div className="relative mt-5">
                <p className="font-display text-lg font-black tracking-[-0.03em] text-foreground">
                  {step.title}
                </p>
                <p className="mt-2 text-sm leading-5 text-foreground/65">
                  {step.detail}
                </p>
              </div>

              <div className="relative mt-5 h-1 overflow-hidden rounded-full bg-secondary">
                <div className="h-full rounded-full bg-saas-gradient" style={{ width: "68%" }} />
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}