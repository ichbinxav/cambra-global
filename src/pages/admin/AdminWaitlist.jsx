import { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Mail, Copy, Check, RefreshCw, Users, Sparkles, TrendingUp } from "lucide-react";
import AggregateDemandPanel from "@/components/admin/waitlist/AggregateDemandPanel";

/**
 * AdminWaitlist — dedicated admin view for "Join to recover" signups.
 *
 * Waitlist entries are stored as Lead records with source_page starting
 * with "landing_waitlist" or "analyzer_teaser_waitlist". This page filters
 * the Lead entity down to those two sources so it stays independent from
 * the Contact form leads (which use source_page="contact").
 */
export default function AdminWaitlist() {
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [copiedId, setCopiedId] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      // Backend function reads with service role (waitlist leads are created
      // by anonymous public visitors, so a user-scoped read wouldn't see them).
      const res = await base44.functions.invoke("getWaitlistLeads", {});
      const payload = res?.data || res;
      setLeads(Array.isArray(payload?.leads) ? payload.leads : []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const copyEmail = async (id, email) => {
    try {
      await navigator.clipboard.writeText(email);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1500);
    } catch { /* ignore */ }
  };

  // Stats
  const total = leads.length;
  const fromReport = leads.filter(l => l.source_page?.startsWith("analyzer_teaser")).length;
  const fromLanding = leads.filter(l => l.source_page?.startsWith("landing")).length;

  const formatSource = (s) => {
    if (!s) return "—";
    if (s.startsWith("analyzer_teaser")) return "Report teaser";
    if (s.startsWith("landing")) return "Landing page";
    return s;
  };

  const formatDate = (iso) => {
    if (!iso) return "—";
    try {
      return new Date(iso).toLocaleString("en-GB", {
        day: "2-digit", month: "short", year: "numeric",
        hour: "2-digit", minute: "2-digit",
      });
    } catch { return iso; }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-foreground">Waitlist</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Brands that opted in via "Join to recover" — from the landing page or after seeing their report.
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="inline-flex items-center gap-2 h-9 px-4 rounded-full border border-border/60 text-xs font-semibold text-foreground hover:bg-secondary transition-colors disabled:opacity-50"
        >
          <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>

      {/* Stats strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <StatCard icon={Users} label="Total signups" value={total} />
        <StatCard icon={TrendingUp} label="From report" value={fromReport} />
        <StatCard icon={Sparkles} label="From landing" value={fromLanding} />
      </div>

      {/* Aggregate demand — negotiation ammunition, admin-only.
          Reads AnalyzerResult / AnalyzerInput via getWaitlistAggregate
          (single source of truth: scoreEngine outputs, never recomputed here). */}
      <AggregateDemandPanel />

      {/* Table */}
      <div
        className="rounded-2xl overflow-hidden"
        style={{
          background: "rgba(255,255,255,0.03)",
          border: "1px solid rgba(255,255,255,0.08)",
          backdropFilter: "blur(20px)",
        }}
      >
        {loading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Loading…</div>
        ) : leads.length === 0 ? (
          <div className="p-10 text-center">
            <Mail size={24} className="mx-auto text-muted-foreground mb-3" />
            <p className="text-sm font-semibold text-foreground mb-1">No waitlist signups yet</p>
            <p className="text-xs text-muted-foreground">
              When a brand joins from the landing page or after their report, they'll appear here.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[10px] uppercase tracking-[0.18em] font-bold text-muted-foreground border-b border-white/[0.06]">
                  <th className="text-left px-4 py-3">Email</th>
                  <th className="text-left px-4 py-3">Source</th>
                  <th className="text-left px-4 py-3">Context</th>
                  <th className="text-left px-4 py-3">Signed up</th>
                  <th className="text-right px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {leads.map((lead) => (
                  <tr key={lead.id} className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors">
                    <td className="px-4 py-3 font-semibold text-foreground">{lead.email}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                          lead.source_page?.startsWith("analyzer_teaser")
                            ? "text-cyan-300"
                            : "text-blue-300"
                        }`}
                        style={{
                          background: lead.source_page?.startsWith("analyzer_teaser")
                            ? "rgba(34,211,238,0.08)"
                            : "rgba(59,130,246,0.08)",
                          border: `1px solid ${lead.source_page?.startsWith("analyzer_teaser") ? "rgba(34,211,238,0.20)" : "rgba(59,130,246,0.20)"}`,
                        }}
                      >
                        {formatSource(lead.source_page)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground max-w-md truncate" title={lead.notes || ""}>
                      {lead.notes || "—"}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground tabular-nums">{formatDate(lead.created_date)}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => copyEmail(lead.id, lead.email)}
                        className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md border border-border/60 text-[11px] font-medium text-foreground hover:bg-secondary transition-colors"
                      >
                        {copiedId === lead.id ? (
                          <><Check size={11} className="text-emerald-400" /> Copied</>
                        ) : (
                          <><Copy size={11} /> Copy</>
                        )}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value }) {
  return (
    <div
      className="rounded-xl px-4 py-4"
      style={{
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(255,255,255,0.08)",
      }}
    >
      <div className="flex items-center gap-2 mb-2">
        <Icon size={13} className="text-muted-foreground" />
        <p className="text-[10px] uppercase tracking-[0.18em] font-bold text-muted-foreground">{label}</p>
      </div>
      <p className="text-2xl font-black text-foreground tabular-nums">{value}</p>
    </div>
  );
}