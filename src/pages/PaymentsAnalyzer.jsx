// PaymentsAnalyzer — Chunk 4 (payments-only pivot).
//
// Single-screen, 6-field form that submits to submitPaymentsAnalysis and
// redirects to /PaymentsResults?session=<anon_session_id>. Runs in parallel
// to the legacy /Analyzer route while we cut over. When Chunk 6 ships and the
// legacy path is retired, this becomes the sole analyzer entry point.
//
// Contract mirror — MUST stay in sync with the backend (base44/functions/
// submitPaymentsAnalysis/entry.ts §2.1):
//   - monthly_gmv_eur         500 .. 10_000_000  (required)
//   - avg_ticket_eur          5   .. 5_000       (required)
//   - intl_pct                0   .. 100         (required; 0 valid)
//   - provider_slug           enum, exact order below (required)
//   - country                 ISO-3166-1 alpha-2 (required)
//   - card_mix_debit_pct      0   .. 100         (optional, collapsed)
//
// The client validates the same ranges before submit. Anything the client
// lets through, the backend re-validates and rejects with a named-field 400.
// Client validation is a UX layer only, never a trust boundary.

import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import Navbar from "@/components/landing/Navbar";
import { ArrowRight, ArrowLeft, Loader2, AlertTriangle, ChevronDown, ChevronUp, Lock } from "lucide-react";

// ── Provider enum — VERBATIM copy of ALLOWED_PROVIDER_SLUGS in
//    submitPaymentsAnalysis/entry.ts. Order matters (product decision, not
//    technical): stripe/paypal/shopify_payments first because they map to
//    verified rate-table rows; the rest fall to the regional fallback and
//    render a "regional estimate" note in results. DO NOT reorder or rename.
const PROVIDER_OPTIONS = [
  { slug: "stripe",           label: "Stripe" },
  { slug: "paypal",           label: "PayPal" },
  { slug: "shopify_payments", label: "Shopify Payments" },
  { slug: "adyen",            label: "Adyen" },
  { slug: "mollie",           label: "Mollie" },
  { slug: "checkout_com",     label: "Checkout.com" },
  { slug: "sumup",            label: "SumUp" },
  { slug: "other",            label: "Other / not listed" },
];

// ── Country list — kept intentionally short and payments-relevant. The
// backend uses the country to derive region (EU/UK/US/RoW); it does NOT
// consume the country beyond that mapping. So this list can grow later
// without any backend change.
const COUNTRY_OPTIONS = [
  // EU (SEPA + EEA)
  { code: "ES", name: "Spain" },        { code: "FR", name: "France" },
  { code: "DE", name: "Germany" },      { code: "IT", name: "Italy" },
  { code: "PT", name: "Portugal" },     { code: "NL", name: "Netherlands" },
  { code: "BE", name: "Belgium" },      { code: "IE", name: "Ireland" },
  { code: "AT", name: "Austria" },      { code: "SE", name: "Sweden" },
  { code: "DK", name: "Denmark" },      { code: "FI", name: "Finland" },
  { code: "PL", name: "Poland" },       { code: "CZ", name: "Czech Republic" },
  { code: "GR", name: "Greece" },       { code: "LU", name: "Luxembourg" },
  { code: "NO", name: "Norway" },       { code: "CH", name: "Switzerland" },
  // UK
  { code: "GB", name: "United Kingdom" },
  // US
  { code: "US", name: "United States" },
  // RoW (falls to regional fallback row on the backend)
  { code: "CA", name: "Canada" },       { code: "AU", name: "Australia" },
  { code: "OT", name: "Other" },
];

// ── Contract §2.1 hard ranges. Client-side check runs BEFORE fetch so users
// see the error inline instead of a 400 flash. Values must exactly match
// VALIDATION in the backend entry — mirror, do not diverge.
const RANGES = {
  monthly_gmv_eur:    { min: 500, max: 10_000_000, label: "Monthly GMV (EUR)" },
  avg_ticket_eur:     { min: 5,   max: 5_000,      label: "Average ticket (EUR)" },
  intl_pct:           { min: 0,   max: 100,        label: "International %" },
  card_mix_debit_pct: { min: 0,   max: 100,        label: "Debit card share (%)" },
};

// Localizable message helper. Returns null when valid, otherwise a short
// user-facing string naming the offending field.
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

  // ── Form state
  const [gmv, setGmv]                     = useState("");
  const [avgTicket, setAvgTicket]         = useState("");
  const [intlPct, setIntlPct]             = useState("");
  const [providerSlug, setProviderSlug]   = useState("");
  const [country, setCountry]             = useState("");
  // Optional — collapsed by default. Empty string = "not provided" and the
  // backend will simply omit the field from the persisted input snapshot.
  const [cardMixOpen, setCardMixOpen]     = useState(false);
  const [cardMixDebit, setCardMixDebit]   = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [errorBanner, setErrorBanner] = useState("");

  // ── Client-side validation. Same 5 required fields + optional cardmix. We
  // never clamp — a value outside the contract is a hard error, same as the
  // backend behaviour, so the two layers can never disagree.
  const validation = useMemo(() => {
    const errors = [];
    if (gmv === "" || gmv === null || gmv === undefined) errors.push("Monthly GMV is required.");
    else { const e = fieldRangeError("monthly_gmv_eur", gmv); if (e) errors.push(e); }

    if (avgTicket === "" || avgTicket === null || avgTicket === undefined) errors.push("Average ticket is required.");
    else { const e = fieldRangeError("avg_ticket_eur", avgTicket); if (e) errors.push(e); }

    // intl_pct: 0 is a valid input, so we require the field but accept 0.
    if (intlPct === "" || intlPct === null || intlPct === undefined) errors.push("International % is required (enter 0 if none).");
    else { const e = fieldRangeError("intl_pct", intlPct); if (e) errors.push(e); }

    if (!providerSlug) errors.push("Payment provider is required.");
    if (!country) errors.push("Country is required.");

    // Optional field: only validated when the user typed something.
    if (cardMixDebit !== "" && cardMixDebit !== null && cardMixDebit !== undefined) {
      const e = fieldRangeError("card_mix_debit_pct", cardMixDebit);
      if (e) errors.push(e);
    }

    return { valid: errors.length === 0, errors };
  }, [gmv, avgTicket, intlPct, providerSlug, country, cardMixDebit]);

  // ── Submit → submitPaymentsAnalysis → redirect to /PaymentsResults with
  //    the anon_session_id the backend generated for us. The endpoint itself
  //    is rate-limited server-side (10/h/IP) — surfacing that 429 to the user
  //    if it happens is more useful than silently swallowing it, so we render
  //    the retry_after seconds in the banner.
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
        ...(cardMixDebit !== "" ? { card_mix_debit_pct: Number(cardMixDebit) } : {}),
      };
      const resp = await base44.functions.invoke("submitPaymentsAnalysis", payload);
      const body = resp?.data || resp;

      // Rate-limited from the same IP bucket. Show the retry hint and stop.
      if (body?.error === "rate_limited") {
        const secs = Number(body.retry_after_seconds) || 0;
        const mins = Math.max(1, Math.ceil(secs / 60));
        setErrorBanner(`Too many analyses from your network right now. Try again in ~${mins} minute${mins > 1 ? "s" : ""}.`);
        setSubmitting(false);
        return;
      }
      // Field-level validation echoed back — should already have been caught
      // by client validation, but the backend is the source of truth.
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

      // Success — hand off to the results screen. That page reads the anon
      // session id and calls getAnonResultTeaser (Chunk 5) to render the
      // saved engine_result. Nothing about the number is passed via URL —
      // the URL only carries the pointer.
      navigate(`/PaymentsResults?session=${encodeURIComponent(body.anon_session_id)}`);
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
      {/* Fixed ambient grid + cyan halo — matches legacy Analyzer for visual continuity */}
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

      <main className="relative z-10 flex-1 max-w-lg mx-auto w-full px-5 pt-24 pb-36">
        {/* Eyebrow pill */}
        <div className="inline-flex items-center gap-2 rounded-full px-3 py-1 mb-5"
          style={{ border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.03)" }}
        >
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75 animate-ping" />
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-cyan-400" />
          </span>
          <span className="text-[10px] uppercase tracking-[0.22em] font-bold text-white/60">Payments audit · anonymous</span>
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
          Six quick fields. No account required, no data connected. We estimate the gap between what you pay today
          and what a merchant of your size + region should be paying.
        </p>

        {/* Error banner */}
        {errorBanner && (
          <div
            role="alert"
            aria-live="polite"
            className="mb-5 rounded-xl px-4 py-3 flex items-start gap-2.5"
            style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)" }}
          >
            <AlertTriangle size={14} className="text-red-300 mt-0.5 shrink-0" aria-hidden="true" />
            <p className="text-[12px] text-red-200 leading-relaxed whitespace-pre-line">{errorBanner}</p>
          </div>
        )}

        {/* ─────────────── Form (single screen) ─────────────── */}
        <div className="space-y-5">
          {/* Monthly GMV */}
          <div className="space-y-1.5">
            <Label className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/55">
              Monthly card GMV (EUR)
            </Label>
            <Input
              type="number" min={0} inputMode="numeric"
              value={gmv}
              onChange={(e) => setGmv(e.target.value)}
              placeholder="e.g. 100000"
              className="h-11 text-sm text-white placeholder:text-white/30"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.12)" }}
            />
            <p className="text-[11px] text-white/35">Approximate total processed via card in a typical month.</p>
          </div>

          {/* Average ticket */}
          <div className="space-y-1.5">
            <Label className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/55">
              Average ticket (EUR)
            </Label>
            <Input
              type="number" min={0} step="0.01" inputMode="decimal"
              value={avgTicket}
              onChange={(e) => setAvgTicket(e.target.value)}
              placeholder="e.g. 80"
              className="h-11 text-sm text-white placeholder:text-white/30"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.12)" }}
            />
            <p className="text-[11px] text-white/35">The fixed fee (e.g. €0.25) hits low-ticket merchants much harder — this changes the answer.</p>
          </div>

          {/* International % */}
          <div className="space-y-1.5">
            <Label className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/55">
              International share (%)
            </Label>
            <Input
              type="number" min={0} max={100} inputMode="numeric"
              value={intlPct}
              onChange={(e) => setIntlPct(e.target.value)}
              placeholder="e.g. 10 (or 0 if you sell only domestically)"
              className="h-11 text-sm text-white placeholder:text-white/30"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.12)" }}
            />
          </div>

          {/* Provider */}
          <div className="space-y-1.5">
            <Label className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/55">
              Payment provider
            </Label>
            <select
              value={providerSlug}
              onChange={(e) => setProviderSlug(e.target.value)}
              className="w-full h-11 px-3 rounded-md text-sm text-white"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.12)" }}
            >
              <option value="" className="bg-neutral-900">Select your provider…</option>
              {PROVIDER_OPTIONS.map((p) => (
                <option key={p.slug} value={p.slug} className="bg-neutral-900">{p.label}</option>
              ))}
            </select>
          </div>

          {/* Country */}
          <div className="space-y-1.5">
            <Label className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/55">
              Country
            </Label>
            <select
              value={country}
              onChange={(e) => setCountry(e.target.value === "OT" ? "" : e.target.value)}
              className="w-full h-11 px-3 rounded-md text-sm text-white"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.12)" }}
            >
              <option value="" className="bg-neutral-900">Select your country…</option>
              {COUNTRY_OPTIONS.map((c) => (
                <option key={c.code} value={c.code === "OT" ? "" : c.code} className="bg-neutral-900">{c.name}</option>
              ))}
            </select>
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
                className="mt-3 space-y-1.5 rounded-2xl p-4"
                style={{ border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.02)" }}
              >
                <Label className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/55">
                  Debit card share (%)
                </Label>
                <Input
                  type="number" min={0} max={100} inputMode="numeric"
                  value={cardMixDebit}
                  onChange={(e) => setCardMixDebit(e.target.value)}
                  placeholder="e.g. 40"
                  className="h-11 text-sm text-white placeholder:text-white/30"
                  style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.12)" }}
                />
                <p className="text-[11px] text-white/35">
                  Leave blank if unsure — today's engine doesn't consume this yet, but we store it for future rate refinements.
                </p>
              </div>
            )}
          </div>

          {/* Privacy microcopy */}
          <div className="flex items-start gap-2 pt-2 text-[11px] text-white/40">
            <Lock size={11} className="mt-0.5 shrink-0" />
            <span>No account, no data connected, nothing shared. Results are stored with an anonymous session id you can revisit from this device.</span>
          </div>
        </div>
      </main>

      {/* Footer actions — same glass strip as the legacy Analyzer */}
      <div
        className="fixed bottom-0 left-0 right-0 z-40 flex items-center justify-between px-5 py-3"
        style={{
          background: "rgba(10,10,10,0.78)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          borderTop: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        <Button
          variant="ghost"
          onClick={() => navigate("/")}
          className="h-11 rounded-full px-4 text-sm font-medium text-white/60 hover:text-white hover:bg-white/5"
          disabled={submitting}
        >
          <ArrowLeft className="mr-1.5 h-4 w-4" />
          Back
        </Button>

        <Button
          onClick={handleSubmit}
          disabled={!validation.valid || submitting}
          className="h-11 rounded-full px-6 text-sm font-bold gap-2 text-white hover:opacity-90 disabled:opacity-40"
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
      </div>
    </div>
  );
}