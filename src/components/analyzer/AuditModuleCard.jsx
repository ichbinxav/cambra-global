import { ArrowRight } from "lucide-react";

export default function AuditModuleCard({ eyebrow, title, description, cta, onClick, icon: Icon }) {
  return (
    <article className="cambra-card group p-7 cursor-pointer" onClick={onClick}>
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="cc-pill">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full rounded-full bg-[#2CA7C1] opacity-50" style={{ animation: "ping-soft 1.8s cubic-bezier(0,0,0.2,1) infinite" }} />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[#2CA7C1]" />
          </span>
          {eyebrow}
        </div>
        {Icon && (
          <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 border border-white/10 bg-white/[0.04] backdrop-blur-sm group-hover:border-white/20 group-hover:bg-white/[0.08] transition-all">
            <Icon className="h-5 w-5 text-white/85" strokeWidth={1.6} />
          </div>
        )}
      </div>
      <h2 className="font-display text-2xl font-black tracking-[-0.03em] text-white">{title}</h2>
      <p className="mt-3 text-sm leading-6 text-white/65">{description}</p>
      <button
        onClick={onClick}
        className="mt-8 inline-flex items-center gap-2 text-sm font-semibold text-white transition group-hover:gap-3"
      >
        {cta}
        <ArrowRight className="h-4 w-4" />
      </button>
    </article>
  );
}