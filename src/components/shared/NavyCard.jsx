import { cn } from "@/lib/utils";

/**
 * NavyCard — CAMBRA's core identity card.
 *
 * Use for ALL primary modules: KPIs, analyzer cards, benchmark modules,
 * scoring, insights, upload modules, savings, admin intelligence panels,
 * onboarding intelligence sections, reports, pricing, directory, AI blocks.
 *
 * Variants:
 *  - default  → full navy gradient + ambient glow + grid (hero-grade)
 *  - soft     → reduced glow, ideal for nested / secondary modules
 *  - compact  → tighter radius for dense KPI strips
 *
 * Props:
 *  - as?: HTML tag (default "div")
 *  - variant?: "default" | "soft"
 *  - compact?: boolean
 *  - interactive?: boolean → adds hover lift
 *  - eyebrow?: ReactNode → small uppercase label rendered top-left
 *  - title?: ReactNode → optional title inside the card
 *  - className?: string
 */
export default function NavyCard({
  as: Tag = "div",
  variant = "default",
  compact = false,
  interactive = false,
  eyebrow,
  title,
  className = "",
  children,
  ...rest
}) {
  return (
    <Tag
      className={cn(
        "cambra-card",
        variant === "soft" && "cambra-card--soft",
        compact && "cambra-card--compact",
        interactive && "cursor-pointer",
        className
      )}
      {...rest}
    >
      {(eyebrow || title) && (
        <div className="px-6 pt-6">
          {eyebrow && (
            <div className="cc-eyebrow mb-3">{eyebrow}</div>
          )}
          {title && (
            <h3 className="cc-title font-display text-xl font-black tracking-tight">
              {title}
            </h3>
          )}
        </div>
      )}
      {children}
    </Tag>
  );
}