import React from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "@/lib/i18n.jsx";
import { BRAND_ASSETS } from "@/lib/brandAssets";

/**
 * PublicFooter — the SAME dark footer band the approved Landing page renders
 * (LandingFooter), extracted so every public page shares one identical footer.
 * Solid opaque navy band cut across the bottom of the paper page. Do NOT
 * restyle per-page — the whole point is that it's identical everywhere.
 */
export default function PublicFooter() {
  const { t } = useTranslation();
  const links = [
    { to: "/ForProviders", label: t("footer_for_providers") },
    { to: "/Privacy", label: t("footer_privacy") },
    { to: "/Terms", label: t("footer_terms") },
    { to: "/Cookies", label: "Cookies" },
    { to: "/Contact", label: t("footer_contact") },
  ];
  return (
    <footer className="relative mt-16">
      <div
        className="relative w-full overflow-hidden px-6 sm:px-10 pt-20 pb-14"
        style={{
          background: "rgba(10,8,24,0.97)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          borderTop: "1px solid rgba(255,255,255,0.08)",
        }}
      >
        <div className="relative max-w-6xl mx-auto flex flex-col lg:flex-row lg:items-end justify-between gap-10">
          <div>
            <span
              className="font-black text-white inline-flex items-center gap-2.5"
              style={{ letterSpacing: "-0.04em", fontSize: 22 }}
            >
              <img src={BRAND_ASSETS.cMarkWhite} alt="" width={26} height={26} className="h-[26px] w-[26px]" draggable={false} />
              CAMBRA
            </span>
            <p className="mt-4 max-w-xs text-[13px] leading-relaxed" style={{ color: "rgba(255,255,255,0.55)" }}>
              {t("footer_tagline")}
            </p>
          </div>

          <nav className="flex flex-wrap gap-x-7 gap-y-3 text-[13px]">
            {links.map((l) => (
              <Link
                key={l.to}
                to={l.to}
                className="transition-colors"
                style={{ color: "rgba(255,255,255,0.60)" }}
                onMouseEnter={(e) => (e.currentTarget.style.color = "#ffffff")}
                onMouseLeave={(e) => (e.currentTarget.style.color = "rgba(255,255,255,0.60)")}
              >
                {l.label}
              </Link>
            ))}
          </nav>
        </div>

        <div
          className="relative max-w-6xl mx-auto mt-12 pt-6"
          style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}
        >
          <p className="text-[11.5px]" style={{ color: "rgba(255,255,255,0.35)" }}>
            CAMBRA GLOBAL SASU · SIREN 105 452 916 · 42 rue Vivienne, 75002 Paris, France · support@cambra.global
          </p>
        </div>
      </div>
    </footer>
  );
}