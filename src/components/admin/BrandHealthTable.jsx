import { useMemo, useState } from "react";

function formatDate(d) {
  if (!d) return '—';
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return '—';
  return dt.toLocaleDateString(undefined, { month: 'short', day: '2-digit' });
}

export default function BrandHealthTable({ brands = [], apps = [], activations = [], tasks = [], results = [], limit = 8 }) {
  const [q, setQ] = useState("");
  const [country, setCountry] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortBy, setSortBy] = useState("recent");

  const countries = useMemo(() => Array.from(new Set(brands.map(b => b.country).filter(Boolean))), [brands]);

  const byEmail = (email, list) => list.filter(x => (x.user_email || x.created_by || x.brand_id) && (x.user_email === email || x.created_by === email || x.brand_id === email));

  const brandRows = useMemo(() => {
    // Pre-index by brand email (created_by)
    const emailMap = new Map(brands.map(b => [b.created_by, b]));

    const savingsByEmail = {};
    (results || []).forEach(r => {
      const email = r.created_by;
      if (!email) return;
      const v = Math.max(0, r.total_savings || 0);
      savingsByEmail[email] = Math.max(savingsByEmail[email] || 0, v);
    });

    const rows = brands.map(b => {
      const email = b.created_by;
      const brandApps = apps.filter(a => a.user_email === email);
      const brandActs = activations.filter(a => a.brand_id === b.id || a.user_email === email);
      const brandTasks = tasks.filter(t => t.owner_id === b.id || t.owner_type === 'brand');

      const activeActs = brandActs.filter(a => ['activated','migrating','live','monetizing'].includes(a.status));
      const offerReady = brandApps.some(a => a.status === 'offer_ready');
      const hasBlocked = brandTasks.some(t => t.status === 'blocked');
      const inReview = brandApps.some(a => a.status === 'in_review');
      const awaitingAuth = brandActs.some(a => a.status === 'awaiting_authorization');

      let status = 'Dormant';
      if (hasBlocked) status = 'Needs Attention';
      else if (activeActs.length) status = 'Active';
      else if (offerReady || inReview || awaitingAuth || brandApps.length) status = 'Pending';

      const lastTimestamps = [
        ...brandApps.map(a => a.created_date),
        ...brandActs.map(a => a.updated_date || a.created_date),
        ...brandTasks.map(t => t.updated_at || t.created_date),
        ...(results || []).filter(r => r.created_by === email).map(r => r.created_date),
      ].filter(Boolean).map(d => new Date(d).getTime());
      const lastActivityTs = lastTimestamps.length ? Math.max(...lastTimestamps) : 0;

      let next = '—';
      if (hasBlocked) {
        const t = brandTasks.find(t => t.status === 'blocked');
        next = `Unblock: ${t?.step_name?.replaceAll('_',' ') || 'Task'}`;
      } else if (awaitingAuth) next = 'Obtain authorization';
      else if (offerReady) next = 'Review offer';
      else if (inReview) next = 'Review application';
      else if (!brandApps.length && !activeActs.length) next = 'Run analyzer';

      return {
        id: b.id,
        name: b.name || email?.split('@')[0] || 'Brand',
        email,
        country: b.country || '—',
        status,
        savings: Math.round(savingsByEmail[email] || 0),
        activeDeals: activeActs.length,
        lastActivity: lastActivityTs ? new Date(lastActivityTs) : null,
        lastActivityLabel: lastActivityTs ? formatDate(lastActivityTs) : '—',
        next,
      };
    });

    // Filters
    const qLower = q.trim().toLowerCase();
    let filt = rows.filter(r => !qLower || r.name.toLowerCase().includes(qLower) || r.email.toLowerCase().includes(qLower));
    if (country !== 'all') filt = filt.filter(r => r.country === country);
    if (statusFilter !== 'all') filt = filt.filter(r => r.status.toLowerCase().replace(' ', '_') === statusFilter);

    // Sort
    const sorters = {
      recent: (a,b) => (b.lastActivity?.getTime()||0) - (a.lastActivity?.getTime()||0),
      highest_savings: (a,b) => b.savings - a.savings,
      most_active: (a,b) => b.activeDeals - a.activeDeals,
      needs_attention: (a,b) => (b.status==='Needs Attention') - (a.status==='Needs Attention') || ((b.lastActivity?.getTime()||0)-(a.lastActivity?.getTime()||0)),
      dormant: (a,b) => (a.status==='Dormant') - (b.status==='Dormant') || ((a.lastActivity?.getTime()||0)-(b.lastActivity?.getTime()||0)),
    };
    const sorter = sorters[sortBy] || sorters.recent;
    return filt.sort(sorter);
  }, [brands, apps, activations, tasks, results, q, country, statusFilter, sortBy]);

  const display = brandRows.slice(0, limit);

  return (
    <div className="space-y-3">
      {/* Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-2">
        <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search brands…"
               className="h-8 px-3 text-xs rounded-md border border-border/40 bg-background w-full sm:w-56" />
        <div className="flex gap-2 flex-wrap">
          <select value={country} onChange={e=>setCountry(e.target.value)} className="h-8 px-2 text-xs rounded-md border border-border/40 bg-background">
            <option value="all">All countries</option>
            {countries.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)} className="h-8 px-2 text-xs rounded-md border border-border/40 bg-background">
            <option value="all">All status</option>
            <option value="active">Active</option>
            <option value="pending">Pending</option>
            <option value="needs_attention">Needs attention</option>
            <option value="dormant">Dormant</option>
          </select>
          <select value={sortBy} onChange={e=>setSortBy(e.target.value)} className="h-8 px-2 text-xs rounded-md border border-border/40 bg-background">
            <option value="recent">Most recent</option>
            <option value="highest_savings">Highest savings</option>
            <option value="most_active">Most active</option>
            <option value="needs_attention">Needs attention</option>
            <option value="dormant">Dormant</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-border/40 overflow-hidden">
        <div className="hidden md:grid grid-cols-[2fr_1fr_1fr_1fr_1fr] gap-3 px-4 py-2.5 bg-secondary/40 text-[10px] uppercase tracking-[0.18em] text-muted-foreground/60">
          <span>Brand</span>
          <span>Status</span>
          <span>Identified savings</span>
          <span>Active deals</span>
          <span>Last activity</span>
        </div>
        <div className="divide-y divide-border/30">
          {display.map((r) => (
            <div key={r.id} className="px-4 py-2.5 text-sm grid md:grid-cols-[2fr_1fr_1fr_1fr_1fr] grid-cols-1 gap-1 md:gap-3">
              <div className="flex items-center justify-between md:block">
                <div className="font-semibold">{r.name}</div>
                <div className="text-[11px] text-muted-foreground/60 md:hidden">{r.status} • {r.lastActivityLabel}</div>
              </div>
              <div className="hidden md:block"><span className={`text-[11px] px-2 py-0.5 rounded-full border ${r.status==='Active' ? 'text-green-700 border-green-500/30 bg-green-500/10' : r.status==='Needs Attention' ? 'text-orange-700 border-orange-500/30 bg-orange-500/10' : r.status==='Pending' ? 'text-blue-700 border-blue-500/30 bg-blue-500/10' : 'text-muted-foreground border-border/50 bg-secondary/40'}`}>{r.status}</span></div>
              <div className="flex items-center gap-2 md:block">
                <span className="font-bold tabular-nums">€{r.savings.toLocaleString()}</span>
              </div>
              <div className="text-muted-foreground/80">{r.activeDeals}</div>
              <div className="text-muted-foreground/80">{r.lastActivityLabel}</div>
              <div className="md:col-span-5 text-[12px] text-muted-foreground/70">Next: {r.next}</div>
            </div>
          ))}
          {display.length === 0 && (
            <div className="px-4 py-6 text-sm text-muted-foreground text-center">No brands match the current filters.</div>
          )}
        </div>
      </div>

      <div className="flex justify-end">
        <a href="/admin/users" className="text-xs font-semibold underline text-muted-foreground hover:text-foreground">View all brands</a>
      </div>
    </div>
  );
}