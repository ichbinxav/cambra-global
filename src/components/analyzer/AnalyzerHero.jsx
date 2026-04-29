import { ArrowRight, Upload } from "lucide-react";

export default function AnalyzerHero({ onStartFullAudit, onUploadDocuments }) {
  return (
    <section className="rounded-[2rem] border border-border/60 bg-card shadow-[0_20px_60px_rgba(0,0,0,0.06)]">
      <div className="p-8 md:p-12">
        <p className="mb-4 text-[11px] font-semibold uppercase tracking-[0.28em] text-muted-foreground">
          Analyzer Hub
        </p>
        <h1 className="max-w-3xl text-4xl font-black tracking-[-0.04em] text-foreground md:text-6xl">
          Audit your operating costs. Find hidden margin.
        </h1>
        <p className="mt-5 max-w-2xl text-base leading-7 text-muted-foreground md:text-lg">
          Analyze payments, shipping, SaaS and provider costs to see where your brand may be overpaying.
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <button
            onClick={onStartFullAudit}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-foreground px-6 text-sm font-semibold text-background transition hover:opacity-90"
          >
            Start full cost audit
            <ArrowRight className="h-4 w-4" />
          </button>
          <button
            onClick={onUploadDocuments}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-full border border-border bg-background px-6 text-sm font-semibold text-foreground transition hover:bg-secondary"
          >
            <Upload className="h-4 w-4" />
            Upload documents
          </button>
        </div>
      </div>
    </section>
  );
}