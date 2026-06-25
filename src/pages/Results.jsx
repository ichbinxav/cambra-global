import { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  ArrowRight, CreditCard, Truck, Package, CheckCircle2, Sparkles,
  Share2, ChevronDown, ChevronUp, Plug, Building2, Store, Mail,
  Headphones, Users, Wifi, Layers, AlertTriangle,
} from "lucide-react";
import { base44 } from "@/api/base44Client";
import UpgradeToVerified from "@/components/shared/UpgradeToVerified";

/* ── helpers ─────────────────────────────────────────────────── */
function formatEur(n) {
  const v = Math.max(0, Math.round(Number(n) || 0));
  return `€${v.toLocaleString()}`;
}

function getRevenueTier(monthlyRevenue = 0) {
  if (monthlyRevenue >= 500000) return "large";
  if (monthlyRevenue >= 100000) return "mid";
  if (monthlyRevenue >= 30000) return "small";
  return "micro";
}

function tierLabel(tier) {
  return { micro: "micro", small: "small", mid: "mid-market", large: "large" }[tier] || "small";
}

/* node_type → category bucket + icon */
const NODE_CATEGORY = {
  payment_provider:   { key: "Payments",  icon: CreditCard },
  commerce_platform:  { key: "Commerce",  icon: Store },
  shipping_carrier:   { key: "Shipping",  icon: Truck },
  logistics:          { key: "Shipping",  icon: Truck },
  marketing:          { key: "Marketing", icon: Mail },
  saas_tool:          { key: "SaaS",      icon: Package },
  analytics:          { key: "SaaS",      icon: Package },
  support:            { key: "Support",   icon: Headphones },
  bank:               { key: "Banking",   icon: Building2 },
  insurance:          { key: "Banking",   icon: Building2 },
  telecom:            { key: "Telecom",   icon: Wifi },
  hr_tool:            { key: "HR",        icon: Users },
};
const CATEGORY_ORDER = ["Payments", "Commerce", "Shipping", "Marketing", "SaaS", "Banking", "Support", "HR", "Telecom"];

function nodeBadge(node) {
  const status = node.status || "detected";
  const cc = node.cost_confidence || "estimated";
  if (status === "verified" || cc === "verified") {
    return { label: "Verified", cls: "bg-emerald-500/10 text-emerald-600 border-emerald-500/25" };
  }
  if (status === "connected" || cc === "connected") {
    return { label: "Connected", cls: "bg-blue-500/10 text-blue-600 border-blue-500/25" };
  }
  if (status === "detected") {
    return { label: "Detected", cls: "bg-purple-500/10 text-purple-600 border-purple-500/25" };
  }
  return { label: "Estimated", cls: "bg-amber-500/10 text-amber-600 border-amber-500/25" };
}

function dataSourceLabel(node) {
  const ds = node.data_source || "";
  if (ds === "stripe_inference") return "via Stripe";
  if (ds === "oauth") return "via connected account";
  if (ds === "discovery") return "via website";
  if (ds === "manual") return "manual";
  return "estimated";
}

/* ── main ────────────────────────────────────────────────────── */
export default function Results() {
  const [result, setResult] = useState(null);
  const [input, setInput] = useState(null);
  const [stripeConn, setStripeConn] = useState(null);
  const [benchmarks, setBenchmarks] = useState({ payments: null, shipping: null, saas: null });
  const [graphNodes, setGraphNodes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [needsAuth, setNeedsAuth] = useState(false);
  const [showHow, setShowHow] = useState(false);
  const [toastMsg, setToastMsg] = useState("");
  const verticalsRef = useRef(null);

  useEffect(() => {
    (async () => {
      const urlId = new URLSearchParams(window.location.search).get("id");
      const authed = await base44.auth.isAuthenticated();
      if (!authed) { setNeedsAuth(true); setLoading(false); return; }
      const me = await base44.auth.me();

      // Load AnalyzerResult
      let res = [];
      if (urlId) res = await base44.entities.AnalyzerResult.filter({ id: urlId });
      if (!res.length) res = await base44.entities.AnalyzerResult.filter({ created_by_id: me.id }, "-created_date", 1);
      if (!res.length) { setLoading(false); setResult(null); return; }
      const r = res[0];
      if (r.created_by_id && r.created_by_id !== me.id) { setLoading(false); setResult(null); return; }
      setResult(r);

      // Load AnalyzerInput
      let inputRow = null;
      if (r.input_id) {
        const inputs = await base44.entities.AnalyzerInput.filter({ id: r.input_id });
        inputRow = inputs[0] || null;
        setInput(inputRow);
      }

      // Load StripeConnection for this brand
      if (r.brand_id) {
        try {
          const sc = await base44.entities.StripeConnection
            .filter({ brand_id: r.brand_id, connection_status: "connected" }, "-last_sync_at", 1);
          setStripeConn(sc[0] || null);
        } catch (_) { /* RLS may block — treat as not connected */ }
      }

      // Load benchmarks per vertical
      const monthlyRev = Number(inputRow?.monthly_revenue || 0);
      const tier = getRevenueTier(monthlyRev);
      const country = inputRow?.country || "";
      const fetchBm = async (vertical) => {
        try {
          const resp = await base44.functions.invoke("getBenchmarkForReport", { vertical, revenue_tier: tier, country });
          return resp?.data || resp || null;
        } catch (_) { return null; }
      };
      const [bmPay, bmShip, bmSaas] = await Promise.all([fetchBm("payments"), fetchBm("shipping"), fetchBm("saas")]);
      setBenchmarks({ payments: bmPay, shipping: bmShip, saas: bmSaas });

      // Load Infrastructure graph
      if (r.brand_id) {
        try {
          const g = await base44.functions.invoke("getInfrastructureGraph", { brand_id: r.brand_id });
          const payload = g?.data || g;
          if (payload?.ok) setGraphNodes(payload.nodes || []);
        } catch (_) { /* non-blocking */ }
      }

      setLoading(false);
    })();
  }, []);

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center space-y-4">
        <div className="w-10 h-10 rounded-full border-2 border-border border-t-foreground animate-spin mx-auto" />
        <p className="text-sm text-muted-foreground">Loading your report…</p>
      </div>
    </div>
  );

  if (needsAuth) return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="text-center max-w-sm">
        <h1 className="text-lg font-bold mb-2">Sign-in required</h1>
        <p className="text-sm text-muted-foreground mb-4">Open the login window and return automatically.</p>
        <a href="/auth/start" target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center h-9 px-4 rounded-full bg-foreground text-background text-sm font-bold">Sign in</a>
      </div>
    </div>
  );

  if (!result) return (
    <div className="min-h-screen flex items-center justify-center bg-background px-5">
      <div className="text-center">
        <p className="text-muted-foreground mb-4 text-sm">No results found.</p>
        <Link to="/Analyzer"><Button variant="outline" className="rounded-full px-6 text-sm h-11">Run the Analyzer</Button></Link>
      </div>
    </div>
  );

  /* ── derived values ──────────────────────────────────────── */
  const stripeConnected = !!stripeConn;
  const monthlyRev = Number(input?.monthly_revenue || 0);
  const tier = getRevenueTier(monthlyRev);
  const country = input?.country || "";

  // Hero confidence
  const verticalConfidences = {
    payments: stripeConnected ? "verified" : "estimated",
    shipping: "estimated",
    saas: "estimated",
  };
  const allVerified = Object.values(verticalConfidences).every(v => v === "verified");
  const someVerified = Object.values(verticalConfidences).some(v => v === "verified");
  const heroConfidence = allVerified ? "verified" : someVerified ? "mixed" : "estimated";

  // Per-card values
  const payCurrent = result.details?.payment_current_rate ?? null;
  const payBmNetwork = benchmarks.payments;
  const payBmIsNetwork = payBmNetwork?.source === "network" && Number(payBmNetwork?.n || 0) >= 5;
  const payBmValue = payBmNetwork?.median ?? result.details?.payment_optimal_rate ?? null;

  const shipCurrent = result.details?.shipping_current_avg ?? null;
  const shipBmNetwork = benchmarks.shipping;
  const shipBmIsNetwork = shipBmNetwork?.source === "network" && Number(shipBmNetwork?.n || 0) >= 5;
  const shipBmValue = shipBmNetwork?.median ?? result.details?.shipping_optimal_avg ?? null;

  const saasSpend = result.details?.saas_current_total ?? null;
  const saasPctOfRevenue = monthlyRev > 0 && saasSpend != null
    ? (saasSpend / monthlyRev) * 100
    : null;
  const detectedSaasCount = graphNodes.filter(n => n.node_type === "saas_tool" || n.node_type === "analytics").length;

  // Nodes grouped by category
  const groupedNodes = {};
  for (const n of graphNodes) {
    const meta = NODE_CATEGORY[n.node_type] || { key: "Other", icon: Layers };
    if (!groupedNodes[meta.key]) groupedNodes[meta.key] = { icon: meta.icon, items: [] };
    groupedNodes[meta.key].items.push(n);
  }

  // Hero subtitle pieces
  const verticalNs = [benchmarks.payments, benchmarks.shipping, benchmarks.saas]
    .filter(b => b?.source === "network" && Number(b?.n || 0) >= 5)
    .map(b => Number(b.n));
  const maxN = verticalNs.length ? Math.max(...verticalNs) : 0;

  const handleShare = async () => {
    const url = window.location.href;
    try {
      await navigator.clipboard.writeText(url);
      setToastMsg("Link copied");
      setTimeout(() => setToastMsg(""), 2500);
    } catch (_) {
      setToastMsg("Copy failed");
      setTimeout(() => setToastMsg(""), 2500);
    }
  };

  const scrollToVerticals = () => {
    verticalsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const heroBadge = heroConfidence === "verified"
    ? { label: "Verified", cls: "bg-emerald-500/10 text-emerald-600 border-emerald-500/25", dot: "bg-emerald-500" }
    : heroConfidence === "mixed"
    ? { label: "Mixed", cls: "bg-blue-500/10 text-blue-600 border-blue-500/25", dot: "bg-blue-500" }
    : { label: "Estimated", cls: "bg-amber-500/10 text-amber-600 border-amber-500/25", dot: "bg-amber-500" };

  const calcDate = result.created_date ? new Date(result.created_date) : null;

  /* ── render ──────────────────────────────────────────────── */
  return (
    <div className="relative min-h-screen font-inter bg-background text-foreground overflow-x-hidden">
      {/* ambient */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 dot-grid opacity-40" />
        <div className="absolute -top-32 left-1/4 w-[40rem] h-[40rem] rounded-full blur-3xl bg-ambient-lilac opacity-[0.16]" />
      </div>

      {/* top bar */}
      <div className="relative sticky top-0 z-20 border-b border-border/40 px-5 py-3.5 flex items-center justify-between bg-background/97 backdrop-blur-2xl">
        <Link to="/" className="text-sm font-black tracking-tight">CAMBRA</Link>
        <div className="flex items-center gap-2">
          <button
            onClick={handleShare}
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full border border-border/60 text-xs font-medium text-muted-foreground hover:text-foreground hover:border-foreground/40 transition-colors"
          >
            <Share2 size={11} /> Share
          </button>
          <Link to="/Dashboard">
            <Button size="sm" className="h-8 rounded-full text-xs px-4 font-semibold">Dashboard</Button>
          </Link>
        </div>
      </div>

      <div className="relative max-w-4xl mx-auto px-5 py-10 pb-24 space-y-14">

        {/* ═══ HERO ════════════════════════════════════════════ */}
        <section className="text-center">
          <div className={`inline-flex items-center gap-1.5 mb-5 px-3 py-1.5 rounded-full border text-[11px] font-bold ${heroBadge.cls}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${heroBadge.dot}`} />
            {heroBadge.label}
          </div>

          <p className="text-sm text-muted-foreground mb-3">Identified across your infrastructure</p>

          <div className="font-black tracking-[-0.055em] leading-none mb-3 tabular-nums" style={{ fontSize: "clamp(3.5rem, 14vw, 8rem)" }}>
            {formatEur(result.total_savings)}<span className="text-[0.35em] font-bold text-muted-foreground/40 ml-2">/yr</span>
          </div>

          <p className="text-muted-foreground/70 text-base mb-7">
            Across payments, shipping and SaaS
          </p>

          <Button
            onClick={scrollToVerticals}
            size="lg"
            className="h-12 rounded-full px-7 text-sm font-bold gap-2 bg-foreground text-background hover:opacity-90 min-h-[44px]"
          >
            See how to recover this <ArrowRight className="h-4 w-4" />
          </Button>
        </section>

        {/* ═══ VERTICAL CARDS ════════════════════════════════════ */}
        <section ref={verticalsRef} className="space-y-3">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-lg font-black tracking-tight">Vertical breakdown</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {/* Payments card */}
            <div className="p-5 rounded-2xl border border-border/60 bg-card space-y-4">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-secondary border border-border/60 flex items-center justify-center">
                  <CreditCard size={14} className="text-foreground" />
                </div>
                <h3 className="text-sm font-bold">Payments</h3>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-muted-foreground">Your rate</span>
                  <span className="text-sm font-bold tabular-nums">
                    {payCurrent != null ? `${payCurrent.toFixed(2)}%` : "—"}
                  </span>
                </div>
                {payBmValue != null && (
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-muted-foreground">
                      {payBmIsNetwork ? "Network benchmark" : "Reference rate"}
                    </span>
                    <span className="text-sm font-bold tabular-nums text-cambra-mint">
                      {Number(payBmValue).toFixed(2)}%
                    </span>
                  </div>
                )}
              </div>

              <div className="pt-3 border-t border-border/40">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground/60 font-semibold mb-1">Opportunity</p>
                <p className="text-2xl font-black tabular-nums">{formatEur(result.payment_savings)}<span className="text-xs text-muted-foreground/50 font-normal ml-1">/yr</span></p>
              </div>

              <UpgradeToVerified
                vertical="payments"
                currentConfidence={stripeConnected ? "verified" : "estimated"}
                isConnected={stripeConnected}
                onConnect={() => { window.location.href = "/ConnectTools"; }}
                compact
              />
            </div>

            {/* Shipping card */}
            <div className="p-5 rounded-2xl border border-border/60 bg-card space-y-4">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-secondary border border-border/60 flex items-center justify-center">
                  <Truck size={14} className="text-foreground" />
                </div>
                <h3 className="text-sm font-bold">Shipping</h3>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-muted-foreground">Your cost</span>
                  <span className="text-sm font-bold tabular-nums">
                    {shipCurrent != null ? `€${Number(shipCurrent).toFixed(2)} / shipment` : "—"}
                  </span>
                </div>
                {shipBmValue != null && (
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-muted-foreground">
                      {shipBmIsNetwork ? "Network benchmark" : "Reference rate"}
                    </span>
                    <span className="text-sm font-bold tabular-nums text-cambra-mint">
                      €{Number(shipBmValue).toFixed(2)} / shipment
                    </span>
                  </div>
                )}
              </div>

              <div className="pt-3 border-t border-border/40">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground/60 font-semibold mb-1">Opportunity</p>
                <p className="text-2xl font-black tabular-nums">{formatEur(result.shipping_savings)}<span className="text-xs text-muted-foreground/50 font-normal ml-1">/yr</span></p>
              </div>

              <UpgradeToVerified
                vertical="shipping"
                currentConfidence="estimated"
                isConnected={false}
                onConnect={() => { window.location.href = "/ConnectTools"; }}
                compact
              />
            </div>

            {/* SaaS card */}
            <div className="p-5 rounded-2xl border border-border/60 bg-card space-y-4">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-secondary border border-border/60 flex items-center justify-center">
                  <Package size={14} className="text-foreground" />
                </div>
                <h3 className="text-sm font-bold">SaaS &amp; Tools</h3>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-muted-foreground">Your spend</span>
                  <span className="text-sm font-bold tabular-nums">
                    {saasSpend != null ? `€${Math.round(saasSpend).toLocaleString()} / mo` : "—"}
                  </span>
                </div>
                {saasPctOfRevenue != null && (
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-muted-foreground">% of revenue</span>
                    <span className="text-sm font-bold tabular-nums">{saasPctOfRevenue.toFixed(1)}%</span>
                  </div>
                )}
                {detectedSaasCount > 0 && (
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-muted-foreground">Detected tools</span>
                    <span className="text-sm font-bold tabular-nums">{detectedSaasCount}</span>
                  </div>
                )}
              </div>

              <div className="pt-3 border-t border-border/40">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground/60 font-semibold mb-1">Opportunity</p>
                <p className="text-2xl font-black tabular-nums">{formatEur(result.saas_savings)}<span className="text-xs text-muted-foreground/50 font-normal ml-1">/yr</span></p>
              </div>

              <Link
                to="/ConnectTools"
                className="inline-flex items-center justify-center gap-1.5 h-9 px-4 rounded-full bg-foreground text-background text-xs font-bold hover:opacity-90 min-h-[44px] sm:min-h-0"
              >
                <Plug size={11} /> Review detected tools
              </Link>
            </div>
          </div>
        </section>

        {/* ═══ INFRASTRUCTURE MAP ════════════════════════════════ */}
        <section className="space-y-3">
          <div>
            <h2 className="text-lg font-black tracking-tight">Your infrastructure</h2>
            <p className="text-sm text-muted-foreground/70">Tools detected across your stack</p>
          </div>

          {graphNodes.length === 0 ? (
            <div className="p-6 rounded-2xl border border-dashed border-border/60 bg-secondary/20 text-center">
              <p className="text-sm text-muted-foreground mb-3">Connect your tools to map your infrastructure</p>
              <Link to="/ConnectTools">
                <Button variant="outline" className="rounded-full px-5 text-xs h-9 min-h-[44px] sm:min-h-0">Connect tools</Button>
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {CATEGORY_ORDER.filter(cat => groupedNodes[cat]).map(cat => {
                const Icon = groupedNodes[cat].icon;
                const items = groupedNodes[cat].items;
                return (
                  <div key={cat} className="rounded-2xl border border-border/50 bg-card overflow-hidden">
                    <div className="px-4 py-2.5 border-b border-border/40 bg-secondary/30 flex items-center gap-2">
                      <Icon size={12} className="text-muted-foreground" />
                      <span className="text-[10px] uppercase tracking-[0.15em] font-bold text-muted-foreground">{cat}</span>
                      <span className="text-[10px] text-muted-foreground/50">({items.length})</span>
                    </div>
                    <div className="divide-y divide-border/30">
                      {items.map(n => {
                        const b = nodeBadge(n);
                        return (
                          <div key={n.id} className="px-4 py-3 flex items-center gap-3 flex-wrap">
                            <p className="text-sm font-semibold flex-1 min-w-0 truncate">{n.provider_name}</p>
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-bold ${b.cls}`}>
                              {b.label}
                            </span>
                            {Number(n.monthly_cost) > 0 && (
                              <span className="text-xs font-bold tabular-nums whitespace-nowrap">
                                €{Math.round(Number(n.monthly_cost)).toLocaleString()}/mo
                              </span>
                            )}
                            <span className="text-[10px] text-muted-foreground/60 whitespace-nowrap">{dataSourceLabel(n)}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* ═══ HOW WE CALCULATED THIS ════════════════════════════ */}
        <section className="rounded-2xl border border-border/50 bg-card overflow-hidden">
          <button
            onClick={() => setShowHow(s => !s)}
            className="w-full px-5 py-4 flex items-center justify-between text-left hover:bg-secondary/30 transition-colors min-h-[44px]"
          >
            <span className="text-sm font-bold">How we calculated this</span>
            {showHow ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
          {showHow && (
            <div className="px-5 pb-5 space-y-4 text-xs text-muted-foreground">
              {result.methodology && (
                <div>
                  <p className="text-[10px] uppercase tracking-wider font-bold text-foreground/70 mb-1">Methodology</p>
                  <p className="leading-relaxed">{result.methodology}</p>
                </div>
              )}
              {Array.isArray(result.assumptions) && result.assumptions.length > 0 && (
                <div>
                  <p className="text-[10px] uppercase tracking-wider font-bold text-foreground/70 mb-1">Assumptions</p>
                  <ul className="list-disc pl-5 space-y-1 leading-relaxed">
                    {result.assumptions.map((a, i) => <li key={i}>{a}</li>)}
                  </ul>
                </div>
              )}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3 border-t border-border/30">
                <div>
                  <p className="text-[10px] uppercase tracking-wider font-bold text-foreground/70">Score engine</p>
                  <p className="text-foreground tabular-nums">v{result.score_engine_version || "—"}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider font-bold text-foreground/70">Savings model</p>
                  <p className="text-foreground tabular-nums">v{result.savings_model_version || "—"}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider font-bold text-foreground/70">Benchmarks</p>
                  <p className="text-foreground tabular-nums">v{result.benchmark_version || "—"}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider font-bold text-foreground/70">Calculated</p>
                  <p className="text-foreground">{calcDate ? calcDate.toLocaleDateString() : "—"}</p>
                </div>
              </div>
            </div>
          )}
        </section>

        {/* ═══ BOTTOM ACTIONS + TRUST ════════════════════════════ */}
        <section className="space-y-4">
          <div className="rounded-2xl border border-border/50 bg-card p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <p className="text-sm font-bold mb-0.5">Connect more tools to improve accuracy</p>
              <p className="text-xs text-muted-foreground">Every connection refines your benchmark.</p>
            </div>
            <Link to="/ConnectTools" className="shrink-0">
              <Button className="rounded-full px-5 text-xs h-10 font-bold gap-1.5 min-h-[44px] sm:min-h-0">
                <Plug size={11} /> Connect tools <ArrowRight size={11} />
              </Button>
            </Link>
          </div>

          <div className="text-center space-y-2">
            {country && (
              <p className="text-[11px] text-muted-foreground/70">
                Analysis based on {country} {tierLabel(tier)} benchmarks
              </p>
            )}
            <p className="text-[11px] text-muted-foreground/70">Data is private and never shared</p>
            {maxN >= 5 && (
              <p className="text-[11px] text-muted-foreground/70">
                Benchmarked against {maxN} anonymized brands
              </p>
            )}
          </div>
        </section>
      </div>

      {/* toast */}
      {toastMsg && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-full bg-foreground text-background text-xs font-bold shadow-lg flex items-center gap-2">
          <CheckCircle2 size={12} /> {toastMsg}
        </div>
      )}
    </div>
  );
}