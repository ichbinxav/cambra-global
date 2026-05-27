import { cn } from "@/lib/utils";

/**
 * SectionShell — the ONE container for inner-page sections (Dashboard, Reports,
 * Admin, Analyzer, Onboarding, Account, Help, Pricing, etc).
 *
 * DO NOT create custom <section> wrappers per page anymore.
 *
 * Variants:
 *  - default  → max-w-7xl + horizontal padding + vertical rhythm
 *  - tight    → max-w-5xl for forms / editorial content
 *  - wide     → max-w-[1400px] for admin & analytics dashboards
 *
 * Props:
 *  - eyebrow:   small uppercase label (optional)
 *  - title:     section title (optional)
 *  - subtitle:  supporting muted line (optional)
 *  - actions:   right-aligned action node (optional)
 *  - divider:   render a top border (visual separation between sections)
 */
export default function SectionShell({
  variant = "default",
  eyebrow,
  title,
  subtitle,
  actions,
  divider = false,
  className = "",
  children,
}) {
  const maxWidth =
    variant === "tight" ? "max-w-5xl" :
    variant === "wide" ? "max-w-[1400px]" :
    "max-w-7xl";

  return (
    <section className={cn("relative", divider && "border-t border-border/50", className)}>
      <div className={cn(maxWidth, "mx-auto px-5 sm:px-6 lg:px-8 py-8 sm:py-10")}>
        {(eyebrow || title || subtitle || actions) && (
          <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-6">
            <div className="min-w-0">
              {eyebrow && (
                <div className="text-[10px] font-bold tracking-[0.22em] uppercase text-muted-foreground mb-2">
                  {eyebrow}
                </div>
              )}
              {title && (
                <h2 className="font-display text-2xl sm:text-3xl font-black tracking-[-0.03em] text-foreground">
                  {title}
                </h2>
              )}
              {subtitle && (
                <p className="text-sm text-muted-foreground mt-1.5 max-w-2xl">{subtitle}</p>
              )}
            </div>
            {actions && <div className="flex items-center gap-2 flex-shrink-0">{actions}</div>}
          </header>
        )}
        {children}
      </div>
    </section>
  );
}