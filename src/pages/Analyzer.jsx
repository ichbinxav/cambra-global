import React, { useEffect, useRef, useState } from "react";
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
import RevenueRangePicker, { midpointForRange } from "@/components/analyzer/RevenueRangePicker";
import DetectedToolsGrid from "@/components/analyzer/DetectedToolsGrid";
import AnalysisProgress from "@/components/analyzer/AnalysisProgress";
import UpgradeToVerified from "@/components/shared/UpgradeToVerified";
import {
  computeInfraScore, calculateSavings, getBenchmarks,
  ENGINE_VERSION, validateAnalyzerInput,
} from "@/lib/scoreEngine";

// ─── Category mapping (explicit, no regex) ─────────────────────────────────
const CATEGORY_OPTIONS = [
  "Fashion", "Beauty", "Food & Beverage", "Electronics", "Home & Living",
  "Sports & Outdoors", "Health & Wellness", "Toys & Kids", "Pets",
  "Jewelry & Accessories", "Books & Media", "Automotive", "B2B & Wholesale", "Other",
];
const CATEGORY_MAP = {
  "Fashion": "fashion", "Beauty": "beauty", "Food & Beverage": "food_bev",
  "Electronics": "electronics", "Home & Living": "home_living",
  "Sports & Outdoors": "sports", "Health & Wellness": "health",
  "Toys & Kids": "toys", "Pets": "pets", "Jewelry & Accessories": "jewelry",
  "Books & Media": "media", "Automotive": "automotive",
  "B2B & Wholesale": "b2b", "Other": "other",
};

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

function tierLabelForRevenue(monthlyRevenue, country) {
  const b = getBenchmarks(monthlyRevenue, country);
  const tierMap = { micro: "micro", small: "small", mid: "mid", large: "large" };
  return tierMap[b.tier] || "your tier";
}

// ─── Main component ────────────────────────────────────────────────────────
export default function Analyzer() {
  const navigate = useNavigate();
  const urlParams = new URLSearchParams(window.location.search);
  const resumeParam = urlParams.get("resume") === "true";

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

  // ── Ensure a Brand exists (needed for discovery + memory writes) ──
  const ensureBrand = async () => {
    if (brandId) return brandId;
    if (!brandName || !brandName.trim()) return null;
    try {
      // Try to reuse the user's latest brand
      const me = await base44.auth.me();
      const existing = await base44.entities.Brand.filter({ created_by: me.email }, "-created_date", 1).catch(() => []);
      if (existing.length) {
        setBrandId(existing[0].id);
        return existing[0].id;
      }
      const created = await base44.entities.Brand.create({
        name: brandName.trim(),
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

  const handleWebsiteBlur = () => {
    if (discoveryTimer.current) clearTimeout(discoveryTimer.current);
    discoveryTimer.current = setTimeout(() => triggerDiscovery(websiteUrl), 200);
  };

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
      setErrorBanner("Please complete brand name, website, country and monthly revenue.");
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
  const runAnalysis = async () => {
    setErrorBanner("");
    const isAuthed = await base44.auth.isAuthenticated();
    if (!isAuthed) {
      base44.auth.redirectToLogin(window.location.pathname + window.location.search);
      return;
    }

    const inputData = buildInputPayload();
    const validation = validateAnalyzerInput(inputData);
    if (!validation.valid) {
      setErrorBanner("Please fix the following:\n" + validation.errors.join("\n"));
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

    // Hold the success state for one tick of progress, then navigate
    setTimeout(() => navigate(`/Results?id=${result.id}`), 700);
  };

  // ── If running, render full-screen progress overlay ──
  if (running) {
    const monthlyRev = midpointForRange(revenueRange);
    return (
      <AnalysisProgress
        country={country || "your region"}
        tier={tierLabelForRevenue(monthlyRev, country)}
        done={analysisDone}
      />
    );
  }

  // ─────────────────────── UI ──────────────────────
  const progressPct = (step / 3) * 100;

  return (
    <div className="relative min-h-screen flex flex-col bg-background font-inter overflow-x-hidden">
      <Navbar />

      {/* Gradient progress bar under navbar */}
      <div className="fixed top-14 left-0 right-0 z-50 h-[3px] bg-border/30">
        <div
          className="h-full transition-all duration-500"
          style={{
            width: `${progressPct}%`,
            background: "linear-gradient(90deg, #1F4ED8 0%, #2CA7C1 100%)",
            boxShadow: "0 0 12px rgba(44,167,193,0.5)",
          }}
        />
      </div>

      {/* Step indicator */}
      <div className="sticky top-14 z-40 flex items-center justify-between px-5 py-3 border-b border-border/40 bg-background/95 backdrop-blur-xl">
        <span className="text-sm font-black tracking-tight">CAMBRA</span>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-muted-foreground/60">~2 minutes</span>
          <span className="text-xs font-semibold tabular-nums text-muted-foreground">{step}/3</span>
        </div>
      </div>

      <main className="relative flex-1 max-w-lg mx-auto w-full px-5 pt-8 pb-36">
        {/* Resume offer */}
        {resumeOffer && step === 1 && (
          <div className="mb-6 rounded-2xl border border-blue-200 bg-blue-50 p-4">
            <div className="flex items-start gap-3">
              <Sparkles size={16} className="text-blue-600 mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-foreground">Welcome back.</p>
                <p className="text-[12px] text-muted-foreground mt-0.5">
                  Continue where you left off? Last step: {resumeOffer.step}
                  {Array.isArray(resumeOffer.detectedTools) && resumeOffer.detectedTools.length > 0 &&
                    ` · ${resumeOffer.detectedTools.length} tools detected`}.
                </p>
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={() => applyResumeState(resumeOffer, true)}
                    className="h-9 px-4 rounded-full bg-foreground text-background text-xs font-bold inline-flex items-center gap-1.5"
                  >
                    Continue <ArrowRight size={12} />
                  </button>
                  <button
                    onClick={dismissResume}
                    className="h-9 px-4 rounded-full border border-border/60 bg-white text-xs font-medium text-muted-foreground hover:text-foreground"
                  >
                    Start fresh
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Inline error banner */}
        {errorBanner && (
          <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 flex items-start gap-2.5">
            <AlertTriangle size={14} className="text-red-600 mt-0.5 shrink-0" />
            <p className="text-[12px] text-red-700 leading-relaxed whitespace-pre-line">{errorBanner}</p>
          </div>
        )}

        {/* ──────────── STEP 1 ──────────── */}
        {step === 1 && (
          <div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-[-0.03em] mb-2">Tell us about your brand</h1>
            <p className="text-sm text-muted-foreground mb-6">We'll map your infrastructure automatically.</p>

            <div className="space-y-5">
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">Website</Label>
                <Input
                  value={websiteUrl}
                  onChange={e => setWebsiteUrl(e.target.value)}
                  onBlur={handleWebsiteBlur}
                  placeholder="yourbrand.com"
                  className="h-12 text-sm border-border/60"
                  inputMode="url"
                />
                {discovery.status === "running" && (
                  <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <Loader2 size={11} className="animate-spin text-cambra-cyan" />
                    Analyzing your infrastructure…
                  </div>
                )}
                {discovery.status === "completed" && discovery.findings.length > 0 && (
                  <p className="text-[11px] text-emerald-700 font-medium">
                    Found {discovery.findings.length} tool{discovery.findings.length === 1 ? "" : "s"} on your site.
                  </p>
                )}
                {discovery.status === "completed" && discovery.findings.length === 0 && websiteUrl && (
                  <p className="text-[11px] text-muted-foreground">No public signals detected — you'll add tools manually in the next step.</p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label className="text-sm font-medium">Brand name</Label>
                <Input
                  value={brandName}
                  onChange={e => setBrandName(e.target.value)}
                  placeholder="Your brand name"
                  className="h-12 text-sm border-border/60"
                />
                <p className="text-[11px] text-muted-foreground/60">
                  Auto-suggested from your domain. You can change it.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label className="text-sm font-medium">Country</Label>
                <div className="relative">
                  <select
                    value={country}
                    onChange={e => setCountry(e.target.value)}
                    className="w-full h-12 pl-9 pr-3 rounded-md border border-border/60 bg-white text-sm appearance-none text-foreground"
                  >
                    <option value="">Select your country</option>
                    {COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <MapPin size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/50 pointer-events-none" />
                  <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/50 pointer-events-none" />
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium">Monthly revenue</Label>
                <RevenueRangePicker value={revenueRange} onChange={setRevenueRange} />
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium flex items-center gap-2">
                  Category <span className="text-[10px] text-muted-foreground/60 font-normal">(optional)</span>
                </Label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {CATEGORY_OPTIONS.map(c => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setCategory(c)}
                      className={`min-h-[44px] px-3 py-2 rounded-xl border text-xs font-semibold transition-all ${
                        category === c
                          ? "border-foreground bg-foreground text-background"
                          : "border-border/60 bg-white text-foreground hover:border-foreground/40"
                      }`}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ──────────── STEP 2 ──────────── */}
        {step === 2 && (
          <div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-[-0.03em] mb-2">We found your stack</h1>
            <p className="text-sm text-muted-foreground mb-6">Confirm what looks right. Add anything missing.</p>

            <DetectedToolsGrid
              tools={tools}
              confirmed={confirmedTools}
              dismissed={dismissedTools}
              onToggle={handleToggleTool}
            />

            {/* Manual section */}
            <div className="mt-6">
              <button
                type="button"
                onClick={() => setManualOpen(o => !o)}
                className="w-full flex items-center justify-between px-4 py-3 rounded-xl border border-border/60 bg-white min-h-[48px]"
              >
                <span className="flex items-center gap-2 text-sm font-semibold">
                  <Plus size={14} /> Anything missing? Add manually
                </span>
                {manualOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>

              {manualOpen && (
                <div className="mt-3 space-y-5 rounded-2xl border border-border/40 bg-secondary/30 p-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold">Who processes your payments?</Label>
                    <select
                      value={manual.payment_provider}
                      onChange={e => setManual(m => ({ ...m, payment_provider: e.target.value }))}
                      className="w-full h-11 px-3 rounded-md border border-border/60 bg-white text-sm"
                    >
                      <option value="">Select a provider</option>
                      {PAYMENT_PROVIDERS.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                    <Label className="text-xs font-semibold pt-2 block">What % do you pay in fees?</Label>
                    <Input
                      type="number" step="0.01" min={0} max={15} inputMode="decimal"
                      value={manual.payment_fee_pct || ""}
                      onChange={e => setManual(m => ({ ...m, payment_fee_pct: Number(e.target.value) }))}
                      placeholder="e.g. 2.9"
                      className="h-11 text-sm border-border/60"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold">How do you ship orders?</Label>
                    <select
                      value={manual.shipping_provider}
                      onChange={e => setManual(m => ({ ...m, shipping_provider: e.target.value }))}
                      className="w-full h-11 px-3 rounded-md border border-border/60 bg-white text-sm"
                    >
                      <option value="">Select a carrier</option>
                      {SHIPPING_PROVIDERS.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                    <Label className="text-xs font-semibold pt-2 block">How many orders/month?</Label>
                    <Input
                      type="number" min={0} inputMode="numeric"
                      value={manual.monthly_shipments || ""}
                      onChange={e => setManual(m => ({ ...m, monthly_shipments: Number(e.target.value) }))}
                      placeholder="e.g. 400"
                      className="h-11 text-sm border-border/60"
                    />
                    <Label className="text-xs font-semibold pt-2 block">Monthly shipping cost?</Label>
                    <Input
                      type="number" min={0} inputMode="numeric"
                      value={manual.monthly_shipping_cost || ""}
                      onChange={e => setManual(m => ({ ...m, monthly_shipping_cost: Number(e.target.value) }))}
                      placeholder="e.g. 3000"
                      className="h-11 text-sm border-border/60"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold">What software tools do you use?</Label>
                    <div className="grid grid-cols-2 gap-2">
                      {COMMON_SAAS_TOOLS.map(t => {
                        const active = manual.saas_tools_selected.includes(t);
                        return (
                          <button
                            key={t}
                            type="button"
                            onClick={() => setManual(m => ({
                              ...m,
                              saas_tools_selected: active
                                ? m.saas_tools_selected.filter(x => x !== t)
                                : [...m.saas_tools_selected, t],
                            }))}
                            className={`min-h-[44px] px-3 rounded-xl border text-xs font-semibold ${
                              active
                                ? "border-foreground bg-foreground text-background"
                                : "border-border/60 bg-white text-foreground"
                            }`}
                          >
                            {t}
                          </button>
                        );
                      })}
                    </div>
                    <Label className="text-xs font-semibold pt-2 block">Total monthly spend on software?</Label>
                    <Input
                      type="number" min={0} inputMode="numeric"
                      value={manual.total_saas_spend || ""}
                      onChange={e => setManual(m => ({ ...m, total_saas_spend: Number(e.target.value) }))}
                      placeholder="e.g. 1500"
                      className="h-11 text-sm border-border/60"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold">Banking fees (monthly)</Label>
                    <Input
                      type="number" min={0} inputMode="numeric"
                      value={manual.banking_monthly_fees || ""}
                      onChange={e => setManual(m => ({ ...m, banking_monthly_fees: Number(e.target.value) }))}
                      placeholder="e.g. 40"
                      className="h-11 text-sm border-border/60"
                    />
                  </div>

                  <div className="space-y-2 pt-2 border-t border-border/30">
                    <button
                      type="button"
                      onClick={() => setManual(m => ({ ...m, has_physical_store: !m.has_physical_store }))}
                      className="w-full flex items-center justify-between px-3 py-3 rounded-xl border border-border/60 bg-white min-h-[44px]"
                    >
                      <span className="flex items-center gap-2 text-xs font-semibold">
                        <Store size={13} /> Do you have a physical store?
                      </span>
                      <span className={`text-[11px] font-bold ${manual.has_physical_store ? "text-emerald-600" : "text-muted-foreground"}`}>
                        {manual.has_physical_store ? "Yes" : "No"}
                      </span>
                    </button>

                    {manual.has_physical_store && (
                      <div className="space-y-1.5 px-1">
                        <Label className="text-xs font-semibold">Monthly in-store GMV?</Label>
                        <Input
                          type="number" min={0} inputMode="numeric"
                          value={manual.in_store_gmv || ""}
                          onChange={e => setManual(m => ({ ...m, in_store_gmv: Number(e.target.value) }))}
                          className="h-11 text-sm border-border/60"
                        />
                        <Label className="text-xs font-semibold pt-2 block">In-store transaction fee %?</Label>
                        <Input
                          type="number" step="0.01" min={0} max={5} inputMode="decimal"
                          value={manual.tpe_transaction_fee_pct || ""}
                          onChange={e => setManual(m => ({ ...m, tpe_transaction_fee_pct: Number(e.target.value) }))}
                          className="h-11 text-sm border-border/60"
                        />
                        <Label className="text-xs font-semibold pt-2 block">Monthly terminal rental?</Label>
                        <Input
                          type="number" min={0} inputMode="numeric"
                          value={manual.monthly_terminal_rental || ""}
                          onChange={e => setManual(m => ({ ...m, monthly_terminal_rental: Number(e.target.value) }))}
                          className="h-11 text-sm border-border/60"
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
            <h1 className="text-2xl sm:text-3xl font-black tracking-[-0.03em] mb-2">Upgrade to verified</h1>
            <p className="text-sm text-muted-foreground mb-6">
              Connect Stripe to verify your payment costs and improve your benchmark.
            </p>

            {stripeConnected ? (
              <div className="space-y-4">
                <div className="rounded-2xl border border-emerald-300 bg-emerald-50 p-5 text-center">
                  <ShieldCheck size={28} className="mx-auto mb-2 text-emerald-600" />
                  <p className="text-sm font-black text-emerald-800">Payments upgraded to verified ✓</p>
                  <p className="text-[12px] text-emerald-700 mt-1">
                    Your benchmark is now based on real data.
                  </p>
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
                className="text-xs font-semibold text-muted-foreground hover:text-foreground underline underline-offset-2"
              >
                {stripeConnected ? "Continue to analysis →" : "Skip for now — use estimated figures"}
              </button>
            </div>
          </div>
        )}
      </main>

      {/* Footer actions */}
      <div className="fixed bottom-0 left-0 right-0 z-40 flex items-center justify-between px-5 py-3 border-t border-border/40 bg-background/95 backdrop-blur-xl">
        <Button
          variant="ghost"
          onClick={() => {
            if (step === 1) {
              navigate("/");
              return;
            }
            setStep(s => s - 1);
          }}
          className="h-11 rounded-full px-4 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="mr-1.5 h-4 w-4" />
          Back
        </Button>

        {step === 1 && (
          <Button
            onClick={goStep2}
            disabled={!step1Valid}
            className="h-11 rounded-full px-6 text-sm font-bold gap-2 bg-foreground text-background hover:opacity-90 disabled:opacity-50"
          >
            Continue <ArrowRight className="h-4 w-4" />
          </Button>
        )}
        {step === 2 && (
          <Button
            onClick={goStep3}
            className="h-11 rounded-full px-6 text-sm font-bold gap-2 bg-foreground text-background hover:opacity-90"
          >
            Continue <ArrowRight className="h-4 w-4" />
          </Button>
        )}
        {step === 3 && (
          <Button
            onClick={runAnalysis}
            className="h-11 rounded-full px-6 text-sm font-bold gap-2 bg-saas-gradient text-white hover:opacity-90 shadow-[0_0_24px_rgba(44,167,193,0.35)]"
          >
            Run analysis <ArrowRight className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}