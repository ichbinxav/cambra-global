import { Activity } from "lucide-react";

/**
 * Uniform light hero header for inner pages.
 * White background, black text, minimal accents.
 *
 * Props:
 *  - eyebrow:  text inside the live pill
 *  - title:    main title
 *  - subtitle: muted line beneath title
 *  - actions:  optional ReactNode on the right side
 *  - icon:     optional lucide icon for eyebrow
 *  - tone:     accepted but always renders light (legacy compatibility)
 */
export default function PageHero({
  eyebrow,
  title,
  subtitle,
  actions,
  icon: Icon = Activity,
  children,
}) {
  return (
    <div className="relative rounded-2xl border border-border/60 bg-white p-6 sm:p-8 mb-6">
      <HeaderInner eyebrow={eyebrow} title={title} subtitle={subtitle} actions={actions} Icon={Icon} />
      {children}
    </div>
  );
}

function HeaderInner({ eyebrow, title, subtitle, actions, Icon }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-5">
      <div className="min-w-0">
        {eyebrow && (
          <div className="inline-flex items-center gap-2 mb-4 px-2.5 py-1.5 rounded-full border border-border/60 bg-white">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full rounded-full bg-foreground opacity-30" style={{ animation: "ping-soft 1.8s cubic-bezier(0,0,0.2,1) infinite" }} />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-foreground" />
            </span>
            <Icon size={10} className="text-muted-foreground" />
            <span className="text-[10px] font-bold tracking-[0.22em] uppercase text-muted-foreground">{eyebrow}</span>
          </div>
        )}
        <h1 className="font-display text-[clamp(2rem,5vw,3.6rem)] font-black tracking-[-0.045em] leading-[0.92] text-foreground">
          {title}
        </h1>
        {subtitle && <p className="text-sm mt-3 max-w-xl text-muted-foreground">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 flex-shrink-0">{actions}</div>}
    </div>
  );
}