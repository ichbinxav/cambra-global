// DASHBOARD-C11 (2026-08-17) — Providers, now the `providers` tab of Intelligence.
//
// This page used to create and update Provider rows directly from the browser, and the
// payload included a field labelled "Revenue Share %". The navigation registry flagged it
// HIGHEST SEVERITY. What C11 verified sharpens the claim in both directions: no production
// code reads that field — the real rate is ProviderRevenueLedger.rate_bps, bound to an
// agreement_id and an agreement_terms_hash — so it is not biasing anything today. But an
// unbound duplicate of a governed number, editable from an admin page, is a shadow rate
// waiting for the first aggregator that picks it up.
//
// It also coerced the field with `|| 0`, so an empty input was stored as a confident 0%.
//
// The field is now read-only here, shown beside the governed rate, and the write goes
// through a previewed handler that refuses it by name.
import { useEffect, useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Plus, X, Save, Building2, Search, ShieldAlert } from "lucide-react";
import { callIntelligence } from "./AdminIntelligenceWorkspace";

const CATEGORIES = ["payments", "shipping", "saas", "insurance", "banking", "logistics"];
// Exactly the fields the handler accepts. Selecting a provider used to copy the WHOLE row
// into the form, which would now send back `revenue_share_pct`, `id` and `created_date`
// and be refused on every save.
// Written as an explicit literal rather than built from a key list, so the shape matches
// the form state exactly instead of widening to a string-keyed bag.
const editableOnly = (row) => ({
  name: row?.name ?? "",
  category: row?.category ?? "payments",
  contact_email: row?.contact_email ?? "",
  account_manager: row?.account_manager ?? "",
  api_status: row?.api_status ?? "not_connected",
  contract_type: row?.contract_type ?? "",
  notes: row?.notes ?? "",
});
const API_COLORS = {
  connected: "text-green-600 bg-green-500/10 border-green-500/20",
  not_connected: "text-muted-foreground bg-secondary border-border/40",
  error: "text-red-600 bg-red-500/10 border-red-500/20",
};
const isExplicitDemo = (provider) => /^\s*\[demo\]/i.test(String(provider?.name || ""));

export default function AdminProviders() {
  const [providers, setProviders] = useState([]);
  const [userDeals, setUserDeals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState({ name: "", category: "payments", contact_email: "", account_manager: "", api_status: "not_connected", contract_type: "", notes: "" });
  const [preview, setPreview] = useState(null);
  const [message, setMessage] = useState(null);
  const [compensation, setCompensation] = useState(null);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [showDemo, setShowDemo] = useState(false);
  const [loadError, setLoadError] = useState("");

  const load = async () => {
    setLoading(true);
    setLoadError("");
    try {
      const [providerRows, dealRows] = await Promise.all([
        base44.entities.Provider.list(),
        base44.entities.UserDeal.list(),
      ]);
      const nextProviders = Array.isArray(providerRows) ? providerRows : [];
      setProviders(nextProviders);
      setUserDeals(Array.isArray(dealRows) ? dealRows : []);
      if (selected?.id) setSelected(nextProviders.find(row => row.id === selected.id) || null);
    } catch (caught) {
      setLoadError(caught?.message || "The provider directory could not be loaded.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  // Commercial terms are read through the governed route, never from the entity, so the
  // page cannot show a legacy number without also showing the agreement-bound one.
  useEffect(() => {
    if (!selected?.id) { setCompensation(null); return; }
    let active = true;
    callIntelligence("provider_compensation", { provider_id: selected.id })
      .then(data => { if (active) setCompensation(data); })
      .catch(() => { if (active) setCompensation(null); });
    return () => { active = false; };
  }, [selected?.id]);

  const getMetrics = (providerName) => {
    const deals = userDeals.filter(d => d.provider?.toLowerCase() === providerName?.toLowerCase());
    const active = deals.filter(d => d.status === "active");
    const savings = active.reduce((s, d) => s + (d.estimated_savings || 0), 0);
    return { leads: deals.length, active: active.length, savings, conversion: deals.length > 0 ? Math.round((active.length / deals.length) * 100) : 0 };
  };

  const demoCount = providers.filter(isExplicitDemo).length;
  const visibleProviders = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return providers.filter((provider) => {
      if (!showDemo && isExplicitDemo(provider)) return false;
      if (category !== "all" && provider.category !== category) return false;
      if (!needle) return true;
      return `${provider.name} ${provider.category} ${provider.contact_email} ${provider.account_manager}`.toLowerCase().includes(needle);
    });
  }, [category, providers, query, showDemo]);

  const requestPreview = async () => {
    if (!form.name) return;
    setMessage(null);
    setPreview(null);
    try {
      setPreview(await callIntelligence("preview_provider_write", {
        provider_id: selected?.id || null, patch: form,
      }));
    } catch (caught) {
      setMessage(caught?.data?.reason || caught?.message || "Preview refused.");
    }
  };

  const applyPreview = async () => {
    try {
      await callIntelligence("apply_provider_write", {
        provider_id: selected?.id || null, patch: form,
        expected_preview_hash: preview.preview_hash,
      });
      setPreview(null);
      setMessage(null);
      setShowNew(false);
      await load();
    } catch (caught) {
      setMessage(caught?.data?.reason || caught?.message || "Save refused.");
    }
  };

  if (loading) return <div className="flex items-center justify-center py-40"><div className="w-6 h-6 rounded-full border-2 border-border border-t-foreground animate-spin" /></div>;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black tracking-[-0.03em]">Providers</h1>
          <p className="text-xs text-muted-foreground mt-0.5">{providers.length - demoCount} operational providers · {demoCount} explicitly marked demo</p>
        </div>
        <button onClick={() => { setShowNew(true); setSelected(null); }}
          className="h-9 px-4 rounded-xl bg-foreground text-background text-xs font-bold flex items-center gap-1.5">
          <Plus size={12} /> Add Provider
        </button>
      </div>

      {loadError && <div role="alert" className="rounded-xl border border-rose-300 bg-rose-50 p-3 text-xs text-rose-700">{loadError}</div>}

      <div className="flex flex-wrap gap-2">
        <label className="relative min-w-0 flex-1 sm:min-w-64"><Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search provider, contact or manager" className="h-9 w-full rounded-lg border bg-background pl-9 pr-3 text-xs"/></label>
        <select value={category} onChange={(event) => setCategory(event.target.value)} className="h-9 rounded-lg border bg-background px-3 text-xs"><option value="all">All categories</option>{CATEGORIES.map((value) => <option key={value} value={value}>{value}</option>)}</select>
        {demoCount > 0 && <label className="inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-xs"><input type="checkbox" checked={showDemo} onChange={(event) => setShowDemo(event.target.checked)}/>Show {demoCount} demo</label>}
      </div>

      <div className="flex flex-col gap-4 xl:flex-row">
        {/* Provider list */}
        <div className={`${selected || showNew ? "w-full xl:w-1/2" : "w-full"} rounded-xl border border-border/50 overflow-hidden`}>
          {visibleProviders.length === 0 ? (
            <div className="py-16 text-center">
              <Building2 size={24} className="text-muted-foreground/20 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">No provider matches this filter.</p>
            </div>
          ) : visibleProviders.map(p => {
            const m = getMetrics(p.name);
            return (
              <div key={p.id} onClick={() => { setSelected(p); setForm(editableOnly(p)); setShowNew(false); setPreview(null); setMessage(null); }}
                className={`px-5 py-4 border-b border-border/20 last:border-0 cursor-pointer transition-colors ${selected?.id === p.id ? "bg-secondary/40" : "hover:bg-secondary/20"}`}>
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="text-sm font-bold">{p.name}</p>
                    <p className="text-[11px] text-muted-foreground/40 capitalize">{p.category}</p>
                  </div>
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${API_COLORS[p.api_status]}`}>
                    {p.api_status === "connected" ? "API Connected" : p.api_status === "error" ? "API Error" : "Not connected"}
                  </span>
                </div>
                <div className="grid grid-cols-4 gap-3">
                  {[
                    { label: "Leads", val: m.leads },
                    { label: "Active", val: m.active },
                    { label: "Conversion", val: `${m.conversion}%` },
                    { label: "Savings", val: `€${(m.savings / 1000).toFixed(1)}K/yr` },
                  ].map((s, i) => (
                    <div key={i}>
                      <p className="text-[10px] text-muted-foreground/40">{s.label}</p>
                      <p className="text-sm font-bold">{s.val}</p>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {/* Form panel */}
        {(selected || showNew) && (
          <div className="w-full rounded-xl border border-border/50 bg-card overflow-hidden xl:sticky xl:top-20 xl:w-1/2">
            <div className="px-5 py-4 border-b border-border/40 flex items-center justify-between">
              <p className="text-sm font-bold">{showNew ? "New Provider" : selected?.name}</p>
              <button onClick={() => { setSelected(null); setShowNew(false); }} className="text-muted-foreground/40 hover:text-foreground"><X size={14} /></button>
            </div>
            <div className="p-5 space-y-3 overflow-y-auto max-h-[calc(100vh-200px)]">
              {[
                { key: "name", label: "Provider Name", type: "input" },
                { key: "contact_email", label: "Contact Email", type: "input" },
                { key: "account_manager", label: "Account Manager", type: "input" },
                { key: "contract_type", label: "Contract Type", type: "input" },
              ].map(f => (
                <div key={f.key}>
                  <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground/40 mb-1.5">{f.label}</p>
                  <input value={form[f.key] || ""} onChange={e => setForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                    className="w-full h-9 px-3 text-sm bg-secondary/60 border border-border/50 rounded-lg focus:outline-none focus:border-foreground/20" />
                </div>
              ))}
              <div>
                <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground/40 mb-1.5">Category</p>
                <select value={form.category} onChange={e => setForm(prev => ({ ...prev, category: e.target.value }))}
                  className="w-full h-9 px-3 text-sm bg-secondary/60 border border-border/50 rounded-lg focus:outline-none">
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground/40 mb-1.5">API Status</p>
                <select value={form.api_status} onChange={e => setForm(prev => ({ ...prev, api_status: e.target.value }))}
                  className="w-full h-9 px-3 text-sm bg-secondary/60 border border-border/50 rounded-lg focus:outline-none">
                  <option value="not_connected">Not Connected</option>
                  <option value="connected">Connected</option>
                  <option value="error">Error</option>
                </select>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground/40 mb-1.5">Notes</p>
                <textarea value={form.notes || ""} onChange={e => setForm(prev => ({ ...prev, notes: e.target.value }))}
                  className="w-full h-20 px-3 py-2 text-sm bg-secondary/60 border border-border/50 rounded-lg focus:outline-none resize-none" />
              </div>
              {selected?.id && (
                <div data-testid="provider-compensation" className="rounded-lg border border-border/50 bg-secondary/30 p-2.5 space-y-1">
                  <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground/50 flex items-center gap-1">
                    <ShieldAlert size={11} /> Commercial terms — read only
                  </p>
                  {compensation ? (
                    <>
                      <p className="text-[11px] text-muted-foreground">
                        Legacy revenue share:{" "}
                        <b>{compensation.legacy_state === "NEVER_SET" ? "never set" : `${compensation.legacy_revenue_share_pct}%`}</b>
                        {" "}· not authoritative
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        Agreement-bound rate:{" "}
                        <b>
                          {compensation.governed_rate_state === "SINGLE_RATE"
                            ? `${compensation.governed_rate_bps} bps`
                            : compensation.governed_rate_state.toLowerCase().replaceAll("_", " ")}
                        </b>
                      </p>
                      {compensation.diverges_from_agreement === true && (
                        <p className="text-[11px] font-bold text-rose-700">
                          The legacy number disagrees with the agreement-bound rate.
                        </p>
                      )}
                    </>
                  ) : (
                    <p className="text-[11px] text-muted-foreground">Loading commercial terms…</p>
                  )}
                  <p className="text-[10px] text-muted-foreground/60 leading-snug">
                    Provider compensation is set through the revenue ledger against a hashed agreement, never from this form.
                  </p>
                </div>
              )}

              {preview && (
                <div data-testid="provider-preview" className="rounded-lg border border-sky-200 bg-sky-50 p-2.5 space-y-1.5">
                  <p className="text-xs font-bold text-sky-900">Confirm this change</p>
                  <ul className="text-[11px] text-sky-900 space-y-0.5">
                    {preview.preview.changes.map(change => (
                      <li key={change.field}>
                        <b>{change.field}</b>: {String(change.from || "(empty)")} → {String(change.to || "(empty)")}
                        {change.clears_existing_value && <span className="font-bold text-rose-700"> — clears a stored value</span>}
                      </li>
                    ))}
                  </ul>
                  <ul className="text-[11px] text-sky-900/80 space-y-0.5 pt-1 border-t border-sky-200">
                    {preview.preview.consequences.map(line => <li key={line}>{line}</li>)}
                  </ul>
                  <div className="flex gap-2 pt-1">
                    <button onClick={applyPreview} data-testid="provider-confirm" className="h-7 px-3 rounded-lg bg-foreground text-background text-xs font-bold">
                      Confirm and save
                    </button>
                    <button onClick={() => setPreview(null)} className="h-7 px-3 rounded-lg border border-border text-xs font-bold">
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {message && <p data-testid="provider-message" className="text-xs text-amber-800">{message}</p>}

              <button onClick={requestPreview} disabled={Boolean(preview)} className="w-full h-10 rounded-xl bg-foreground text-background text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-50">
                <Save size={13} /> {showNew ? "Review new provider" : "Review changes"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
