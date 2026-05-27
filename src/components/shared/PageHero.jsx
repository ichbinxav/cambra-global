import { Activity } from "lucide-react";

/**
 * Premium dark hero header (landing-grade wow) for inner pages.
 * Use at the top of any page in dashboard / admin layouts.
 *
 * Props:
 *  - eyebrow: text inside the live pill (e.g. "Analytics · Live")
 *  - title:   main title (string) — large editorial type
 *  - gradient: text gradient mode: "blue" | "cyan" | "white"
 *  - subtitle: muted line beneath title
 *  - actions: optional ReactNode on the right side
 *  - icon:   optional lucide icon for eyebrow (defaults to Activity)
 *  - tone:   "dark" (default, black hero) | "soft" (lighter card)
 */
const GRADIENT = {
  blue: "linear-gradient(135deg, #ffffff 0%, #B8D8E0 45%, #2CA7C1 100%)",
  cyan: "linear-gradient(135deg, #ffffff 0%, #6FE3FF 50%, #1F4ED8 100%)",
  white: "linear-gradient(135deg, #ffffff 0%, #C7CFFF 100%)",
};

export default function PageHero({
  eyebrow,
  title,
  subtitle,
  actions,
  icon: Icon = Activity,
  gradient = "blue",
  tone = "dark",
  children,
}) {
  if (tone === "soft") {
    return (
      <div className="relative overflow-hidden rounded-2xl border border-border/60 bg-card/95 backdrop-blur-sm p-6 sm:p-8 mb-6 shadow-[0_18px_48px_-24px_rgba(0,0,0,0.18)]">
        <div className="pointer-events-none absolute -top-32 -right-24 w-[28rem] h-[28rem] rounded-full blur-3xl opacity-50"
             style={{ background: "radial-gradient(closest-side, rgba(31,78,216,0.18), transparent)" }} />
        <div className="relative">
          <HeaderInner eyebrow={eyebrow} title={title} subtitle={subtitle} actions={actions} Icon={Icon} gradient={gradient} dark={false} />
          {children}
        </div>
      </div>
    );
  }

  // DARK HERO — like landing
  return (
    <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-[#06080F] text-white mb-6 shadow-[0_24px_80px_-24px_rgba(0,0,0,0.6)]">
      {/* Ambient layers */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-40 -left-32 w-[34rem] h-[34rem] rounded-full blur-3xl"
             style={{ background: "radial-gradient(closest-side, rgba(31,78,216,0.55), transparent 60%)" }} />
        <div className="absolute -bottom-32 -right-20 w-[32rem] h-[32rem] rounded-full blur-3xl"
             style={{ background: "radial-gradient(closest-side, rgba(44,167,193,0.45), transparent 60%)" }} />
        <div className="absolute inset-0 opacity-[0.08]"
             style={{ backgroundImage: "linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)", backgroundSize: "44px 44px" }} />
        <div className="absolute inset-x-0 top-0 h-px" style={{ background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.18), transparent)" }} />
      </div>

      <div className="relative p-7 sm:p-10">
        <HeaderInner eyebrow={eyebrow} title={title} subtitle={subtitle} actions={actions} Icon={Icon} gradient={gradient} dark />
        {children}
      </div>
    </div>
  );
}

function HeaderInner({ eyebrow, title, subtitle, actions, Icon, gradient, dark }) {
  const grad = GRADIENT[gradient] || GRADIENT.blue;
  return (
    <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-5">
      <div className="min-w-0">
        {eyebrow && (
          <div className={`inline-flex items-center gap-2 mb-4 px-2.5 py-1.5 rounded-full ${dark ? "border border-white/15 bg-white/[0.04] backdrop-blur-sm" : "border border-border/60 bg-background/70 backdrop-blur-sm"}`}>
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full rounded-full bg-cambra-mint opacity-75" style={{ animation: "ping-soft 1.8s cubic-bezier(0,0,0.2,1) infinite" }} />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-cambra-mint" />
            </span>
            <Icon size={10} className={dark ? "opacity-70" : "text-muted-foreground"} />
            <span className={`text-[10px] font-bold tracking-[0.22em] uppercase ${dark ? "text-white/70" : "text-muted-foreground"}`}>{eyebrow}</span>
          </div>
        )}
        <h1 className="font-display text-[clamp(2rem,5vw,3.6rem)] font-black tracking-[-0.045em] leading-[0.92]">
          <span style={{ background: grad, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text", filter: "drop-shadow(0 0 22px rgba(44,167,193,0.35))" }}>
            {title}
          </span>
        </h1>
        {subtitle && <p className={`text-sm mt-3 max-w-xl ${dark ? "text-white/55" : "text-foreground/65"}`}>{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 flex-shrink-0">{actions}</div>}
    </div>
  );
}