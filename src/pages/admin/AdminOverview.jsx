import { useEffect, useMemo, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { DEAL_STATUSES } from "@/lib/adminStatusConstants";

// UI blocks
import AdminFiltersBar from "@/components/admin/AdminFiltersBar";
import KPIStrip from "@/components/admin/KPIStrip";
import PipelineMini from "@/components/admin/PipelineMini";
import TopOpportunities from "@/components/admin/TopOpportunities";
import ProviderPerformance from "@/components/admin/ProviderPerformance";
// import BrandHealth from "@/components/admin/BrandHealth";
import BrandHealthTable from "@/components/admin/BrandHealthTable";
import RevenueBilling from "@/components/admin/RevenueBilling";
import LiveActivity from "@/components/admin/LiveActivity";
import RecommendationsWidget from "@/components/admin/RecommendationsWidget";
import CommandHero from "@/components/admin/CommandHero";
import OperationsConsole from "@/components/admin/OperationsConsole";
import DataIntegrityWidget from "@/components/admin/DataIntegrityWidget";

function safeCurrency(n) {
  const v = Math.round(Number(n || 0));
  return `€${v.toLocaleString()}`;
}

export default function AdminOverview() {
  // Filters / controls
  const [timeRange, setTimeRange] = useState("30d"); // 7d / 30d / 90d / YTD
  const [search, setSearch] = useState("");
  const [vertical, setVertical] = useState("all");
  const [providerId, setProviderId] = useState("all");
  const [country, setCountry] = useState("all");
  const [stage, setStage] = useState("all");
  const [status, setStatus] = useState("all");

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [loadError, setLoadError] = useState("");
  const inFlightRef = useRef(false);
  const pendingRef = useRef(false);
  const debounceTimerRef = useRef(null);

  // Coalesced loader: dedupe overlapping calls (avoid 11 × N SDK requests when
  // multiple realtime subscriptions fire together) and debounce bursts.
  const loadAll = async () => {
    if (inFlightRef.current) { pendingRef.current = true; return; }
    inFlightRef.current = true;
    try {
      setLoadError("");
      const [users, brands, userDeals, results, apps, reports, providers, activations, tasks, mandates, invoices] = await Promise.all([
        base44.entities.User.list(),
        base44.entities.Brand.list(),
        base44.entities.UserDeal.list(),
        base44.entities.AnalyzerResult.list("-created_date", 500),
        base44.entities.DealApplication.list("-created_date", 500),
        base44.entities.MonthlySavingsReport.list("-month", 500),
        base44.entities.Provider.list(),
        base44.entities.DealActivation.list(),
        base44.entities.MigrationTask.list("-updated_date", 500),
        base44.entities.Mandate.list(),
        base44.entities.Invoice.list("-issued_at", 500),
      ]);
      setData({ users, brands, userDeals, results, apps, reports, providers, activations, tasks, mandates, invoices });
      return true;
    } catch (err) {
      // Never turn an unreadable admin source into a zero or an endless spinner.
      setLoadError("CAMBRA could not read every Founder OS source. No incomplete totals are being shown.");
      console.warn("[AdminOverview] loadAll failed:", err?.message || err);
      return false;
    } finally {
      inFlightRef.current = false;
      if (pendingRef.current) {
        pendingRef.current = false;
        // Delay the follow-up so we don't immediately re-hit the rate limit.
        setTimeout(() => scheduleLoad(), 500);
      }
    }
  };

  // Debounce subscription bursts (6 channels can fire near-simultaneously)
  const scheduleLoad = () => {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => loadAll(), 400);
  };

  useEffect(() => {
    loadAll().finally(() => setLoading(false));
    const subs = [];
    try {
      subs.push(base44.entities.DealApplication.subscribe(scheduleLoad));
      subs.push(base44.entities.AnalyzerResult.subscribe(scheduleLoad));
      subs.push(base44.entities.MonthlySavingsReport.subscribe(scheduleLoad));
      subs.push(base44.entities.DealActivation.subscribe(scheduleLoad));
      subs.push(base44.entities.MigrationTask.subscribe(scheduleLoad));
      subs.push(base44.entities.Invoice.subscribe(scheduleLoad));
    } catch { /* ignore realtime failures */ }
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      subs.forEach(u => u?.());
    };
     
  }, []);

  // Time window helpers
  const now = useMemo(() => new Date(), []);
  const since = useMemo(() => {
    if (timeRange === "7d") return new Date(Date.now() - 7 * 86400000);
    if (timeRange === "30d") return new Date(Date.now() - 30 * 86400000);
    if (timeRange === "90d") return new Date(Date.now() - 90 * 86400000);
    if (timeRange === "YTD") return new Date(new Date().getFullYear(), 0, 1);
    return new Date(Date.now() - 30 * 86400000);
  }, [timeRange]);
  const prevSince = useMemo(() => new Date(since.getTime() - (now.getTime() - since.getTime())), [since, now]);

  const retryLoad = async () => {
    setLoading(true);
    await loadAll();
    setLoading(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-40">
        <div className="w-6 h-6 rounded-full border-2 border-border border-t-foreground animate-spin" />
      </div>
    );
  }

  if (!data) {
    return (
      <div data-testid="founder-os-data-unavailable" className="rounded-2xl border border-amber-300/40 bg-amber-500/10 p-6 text-sm">
        <p className="font-black">Founder OS data unavailable</p>
        <p className="mt-2 text-muted-foreground">{loadError || "CAMBRA could not verify the dashboard data sources."}</p>
        <button onClick={retryLoad} className="mt-4 h-9 rounded-lg border border-border px-4 text-xs font-bold">
          Retry
        </button>
      </div>
    );
  }

  const { users, brands, results, apps, reports, providers, activations, tasks, invoices } = data;

  // Derived lists with filters applied where relevant
  const countries = Array.from(new Set((brands || []).map(b => b.country).filter(Boolean)));

  const brandByEmail = (email) => (brands || []).find(b => b?.created_by === email);
  const brandCountryMap = new Map((brands || []).map(b => [b?.created_by, b?.country || null]));

  const appsFiltered = (apps || []).filter(a => {
    const q = search.toLowerCase();
    const b = brandByEmail(a.user_email);
    const matchQ = !q || a.deal_name?.toLowerCase().includes(q) || a.user_email?.toLowerCase().includes(q) || b?.name?.toLowerCase().includes(q);
    const matchStage = stage === "all" || a.status === stage;
    const matchCountry = country === "all" || brandCountryMap.get(a.user_email) === country;
    return matchQ && matchStage && matchCountry;
  });

  const activationsActive = (activations || []).filter(a => ["activated","migrating","live","monetizing"].includes(a.status));
  const providersActiveSet = new Set(activationsActive.map(a => a.provider_id).filter(Boolean));

  // Time-ranged helpers
  const inRangeDate = (d) => (d ? new Date(d) >= since && new Date(d) <= now : false);
  const inPrevRange = (d) => (d ? new Date(d) >= prevSince && new Date(d) < since : false);

  const resultsInRange = (results || []).filter(r => inRangeDate(r.created_date));
  const resultsPrevRange = (results || []).filter(r => inPrevRange(r.created_date));

  // reportsInRange was previously used for a widget that has been removed; kept
  // computation trimmed. If a time-scoped reports view returns, filter `reports`
  // with toDateFromMonth(r.month) against [since, now] then.

  // SECTION 1 — HERO KPI STRIP
  const identifiedSavings = resultsInRange.reduce((s, r) => s + (r.total_savings || 0), 0);
  const identifiedPrev = resultsPrevRange.reduce((s, r) => s + (r.total_savings || 0), 0);
  const identifiedTrend = identifiedPrev ? Math.round(((identifiedSavings - identifiedPrev) / identifiedPrev) * 100) : 0;
  const tpeEstimatedSavings = resultsInRange.reduce((s, r) => s + (r.details?.tpe_savings || 0), 0);
  const tpeActivatedSavings = activations.filter(a => ["activated","migrating","live","monetizing"].includes(a.status) && a.vertical === "payments").reduce((s, a) => s + (a.activated_savings_yearly || 0), 0);

  const activatedSavingsAnnual = activationsActive.reduce((s, a) => s + (a.projected_savings_annual || a.estimated_savings_yearly || a.realized_savings_yearly || 0), 0);

  // Monetized revenue split — reads directly from Invoice, not reports.
  const monetizedPaid = (invoices || []).filter(i => i.status === 'paid').reduce((s, i) => s + (i.total_amount || 0), 0);
  const monetizedInvoiced = (invoices || []).filter(i => ['issued','sent','due','overdue'].includes(i.status)).reduce((s, i) => s + (i.total_amount || 0), 0);

  const pendingStatuses = [DEAL_STATUSES.IN_REVIEW, DEAL_STATUSES.PROVIDER_CONTACTED, DEAL_STATUSES.OFFER_READY];
  const pendingDealValue = (apps || []).filter(a => pendingStatuses.includes(a.status)).reduce((s, a) => s + (a.estimated_savings || 0), 0);

  // Action needs
  const blockedTasks = (tasks || []).filter(t => t.status === "blocked");
  const offerReady = (apps || []).filter(a => a.status === DEAL_STATUSES.OFFER_READY);
  const toInvoice = (reports || []).filter(r => r.status === "calculated");
  const awaitingAuth = (activations || []).filter(a => a.status === "awaiting_authorization");
  const inReviewAged = (apps || []).filter(a => {
    const ageDays = (Date.now() - new Date(a.created_date).getTime()) / 86400000;
    return a.status === DEAL_STATUSES.IN_REVIEW && ageDays > 3;
  });
  const dealsNeedingActionCount = blockedTasks.length + offerReady.length + toInvoice.length + awaitingAuth.length + inReviewAged.length;

  const kpis = [
    { title: "Savings Identified", value: safeCurrency(identifiedSavings), subtitle: "Opportunities discovered", color: "text-purple-600", helper: identifiedTrend ? `${identifiedTrend > 0 ? "+" : ""}${identifiedTrend}% vs prev` : undefined },
    { title: "Live Savings", value: safeCurrency(activatedSavingsAnnual), subtitle: "Currently active", color: "text-green-600" },
    { title: "Revenue Realized", value: safeCurrency(monetizedPaid + monetizedInvoiced), subtitle: `Paid ${safeCurrency(monetizedPaid)} • Invoiced ${safeCurrency(monetizedInvoiced)}` , color: "text-amber-600" },
    { title: "Needs Attention", value: dealsNeedingActionCount, subtitle: "Items requiring follow-up", color: "text-red-600" },
    { title: "Pipeline in Motion", value: safeCurrency(pendingDealValue), subtitle: "Value moving through stages", color: "text-blue-600" },
    { title: "Partner Performance", value: providersActiveSet.size, subtitle: "Active providers", color: "text-foreground" },
  ];

  const heroMetrics = [
    { label: "Savings Identified", value: safeCurrency(identifiedSavings), helper: identifiedTrend ? `${identifiedTrend > 0 ? "+" : ""}${identifiedTrend}%` : undefined, accent: "text-purple-600" },
    { label: "TPE Estimated", value: safeCurrency(tpeEstimatedSavings), helper: "in-store terminals", accent: "text-orange-600" },
    { label: "TPE Activated", value: safeCurrency(tpeActivatedSavings), helper: "payments activations", accent: "text-green-600" },
  ];

  const secondaryKpis = kpis.slice(3);

  // SECTION 2 — ACTION QUEUE (top 10)
  const actionQueue = [
    ...blockedTasks.map(t => ({ type: "Blocked", title: t.step_name?.replaceAll("_"," ") || "Migration task", sub: t.blocked_reason || "—", link: `/admin/activation/${t.deal_activation_id || ""}`, badge: "bg-red-500/[0.06] text-red-600 border-red-500/20" })),
    ...offerReady.map(a => ({ type: "Offer ready", title: a.deal_name, sub: brandByEmail(a.user_email)?.name || a.user_email, link: "/admin/deals", badge: "bg-purple-500/[0.06] text-purple-600 border-purple-500/20" })),
    ...toInvoice.map(r => ({ type: "Ready to invoice", title: r.month, sub: `${safeCurrency(r.node_fee)} · ${r.vertical || ""}`, link: "/admin/revenue", badge: "bg-orange-500/[0.06] text-orange-600 border-orange-500/20" })),
    ...awaitingAuth.map(a => ({ type: "Awaiting signature", title: a.deal_name || a.id, sub: a.brand_id || "—", link: "/admin/activation", badge: "bg-blue-500/[0.06] text-blue-600 border-blue-500/20" })),
    ...inReviewAged.map(a => ({ type: "Incomplete review", title: a.deal_name, sub: brandByEmail(a.user_email)?.name || a.user_email, link: "/admin/deals", badge: "bg-amber-500/[0.06] text-amber-600 border-amber-500/20" })),
  ];

  // SECTION 3 — CONVERSION + BOTTLENECKS
  const convAnalysis = results.length > 0 ? Math.round(((apps.length || 0) / results.length) * 100) : 0;
  const activeActivated = (activations || []).filter(a => a.status === DEAL_STATUSES.ACTIVATED).length;
  const convActivation = apps.length > 0 ? Math.round((activeActivated / apps.length) * 100) : 0;
  const stuckCount = (apps || []).filter(a => {
    const days = (Date.now() - new Date(a.created_date).getTime()) / 86400000;
    return days > 7 && [DEAL_STATUSES.IN_REVIEW, DEAL_STATUSES.PROVIDER_CONTACTED].includes(a.status);
  }).length;
  const funnel = {
    users: users.length,
    analyses: results.length,
    applied: apps.length,
    active: (activations || []).filter(a => ["activated","migrating","live","monetizing"].includes(a.status)).length,
    inProgress: (apps || []).filter(a => [DEAL_STATUSES.IN_REVIEW, DEAL_STATUSES.PROVIDER_CONTACTED, DEAL_STATUSES.OFFER_READY].includes(a.status)).length,
  };

  // SECTION 4 — DEAL PIPELINE (mini)
  const pipelineStages = [
    { key: DEAL_STATUSES.SUBMITTED, label: "Submitted", color: "var(--voltio)" },
    { key: DEAL_STATUSES.IN_REVIEW, label: "In Review", color: "#f97316" },
    { key: DEAL_STATUSES.PROVIDER_CONTACTED, label: "Provider Contacted", color: "var(--voltio-2)" },
    { key: DEAL_STATUSES.OFFER_READY, label: "Offer Ready", color: "#F5A623" },
    { key: DEAL_STATUSES.ACTIVATED, label: "Activated", color: "#2FE0A8" },
  ];
  const pipelineData = pipelineStages.map(s => ({
    ...s,
    count: appsFiltered.filter(a => a.status === s.key).length,
    value: appsFiltered.filter(a => a.status === s.key).reduce((sum, a) => sum + (a.estimated_savings || 0), 0),
  }));

  // SECTION 5 — TOP OPPORTUNITIES (fix undefined)
  const brandSavings = {};
  (results || []).forEach(r => {
    const email = r.created_by;
    if (!email) return;
    const v = Math.max(0, r.total_savings || 0);
    brandSavings[email] = Math.max(brandSavings[email] || 0, v);
  });
  const topOpp = Object.entries(brandSavings)
    .map(([email, savings]) => ({ email, savings, brandName: (brands.find(b => b.created_by === email)?.name) || email.split("@")[0] }))
    .sort((a, b) => b.savings - a.savings)
    .slice(0, 5);

  // SECTION 6 — PROVIDER PERFORMANCE
  const providerAgg = {};
  (reports || []).forEach(r => {
    const key = r.provider_id || 'unknown';
    if (!providerAgg[key]) providerAgg[key] = { savings: 0, revenue: 0, deals: 0 };
    providerAgg[key].savings += r.savings || 0;
    providerAgg[key].revenue += r.node_fee || 0;
    providerAgg[key].deals += 1;
  });
  const providerRows = Object.entries(providerAgg)
    .map(([providerId, v]) => ({
      name: providers.find(p => p.id === providerId)?.name || providerId,
      savings: Math.round(v.savings),
      revenue: Math.round(v.revenue),
      deals: v.deals,
    }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 8);

  // SECTION 7 — BRAND HEALTH is rendered by <BrandHealthTable /> which
  // computes its own rows from brands/apps/activations/tasks/results. The
  // legacy `brandHealthRows` aggregation was removed with the widget swap.

  // SECTION 8 — REVENUE & BILLING
  const realizedSavings = (reports || []).filter(r => ["invoiced","paid"].includes(r.status)).reduce((s, r) => s + (r.savings || 0), 0);
  const monetizedPaidAll = (invoices || []).filter(i => i.status === 'paid').reduce((s, i) => s + (i.total_amount || 0), 0);
  const monetizedInvoicedAll = (invoices || []).filter(i => ['issued','sent','due','overdue'].includes(i.status)).reduce((s, i) => s + (i.total_amount || 0), 0);
  // last 6 months paid trend (by paid_at)
  const monthSeries = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const paid = (invoices || []).filter(i => i.status === 'paid' && i.paid_at && new Date(i.paid_at).getMonth() === d.getMonth() && new Date(i.paid_at).getFullYear() === d.getFullYear()).reduce((s, i) => s + (i.total_amount || 0), 0);
    monthSeries.push({ label: d.toLocaleDateString('en-GB', { month: 'short' }), paid: Math.round(paid) });
  }
  const overdueInvoices = (invoices || []).filter(i => i.status === 'overdue').length;
  const toInvoiceCount = (reports || []).filter(r => r.status === 'calculated').length;

  const revenueBilling = {
    realizedSavings, monetizedPaid: monetizedPaidAll, monetizedInvoiced: monetizedInvoicedAll,
    overdueInvoices, toInvoiceCount, monthSeries
  };

  // SECTION 9 — LIVE ACTIVITY: use recent apps

  const handleQuickAction = (key) => {
    if (key === 'applications') window.location.href = '/admin/deals';
    if (key === 'deal') window.location.href = '/admin/deals';
    if (key === 'followup') window.location.href = '/admin/users';
    if (key === 'invoice') window.location.href = '/admin/revenue';
    if (key === 'pipeline') window.location.href = '/admin/pipeline';
  };

  return (
    <div className="space-y-5">
      {loadError && (
        <div role="alert" className="rounded-xl border border-amber-300/40 bg-amber-500/10 px-4 py-3 text-xs">
          {loadError} Displayed values are the last complete snapshot.
        </div>
      )}
      <CommandHero
        title="Command Center"
        subtitle="CAMBRA · Infrastructure intelligence"
        metrics={heroMetrics}
      />

      <div className="mt-4">
        <AdminFiltersBar
          timeRange={timeRange} setTimeRange={setTimeRange}
          search={search} setSearch={setSearch}
          vertical={vertical} setVertical={setVertical}
          providerId={providerId} setProviderId={setProviderId}
          country={country} setCountry={setCountry}
          stage={stage} setStage={setStage}
          status={status} setStatus={setStatus}
          providers={providers}
          countries={countries}
          stages={[DEAL_STATUSES.SUBMITTED, DEAL_STATUSES.IN_REVIEW, DEAL_STATUSES.PROVIDER_CONTACTED, DEAL_STATUSES.OFFER_READY, DEAL_STATUSES.ACTIVATED]}
          statuses={[DEAL_STATUSES.SUBMITTED, DEAL_STATUSES.IN_REVIEW, DEAL_STATUSES.PROVIDER_CONTACTED, DEAL_STATUSES.OFFER_READY, DEAL_STATUSES.ACTIVATED]}
          onQuickAction={handleQuickAction}
        />
      </div>

      <div className="mt-4">
        <OperationsConsole
          actions={actionQueue}
          convData={{ funnel, convAnalysis, convActivation, stuckCount, offerReady: offerReady.length }}
        />
      </div>

      <div className="mt-4">
        <KPIStrip kpis={secondaryKpis} />
      </div>

      {/* Recommendations for Admin */}
      <div className="mt-4">
        <RecommendationsWidget />
      </div>

      <div className="mt-4">
        <DataIntegrityWidget />
      </div>

      {/* 3. CONVERSION + BOTTLENECKS — now inside OperationsConsole */}

      {/* 4 + 5 + 6 + 7 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="relative rounded-2xl bg-card/95 backdrop-blur-sm border border-border/60 p-5 overflow-hidden shadow-[0_8px_24px_-12px_rgba(0,0,0,0.08)]">
          <div className="pointer-events-none absolute -top-20 -right-20 w-52 h-52 rounded-full blur-3xl opacity-50" style={{ background: "radial-gradient(closest-side, rgba(31,78,216,0.18), transparent)" }} />
          <div className="relative">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold tracking-tight">Pipeline in Motion</h3>
            </div>
            <PipelineMini data={pipelineData} totalApps={appsFiltered.length} />
          </div>
        </div>

        <div className="relative rounded-2xl bg-card/95 backdrop-blur-sm border border-border/60 p-5 overflow-hidden shadow-[0_8px_24px_-12px_rgba(0,0,0,0.08)]">
          <div className="pointer-events-none absolute -top-20 -right-20 w-52 h-52 rounded-full blur-3xl opacity-50" style={{ background: "radial-gradient(closest-side, rgba(168,85,247,0.18), transparent)" }} />
          <div className="relative">
            <h3 className="text-sm font-bold tracking-tight mb-3">Top Opportunities</h3>
            <TopOpportunities items={topOpp} />
          </div>
        </div>

        <div className="relative rounded-2xl bg-card/95 backdrop-blur-sm border border-border/60 p-5 overflow-hidden shadow-[0_8px_24px_-12px_rgba(0,0,0,0.08)]">
          <div className="pointer-events-none absolute -top-20 -right-20 w-52 h-52 rounded-full blur-3xl opacity-50" style={{ background: "radial-gradient(closest-side, rgba(34,197,94,0.18), transparent)" }} />
          <div className="relative">
            <h3 className="text-sm font-bold tracking-tight mb-3">Partner Performance</h3>
            <ProviderPerformance rows={providerRows} />
          </div>
        </div>

        <div className="relative rounded-2xl bg-card/95 backdrop-blur-sm border border-border/60 p-5 overflow-hidden shadow-[0_8px_24px_-12px_rgba(0,0,0,0.08)]">
          <div className="pointer-events-none absolute -top-20 -right-20 w-52 h-52 rounded-full blur-3xl opacity-50" style={{ background: "radial-gradient(closest-side, rgba(44,167,193,0.18), transparent)" }} />
          <div className="relative">
            <h3 className="text-sm font-bold tracking-tight mb-3">Brand Health</h3>
            <BrandHealthTable
              brands={brands}
              apps={apps}
              activations={activations}
              tasks={tasks}
              results={results}
              limit={3}
            />
          </div>
        </div>
      </div>

      {/* 8. REVENUE & BILLING */}
      <div className="relative rounded-2xl bg-card/95 backdrop-blur-sm border border-border/60 p-5 overflow-hidden shadow-[0_8px_24px_-12px_rgba(0,0,0,0.08)]">
        <div className="pointer-events-none absolute -top-24 -right-24 w-64 h-64 rounded-full blur-3xl opacity-50" style={{ background: "radial-gradient(closest-side, rgba(245,158,11,0.18), transparent)" }} />
        <div className="relative">
          <h3 className="text-sm font-bold tracking-tight mb-3">Revenue Flow</h3>
          <RevenueBilling data={revenueBilling} />
        </div>
      </div>

      {/* 9. LIVE ACTIVITY */}
      <LiveActivity apps={apps} brands={brands} />
    </div>
  );
}
