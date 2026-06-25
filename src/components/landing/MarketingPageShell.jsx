import React from "react";
import MarketingNavbar from "@/components/landing/MarketingNavbar";
import { useAuth } from "@/lib/AuthContext";

/**
 * MarketingPageShell — wraps every public/marketing page in the dark editorial
 * aesthetic from the Landing Hero.
 *
 * Adaptive behavior:
 *  - Logged-out (public visitor): full dark shell + MarketingNavbar fixed.
 *  - Logged-in user (when reached from the in-app navbar): renders inline
 *    inside the surrounding DashboardLayout — no MarketingNavbar, no fixed
 *    full-screen dark background — just a self-contained dark editorial
 *    "card" so the page stays readable and consistent with the app.
 */
export default function MarketingPageShell({
  eyebrow,
  title,
  titleAccent,
  subtitle,
  heroActions,
  heroAlign = "center", // "center" | "left"
  maxWidth = "max-w-6xl",
  children,
}) {
  const isCentered = heroAlign === "center";
  const { isAuthenticated } = useAuth();

  // When a logged-in user reaches a marketing page from the in-app navbar,
  // we render an inline dark editorial section instead of a full-screen takeover.
  if (isAuthenticated) {
    return (
      <section
        className="relative rounded-3xl overflow-hidden"
        style={{
          color: "#ffffff",
          background:
            "linear-gradient(180deg, #0a0a0a 0%, #0b0e1a 22%, #0a0d18 48%, #0b1020 72%, #08090f 100%)",
          border: "1px solid rgba(255,255,255,0.08)",
          boxShadow: "0 30px 80px -30px rgba(0,0,0,0.5)",
        }}
      >
        {/* Ambient grid */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px)",
            backgroundSize: "56px 56px",
            opacity: 0.35,
            maskImage:
              "radial-gradient(ellipse 90% 80% at 50% 20%, #000 35%, transparent 100%)",
            WebkitMaskImage:
              "radial-gradient(ellipse 90% 80% at 50% 20%, #000 35%, transparent 100%)",
          }}
        />

        {/* Soft cyan halo behind the hero */}
        {title && (
          <div
            aria-hidden
            className="pointer-events-none absolute"
            style={{
              width: 600,
              height: 600,
              left: "50%",
              top: 200,
              transform: "translate(-50%, -50%)",
              background:
                "radial-gradient(circle, rgba(59,130,246,0.16) 0%, transparent 70%)",
              filter: "blur(80px)",
            }}
          />
        )}

        <div className="relative py-12 sm:py-16">
          <div className={`relative ${maxWidth} mx-auto px-6 sm:px-10`}>
            {title && (
              <Hero
                eyebrow={eyebrow}
                title={title}
                titleAccent={titleAccent}
                subtitle={subtitle}
                heroActions={heroActions}
                isCentered={isCentered}
              />
            )}
            {children}
          </div>
        </div>
      </section>
    );
  }

  // Public visitor: full-page dark shell with fixed MarketingNavbar.
  return (
    <div
      className="min-h-screen font-inter relative"
      style={{
        color: "#ffffff",
        background:
          "linear-gradient(180deg, #0a0a0a 0%, #0b0e1a 22%, #0a0d18 48%, #0b1020 72%, #08090f 100%)",
      }}
    >
      {/* Fixed ambient grid noise — same as Landing */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px)",
          backgroundSize: "56px 56px",
          opacity: 0.35,
          maskImage:
            "radial-gradient(ellipse 90% 80% at 50% 30%, #000 35%, transparent 100%)",
          WebkitMaskImage:
            "radial-gradient(ellipse 90% 80% at 50% 30%, #000 35%, transparent 100%)",
        }}
      />

      {/* Soft cyan halo behind the hero */}
      {title && (
        <div
          aria-hidden
          className="pointer-events-none absolute"
          style={{
            width: 720,
            height: 720,
            left: "50%",
            top: 280,
            transform: "translate(-50%, -50%)",
            background:
              "radial-gradient(circle, rgba(59,130,246,0.16) 0%, transparent 70%)",
            filter: "blur(80px)",
          }}
        />
      )}

      <MarketingNavbar />

      <main className="relative pt-24 sm:pt-28 pb-20">
        <div className={`relative ${maxWidth} mx-auto px-6 sm:px-10`}>
          {title && (
            <Hero
              eyebrow={eyebrow}
              title={title}
              titleAccent={titleAccent}
              subtitle={subtitle}
              heroActions={heroActions}
              isCentered={isCentered}
            />
          )}
          {children}
        </div>
      </main>
    </div>
  );
}

function Hero({ eyebrow, title, titleAccent, subtitle, heroActions, isCentered }) {
  return (
    <header className={`mb-12 sm:mb-16 ${isCentered ? "text-center" : "text-left"}`}>
      {eyebrow && (
        <div
          className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 mb-6 animate-fade-up"
          style={{
            border: "1px solid rgba(96,165,250,0.30)",
            color: "rgba(255,255,255,0.85)",
            background: "rgba(59,130,246,0.06)",
            backdropFilter: "blur(8px)",
            WebkitBackdropFilter: "blur(8px)",
            boxShadow: "0 0 24px rgba(59,130,246,0.18)",
          }}
        >
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75 animate-ping" />
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-blue-400" />
          </span>
          <span className="text-[10px] uppercase tracking-[0.22em] font-bold">{eyebrow}</span>
        </div>
      )}

      <h1
        className="text-white animate-fade-up"
        style={{
          animationDelay: "100ms",
          fontSize: "clamp(40px, 6.5vw, 80px)",
          fontWeight: 900,
          letterSpacing: "-0.05em",
          lineHeight: 0.94,
          textShadow: "0 0 60px rgba(59,130,246,0.18)",
        }}
      >
        {title}
        {titleAccent && (
          <>
            {" "}
            <span
              style={{
                background:
                  "linear-gradient(135deg, #ffffff 0%, #b8d8e0 50%, #22d3ee 100%)",
                WebkitBackgroundClip: "text",
                backgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}
            >
              {titleAccent}
            </span>
          </>
        )}
      </h1>

      {subtitle && (
        <p
          className={`mt-6 sm:mt-8 animate-fade-up ${isCentered ? "mx-auto" : ""}`}
          style={{
            maxWidth: 560,
            fontSize: 18,
            lineHeight: 1.6,
            color: "rgba(255,255,255,0.60)",
            animationDelay: "250ms",
          }}
        >
          {subtitle}
        </p>
      )}

      {heroActions && (
        <div
          className={`mt-8 animate-fade-up ${isCentered ? "flex justify-center" : ""}`}
          style={{ animationDelay: "350ms" }}
        >
          {heroActions}
        </div>
      )}
    </header>
  );
}