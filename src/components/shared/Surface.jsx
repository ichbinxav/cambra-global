import { cn } from "@/lib/utils";

/**
 * Surface — the ONE light/utility card.
 *
 * Use this for SECONDARY containers (forms, settings, FAQ, legal, lists,
 * filters, tables, sidebar panels). For PRIMARY intelligence modules,
 * use NavyCard instead.
 *
 * Variants:
 *  - default → white card, subtle border, soft shadow
 *  - outline → border only, no shadow (compact lists, table rows)
 *  - muted   → bg-muted/40, no border (subtle inline blocks)
 *
 * Density:
 *  - cozy (default) → p-6
 *  - compact        → p-4
 *  - spacious       → p-8
 */
export default function Surface({
  as: Tag = "div",
  variant = "default",
  density = "cozy",
  interactive = false,
  className = "",
  children,
  ...rest
}) {
  const base = "rounded-2xl transition-all";
  const padding =
    density === "compact" ? "p-4" :
    density === "spacious" ? "p-8" :
    "p-6";

  const variantClass =
    variant === "outline" ? "border border-border/60 bg-card" :
    variant === "muted"   ? "bg-muted/40" :
    "border border-border/60 bg-card shadow-[0_1px_2px_rgba(0,0,0,0.02),0_8px_24px_-12px_rgba(0,0,0,0.08)]";

  const interactiveClass = interactive
    ? "hover:border-foreground/20 hover:shadow-[0_2px_4px_rgba(0,0,0,0.03),0_16px_40px_-16px_rgba(0,0,0,0.12)] hover:-translate-y-0.5 cursor-pointer"
    : "";

  return (
    <Tag className={cn(base, padding, variantClass, interactiveClass, className)} {...rest}>
      {children}
    </Tag>
  );
}