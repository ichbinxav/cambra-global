// CAMBRA Help Center — content & taxonomy
// Tone: sharp, intelligent, calm, infrastructure-native.

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
  {
    slug: "infrastructure-score",
    title: "Infrastructure Score",
    description: "Understand your stack maturity and efficiency.",
    icon: "Gauge",
    accent: "#1F4ED8",
  },
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
  {
    slug: "shipping",
    title: "Shipping & Logistics",
    description: "Carrier benchmarks and shipping economics.",
    icon: "Truck",
    accent: "#1F4ED8",
  },
  {
    slug: "saas",
    title: "SaaS & Commerce Stack",
    description: "Tooling redundancy and stack alignment.",
    icon: "Package",
    accent: "#2CA7C1",
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
        a: "CAMBRA is an infrastructure intelligence platform for modern commerce businesses. We analyze operating costs across payments, shipping, SaaS, insurance, telecom and banking — surface inefficiencies, benchmark performance, and reveal optimization opportunities hidden inside your operational stack.",
      },
      {
        q: "Who is CAMBRA built for?",
        a: "Modern commerce brands — DTC, omnichannel, marketplace-led — typically between €500K and €50M annual revenue, where infrastructure costs have grown faster than visibility. CAMBRA is designed for operators, founders and CFOs who suspect margin is leaking but lack a structured way to prove it.",
      },
      {
        q: "What kinds of costs does CAMBRA analyze?",
        a: "Payments processing, card-present terminals, shipping and logistics, SaaS subscriptions, commerce platform fees, banking and FX, business insurance, and increasingly telecom and operational infrastructure. Anything that can be measured, benchmarked, and optimized.",
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
        q: "What is the Infrastructure Analyzer?",
        a: "The Analyzer is CAMBRA's core engine. It audits your operating cost structure across multiple verticals, benchmarks each component against comparable brands, and produces an Infrastructure Score plus a list of optimization opportunities — typically in under 3 minutes.",
      },
      {
        q: "How does the Analyzer work?",
        a: "You answer a structured sequence of questions about revenue, channels, payments, shipping, SaaS, terminals and insurance. CAMBRA combines those inputs with benchmark datasets, provider pricing models, and operational heuristics to estimate where you stand vs. comparable infrastructure.",
      },
      {
        q: "What is analyzed?",
        a: "Payments effective rates, shipping cost per unit, SaaS spend ratios, terminal economics, insurance baselines, and stack-level coherence. Each vertical is benchmarked independently and then composed into your overall Infrastructure Score.",
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
  {
    category: "infrastructure-score",
    title: "Infrastructure Score",
    items: [
      {
        q: "What is the Infrastructure Score?",
        a: "A composite measure (0–100) of how efficient, coherent, and competitively priced your operational stack is — across payments, logistics, SaaS, and supporting infrastructure. It reflects maturity, not just cost.",
      },
      {
        q: "What does the score measure?",
        a: "Pricing competitiveness, infrastructure efficiency, operational optimization, tooling coherence, cost alignment, and stack maturity. A high score means your stack is performing close to the best-in-class benchmark for your tier.",
      },
      {
        q: "Is a low score bad?",
        a: "It means there's recoverable margin. Most brands score between 50 and 70 on first analysis. The score is a starting point — not a verdict.",
      },
      {
        q: "How are benchmark ranges calculated?",
        a: "From a continuously updated dataset of comparable commerce brands segmented by revenue tier, geography, channel mix and category. Each benchmark is statistically modeled — not anecdotal.",
      },
      {
        q: "Does the score account for my industry?",
        a: "Yes. Benchmarks adjust for category (fashion, beauty, food, tech, etc.), revenue tier, and channel mix — so the comparison is always against your real peer group.",
      },
    ],
  },
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
        a: "You receive a structured report: Infrastructure Score, vertical-by-vertical breakdown, and a prioritized list of optimization opportunities. From there you can act independently, or use CAMBRA's optimization workflows.",
      },
      {
        q: "What is CAMBRA's success fee?",
        a: "When CAMBRA helps activate an optimization that produces verified savings, we share in those savings — typically 25% of the monthly delta, only on results that materialize. No savings, no fee.",
      },
      {
        q: "Do I pay upfront?",
        a: "No. The Analyzer, Infrastructure Score, and benchmark reports are free during the Founding period. Optimization workflows are activated on a success-fee basis.",
      },
      {
        q: "What if no savings are found?",
        a: "You still walk away with a benchmarked Infrastructure Score and a clear picture of where your stack stands. That visibility is the foundation of every future decision.",
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
        a: "Stripe, Shopify, Adyen, QuickBooks, Xero, Pennylane, Holded, DHL, UPS, Sendcloud, Klaviyo, Gorgias, Mollie, PayPal, FedEx, DPD — with WooCommerce, Wix, Sage, Zendesk, Colissimo and PostNL on the roadmap.",
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
        a: "Yes. Upload statements from any provider — payments processors, carriers, SaaS vendors, banks — and CAMBRA extracts the relevant economics automatically using AI.",
      },
      {
        q: "Which file formats are supported?",
        a: "PDF, CSV, Excel (.xls / .xlsx), and image formats (PNG, JPG). Maximum file size is 20MB per document.",
      },
      {
        q: "How does invoice analysis work?",
        a: "Uploaded files are parsed for rates, volumes, line-item fees, and provider terms. Extracted data feeds directly into your Analyzer, replacing manual estimates with real numbers.",
      },
      {
        q: "Can I combine uploads with manual inputs?",
        a: "Absolutely. CAMBRA is designed to handle any combination of connected tools, uploaded statements, and manual entries — and intelligently merges them into a unified analysis.",
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
        a: "Yes. The Analyzer, Infrastructure Score, benchmarks and core insights are free during the Founding period. There's no credit card required to run a full audit.",
      },
      {
        q: "What's included in free access?",
        a: "Full infrastructure analysis, Infrastructure Score, vertical-by-vertical benchmarks, optimization opportunities, and access to the Insights library.",
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
        q: "My Infrastructure Score seems off.",
        a: "The score is most sensitive to revenue tier, channel mix and geography. Double-check those inputs first. If something still looks wrong, contact support with your analysis ID.",
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
  { title: "What is the Infrastructure Score?", slug: "infrastructure-score", category: "infrastructure-score", read: "2 min" },
  { title: "How accurate are benchmark estimates?", slug: "benchmark-accuracy", category: "benchmarks", read: "4 min" },
  { title: "Do I need to switch providers?", slug: "switching-providers", category: "savings", read: "3 min" },
  { title: "Is my data secure?", slug: "data-security", category: "security", read: "3 min" },
  { title: "How does CAMBRA make money?", slug: "business-model", category: "pricing", read: "2 min" },
];

export const TRENDING_SEARCHES = [
  "Infrastructure Score",
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