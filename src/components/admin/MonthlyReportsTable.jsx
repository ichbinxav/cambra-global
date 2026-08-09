import { useEffect, useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Search } from "lucide-react";
import { Link } from "react-router-dom";

function formatEur(n) {
  return `€${Math.max(0, Math.round(Number(n) || 0)).toLocaleString()}`;
}

const MODE_LABEL = {
  fully_verified: { label: "Verified", cls: "bg-emerald-500/10 text-emerald-700 border-emerald-500/25" },
  estimated_from_partial_data: { label: "Partial", cls: "bg-blue-500/10 text-blue-700 border-blue-500/25" },
  fallback_projection: { label: "Estimated", cls: "bg-amber-500/10 text-amber-700 border-amber-500/25" },
  manual_override: { label: "Manual", cls: "bg-purple-500/10 text-purple-700 border-purple-500/25" },
};

const VSTATUS_LABEL = {
  verified: { label: "Verified", cls: "bg-emerald-500/10 text-emerald-700" },
  realized: { label: "Realized", cls: "bg-emerald-500/10 text-emerald-700" },
  invoiced: { label: "Invoiced", cls: "bg-blue-500/10 text-blue-700" },
  paid: { label: "Paid", cls: "bg-blue-500/10 text-blue-700" },
  under_review: { label: "Reviewing", cls: "bg-amber-500/10 text-amber-700" },
  evidence_submitted: { label: "Evidence", cls: "bg-amber-500/10 text-amber-700" },
  proposed: { label: "Proposed", cls: "bg-muted text-muted-foreground" },
  estimated: { label: "Estimated", cls: "bg-amber-500/10 text-amber-700" },
};

export default function MonthlyReportsTable() {
  const [reports, setReports] = useState([]);
  const [brands, setBrands] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterBrand, setFilterBrand] = useState("all");
  const [filterMonth, setFilterMonth] = useState("all");
  const [filterMode, setFilterMode] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");

  async function load() {
    setLoading(true);
    const [r, b] = await Promise.all([
      base44.entities.MonthlySavingsReport.list("-month", 500),
      base44.entities.Brand.list(),
    ]);
    setReports(r);
    setBrands(b);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  const brandName = (id) => brands.find(x => x.id === id)?.name || "—";

  const filtered = useMemo(() => {
    return reports.filter(r => {
      if (filterBrand !== "all" && r.brand_id !== filterBrand) return false;
      if (filterMonth !== "all" && r.month !== filterMonth) return false;
      if (filterMode !== "all" && r.measurement_mode !== filterMode) return false;
      if (filterStatus !== "all" && r.verification_status !== filterStatus) return false;
      return true;
    });
  }, [reports, filterBrand, filterMonth, filterMode, filterStatus]);

  const months = useMemo(() => Array.from(new Set(reports.map(r => r.month))).sort().reverse(), [reports]);

  // Summary strip — current month (most recent month in dataset)
  const currentMonth = months[0];
  const monthRows = reports.filter(r => r.month === currentMonth && r.status !== "void");
  const monthSavings = monthRows.reduce((s, r) => s + Number(r.savings || 0), 0);
  const monthFees = monthRows.reduce((s, r) => s + Number(r.node_fee || 0), 0);
  const monthVerified = monthRows.filter(r => r.measurement_mode === "fully_verified").length;
  const monthEstimated = monthRows.length - monthVerified;


  if (loading) {
    return <div className="p-6 text-sm text-muted-foreground">Loading monthly reports…</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-black tracking-[-0.02em]">Monthly Reports</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Measured savings per brand per month. Verification and invoicing actions run only through the canonical Recover Billing gates.
          </p>
        </div>
        <Link to="/admin/recover-billing" className="text-xs font-bold underline underline-offset-4">Open Recover Billing</Link>
      </div>

      {/* Summary strip — current month */}
      {currentMonth && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="p-3 rounded-xl border border-border/50 bg-card">
            <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground/50 mb-1">{currentMonth} savings</p>
            <p className="text-lg font-black tabular-nums text-emerald-700">{formatEur(monthSavings)}</p>
          </div>
          <div className="p-3 rounded-xl border border-border/50 bg-card">
            <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground/50 mb-1">{currentMonth} node fees</p>
            <p className="text-lg font-black tabular-nums text-amber-700">{formatEur(monthFees)}</p>
          </div>
          <div className="p-3 rounded-xl border border-border/50 bg-card">
            <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground/50 mb-1">Verified reports</p>
            <p className="text-lg font-black tabular-nums">{monthVerified}</p>
          </div>
          <div className="p-3 rounded-xl border border-border/50 bg-card">
            <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground/50 mb-1">Estimated reports</p>
            <p className="text-lg font-black tabular-nums">{monthEstimated}</p>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center p-3 rounded-xl border border-border/50 bg-secondary/20">
        <Search size={12} className="text-muted-foreground/60 ml-1" />
        <select className="text-xs px-2 py-1.5 rounded-md border border-border/60 bg-card" value={filterBrand} onChange={e => setFilterBrand(e.target.value)}>
          <option value="all">All brands</option>
          {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        <select className="text-xs px-2 py-1.5 rounded-md border border-border/60 bg-card" value={filterMonth} onChange={e => setFilterMonth(e.target.value)}>
          <option value="all">All months</option>
          {months.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
        <select className="text-xs px-2 py-1.5 rounded-md border border-border/60 bg-card" value={filterMode} onChange={e => setFilterMode(e.target.value)}>
          <option value="all">All modes</option>
          <option value="fully_verified">Verified</option>
          <option value="estimated_from_partial_data">Partial</option>
          <option value="fallback_projection">Estimated</option>
          <option value="manual_override">Manual</option>
        </select>
        <select className="text-xs px-2 py-1.5 rounded-md border border-border/60 bg-card" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="all">All verification</option>
          <option value="verified">Verified</option>
          <option value="proposed">Proposed</option>
          <option value="under_review">Under review</option>
          <option value="invoiced">Invoiced</option>
          <option value="paid">Paid</option>
        </select>
        <span className="text-[10px] text-muted-foreground ml-auto">{filtered.length} reports</span>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-border/50 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-secondary/40 border-b border-border/40">
              <tr className="text-left">
                <th className="px-3 py-2 font-semibold">Brand</th>
                <th className="px-3 py-2 font-semibold">Month</th>
                <th className="px-3 py-2 font-semibold">Vertical</th>
                <th className="px-3 py-2 font-semibold text-right">Savings</th>
                <th className="px-3 py-2 font-semibold text-right">Node fee</th>
                <th className="px-3 py-2 font-semibold">Mode</th>
                <th className="px-3 py-2 font-semibold">Verification</th>
                <th className="px-3 py-2 font-semibold">Status</th>
                <th className="px-3 py-2 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/30">
              {filtered.length === 0 && (
                <tr><td colSpan={9} className="px-3 py-8 text-center text-muted-foreground">No reports match these filters.</td></tr>
              )}
              {filtered.map(r => {
                const mode = MODE_LABEL[r.measurement_mode] || MODE_LABEL.fallback_projection;
                const vs = VSTATUS_LABEL[r.verification_status] || VSTATUS_LABEL.proposed;
                const isVoid = r.status === "void";
                return (
                  <tr key={r.id} className={`hover:bg-secondary/20 ${isVoid ? "opacity-40" : ""}`}>
                    <td className="px-3 py-2 font-semibold">{brandName(r.brand_id)}</td>
                    <td className="px-3 py-2 tabular-nums">{r.month}</td>
                    <td className="px-3 py-2 capitalize">{r.vertical || "—"}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-bold text-emerald-700">{formatEur(r.savings)}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-bold text-amber-700">{formatEur(r.node_fee)}</td>
                    <td className="px-3 py-2">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] font-bold ${mode.cls}`}>
                        {mode.label}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${vs.cls}`}>
                        {vs.label}
                      </span>
                    </td>
                    <td className="px-3 py-2 capitalize text-muted-foreground">{r.status}</td>
                    <td className="px-3 py-2 text-right">
                      {!isVoid && <Link to="/admin/recover-billing" className="text-[10px] font-bold underline underline-offset-2">Review in billing</Link>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}