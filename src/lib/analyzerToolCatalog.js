/**
 * analyzerToolCatalog.js
 *
 * Static catalog of providers / SaaS tools the founder can pick from in
 * Step 2 of the Analyzer. Purely UI-side — no backend writes.
 *
 * The Analyzer business logic only cares about TWO things:
 *   - The set of confirmed tool NAMES (string)
 *   - Provider keywords that match PAYMENT_PROVIDERS / SHIPPING_PROVIDERS
 *     in pages/Analyzer (used to seed the manual payment/shipping selects)
 *
 * Everything else (logo, color, blurb) is decoration. The picker passes a
 * synthetic `tools` array shaped exactly like discovery findings:
 *   { category, provider_or_tool, confidence_score, source: 'catalog' }
 *
 * Add a tool: pick the right category, give it a 2-letter monogram and a hex
 * color. That's it.
 */

export const TOOL_CATEGORIES = [
  { key: "payments",  label: "Payments",   blurb: "PSPs, gateways, BNPL" },
  { key: "commerce",  label: "Commerce",   blurb: "Storefronts & POS" },
  { key: "shipping",  label: "Shipping",   blurb: "Carriers & 3PLs" },
  { key: "marketing", label: "Marketing",  blurb: "Email, SMS, ads, CRM" },
  { key: "analytics", label: "Analytics",  blurb: "Site & product analytics" },
  { key: "support",   label: "Support",    blurb: "Helpdesk & chat" },
  { key: "saas",      label: "Productivity & SaaS", blurb: "Ops & internal tools" },
  { key: "banking",   label: "Banking",    blurb: "Business banking" },
];

/**
 * monogram: 1-2 chars rendered inside a colored tile. color: brand-ish hex.
 * Sourced from common European/global commerce stacks.
 */
export const CATALOG = [
  // ── Payments ────────────────────────────────────────────────────────────
  { name: "Stripe",            category: "payments",  color: "#635BFF", monogram: "S" },
  { name: "Adyen",             category: "payments",  color: "#0ABF53", monogram: "A" },
  { name: "Mollie",            category: "payments",  color: "#0070F3", monogram: "M" },
  { name: "PayPal",            category: "payments",  color: "#003087", monogram: "P" },
  { name: "Klarna",            category: "payments",  color: "#FFA8CD", monogram: "K" },
  { name: "Shopify Payments",  category: "payments",  color: "#95BF47", monogram: "SP" },
  { name: "Checkout.com",      category: "payments",  color: "#101820", monogram: "CO" },
  { name: "Worldline",         category: "payments",  color: "#0F1E73", monogram: "W" },
  { name: "Sumup",             category: "payments",  color: "#00B5A7", monogram: "SU" },
  { name: "Square",            category: "payments",  color: "#000000", monogram: "Sq" },
  { name: "Revolut Business",  category: "payments",  color: "#191C1F", monogram: "R" },
  { name: "GoCardless",        category: "payments",  color: "#0BB7B2", monogram: "GC" },
  { name: "Alma",              category: "payments",  color: "#FE3D72", monogram: "AL" },
  { name: "Scalapay",          category: "payments",  color: "#E0FF4F", monogram: "SC" },

  // ── Commerce ────────────────────────────────────────────────────────────
  { name: "Shopify",           category: "commerce",  color: "#95BF47", monogram: "Sh" },
  { name: "WooCommerce",       category: "commerce",  color: "#7F54B3", monogram: "Wo" },
  { name: "Prestashop",        category: "commerce",  color: "#DF0067", monogram: "PS" },
  { name: "BigCommerce",       category: "commerce",  color: "#121118", monogram: "BC" },
  { name: "Magento",           category: "commerce",  color: "#EE672F", monogram: "Mg" },
  { name: "Squarespace",       category: "commerce",  color: "#000000", monogram: "Sq" },
  { name: "Wix",               category: "commerce",  color: "#0C6EFC", monogram: "Wx" },
  { name: "Webflow",           category: "commerce",  color: "#146EF5", monogram: "Wb" },
  { name: "Lightspeed",        category: "commerce",  color: "#F02E11", monogram: "LS" },

  // ── Shipping ────────────────────────────────────────────────────────────
  { name: "DHL",               category: "shipping",  color: "#FFCC00", monogram: "DH" },
  { name: "UPS",               category: "shipping",  color: "#351C15", monogram: "UP" },
  { name: "FedEx",             category: "shipping",  color: "#4D148C", monogram: "Fx" },
  { name: "Colissimo",         category: "shipping",  color: "#FFCC00", monogram: "Co" },
  { name: "Chronopost",        category: "shipping",  color: "#E2001A", monogram: "Ch" },
  { name: "Mondial Relay",     category: "shipping",  color: "#E60052", monogram: "MR" },
  { name: "Sendcloud",         category: "shipping",  color: "#0019FF", monogram: "Sc" },
  { name: "Shippo",            category: "shipping",  color: "#6F44FE", monogram: "Sh" },
  { name: "Shipstation",       category: "shipping",  color: "#2A86CF", monogram: "SS" },
  { name: "GLS",               category: "shipping",  color: "#1D4595", monogram: "GL" },
  { name: "TNT",               category: "shipping",  color: "#FF6600", monogram: "TN" },
  { name: "SEUR",              category: "shipping",  color: "#017A3B", monogram: "SE" },
  { name: "Correos",           category: "shipping",  color: "#FFCC00", monogram: "Cr" },
  { name: "An Post",           category: "shipping",  color: "#00833E", monogram: "AP" },

  // ── Marketing ───────────────────────────────────────────────────────────
  { name: "Klaviyo",           category: "marketing", color: "#000000", monogram: "Kl" },
  { name: "Mailchimp",         category: "marketing", color: "#FFE01B", monogram: "Mc" },
  { name: "Brevo",             category: "marketing", color: "#0B996E", monogram: "Br" },
  { name: "Sendinblue",        category: "marketing", color: "#0092FF", monogram: "Sb" },
  { name: "HubSpot",           category: "marketing", color: "#FF7A59", monogram: "Hs" },
  { name: "Attentive",         category: "marketing", color: "#FFD600", monogram: "At" },
  { name: "Postscript",        category: "marketing", color: "#FF6E5A", monogram: "Po" },
  { name: "Meta Ads",          category: "marketing", color: "#0866FF", monogram: "Me" },
  { name: "Google Ads",        category: "marketing", color: "#4285F4", monogram: "GA" },
  { name: "TikTok Ads",        category: "marketing", color: "#000000", monogram: "Tk" },
  { name: "Yotpo",             category: "marketing", color: "#0042E4", monogram: "Yo" },
  { name: "Trustpilot",        category: "marketing", color: "#00B67A", monogram: "Tp" },

  // ── Analytics ───────────────────────────────────────────────────────────
  { name: "Google Analytics",  category: "analytics", color: "#F9AB00", monogram: "GA" },
  { name: "Mixpanel",          category: "analytics", color: "#7856FF", monogram: "Mp" },
  { name: "Amplitude",         category: "analytics", color: "#1E61F0", monogram: "Am" },
  { name: "Segment",           category: "analytics", color: "#52BD94", monogram: "Sg" },
  { name: "Hotjar",            category: "analytics", color: "#FD3A5C", monogram: "Hj" },
  { name: "PostHog",           category: "analytics", color: "#1D4AFF", monogram: "Ph" },
  { name: "Plausible",         category: "analytics", color: "#5850EC", monogram: "Pl" },

  // ── Support ─────────────────────────────────────────────────────────────
  { name: "Gorgias",           category: "support",   color: "#1E1E1E", monogram: "Go" },
  { name: "Zendesk",           category: "support",   color: "#03363D", monogram: "Zd" },
  { name: "Intercom",          category: "support",   color: "#1F8DED", monogram: "Ic" },
  { name: "Front",             category: "support",   color: "#A857F4", monogram: "Fr" },
  { name: "Crisp",             category: "support",   color: "#1972F5", monogram: "Cp" },
  { name: "Freshdesk",         category: "support",   color: "#25C16F", monogram: "Fd" },

  // ── Productivity & SaaS ────────────────────────────────────────────────
  { name: "Notion",            category: "saas",      color: "#000000", monogram: "No" },
  { name: "Slack",             category: "saas",      color: "#611F69", monogram: "Sk" },
  { name: "Google Workspace",  category: "saas",      color: "#4285F4", monogram: "GW" },
  { name: "Microsoft 365",     category: "saas",      color: "#D83B01", monogram: "M3" },
  { name: "Figma",             category: "saas",      color: "#F24E1E", monogram: "Fg" },
  { name: "Linear",            category: "saas",      color: "#5E6AD2", monogram: "Ln" },
  { name: "Asana",             category: "saas",      color: "#F06A6A", monogram: "As" },
  { name: "Monday",            category: "saas",      color: "#FF3D57", monogram: "Mo" },
  { name: "Airtable",          category: "saas",      color: "#FCB400", monogram: "At" },
  { name: "Zapier",            category: "saas",      color: "#FF4A00", monogram: "Zp" },
  { name: "Make",              category: "saas",      color: "#6D00CC", monogram: "Mk" },
  { name: "Pennylane",         category: "saas",      color: "#1E1E1E", monogram: "Pn" },
  { name: "Quickbooks",        category: "saas",      color: "#2CA01C", monogram: "Qb" },
  { name: "Xero",              category: "saas",      color: "#13B5EA", monogram: "Xe" },

  // ── Banking ─────────────────────────────────────────────────────────────
  { name: "Qonto",             category: "banking",   color: "#1D1D44", monogram: "Qo" },
  { name: "Revolut Business",  category: "banking",   color: "#191C1F", monogram: "RB" },
  { name: "Wise Business",     category: "banking",   color: "#9FE870", monogram: "Wi" },
  { name: "Shine",             category: "banking",   color: "#FFD37A", monogram: "Sh" },
  { name: "BNP Paribas",       category: "banking",   color: "#00915A", monogram: "BN" },
  { name: "Crédit Agricole",   category: "banking",   color: "#009A3D", monogram: "CA" },
  { name: "Société Générale",  category: "banking",   color: "#E60028", monogram: "SG" },
  { name: "CaixaBank",         category: "banking",   color: "#007BBC", monogram: "Cx" },
  { name: "Santander",         category: "banking",   color: "#EC0000", monogram: "St" },
  { name: "Bank of Ireland",   category: "banking",   color: "#00833E", monogram: "BI" },
];

/**
 * Convert catalog → synthetic "tool finding" shape so the Analyzer can merge
 * picker selections into its existing confirmedTools / dismissedTools sets
 * without any branching.
 *
 * Categories in CATALOG already match the bucket keys used by DetectedToolsGrid
 * and pages/Analyzer (payments / commerce / shipping / marketing / analytics /
 * support / saas / banking), so no remapping is needed.
 */
export function catalogToToolFindings() {
  return CATALOG.map(item => ({
    category: item.category,
    provider_or_tool: item.name,
    confidence_score: 0,
    source: "catalog",
  }));
}

/** Lookup helper used by the picker UI. */
export function getCatalogMeta(name) {
  return CATALOG.find(c => c.name.toLowerCase() === String(name || "").toLowerCase()) || null;
}