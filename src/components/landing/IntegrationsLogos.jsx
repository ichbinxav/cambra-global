import React from "react";

/**
 * Integrations marquee — shows the most important brands we connect with.
 * Logos are text wordmarks (no remote assets), styled as a clean strip.
 */
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
              60+ integrations
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
            One-click OAuth or read-only API. We never touch funds, never store credentials.
          </p>
        </div>

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
                className="shrink-0 px-5 sm:px-7 py-3.5 rounded-xl flex items-center justify-center"
                style={{
                  background: "rgba(255,255,255,0.035)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  minWidth: 140,
                }}
              >
                <span
                  className="font-bold text-white/70 whitespace-nowrap"
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