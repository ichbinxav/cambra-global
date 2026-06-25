import { Activity } from "lucide-react";
import { motion } from "framer-motion";

/**
 * Premium navy hero header for inner pages.
 * Matches landing aesthetic — navy gradient, ambient glow, grid texture.
 *
 * Props:
 *  - eyebrow:  text inside the live pill
 *  - title:    main title
 *  - subtitle: muted line beneath title
 *  - actions:  optional ReactNode on the right side
 *  - icon:     optional lucide icon for eyebrow
 *  - tone:     "light" for white background, "dark" (default) for navy
 */
export default function PageHero({
  eyebrow,
  title,
  subtitle,
  actions,
  icon: Icon = Activity,
  tone = "dark",
  children,
}) {
  if (tone === "light") {
    return (
      <div className="relative rounded-2xl border border-border/60 bg-white p-6 sm:p-8 mb-6 overflow-hidden">
        <div className="absolute inset-0 dot-grid opacity-30 pointer-events-none" />
        <div className="relative">
          <HeaderInner eyebrow={eyebrow} title={title} subtitle={subtitle} actions={actions} Icon={Icon} dark={false} />
          {children}
        </div>
      </div>
    );
  }

  // Premium navy hero — default
  return (
    <motion.div
      // Start visible — animation is an enhancement, never a gate. If framer-motion
      // fails to mount on Safari, the hero is still on screen.
      initial={{ opacity: 1, y: 0 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className="relative rounded-2xl border border-white/[0.08] p-6 sm:p-9 mb-6 overflow-hidden"
      style={{
        background:
          "radial-gradient(120% 80% at 0% 0%, rgba(31,78,216,0.22) 0%, transparent 55%), radial-gradient(100% 100% at 100% 100%, rgba(44,167,193,0.16) 0%, transparent 60%), linear-gradient(180deg, hsl(222 60% 7%) 0%, hsl(222 65% 4%) 100%)",
        boxShadow: "0 1px 0 hsl(0 0% 100% / 0.06) inset, 0 30px 80px -28px rgba(0,0,0,0.55)",
      }}
    >
      {/* Grid texture */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.45]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.035) 1px, transparent 1px)",
          backgroundSize: "44px 44px",
          maskImage: "radial-gradient(ellipse 90% 90% at 50% 0%, #000 30%, transparent 75%)",
          WebkitMaskImage: "radial-gradient(ellipse 90% 90% at 50% 0%, #000 30%, transparent 75%)",
        }}
      />

      {/* Floating cyan glow */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute -top-24 -right-16 w-72 h-72 rounded-full blur-[80px]"
        style={{ background: "radial-gradient(closest-side, rgba(44,167,193,0.32), transparent)" }}
        animate={{ opacity: [0.4, 0.7, 0.4], scale: [1, 1.08, 1] }}
        transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
      />

      <div className="relative">
        <HeaderInner eyebrow={eyebrow} title={title} subtitle={subtitle} actions={actions} Icon={Icon} dark={true} />
        {children}
      </div>
    </motion.div>
  );
}

function HeaderInner({ eyebrow, title, subtitle, actions, Icon, dark }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-5">
      <div className="min-w-0">
        {eyebrow && (
          <div
            className={`inline-flex items-center gap-2 mb-5 px-2.5 py-1.5 rounded-full ${
              dark
                ? "border border-white/[0.10] bg-white/[0.04] backdrop-blur-sm"
                : "border border-border/60 bg-white"
            }`}
          >
            <span className="relative flex h-1.5 w-1.5">
              <span
                className={`absolute inline-flex h-full w-full rounded-full opacity-75 ${dark ? "bg-cambra-cyan" : "bg-foreground opacity-30"}`}
                style={{ animation: "ping-soft 1.8s cubic-bezier(0,0,0.2,1) infinite" }}
              />
              <span className={`relative inline-flex h-1.5 w-1.5 rounded-full ${dark ? "bg-cambra-cyan" : "bg-foreground"}`} />
            </span>
            <Icon size={10} className={dark ? "text-white/60" : "text-muted-foreground"} />
            <span
              className={`text-[10px] font-bold tracking-[0.22em] uppercase ${
                dark ? "text-white/70" : "text-muted-foreground"
              }`}
            >
              {eyebrow}
            </span>
          </div>
        )}
        <h1
          className={`font-display text-[clamp(2rem,5vw,3.6rem)] font-black tracking-[-0.045em] leading-[0.92] ${
            dark ? "" : "text-foreground"
          }`}
          style={
            dark
              ? {
                  background:
                    "linear-gradient(135deg, #ffffff 0%, #E8F4F6 55%, #B8D8E0 100%)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                }
              : {}
          }
        >
          {title}
        </h1>
        {subtitle && (
          <p className={`text-sm mt-3 max-w-xl leading-relaxed ${dark ? "text-white/60" : "text-muted-foreground"}`}>
            {subtitle}
          </p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2 flex-shrink-0">{actions}</div>}
    </div>
  );
}