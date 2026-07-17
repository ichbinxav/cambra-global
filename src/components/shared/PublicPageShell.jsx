import React from "react";
import Navbar from "@/components/landing/Navbar";
import PublicFooter from "@/components/shared/PublicFooter";

/**
 * PublicPageShell — the single, shared paper-first wrapper for every public
 * page (ForProviders, HowItWorks, Pricing, Testimonials, Contact, Help,
 * HelpCategory, Privacy, Terms, Cookies).
 *
 * Calcado de la Landing (aprobada):
 *  - fondo var(--paper), texto var(--ink)
 *  - malla FIJA de puntos violeta ambiental (misma capa que la landing)
 *  - Navbar compartido (dark, fixed) + PublicFooter compartido (dark band)
 *
 * Pages render their content as children on the paper canvas. They keep their
 * own inner sections/cards; only the background + navbar + footer are unified.
 */
export default function PublicPageShell({ children, className = "" }) {
  return (
    <div
      className={`min-h-screen font-inter relative ${className}`}
      style={{ color: "var(--ink)", background: "var(--paper)" }}
    >
      {/* Fixed ambient violet-DOT mesh — identical to the landing canvas. */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0"
        style={{
          backgroundImage:
            "radial-gradient(rgba(91,76,245,0.28) 1.3px, transparent 2px)",
          backgroundSize: "34px 30px",
          backgroundPosition: "0 0",
          opacity: 1,
          maskImage:
            "radial-gradient(120% 90% at 82% 12%, #000 0%, rgba(0,0,0,0.35) 55%, transparent 100%)",
          WebkitMaskImage:
            "radial-gradient(120% 90% at 82% 12%, #000 0%, rgba(0,0,0,0.35) 55%, transparent 100%)",
        }}
      />

      <Navbar />
      <main className="relative">{children}</main>
      <PublicFooter />
    </div>
  );
}