import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ArrowRight, ArrowLeft, Loader2, AlertTriangle, MapPin,
  ShieldCheck, Sparkles, ChevronDown, ChevronUp, Plus, Store,
} from "lucide-react";
import Navbar from "@/components/landing/Navbar";
import StripeConnectCard from "@/components/connect/StripeConnectCard";
import { useTranslation } from "@/lib/i18n.jsx";
import { useToast } from "@/components/shared/Toast.jsx";
import RevenueRangePicker, { midpointForRange } from "@/components/analyzer/RevenueRangePicker";
import DetectedToolsGrid from "@/components/analyzer/DetectedToolsGrid";
import AnalysisProgress from "@/components/analyzer/AnalysisProgress";
import UpgradeToVerified from "@/components/shared/UpgradeToVerified";
import StepIndicator from "@/components/analyzer/StepIndicator";
import WhatHappensNext from "@/components/analyzer/WhatHappensNext";
import ConfidenceIndicator from "@/components/analyzer/ConfidenceIndicator";
import {
  computeInfraScore, calculateSavings, getBenchmarks,
  ENGINE_VERSION, validateAnalyzerInput,
} from "@/lib/scoreEngine";

// ─── Category mapping (i18n keys → internal slugs) ─────────────────────────
const CATEGORY_OPTIONS = [
  { key: "Fashion",                  i18n: "cat_fashion",     slug: "fashion" },
  { key: "Beauty",                   i18n: "cat_beauty",      slug: "beauty" },
  { key: "Food & Beverage",          i18n: "cat_food",        slug: "food_bev" },
  { key: "Electronics",              i18n: "cat_electronics", slug: "electronics" },
  { key: "Home & Living",            i18n: "cat_home",        slug: "home_living" },
  { key: "Sports & Outdoors",        i18n: "cat_sports",      slug: "sports" },
  { key: "Health & Wellness",        i18n: "cat_health",      slug: "health" },
  { key: "Toys & Kids",              i18n: "cat_toys",        slug: "toys" },
  { key: "Pets",                     i18n: "cat_pets",        slug: "pets" },
  { key: "Jewelry & Accessories",    i18n: "cat_jewelry",     slug: "jewelry" },
  { key: "Books & Media",            i18n: "cat_books",       slug: "media" },
  { key: "Automotive",               i18n: "cat_automotive",  slug: "automotive" },
  { key: "B2B & Wholesale",          i18n: "cat_b2b",         slug: "b2b" },
  { key: "Other",                    i18n: "cat_other",       slug: "other" },
];
const CATEGORY_MAP = Object.fromEntries(CATEGORY_OPTIONS.map(c => [c.key, c.slug]));

const COUNTRIES = [
  "France", "Germany", "Spain", "Italy", "Netherlands", "Belgium", "Portugal",
  "United Kingdom", "Ireland", "Sweden", "Denmark", "Finland", "Norway",
  "Austria", "Switzerland", "Poland", "Czech Republic", "Romania", "Hungary",
  "Greece", "Luxembourg", "United States", "Canada", "Australia", "Other",
];

const PAYMENT_PROVIDERS = ["Stripe", "Adyen", "Mollie", "PayPal", "Klarna", "Shopify Payments", "Other"];
const SHIPPING_PROVIDERS = ["DHL", "UPS", "FedEx", "Colissimo", "Chronopost", "Mondial Relay", "Sendcloud", "Other"];
const COMMON_SAAS_TOOLS = ["Shopify", "Klaviyo", "Gorgias", "Notion", "Slack", "Mailchimp"];

const RESUME_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

// ─── Helpers ───────────────────────────────────────────────────────────────
function autoSuggestBrandName(websiteUrl) {
  if (!websiteUrl) return "";
  try {
    const u = websiteUrl.includes("://") ? websiteUrl : `https://${websiteUrl}`;
    const host = new URL(u).hostname.replace(/^www\./, "");
    const root = host.split(".")[0] || "";
    if (!root) return "";
    return root.charAt(0).toUpperCase() + root.slice(1);
  } catch {
    return "";
  }
}

// FIX 1 — Normalize a website URL to a comparable domain string. Used to find
// or create the correct Brand for this analysis without ever falling back to
// "latest brand for this user".
function normalizeDomain(input) {
  if (!input || typeof input !== "string") return "";
  let s = input.trim().toLowerCase();
  if (!s.includes("://")) s = `https://${s}`;
  try {
    const u = new URL(s);
    let host = u.hostname.replace(/^www\./, "");
    return host || "";
  } catch {
    return "";
  }
}

function tierLabelForRevenue(monthlyRevenue, country) {
  const b = getBenchmarks(monthlyRevenue, country);
  const tierMap = { micro: "micro", small: "small", mid: "mid", large: "large" };
  return tierMap[b.tier] || "your tier";
}

// ─── Main component ────────────────────────────────────────────────────────
export default function Analyzer() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { toast } = useToast();
  const urlParams = new URLSearchParams(window.location.search);
  const resumeParam = urlParams.get("resume") === "true";

  // Auth is guaranteed by <ProtectedRoute> in App.jsx — if we render, the user
  // is signed in. No duplicate auth check here (was causing a black flicker
  // between mount and the internal isAuthenticated() resolving).

  // Step machinery
  const [step, setStep] = useState(1);
  const [errorBanner, setErrorBanner] = useState("");

  // Step 1 — brand
  const [brandName, setBrandName] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [country, setCountry] = useState("");
  const [revenueRange, setRevenueRange] = useState("");
  const [category, setCategory] = useState("");

  // Brand id + resume state
  const [brandId, setBrandId] = useState(null);
  const [memoryLoaded, setMemoryLoaded] = useState(false);
  const [resumeOffer, setResumeOffer] = useState(null);

  // Discovery
  const [discovery, setDiscovery] = useState({ status: "idle", findings: [], jobId: null });
  const discoveryTimer = useRef(null);
  const lastDiscoveredUrl = useRef("");

  // Step 2 — tools
  const [confirmedTools, setConfirmedTools] = useState(new Set());
  const [dismissedTools, setDismissedTools] = useState(new Set());
  const [manualOpen, setManualOpen] = useState(false);
  const [manual, setManual] = useState({
    payment_provider: "", payment_fee_pct: 0,
    shipping_provider: "", monthly_shipments: 0, monthly_shipping_cost: 0,
    saas_tools_selected: [], total_saas_spend: 0,
    has_physical_store: false,
    in_store_gmv: 0, tpe_transaction_fee_pct: 0, monthly_terminal_rental: 0,
    fixed_banking_fees: 0,
    banking_monthly_fees: 0,
  });

  // Step 3 — Stripe
  const [stripeConnected, setStripeConnected] = useState(false);

  // Running analysis
  const [running, setRunning] = useState(false);
  const [analysisDone, setAnalysisDone] = useState(false);

  // ── Build the unified tool list shown in Step 2 ──
  const buildToolList = () => {
    const map = new Map();
    const keyFor = (cat, name) => `${cat}|${name}`;

    // Website-detected findings (from discovery)
    for (const f of discovery.findings || []) {
      const k = keyFor(f.category, f.provider_or_tool);
      if (!map.has(k)) {
        map.set(k, {
          category: f.category,
          provider_or_tool: f.provider_or_tool,
          confidence_score: f.confidence_score,
          source: "website",
        });
      }
    }
    return Array.from(map.values());
  };

  const tools = buildToolList();

  // ── Resume offer detection ──
  useEffect(() => {
    if (memoryLoaded) return;
    let cancelled = false;

    (async () => {
      try {
        const res = await base44.functions.invoke("getCompanyMemory", {});
        if (cancelled) return;
        const payload = res?.data || res;
        const memory = payload?.memory;
        const resume = memory?.resume_state_json;

        if (memory) {
          if (memory.company_name_detected && !brandName) setBrandName(memory.company_name_detected);
          if (memory.country_detected && !country) setCountry(memory.country_detected);
          if (memory.website_url && !websiteUrl) setWebsiteUrl(memory.website_url);
          if (memory.brand_id) setBrandId(memory.brand_id);
        }

        // If returning from Stripe OAuth: auto-resume
        if (resumeParam && resume) {
          applyResumeState(resume, /*skipPrompt*/ true);
        } else if (resume?.timestamp) {
          const age = Date.now() - new Date(resume.timestamp).getTime();
          if (age < RESUME_WINDOW_MS) {
            setResumeOffer(resume);
          }
        }
      } catch {
        // non-fatal
      } finally {
        if (!cancelled) setMemoryLoaded(true);
      }
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const applyResumeState = (resume, skipPrompt = false) => {
    try {
      const fv = resume.formValues || {};
      if (fv.brandName) setBrandName(fv.brandName);
      if (fv.websiteUrl) setWebsiteUrl(fv.websiteUrl);
      if (fv.country) setCountry(fv.country);
      if (fv.revenueRange) setRevenueRange(fv.revenueRange);
      if (fv.category) setCategory(fv.category);
      if (fv.manual) setManual(m => ({ ...m, ...fv.manual }));
      if (Array.isArray(resume.confirmedTools)) setConfirmedTools(new Set(resume.confirmedTools));
      if (Array.isArray(resume.dismissedTools)) setDismissedTools(new Set(resume.dismissedTools));
      if (Array.isArray(resume.detectedTools)) {
        setDiscovery(d => ({ ...d, status: "completed", findings: resume.detectedTools }));
      }
      const target = Math.min(Math.max(Number(resume.step || 1), 1), 3);
      setStep(target);
      if (skipPrompt) setResumeOffer(null);
    } catch {
      setResumeOffer(null);
    }
  };

  const dismissResume = async () => {
    setResumeOffer(null);
    // Clear only resume_state_json, keep the rest of CompanyMemory
    try {
      await base44.functions.invoke("getCompanyMemory", {});
      if (brandId) {
        const list = await base44.entities.CompanyMemory.filter({ brand_id: brandId }, "-created_date", 1).catch(() => []);
        if (list[0]) {
          await base44.entities.CompanyMemory.update(list[0].id, { resume_state_json: null });
        }
      }
    } catch { /* non-fatal */ }
  };

  // ── Persist resume state ──
  const persistResumeState = async (nextStep) => {
    if (!brandId) return;
    const payload = {
      step: nextStep,
      formValues: {
        brandName, websiteUrl, country, revenueRange, category, manual,
      },
      detectedTools: discovery.findings,
      confirmedTools: Array.from(confirmedTools),
      dismissedTools: Array.from(dismissedTools),
      timestamp: new Date().toISOString(),
    };
    try {
      const list = await base44.entities.CompanyMemory.filter({ brand_id: brandId }, "-created_date", 1).catch(() => []);
      if (list[0]) {
        await base44.entities.CompanyMemory.update(list[0].id, { resume_state_json: payload });
      } else {
        await base44.entities.CompanyMemory.create({
          brand_id: brandId,
          website_url: websiteUrl || undefined,
          last_seen_at: new Date().toISOString(),
          resume_state_json: payload,
        });
      }
    } catch { /* non-fatal */ }
  };

  // ── Brand auto-suggest from domain ──
  useEffect(() => {
    if (!brandName && websiteUrl) {
      const suggestion = autoSuggestBrandName(websiteUrl);
      if (suggestion) setBrandName(suggestion);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [websiteUrl]);

  // ── FIX 1 — Ensure a Brand exists for THIS website, not "the user's latest brand".
  // Resolution order, scoped to the current user:
  //   1. If brandId is already set, use it.
  //   2. Find an existing Brand whose normalized website matches the form domain.
  //   3. Otherwise create a new Brand with this website attached.
  // Cross-domain analyses can therefore never attach to an unrelated previous brand.
  const ensureBrand = async () => {
    if (brandId) return brandId;
    if (!brandName || !brandName.trim()) return null;

    const targetDomain = normalizeDomain(websiteUrl);
    try {
      const me = await base44.auth.me();
      const ownBrands = await base44.entities.Brand
        .filter({ created_by: me.email }, "-created_date", 50)
        .catch(() => []);

      // Step 2 — exact domain match wins
      if (targetDomain) {
        const match = ownBrands.find(b => normalizeDomain(b.website) === targetDomain);
        if (match) {
          setBrandId(match.id);
          return match.id;
        }
      }

      // Step 3 — create a fresh brand for this website
      const created = await base44.entities.Brand.create({
        name: brandName.trim(),
        website: websiteUrl ? (websiteUrl.includes("://") ? websiteUrl : `https://${websiteUrl}`) : undefined,
        category: CATEGORY_MAP[category] || "other",
        country: country || "",
        channels: ["dtc"],
      });
      setBrandId(created.id);
      return created.id;
    } catch {
      return null;
    }
  };

  // ── Website blur → run discovery ──
  const triggerDiscovery = async (url) => {
    if (!url || url.length < 4) return;
    if (url === lastDiscoveredUrl.current) return;
    lastDiscoveredUrl.current = url;

    setDiscovery({ status: "running", findings: [], jobId: null });

    try {
      const id = await ensureBrand();
      if (!id) {
        setDiscovery({ status: "idle", findings: [], jobId: null });
        return;
      }
      const res = await base44.functions.invoke("discoverCompanyInfrastructure", {
        website_url: url,
        brand_id: id,
      });
      const payload = res?.data || res;
      if (!payload?.ok) {
        setDiscovery({ status: "failed", findings: [], jobId: payload?.job_id || null });
        return;
      }
      const findings = payload.findings || [];

      // Default confirmed/dismissed per confidence
      const newConfirmed = new Set(confirmedTools);
      const newDismissed = new Set(dismissedTools);
      for (const f of findings) {
        const k = `${f.category}|${f.provider_or_tool}`;
        if (newConfirmed.has(k) || newDismissed.has(k)) continue;
        if (Number(f.confidence_score || 0) >= 0.5) newConfirmed.add(k);
        else newDismissed.add(k);
      }
      setConfirmedTools(newConfirmed);
      setDismissedTools(newDismissed);
      setDiscovery({ status: "completed", findings, jobId: payload.job_id });
    } catch {
      setDiscovery({ status: "failed", findings: [], jobId: null });
    }
  };

  // FIX 15 — 300ms minimum debounce on website discovery (non-blocking).
  const handleWebsiteBlur = () => {
    if (discoveryTimer.current) clearTimeout(discoveryTimer.current);
    const trimmed = (websiteUrl || "").trim();
    if (!trimmed || trimmed.length < 4) return;
    discoveryTimer.current = setTimeout(() => triggerDiscovery(trimmed), 300);
  };

  // FIX 15 — clear pending discovery debounce on unmount
  useEffect(() => {
    return () => { if (discoveryTimer.current) clearTimeout(discoveryTimer.current); };
  }, []);

  // ── Toggle a tool's confirmed/dismissed state ──
  const handleToggleTool = (key, action) => {
    setConfirmedTools(prev => {
      const next = new Set(prev);
      if (action === "confirm") next.add(key);
      else next.delete(key);
      return next;
    });
    setDismissedTools(prev => {
      const next = new Set(prev);
      if (action === "dismiss") next.add(key);
      else next.delete(key);
      return next;
    });
  };

  // ── Validate Step 1 ──
  const step1Valid =
    brandName.trim().length > 0 && websiteUrl.trim().length > 0 &&
    country.length > 0 && revenueRange.length > 0;

  // ── Continue from Step 1 ──
  const goStep2 = async () => {
    setErrorBanner("");
    if (!step1Valid) {
      const missing = [];
      if (!brandName.trim()) missing.push(t("error_brand_required"));
      if (!websiteUrl.trim()) missing.push(t("error_website_required"));
      if (!country) missing.push(t("error_country_required"));
      if (!revenueRange) missing.push(t("error_revenue_required"));
      setErrorBanner(missing.join("\n"));
      return;
    }
    await ensureBrand();
    setStep(2);
    persistResumeState(2);
  };

  // ── Continue from Step 2 ──
  const goStep3 = async () => {
    setErrorBanner("");
    setStep(3);
    persistResumeState(3);
  };

  // ── Check if Stripe is connected (after returning from OAuth) ──
  useEffect(() => {
    if (!brandId || step !== 3) return;
    let cancelled = false;
    (async () => {
      try {
        const list = await base44.entities.StripeConnection
          .filter({ brand_id: brandId, connection_status: "connected" }, "-last_sync_at", 1)
          .catch(() => []);
        if (!cancelled && list.length) setStripeConnected(true);
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, [brandId, step, resumeParam]);

  // ── Build AnalyzerInput payload ──
  const buildInputPayload = () => {
    const monthlyRevenue = midpointForRange(revenueRange);

    // From confirmed tools, derive payment_provider + shipping_provider hints
    const confirmedNames = new Set();
    for (const k of confirmedTools) {
      const name = k.split("|")[1];
      if (name) confirmedNames.add(name);
    }

    const payment_provider = manual.payment_provider
      || [...confirmedNames].find(n => PAYMENT_PROVIDERS.includes(n))
      || "";
    const shipping_provider = manual.shipping_provider
      || [...confirmedNames].find(n => SHIPPING_PROVIDERS.includes(n))
      || "";

    // Smart defaults for missing fields
    const bm = getBenchmarks(monthlyRevenue, country);
    const payment_fee_pct = manual.payment_fee_pct > 0 ? manual.payment_fee_pct : bm.payment.rate;
    const monthly_shipments = manual.monthly_shipments > 0 ? manual.monthly_shipments : 0;
    const monthly_shipping_cost = manual.monthly_shipping_cost > 0 ? manual.monthly_shipping_cost : 0;

    // SaaS spend: manual entry OR estimate from confirmed SaaS tools × €200
    let total_saas_spend = manual.total_saas_spend;
    if (!total_saas_spend) {
      const saasToolCount = [...confirmedNames].filter(n => COMMON_SAAS_TOOLS.includes(n)).length;
      total_saas_spend = saasToolCount * 200;
    }

    return {
      brand_id: brandId,
      monthly_revenue: monthlyRevenue,
      monthly_revenue_range: revenueRange,
      avg_order_value: 100, // not asked in flow; keep validation happy
      country,
      category,
      payment_provider,
      payment_fee_pct,
      shipping_provider,
      monthly_shipments,
      monthly_shipping_cost,
      total_saas_spend,
      banking_monthly_fees: manual.banking_monthly_fees,
      in_store_gmv: manual.has_physical_store ? manual.in_store_gmv : 0,
      tpe_transaction_fee_pct: manual.has_physical_store ? manual.tpe_transaction_fee_pct : 0,
      monthly_terminal_rental: manual.has_physical_store ? manual.monthly_terminal_rental : 0,
      fixed_banking_fees: manual.has_physical_store ? manual.fixed_banking_fees : 0,
      confirmed_tools: [...confirmedNames],
      dismissed_tools: [...dismissedTools].map(k => k.split("|")[1]).filter(Boolean),
      data_source: stripeConnected ? "hybrid" : "manual",
    };
  };

  // ── Run analysis (UNCHANGED business logic) ──
  // Auth is already guaranteed by the AnalyzerAuthGate shown before Step 1,
  // so no auth check is needed here.
  const runAnalysis = async () => {
    setErrorBanner("");

    const inputData = buildInputPayload();
    const validation = validateAnalyzerInput(inputData);
    if (!validation.valid) {
      setErrorBanner(t("please_fix") + "\n" + validation.errors.join("\n"));
      return;
    }

    setRunning(true);

    // Upgrade payment_fee_pct from live Stripe if connected
    let stripePaymentFeePct = null;
    if (stripeConnected && brandId) {
      try {
        const sc = await base44.entities.StripeConnection
          .filter({ brand_id: brandId, connection_status: "connected" }, "-last_sync_at", 1)
          .catch(() => []);
        if (sc.length && sc[0].effective_fee_pct > 0) {
          stripePaymentFeePct = sc[0].effective_fee_pct;
        }
      } catch { /* non-fatal */ }
    }
    if (stripePaymentFeePct != null) inputData.payment_fee_pct = stripePaymentFeePct;

    // SAME logic as before — single source of truth preserved
    const savings = calculateSavings(inputData);
    const scoreReport = computeInfraScore(inputData, stripeConnected ? "connected" : "manual");

    // Persist AnalyzerInput
    const input = await base44.entities.AnalyzerInput.create({
      brand_id: brandId,
      monthly_revenue: inputData.monthly_revenue,
      monthly_revenue_range: revenueRange,
      avg_order_value: inputData.avg_order_value,
      country,
      category,
      payment_provider: inputData.payment_provider,
      payment_fee_pct: inputData.payment_fee_pct,
      shipping_provider: inputData.shipping_provider,
      monthly_shipping_cost: inputData.monthly_shipping_cost,
      monthly_shipments: inputData.monthly_shipments,
      total_saas_spend: inputData.total_saas_spend,
      banking_monthly_fees: manual.banking_monthly_fees,
      in_store_gmv: inputData.in_store_gmv,
      tpe_transaction_fee_pct: inputData.tpe_transaction_fee_pct,
      monthly_terminal_rental: inputData.monthly_terminal_rental,
      fixed_banking_fees: inputData.fixed_banking_fees,
      confirmed_tools: inputData.confirmed_tools,
      dismissed_tools: inputData.dismissed_tools,
      data_source: stripeConnected ? "hybrid" : "manual",
    });

    // Credibility envelope
    const completeness = (() => {
      let filled = 0, total = 8;
      if (inputData.monthly_revenue > 0) filled++;
      if (inputData.payment_provider) filled++;
      if (inputData.payment_fee_pct > 0) filled++;
      if (inputData.shipping_provider) filled++;
      if (inputData.monthly_shipping_cost > 0) filled++;
      if (inputData.monthly_shipments > 0) filled++;
      if (inputData.total_saas_spend > 0) filled++;
      if (inputData.country) filled++;
      if (stripeConnected) filled += 1;
      return Math.min(100, Math.round((filled / total) * 100));
    })();
    const confidence = stripeConnected ? "high" : (completeness >= 80 ? "high" : completeness >= 50 ? "medium" : "low");

    const result = await base44.entities.AnalyzerResult.create({
      brand_id: brandId,
      input_id: input.id,
      payment_savings: savings.paymentSavings,
      shipping_savings: savings.shippingSavings,
      saas_savings: savings.saasSavings,
      total_savings: savings.totalSavings,
      infra_score: scoreReport.total,
      details: savings.details,
      confidence_level: confidence,
      data_completeness_score: completeness,
      score_engine_version:   ENGINE_VERSION.score,
      savings_model_version:  ENGINE_VERSION.savings,
      benchmark_version:      ENGINE_VERSION.benchmark,
      methodology: "3-step Analyzer flow: detected tools + smart defaults + tier/geo benchmarks. Savings = (current_rate − benchmark_rate) × annual_volume, capped at realistic recovery bands.",
      assumptions: [
        "Revenue taken at midpoint of selected range",
        "Benchmarks applied per revenue tier and geography (EU/UK)",
        `Score engine v${ENGINE_VERSION.score} · Savings v${ENGINE_VERSION.savings} · Benchmarks v${ENGINE_VERSION.benchmark}`,
        ...(stripeConnected ? ["Payment fee rate sourced from live Stripe connection"] : ["Payment fee rate estimated from benchmark"]),
      ],
      benchmark_source: "network_internal",
      verification_status: stripeConnected ? "pending_verification" : "estimated",
      next_best_action: stripeConnected
        ? "Connect carriers and finalize your provider list."
        : "Connect Stripe to upgrade your payments confidence to verified.",
    });

    setAnalysisDone(true);

    // FIX 27 — toast on analysis complete + navigation to Results
    toast.success(t("progress_ready"));
    setTimeout(() => navigate(`/Results?id=${result.id}`), 700);
  };

  // ── If running, render full-screen progress overlay ──
  if (running) {
    const monthlyRev = midpointForRange(revenueRange);
    return (
      <AnalysisProgress
        country={country || t("your_region")}
        tier={tierLabelForRevenue(monthlyRev, country)}
        done={analysisDone}
      />
    );
  }

  // ─────────────────────── UI ──────────────────────
  const progressPct = (step / 3) * 100;

  return (
    <div
      className="relative min-h-screen flex flex-col font-inter overflow-x-hidden"
      style={{
        color: "#ffffff",
        background:
          "linear-gradient(180deg, #0a0a0a 0%, #0b0e1a 25%, #0a0d18 55%, #0b1020 80%, #08090f 100%)",
      }}
    >
      {/* Fixed ambient grid + halos */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-0"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px)",
          backgroundSize: "56px 56px",
          opacity: 0.3,
          maskImage:
            "radial-gradient(ellipse 90% 70% at 50% 25%, #000 35%, transparent 100%)",
          WebkitMaskImage:
            "radial-gradient(ellipse 90% 70% at 50% 25%, #000 35%, transparent 100%)",
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

      {/* Gradient progress bar under navbar */}
      <div className="fixed top-14 left-0 right-0 z-50 h-[2px]" style={{ background: "rgba(255,255,255,0.06)" }}>
        <div
          className="h-full transition-all duration-500"
          style={{
            width: `${progressPct}%`,
            background: "linear-gradient(90deg, #3b82f6 0%, #22d3ee 100%)",
            boxShadow: "0 0 16px rgba(34,211,238,0.6)",
          }}
        />
      </div>

      {/* Step indicator — glass */}
      <div
        className="sticky top-14 z-40 flex items-center justify-between px-5 py-3"
        style={{
          background: "rgba(10,10,10,0.7)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        <span className="inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.22em] font-bold text-white/55">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75 animate-ping" />
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-cyan-400" />
          </span>
          Live audit
        </span>
        <div className="flex items-center gap-3">
          <StepIndicator current={step} total={3} />
          <span className="text-xs font-bold tabular-nums text-white/70">{step}/3</span>
        </div>
      </div>

      <main className="relative z-10 flex-1 max-w-lg mx-auto w-full px-5 pt-10 pb-36">
        {/* Resume offer */}
        {resumeOffer && step === 1 && (
          <div
            className="mb-6 rounded-2xl p-4"
            style={{
              background: "rgba(59,130,246,0.06)",
              border: "1px solid rgba(96,165,250,0.25)",
              backdropFilter: "blur(10px)",
              WebkitBackdropFilter: "blur(10px)",
            }}
          >
            <div className="flex items-start gap-3">
              <Sparkles size={16} className="text-cyan-300 mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-white">{t("welcome_back")}</p>
                <p className="text-[12px] text-white/55 mt-0.5">
                  {t("continue_where", { step: resumeOffer.step })}
                  {Array.isArray(resumeOffer.detectedTools) && resumeOffer.detectedTools.length > 0 &&
                    t("tools_detected_extra", { n: resumeOffer.detectedTools.length })}.
                </p>
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={() => applyResumeState(resumeOffer, true)}
                    className="h-9 px-4 rounded-full bg-white text-black text-xs font-bold inline-flex items-center gap-1.5"
                  >
                    {t("continue_label")} <ArrowRight size={12} />
                  </button>
                  <button
                    onClick={dismissResume}
                    className="h-9 px-4 rounded-full text-xs font-medium text-white/60 hover:text-white"
                    style={{ border: "1px solid rgba(255,255,255,0.15)", background: "rgba(255,255,255,0.03)" }}
                  >
                    {t("start_fresh")}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Inline error banner */}
        {errorBanner && (
          <div
            role="alert"
            aria-live="polite"
            className="mb-5 rounded-xl px-4 py-3 flex items-start gap-2.5"
            style={{
              background: "rgba(239,68,68,0.08)",
              border: "1px solid rgba(239,68,68,0.25)",
            }}
          >
            <AlertTriangle size={14} className="text-red-300 mt-0.5 shrink-0" aria-hidden="true" />
            <p className="text-[12px] text-red-200 leading-relaxed whitespace-pre-line">{errorBanner}</p>
          </div>
        )}

        {/* ──────────── STEP 1 ──────────── */}
        {step === 1 && (
          <div>
            <div className="inline-flex items-center gap-2 rounded-full px-3 py-1 mb-5"
              style={{
                border: "1px solid rgba(255,255,255,0.12)",
                background: "rgba(255,255,255,0.03)",
              }}
            >
              <span className="text-[10px] uppercase tracking-[0.22em] font-bold text-white/60">Step 01 · Brand</span>
            </div>
            <h1
              className="text-white mb-3"
              style={{
                fontFamily: "'Space Grotesk', 'Inter', sans-serif",
                fontSize: "clamp(28px, 4vw, 36px)",
                fontWeight: 900,
                letterSpacing: "-0.04em",
                lineHeight: 1.02,
              }}
            >
              {t("az_step1_title")}
            </h1>
            <p className="text-[14px] text-white/55 mb-7">{t("az_step1_sub")}</p>

            <div className="space-y-5">
              <div className="space-y-1.5">
                <Label htmlFor="az-website" className="text-[12px] font-semibold uppercase tracking-[0.14em] text-white/55">{t("field_website")}</Label>
                <Input
                  id="az-website"
                  value={websiteUrl}
                  onChange={e => setWebsiteUrl(e.target.value)}
                  onBlur={handleWebsiteBlur}
                  placeholder="yourbrand.com"
                  className="h-12 text-sm text-white placeholder:text-white/30"
                  style={{
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.12)",
                  }}
                  inputMode="url"
                  aria-required="true"
                />
                {discovery.status === "running" && (
                  <div className="flex items-center gap-1.5 text-[11px] text-white/55">
                    <Loader2 size={11} className="animate-spin text-cyan-400" />
                    {t("analyzing_your_infra")}
                  </div>
                )}
                {discovery.status === "completed" && discovery.findings.length > 0 && (
                  <p className="text-[11px] text-cyan-300 font-medium">
                    {t("found_tools_on_site", { n: discovery.findings.length, plural: discovery.findings.length === 1 ? "" : "s" })}
                  </p>
                )}
                {discovery.status === "completed" && discovery.findings.length === 0 && websiteUrl && (
                  <p className="text-[11px] text-white/40">{t("no_public_signals")}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="az-brand" className="text-[12px] font-semibold uppercase tracking-[0.14em] text-white/55">{t("field_brand_name")}</Label>
                <Input
                  id="az-brand"
                  value={brandName}
                  onChange={e => setBrandName(e.target.value)}
                  placeholder={t("your_brand_placeholder")}
                  className="h-12 text-sm text-white placeholder:text-white/30"
                  style={{
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.12)",
                  }}
                  aria-required="true"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="az-country" className="text-[12px] font-semibold uppercase tracking-[0.14em] text-white/55">{t("field_country")}</Label>
                <div className="relative">
                  <select
                    id="az-country"
                    value={country}
                    onChange={e => setCountry(e.target.value)}
                    aria-required="true"
                    className="w-full h-12 pl-9 pr-3 rounded-md text-sm appearance-none text-white"
                    style={{
                      background: "rgba(255,255,255,0.04)",
                      border: "1px solid rgba(255,255,255,0.12)",
                    }}
                  >
                    <option value="" style={{ background: "#0a0a0a" }}>{t("select_country")}</option>
                    {COUNTRIES.map(c => <option key={c} value={c} style={{ background: "#0a0a0a" }}>{c}</option>)}
                  </select>
                  <MapPin size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40 pointer-events-none" aria-hidden="true" />
                  <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 pointer-events-none" aria-hidden="true" />
                </div>
              </div>

              <div className="space-y-2">
                <Label id="az-revenue-label" className="text-[12px] font-semibold uppercase tracking-[0.14em] text-white/55">{t("field_revenue")}</Label>
                <div role="radiogroup" aria-labelledby="az-revenue-label" aria-required="true">
                  <RevenueRangePicker value={revenueRange} onChange={setRevenueRange} />
                </div>
              </div>

              <div className="space-y-2">
                <Label id="az-category-label" className="text-[12px] font-semibold uppercase tracking-[0.14em] text-white/55">{t("field_category")}</Label>
                <div role="radiogroup" aria-labelledby="az-category-label" className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {CATEGORY_OPTIONS.map(c => (
                    <button
                      key={c.key}
                      type="button"
                      role="radio"
                      aria-checked={category === c.key}
                      onClick={() => setCategory(c.key)}
                      className={`min-h-[44px] px-3 py-2 rounded-xl text-xs font-semibold transition-all ${
                        category === c.key
                          ? "bg-white text-black"
                          : "text-white/80 hover:text-white"
                      }`}
                      style={
                        category === c.key
                          ? { border: "1px solid rgba(255,255,255,0.95)" }
                          : { border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.03)" }
                      }
                    >
                      {t(c.i18n)}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <WhatHappensNext />
          </div>
        )}

        {/* ──────────── STEP 2 ──────────── */}
        {step === 2 && (
          <div>
            <div className="inline-flex items-center gap-2 rounded-full px-3 py-1 mb-5"
              style={{ border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.03)" }}
            >
              <span className="text-[10px] uppercase tracking-[0.22em] font-bold text-white/60">Step 02 · Infrastructure</span>
            </div>
            <h1
              className="text-white mb-3"
              style={{
                fontFamily: "'Space Grotesk', 'Inter', sans-serif",
                fontSize: "clamp(28px, 4vw, 36px)",
                fontWeight: 900,
                letterSpacing: "-0.04em",
                lineHeight: 1.02,
              }}
            >
              {t("az_step2_title")}
            </h1>
            <p className="text-[14px] text-white/55 mb-7">{t("az_step2_sub")}</p>

            <DetectedToolsGrid
              tools={tools}
              confirmed={confirmedTools}
              dismissed={dismissedTools}
              onToggle={handleToggleTool}
              discovering={discovery.status === "running"}
            />

            {/* Confidence indicator — surfaces signal strength to the user */}
            <div className="mt-5 flex items-center justify-between gap-3 flex-wrap">
              <ConfidenceIndicator
                level={(() => {
                  const confirmedCount = confirmedTools.size;
                  const manualFilled = (manual.payment_provider ? 1 : 0)
                    + (manual.shipping_provider ? 1 : 0)
                    + (manual.total_saas_spend > 0 ? 1 : 0);
                  const score = confirmedCount + manualFilled;
                  if (score >= 5) return "high";
                  if (score >= 2) return "medium";
                  return "low";
                })()}
              />
              <span className="text-[10px] text-white/45 font-mono">
                {confirmedTools.size} {confirmedTools.size === 1 ? "tool" : "tools"} confirmed
              </span>
            </div>

            {/* Manual section */}
            <div className="mt-6">
              <button
                type="button"
                onClick={() => setManualOpen(o => !o)}
                className="w-full flex items-center justify-between px-4 py-3 rounded-xl min-h-[48px] text-white/85 hover:text-white transition-colors"
                style={{
                  border: "1px solid rgba(255,255,255,0.12)",
                  background: "rgba(255,255,255,0.03)",
                }}
              >
                <span className="flex items-center gap-2 text-sm font-semibold">
                  <Plus size={14} /> {t("add_manually")}
                </span>
                {manualOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>

              {manualOpen && (
                <div
                  className="mt-3 space-y-5 rounded-2xl p-4"
                  style={{
                    border: "1px solid rgba(255,255,255,0.08)",
                    background: "rgba(255,255,255,0.02)",
                  }}
                >
                  <div className="space-y-1.5">
                    <Label className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/55">{t("field_payment_provider")}</Label>
                    <select
                      value={manual.payment_provider}
                      onChange={e => setManual(m => ({ ...m, payment_provider: e.target.value }))}
                      className="w-full h-11 px-3 rounded-md text-sm text-white" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.12)" }}
                    >
                      <option value="">{t("select_provider")}</option>
                      {PAYMENT_PROVIDERS.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                    <Label className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/55 pt-2 block">{t("field_payment_fee")}</Label>
                    <Input
                      type="number" step="0.01" min={0} max={15} inputMode="decimal"
                      value={manual.payment_fee_pct || ""}
                      onChange={e => setManual(m => ({ ...m, payment_fee_pct: Number(e.target.value) }))}
                      placeholder="e.g. 2.9"
                      className="h-11 text-sm text-white placeholder:text-white/30" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.12)" }}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/55">{t("field_shipping_provider")}</Label>
                    <select
                      value={manual.shipping_provider}
                      onChange={e => setManual(m => ({ ...m, shipping_provider: e.target.value }))}
                      className="w-full h-11 px-3 rounded-md text-sm text-white" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.12)" }}
                    >
                      <option value="">{t("select_carrier")}</option>
                      {SHIPPING_PROVIDERS.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                    <Label className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/55 pt-2 block">{t("field_shipments")}</Label>
                    <Input
                      type="number" min={0} inputMode="numeric"
                      value={manual.monthly_shipments || ""}
                      onChange={e => setManual(m => ({ ...m, monthly_shipments: Number(e.target.value) }))}
                      placeholder="e.g. 400"
                      className="h-11 text-sm text-white placeholder:text-white/30" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.12)" }}
                    />
                    <Label className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/55 pt-2 block">{t("field_shipping_cost")}</Label>
                    <Input
                      type="number" min={0} inputMode="numeric"
                      value={manual.monthly_shipping_cost || ""}
                      onChange={e => setManual(m => ({ ...m, monthly_shipping_cost: Number(e.target.value) }))}
                      placeholder="e.g. 3000"
                      className="h-11 text-sm text-white placeholder:text-white/30" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.12)" }}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/55">{t("field_saas_tools")}</Label>
                    <div className="grid grid-cols-2 gap-2">
                      {COMMON_SAAS_TOOLS.map(toolName => {
                        const active = manual.saas_tools_selected.includes(toolName);
                        return (
                          <button
                            key={toolName}
                            type="button"
                            onClick={() => setManual(m => ({
                              ...m,
                              saas_tools_selected: active
                                ? m.saas_tools_selected.filter(x => x !== toolName)
                                : [...m.saas_tools_selected, toolName],
                            }))}
                            className={`min-h-[44px] px-3 rounded-xl text-xs font-semibold transition-colors ${
                                  active ? "bg-white text-black" : "text-white/80 hover:text-white"
                                }`}
                                style={
                                  active
                                    ? { border: "1px solid rgba(255,255,255,0.95)" }
                                    : { border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.03)" }
                                }
                          >
                            {toolName}
                          </button>
                        );
                      })}
                    </div>
                    <Label className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/55 pt-2 block">{t("field_saas_spend")}</Label>
                    <Input
                      type="number" min={0} inputMode="numeric"
                      value={manual.total_saas_spend || ""}
                      onChange={e => setManual(m => ({ ...m, total_saas_spend: Number(e.target.value) }))}
                      placeholder="e.g. 1500"
                      className="h-11 text-sm text-white placeholder:text-white/30" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.12)" }}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/55">{t("field_banking_fees_label")}</Label>
                    <Input
                      type="number" min={0} inputMode="numeric"
                      value={manual.banking_monthly_fees || ""}
                      onChange={e => setManual(m => ({ ...m, banking_monthly_fees: Number(e.target.value) }))}
                      placeholder="e.g. 40"
                      className="h-11 text-sm text-white placeholder:text-white/30" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.12)" }}
                    />
                  </div>

                  <div className="space-y-2 pt-3" style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}>
                    <button
                      type="button"
                      onClick={() => setManual(m => ({ ...m, has_physical_store: !m.has_physical_store }))}
                      className="w-full flex items-center justify-between px-3 py-3 rounded-xl min-h-[44px] text-white"
                      style={{ border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.03)" }}
                    >
                      <span className="flex items-center gap-2 text-xs font-semibold">
                        <Store size={13} /> {t("physical_store_q")}
                      </span>
                      <span className={`text-[11px] font-bold ${manual.has_physical_store ? "text-cyan-300" : "text-white/45"}`}>
                        {manual.has_physical_store ? t("yes") : t("no")}
                      </span>
                    </button>

                    {manual.has_physical_store && (
                      <div className="space-y-1.5 px-1">
                        <Label className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/55">{t("in_store_gmv_q")}</Label>
                        <Input
                          type="number" min={0} inputMode="numeric"
                          value={manual.in_store_gmv || ""}
                          onChange={e => setManual(m => ({ ...m, in_store_gmv: Number(e.target.value) }))}
                          className="h-11 text-sm text-white placeholder:text-white/30" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.12)" }}
                        />
                        <Label className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/55 pt-2 block">{t("in_store_fee_q")}</Label>
                        <Input
                          type="number" step="0.01" min={0} max={5} inputMode="decimal"
                          value={manual.tpe_transaction_fee_pct || ""}
                          onChange={e => setManual(m => ({ ...m, tpe_transaction_fee_pct: Number(e.target.value) }))}
                          className="h-11 text-sm text-white placeholder:text-white/30" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.12)" }}
                        />
                        <Label className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/55 pt-2 block">{t("terminal_rental_q")}</Label>
                        <Input
                          type="number" min={0} inputMode="numeric"
                          value={manual.monthly_terminal_rental || ""}
                          onChange={e => setManual(m => ({ ...m, monthly_terminal_rental: Number(e.target.value) }))}
                          className="h-11 text-sm text-white placeholder:text-white/30" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.12)" }}
                        />
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ──────────── STEP 3 ──────────── */}
        {step === 3 && (
          <div>
            <div className="inline-flex items-center gap-2 rounded-full px-3 py-1 mb-5"
              style={{ border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.03)" }}
            >
              <span className="text-[10px] uppercase tracking-[0.22em] font-bold text-white/60">Step 03 · Verify</span>
            </div>
            <h1
              className="text-white mb-3"
              style={{
                fontFamily: "'Space Grotesk', 'Inter', sans-serif",
                fontSize: "clamp(28px, 4vw, 36px)",
                fontWeight: 900,
                letterSpacing: "-0.04em",
                lineHeight: 1.02,
              }}
            >
              {t("az_step3_title")}
            </h1>
            <p className="text-[14px] text-white/55 mb-7">{t("az_step3_sub")}</p>

            {stripeConnected ? (
              <div className="space-y-4">
                <div
                  className="rounded-2xl p-6 text-center"
                  style={{
                    background: "rgba(52,211,153,0.08)",
                    border: "1px solid rgba(52,211,153,0.30)",
                    boxShadow: "0 0 32px rgba(52,211,153,0.18)",
                  }}
                >
                  <ShieldCheck size={28} className="mx-auto mb-2 text-emerald-300" />
                  <p className="text-sm font-black text-emerald-300">{t("az_step3_verified")}</p>
                </div>
                <UpgradeToVerified vertical="payments" isConnected currentConfidence="verified" />
              </div>
            ) : (
              <div className="space-y-4">
                <StripeConnectCard redirectAfter="/Analyzer?resume=true" />
                <UpgradeToVerified
                  vertical="payments"
                  currentConfidence="estimated"
                  isConnected={false}
                  onConnect={() => {
                    // Persist resume state before OAuth redirect so we can restore on return
                    persistResumeState(3);
                  }}
                />
              </div>
            )}

            <div className="mt-6 text-center">
              <button
                onClick={runAnalysis}
                className="text-xs font-semibold text-white/50 hover:text-white underline underline-offset-2 transition-colors"
              >
                {stripeConnected ? t("confirm_cta") : t("az_step3_skip")}
              </button>
            </div>
          </div>
        )}
      </main>

      {/* Footer actions — glass */}
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
          onClick={() => {
            if (step === 1) {
              navigate("/");
              return;
            }
            setStep(s => s - 1);
          }}
          className="h-11 rounded-full px-4 text-sm font-medium text-white/60 hover:text-white hover:bg-white/5"
        >
          <ArrowLeft className="mr-1.5 h-4 w-4" />
          {t("back_label")}
        </Button>

        {step === 1 && (
          <Button
            onClick={goStep2}
            disabled={!step1Valid}
            className="h-11 rounded-full px-6 text-sm font-bold gap-2 bg-white text-black hover:bg-white/90 disabled:opacity-40"
            style={{
              boxShadow: "0 0 0 1px rgba(255,255,255,0.1), 0 12px 32px -12px rgba(59,130,246,0.55), 0 0 28px rgba(59,130,246,0.22)",
            }}
          >
            {t("continue_label")} <ArrowRight className="h-4 w-4" />
          </Button>
        )}
        {step === 2 && (
          <Button
            onClick={goStep3}
            className="h-11 rounded-full px-6 text-sm font-bold gap-2 bg-white text-black hover:bg-white/90"
            style={{
              boxShadow: "0 0 0 1px rgba(255,255,255,0.1), 0 12px 32px -12px rgba(59,130,246,0.55), 0 0 28px rgba(59,130,246,0.22)",
            }}
          >
            {t("continue_label")} <ArrowRight className="h-4 w-4" />
          </Button>
        )}
        {step === 3 && (
          <Button
            onClick={runAnalysis}
            className="h-11 rounded-full px-6 text-sm font-bold gap-2 text-white hover:opacity-90"
            style={{
              background: "linear-gradient(135deg, #1F4ED8 0%, #2CA7C1 100%)",
              boxShadow: "0 0 32px rgba(34,211,238,0.45), 0 12px 32px -12px rgba(34,211,238,0.6)",
            }}
          >
            {t("run_analysis_cta")} <ArrowRight className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}