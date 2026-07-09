// PaymentsAnalyzer — Chunk 5 upgrade.
//
// Payload contract (mirrors submitPaymentsAnalysis §2.1):
//   monthly_gmv_eur         500 .. 10_000_000  (required)
//   avg_ticket_eur          5   .. 5_000       (required)
//   intl_pct                0   .. 100         (required; 0 valid)
//   provider_slug           enum, exact order below (required)
//   country                 ISO-3166-1 alpha-2 (required)
//   brand_name              2-80 chars         (required — lead intelligence)
//   card_mix_debit_pct      0   .. 100         (optional)
//   website                 URL-ish, ≤200 chars (optional)
//   sector                  enum (see BrandBlock.SECTOR_OPTIONS) (optional)
//
// UX changes only. NO business logic changes: same validation ranges, same
// payload shape, same enum in the same order. Every slider produces a value
// that lives inside the contract by construction — no clamping needed.

import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import Navbar from "@/components/landing/Navbar";
import { ArrowRight, ArrowLeft, Loader2, AlertTriangle, Lock, ChevronDown, ChevronUp } from "lucide-react";

import GmvSlider       from "@/components/paymentsAnalyzer/GmvSlider";
import AvgTicketInput  from "@/components/paymentsAnalyzer/AvgTicketInput";
import IntlSlider      from "@/components/paymentsAnalyzer/IntlSlider";
import ProviderGrid    from "@/components/paymentsAnalyzer/ProviderGrid";
import CardMixSlider   from "@/components/paymentsAnalyzer/CardMixSlider";
import BrandBlock, { BRAND_SECTOR_SLUGS } from "@/components/paymentsAnalyzer/BrandBlock";

// ── Provider enum — VERBATIM copy of ALLOWED_PROVIDER_SLUGS in
//    submitPaymentsAnalysis/entry.ts. Order matters (product decision).
//    Verified rows first (stripe/paypal/shopify_payments), fallback-only
//    providers after. DO NOT reorder or rename.
const PROVIDER_OPTIONS = [
  { slug: "stripe",           label: "Stripe" },
  { slug: "paypal",           label: "PayPal" },
  { slug: "shopify_payments", label: "Shopify Payments" },
  { slug: "adyen",            label: "Adyen" },
  { slug: "mollie",           label: "Mollie" },
  { slug: "checkout_com",     label: "Checkout.com" },
  { slug: "sumup",            label: "SumUp" },
  { slug: "other",            label: "Other" },
];

// ── Country list — kept short and payments-relevant. Backend uses country
//    only to derive region (EU/UK/US/RoW).
const COUNTRY_OPTIONS = [
  { code: "ES", name: "Spain" },        { code: "FR", name: "France" },
  { code: "DE", name: "Germany" },      { code: "IT", name: "Italy" },
  { code: "PT", name: "Portugal" },     { code: "NL", name: "Netherlands" },
  { code: "BE", name: "Belgium" },      { code: "IE", name: "Ireland" },
  { code: "AT", name: "Austria" },      { code: "SE", name: "Sweden" },
  { code: "DK", name: "Denmark" },      { code: "FI", name: "Finland" },
  { code: "PL", name: "Poland" },       { code: "CZ", name: "Czech Republic" },
  { code: "GR", name: "Greece" },       { code: "LU", name: "Luxembourg" },
  { code: "NO", name: "Norway" },       { code: "CH", name: "Switzerland" },
  { code: "GB", name: "United Kingdom" },
  { code: "US", name: "United States" },
  { code: "CA", name: "Canada" },       { code: "AU", name: "Australia" },
];

// ── Contract §2.1 hard ranges — mirror of backend VALIDATION. UX-only guard.
const RANGES = {
  monthly_gmv_eur:    { min: 500, max: 10_000_000, label: "Monthly GMV (EUR)" },
  avg_ticket_eur:     { min: 5,   max: 5_000,      label: "Average ticket (EUR)" },
  intl_pct:           { min: 0,   max: 100,        label: "International %" },
  card_mix_debit_pct: { min: 0,   max: 100,        label: "Debit card share (%)" },
};

function fieldRangeError(key, value) {
  const r = RANGES[key];
  const n = Number(value);
  if (!isFinite(n)) return `${r.label}: enter a number.`;
  if (n < r.min || n > r.max) {
    return `${r.label}: must be between ${r.min.toLocaleString("en-US")} and ${r.max.toLocaleString("en-US")}.`;
  }
  return null;
}

export default function PaymentsAnalyzer() {
  const navigate = useNavigate();

  const [gmv, setGmv]                   = useState("");
  const [avgTicket, setAvgTicket]       = useState("");
  const [intlPct, setIntlPct]           = useState("");
  const [providerSlug, setProviderSlug] = useState("");
  const [country, setCountry]           = useState("");
  const [cardMixOpen, setCardMixOpen]   = useState(false);
  const [cardMixDebit, setCardMixDebit] = useState("");
  // ── About your brand (required: name; optional: website, sector) ──────
  const [brandName, setBrandName]       = useState("");
  const [website, setWebsite]           = useState("");
  const [sector, setSector]             = useState("");

  const [submitting, setSubmitting]   = useState(false);
  const [errorBanner, setErrorBanner] = useState("");

  // ── Client-side validation — same ranges + fields as the backend.
  const validation = useMemo(() => {
    const errors = [];
    if (gmv === "") errors.push("Monthly GMV is required.");
    else { const e = fieldRangeError("monthly_gmv_eur", gmv); if (e) errors.push(e); }

    if (avgTicket === "") errors.push("Average ticket is required.");
    else { const e = fieldRangeError("avg_ticket_eur", avgTicket); if (e) errors.push(e); }

    if (intlPct === "") errors.push("International share is required (0% is valid).");
    else { const e = fieldRangeError("intl_pct", intlPct); if (e) errors.push(e); }

    if (!providerSlug) errors.push("Payment provider is required.");
    if (!country) errors.push("Country is required.");

    // Brand name — required (2-80 chars, same range as backend).
    const trimmedBrand = brandName.trim();
    if (trimmedBrand === "") errors.push("Brand name is required.");
    else if (trimmedBrand.length < 2 || trimmedBrand.length > 80) {
      errors.push("Brand name: must be between 2 and 80 characters.");
    }

    // Website — optional; light URL sanity check only (backend does the
    // authoritative normalization). Reject only obvious garbage like spaces
    // or missing domain dot; leave real validation to the server so we don't
    // block users on edge-case TLDs.
    if (website.trim() !== "") {
      const w = website.trim();
      if (/\s/.test(w) || !/\./.test(w)) {
        errors.push("Website: enter a domain like aimestudio.com.");
      } else if (w.length > 200) {
        errors.push("Website: must be 200 characters or fewer.");
      }
    }

    // Sector — optional; if set, must be in the shared enum.
    if (sector !== "" && !BRAND_SECTOR_SLUGS.includes(sector)) {
      errors.push("Sector: pick one of the listed options.");
    }

    if (cardMixDebit !== "") {
      const e = fieldRangeError("card_mix_debit_pct", cardMixDebit);
      if (e) errors.push(e);
    }

    return { valid: errors.length === 0, errors };
  }, [gmv, avgTicket, intlPct, providerSlug, country, cardMixDebit, brandName, website, sector]);

  // ── Progress counter — 6 required fields (5 payment + brand name) plus 1
  //    optional (card mix) when the drawer is open. Website and sector are
  //    intentionally NOT counted so the pill doesn't nag users into filling
  //    optional fields.
  const progress = useMemo(() => {
    const filled = [gmv, avgTicket, intlPct, providerSlug, country].filter((v) => v !== "" && v !== undefined && v !== null).length;
    const brandFilled = brandName.trim() !== "" ? 1 : 0;
    const optionalCounts = cardMixOpen;
    const optionalFilled = optionalCounts && cardMixDebit !== "" ? 1 : 0;
    const total = 6 + (optionalCounts ? 1 : 0);
    const done = filled + brandFilled + optionalFilled;
    return { done, total, pct: Math.round((done / total) * 100) };
  }, [gmv, avgTicket, intlPct, providerSlug, country, cardMixOpen, cardMixDebit, brandName]);

  // ── Submit → submitPaymentsAnalysis → /PaymentsResults?session=<id>
  const handleSubmit = async () => {
    setErrorBanner("");
    if (!validation.valid) {
      setErrorBanner(validation.errors.join("\n"));
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        monthly_gmv_eur: Number(gmv),
        avg_ticket_eur: Number(avgTicket),
        intl_pct: Number(intlPct),
        provider_slug: providerSlug,
        country,
        brand_name: brandName.trim(),
        ...(cardMixDebit !== "" ? { card_mix_debit_pct: Number(cardMixDebit) } : {}),
        ...(website.trim() !== "" ? { website: website.trim() } : {}),
        ...(sector !== "" ? { sector } : {}),
      };
      const resp = await base44.functions.invoke("submitPaymentsAnalysis", payload);
      const body = resp?.data || resp;

      if (body?.error === "rate_limited") {
        const secs = Number(body.retry_after_seconds) || 0;
        const mins = Math.max(1, Math.ceil(secs / 60));
        setErrorBanner(`Too many analyses from your network right now. Try again in ~${mins} minute${mins > 1 ? "s" : ""}.`);
        setSubmitting(false);
        return;
      }
      if (body?.error === "invalid_input") {
        setErrorBanner(`Please review "${body.field}" — the value is out of range.`);
        setSubmitting(false);
        return;
      }
      if (!body?.ok || !body.anon_session_id) {
        setErrorBanner("We couldn't run your analysis right now. Please try again in a moment.");
        setSubmitting(false);
        return;
      }
      // Navigate to the CANONICAL /Results route — not /PaymentsResults, which
      // is an alias that <Navigate replace> resolves to /Results but STRIPS the
      // query string in the process, breaking the session handoff.
      navigate(`/Results?session=${encodeURIComponent(body.anon_session_id)}`);
    } catch {
      setErrorBanner("We couldn't reach the server. Please check your connection and try again.");
      setSubmitting(false);
    }
  };

  return (
    <div
      className="relative min-h-screen flex flex-col font-inter overflow-x-hidden"
      style={{
        color: "#ffffff",
        background:
          "linear-gradient(180deg, #0a0a0a 0%, #0b0e1a 25%, #0a0d18 55%, #0b1020 80%, #08090f 100%)",
      }}
    >
      {/* Ambient grid + halo — matches Analyzer/Results for visual continuity */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-0"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px)",
          backgroundSize: "56px 56px",
          opacity: 0.3,
          maskImage: "radial-gradient(ellipse 90% 70% at 50% 25%, #000 35%, transparent 100%)",
          WebkitMaskImage: "radial-gradient(ellipse 90% 70% at 50% 25%, #000 35%, transparent 100%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none fixed z-0"
        style={{
          width: 700, height: 700, left: "50%", top: 80, transform: "translateX(-50%)",
          background: "radial-gradient(circle, rgba(59,130,246,0.14) 0%, transparent 70%)",
          filter: "blur(80px)",
        }}
      />

      <Navbar />

      {/* Thin progress bar under navbar */}
      <div className="fixed top-14 left-0 right-0 z-40 h-[2px]" style={{ background: "rgba(255,255,255,0.05)" }}>
        <div
          className="h-full transition-all duration-500"
          style={{
            width: `${progress.pct}%`,
            background: "linear-gradient(90deg, #3b82f6 0%, #22d3ee 100%)",
            boxShadow: "0 0 12px rgba(34,211,238,0.55)",
          }}
        />
      </div>

      {/* Container widens progressively — mobile stays at max-w-lg (phone-
          shaped form), lg lifts to max-w-3xl, xl uses max-w-5xl so the
          desktop layout can afford a 3-column row (ticket + intl + country)
          without stretching sliders past the useful width. */}
      <main className="relative z-10 flex-1 max-w-lg lg:max-w-3xl xl:max-w-5xl mx-auto w-full px-5 lg:px-8 pt-20 pb-16">
        {/* Header pill + counter */}
        <div className="flex items-center justify-between mb-5">
          <div className="inline-flex items-center gap-2 rounded-full px-3 py-1"
            style={{ border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.03)" }}
          >
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75 animate-ping" />
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-cyan-400" />
            </span>
            <span className="text-[10px] uppercase tracking-[0.22em] font-bold text-white/60">Payments audit · anonymous</span>
          </div>
          <span className="text-[11px] font-bold tabular-nums text-white/50">
            {progress.done} <span className="text-white/30">of {progress.total}</span>
          </span>
        </div>

        <h1
          className="text-white mb-3"
          style={{
            fontFamily: "'Space Grotesk', 'Inter', sans-serif",
            fontSize: "clamp(30px, 5vw, 44px)",
            fontWeight: 900,
            letterSpacing: "-0.04em",
            lineHeight: 1.02,
          }}
        >
          What are you overpaying on payments?
        </h1>
        <p className="text-[14px] text-white/55 mb-8">
          A few quick answers. No account required, no data connected. We estimate the gap between what you pay today
          and what a merchant of your size + region should be paying.
        </p>

        {errorBanner && (
          <div
            role="alert"
            aria-live="polite"
            className="mb-6 rounded-xl px-4 py-3 flex items-start gap-2.5"
            style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)" }}
          >
            <AlertTriangle size={14} className="text-red-300 mt-0.5 shrink-0" aria-hidden="true" />
            <p className="text-[12px] text-red-200 leading-relaxed whitespace-pre-line">{errorBanner}</p>
          </div>
        )}

        {/* ─────────────── Form ─────────────── */}
        <div className="space-y-8">
          {/* GMV always spans full width — it's the anchor number. */}
          <GmvSlider value={gmv} onChange={setGmv} />

          {/* Ticket + International share + Country live in one responsive
              row. On mobile they stack; on lg they pair (2 cols); on xl they
              spread to 3 cols so the extra desktop width actually earns its
              keep instead of leaving dead space on the right. */}
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-x-8 gap-y-8">
            <AvgTicketInput value={avgTicket} onChange={setAvgTicket} />
            <IntlSlider value={intlPct} onChange={setIntlPct} />
            {/* Country — kept as a native <select>: single-choice from 22
                options, low frequency, no need for a grid. Lifted from its
                own row into this one to reclaim the desktop width. */}
            <div className="space-y-2.5">
              <div className="flex items-baseline justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/55">
                  Country
                </span>
                <span className="text-[10px] text-white/35">Region benchmark</span>
              </div>
              <select
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                className="w-full h-11 px-3 rounded-md text-sm text-white focus:outline-none focus:border-cyan-400/60 transition-colors"
                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.12)" }}
              >
                <option value="" className="bg-neutral-900">Select your country…</option>
                {COUNTRY_OPTIONS.map((c) => (
                  <option key={c.code} value={c.code} className="bg-neutral-900">{c.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Provider grid — ProviderGrid owns responsive density internally
              (2 / 3 / 4 cols). Same enum + same order as the backend contract. */}
          <div className="space-y-2.5">
            <div className="flex items-baseline justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/55">
                Payment provider
              </span>
              <span className="text-[10px] text-white/35">One tap</span>
            </div>
            <ProviderGrid
              options={PROVIDER_OPTIONS}
              value={providerSlug}
              onChange={setProviderSlug}
            />
          </div>

          {/* Card mix — optional, collapsed */}
          <div>
            <button
              type="button"
              onClick={() => setCardMixOpen((o) => !o)}
              className="w-full flex items-center justify-between px-4 py-3 rounded-xl min-h-[44px] text-white/75 hover:text-white transition-colors"
              style={{ border: "1px solid rgba(255,255,255,0.10)", background: "rgba(255,255,255,0.02)" }}
            >
              <span className="flex items-center gap-2 text-[13px] font-medium">
                Debit vs credit mix <span className="text-[11px] text-white/40">(optional)</span>
              </span>
              {cardMixOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
            {cardMixOpen && (
              <div
                className="mt-3 rounded-2xl p-4"
                style={{ border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.02)" }}
              >
                <CardMixSlider value={cardMixDebit} onChange={setCardMixDebit} />
              </div>
            )}
          </div>

          {/* About your brand — REQUIRED brand name, optional website + sector.
              Placed at the end of the form on purpose: cost-per-field is
              highest here (users have already answered the payment questions
              and are committed), so this is where we can afford to ask for
              lead-intelligence metadata without hurting conversion. */}
          <BrandBlock
            brandName={brandName}
            onBrandNameChange={setBrandName}
            website={website}
            onWebsiteChange={setWebsite}
            sector={sector}
            onSectorChange={setSector}
          />

          {/* Privacy microcopy */}
          <div className="flex items-start gap-2 pt-2 text-[11px] text-white/40">
            <Lock size={11} className="mt-0.5 shrink-0" />
            <span>No account, no data connected, nothing shared. Results are stored with an anonymous session id you can revisit from this device.</span>
          </div>

          {/* Primary CTA — inline, full width, at the end of the form.
              Replaces the floating footer button that was clipping on some
              viewports. Secondary Back link sits right below. */}
          <div className="pt-2 space-y-3">
            <Button
              onClick={handleSubmit}
              disabled={!validation.valid || submitting}
              className="w-full h-12 rounded-full text-sm font-bold gap-2 text-white hover:opacity-90 disabled:opacity-40 transition-opacity"
              style={{
                background: "linear-gradient(135deg, #1F4ED8 0%, #2CA7C1 100%)",
                boxShadow: "0 0 32px rgba(34,211,238,0.45), 0 12px 32px -12px rgba(34,211,238,0.6)",
              }}
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Running audit…
                </>
              ) : (
                <>
                  See my payments gap <ArrowRight className="h-4 w-4" />
                </>
              )}
            </Button>
            {/* Missing-fields hint — only shown when the CTA is disabled AND
                the user hasn't been shown a hard error banner yet. Answers
                the "why is this button grey?" question on mobile, where the
                required fields above scroll off-screen. UX-only, no logic
                change: the validation itself is unchanged. */}
            {!validation.valid && !submitting && !errorBanner && (
              <p className="text-center text-[11.5px] text-white/50 leading-relaxed">
                Still needed: <span className="text-white/80">{validation.errors[0].replace(/[.!]$/, "")}</span>
                {validation.errors.length > 1 && (
                  <span className="text-white/40"> · +{validation.errors.length - 1} more above</span>
                )}
              </p>
            )}
            <button
              type="button"
              onClick={() => navigate("/")}
              disabled={submitting}
              className="w-full h-11 rounded-full text-[13px] font-medium text-white/50 hover:text-white/85 transition-colors inline-flex items-center justify-center gap-1.5 disabled:opacity-40"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}