// DPA-1 (2026-08-16) — English master. Annex III of the DPA (/Dpa §7.1).
//
// SOURCE OF TRUTH, in this order:
//   1. src/content/legal/en/privacy.js §5 "Sub-processors" — the list CAMBRA
//      has already declared publicly. This page must never contradict it.
//   2. The code that actually calls each provider (paths cited per row).
//
// HONESTY RULES for this file — the whole point of the page:
//   - A row is CONFIRMED only when BOTH the public declaration and a real
//     call site exist. Anything else is PENDING_LEGAL_REVIEW.
//   - Never invent a corporate entity, a hosting region or a transfer
//     instrument. "Not published" is a valid, and better, answer than a guess.
//   - The second table lists providers found in the codebase that are NOT in
//     the declared sub-processor list because they serve CAMBRA's own
//     prospecting (CAMBRA as controller, not as the customer's processor).
//     They are shown, not hidden, and marked pending confirmation.
//
// `lastUpdated` is the reference date for the DPA's 30-day change notice
// (§7.2) — bump it deliberately whenever a row changes.

export default {
  badge: "Legal · Annex III",
  title: "Sub-processors.",
  version: "1.0",
  lastUpdated: "Last updated: 16 August 2026",
  back: "Back",
  intro: [
    {
      title: "1. What this page is",
      body: "This page is Annex III of the CAMBRA Data Processing Agreement. It lists the sub-processors CAMBRA engages to provide the service, the country of the contracting entity, what each one does and the mechanism relied on when personal data leaves the European Economic Area. Under Section 7.2 of the DPA, CAMBRA gives at least 30 days' notice before adding or replacing a sub-processor; the date above is the reference point for that notice.",
    },
    {
      title: "2. How to read the status column",
      body: "CONFIRMED means the provider is both publicly declared in our Privacy Policy and verifiably called by the platform. PENDING LEGAL REVIEW means we have not yet confirmed the specific point — typically the exact contracting entity, hosting region or transfer instrument. We publish those gaps rather than filling them with plausible-looking text: an unverified claim in a data protection document is worse than an acknowledged gap.",
    },
  ],
  columns: { name: "Provider", country: "Country", service: "Service", transfer: "Transfer mechanism", status: "Status" },
  tables: [
    {
      heading: "3. Sub-processors for the CAMBRA service",
      note: "Providers that process personal data on behalf of the customer, i.e. sub-processors within the meaning of Article 28(2) and (4) GDPR.",
      rows: [
        { name: "Base44 (Wix.com Ltd.)", country: "Israel (Wix.com Ltd.'s registered seat, operator of Base44) — data hosting region not published by the provider", service: "Application hosting, database, authentication and platform-delivered transactional email", transfer: "Base44's own DPA declares the EU-US Data Privacy Framework and EU Standard Contractual Clauses (Module 2/3) as the mechanism for transfers from EEA/Switzerland/UK. The provider does not publish hosting region or underlying cloud infrastructure — pending direct confirmation from Base44/Wix", status: "CONFIRMED — transfer instrument declared by the provider; hosting region pending direct confirmation" },
        { name: "Anthropic PBC", country: "United States", service: "AI processing — statement extraction, product intelligence and the in-app Copilot", transfer: "Provider's data processing agreement (Standard Contractual Clauses) — specific instrument pending review", status: "CONFIRMED" },
        { name: "OpenAI", country: "United States", service: "AI extraction cross-check (second independent reader of uploaded statements)", transfer: "Provider's data processing agreement (Standard Contractual Clauses) — specific instrument pending review", status: "CONFIRMED" },
        { name: "Resend, Inc.", country: "United States", service: "Email delivery and inbound email routing", transfer: "Provider's data processing agreement (Standard Contractual Clauses) — specific instrument pending review", status: "CONFIRMED" },
        { name: "Stripe Payments Europe Ltd.", country: "Ireland", service: "Payment processing for CAMBRA's own success-fee billing; read-only access to the customer's own connected Stripe account when the customer authorises it", transfer: "Within the EEA for the contracting entity; onward transfers governed by Stripe's own agreement", status: "CONFIRMED" },
      ],
    },
    {
      heading: "4. Other providers — CAMBRA's own operations",
      note: "These providers appear in the platform's codebase but are NOT declared sub-processors of the customer service: they support CAMBRA's own prospecting and market research, where CAMBRA acts as controller of its own business contact data rather than as the customer's processor. They are listed here for transparency and their classification is pending legal confirmation.",
      rows: [
        { name: "Microsoft (Graph / Outlook)", country: "Pending confirmation", service: "CAMBRA's own business mailbox — outbound and inbound commercial correspondence", transfer: "Pending legal review", status: "PENDING LEGAL REVIEW" },
        { name: "Instantly", country: "Pending confirmation", service: "CAMBRA's outbound commercial campaigns to prospects", transfer: "Pending legal review", status: "PENDING LEGAL REVIEW" },
        { name: "Apollo", country: "Pending confirmation", service: "Business contact discovery and enrichment for CAMBRA's own prospecting", transfer: "Pending legal review", status: "PENDING LEGAL REVIEW" },
        { name: "Perplexity", country: "Pending confirmation", service: "Public market and provider research (payment-provider pricing pages, competitor monitoring)", transfer: "Pending legal review", status: "PENDING LEGAL REVIEW" },
      ],
    },
  ],
  outro: [
    {
      title: "5. Objecting to a sub-processor",
      body: "Under Section 7.2 of the DPA you may object, on reasonable grounds relating to data protection, to any addition or replacement announced here. Write to privacy@cambra.global within the notice period. If the objection cannot be resolved, either party may terminate the affected part of the service.",
    },
    {
      title: "6. Contact",
      body: "For any question about this list, the transfer mechanisms or the underlying agreements: privacy@cambra.global.",
    },
  ],
};
