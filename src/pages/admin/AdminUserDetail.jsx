import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";

const payload = (response) => response?.data || response || {};
async function callIntegration(action, body = {}) {
  const data = payload(await base44.functions.invoke("adminSummaries", { action: `integration_${action}`, ...body }));
  if (data?.ok === false || data?.error) {
    throw Object.assign(new Error(data?.error || "integration_operation_failed"), { data });
  }
  return data;
}
import { ArrowLeft, Send } from "lucide-react";

const STATUS_COLORS = {
  active: "text-green-600 bg-green-500/10 border-green-500/20",
  waitlist: "text-blue-600 bg-blue-500/10 border-blue-500/20",
  pending: "text-orange-500 bg-orange-500/10 border-orange-500/20",
  expired: "text-muted-foreground bg-secondary border-border/40",
};

export default function AdminUserDetail() {
  const { id } = useParams();
  const urlParams = new URLSearchParams(window.location.search);
  const emailHint = urlParams.get("email");

  const [user, setUser] = useState(null);
  const [ownerEmail, setOwnerEmail] = useState("");
  const [brand, setBrand] = useState(null);
  const [results, setResults] = useState([]);
  const [deals, setDeals] = useState([]);
  const [notes, setNotes] = useState([]);
  const [newNote, setNewNote] = useState("");
  const [noteError, setNoteError] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      setLoadError("");
      try {
        const users = await base44.entities.User.filter({ id }, "-created_date", 2);
        const matched = (users || []).find((candidate) => candidate.id === id) || users?.[0] || null;
        if (!matched) {
          if (alive) setUser(null);
          return;
        }
        const authoritativeEmail = matched.email || emailHint || "";
        if (!authoritativeEmail) throw new Error("User email is unavailable");
        const [brands, res, ud, nts] = await Promise.all([
          base44.entities.Brand.filter({ created_by: authoritativeEmail }, "-created_date", 2),
          base44.entities.AnalyzerResult.filter({ created_by: authoritativeEmail }, "-created_date", 100),
          base44.entities.UserDeal.filter({ user_email: authoritativeEmail }, "-created_date", 100),
          base44.entities.AdminNote.filter({ target_id: authoritativeEmail }, "-created_date", 100),
        ]);
        if (!alive) return;
        setUser(matched);
        setOwnerEmail(authoritativeEmail);
        setBrand(brands[0] || null);
        setResults(res || []);
        setDeals(ud || []);
        setNotes(nts || []);
      } catch (error) {
        if (alive) setLoadError(error?.message || "Could not load user");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [id, emailHint]);

  const addNote = async () => {
    if (!newNote.trim()) return;
    // DASHBOARD-C15: this used to send `author: me?.email || "admin"`, so a note written when
    // the current user could not be read was stored as if a person called "admin" had written
    // it — indistinguishable from a real one afterwards. The author is now the authenticated
    // actor on the server, and the write refuses when there is no actor.
    const result = await callIntegration("record_note", {
      target_type: "user", target_id: ownerEmail, note: newNote,
    }).catch((caught) => ({ ok: false, error: caught?.data?.reason || caught?.message }));
    if (!result?.ok) { setNoteError(result?.error || "Note refused."); return; }
    setNoteError(null);
    setNotes(prev => [...prev, { id: result.note_id, target_type: "user", target_id: ownerEmail, note: newNote, author: result.author }]);
    setNewNote("");
  };

  if (loading) return <div className="flex items-center justify-center py-40"><div className="w-6 h-6 rounded-full border-2 border-border border-t-foreground animate-spin" /></div>;
  if (loadError) return <div role="alert" className="py-20 text-center text-red-600">{loadError}</div>;
  if (!user) return <div className="py-20 text-center text-muted-foreground">User not found</div>;

  const latestResult = results[0];
  const activeDeals = deals.filter(d => d.status === "active");
  const totalActiveSavings = activeDeals.reduce((s, d) => s + (d.estimated_savings || 0), 0);

  return (
    <div className="min-w-0 max-w-4xl space-y-5">
      <div className="flex min-w-0 items-center gap-3">
        <Link to="/admin/users" className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft size={12} /> Users
        </Link>
        <span className="text-border">/</span>
        <span className="truncate text-xs font-medium">{user.full_name}</span>
      </div>

      {/* Header */}
      <div className="min-w-0 p-4 sm:p-6 rounded-xl border border-border/50 bg-card">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="break-words text-xl font-black tracking-tight">{user.full_name}</h1>
            <p className="break-all text-sm text-muted-foreground mt-0.5">{user.email}</p>
            {brand && <p className="text-xs text-muted-foreground/50 mt-1">{brand.name} · {brand.country || "—"}</p>}
          </div>
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground/40 mb-1">Infra Score</p>
            <p className={`text-3xl font-black ${latestResult?.infra_score >= 80 ? "text-green-600" : latestResult?.infra_score >= 60 ? "text-orange-500" : "text-blue-600"}`}>
              {latestResult?.infra_score || "—"}
            </p>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-5 pt-5 border-t border-border/30">
          {[
            { label: "Analyses run", val: results.length },
            { label: "Active deals", val: activeDeals.length },
            { label: "Total deals", val: deals.length },
            { label: "Savings activated", val: totalActiveSavings ? `€${totalActiveSavings.toLocaleString()}/yr` : "—" },
          ].map((s, i) => (
            <div key={i}>
              <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground/40 mb-1">{s.label}</p>
              <p className="text-lg font-black">{s.val}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Two columns */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Latest analysis */}
        <div className="p-5 rounded-xl border border-border/50 bg-card">
          <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground/50 mb-4">Latest Analysis</p>
          {latestResult ? (
            <div className="space-y-3">
              {[
                { label: "Total savings", val: `€${(latestResult.total_savings || 0).toLocaleString()}/yr`, color: "text-foreground" },
                { label: "Payments", val: `€${(latestResult.payment_savings || 0).toLocaleString()}/yr`, color: "text-blue-600" },
                { label: "Shipping", val: `€${(latestResult.shipping_savings || 0).toLocaleString()}/yr`, color: "text-green-600" },
                { label: "SaaS", val: `€${(latestResult.saas_savings || 0).toLocaleString()}/yr`, color: "text-orange-500" },
              ].map((row, i) => (
                <div key={i} className="flex items-center justify-between">
                  <p className="text-xs text-muted-foreground/60">{row.label}</p>
                  <p className={`text-sm font-bold ${row.color}`}>{row.val}</p>
                </div>
              ))}
              <p className="text-[11px] text-muted-foreground/30 pt-2 border-t border-border/30">
                {new Date(latestResult.created_date).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No analysis yet</p>
          )}
        </div>

        {/* Brand info */}
        <div className="p-5 rounded-xl border border-border/50 bg-card">
          <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground/50 mb-4">Company Profile</p>
          {brand ? (
            <div className="space-y-2">
              {[
                { label: "Company", val: brand.name },
                { label: "Country", val: brand.country || "—" },
                { label: "Revenue tier", val: brand.annual_revenue || "—" },
                { label: "Category", val: brand.category || "—" },
                { label: "Team size", val: brand.size || "—" },
              ].map((row, i) => (
                <div key={i} className="flex items-center justify-between">
                  <p className="text-xs text-muted-foreground/60">{row.label}</p>
                  <p className="text-xs font-semibold">{row.val}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No company profile</p>
          )}
        </div>
      </div>

      {/* Deal history */}
      <div className="rounded-xl border border-border/50 overflow-hidden">
        <div className="px-5 py-3.5 border-b border-border/40">
          <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground/50">Deal History</p>
        </div>
        {deals.length > 0 ? deals.map(d => (
          <div key={d.id} className="px-5 py-3.5 border-b border-border/20 last:border-0 flex flex-wrap items-center gap-3">
            <div className="flex-1">
              <p className="text-sm font-semibold">{d.deal_name}</p>
              <p className="text-[11px] text-muted-foreground/40">{d.provider} · {d.category}</p>
            </div>
            <span className={`text-[10px] font-semibold px-2.5 py-1 rounded-full border ${STATUS_COLORS[d.status] || ""}`}>
              {d.status}
            </span>
            {d.estimated_savings && (
              <p className="text-sm font-bold text-green-600">€{d.estimated_savings.toLocaleString()}/yr</p>
            )}
            <p className="text-[11px] text-muted-foreground/30">{new Date(d.created_date).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</p>
          </div>
        )) : (
          <div className="py-8 text-center text-sm text-muted-foreground">No deals yet</div>
        )}
      </div>

      {/* Internal notes */}
      <div className="rounded-xl border border-border/50 overflow-hidden">
        <div className="px-5 py-3.5 border-b border-border/40">
          <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground/50">Internal Notes</p>
        </div>
        <div className="p-5 space-y-3">
          {notes.map(n => (
            <div key={n.id} className="p-3 rounded-lg bg-secondary/40 border border-border/30">
              <p className="text-sm">{n.note}</p>
              <p className="text-[11px] text-muted-foreground/40 mt-1.5">{n.author} · {new Date(n.created_date).toLocaleDateString("en-GB")}</p>
            </div>
          ))}
          {noteError && (
            <p data-testid="note-error" className="text-[11px] text-amber-800 pt-2">{noteError}</p>
          )}
          <div className="flex flex-col sm:flex-row gap-2 pt-2">
            <input
              value={newNote} onChange={e => setNewNote(e.target.value)}
              placeholder="Add internal note..."
              className="flex-1 h-9 px-3 text-sm bg-secondary/60 border border-border/50 rounded-lg focus:outline-none focus:border-foreground/20"
              onKeyDown={e => e.key === "Enter" && addNote()}
            />
            <button onClick={addNote} className="h-9 px-4 rounded-lg bg-foreground text-background text-xs font-bold flex items-center gap-1.5">
              <Send size={11} /> Add
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
