import { ArrowRight } from "lucide-react";

export default function AuditModuleCard({ eyebrow, title, description, cta, onClick, icon: Icon }) {
  return (
    <article 
      className="group relative overflow-hidden rounded-[1.6rem] border border-white/8 bg-gradient-to-br from-[#0f1829] to-[#0a0f1a] backdrop-blur-xl p-7 cursor-pointer transition duration-200 hover:-translate-y-1 hover:border-white/12 hover:shadow-[0_16px_48px_rgba(44,167,193,0.15)]"
      onClick={onClick}
    >
      {/* Ambient gradient layers */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-32 -left-20 w-[24rem] h-[24rem] rounded-full blur-3xl" style={{ background: "radial-gradient(closest-side, rgba(31,78,216,0.25), transparent 70%)" }} />
        <div className="absolute -bottom-20 -right-16 w-[20rem] h-[20rem] rounded-full blur-3xl" style={{ background: "radial-gradient(closest-side, rgba(44,167,193,0.18), transparent 70%)" }} />
        <div className="absolute inset-0 opacity-[0.04]" style={{ backgroundImage: "linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)", backgroundSize: "44px 44px" }} />
      </div>

      <div className="relative">
        <div className="flex items-start justify-between gap-3 mb-5">
          <div className="inline-flex items-center gap-2 px-2.5 py-1.5 rounded-full border border-white/12 bg-white/[0.06] backdrop-blur-sm">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full rounded-full bg-[#2CA7C1] opacity-50" style={{ animation: "ping-soft 1.8s cubic-bezier(0,0,0.2,1) infinite" }} />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[#2CA7C1]" />
            </span>
            <span className="text-[10px] font-bold tracking-[0.2em] uppercase text-white/70">{eyebrow}</span>
          </div>
          {Icon && (
            <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0 border border-white/10 bg-white/[0.06] backdrop-blur-sm group-hover:border-white/20 group-hover:bg-white/[0.12] transition-all">
              <Icon className="h-5 w-5 text-white/85" strokeWidth={1.5} />
            </div>
          )}
        </div>

        <h2 className="font-display text-2xl font-black tracking-[-0.03em] text-white leading-tight">{title}</h2>
        <p className="mt-3 text-sm leading-6 text-white/60">{description}</p>

        <button
          onClick={onClick}
          className="mt-7 inline-flex items-center gap-2 text-sm font-semibold text-white transition group-hover:gap-3"
        >
          {cta}
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </article>
  );
}