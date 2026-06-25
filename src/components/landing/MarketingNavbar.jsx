import React, { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Menu, X } from "lucide-react";
import CambraCTA from "@/components/shared/CambraCTA";
import LanguageSwitcher from "@/components/shared/LanguageSwitcher";
import { useTranslation } from "@/lib/i18n.jsx";

/**
 * Dark editorial navbar — matches the Landing Hero aesthetic.
 * Use on every public/marketing page so they all share one navigation surface.
 */
export default function MarketingNavbar() {
  const { t } = useTranslation();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      <nav
        className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 sm:px-10"
        style={{
          height: 60,
          background: "rgba(10,10,10,0.85)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        <Link to="/" className="text-white" style={{ fontWeight: 900, letterSpacing: "-0.04em", fontSize: 18 }}>
          CAMBRA
        </Link>

        <div className="hidden md:flex items-center gap-8 text-[13px]" style={{ color: "rgba(255,255,255,0.55)" }}>
          <Link to="/HowItWorks" className="hover:text-white transition-colors">{t("nav_how") || "How it works"}</Link>
          <Link to="/Pricing" className="hover:text-white transition-colors">{t("nav_pricing") || "Pricing"}</Link>
          <Link to="/Developers" className="hover:text-white transition-colors">{t("nav_developers") || "Developers"}</Link>
        </div>

        <div className="hidden md:flex items-center gap-3">
          <LanguageSwitcher variant="dark" />
          <CambraCTA intent="audit" size="sm" />
        </div>

        <div className="flex md:hidden items-center gap-2">
          <button
            type="button"
            onClick={() => setMobileOpen(v => !v)}
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
            aria-expanded={mobileOpen}
            className="inline-flex items-center justify-center h-10 w-10 rounded-full text-white"
            style={{ border: "1px solid rgba(255,255,255,0.15)", background: "rgba(255,255,255,0.04)" }}
          >
            {mobileOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>
      </nav>

      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-40">
          <div
            className="absolute inset-0 bg-black/50 animate-fade-up"
            style={{ animationDuration: "200ms" }}
            onClick={() => setMobileOpen(false)}
            aria-hidden
          />
          <div
            className="absolute left-0 right-0 top-[60px] overflow-y-auto animate-fade-up"
            style={{
              maxHeight: "calc(100vh - 60px)",
              background:
                "radial-gradient(120% 60% at 50% 0%, rgba(31,78,216,0.18) 0%, transparent 55%), linear-gradient(180deg, hsl(222 65% 5%) 0%, hsl(222 70% 3%) 100%)",
              borderBottom: "1px solid rgba(255,255,255,0.08)",
              boxShadow: "0 30px 80px -30px rgba(0,0,0,0.6)",
            }}
          >
            <nav className="px-6 py-6 flex flex-col gap-1">
              <div className="mb-4" onClick={() => setMobileOpen(false)}>
                <CambraCTA intent="audit" size="md" className="w-full" />
              </div>
              <Link
                to="/HowItWorks"
                onClick={() => setMobileOpen(false)}
                className="flex items-center justify-between py-3.5 text-white text-[15px] font-semibold border-b border-white/[0.06]"
              >
                {t("nav_how") || "How it works"} <ArrowRight size={14} className="text-white/40" />
              </Link>
              <Link
                to="/Pricing"
                onClick={() => setMobileOpen(false)}
                className="flex items-center justify-between py-3.5 text-white text-[15px] font-semibold border-b border-white/[0.06]"
              >
                {t("nav_pricing") || "Pricing"} <ArrowRight size={14} className="text-white/40" />
              </Link>
              <Link
                to="/Developers"
                onClick={() => setMobileOpen(false)}
                className="flex items-center justify-between py-3.5 text-white text-[15px] font-semibold border-b border-white/[0.06]"
              >
                {t("nav_developers") || "Developers"} <ArrowRight size={14} className="text-white/40" />
              </Link>
              <a
                href="/auth/start"
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setMobileOpen(false)}
                className="flex items-center justify-between py-3.5 text-white/80 text-[15px] font-semibold"
              >
                Sign in <ArrowRight size={14} className="text-white/40" />
              </a>

              <div className="pt-5">
                <LanguageSwitcher variant="dark" />
              </div>
            </nav>
          </div>
        </div>
      )}
    </>
  );
}