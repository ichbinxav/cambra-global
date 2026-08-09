import { useEffect, useMemo, useState } from "react";
import { Bot, RefreshCw, ShieldCheck, PauseCircle, PlayCircle, MessageSquare, Handshake, Mail, AlertTriangle } from "lucide-react";
import { base44 } from "@/api/base44Client";

const badge = (s) => s === "active" || s === "approved" ? "bg-emerald-500/10 text-emerald-700 border-emerald-500/30" : s === "awaiting_final_approval" || s === "awaiting_approval" ? "bg-rose-500/10 text-rose-700 border-rose-500/30" : s === "paused" || s === "suppressed" ? "bg-amber-500/10 text-amber-700 border-amber-500/30" : "bg-secondary text-foreground border-border/60";
const fmt = (iso) => iso ? new Date(iso).toLocaleString() : "—";

export default function AdminCommercialAutonomy() {
  const [policies, setPolicies] = useState([]);
  const [threads, setThreads] = useState([]);
  const [cases, setCases] = useState([]);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const [p, t, c, m] = await Promise.all([
        base44.functions.invoke("commercialPolicyAdmin", { action: "list" }),
        base44.entities.CommunicationThread.list("-last_message_at", 100).catch(() => []),
        base44.entities.NegotiationCase.list("-started_at", 100).catch(() => []),
        base44.entities.CommunicationMessage.list("-created_date", 200).catch(() => []),
      ]);
      const pd = p?.data || p || {};
      setPolicies(Array.isArray(pd.policies) ? pd.policies : []);
      setThreads(Array.isArray(t) ? t : []);
      setCases(Array.isArray(c) ? c : []);
      setMessages(Array.isArray(m) ? m : []);
      setError(null);
    } catch (e) {
      setError(e?.message || "Could not load commercial autonomy state.");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const stats = useMemo(() => ({
    activePolicies: policies.filter(p => p.status === "active").length,
    openThreads: threads.filter(t => !["closed", "suppressed"].includes(t.status)).length,
    pausedThreads: threads.filter(t => t.automation_paused).length,
    negotiations: cases.filter(c => !["approved", "rejected", "closed", "expired"].includes(c.status)).length,
    awaitingApproval: cases.filter(c => c.status === "awaiting_final_approval").length,
    outbound: messages.filter(m => m.direction === "outbound" && m.send_status === "sent").length,
  }), [policies, threads, cases, messages]);

  const policyAction = async (policy, action) => {
    setBusy(policy.id);
    try {
      const payload = { action, policy_id: policy.id };
      if (action === "activate") payload.confirmation = "APPROVE_AUTONOMY_POLICY";
      const r = await base44.functions.invoke("commercialPolicyAdmin", payload);
      const d = r?.data || r || {};
      if (d.ok === false) throw new Error(d.error || "Policy action failed.");
      await load();
    } catch (e) { setError(e?.message || "Policy action failed."); }
    finally { setBusy(null); }
  };

  const createDraft = async (engine) => {
    setBusy(engine);
    try {
      const r = await base44.functions.invoke("commercialPolicyAdmin", { action: "create_draft", engine });
      const d = r?.data || r || {};
      if (d.ok === false) throw new Error(d.error || "Could not create policy draft.");
      await load();
    } catch (e) { setError(e?.message || "Could not create policy draft."); }
    finally { setBusy(null); }
  };

  return <div className="space-y-6">
    <div className="flex items-start justify-between gap-3 flex-wrap">
      <div><h1 className="text-2xl font-black tracking-tight flex items-center gap-2"><Bot size={19}/> Commercial Autonomy</h1><p className="text-xs text-muted-foreground mt-1">Policy approval, bidirectional threads and persistent provider negotiations. Software acts; humans retain commitment authority.</p></div>
      <button onClick={load} disabled={loading} className="h-8 px-3 rounded-lg border text-xs font-bold inline-flex gap-2 items-center"><RefreshCw size={12} className={loading ? "animate-spin" : ""}/>Refresh</button>
    </div>

    {error && <div className="rounded-xl border border-rose-500/30 bg-rose-500/5 p-3 text-xs text-rose-700">{error}</div>}

    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
      {[["Active policies",stats.activePolicies],["Open threads",stats.openThreads],["Paused",stats.pausedThreads],["Negotiations",stats.negotiations],["Need approval",stats.awaitingApproval],["Sent",stats.outbound]].map(([l,v]) => <div key={l} className="rounded-xl border bg-card p-3"><p className="text-[10px] uppercase tracking-wider text-muted-foreground">{l}</p><p className="text-2xl font-black mt-1">{v}</p></div>)}
    </div>

    <section className="rounded-2xl border bg-card p-4 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap"><div><h2 className="text-sm font-black flex items-center gap-2"><ShieldCheck size={14}/> Founder-approved policies</h2><p className="text-[11px] text-muted-foreground mt-1">No autonomous external send is allowed without an active versioned policy.</p></div><div className="flex gap-2"><button onClick={() => createDraft("merchant_acquisition")} disabled={busy} className="h-8 px-3 rounded-lg border text-xs font-bold">New acquisition policy</button><button onClick={() => createDraft("partner_acquisition")} disabled={busy} className="h-8 px-3 rounded-lg border text-xs font-bold">New partner policy</button><button onClick={() => createDraft("provider_negotiation")} disabled={busy} className="h-8 px-3 rounded-lg border text-xs font-bold">New negotiation policy</button></div></div>
      <div className="overflow-x-auto"><table className="w-full text-xs"><thead><tr className="text-left text-muted-foreground border-b"><th className="py-2">Engine</th><th>Version</th><th>Status</th><th>Countries</th><th>Daily cap</th><th>Approved</th><th></th></tr></thead><tbody>{policies.map(p => <tr key={p.id} className="border-b last:border-0"><td className="py-2 font-bold">{p.engine}</td><td>{p.version}</td><td><span className={`border rounded-full px-2 py-0.5 text-[10px] font-bold ${badge(p.status)}`}>{p.status}</span></td><td>{(p.countries || []).join(", ") || "—"}</td><td>{p.daily_send_limit ?? "—"}</td><td>{p.approved_by || "—"}</td><td className="text-right">{p.status === "draft" && <button onClick={() => policyAction(p,"activate")} disabled={busy===p.id} className="h-7 px-2 rounded-lg bg-foreground text-background font-bold inline-flex items-center gap-1"><PlayCircle size={11}/>Activate</button>}{p.status === "active" && <button onClick={() => policyAction(p,"pause")} disabled={busy===p.id} className="h-7 px-2 rounded-lg border font-bold inline-flex items-center gap-1"><PauseCircle size={11}/>Pause</button>}</td></tr>)}</tbody></table></div>
      {!policies.length && !loading && <p className="text-xs text-muted-foreground">No autonomy policy exists. External autonomous sends remain fail-closed.</p>}
    </section>

    <div className="grid gap-4 lg:grid-cols-2">
      <section className="rounded-2xl border bg-card p-4"><div className="flex items-center gap-2 mb-3"><MessageSquare size={14}/><h2 className="text-sm font-black">Live conversations</h2></div><div className="space-y-2 max-h-[480px] overflow-auto">{threads.map(t => <div key={t.id} className="rounded-xl border p-3"><div className="flex items-start justify-between gap-2"><div><p className="text-xs font-bold">{t.counterparty_name || t.counterparty_email || t.thread_key}</p><p className="text-[10px] text-muted-foreground">{t.engine} · {t.classification || "unclassified"} · {fmt(t.last_message_at)}</p></div><span className={`border rounded-full px-2 py-0.5 text-[10px] font-bold ${badge(t.status)}`}>{t.status}</span></div>{t.automation_paused && <p className="text-[10px] text-amber-700 font-bold mt-2"><AlertTriangle size={10} className="inline mr-1"/>Paused: {t.pause_reason || "review required"}</p>}</div>)}{!threads.length && <p className="text-xs text-muted-foreground">No commercial threads yet.</p>}</div></section>

      <section className="rounded-2xl border bg-card p-4"><div className="flex items-center gap-2 mb-3"><Handshake size={14}/><h2 className="text-sm font-black">Provider negotiations</h2></div><div className="space-y-2 max-h-[480px] overflow-auto">{cases.map(c => <div key={c.id} className="rounded-xl border p-3"><div className="flex items-start justify-between gap-2"><div><p className="text-xs font-bold">{c.provider_name || c.provider_id}</p><p className="text-[10px] text-muted-foreground">Recover {String(c.recover_id || "").slice(0,8)} · round {c.round || 0} · next: {c.next_action || "—"}</p></div><span className={`border rounded-full px-2 py-0.5 text-[10px] font-bold ${badge(c.status)}`}>{c.status}</span></div>{c.best_offer_json?.variable_fee_bps != null && <p className="text-[11px] mt-2"><strong>Best variable fee:</strong> {Number(c.best_offer_json.variable_fee_bps).toFixed(1)} bps</p>}{c.status === "awaiting_final_approval" && <p className="text-[10px] text-rose-700 font-bold mt-2">Final/material offer is waiting in the human Inbox.</p>}</div>)}{!cases.length && <p className="text-xs text-muted-foreground">No provider negotiation cases yet.</p>}</div></section>
    </div>

    <section className="rounded-2xl border bg-card p-4"><div className="flex items-center gap-2 mb-3"><Mail size={14}/><h2 className="text-sm font-black">Authority model</h2></div><div className="grid md:grid-cols-4 gap-3 text-xs"><div className="rounded-xl border p-3"><p className="font-black">L0–L1</p><p className="text-muted-foreground mt-1">Deterministic work, research, scoring and internal tasks.</p></div><div className="rounded-xl border p-3"><p className="font-black">L2</p><p className="text-muted-foreground mt-1">Drafting and reversible controlled actions.</p></div><div className="rounded-xl border p-3"><p className="font-black">L3</p><p className="text-muted-foreground mt-1">External routine action only inside an active founder-approved policy or Recover mandate.</p></div><div className="rounded-xl border border-rose-500/30 p-3"><p className="font-black text-rose-700">L4</p><p className="text-muted-foreground mt-1">Final pricing, lock-in, contract, migration cutover, financial/legal commitments. Human approval required.</p></div></div></section>
  </div>;
}
