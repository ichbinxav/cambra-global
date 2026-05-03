import { ShieldCheck, ArrowRight } from "lucide-react";

const BULLETS = [
  "Professional Liability Insurance / RC Pro",
  "Employee Health Insurance / Mutuelle",
  "Business Insurance / Multirisque Pro",
];

export default function InsuranceSection() {
  return (
    <section className="py-12 px-5 border-t border-border/40">
      <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-[1.1fr_0.9fr] gap-8 items-center">
        <div>
          <p className="text-[10px] tracking-[0.3em] uppercase text-muted-foreground/50 mb-4 flex items-center gap-2">
            <span className="w-4 h-px bg-border" /> Insurance
          </p>
          <h2 className="text-[clamp(2.2rem,5vw,4rem)] font-black tracking-[-0.04em] leading-[0.9] mb-4">
            Optimize your business insurance, without the headache.
          </h2>
          <p className="text-base text-muted-foreground leading-relaxed max-w-2xl mb-6">
            Benchmark and reduce essential insurance costs — from professional liability to employee health coverage — through Cambra’s collective infrastructure.
          </p>
          <div className="space-y-2 mb-7">
            {BULLETS.map((item) => (
              <div key={item} className="flex items-center gap-3 rounded-xl border border-border/50 bg-card/70 px-4 py-3">
                <ShieldCheck className="h-4 w-4 text-chart-1 shrink-0" />
                <p className="text-sm font-medium text-foreground/90">{item}</p>
              </div>
            ))}
          </div>
          <a href="/Analyzer?mode=questionnaire&module=insurance" className="inline-flex items-center gap-2 h-12 px-6 rounded-full bg-foreground text-background text-sm font-bold">
            Audit your insurance costs <ArrowRight className="h-4 w-4" />
          </a>
        </div>

        <div className="rounded-2xl border border-border/60 bg-card/90 backdrop-blur-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-border/40 flex items-center justify-between">
            <span className="text-[10px] tracking-[0.24em] uppercase text-muted-foreground/50">Insurance optimization</span>
            <span className="rounded-full border border-border/60 bg-secondary/70 px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/70">Estimated</span>
          </div>
          <div className="p-5 space-y-3">
            <div className="rounded-xl border border-border/50 p-4 bg-background">
              <p className="text-[11px] text-muted-foreground/60">Current estimated cost</p>
              <p className="text-2xl font-black text-foreground mt-1">€8.4K/yr</p>
            </div>
            <div className="rounded-xl border border-blue-500/20 p-4 bg-blue-500/[0.05]">
              <p className="text-[11px] text-muted-foreground/60">Cambra benchmark range</p>
              <p className="text-xl font-black text-chart-1 mt-1">€5.8K–€6.9K/yr</p>
            </div>
            <div className="rounded-xl bg-foreground text-background p-4 flex items-center justify-between gap-4">
              <div>
                <p className="text-[10px] uppercase tracking-[0.2em] opacity-40">Potential annual savings</p>
                <p className="text-3xl font-black">€1.9K<span className="text-base opacity-50 font-normal">/yr</span></p>
              </div>
              <div className="text-right">
                <p className="text-[10px] uppercase tracking-[0.15em] opacity-40">Coverage</p>
                <p className="text-sm font-semibold">Similar</p>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">You’re probably overpaying for insurance.</p>
          </div>
        </div>
      </div>
    </section>
  );
}