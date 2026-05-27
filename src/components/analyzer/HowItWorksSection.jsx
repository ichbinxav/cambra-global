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
              className="group relative overflow-hidden rounded-[1.4rem] border border-white/8 bg-gradient-to-br from-[#0f1829] to-[#0a0f1a] p-5 transition duration-200 hover:-translate-y-0.5 hover:border-white/15 hover:shadow-[0_14px_36px_rgba(44,167,193,0.15)]"
            >
              {/* Ambient layers */}
              <div className="pointer-events-none absolute inset-0">
                <div className="absolute -top-20 -left-12 w-[16rem] h-[16rem] rounded-full blur-3xl" style={{ background: "radial-gradient(closest-side, rgba(31,78,216,0.25), transparent 70%)" }} />
                <div className="absolute -bottom-16 -right-10 w-[14rem] h-[14rem] rounded-full blur-3xl" style={{ background: "radial-gradient(closest-side, rgba(44,167,193,0.18), transparent 70%)" }} />
                <div className="absolute inset-0 opacity-[0.04]" style={{ backgroundImage: "linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)", backgroundSize: "32px 32px" }} />
              </div>

              <div className="relative flex items-start justify-between gap-3">
                <div className="font-display font-black leading-[0.85] tracking-[-0.06em] select-none text-[3.5rem]"
                  style={{
                    background: "linear-gradient(180deg, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0.3) 65%, rgba(255,255,255,0) 100%)",
                    WebkitBackgroundClip: "text",
                    backgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                  }}>
                  {step.number}
                </div>
                <div className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.06] text-white/85 backdrop-blur-sm transition group-hover:bg-white/[0.14] group-hover:border-white/20">
                  <ArrowUpRight className="h-4 w-4" />
                </div>
              </div>

              <div className="relative mt-4">
                <p className="font-display text-lg font-black tracking-[-0.03em] text-white">
                  {step.title}
                </p>
                <p className="mt-2 text-sm leading-5 text-white/60">
                  {step.detail}
                </p>
              </div>

              <div className="relative mt-5 h-1 overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full bg-saas-gradient" style={{ width: "68%" }} />
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}