import { ArrowUpRight, Sparkles } from "lucide-react";

const STEPS = [
  {
    number: "01",
    title: "Share your costs",
    detail: "Upload invoices or a few core metrics.",
    accent: "from-blue-500/15 to-cyan-500/10",
    badge: "bg-blue-500/10 text-blue-600",
    bar: "bg-blue-600",
  },
  {
    number: "02",
    title: "Benchmark your rates",
    detail: "CAMBRA compares them with network terms.",
    accent: "from-violet-500/15 to-fuchsia-500/10",
    badge: "bg-violet-500/10 text-violet-600",
    bar: "bg-violet-600",
  },
  {
    number: "03",
    title: "See the savings",
    detail: "Spot the biggest margin leaks fast.",
    accent: "from-emerald-500/15 to-teal-500/10",
    badge: "bg-emerald-500/10 text-emerald-600",
    bar: "bg-emerald-600",
  },
  {
    number: "04",
    title: "Activate better terms",
    detail: "Move into stronger commercial conditions.",
    accent: "from-amber-500/15 to-orange-500/10",
    badge: "bg-amber-500/10 text-amber-600",
    bar: "bg-amber-500",
  },
];

export default function HowItWorksSection() {
  return (
    <section className="relative overflow-hidden rounded-[2rem] border border-border/60 bg-card p-6 shadow-[0_18px_60px_rgba(0,0,0,0.06)] md:p-8">
      <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-r from-slate-100/80 via-white to-slate-100/70" />

      <div className="relative">
        <div className="max-w-xl">
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-background/90 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground backdrop-blur">
            <Sparkles className="h-3.5 w-3.5" />
            How it works
          </div>
          <h2 className="mt-4 max-w-2xl text-2xl font-black tracking-[-0.04em] text-foreground md:text-4xl">
            A structured commerce cost audit.
          </h2>
          <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">
            A faster path from raw cost data to benchmarked savings opportunities.
          </p>
        </div>

        <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {STEPS.map((step) => (
            <article
              key={step.number}
              className="group relative overflow-hidden rounded-[1.4rem] border border-border/70 bg-background/95 p-4 shadow-[0_8px_24px_rgba(0,0,0,0.04)] transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_14px_30px_rgba(0,0,0,0.07)]"
            >
              <div className={`absolute inset-x-0 top-0 h-16 bg-gradient-to-r ${step.accent}`} />
              <div className="relative flex items-start justify-between gap-3">
                <div className={`flex h-10 w-10 items-center justify-center rounded-2xl text-sm font-black tracking-[0.16em] ${step.badge}`}>
                  {step.number}
                </div>
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-secondary text-foreground transition group-hover:bg-foreground group-hover:text-background">
                  <ArrowUpRight className="h-4 w-4" />
                </div>
              </div>

              <div className="relative mt-5">
                <p className="text-lg font-black tracking-[-0.03em] text-foreground">
                  {step.title}
                </p>
                <p className="mt-2 text-sm leading-5 text-muted-foreground">
                  {step.detail}
                </p>
              </div>

              <div className="relative mt-5 h-1.5 overflow-hidden rounded-full bg-secondary">
                <div className={`h-full rounded-full ${step.bar}`} style={{ width: "68%" }} />
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}