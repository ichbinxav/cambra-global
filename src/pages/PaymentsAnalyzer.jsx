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
import { useTranslation } from "@/lib/i18n.jsx";

import GmvSlider       from "@/components/paymentsAnalyzer/GmvSlider";
import AvgTicketInput  from "@/components/paymentsAnalyzer/AvgTicketInput";
import IntlSlider      from "@/components/paymentsAnalyzer/IntlSlider";
import ProviderGrid    from "@/components/paymentsAnalyzer/ProviderGrid";
import CardMixSlider   from "@/components/paymentsAnalyzer/CardMixSlider";
import BrandBlock, { BRAND_SECTOR_SLUGS } from "@/components/paymentsAnalyzer/BrandBlock";
import CombinedChannelBlock from "@/components/paymentsAnalyzer/CombinedChannelBlock";
import AnalyzerEntryCards from "@/components/paymentsAnalyzer/AnalyzerEntryCards";
import PspVerificationOptions from "@/components/paymentsAnalyzer/PspVerificationOptions";
import AnalyzingOverlay from "@/components/paymentsAnalyzer/AnalyzingOverlay";
import { BRAND_ASSETS } from "@/lib/brandAssets";

// ── Provider enum — VERBATIM copy of ALLOWED_PROVIDER_SLUGS in
//    submitPaymentsAnalysis/entry.ts. Order matters (product decision).
//    Verified rows first (stripe/paypal/shopify_payments), fallback-only
//    providers after. DO NOT reorder or rename.
// UX widening (2026-07-12): the grid shows the ~10 most common providers
// per channel PLUS an "Other" catch-all. Engine contract is UNCHANGED —
// the backend's ALLOWED_PROVIDER_SLUGS enum is strict, so any slug not
// in that list is mapped at submit time to `other` (see mapSlugForSubmit).
// This keeps the visual catalog wide (better recognition, better funnel)
// while the pricing model stays exactly the same. Slugs with a real seed
// row in PaymentsRateTable carry `.hasSeed: true` — they submit as-is.
// Slugs without a seed row (Klarna, Square online, Revolut, myPOS, …)
// carry `.hasSeed: false` — they submit as `other` which routes to the
// regional fallback (ANY|ANY|<region>|<channel>).
// 1.2 (2026-07-14) — reordered to FR relevance + top-10 online PSPs.
// worldpay/square removed (US/UK, not FR top-10). worldline added
// (Worldline/Payline) as hasSeed:false → collapses to `other` at submit.
// shopify_payments + sumup kept on purpose (Shopify = key for indie brands;
// SumUp operates online + in-store).
const PROVIDER_OPTIONS_ONLINE = [
  { slug: "stripe",           label: "Stripe",           hasSeed: true  },
  { slug: "paypal",           label: "PayPal",           hasSeed: true  },
  { slug: "mollie",           label: "Mollie",           hasSeed: true  },
  { slug: "payplug",          label: "Payplug",          hasSeed: true  },
  { slug: "adyen",            label: "Adyen",            hasSeed: true  },
  { slug: "checkout_com",     label: "Checkout.com",     hasSeed: true  },
  { slug: "stancer",          label: "Stancer",          hasSeed: true  },
  { slug: "lyra",             label: "Lyra",             hasSeed: true  },
  { slug: "worldline",        label: "Worldline",        hasSeed: false },
  { slug: "shopify_payments", label: "Shopify Payments", hasSeed: true  },
  { slug: "sumup",            label: "SumUp",            hasSeed: true  },
  { slug: "klarna",           label: "Klarna",           hasSeed: false },
  { slug: "other",            label: "Other",            hasSeed: true  },
];

// M4-TPV Fase 2B + 2026-07-12 UX widening. Verified in-store rows first
// (SumUp / Stripe Terminal / Smile&Pay / Zettle), then common providers
// that submit as `other` → routed to ANY|ANY|<region>|in_store fallback.
// 1.2 (2026-07-14) — top-10 FR TPV. square/revolut_reader/viva/adyen removed.
// worldline_terminal/nepting/ingenico/verifone added as hasSeed:false →
// collapse to `other` (regional in-store fallback). Contract-safe.
const PROVIDER_OPTIONS_IN_STORE = [
  { slug: "sumup",              label: "SumUp",              hasSeed: true  },
  { slug: "zettle",             label: "Zettle by PayPal",   hasSeed: true  },
  { slug: "smile_and_pay",      label: "Smile & Pay",        hasSeed: true  },
  { slug: "yavin",              label: "Yavin",              hasSeed: true  },
  { slug: "worldline_terminal", label: "Worldline",          hasSeed: false },
  { slug: "mypos",              label: "myPOS",              hasSeed: false },
  { slug: "nepting",            label: "Nepting",            hasSeed: false },
  { slug: "stripe_terminal",    label: "Stripe Terminal",    hasSeed: true  },
  { slug: "ingenico",           label: "Ingenico",           hasSeed: false },
  { slug: "verifone",           label: "Verifone",           hasSeed: false },
  { slug: "other",              label: "Traditional bank TPV", hasSeed: true },
];

// Map a UI slug to the exact string the backend allowlist accepts.
// UI-catalog-only slugs (hasSeed=false) collapse to "other" — the backend
// then routes them to the regional in-store/online fallback. Contract-safe.
function mapSlugForSubmit(uiSlug, options) {
  const opt = options.find((o) => o.slug === uiSlug);
  if (!opt) return "other";
  return opt.hasSeed ? opt.slug : "other";
}

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
  const { t } = useTranslation();

  // M4-TPV Fase 2B — REACTIVADO 2026-07-12 tras Fase 2A-redo verificada.
  // Precondiciones cumplidas: motor 1.4.0 en las 3 copias SYNC byte-idénticas
  // (RAW: paymentsGap.js src + submitPaymentsAnalysis + computeStripeVerifiedGap,
  // 34217 chars cada uno, cero diffs), 19 filas seeded en PaymentsRateTable
  // (11 online preservadas + 4 verified in-store + 4 fallback in-store),
  // retrocompat online byte-idéntica confirmada (Stripe EU GMV€1M ticket€50
  // intl15% → 226.25 bps / 149.5 bps / {lo:6140, point:7675, hi:9210}
  // idéntico a 1.3.0). Toggle visible + payload envía channel real.
  const IN_STORE_UI_ENABLED = true;
  // M4-TPV Fase 3 — three modes now: 'online', 'in_store', 'combined'.
  // Combined runs two engine passes (one per channel) and aggregates.
  // Single-channel modes remain byte-identical to Fase 2B behavior.
  const [channel, setChannel]           = useState("online");
  const [gmv, setGmv]                   = useState("");
  const [avgTicket, setAvgTicket]       = useState("");
  // Intl share: seed the state with the slider's visual default ("0") from
  // the first render. 0% ("domestic only") is a real, contract-valid value —
  // leaving the state empty until the user drags made an untouched slider fail
  // validation ("International share is required") even though 0 was shown.
  // Now the visual default and the state default are the same value at mount.
  const [intlPct, setIntlPct]           = useState("0");
  const [providerSlug, setProviderSlug] = useState("");
  const [country, setCountry]           = useState("");
  const [cardMixOpen, setCardMixOpen]   = useState(false);
  const [cardMixDebit, setCardMixDebit] = useState("");
  // Combined mode holds independent per-channel form state, so switching
  // back to a single-channel mode preserves nothing (avoids stale data).
  const [combinedOnline, setCombinedOnline] = useState({
    // intl_pct seeded to "0" (domestic only) — same rationale as single-channel
    // intlPct above: 0 is a valid contract value + the slider's visual default,
    // so an untouched slider must not fail validation as "required/absent".
    monthly_gmv_eur: "", avg_ticket_eur: "", intl_pct: "0", provider_slug: "",
  });
  const [combinedInStore, setCombinedInStore] = useState({
    monthly_gmv_eur: "", avg_ticket_eur: "", provider_slug: "",
  });
  // ── About your brand (required: name; optional: website, sector) ──────
  const [brandName, setBrandName]       = useState("");
  const [website, setWebsite]           = useState("");
  const [sector, setSector]             = useState("");

  const [submitting, setSubmitting]   = useState(false);
  const [errorBanner, setErrorBanner] = useState("");

  // ── Client-side validation — same ranges + fields as the backend.
  const validation = useMemo(() => {
    const errors = [];
    const isCombined = channel === "combined";

    if (isCombined) {
      // Validate ONLINE sub-form.
      if (combinedOnline.monthly_gmv_eur === "") errors.push("Online: monthly GMV is required.");
      else { const e = fieldRangeError("monthly_gmv_eur", combinedOnline.monthly_gmv_eur); if (e) errors.push(`Online — ${e}`); }
      if (combinedOnline.avg_ticket_eur === "") errors.push("Online: average ticket is required.");
      else { const e = fieldRangeError("avg_ticket_eur", combinedOnline.avg_ticket_eur); if (e) errors.push(`Online — ${e}`); }
      if (combinedOnline.intl_pct === "") errors.push("Online: international share is required (0% is valid).");
      else { const e = fieldRangeError("intl_pct", combinedOnline.intl_pct); if (e) errors.push(`Online — ${e}`); }
      if (!combinedOnline.provider_slug) errors.push("Online: payment provider is required.");

      // Validate IN-STORE sub-form.
      if (combinedInStore.monthly_gmv_eur === "") errors.push("In-store: monthly GMV is required.");
      else { const e = fieldRangeError("monthly_gmv_eur", combinedInStore.monthly_gmv_eur); if (e) errors.push(`In-store — ${e}`); }
      if (combinedInStore.avg_ticket_eur === "") errors.push("In-store: average ticket is required.");
      else { const e = fieldRangeError("avg_ticket_eur", combinedInStore.avg_ticket_eur); if (e) errors.push(`In-store — ${e}`); }
      if (!combinedInStore.provider_slug) errors.push("In-store: terminal provider is required.");
    } else {
      if (gmv === "") errors.push("Monthly GMV is required.");
      else { const e = fieldRangeError("monthly_gmv_eur", gmv); if (e) errors.push(e); }

      if (avgTicket === "") errors.push("Average ticket is required.");
      else { const e = fieldRangeError("avg_ticket_eur", avgTicket); if (e) errors.push(e); }

      // In-store channel: cross-border volume is negligible in card-present
      // for the ICP, so we skip the intl question entirely and treat it as 0
      // in the payload. Online channel: intl_pct is required (0 is valid).
      if (channel === "online") {
        if (intlPct === "") errors.push("International share is required (0% is valid).");
        else { const e = fieldRangeError("intl_pct", intlPct); if (e) errors.push(e); }
      }

      if (!providerSlug) errors.push("Payment provider is required.");
    }
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
  }, [gmv, avgTicket, intlPct, providerSlug, country, cardMixDebit, brandName, website, sector, channel, combinedOnline, combinedInStore]);

  // ── Progress counter — 6 required fields (5 payment + brand name) plus 1
  //    optional (card mix) when the drawer is open. Website and sector are
  //    intentionally NOT counted so the pill doesn't nag users into filling
  //    optional fields.
  //    In-store channel: intl_pct is not asked, so the counter drops to 5
  //    payment fields + brand = 5 required.
  const progress = useMemo(() => {
    let paymentFields;
    if (channel === "combined") {
      paymentFields = [
        combinedOnline.monthly_gmv_eur, combinedOnline.avg_ticket_eur, combinedOnline.intl_pct, combinedOnline.provider_slug,
        combinedInStore.monthly_gmv_eur, combinedInStore.avg_ticket_eur, combinedInStore.provider_slug,
        country,
      ];
    } else if (channel === "in_store") {
      paymentFields = [gmv, avgTicket, providerSlug, country];           // no intl
    } else {
      paymentFields = [gmv, avgTicket, intlPct, providerSlug, country];  // classic online
    }
    const filled = paymentFields.filter((v) => v !== "" && v !== undefined && v !== null).length;
    const brandFilled = brandName.trim() !== "" ? 1 : 0;
    const optionalCounts = cardMixOpen;
    const optionalFilled = optionalCounts && cardMixDebit !== "" ? 1 : 0;
    const total = paymentFields.length + 1 + (optionalCounts ? 1 : 0);
    const done = filled + brandFilled + optionalFilled;
    return { done, total, pct: Math.round((done / total) * 100) };
  }, [gmv, avgTicket, intlPct, providerSlug, country, cardMixOpen, cardMixDebit, brandName, channel, combinedOnline, combinedInStore]);

  // ── Submit → submitPaymentsAnalysis → /PaymentsResults?session=<id>
  const handleSubmit = async () => {
    setErrorBanner("");
    if (!validation.valid) {
      setErrorBanner(validation.errors.join("\n"));
      return;
    }

    setSubmitting(true);
    try {
      let payload;
      if (channel === "combined") {
        // Combined mode: send `mode: 'combined'` + `channels[]` — backend
        // runs calculateGap once per channel and aggregates.
        payload = {
          mode: "combined",
          country,
          brand_name: brandName.trim(),
          channels: [
            {
              channel: "online",
              provider_slug: mapSlugForSubmit(combinedOnline.provider_slug, PROVIDER_OPTIONS_ONLINE),
              monthly_gmv_eur: Number(combinedOnline.monthly_gmv_eur),
              avg_ticket_eur: Number(combinedOnline.avg_ticket_eur),
              intl_pct: Number(combinedOnline.intl_pct),
            },
            {
              channel: "in_store",
              provider_slug: mapSlugForSubmit(combinedInStore.provider_slug, PROVIDER_OPTIONS_IN_STORE),
              monthly_gmv_eur: Number(combinedInStore.monthly_gmv_eur),
              avg_ticket_eur: Number(combinedInStore.avg_ticket_eur),
            },
          ],
          ...(website.trim() !== "" ? { website: website.trim() } : {}),
          ...(sector !== "" ? { sector } : {}),
        };
      } else {
        payload = {
          monthly_gmv_eur: Number(gmv),
          avg_ticket_eur: Number(avgTicket),
          // In-store: cross-border volume is negligible for the ICP (card-
          // present shoppers use domestic cards) → intl_pct forced to 0 in
          // the payload. Online: intl_pct is required and comes from the form.
          intl_pct: channel === "in_store" ? 0 : Number(intlPct),
          provider_slug: mapSlugForSubmit(
            providerSlug,
            channel === "in_store" ? PROVIDER_OPTIONS_IN_STORE : PROVIDER_OPTIONS_ONLINE
          ),
          country,
          channel,
          brand_name: brandName.trim(),
          ...(cardMixDebit !== "" ? { card_mix_debit_pct: Number(cardMixDebit) } : {}),
          ...(website.trim() !== "" ? { website: website.trim() } : {}),
          ...(sector !== "" ? { sector } : {}),
        };
      }
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
          "linear-gradient(180deg, #0a0a0a 0%, #0b0e1a 25%, #0a0d18 55%, #0b1020 80%, #0E0E1A 100%)",
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

      {/* Analyzing overlay — live progress steps while the audit runs. The
          sequence advances on a timer (so a cold-start submit never looks
          hung), but the overlay CLOSES the moment `submitting` flips back to
          false — i.e. dictated by the real response, not the animation. */}
      {submitting && <AnalyzingOverlay />}

      {/* Thin progress bar under navbar */}
      <div className="fixed top-14 left-0 right-0 z-40 h-[2px]" style={{ background: "rgba(255,255,255,0.05)" }}>
        <div
          className="h-full transition-all duration-500"
          style={{
            width: `${progress.pct}%`,
            background: "linear-gradient(90deg, #5B4CF5 0%, #39C6F0 100%)",
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
        <p className="text-[14px] text-white/55 mb-6">
          A few quick answers. No account required, no data connected. We estimate the gap between what you pay today
          and what a merchant of your size + region should be paying.
        </p>

        {/* 3-way entry cards — Connect / Upload / Manual. Presentational only:
            selecting Connect routes to /ConnectTools (protected → login gate),
            Upload is disabled (surface for now, not wired to anonymous flow),
            Manual keeps the current form visible below (default state). */}
        <AnalyzerEntryCards
          selected="manual"
          onSelect={(mode) => {
            if (mode === "connect") navigate("/ConnectTools");
            // "upload" (FASE B) — the real upload path is per-PSP, living
            // under the provider selector. Scroll the user there to pick
            // their provider and reveal the Upload-statements card. In
            // combined mode #psp-selector doesn't exist, so fall back to the
            // top of the form.
            if (mode === "upload") {
              const target =
                document.getElementById("psp-selector") ||
                document.getElementById("analyzer-form");
              target?.scrollIntoView({ behavior: "smooth", block: "start" });
            }
            // "manual" — scroll down to where the questions begin so the user
            // sees something happen (they clicked a card, they expect motion).
            if (mode === "manual") {
              document.getElementById("analyzer-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
            }
          }}
        />

        {/* Channel toggle — M4-TPV Fase 2B — OCULTO tras IN_STORE_UI_ENABLED
            hasta Fase 2A-redo. Ver comentario del useState de `channel`. */}
        {IN_STORE_UI_ENABLED && (
          <div
            role="tablist"
            aria-label="Payment channel"
            className="mb-8 inline-flex items-center rounded-full p-1"
            style={{
              border: "1px solid rgba(255,255,255,0.10)",
              background: "rgba(255,255,255,0.02)",
            }}
          >
            {[
              { key: "online",   label: t("analyzer_channel_online") },
              { key: "in_store", label: t("analyzer_channel_in_store") },
              { key: "combined", label: t("analyzer_channel_combined") },
            ].map((opt) => {
              const active = channel === opt.key;
              return (
                <button
                  key={opt.key}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => {
                    if (opt.key !== channel) setProviderSlug("");
                    setChannel(opt.key);
                  }}
                  className="h-8 px-4 rounded-full text-[12px] font-bold transition-colors"
                  style={
                    active
                      ? {
                          background: "linear-gradient(135deg, #5B4CF5 0%, #39C6F0 100%)",
                          color: "#ffffff",
                          boxShadow: "0 4px 12px -4px rgba(34,211,238,0.55)",
                        }
                      : { background: "transparent", color: "rgba(255,255,255,0.55)" }
                  }
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        )}

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
        <div id="analyzer-form" className="space-y-8 scroll-mt-24">
          {/* M4-TPV Fase 3 — Combined mode renders a dual-channel block
              (online + in-store side by side) INSTEAD of the single-channel
              form. Country + brand + card mix still live at the top level.
              Both modes flow into the same submit handler. */}
          {channel === "combined" ? (
            <>
              <CombinedChannelBlock
                onlineValue={combinedOnline}
                onOnlineChange={setCombinedOnline}
                inStoreValue={combinedInStore}
                onInStoreChange={setCombinedInStore}
                onlineProviders={PROVIDER_OPTIONS_ONLINE}
                inStoreProviders={PROVIDER_OPTIONS_IN_STORE}
              />
              {/* Country lives at the top level — single field shared by
                  both channels (a merchant is in one country). */}
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
                  style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.12)", colorScheme: "dark" }}
                >
                  <option value="" style={{ background: "#0b1020", color: "#ffffff" }}>Select your country…</option>
                  {COUNTRY_OPTIONS.map((c) => (
                    <option key={c.code} value={c.code} style={{ background: "#0b1020", color: "#ffffff" }}>{c.name}</option>
                  ))}
                </select>
              </div>
            </>
          ) : (
          <>
          {/* GMV always spans full width — it's the anchor number. */}
          <GmvSlider value={gmv} onChange={setGmv} />

          {/* Ticket + International share + Country live in one responsive
              row. On mobile they stack; on lg they pair (2 cols); on xl they
              spread to 3 cols so the extra desktop width actually earns its
              keep instead of leaving dead space on the right. */}
          <div className={`grid grid-cols-1 lg:grid-cols-2 ${channel === "online" ? "xl:grid-cols-3" : ""} gap-x-8 gap-y-8`}>
            <AvgTicketInput value={avgTicket} onChange={setAvgTicket} />
            {/* Intl share — online only. In-store: card-present cross-border
                is negligible for the ICP and none of the seeded in-store rows
                carry a modeled intl_uplift_bps (all null). Asking would only
                add noise and produce an "intl uplift not modeled" assumption. */}
            {channel === "online" && (
              <IntlSlider value={intlPct} onChange={setIntlPct} />
            )}
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
                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.12)", colorScheme: "dark" }}
              >
                <option value="" style={{ background: "#0b1020", color: "#ffffff" }}>Select your country…</option>
                {COUNTRY_OPTIONS.map((c) => (
                  <option key={c.code} value={c.code} style={{ background: "#0b1020", color: "#ffffff" }}>{c.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Provider grid — ProviderGrid owns responsive density internally
              (2 / 3 / 4 cols). Same enum + same order as the backend contract.
              Options swap based on channel: online providers vs. in-store TPVs. */}
          <div id="psp-selector" className="space-y-2.5 scroll-mt-24">
            <div className="flex items-baseline justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/55">
                {channel === "in_store" ? "In-store terminal (TPV)" : "Payment provider"}
              </span>
              <span className="text-[10px] text-white/35">One tap</span>
            </div>
            <ProviderGrid
              options={channel === "in_store" ? PROVIDER_OPTIONS_IN_STORE : PROVIDER_OPTIONS_ONLINE}
              value={providerSlug}
              onChange={setProviderSlug}
            />
          </div>

          {/* Fallback universal de facturas (FASE B) — per-PSP verification
              path. Reacts to the selected provider: Stripe → Connect card
              (live verified), everything else → Upload statements (in beta,
              gated by the extractor flag). Presentational + read-only probe;
              does NOT touch the estimated submit below. Shown only on
              single-channel modes (combined has two providers, out of scope). */}
          <PspVerificationOptions
            providerSlug={providerSlug}
            providerLabel={
              (channel === "in_store" ? PROVIDER_OPTIONS_IN_STORE : PROVIDER_OPTIONS_ONLINE)
                .find((o) => o.slug === providerSlug)?.label
            }
            onConnect={() => navigate("/ConnectTools")}
          />
          </>
          )}

          {/* Card mix — optional, collapsed. Shared across all modes. */}
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
                background: "linear-gradient(135deg, #5B4CF5 0%, #39C6F0 100%)",
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