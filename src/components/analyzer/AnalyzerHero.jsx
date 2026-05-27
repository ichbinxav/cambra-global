import { ArrowRight, Upload, Activity } from "lucide-react";

export default function AnalyzerHero({ onStartFullAudit, onUploadDocuments }) {
  return (
    <section className="relative overflow-hidden rounded-[2rem] border border-border/60 bg-card shadow-[0_24px_60px_rgba(0,0,0,0.08)]">
      {/* Ambient glows */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-32 -left-32 w-[34rem] h-[34rem] rounded-full blur-3xl bg-ambient-lilac opacity-[0.22]" />
        <div className="absolute -bottom-32 -right-32 w-[30rem] h-[30rem] rounded-full blur-3xl bg-ambient-mint opacity-[0.18]" />
        <div className="absolute inset-0 dot-grid opacity-50" />
      </div>

      <div className="relative p-8 md:p-12">
        <div className="inline-flex items-center gap-2 mb-6 px-2.5 py-1.5 rounded-full border border-border/60 bg-background/80 backdrop-blur-sm">
          <span className="relative flex h-1.5 w-1.5">
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-cambra-mint" />
          </span>
          <span className="text-[10px] font-semibold tracking-[0.2em] uppercase text-muted-foreground">
            Analyzer Hub
          </span>
        </div>

        <h1 className="font-display max-w-3xl text-[clamp(2rem,5vw,3.6rem)] font-black tracking-[-0.04em] leading-[0.95] text-foreground">
          Audit your operating costs. <span className="text-saas-gradient">Find hidden margin.</span>
        </h1>
        <p className="mt-5 max-w-2xl text-base leading-7 text-foreground/65">
          Analyze payments, shipping, SaaS and provider costs to see where your brand may be overpaying.
        </p>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <button
            onClick={onStartFullAudit}
            className="h-12 rounded-full px-7 text-sm font-bold bg-foreground text-background ring-1 ring-foreground/10 hover:bg-foreground/90 transition inline-flex items-center justify-center gap-2"
          >
            Start full cost audit
            <ArrowRight className="h-4 w-4" />
          </button>
          <button
            onClick={onUploadDocuments}
            className="h-12 rounded-full px-6 text-sm font-semibold border border-border/60 bg-background/60 backdrop-blur-sm text-foreground hover:border-foreground/40 hover:text-foreground transition inline-flex items-center justify-center gap-2"
          >
            <Upload className="h-4 w-4" />
            Upload documents
          </button>
        </div>

        <div className="mt-6 flex items-center gap-2 text-[10px] text-muted-foreground/70 font-mono">
          <Activity className="h-3 w-3 text-cambra-mint" />
          <span>Continuously benchmarked against brands your size · ~2 min audit</span>
        </div>
      </div>
    </section>
  );
}