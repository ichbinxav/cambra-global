// ForProviders v2 — provider program page. PAPER-FIRST (Chunk 1d).
//
// Two-tier model:
//   Nivel 1 · Listed → provider publishes public pricing → enters CAMBRA's
//     achievable benchmark (PaymentsRateTable, verified=true, source_url +
//     source_quote citable). Auditability rule non-negotiable.
//   Nivel 2 · Partner → provider offers an EXCLUSIVE rate for merchants
//     arriving via CAMBRA (better than public) + referral agreement. Shown
//     on /Results as a labeled "CAMBRA exclusive offer" — NEVER folded into
//     the public benchmark. Benchmark stays 100% public and auditable.
//
// This page has ZERO fabricated network figures (no "X merchants
// connected"). If we need social proof we say "founding cohort in progress".
//
// Visual language: paper canvas + white cards + one authorized ink block
// for the closing CTA (.section-ink). Mirrors the approved Landing.

import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import {
  ArrowLeft, ArrowRight, ShieldCheck, Sparkles, LinkIcon, Search,
  Handshake, CheckCircle2, Globe, Mail,
} from "lucide-react";
import PublicPageShell from "@/components/shared/PublicPageShell";
import PublicPageHero from "@/components/shared/PublicPageHero";
import SectionLabel from "@/components/shared/SectionLabel";

// ── Tier cards data ─────────────────────────────────────────────────

const LISTED_TIER = {
  eyebrow: "Tier 1",
  title: "Listed",
  tagline: "Public pricing → enters our benchmark.",
  intro:
    "If your card-payment pricing is public and citable, you belong in our achievable benchmark. Every audit CAMBRA runs compares the merchant's current effective rate against the best publicly contractable rate for their region and ticket size — and the winner surfaces by name.",
  requirements: [
    {
      icon: Globe,
      title: "Public pricing page",
      body: "A live URL we can quote verbatim (percent + fixed fee + any monthly rental). No unlisted deals, no ‘call for quote'.",
    },
    {
      icon: ShieldCheck,
      title: "Card-payment coverage",
      body: "Online PSP, in-store TPV, or both. Any region we cover (EU, UK, US, RoW).",
    },
    {
      icon: LinkIcon,
      title: "Point of contact",
      body: "A single email we can reach to notify you of pricing changes we detect on our side.",
    },
  ],
  benefits: [
    {
      icon: Search,
      title: "Visibility to comparing merchants",
      body: "When a merchant of your ICP runs the audit, our engine evaluates your rate at their real ticket size. If you win, your name appears in their result as the achievable anchor.",
    },
    {
      icon: CheckCircle2,
      title: "Audit trail on every citation",
      body: "Every time we anchor to you, the source URL and verbatim quote we're using is one click away. No misquoting, no stale pricing.",
    },
  ],
  cost: "No fee. No exclusivity. No commitment.",
};

const PARTNER_TIER = {
  eyebrow: "Tier 2",
  title: "Partner",
  tagline: "Exclusive rate for CAMBRA-referred merchants.",
  intro:
    "If you want more than passive visibility, we can bring you qualified deal-flow. Partner providers offer an exclusive rate — better than your public pricing — reserved for merchants who arrive through CAMBRA with a measured gap and clear intent to switch. In exchange, we agree on a referral structure.",
  requirements: [
    {
      icon: Sparkles,
      title: "An exclusive rate we can present",
      body: "A discount off your public pricing — percent points, fixed-fee waiver, monthly rental waiver, or any combination. Terms formalized in a signed agreement, not this page.",
    },
    {
      icon: Handshake,
      title: "Referral agreement",
      body: "A written arrangement covering how introductions are handled, how activations are counted, and how compensation flows. Specifics are negotiated per partner.",
    },
    {
      icon: LinkIcon,
      title: "Named operational contact",
      body: "Someone on your side to receive warm handovers and close them — not a generic sales inbox.",
    },
  ],
  benefits: [
    {
      icon: Search,
      title: "Qualified acquisition channel",
      body: "Merchants who reach you already know their current effective rate to the basis point, already know your public pricing, and already know the exclusive rate you're offering. Every conversation starts pre-qualified.",
    },
    {
      icon: CheckCircle2,
      title: "Featured on the results page — labeled exclusive",
      body: "When we present your Partner rate to a merchant, it appears in a dedicated ‘CAMBRA exclusive offer' slot — visually separate from the public benchmark, unambiguously labeled as an offer only available through us.",
    },
  ],
  cost: "Commercial terms per signed agreement. Never published on this page.",
};

// ── Guardrails card — what CAMBRA WILL NOT compromise on ─────────────

const GUARDRAILS = [
  {
    title: "The benchmark stays public.",
    body: "The achievable rates CAMBRA publishes come from public pricing pages, cited verbatim, with a source URL on every row. A Partner's exclusive rate is NEVER mixed into that benchmark — it's presented separately, labeled as exclusive.",
  },
  {
    title: "Recommendations follow the merchant's interest.",
    body: "Our engine picks the achievable anchor by minimum effective cost at the merchant's ticket size, evaluated across every eligible verified provider. A Partner doesn't get preferential ranking — they get a dedicated slot with their exclusive terms.",
  },
  {
    title: "Any interested provider gets the same door.",
    body: "One email address, one process, same terms. No back-channel deals, no unlisted incumbents.",
  },
];

// Shared paper card style — white, --linea border, radius 14, spec shadow.
const CARD_STYLE = {
  background: "#FFFFFF",
  border: "1px solid var(--linea)",
  borderRadius: 14,
  boxShadow: "0 8px 24px rgba(12,12,22,.06)",
};

function TierCard({ tier, accent }) {
  const isPartner = accent === "partner";
  return (
    <motion.article
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
      className="relative overflow-hidden p-6 sm:p-8"
      style={{
        ...CARD_STYLE,
        border: isPartner ? "1px solid rgba(58,43,176,0.30)" : "1px solid var(--linea)",
        boxShadow: isPartner
          ? "0 8px 24px rgba(12,12,22,.06), 0 0 40px -18px rgba(58,43,176,0.22)"
          : "0 8px 24px rgba(12,12,22,.06)",
      }}
    >
      <div className="mb-5 flex items-center gap-2">
        <SectionLabel
          style={
            isPartner
              ? { background: "rgba(58,43,176,0.06)", color: "var(--voltio)", border: "1px solid rgba(58,43,176,0.20)" }
              : undefined
          }
        >
          {tier.eyebrow}
        </SectionLabel>
      </div>

      <h3
        className="mb-2"
        style={{
          color: "var(--ink)",
          fontFamily: "'Space Grotesk', 'Inter', sans-serif",
          fontSize: "clamp(28px, 3.5vw, 40px)",
          fontWeight: 900,
          letterSpacing: "-0.035em",
          lineHeight: 1.02,
        }}
      >
        {tier.title}
      </h3>
      <p className="text-[15px] font-semibold mb-4" style={{ color: "var(--ink)" }}>{tier.tagline}</p>
      <p className="text-[14px] leading-relaxed mb-8" style={{ color: "var(--gris-1)" }}>{tier.intro}</p>

      <div className="mb-8">
        <p className="text-[10px] font-bold tracking-[0.22em] uppercase mb-3" style={{ color: "var(--gris-2)" }}>
          What you bring
        </p>
        <ul className="space-y-3">
          {tier.requirements.map((r) => (
            <li key={r.title} className="flex gap-3">
              <div
                className="h-8 w-8 rounded-lg shrink-0 flex items-center justify-center"
                style={{ background: "rgba(12,12,22,0.04)", border: "1px solid var(--linea)" }}
              >
                <r.icon size={13} style={{ color: "var(--gris-1)" }} />
              </div>
              <div className="min-w-0">
                <p className="text-[13px] font-semibold" style={{ color: "var(--ink)" }}>{r.title}</p>
                <p className="text-[12.5px] leading-relaxed" style={{ color: "var(--gris-1)" }}>{r.body}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div className="mb-6">
        <p className="text-[10px] font-bold tracking-[0.22em] uppercase mb-3" style={{ color: "var(--gris-2)" }}>
          What CAMBRA delivers
        </p>
        <ul className="space-y-3">
          {tier.benefits.map((b) => (
            <li key={b.title} className="flex gap-3">
              <div
                className="h-8 w-8 rounded-lg shrink-0 flex items-center justify-center"
                style={{
                  background: isPartner ? "rgba(58,43,176,0.06)" : "rgba(12,12,22,0.04)",
                  border: isPartner ? "1px solid rgba(58,43,176,0.20)" : "1px solid var(--linea)",
                }}
              >
                <b.icon size={13} style={{ color: isPartner ? "var(--voltio)" : "var(--gris-1)" }} />
              </div>
              <div className="min-w-0">
                <p className="text-[13px] font-semibold" style={{ color: "var(--ink)" }}>{b.title}</p>
                <p className="text-[12.5px] leading-relaxed" style={{ color: "var(--gris-1)" }}>{b.body}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div className="pt-5 mt-2" style={{ borderTop: "1px solid var(--linea)" }}>
        <p className="text-[10px] font-bold tracking-[0.22em] uppercase mb-1" style={{ color: "var(--gris-2)" }}>
          Commercial
        </p>
        <p className="text-[13px]" style={{ color: "var(--gris-1)" }}>{tier.cost}</p>
      </div>
    </motion.article>
  );
}

export default function ForProviders() {
  return (
    <PublicPageShell>
      <PublicPageHero
        eyebrow="For payment providers"
        align="left"
        title={<>Merchants are comparing you <span className="kw-c">right now.</span><br />Be the answer.</>}
        subtitle="CAMBRA runs a payments audit for independent brands — online and in-store. Every audit compares the merchant's current effective rate against the best publicly contractable alternative for their region and ticket size. If your pricing is public, we can cite it. If you'll offer an exclusive rate through us, we can present it."
      />

      <div className="relative max-w-5xl mx-auto px-6 pt-14 pb-20">
        <Link to="/">
          <button
            className="mb-10 -ml-2 h-8 text-xs rounded-full px-3 inline-flex items-center transition-colors"
            style={{ color: "var(--gris-1)" }}
          >
            <ArrowLeft size={13} className="mr-1.5" /> Back
          </button>
        </Link>

        {/* Tier cards */}
        <section className="mb-16">
          <div className="mb-8">
            <p className="text-[10px] font-bold tracking-[0.22em] uppercase mb-2" style={{ color: "var(--gris-2)" }}>
              Two ways to work with us
            </p>
            <h2
              style={{
                color: "var(--ink)",
                fontFamily: "'Space Grotesk', 'Inter', sans-serif",
                fontSize: "clamp(28px, 3.8vw, 44px)",
                fontWeight: 900,
                letterSpacing: "-0.035em",
                lineHeight: 1.02,
              }}
            >
              Listed, or Partner.
            </h2>
            <p className="mt-3 text-[14px] max-w-2xl" style={{ color: "var(--gris-1)" }}>
              Two levels of engagement. One protects our benchmark's public integrity; the other opens a qualified acquisition channel. Both are opt-in, both are transparent about what they cost and what they deliver.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <TierCard tier={LISTED_TIER} accent="listed" />
            <TierCard tier={PARTNER_TIER} accent="partner" />
          </div>
        </section>

        {/* Guardrails */}
        <section className="mb-16">
          <div className="mb-6">
            <p className="text-[10px] font-bold tracking-[0.22em] uppercase mb-2" style={{ color: "var(--gris-2)" }}>
              Where we won't compromise
            </p>
            <h2
              style={{
                color: "var(--ink)",
                fontFamily: "'Space Grotesk', 'Inter', sans-serif",
                fontSize: "clamp(24px, 3vw, 36px)",
                fontWeight: 900,
                letterSpacing: "-0.035em",
                lineHeight: 1.05,
              }}
            >
              Three rules, non-negotiable.
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {GUARDRAILS.map((g, i) => (
              <motion.div
                key={g.title}
                initial={{ opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-60px" }}
                transition={{ duration: 0.5, delay: i * 0.08, ease: [0.22, 1, 0.36, 1] }}
                className="p-5"
                style={CARD_STYLE}
              >
                <div className="mb-3 flex items-center gap-2">
                  <ShieldCheck size={14} style={{ color: "var(--voltio)" }} />
                  <span className="text-[10px] font-bold tracking-[0.22em] uppercase" style={{ color: "var(--gris-2)" }}>
                    Rule {i + 1}
                  </span>
                </div>
                <p className="text-[14px] font-semibold mb-2 leading-tight" style={{ color: "var(--ink)" }}>
                  {g.title}
                </p>
                <p className="text-[12.5px] leading-relaxed" style={{ color: "var(--gris-1)" }}>{g.body}</p>
              </motion.div>
            ))}
          </div>
        </section>

        {/* CTA — the ONE authorized ink block on this page. */}
        <motion.section
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className="section-ink p-6 sm:p-10 text-center"
        >
          <p className="text-[10px] font-bold tracking-[0.22em] uppercase text-cyan-300/90 mb-3">
            Talk to us
          </p>
          <h2
            className="text-white mb-3"
            style={{
              fontFamily: "'Space Grotesk', 'Inter', sans-serif",
              fontSize: "clamp(26px, 3.5vw, 40px)",
              fontWeight: 900,
              letterSpacing: "-0.035em",
              lineHeight: 1.05,
            }}
          >
            One email is enough.
          </h2>
          <p className="text-[14px] text-white/60 mb-6 max-w-xl mx-auto leading-relaxed">
            Tell us which tier fits — Listed if your pricing is already public, Partner if you want to open an exclusive channel. We'll come back with the specifics and the next steps.
          </p>
          <a
            href="mailto:contact@cambra.global?subject=Provider%20program%20%E2%80%94%20CAMBRA"
            className="inline-flex items-center gap-2 rounded-full bg-white text-black px-7 py-3.5 font-bold text-[14px] transition-shadow hover:shadow-xl"
            style={{
              boxShadow:
                "0 0 0 1px rgba(255,255,255,0.1), 0 20px 50px -20px rgba(34,211,238,0.55), 0 0 40px rgba(34,211,238,0.22)",
            }}
          >
            <Mail size={15} />
            contact@cambra.global
            <ArrowRight size={15} />
          </a>
          <p className="mt-5 text-[11px] text-white/35">
            Founding cohort in progress. We reply within two working days.
          </p>
        </motion.section>
      </div>
    </PublicPageShell>
  );
}