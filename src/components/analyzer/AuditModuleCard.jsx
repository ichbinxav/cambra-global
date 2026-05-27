import { ArrowRight } from "lucide-react";

export default function AuditModuleCard({ eyebrow, title, description, cta, onClick }) {
  return (
    <article className="group relative overflow-hidden rounded-[1.75rem] border border-border/60 bg-card/95 backdrop-blur-sm p-7 shadow-[0_14px_40px_rgba(0,0,0,0.05)] transition hover:-translate-y-0.5 hover:shadow-[0_22px_60px_rgba(0,0,0,0.09)] hover:border-foreground/30">
      <div className="pointer-events-none absolute -top-24 -right-24 w-56 h-56 rounded-full blur-3xl bg-ambient-lilac opacity-0 group-hover:opacity-[0.18] transition-opacity" />

      <div className="relative">
        <div className="inline-flex items-center gap-2 px-2 py-1 rounded-full border border-border/50 bg-background/70 backdrop-blur-sm">
          <span className="h-1 w-1 rounded-full bg-cambra-mint" />
          <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">{eyebrow}</p>
        </div>
        <h2 className="mt-4 font-display text-2xl font-black tracking-[-0.03em] text-foreground">{title}</h2>
        <p className="mt-3 text-sm leading-6 text-foreground/65">{description}</p>
        <button
          onClick={onClick}
          className="mt-8 inline-flex items-center gap-2 text-sm font-semibold text-foreground transition group-hover:gap-3"
        >
          {cta}
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </article>
  );
}