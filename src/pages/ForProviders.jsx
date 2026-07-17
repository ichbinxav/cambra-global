// ForProviders v2 — provider program page.
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
// Visual language mirrors Terms/Privacy/Cookies (dark navy gradient +
// glass-panel + cyan accent + Space Grotesk headers). CTA points to
// contact@cambra.global — no form, matches the rest of the platform's
// contact convention.

import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import {
  ArrowLeft, ArrowRight, ShieldCheck, Sparkles, LinkIcon, Search,
  Handshake, CheckCircle2, Globe, Mail,
} from "lucide-react";
import Navbar from "@/components/landing/Navbar";

// ── Tier cards data ─────────────────────────────────────────────────
// Kept inline (single-language on purpose — same convention as Landing's
// step cards). Copy is deliberately concrete about the requirements/
// benefits without publishing commercial terms (%, exclusive rates)
// — those live in a signed agreement, not on a marketing page.

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

function TierCard({ tier, accent }) {
  const isPartner = accent === "partner";
  return (
    <motion.article
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
      className="relative overflow-hidden rounded-2xl p-6 sm:p-8"
      style={{
        background: isPartner
          ? "radial-gradient(120% 100% at 100% 0%, rgba(34,211,238,0.10) 0%, transparent 60%), rgba(255,255,255,0.03)"
          : "rgba(255,255,255,0.03)",
        border: isPartner
          ? "1px solid rgba(34,211,238,0.22)"
          : "1px solid rgba(255,255,255,0.10)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        boxShadow: isPartner
          ? "0 30px 80px -30px rgba(0,0,0,0.6), 0 0 60px -20px rgba(34,211,238,0.16)"
          : "0 30px 80px -30px rgba(0,0,0,0.6)",
      }}
    >
      <div className="mb-5 flex items-center gap-2">
        <span
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold tracking-[0.22em] uppercase"
          style={{
            background: isPartner ? "rgba(34,211,238,0.10)" : "rgba(255,255,255,0.04)",
            border: isPartner
              ? "1px solid rgba(34,211,238,0.30)"
              : "1px solid rgba(255,255,255,0.10)",
            color: isPartner ? "rgba(103,232,249,0.95)" : "rgba(255,255,255,0.55)",
          }}
        >
          {tier.eyebrow}
        </span>
      </div>

      <h3
        className="text-white mb-2"
        style={{
          fontFamily: "'Space Grotesk', 'Inter', sans-serif",
          fontSize: "clamp(28px, 3.5vw, 40px)",
          fontWeight: 900,
          letterSpacing: "-0.035em",
          lineHeight: 1.02,
        }}
      >
        {tier.title}
      </h3>
      <p className="text-[15px] font-semibold text-white/80 mb-4">{tier.tagline}</p>
      <p className="text-[14px] leading-relaxed text-white/60 mb-8">{tier.intro}</p>

      <div className="mb-8">
        <p className="text-[10px] font-bold tracking-[0.22em] uppercase text-white/40 mb-3">
          What you bring
        </p>
        <ul className="space-y-3">
          {tier.requirements.map((r) => (
            <li key={r.title} className="flex gap-3">
              <div
                className="h-8 w-8 rounded-lg shrink-0 flex items-center justify-center"
                style={{
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.10)",
                }}
              >
                <r.icon size={13} className="text-white/70" />
              </div>
              <div className="min-w-0">
                <p className="text-[13px] font-semibold text-white/95">{r.title}</p>
                <p className="text-[12.5px] text-white/55 leading-relaxed">{r.body}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div className="mb-6">
        <p className="text-[10px] font-bold tracking-[0.22em] uppercase text-white/40 mb-3">
          What CAMBRA delivers
        </p>
        <ul className="space-y-3">
          {tier.benefits.map((b) => (
            <li key={b.title} className="flex gap-3">
              <div
                className="h-8 w-8 rounded-lg shrink-0 flex items-center justify-center"
                style={{
                  background: isPartner ? "rgba(34,211,238,0.10)" : "rgba(255,255,255,0.04)",
                  border: isPartner
                    ? "1px solid rgba(34,211,238,0.25)"
                    : "1px solid rgba(255,255,255,0.10)",
                }}
              >
                <b.icon size={13} className={isPartner ? "text-cyan-300" : "text-white/70"} />
              </div>
              <div className="min-w-0">
                <p className="text-[13px] font-semibold text-white/95">{b.title}</p>
                <p className="text-[12.5px] text-white/55 leading-relaxed">{b.body}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div
        className="pt-5 mt-2"
        style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}
      >
        <p className="text-[10px] font-bold tracking-[0.22em] uppercase text-white/40 mb-1">
          Commercial
        </p>
        <p className="text-[13px] text-white/70">{tier.cost}</p>
      </div>
    </motion.article>
  );
}

export default function ForProviders() {
  return (
    <div
      className="relative min-h-screen font-inter overflow-hidden text-white"
      style={{
        background:
          "linear-gradient(180deg, #0a0a0a 0%, #0b0e1a 22%, #0a0d18 48%, #0b1020 72%, #0E0E1A 100%)",
      }}
    >
      <Navbar />

      {/* Ambient grid (same treatment as Terms/Privacy) */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px)",
          backgroundSize: "56px 56px",
          opacity: 0.35,
          maskImage: "radial-gradient(ellipse 90% 80% at 50% 30%, #000 35%, transparent 100%)",
          WebkitMaskImage: "radial-gradient(ellipse 90% 80% at 50% 30%, #000 35%, transparent 100%)",
        }}
      />
      {/* Ambient halo behind hero */}
      <div
        aria-hidden
        className="pointer-events-none fixed"
        style={{
          width: 700, height: 700, left: "50%", top: 100, transform: "translateX(-50%)",
          background: "radial-gradient(circle, rgba(59,130,246,0.14) 0%, transparent 70%)",
          filter: "blur(80px)",
        }}
      />

      <div className="relative max-w-5xl mx-auto px-6 pt-24 pb-20">
        <Link to="/">
          <button className="mb-8 -ml-2 h-8 text-xs rounded-full px-3 text-white/60 hover:text-white hover:bg-white/5 inline-flex items-center transition-colors">
            <ArrowLeft size={13} className="mr-1.5" /> Back
          </button>
        </Link>

        {/* Hero */}
        <motion.section
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          className="mb-16 max-w-3xl"
        >
          <div
            className="inline-flex items-center gap-2 mb-6 px-2.5 py-1.5 rounded-full backdrop-blur-sm"
            style={{ border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.03)" }}
          >
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full rounded-full bg-cyan-300 opacity-75 animate-ping" />
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-cyan-300" />
            </span>
            <span className="text-[10px] font-semibold tracking-[0.22em] uppercase text-white/60">
              For payment providers
            </span>
          </div>

          <h1
            className="mb-5 text-white"
            style={{
              fontFamily: "'Space Grotesk', 'Inter', sans-serif",
              fontSize: "clamp(38px, 6.5vw, 76px)",
              fontWeight: 900,
              letterSpacing: "-0.045em",
              lineHeight: 0.94,
            }}
          >
            Merchants are comparing you{" "}
            {/* DA v1.1 Chunk 1c — Rule 1: single keyword. "right now." is the
                urgency/tension → .kw-c (Coral Gap). */}
            <span className="kw-c">right now.</span>
            <br />
            Be the answer.
          </h1>

          <p className="text-[16px] leading-relaxed text-white/60 max-w-2xl">
            CAMBRA runs a payments audit for independent brands — online and in-store. Every audit compares the merchant's current effective rate against the best publicly contractable alternative for their region and ticket size. If your pricing is public, we can cite it. If you'll offer an exclusive rate through us, we can present it.
          </p>
        </motion.section>

        {/* Tier cards */}
        <section className="mb-16">
          <div className="mb-8">
            <p className="text-[10px] font-bold tracking-[0.22em] uppercase text-white/40 mb-2">
              Two ways to work with us
            </p>
            <h2
              className="text-white"
              style={{
                fontFamily: "'Space Grotesk', 'Inter', sans-serif",
                fontSize: "clamp(28px, 3.8vw, 44px)",
                fontWeight: 900,
                letterSpacing: "-0.035em",
                lineHeight: 1.02,
              }}
            >
              Listed, or Partner.
            </h2>
            <p className="mt-3 text-[14px] text-white/55 max-w-2xl">
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
            <p className="text-[10px] font-bold tracking-[0.22em] uppercase text-white/40 mb-2">
              Where we won't compromise
            </p>
            <h2
              className="text-white"
              style={{
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
                className="rounded-xl p-5"
                style={{
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(255,255,255,0.08)",
                }}
              >
                <div className="mb-3 flex items-center gap-2">
                  <ShieldCheck size={14} className="text-cyan-300/85" />
                  <span className="text-[10px] font-bold tracking-[0.22em] uppercase text-white/45">
                    Rule {i + 1}
                  </span>
                </div>
                <p className="text-[14px] font-semibold text-white/95 mb-2 leading-tight">
                  {g.title}
                </p>
                <p className="text-[12.5px] text-white/55 leading-relaxed">{g.body}</p>
              </motion.div>
            ))}
          </div>
        </section>

        {/* CTA */}
        <motion.section
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className="relative overflow-hidden rounded-2xl p-6 sm:p-10 text-center"
          style={{
            background:
              "radial-gradient(120% 100% at 50% 0%, rgba(31,78,216,0.15) 0%, transparent 60%), rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.10)",
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
          }}
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
    </div>
  );
}