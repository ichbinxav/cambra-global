/**
 * CAMBRA ICON & ACCENT SYSTEM
 * Centralized brand/category accent tokens + tool logo registry.
 * Single source of truth — do not redefine these elsewhere.
 */

// Category accent tokens — used for icons, status dots, category markers.
// Subtle. Strategic. Never used as primary background fills.
export const CATEGORY_ACCENTS = {
  payments:   { color: "#7AA8FF", soft: "rgba(122,168,255,0.10)", border: "rgba(122,168,255,0.30)", label: "Payments" },
  commerce:   { color: "#7BD9F0", soft: "rgba(123,217,240,0.10)", border: "rgba(123,217,240,0.30)", label: "Commerce" },
  shipping:   { color: "#52EBA4", soft: "rgba(82,235,164,0.10)", border: "rgba(82,235,164,0.30)", label: "Shipping" },
  saas:       { color: "#C49AFF", soft: "rgba(196,154,255,0.10)", border: "rgba(196,154,255,0.28)", label: "SaaS" },
  banking:    { color: "#8FA9C7", soft: "rgba(143,169,199,0.10)", border: "rgba(143,169,199,0.28)", label: "Banking" },
  insurance:  { color: "#B8C0D0", soft: "rgba(184,192,208,0.10)", border: "rgba(184,192,208,0.28)", label: "Insurance" },
  accounting: { color: "#A8B4C7", soft: "rgba(168,180,199,0.10)", border: "rgba(168,180,199,0.28)", label: "Accounting" },
  operations: { color: "#9AA3B2", soft: "rgba(154,163,178,0.10)", border: "rgba(154,163,178,0.28)", label: "Operations" },
  marketing:  { color: "#FFB05A", soft: "rgba(255,176,90,0.10)", border: "rgba(255,176,90,0.30)", label: "Marketing" },
  default:    { color: "#9AA3B2", soft: "rgba(154,163,178,0.08)", border: "rgba(154,163,178,0.25)", label: "Other" },
};

export function getCategoryAccent(category) {
  const key = String(category || "").toLowerCase().trim();
  return CATEGORY_ACCENTS[key] || CATEGORY_ACCENTS.default;
}

/**
 * Tool registry — maps recognizable tool names to:
 *  - slug:    simpleicons CDN slug (real brand logo)
 *  - color:   official brand hex (used as tint accent — NOT background)
 *  - category: which CAMBRA category it belongs to
 *
 * SimpleIcons CDN URL: https://cdn.simpleicons.org/{slug}/{hexNoHash}
 */
export const TOOL_REGISTRY = {
  // Payments
  "stripe":     { slug: "stripe", color: "635BFF", category: "payments" },
  "adyen":      { slug: "adyen", color: "0ABF53", category: "payments" },
  "paypal":     { slug: "paypal", color: "003087", category: "payments" },
  "mollie":     { slug: "mollie", color: "1A1A1A", category: "payments" },
  "klarna":     { slug: "klarna", color: "FFA8CD", category: "payments" },
  "square":     { slug: "square", color: "3E4348", category: "payments" },
  "checkout":   { slug: "checkout", color: "00122E", category: "payments" },
  "checkout.com": { slug: "checkout", color: "00122E", category: "payments" },
  "sumup":      { slug: "sumup", color: "1A1A1A", category: "payments" },
  "worldline":  { slug: "worldline", color: "1A1A1A", category: "payments" },

  // Commerce
  "shopify":    { slug: "shopify", color: "7AB55C", category: "commerce" },
  "woocommerce":{ slug: "woocommerce", color: "96588A", category: "commerce" },
  "magento":    { slug: "magento", color: "EE672F", category: "commerce" },
  "bigcommerce":{ slug: "bigcommerce", color: "121118", category: "commerce" },
  "prestashop": { slug: "prestashop", color: "DF0067", category: "commerce" },
  "wix":        { slug: "wix", color: "0C6EFC", category: "commerce" },
  "squarespace":{ slug: "squarespace", color: "1A1A1A", category: "commerce" },
  "amazon":     { slug: "amazon", color: "FF9900", category: "commerce" },

  // Shipping
  "dhl":        { slug: "dhl", color: "D40511", category: "shipping" },
  "dpd":        { slug: "dpd", color: "DC0032", category: "shipping" },
  "ups":        { slug: "ups", color: "5A3010", category: "shipping" },
  "fedex":      { slug: "fedex", color: "4D148C", category: "shipping" },
  "sendcloud":  { slug: "sendcloud", color: "1A1A1A", category: "shipping" },
  "shippo":     { slug: "shippo", color: "1A1A1A", category: "shipping" },
  "shipstation":{ slug: "shipstation", color: "0066A4", category: "shipping" },
  "easypost":   { slug: "easypost", color: "164DFF", category: "shipping" },

  // SaaS / Marketing / Ops
  "klaviyo":    { slug: "klaviyo", color: "232425", category: "marketing" },
  "mailchimp":  { slug: "mailchimp", color: "FFE01B", category: "marketing" },
  "hubspot":    { slug: "hubspot", color: "FF7A59", category: "marketing" },
  "intercom":   { slug: "intercom", color: "1F8DED", category: "saas" },
  "gorgias":    { slug: "gorgias", color: "1A1A1A", category: "saas" },
  "zendesk":    { slug: "zendesk", color: "03363D", category: "saas" },
  "notion":     { slug: "notion", color: "000000", category: "saas" },
  "slack":      { slug: "slack", color: "4A154B", category: "saas" },
  "figma":      { slug: "figma", color: "F24E1E", category: "saas" },
  "linear":     { slug: "linear", color: "5E6AD2", category: "saas" },
  "asana":      { slug: "asana", color: "F06A6A", category: "operations" },
  "monday":     { slug: "mondaydotcom", color: "FF3D57", category: "operations" },
  "airtable":   { slug: "airtable", color: "18BFFF", category: "saas" },
  "zapier":     { slug: "zapier", color: "FF4A00", category: "saas" },
  "segment":    { slug: "segment", color: "52BD95", category: "saas" },
  "amplitude":  { slug: "amplitude", color: "1F45FC", category: "saas" },
  "mixpanel":   { slug: "mixpanel", color: "7856FF", category: "saas" },
  "google analytics": { slug: "googleanalytics", color: "E37400", category: "saas" },
  "meta":       { slug: "meta", color: "0467DF", category: "marketing" },
  "facebook":   { slug: "facebook", color: "0866FF", category: "marketing" },
  "google ads": { slug: "googleads", color: "4285F4", category: "marketing" },
  "tiktok":     { slug: "tiktok", color: "000000", category: "marketing" },
  "shipbob":    { slug: "ups", color: "1A1A1A", category: "shipping" },

  // Banking / Fintech
  "qonto":      { slug: "qonto", color: "1A1A1A", category: "banking" },
  "revolut":    { slug: "revolut", color: "191C1F", category: "banking" },
  "n26":        { slug: "n26", color: "26D07C", category: "banking" },
  "wise":       { slug: "wise", color: "9FE870", category: "banking" },
  "mercury":    { slug: "mercury", color: "1A1A1A", category: "banking" },
  "brex":       { slug: "brex", color: "1A1A1A", category: "banking" },

  // Accounting
  "xero":       { slug: "xero", color: "13B5EA", category: "accounting" },
  "quickbooks": { slug: "quickbooks", color: "2CA01C", category: "accounting" },
  "pennylane":  { slug: "pennylane", color: "1A1A1A", category: "accounting" },
  "sage":       { slug: "sage", color: "00DC06", category: "accounting" },
};

export function getToolMeta(name) {
  const key = String(name || "").toLowerCase().trim();
  return TOOL_REGISTRY[key] || null;
}

// Icon sizing scale — use consistently across the platform
export const ICON_SIZE = {
  xs: 10,
  sm: 12,
  md: 14,
  lg: 16,
  xl: 20,
  xxl: 24,
};

// Icon stroke width — Lucide default is 2, we standardize on 1.75 for premium look
export const ICON_STROKE = 1.75;