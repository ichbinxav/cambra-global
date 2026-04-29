import { ArrowRight } from "lucide-react";

export default function AuditModuleCard({ eyebrow, title, description, cta, onClick }) {
  return (
    <article className="group rounded-[1.75rem] border border-border/60 bg-card p-7 shadow-[0_14px_40px_rgba(0,0,0,0.05)] transition hover:-translate-y-0.5 hover:shadow-[0_18px_50px_rgba(0,0,0,0.08)]">
      <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">{eyebrow}</p>
      <h2 className="mt-4 text-2xl font-black tracking-[-0.03em] text-foreground">{title}</h2>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">{description}</p>
      <button
        onClick={onClick}
        className="mt-8 inline-flex items-center gap-2 text-sm font-semibold text-foreground transition group-hover:gap-3"
      >
        {cta}
        <ArrowRight className="h-4 w-4" />
      </button>
    </article>
  );
}