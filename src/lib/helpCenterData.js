// CAMBRA Help Center — content & taxonomy
// Tone: sharp, intelligent, calm, infrastructure-native.
//
// M4-TPV Fase 3 · Coherence patch (2026-07-12).
// ─────────────────────────────────────────────────────────────────────────
// The Help Center was written pre-R1 for the multi-vertical CAMBRA
// (payments + shipping + saas + insurance + telecom + banking). Post-R1
// the product is payments-only, but the Help Center content still ships
// the old taxonomy — a visitor to /Help sees "Shipping help" and "SaaS &
// Commerce Stack" categories that don't correspond to anything the
// product does today.
//
// A full refactor (retone every FAQ to payments-only + translate to FR/ES
// + rework getting-started to stop listing dead verticals) is tracked in
// KNOWN_DEBT as "Help Center — refactor payments-only + traducción FR/ES".
//
// This patch is the minimum surface-correctness fix on top of that debt:
//   1. Hide dead-vertical categories (shipping, saas) from public UI via
//      `hidden: true`. The FAQ_GROUPS entries are LEFT IN PLACE so any
//      deep-link (/Help/shipping) still resolves rather than 404-ing —
//      but they no longer appear in the category grid, search results,
//      or nav.
//   2. Add 3 new in-store FAQs to the `payments` category, including the
//      one that matters most: "¿qué hacéis con mis facturas?" — merchants
//      need this answered BEFORE they upload a document.
// ─────────────────────────────────────────────────────────────────────────

export const CATEGORIES = [
  {
    slug: "getting-started",
    title: "Getting Started",
    description: "First steps with CAMBRA's infrastructure intelligence.",
    icon: "Sparkles",
    accent: "#1F4ED8",
  },
  {
    slug: "analyzer",
    title: "Infrastructure Analyzer",
    description: "How the Analyzer audits your operating costs.",
    icon: "Activity",
    accent: "#2CA7C1",
  },
  // ── REMOVED 2026-07-12 (M4-TPV Fase 3 coherence patch, iteración 2).
  // The "Infrastructure Score" was a multi-vertical concept (composite 0-100
  // across payments, logistics, SaaS, insurance...) that no longer exists in
  // the payments-only product. Today's product surfaces a per-channel gap
  // in bps plus a savings range — not a stack-maturity score. Category
  // removed entirely rather than retoned: the concept itself is dead, not
  // just the wording.
  {
    slug: "savings",
    title: "Savings & Optimization",
    description: "From detection to verified optimization.",
    icon: "TrendingDown",
    accent: "#2CA7C1",
  },
  {
    slug: "payments",
    title: "Payments Infrastructure",
    description: "Processing rates, fees, and benchmark logic.",
    icon: "CreditCard",
    accent: "#635BFF",
  },
  // ── HIDDEN 2026-07-12 (M4-TPV Fase 3 coherence patch).
  // Shipping / SaaS categories belong to the pre-R1 multi-vertical product.
  // Kept in the array (not deleted) so any deep-link resolves via
  // getCategory(slug), but excluded from the public category grid via
  // `hidden: true`. Consumers (Help.jsx, CategoryGrid, search) filter on
  // `!c.hidden` to render.
  {
    slug: "shipping",
    title: "Shipping & Logistics",
    description: "Carrier benchmarks and shipping economics.",
    icon: "Truck",
    accent: "#1F4ED8",
    hidden: true,
  },
  {
    slug: "saas",
    title: "SaaS & Commerce Stack",
    description: "Tooling redundancy and stack alignment.",
    icon: "Package",
    accent: "#2CA7C1",
    hidden: true,
  },
  {
    slug: "benchmarks",
    title: "Benchmarks & Insights",
    description: "Where the data comes from and how it's modeled.",
    icon: "BarChart3",
    accent: "#1F4ED8",
  },
  {
    slug: "integrations",
    title: "Integrations & Connections",
    description: "Connect Stripe, Shopify, Drive, Sheets and more.",
    icon: "Plug",
    accent: "#2CA7C1",
  },
  {
    slug: "uploads",
    title: "Uploads & Invoice Analysis",
    description: "Upload statements and invoices for deep analysis.",
    icon: "Upload",
    accent: "#635BFF",
  },
  {
    slug: "security",
    title: "Data & Security",
    description: "Encryption, access, GDPR, and read-only guarantees.",
    icon: "Shield",
    accent: "#1F4ED8",
  },
  {
    slug: "pricing",
    title: "Membership & Pricing",
    description: "Free access, CAMBRA Pro, and the Founding period.",
    icon: "Wallet",
    accent: "#2CA7C1",
  },
  {
    slug: "troubleshooting",
    title: "Technical Troubleshooting",
    description: "Resolve connection, upload, and data issues.",
    icon: "Wrench",
    accent: "#1F4ED8",
  },
  {
    slug: "legal",
    title: "Legal & Compliance",
    description: "Terms, privacy, mandates, and provider authorization.",
    icon: "Scale",
    accent: "#2CA7C1",
  },
];

export const FAQ_GROUPS = [
  {
    category: "getting-started",
    title: "About CAMBRA",
    items: [
      {
        q: "What is CAMBRA?",
        a: "CAMBRA analyzes your card-payment costs — online (PSP) and in-store (TPV / physical terminal) — measures your effective rate against verifiable public benchmarks, and helps you recover what you're overpaying. Independent commerce brands typically overpay 30–60% on card processing without knowing it.",
      },
      {
        q: "Who is CAMBRA built for?",
        a: "Independent commerce brands — DTC, omnichannel, marketplace-led — typically between €500K and €50M annual revenue, where card-processing costs have grown faster than visibility. CAMBRA is designed for operators, founders and CFOs who suspect margin is leaking on payments but lack a structured way to prove it.",
      },
      {
        q: "What kinds of costs does CAMBRA analyze?",
        a: "Card-payment costs, in both channels: online payments (Stripe, PayPal, Shopify Payments, Adyen, Mollie, Checkout.com, and other PSPs) and in-store terminal payments (SumUp, Stripe Terminal, Smile & Pay, Zettle, and traditional bank TPVs). Effective rates, interchange, scheme fees, cross-border uplift, fixed-fee drag, and terminal rental — every component of your all-in cost per transaction.",
      },
      {
        q: "Is CAMBRA a procurement platform?",
        a: "No. CAMBRA is an intelligence and audit layer. Procurement is downstream — we focus on visibility, benchmarking, and surfacing optimization opportunities. Acting on them is a separate step, fully under your control.",
      },
      {
        q: "Is CAMBRA replacing my providers?",
        a: "Not necessarily. Most optimizations happen by renegotiating with your current providers using benchmark evidence. Switching is one option among many — CAMBRA's job is to show you the full picture, not push a specific outcome.",
      },
      {
        q: "Why do modern brands overpay for infrastructure?",
        a: "Three reasons: pricing opacity, stack drift, and benchmark blindness. Providers rarely volunteer better terms. Tools accumulate over years without audits. And without comparable peer data, brands can't tell what 'fair' looks like. CAMBRA solves all three.",
      },
      {
        q: "What makes CAMBRA different from consultants?",
        a: "Consultants are episodic, expensive, and inconsistent. CAMBRA is continuous, data-driven, and built on benchmark intelligence — not opinions. The platform runs in minutes, not months, and stays in place to monitor your stack going forward.",
      },
      {
        q: "How does CAMBRA identify inefficiencies?",
        a: "By combining your operating inputs, connected data, and uploaded statements against proprietary benchmark datasets and provider pricing patterns. The result: a structured map of where your stack is aligned, where it's drifting, and where margin is recoverable.",
      },
    ],
  },
  {
    category: "analyzer",
    title: "Infrastructure Analyzer",
    items: [
      {
        q: "What is the Payments Analyzer?",
        a: "The Analyzer is CAMBRA's core engine. It audits your card-payment cost structure — online, in-store, or both — benchmarks it against verifiable public pricing for comparable providers, and produces a per-channel gap in basis points plus an estimated monthly and annual savings range. Typically under 60 seconds.",
      },
      {
        q: "How does the Analyzer work?",
        a: "You answer a short sequence about your monthly GMV, average ticket, provider, country, and cross-border share. CAMBRA combines those inputs with public provider pricing (Stripe, PayPal, Shopify Payments, SumUp, Stripe Terminal, and others we've verified) to estimate the gap between what you pay today and what your cohort's floor rate is.",
      },
      {
        q: "What is analyzed?",
        a: "Your effective processing rate (%), fixed-fee drag amortized against your real ticket size, cross-border uplift on the international portion of your GMV, terminal rental for in-store channels, and the composition of achievable rates (interchange + scheme fees + processor margin). Each channel — online and in-store — is benchmarked independently against the appropriate verified provider row.",
      },
      {
        q: "How accurate are estimates?",
        a: "Accuracy scales with the data you provide. Manual inputs produce a reliable directional estimate. Adding uploaded statements or connected tools tightens the range significantly. CAMBRA always shows you the confidence level of each finding.",
      },
      {
        q: "Why does CAMBRA ask these questions?",
        a: "Every question maps to a benchmark dimension. Revenue tier determines pricing leverage. Channel mix shifts which costs matter. Geography affects rates. The questionnaire is intentionally minimal — every field exists because it changes the analysis.",
      },
      {
        q: "Can I edit information later?",
        a: "Yes. Every analysis is stored and can be refined as you connect tools, upload invoices, or update inputs. The Analyzer is designed to evolve with your business.",
      },
    ],
  },
  // ── REMOVED 2026-07-12 (see CATEGORIES comment). Infrastructure Score
  // was a multi-vertical composite concept that doesn't exist in the
  // payments-only product. The 5 FAQs it held are gone rather than retoned.
  {
    category: "savings",
    title: "Savings & Optimization",
    items: [
      {
        q: "How does CAMBRA estimate savings?",
        a: "By computing the gap between your current cost structure and the benchmark for your tier, applied to your real volumes. Estimates are conservative by design — we'd rather underpromise and overdeliver.",
      },
      {
        q: "Are savings guaranteed?",
        a: "No platform can honestly guarantee savings sight-unseen. What CAMBRA guarantees is the analysis: structured, benchmarked, evidence-based, and ready to act on. Actual realized savings depend on execution.",
      },
      {
        q: "What happens after analysis?",
        a: "You receive a structured report: your per-channel effective rate, the benchmark for your cohort, the gap in basis points, and an estimated monthly and annual savings range. From there you can act independently on your provider, or use CAMBRA's optimization workflows.",
      },
      {
        q: "What is CAMBRA's success fee?",
        a: "When CAMBRA helps activate an optimization that produces verified savings, we share in those savings — typically 25% of the monthly delta, only on results that materialize. No savings, no fee.",
      },
      {
        q: "Do I pay upfront?",
        a: "No. The Analyzer, benchmarks, and gap reports are free during the Founding period. Optimization workflows are activated on a success-fee basis.",
      },
      {
        q: "What if no savings are found?",
        a: "You still walk away with a benchmarked picture of your card-payment costs and a clear read on where you stand vs. your cohort's floor rate. That visibility is the foundation of every future negotiation.",
      },
      {
        q: "Can CAMBRA optimize existing provider contracts?",
        a: "Yes — and most optimizations do exactly that. Renegotiation against benchmark evidence is faster, less disruptive, and often more impactful than switching.",
      },
    ],
  },
  {
    category: "benchmarks",
    title: "Benchmarks & Insights",
    items: [
      {
        q: "Where do benchmark ranges come from?",
        a: "CAMBRA maintains proprietary benchmark datasets built from anonymized analyzer data, provider pricing intelligence, and partner-shared signals — segmented by revenue tier, geography, channel mix and category.",
      },
      {
        q: "How often are benchmarks updated?",
        a: "Continuously. As more brands run analyses and connect data, the benchmark dataset tightens. Major revisions are published quarterly.",
      },
      {
        q: "Are benchmarks anonymized?",
        a: "Yes — always. Individual brand data is never exposed. Benchmarks are aggregated statistical models, designed to be useful without ever being identifying.",
      },
      {
        q: "How does CAMBRA compare businesses?",
        a: "By revenue tier, geography, channel mix, category, and stack composition. Two brands at the same scale but with different channel mixes are benchmarked differently — because their economics are different.",
      },
      {
        q: "What is considered 'optimized' infrastructure?",
        a: "Pricing within the top quartile of your peer group, no redundant tooling, no stranded contracts, and operational costs aligned with revenue scale. Most brands aren't there yet — and that's the point.",
      },
    ],
  },
  {
    category: "payments",
    title: "Payments Infrastructure",
    items: [
      {
        q: "What payment costs does CAMBRA analyze?",
        a: "Effective processing rates, interchange and scheme fees, FX costs, terminal economics for card-present, and provider-specific add-ons. We benchmark the all-in cost — not just headline rates.",
      },
      {
        q: "What's the network benchmark for payments?",
        a: "Depends on your tier and geography. EU brands above €1M typically benchmark at 1.4–1.8% effective rate. Brands above €10M can reach 1.1–1.4%. Card-present has separate benchmarks.",
      },
      {
        q: "Can CAMBRA analyze Stripe directly?",
        a: "Yes. Connecting Stripe gives CAMBRA read-only access to your true effective rate, volume mix, and fee breakdown — producing the sharpest possible benchmark.",
      },
      // ── M4-TPV Fase 3 (2026-07-12) — in-store FAQs.
      // Ordered so the "what happens to my invoices?" question sits BEFORE
      // the invoice-requirements one — a merchant reads them in the order
      // "do you audit my TPV → what would I have to give you → what would
      // you do with it", and pulling the trust-critical question last would
      // ambush them right before the upload step.
      {
        q: "Do you audit in-store card payments (TPV terminals)?",
        a: "Yes. The Analyzer covers both online (PSP) and in-store (TPV / physical terminal) card payments — same 60-second flow, pick your channel at the top. Public pricing is benchmarked verbatim for the four in-store providers we've verified in Europe (SumUp, Stripe Terminal, Smile & Pay, Zettle by PayPal); traditional bank acquirers (BNP, Crédit Agricole, Société Générale, BPCE, etc.) fall back to a regional average with a wider band, clearly labelled as an estimate. Combined mode analyzes both channels in one pass and shows a per-channel breakdown.",
      },
      {
        q: "What invoices do you need to verify my in-store rates?",
        a: "For an estimated audit — none. The Analyzer gives you a directional gap from your inputs alone (monthly GMV, average ticket, provider, country). To move from estimated to verified in-store, we'd need a monthly TPV provider statement showing: total fees for the period, processed volume, transaction count, and any separately listed fixed fees or terminal rental. PDF, Excel, or CSV — whatever your provider sends you. Verified in-store is currently in beta and rolling out to founding-cohort merchants; the estimated path is live for everyone today.",
      },
      {
        q: "What do you do with invoices I upload?",
        a: "Strict pipeline, no surprises: (1) files are encrypted in transit (TLS 1.3) and at rest (AES-256), stored on EU infrastructure; (2) processed by AI models (Anthropic + OpenAI cross-check) to extract structured cost fields — total fees, volume, ticket, provider terms — nothing else; (3) your files and extractions are scoped to your account only, never shared with third parties, never used to train provider or public models; (4) you can delete any uploaded file on request, and account deletion removes all uploads within 30 days per our retention policy. Full detail lives in the Privacy notice under 'AI-assisted processing' (Privacy §4).",
      },
    ],
  },
  {
    category: "shipping",
    title: "Shipping & Logistics",
    items: [
      {
        q: "What shipping costs does CAMBRA analyze?",
        a: "Cost per shipment, carrier mix, surcharges, fuel and remote-area fees, returns logistics, and 3PL fulfillment economics. Benchmarks are tier- and geography-adjusted.",
      },
      {
        q: "Can CAMBRA negotiate carrier contracts?",
        a: "CAMBRA surfaces the optimization opportunity and the benchmark evidence needed to renegotiate. Execution can be done independently or through CAMBRA's optimization workflows.",
      },
    ],
  },
  {
    category: "saas",
    title: "SaaS & Commerce Stack",
    items: [
      {
        q: "How does CAMBRA audit SaaS spend?",
        a: "By measuring your total SaaS-to-revenue ratio against tier benchmarks, then identifying redundancies, overlapping tools, and stranded subscriptions. Most brands overspend on SaaS by 25–35%.",
      },
      {
        q: "What's considered a healthy SaaS ratio?",
        a: "For commerce brands, typically 1.5–2.5% of revenue depending on tier. Brands above that range usually have stack drift — multiple tools doing similar jobs.",
      },
    ],
  },
  {
    category: "integrations",
    title: "Integrations & Connections",
    items: [
      {
        q: "Which integrations are supported?",
        a: "Payment providers first — Stripe is live today (read-only OAuth: balance transactions, charges, fee breakdown). PayPal, Mollie, Adyen, Checkout.com and Shopify Payments are on the near-term roadmap. Statement uploads (PDF / CSV / Excel) work for any provider today, including in-store TPV providers not on the connected list.",
      },
      {
        q: "Are integrations read-only?",
        a: "Yes — always. CAMBRA never modifies data in your connected systems. Every integration uses minimal read-only scopes, audited and revocable at any time.",
      },
      {
        q: "Does CAMBRA modify my systems?",
        a: "Never. CAMBRA reads, analyzes, and benchmarks. All actions on your stack happen on your side, under your control.",
      },
      {
        q: "What happens after connection?",
        a: "Your analysis automatically refines as fresh data flows in. Connected sources unlock tighter benchmarks, more granular optimization opportunities, and continuous monitoring.",
      },
    ],
  },
  {
    category: "uploads",
    title: "Uploads & Invoice Analysis",
    items: [
      {
        q: "Can I upload invoices?",
        a: "Yes. Upload monthly statements from your payment provider — PSP (Stripe, PayPal, Adyen, Mollie, Shopify Payments...) or in-store TPV (SumUp, Stripe Terminal, Zettle, traditional bank acquirer) — and CAMBRA extracts the relevant fields (total fees, volume, transaction count, fixed fees, terminal rental) automatically using AI.",
      },
      {
        q: "Which file formats are supported?",
        a: "PDF, CSV, Excel (.xls / .xlsx), and image formats (PNG, JPG). Maximum file size is 20MB per document.",
      },
      {
        q: "How does invoice analysis work?",
        a: "Uploaded statements are parsed for effective rates, processed volume, transaction counts, and any separately listed fixed fees or terminal rental. Extracted data feeds directly into your Analyzer, replacing form estimates with real measured numbers.",
      },
      {
        q: "Can I combine uploads with manual inputs?",
        a: "Yes. CAMBRA handles any combination of a connected Stripe account, uploaded statements from other providers, and form inputs — merging them into a single per-channel analysis.",
      },
    ],
  },
  {
    category: "security",
    title: "Data & Security",
    items: [
      {
        q: "Is my data secure?",
        a: "Yes. All data is encrypted in transit (TLS 1.3) and at rest (AES-256). Access is strictly role-scoped, audited, and never shared with third parties.",
      },
      {
        q: "Is CAMBRA GDPR compliant?",
        a: "Yes. CAMBRA is built GDPR-first: lawful basis for every processing operation, full data subject rights, EU-based infrastructure, and a documented retention policy.",
      },
      {
        q: "Who can access my information?",
        a: "Only you and the CAMBRA team members directly supporting your account. Internal access is logged, scoped, and reviewed.",
      },
      {
        q: "Does CAMBRA access funds?",
        a: "Never. CAMBRA has zero financial authority over your accounts, payments, or operations. We analyze data — we don't move money.",
      },
      {
        q: "Is uploaded data encrypted?",
        a: "Yes. All uploads are encrypted at rest and in transit. Original files can be deleted on request without affecting your analysis history.",
      },
      {
        q: "Can I delete my data?",
        a: "Yes — at any time, in full. Account deletion removes all personal and operational data within 30 days, in accordance with GDPR.",
      },
      {
        q: "Are benchmarks built from my data?",
        a: "Only in fully anonymized, aggregated form — and only with consent. Individual brand data is never identifiable in any benchmark output.",
      },
    ],
  },
  {
    category: "pricing",
    title: "Membership & Pricing",
    items: [
      {
        q: "Is CAMBRA free?",
        a: "Yes. The Analyzer, benchmarks and core insights are free during the Founding period. There's no credit card required to run a full audit.",
      },
      {
        q: "What's included in free access?",
        a: "Full card-payment analysis (online and in-store), your per-channel effective rate, the benchmark for your cohort, the gap in basis points, and an estimated monthly and annual savings range.",
      },
      {
        q: "What is CAMBRA Pro?",
        a: "CAMBRA Pro unlocks continuous monitoring, deeper integrations, optimization workflows, and access to negotiated network conditions. Pricing will be announced after the Founding period.",
      },
      {
        q: "What happens after the Founding period?",
        a: "Founding members keep their early benefits for the lifetime of their account. New brands joining later will follow standard pricing.",
      },
      {
        q: "Can I cancel anytime?",
        a: "Yes. CAMBRA has no lock-in. You can pause, downgrade, or close your account at any time without penalty.",
      },
    ],
  },
  {
    category: "troubleshooting",
    title: "Technical Troubleshooting",
    items: [
      {
        q: "My integration won't connect.",
        a: "First confirm the source account has admin or read-access permissions. If the issue persists, disconnect and reconnect, or contact support with the integration name and timestamp.",
      },
      {
        q: "My upload didn't parse correctly.",
        a: "Try re-uploading a cleaner version of the document. If extraction continues to fail, send the file to support — we'll process it manually and improve the model.",
      },
      {
        q: "My savings estimate seems off.",
        a: "The gap is most sensitive to your monthly GMV, average ticket, provider, country, and international share. Double-check those inputs first — a wrong avg ticket in particular can shift the fixed-fee drag significantly. If something still looks wrong after re-running with corrected inputs, contact support with your analysis ID.",
      },
    ],
  },
  {
    category: "legal",
    title: "Legal & Compliance",
    items: [
      {
        q: "Does CAMBRA sign mandates on my behalf?",
        a: "Only with explicit, scoped authorization. Every mandate is reviewed, signed digitally, and revocable. CAMBRA never acts outside the scope you authorize.",
      },
      {
        q: "Where is CAMBRA based?",
        a: "CAMBRA is a European company with infrastructure hosted in the EU, designed for GDPR compliance from day one.",
      },
    ],
  },
];

export const POPULAR = [
  { title: "How does CAMBRA estimate savings?", slug: "estimate-savings", category: "savings", read: "3 min" },
  { title: "Do you audit in-store card payments (TPV)?", slug: "in-store-audit", category: "payments", read: "2 min" },
  { title: "How accurate are benchmark estimates?", slug: "benchmark-accuracy", category: "benchmarks", read: "4 min" },
  { title: "Do I need to switch providers?", slug: "switching-providers", category: "savings", read: "3 min" },
  { title: "Is my data secure?", slug: "data-security", category: "security", read: "3 min" },
  { title: "How does CAMBRA make money?", slug: "business-model", category: "pricing", read: "2 min" },
];

export const TRENDING_SEARCHES = [
  "In-store TPV",
  "Stripe integration",
  "Benchmark accuracy",
  "Success fee",
  "Upload invoices",
  "GDPR",
];

// Get all FAQs flattened for search
export function getAllFAQs() {
  return FAQ_GROUPS.flatMap((g) =>
    g.items.map((item, idx) => ({
      ...item,
      category: g.category,
      groupTitle: g.title,
      id: `${g.category}-${idx}`,
    }))
  );
}

export function getFAQsByCategory(slug) {
  return FAQ_GROUPS.filter((g) => g.category === slug);
}

export function getCategory(slug) {
  return CATEGORIES.find((c) => c.slug === slug);
}