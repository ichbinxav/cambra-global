import { ArrowUpRight, Sparkles } from "lucide-react";

const STEPS = [
  {
    number: "01",
    title: "Share your current costs",
    detail: "Upload invoices, statements or key operating numbers so the audit starts with real data.",
  },
  {
    number: "02",
    title: "CAMBRA benchmarks your rates",
    detail: "We compare your current stack against network benchmarks across commerce infrastructure.",
  },
  {
    number: "03",
    title: "See savings opportunities",
    detail: "Find where fees, contracts and duplicated tools are quietly compressing your margin.",
  },
  {
    number: "04",
    title: "Activate better conditions",
    detail: "Move from diagnosis to action with stronger terms, better providers and lower cost structure.",
  },
];

export default function HowItWorksSection() {
  return (
    <section className="relative overflow-hidden rounded-[2rem] border border-border/60 bg-card p-7 shadow-[0_18px_60px_rgba(0,0,0,0.06)] md:p-10">
      <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-r from-slate-100/80 via-white to-slate-100/70" />
      <div className="absolute -right-10 top-8 h-40 w-40 rounded-full bg-slate-200/40 blur-3xl" />
      <div className="absolute -left-10 bottom-0 h-40 w-40 rounded-full bg-slate-100 blur-3xl" />

      <div className="relative">
        <div className="max-w-2xl">
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-background/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground backdrop-blur">
            <Sparkles className="h-3.5 w-3.5" />
            How it works
          </div>
          <h2 className="mt-5 max-w-3xl text-3xl font-black tracking-[-0.04em] text-foreground md:text-5xl">
            A structured commerce cost audit.
          </h2>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-muted-foreground md:text-base">
            A clearer path from raw operating data to margin opportunities, benchmark context and better commercial conditions.
          </p>
        </div>

        <div className="mt-8 grid gap-4 md:mt-10 md:grid-cols-2">
          {STEPS.map((step, index) => (
            <article
              key={step.number}
              className="group relative overflow-hidden rounded-[1.6rem] border border-border/70 bg-background/95 p-6 shadow-[0_10px_30px_rgba(0,0,0,0.04)] transition duration-200 hover:border-foreground/20 hover:shadow-[0_18px_40px_rgba(0,0,0,0.08)]"
            >
              <div className="absolute right-0 top-0 h-24 w-24 bg-gradient-to-bl from-slate-100 to-transparent opacity-90" />
              <div className="relative flex items-start justify-between gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-border bg-card text-sm font-black tracking-[0.18em] text-muted-foreground">
                  {step.number}
                </div>
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-secondary text-foreground transition group-hover:bg-foreground group-hover:text-background">
                  <ArrowUpRight className="h-4 w-4" />
                </div>
              </div>

              <div className="relative mt-8">
                <p className="text-xl font-black tracking-[-0.03em] text-foreground md:text-2xl">
                  {step.title}
                </p>
                <p className="mt-3 max-w-md text-sm leading-6 text-muted-foreground">
                  {step.detail}
                </p>
              </div>

              <div className="relative mt-8 h-1.5 overflow-hidden rounded-full bg-secondary">
                <div
                  className="h-full rounded-full bg-foreground"
                  style={{ width: `${55 + index * 12}%` }}
                />
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}