import React from "react";

/**
 * Integrations marquee — logo glyph + wordmark per brand.
 * Glyphs are inline SVGs styled in their real brand color so each chip reads
 * as a real logo, not a plain text label.
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
  notion: "#FFFFFF",
  ga: "#F9AB00",
  slack: "#E01E5A",
  hubspot: "#FF7A59",
  mollie: "#00D8B0",
  paypal: "#00457C",
  salesforce: "#00A1E0",
  mailchimp: "#FFE01B",
  zendesk: "#03363D",
};

// Simple, recognizable glyphs (abstracted shapes — not exact brand marks)
const Glyphs = {
  Stripe: (
    <svg viewBox="0 0 24 24" width="18" height="18" fill={C.stripe}>
      <path d="M13.5 10.5c-1.4-.5-2.1-.9-2.1-1.6 0-.6.5-.9 1.3-.9 1.2 0 2.4.5 3.3 1l.5-3C15.5 5.4 14.2 5 12.7 5c-1.4 0-2.6.4-3.4 1.1-.9.7-1.3 1.7-1.3 2.9 0 2.2 1.4 3.1 3.5 3.9 1.4.5 1.9.9 1.9 1.5 0 .6-.5 1-1.5 1-1.2 0-3.3-.6-4.6-1.4l-.5 3.1c1.2.7 3.3 1.3 5.1 1.3 1.5 0 2.7-.4 3.6-1.1.9-.7 1.4-1.8 1.4-3.1 0-2.2-1.4-3.1-3.4-3.7z"/>
    </svg>
  ),
  Shopify: (
    <svg viewBox="0 0 24 24" width="18" height="18" fill={C.shopify}>
      <path d="M17.5 6.5c-.1 0-1.6.4-1.6.4s-1.1-1.1-1.2-1.2c-.1-.1-.3-.1-.5-.1l-.9.3c-.6-1.7-1.6-3.2-3.4-3.2h-.2c-.5-.7-1.2-1-1.7-1C4.2 1.7 2.4 6.5 1.9 9c-.6.2-1 .3-1.1.3-.4.1-.4.1-.4.5L2 22l11 2 .5-15.5c.4-.1.7-.2.7-.2.1 0 .1-.1.1-.2 0-.1-.1-1.5-.1-1.5l3.2 1.6.2-1.5c0-.1-.1-.2-.1-.2zM12.4 6.7c-.4.1-.9.3-1.4.4 0-.8-.1-1.8-.4-2.5 1 .2 1.5 1.2 1.8 2.1zM10 4.9c.3.8.4 1.9.4 2.7l-2 .6c.4-1.4 1.1-2.7 1.6-3.3zM9.1 3c.1 0 .3 0 .4.1-.7.3-1.5 1.4-1.9 3.7-.6.2-1.1.3-1.7.5C6.5 5.6 7.7 3 9.1 3z"/>
    </svg>
  ),
  Klaviyo: (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="#ffffff">
      <path d="M12 2L2 8v8l10 6 10-6V8L12 2zm-2 14l-5-3 5-3 5 3-5 3zm0-8L5 5l5 3 5-3-5 3z"/>
    </svg>
  ),
  Adyen: (
    <svg viewBox="0 0 24 24" width="18" height="18" fill={C.adyen}>
      <rect x="3" y="3" width="18" height="18" rx="3"/>
      <text x="12" y="16" textAnchor="middle" fontSize="11" fontWeight="900" fill="#fff" fontFamily="system-ui">A</text>
    </svg>
  ),
  DHL: (
    <svg viewBox="0 0 32 16" width="28" height="14">
      <rect width="32" height="16" rx="2" fill={C.dhl}/>
      <text x="16" y="12" textAnchor="middle" fontSize="9" fontWeight="900" fill="#D40511" fontFamily="system-ui" letterSpacing="0.5">DHL</text>
    </svg>
  ),
  Sendcloud: (
    <svg viewBox="0 0 24 24" width="18" height="18" fill={C.sendcloud}>
      <path d="M19 13a4 4 0 00-.8-7.9 6 6 0 00-11.6 1.6A4.5 4.5 0 007 16h12a3 3 0 000-3z"/>
    </svg>
  ),
  QuickBooks: (
    <svg viewBox="0 0 24 24" width="18" height="18">
      <circle cx="12" cy="12" r="10" fill={C.quickbooks}/>
      <text x="12" y="16" textAnchor="middle" fontSize="11" fontWeight="900" fill="#fff" fontFamily="system-ui">qb</text>
    </svg>
  ),
  Notion: (
    <svg viewBox="0 0 24 24" width="18" height="18">
      <rect x="3" y="3" width="18" height="18" rx="3" fill="#ffffff"/>
      <path d="M8 8v8M8 8l8 8M16 8v8" stroke="#000" strokeWidth="2" strokeLinecap="round" fill="none"/>
    </svg>
  ),
  "Google Analytics": (
    <svg viewBox="0 0 24 24" width="18" height="18">
      <rect x="4" y="10" width="4" height="10" rx="2" fill="#E37400"/>
      <rect x="10" y="6" width="4" height="14" rx="2" fill={C.ga}/>
      <rect x="16" y="3" width="4" height="17" rx="2" fill="#34A853"/>
    </svg>
  ),
  Slack: (
    <svg viewBox="0 0 24 24" width="18" height="18">
      <rect x="3" y="10" width="8" height="3" rx="1.5" fill={C.slack}/>
      <rect x="13" y="10" width="3" height="8" rx="1.5" fill="#36C5F0"/>
      <rect x="11" y="3" width="8" height="3" rx="1.5" fill="#ECB22E"/>
      <rect x="8" y="6" width="3" height="8" rx="1.5" fill="#2EB67D"/>
    </svg>
  ),
  HubSpot: (
    <svg viewBox="0 0 24 24" width="18" height="18" fill={C.hubspot}>
      <circle cx="17" cy="14" r="4"/>
      <path d="M17 10V6a3 3 0 10-2 2.8" fill="none" stroke={C.hubspot} strokeWidth="2"/>
      <circle cx="14" cy="5" r="2"/>
    </svg>
  ),
  Mollie: (
    <svg viewBox="0 0 24 24" width="18" height="18" fill={C.mollie}>
      <circle cx="8" cy="12" r="3"/>
      <circle cx="16" cy="12" r="3"/>
    </svg>
  ),
  PayPal: (
    <svg viewBox="0 0 24 24" width="18" height="18">
      <path d="M7 4h7c3 0 5 1.8 4.5 5-.4 2.6-2.6 4-5.5 4h-3l-1 6H6L7 4z" fill={C.paypal}/>
      <path d="M9 7h6c2 0 3.5 1 3 3.5-.4 2-1.8 3-4 3h-3l-1 5H8l1-11.5z" fill="#0079C1"/>
    </svg>
  ),
  Salesforce: (
    <svg viewBox="0 0 24 24" width="18" height="18" fill={C.salesforce}>
      <path d="M19 11a4 4 0 00-.8-7.9 5.5 5.5 0 00-10.6 1A4 4 0 005 13a3.5 3.5 0 003 5h10a3 3 0 001-7z"/>
    </svg>
  ),
  Mailchimp: (
    <svg viewBox="0 0 24 24" width="18" height="18">
      <circle cx="12" cy="12" r="9" fill={C.mailchimp}/>
      <circle cx="10" cy="11" r="1.5" fill="#000"/>
      <circle cx="14" cy="11" r="1.5" fill="#000"/>
    </svg>
  ),
  Zendesk: (
    <svg viewBox="0 0 24 24" width="18" height="18" fill={C.zendesk}>
      <path d="M3 6l9 12H3V6zm18 12L12 6h9v12z"/>
    </svg>
  ),
};

const LOGOS = [
  "Stripe", "Shopify", "Klaviyo", "Adyen", "DHL", "Sendcloud",
  "QuickBooks", "Notion", "Google Analytics", "Slack", "HubSpot",
  "Mollie", "PayPal", "Salesforce", "Mailchimp", "Zendesk",
];

export default function IntegrationsLogos() {
  return (
    <section className="relative py-20 sm:py-24 overflow-hidden">
      <div className="relative max-w-6xl mx-auto px-6 sm:px-10">
        <div className="text-center mb-10">
          <span
            className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 mb-5"
            style={{
              border: "1px solid rgba(255,255,255,0.14)",
              background: "rgba(255,255,255,0.03)",
            }}
          >
            <span className="text-[10px] uppercase tracking-[0.24em] font-bold text-white/70">
              Connect the tools you already use
            </span>
          </span>
          <h3
            className="text-white"
            style={{
              fontFamily: "'Space Grotesk', 'Inter', sans-serif",
              fontSize: "clamp(22px, 3vw, 32px)",
              fontWeight: 800,
              letterSpacing: "-0.03em",
              lineHeight: 1.1,
            }}
          >
            Connects with the tools you already use.
          </h3>
          <p className="mt-3 text-[13px] text-white/45 max-w-md mx-auto">
            OAuth read-only. Credentials encrypted, never in plain text. We never touch funds.
          </p>
        </div>

        {/* Foot note under logos — honest security disclosure */}
        {/* (kept minimal on purpose — full pledge lives on the Security page) */}

        {/* Marquee */}
        <div
          className="relative overflow-hidden"
          style={{
            maskImage:
              "linear-gradient(90deg, transparent, #000 12%, #000 88%, transparent)",
            WebkitMaskImage:
              "linear-gradient(90deg, transparent, #000 12%, #000 88%, transparent)",
          }}
        >
          <div className="flex gap-3 sm:gap-4 marquee-track">
            {[...LOGOS, ...LOGOS].map((name, i) => (
              <div
                key={`${name}-${i}`}
                className="shrink-0 px-5 sm:px-6 py-3.5 rounded-xl flex items-center justify-center gap-2.5"
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

        <style>{`
          .marquee-track {
            animation: marquee 38s linear infinite;
            width: max-content;
          }
          @keyframes marquee {
            from { transform: translateX(0); }
            to   { transform: translateX(-50%); }
          }
          @media (prefers-reduced-motion: reduce) {
            .marquee-track { animation: none; }
          }
        `}</style>
      </div>
    </section>
  );
}