import React from "react";
import { Link } from "react-router-dom";
import { Plug, Upload, ArrowRight, ShieldCheck } from "lucide-react";

/**
 * "Connect. Confirm. Recover." — verification section.
 *
 * Purpose (per user brief):
 *   - Show HOW an estimate becomes a VERIFIED number.
 *   - Two paths: 1) Connect your store/payments/accounting  2) Upload invoices.
 *   - Show the real integration logos scrolling (Stripe, Shopify + top ones).
 *   - Copy taken verbatim from user's spec — no repetition with other sections.
 *
 * Logo glyphs are abstracted, brand-colored SVG marks. Kept in-file so this
 * section is self-contained (no separate IntegrationsLogos section needed).
 */

// Brand color tokens
const C = {
  stripe: "#635BFF",
  shopify: "#95BF47",
  klaviyo: "#000000",
  adyen: "#0ABF53",
  dhl: "#FFCC00",
  sendcloud: "#1E64FF",
  quickbooks: "#2CA01C",
  xero: "#13B5EA",
  ga: "#F9AB00",
  hubspot: "#FF7A59",
  mollie: "#00D8B0",
  paypal: "#00457C",
  woo: "#7F54B3",
  mailchimp: "#FFE01B",
  sumup: "#00D639",
  square: "#000000",
};

// Simple, recognizable glyphs (abstracted shapes)
const Glyphs = {
  Stripe: (
    <svg viewBox="0 0 24 24" width="18" height="18" fill={C.stripe}>
      <path d="M13.5 10.5c-1.4-.5-2.1-.9-2.1-1.6 0-.6.5-.9 1.3-.9 1.2 0 2.4.5 3.3 1l.5-3C15.5 5.4 14.2 5 12.7 5c-1.4 0-2.6.4-3.4 1.1-.9.7-1.3 1.7-1.3 2.9 0 2.2 1.4 3.1 3.5 3.9 1.4.5 1.9.9 1.9 1.5 0 .6-.5 1-1.5 1-1.2 0-3.3-.6-4.6-1.4l-.5 3.1c1.2.7 3.3 1.3 5.1 1.3 1.5 0 2.7-.4 3.6-1.1.9-.7 1.4-1.8 1.4-3.1 0-2.2-1.4-3.1-3.4-3.7z" />
    </svg>
  ),
  Shopify: (
    <svg viewBox="0 0 24 24" width="18" height="18" fill={C.shopify}>
      <path d="M17.5 6.5c-.1 0-1.6.4-1.6.4s-1.1-1.1-1.2-1.2c-.1-.1-.3-.1-.5-.1l-.9.3c-.6-1.7-1.6-3.2-3.4-3.2h-.2c-.5-.7-1.2-1-1.7-1C4.2 1.7 2.4 6.5 1.9 9c-.6.2-1 .3-1.1.3-.4.1-.4.1-.4.5L2 22l11 2 .5-15.5c.4-.1.7-.2.7-.2.1 0 .1-.1.1-.2 0-.1-.1-1.5-.1-1.5l3.2 1.6.2-1.5c0-.1-.1-.2-.1-.2z" />
    </svg>
  ),
  Klaviyo: (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="#ffffff">
      <path d="M12 2L2 8v8l10 6 10-6V8L12 2zm-2 14l-5-3 5-3 5 3-5 3zm0-8L5 5l5 3 5-3-5 3z" />
    </svg>
  ),
  Adyen: (
    <svg viewBox="0 0 24 24" width="18" height="18">
      <rect x="3" y="3" width="18" height="18" rx="3" fill={C.adyen} />
      <text x="12" y="16" textAnchor="middle" fontSize="11" fontWeight="900" fill="#fff" fontFamily="system-ui">A</text>
    </svg>
  ),
  DHL: (
    <svg viewBox="0 0 32 16" width="28" height="14">
      <rect width="32" height="16" rx="2" fill={C.dhl} />
      <text x="16" y="12" textAnchor="middle" fontSize="9" fontWeight="900" fill="#D40511" fontFamily="system-ui" letterSpacing="0.5">DHL</text>
    </svg>
  ),
  Sendcloud: (
    <svg viewBox="0 0 24 24" width="18" height="18" fill={C.sendcloud}>
      <path d="M19 13a4 4 0 00-.8-7.9 6 6 0 00-11.6 1.6A4.5 4.5 0 007 16h12a3 3 0 000-3z" />
    </svg>
  ),
  QuickBooks: (
    <svg viewBox="0 0 24 24" width="18" height="18">
      <circle cx="12" cy="12" r="10" fill={C.quickbooks} />
      <text x="12" y="16" textAnchor="middle" fontSize="11" fontWeight="900" fill="#fff" fontFamily="system-ui">qb</text>
    </svg>
  ),
  Xero: (
    <svg viewBox="0 0 24 24" width="18" height="18">
      <circle cx="12" cy="12" r="10" fill={C.xero} />
      <text x="12" y="16" textAnchor="middle" fontSize="10" fontWeight="900" fill="#fff" fontFamily="system-ui">X</text>
    </svg>
  ),
  "Google Analytics": (
    <svg viewBox="0 0 24 24" width="18" height="18">
      <rect x="4" y="10" width="4" height="10" rx="2" fill="#E37400" />
      <rect x="10" y="6" width="4" height="14" rx="2" fill={C.ga} />
      <rect x="16" y="3" width="4" height="17" rx="2" fill="#34A853" />
    </svg>
  ),
  HubSpot: (
    <svg viewBox="0 0 24 24" width="18" height="18" fill={C.hubspot}>
      <circle cx="17" cy="14" r="4" />
      <path d="M17 10V6a3 3 0 10-2 2.8" fill="none" stroke={C.hubspot} strokeWidth="2" />
      <circle cx="14" cy="5" r="2" />
    </svg>
  ),
  Mollie: (
    <svg viewBox="0 0 24 24" width="18" height="18" fill={C.mollie}>
      <circle cx="8" cy="12" r="3" />
      <circle cx="16" cy="12" r="3" />
    </svg>
  ),
  PayPal: (
    <svg viewBox="0 0 24 24" width="18" height="18">
      <path d="M7 4h7c3 0 5 1.8 4.5 5-.4 2.6-2.6 4-5.5 4h-3l-1 6H6L7 4z" fill={C.paypal} />
      <path d="M9 7h6c2 0 3.5 1 3 3.5-.4 2-1.8 3-4 3h-3l-1 5H8l1-11.5z" fill="#0079C1" />
    </svg>
  ),
  WooCommerce: (
    <svg viewBox="0 0 24 24" width="18" height="18">
      <rect x="2" y="7" width="20" height="10" rx="2" fill={C.woo} />
      <text x="12" y="15" textAnchor="middle" fontSize="8" fontWeight="900" fill="#fff" fontFamily="system-ui">Woo</text>
    </svg>
  ),
  Mailchimp: (
    <svg viewBox="0 0 24 24" width="18" height="18">
      <circle cx="12" cy="12" r="9" fill={C.mailchimp} />
      <circle cx="10" cy="11" r="1.5" fill="#000" />
      <circle cx="14" cy="11" r="1.5" fill="#000" />
    </svg>
  ),
  SumUp: (
    <svg viewBox="0 0 24 24" width="18" height="18">
      <rect x="3" y="3" width="18" height="18" rx="4" fill={C.sumup} />
      <text x="12" y="16" textAnchor="middle" fontSize="10" fontWeight="900" fill="#000" fontFamily="system-ui">S</text>
    </svg>
  ),
  Square: (
    <svg viewBox="0 0 24 24" width="18" height="18">
      <rect x="3" y="3" width="18" height="18" rx="3" fill={C.square} />
      <rect x="9" y="9" width="6" height="6" fill="#fff" />
    </svg>
  ),
};

const LOGOS = [
  "Stripe", "Shopify", "Klaviyo", "Adyen", "DHL", "Sendcloud",
  "QuickBooks", "Xero", "Google Analytics", "HubSpot", "Mollie",
  "PayPal", "WooCommerce", "Mailchimp", "SumUp", "Square",
];

export default function OneScanSection() {
  return (
    <section className="relative py-16 sm:py-20 overflow-hidden">
      <div className="relative max-w-5xl mx-auto px-6 sm:px-10">
        {/* Header — verbatim copy from user brief */}
        <div className="text-center mb-12">
          <span
            className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 mb-6"
            style={{
              border: "1px solid rgba(34,211,238,0.30)",
              background: "rgba(34,211,238,0.06)",
            }}
          >
            <ShieldCheck size={11} className="text-cyan-300" />
            <span className="text-[10px] uppercase tracking-[0.24em] font-bold text-cyan-300">
              From estimate to verified
            </span>
          </span>

          <h2
            className="text-white mb-6"
            style={{
              fontFamily: "'Space Grotesk', 'Inter', sans-serif",
              fontSize: "clamp(38px, 6vw, 72px)",
              fontWeight: 900,
              letterSpacing: "-0.04em",
              lineHeight: 1.02,
            }}
          >
            Connect. Confirm.{" "}
            <span
              style={{
                background: "linear-gradient(135deg, #60a5fa 0%, #22d3ee 100%)",
                WebkitBackgroundClip: "text",
                backgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}
            >
              Recover.
            </span>
          </h2>

          <p
            className="text-white/60 max-w-2xl mx-auto mb-4"
            style={{ fontSize: "clamp(15px, 1.6vw, 18px)", lineHeight: 1.6 }}
          >
            An intelligence layer, not a calculator. Connect your payments, accounting and store,
            or upload your invoices, and your estimate becomes confirmed.{" "}
            <span className="text-white/85">Read only, we never touch your funds.</span>
          </p>

          <p
            className="text-white/45"
            style={{ fontSize: 13, letterSpacing: "0.02em" }}
          >
            Independent brands, negotiating as one.
          </p>
        </div>

        {/* Live logo marquee — Stripe, Shopify + the important integrations */}
        <div
          className="relative overflow-hidden mb-10"
          style={{
            maskImage:
              "linear-gradient(90deg, transparent, #000 12%, #000 88%, transparent)",
            WebkitMaskImage:
              "linear-gradient(90deg, transparent, #000 12%, #000 88%, transparent)",
          }}
        >
          <div className="flex gap-3 sm:gap-4 os-marquee-track">
            {[...LOGOS, ...LOGOS].map((name, i) => (
              <div
                key={`${name}-${i}`}
                className="shrink-0 px-5 sm:px-6 py-3 rounded-xl flex items-center justify-center gap-2.5"
                style={{
                  background: "rgba(255,255,255,0.035)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  minWidth: 150,
                }}
              >
                <span className="flex items-center justify-center shrink-0">
                  {Glyphs[name]}
                </span>
                <span
                  className="font-bold text-white/85 whitespace-nowrap"
                  style={{
                    fontFamily: "'Space Grotesk', 'Inter', sans-serif",
                    fontSize: 14,
                    letterSpacing: "-0.02em",
                  }}
                >
                  {name}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Two ways to verify — Connect or Upload */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* PATH 1 — Connect */}
          <Link
            to="/Analyzer"
            className="group relative rounded-2xl p-6 sm:p-7 overflow-hidden transition-transform hover:scale-[1.01]"
            style={{
              background:
                "linear-gradient(180deg, rgba(59,130,246,0.10) 0%, rgba(11,16,32,0.85) 100%)",
              border: "1px solid rgba(96,165,250,0.25)",
              boxShadow:
                "0 24px 60px -24px rgba(0,0,0,0.55), 0 0 40px -16px rgba(59,130,246,0.25)",
            }}
          >
            <div
              aria-hidden
              className="absolute pointer-events-none opacity-70 group-hover:opacity-100 transition-opacity"
              style={{
                width: 260, height: 260, right: "-20%", top: "-30%",
                background: "radial-gradient(circle, rgba(59,130,246,0.22) 0%, transparent 70%)",
                filter: "blur(50px)",
              }}
            />
            <div
              className="relative w-9 h-9 rounded-lg flex items-center justify-center mb-4"
              style={{
                background: "rgba(59,130,246,0.14)",
                border: "1px solid rgba(96,165,250,0.30)",
              }}
            >
              <Plug size={16} className="text-blue-300" />
            </div>
            <p className="text-[10px] uppercase tracking-[0.22em] font-bold text-blue-300/90 mb-2">
              Path 01
            </p>
            <h3
              className="text-white mb-2"
              style={{
                fontFamily: "'Space Grotesk', 'Inter', sans-serif",
                fontSize: "clamp(20px, 2.2vw, 24px)",
                fontWeight: 900,
                letterSpacing: "-0.03em",
                lineHeight: 1.1,
              }}
            >
              Connect your store, payments &amp; accounting
            </h3>
            <p className="text-[13px] text-white/55 mb-5 leading-relaxed">
              OAuth read-only to Stripe, Shopify, Xero and 20+ tools. Your exact fees, pulled
              live. Fastest path to a verified number.
            </p>
            <span
              className="inline-flex items-center gap-1.5 text-[13px] font-bold text-white group-hover:text-cyan-300 transition-colors"
            >
              Connect a tool <ArrowRight size={13} />
            </span>
          </Link>

          {/* PATH 2 — Upload */}
          <Link
            to="/Analyzer"
            className="group relative rounded-2xl p-6 sm:p-7 overflow-hidden transition-transform hover:scale-[1.01]"
            style={{
              background:
                "linear-gradient(180deg, rgba(34,211,238,0.10) 0%, rgba(11,16,32,0.85) 100%)",
              border: "1px solid rgba(34,211,238,0.25)",
              boxShadow:
                "0 24px 60px -24px rgba(0,0,0,0.55), 0 0 40px -16px rgba(34,211,238,0.25)",
            }}
          >
            <div
              aria-hidden
              className="absolute pointer-events-none opacity-70 group-hover:opacity-100 transition-opacity"
              style={{
                width: 260, height: 260, left: "-20%", bottom: "-30%",
                background: "radial-gradient(circle, rgba(34,211,238,0.22) 0%, transparent 70%)",
                filter: "blur(50px)",
              }}
            />
            <div
              className="relative w-9 h-9 rounded-lg flex items-center justify-center mb-4"
              style={{
                background: "rgba(34,211,238,0.14)",
                border: "1px solid rgba(34,211,238,0.30)",
              }}
            >
              <Upload size={16} className="text-cyan-300" />
            </div>
            <p className="text-[10px] uppercase tracking-[0.22em] font-bold text-cyan-300/90 mb-2">
              Path 02
            </p>
            <h3
              className="text-white mb-2"
              style={{
                fontFamily: "'Space Grotesk', 'Inter', sans-serif",
                fontSize: "clamp(20px, 2.2vw, 24px)",
                fontWeight: 900,
                letterSpacing: "-0.03em",
                lineHeight: 1.1,
              }}
            >
              Upload your invoices
            </h3>
            <p className="text-[13px] text-white/55 mb-5 leading-relaxed">
              PDF or CSV from any provider — payments, carriers, SaaS. We extract the numbers
              and verify your savings against our network.
            </p>
            <span
              className="inline-flex items-center gap-1.5 text-[13px] font-bold text-white group-hover:text-cyan-300 transition-colors"
            >
              Upload a statement <ArrowRight size={13} />
            </span>
          </Link>
        </div>

        {/* Outcome + security disclosure (foot note per brief) */}
        <div className="mt-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <p className="text-[13px] text-white/55 max-w-xl">
            Once verified, you unlock CAMBRA rates —{" "}
            <span className="text-white/85">enterprise leverage built by pooling every brand's volume.</span>
          </p>
          <p className="inline-flex items-center gap-1.5 text-[12px] text-white/45 whitespace-nowrap">
            <ShieldCheck size={12} className="text-cyan-300/80" />
            Credentials encrypted, never in plain text. Read-only access.
          </p>
        </div>

        <style>{`
          .os-marquee-track {
            animation: os-marquee 42s linear infinite;
            width: max-content;
          }
          @keyframes os-marquee {
            from { transform: translateX(0); }
            to   { transform: translateX(-50%); }
          }
          @media (prefers-reduced-motion: reduce) {
            .os-marquee-track { animation: none; }
          }
        `}</style>
      </div>
    </section>
  );
}