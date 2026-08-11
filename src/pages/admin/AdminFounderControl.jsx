import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, CheckCircle2, Gauge, Octagon, Pause, Play, RefreshCw, ShieldAlert, WalletCards, XCircle } from "lucide-react";
import { base44 } from "@/api/base44Client";

const DEFAULT_BUDGET = {
  daily_total_limit_minor: 2500,
  monthly_total_limit_minor: 50000,
  anomaly_warning_pct: 70,
  hard_stop_pct: 95,
  category_limits_json: {
    ai: { daily_limit_minor: 1000, monthly_limit_minor: 20000 },
    api: { daily_limit_minor: 600, monthly_limit_minor: 12000 },
    enrichment: { daily_limit_minor: 500, monthly_limit_minor: 10000 },
    email: { daily_limit_minor: 400, monthly_limit_minor: 8000 },
  },
  estimated_unit_cost_minor_json: { ai: 8, api: 12, enrichment: 20, email: 1 },
};
const DEFAULT_PROFILE = { provider:"resend", profile_key:"resend:contact.cambra.global", from_address:"payments@contact.cambra.global", domain:"contact.cambra.global", dkim_selectors:"resend", current_daily_cap:10, target_daily_cap:50 };

function payload(response) { return response?.data || response || {}; }
function GateIcon({ status }) { return status === "PASS" ? <CheckCircle2 size={15} className="text-emerald-400" /> : status === "FAIL" ? <XCircle size={15} className="text-rose-400" /> : <AlertTriangle size={15} className="text-amber-400" />; }

export default function AdminFounderControl() {
  const [goLive, setGoLive] = useState(null);
  const [founder, setFounder] = useState(null);
  const [finalSha, setFinalSha] = useState(import.meta.env.VITE_CAMBRA_GIT_SHA || "");
  const [budget, setBudget] = useState(DEFAULT_BUDGET);
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState(null);
  const [preflight, setPreflight] = useState(null);
  const [profile, setProfile] = useState(DEFAULT_PROFILE);

  const invoke = useCallback(async (name, body = {}) => {
    const response = await base44.functions.invoke(name, body);
    const data = payload(response);
    if (data.ok === false) throw Object.assign(new Error(data.error || "Operation blocked"), { data });
    return data;
  }, []);

  const load = useCallback(async () => {
    setBusy("load");
    try {
      const [status, center] = await Promise.all([
        invoke("goLiveControlAdmin", { action: "status", final_sha: finalSha }),
        invoke("getFounderControlCenter", {}).catch(() => null),
      ]);
      setGoLive(status);
      setFounder(center);
      setNotice(null);
    } catch (error) { setNotice({ type: "error", text: error.message }); }
    finally { setBusy(""); }
  }, [finalSha, invoke]);

  useEffect(() => { load(); }, []);

  const act = async (key, fn) => {
    setBusy(key); setNotice(null);
    try { const result = await fn(); setNotice({ type: "success", text: `${key} completed`, detail: result }); await load(); return result; }
    catch (error) { setNotice({ type: "error", text: error.message, detail: error.data }); return null; }
    finally { setBusy(""); }
  };

  const runPreflight = () => act("preflight", async () => {
    const result = await invoke("commercialGoLiveReadiness", { provider_scope: "all", final_sha: finalSha });
    setPreflight(result); return result;
  });
  const startCanary = () => act("start canary", () => invoke("outboundControlAdmin", { action: "start_all", confirmation: "START_CANARY_OUTBOUND", preflight_hash: preflight?.preflight_hash }));
  const classification = goLive?.classification || "NOT_GO_READY";
  const gates = goLive?.gates || [];
  const blocked = useMemo(() => gates.filter(g => g.status !== "PASS"), [gates]);
  const cost = goLive?.runtime?.cost;
  const emergency = goLive?.runtime?.emergency || {};

  if (!goLive && busy === "load") return <div className="p-8 text-sm text-muted-foreground">Loading Founder Control…</div>;

  return (
    <div className="space-y-6 pb-16">
      <section className="rounded-3xl border border-cyan-400/20 bg-[radial-gradient(circle_at_top_right,rgba(34,211,238,.12),transparent_42%),rgba(6,18,35,.82)] p-5 sm:p-7 shadow-2xl shadow-black/20">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-5">
          <div>
            <div className="flex items-center gap-2 text-cyan-300"><Gauge size={20} /><span className="text-xs font-black uppercase tracking-[.2em]">Founder Command</span></div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight mt-3">Control and stop the machine</h1>
            <p className="text-sm text-white/55 mt-2 max-w-2xl">The canary stays fail-closed until every real-runtime gate passes. Analyzer and read-only intelligence remain available during emergency containment.</p>
          </div>
          <div className={`rounded-2xl border px-5 py-4 min-w-64 ${classification === "GO_READY_FOR_CANARY" ? "border-emerald-400/35 bg-emerald-400/10" : "border-amber-400/35 bg-amber-400/10"}`}>
            <p className="text-[10px] uppercase tracking-[.18em] text-white/55">Activation seal</p>
            <p className="font-black mt-1">{classification}</p>
            <p className="text-xs text-white/55 mt-1">{goLive?.passed || 0}/{goLive?.total || gates.length} hard gates passed</p>
          </div>
        </div>
        <div className="grid sm:grid-cols-[1fr_auto_auto] gap-2 mt-5">
          <input aria-label="Final Git SHA" value={finalSha} onChange={e => setFinalSha(e.target.value.trim())} placeholder="Final immutable Git SHA" className="h-10 rounded-xl border border-white/10 bg-black/20 px-3 text-sm outline-none focus:border-cyan-400/50" />
          <button onClick={load} disabled={!!busy} className="h-10 px-4 rounded-xl border border-white/10 bg-white/5 text-sm font-bold inline-flex items-center justify-center gap-2"><RefreshCw size={14} className={busy === "load" ? "animate-spin" : ""} />Refresh</button>
          <button onClick={() => act("runtime verification", () => invoke("goLiveControlAdmin", { action: "verify_runtime", final_sha: finalSha }))} disabled={!!busy || !finalSha} className="h-10 px-4 rounded-xl bg-cyan-300 text-slate-950 text-sm font-black disabled:opacity-40">Verify real runtime</button>
        </div>
      </section>

      {notice && <div role="status" className={`rounded-xl border p-3 text-sm ${notice.type === "error" ? "border-rose-400/30 bg-rose-400/10 text-rose-200" : "border-emerald-400/30 bg-emerald-400/10 text-emerald-200"}`}>{notice.text}</div>}

      <div className="grid xl:grid-cols-[1.35fr_.65fr] gap-5">
        <section className="rounded-2xl border border-white/10 bg-card/70 p-5">
          <div className="flex items-center justify-between gap-3 mb-4"><div><h2 className="font-black">Hard gates</h2><p className="text-xs text-muted-foreground mt-1">Fresh evidence only. Local assertions cannot satisfy runtime or external gates.</p></div><span className="text-xs text-muted-foreground">{blocked.length} blocked</span></div>
          <div className="space-y-2 max-h-[620px] overflow-auto pr-1">
            {gates.map(gate => <div key={gate.key} className="rounded-xl border border-white/[.07] bg-white/[.025] p-3 flex items-start gap-3"><GateIcon status={gate.status} /><div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-3"><p className="text-sm font-bold">{gate.label}</p><span className="text-[10px] uppercase text-muted-foreground">{gate.status}</span></div>{gate.blockers?.length > 0 && <p className="text-xs text-amber-200/70 mt-1 break-words">{gate.blockers.join(" · ")}</p>}<p className="text-[10px] text-muted-foreground mt-1">{gate.evidence?.source || "No acceptable evidence"}{gate.evidence?.observed_at ? ` · ${new Date(gate.evidence.observed_at).toLocaleString()}` : ""}</p></div></div>)}
          </div>
        </section>

        <div className="space-y-5">
          <section className={`rounded-2xl border p-5 ${emergency.safe_mode ? "border-rose-400/40 bg-rose-400/10" : "border-white/10 bg-card/70"}`}>
            <div className="flex items-center gap-2"><Octagon className="text-rose-400" size={18} /><h2 className="font-black">Global emergency stop</h2></div>
            <p className="text-xs text-muted-foreground mt-2">Stops outbound, negotiation, migration and new billing execution. Safe Analyzer/read-only intelligence remains alive.</p>
            <div className="grid grid-cols-2 gap-2 mt-4">
              <button onClick={() => act("emergency stop", () => invoke("emergencyControlAdmin", { action: "safe_mode_on", confirmation: "ACTIVATE_CAMBRA_SAFE_MODE", reason: "Founder global emergency stop" }))} disabled={!!busy || emergency.safe_mode} className="h-10 rounded-xl bg-rose-500 text-white text-sm font-black disabled:opacity-40">STOP ALL EFFECTS</button>
              <button onClick={() => act("safe resume", () => invoke("emergencyControlAdmin", { action: "safe_mode_off", confirmation: "RESTORE_CAMBRA_AUTONOMY", reason: "Founder reviewed safe resume" }))} disabled={!!busy || !emergency.safe_mode} className="h-10 rounded-xl border border-white/10 text-sm font-bold disabled:opacity-40">Safe resume</button>
            </div>
            <button onClick={() => act("emergency drill", () => invoke("goLiveControlAdmin", { action: "emergency_drill", confirmation: "RUN_GLOBAL_EMERGENCY_STOP_DRILL", final_sha: finalSha }))} disabled={!!busy || emergency.safe_mode || !finalSha} className="mt-2 w-full h-9 rounded-xl border border-white/10 text-xs font-bold disabled:opacity-40">Run end-to-end stop drill while paused</button>
          </section>

          <section className="rounded-2xl border border-white/10 bg-card/70 p-5">
            <div className="flex items-center gap-2"><Play size={17} className="text-emerald-400" /><h2 className="font-black">Canary control</h2></div>
            <p className="text-xs text-muted-foreground mt-2">Start is impossible without a fresh matching preflight hash and all hard gates.</p>
            <div className="grid grid-cols-2 gap-2 mt-4">
              <button onClick={runPreflight} disabled={!!busy || !finalSha} className="h-10 rounded-xl border border-cyan-400/30 text-cyan-200 text-sm font-bold disabled:opacity-40">Dry-run preflight</button>
              <button onClick={startCanary} disabled={!!busy || !preflight?.preflight_hash || classification !== "GO_READY_FOR_CANARY"} className="h-10 rounded-xl bg-emerald-400 text-slate-950 text-sm font-black disabled:opacity-35">Start 10–15/day</button>
              <button onClick={() => act("pause outbound", () => invoke("outboundControlAdmin", { action: "pause_all" }))} disabled={!!busy} className="h-10 rounded-xl border border-white/10 text-sm font-bold inline-flex justify-center items-center gap-2"><Pause size={13} />Pause</button>
              <button onClick={() => act("control exercise", () => invoke("outboundControlAdmin", { action: "exercise_controls", confirmation: "EXERCISE_FOUNDER_CANARY_CONTROL", final_sha: finalSha, provider_scope: "all" }))} disabled={!!busy || !finalSha} className="h-10 rounded-xl border border-white/10 text-sm font-bold">Exercise controls</button>
            </div>
            {preflight?.blockers?.length > 0 && <p className="mt-3 text-xs text-amber-200/70">{preflight.blockers.slice(0, 6).join(" · ")}</p>}
          </section>
        </div>
      </div>

      <section className="rounded-2xl border border-white/10 bg-card/70 p-5">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4"><div className="flex gap-2"><WalletCards size={18} className="text-cyan-300" /><div><h2 className="font-black">Paid-operation budget</h2><p className="text-xs text-muted-foreground mt-1">EUR minor units. AI, API, enrichment and email all fail closed before provider execution.</p></div></div><div className="text-xs text-muted-foreground">Active: {cost?.control?.version || "none"} · daily used {cost?.usage?.daily_total_minor ?? "—"}</div></div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-5">
          {["ai","api","enrichment","email"].map(category => <div key={category} className="rounded-xl border border-white/[.07] p-3"><p className="text-xs uppercase font-bold text-muted-foreground">{category}</p><label className="block text-[10px] text-muted-foreground mt-2">Daily<input type="number" min="1" value={budget.category_limits_json[category].daily_limit_minor} onChange={e => setBudget(current => ({ ...current, category_limits_json:{ ...current.category_limits_json, [category]:{ ...current.category_limits_json[category], daily_limit_minor:Number(e.target.value) } } }))} className="mt-1 w-full h-9 rounded-lg border border-white/10 bg-black/20 px-3 text-sm text-foreground" /></label><label className="block text-[10px] text-muted-foreground mt-2">Monthly<input type="number" min="1" value={budget.category_limits_json[category].monthly_limit_minor} onChange={e => setBudget(current => ({ ...current, category_limits_json:{ ...current.category_limits_json, [category]:{ ...current.category_limits_json[category], monthly_limit_minor:Number(e.target.value) } } }))} className="mt-1 w-full h-9 rounded-lg border border-white/10 bg-black/20 px-3 text-sm text-foreground" /></label></div>)}
        </div>
        <div className="grid sm:grid-cols-4 gap-3 mt-3">
          <label className="text-xs text-muted-foreground">Daily total<input type="number" value={budget.daily_total_limit_minor} onChange={e => setBudget({ ...budget, daily_total_limit_minor:Number(e.target.value) })} className="mt-1 w-full h-9 rounded-lg border border-white/10 bg-black/20 px-3 text-foreground" /></label>
          <label className="text-xs text-muted-foreground">Monthly total<input type="number" value={budget.monthly_total_limit_minor} onChange={e => setBudget({ ...budget, monthly_total_limit_minor:Number(e.target.value) })} className="mt-1 w-full h-9 rounded-lg border border-white/10 bg-black/20 px-3 text-foreground" /></label>
          <label className="text-xs text-muted-foreground">Warning %<input type="number" value={budget.anomaly_warning_pct} onChange={e => setBudget({ ...budget, anomaly_warning_pct:Number(e.target.value) })} className="mt-1 w-full h-9 rounded-lg border border-white/10 bg-black/20 px-3 text-foreground" /></label>
          <label className="text-xs text-muted-foreground">Hard stop %<input type="number" value={budget.hard_stop_pct} onChange={e => setBudget({ ...budget, hard_stop_pct:Number(e.target.value) })} className="mt-1 w-full h-9 rounded-lg border border-white/10 bg-black/20 px-3 text-foreground" /></label>
        </div>
        <div className="flex flex-wrap gap-2 mt-4"><button onClick={() => act("cost budget", () => invoke("goLiveControlAdmin", { action: "configure_cost_budget", confirmation: "APPLY_FOUNDER_COST_BUDGET", version: `founder-${new Date().toISOString().slice(0,10)}-${Date.now()}`, ...budget }))} disabled={!!busy} className="h-9 px-4 rounded-xl bg-cyan-300 text-slate-950 text-xs font-black disabled:opacity-40">Apply budget</button><button onClick={() => act("cost kill-switch drill", () => invoke("goLiveControlAdmin", { action:"cost_kill_switch_drill", confirmation:"RUN_COST_KILL_SWITCH_DRILL", final_sha:finalSha }))} disabled={!!busy || !cost?.control || goLive?.runtime?.outbound_control?.acquisition_enabled === true} className="h-9 px-4 rounded-xl border border-amber-400/30 text-amber-200 text-xs font-bold disabled:opacity-40">Test cost kill-switch</button><button onClick={() => act("clear cost stop", () => invoke("goLiveControlAdmin", { action: "clear_cost_emergency_stop", confirmation: "CLEAR_COST_EMERGENCY_STOP" }))} disabled={!!busy || !cost?.control?.emergency_stop_active} className="h-9 px-4 rounded-xl border border-white/10 text-xs font-bold disabled:opacity-40">Clear cost stop after review</button></div>
      </section>

      <section className="rounded-2xl border border-white/10 bg-card/70 p-5">
        <div><h2 className="font-black">Sending profiles and deliverability</h2><p className="text-xs text-muted-foreground mt-1">Configure an exact sender and DKIM selectors. Saving always forces the profile to paused; DNS verification and a fresh GO preflight are still mandatory.</p></div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-4">
          <label className="text-xs text-muted-foreground">Provider<select value={profile.provider} onChange={e => setProfile({...profile,provider:e.target.value})} className="mt-1 w-full h-9 rounded-lg border border-white/10 bg-slate-950 px-3 text-foreground"><option value="resend">Resend</option><option value="outlook">Outlook</option></select></label>
          <label className="text-xs text-muted-foreground">Profile key<input value={profile.profile_key} onChange={e => setProfile({...profile,profile_key:e.target.value})} className="mt-1 w-full h-9 rounded-lg border border-white/10 bg-black/20 px-3 text-foreground" /></label>
          <label className="text-xs text-muted-foreground">From address<input type="email" value={profile.from_address} onChange={e => setProfile({...profile,from_address:e.target.value})} className="mt-1 w-full h-9 rounded-lg border border-white/10 bg-black/20 px-3 text-foreground" /></label>
          <label className="text-xs text-muted-foreground">Domain<input value={profile.domain} onChange={e => setProfile({...profile,domain:e.target.value})} className="mt-1 w-full h-9 rounded-lg border border-white/10 bg-black/20 px-3 text-foreground" /></label>
          <label className="text-xs text-muted-foreground sm:col-span-2">DKIM selectors (comma-separated)<input value={profile.dkim_selectors} onChange={e => setProfile({...profile,dkim_selectors:e.target.value})} className="mt-1 w-full h-9 rounded-lg border border-white/10 bg-black/20 px-3 text-foreground" /></label>
          <label className="text-xs text-muted-foreground">Canary daily cap<input type="number" min="1" max="15" value={profile.current_daily_cap} onChange={e => setProfile({...profile,current_daily_cap:Number(e.target.value)})} className="mt-1 w-full h-9 rounded-lg border border-white/10 bg-black/20 px-3 text-foreground" /></label>
          <label className="text-xs text-muted-foreground">Target cap<input type="number" min="1" max="500" value={profile.target_daily_cap} onChange={e => setProfile({...profile,target_daily_cap:Number(e.target.value)})} className="mt-1 w-full h-9 rounded-lg border border-white/10 bg-black/20 px-3 text-foreground" /></label>
        </div>
        <div className="flex flex-wrap items-center gap-3 mt-4"><button onClick={() => act("sending profile", () => invoke("goLiveControlAdmin", { action:"configure_sending_profile", confirmation:"CONFIGURE_OUTBOUND_SENDING_PROFILE", ...profile, dkim_selectors:profile.dkim_selectors.split(",").map(value => value.trim()).filter(Boolean) }))} disabled={!!busy} className="h-9 px-4 rounded-xl bg-cyan-300 text-slate-950 text-xs font-black disabled:opacity-40">Save paused profile</button><span className="text-xs text-muted-foreground">Configured: {goLive?.runtime?.sending_profiles?.length || 0}</span></div>
        {(goLive?.runtime?.sending_profiles || []).map(item => <div key={item.id || item.profile_key} className="mt-3 rounded-xl border border-white/[.07] p-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"><div><p className="text-sm font-bold">{item.profile_key}</p><p className="text-[11px] text-muted-foreground">{item.from_address} · {item.status} · {item.current_daily_cap}/day</p></div><div className="flex gap-2"><button onClick={() => act("profile warm-up", () => invoke("goLiveControlAdmin", { action:"enable_sending_profile_warmup", confirmation:"ENABLE_SENDING_PROFILE_WARMUP", profile_key:item.profile_key, final_sha:finalSha }))} disabled={!!busy || item.status !== "paused" || !finalSha} className="h-8 px-3 rounded-lg border border-emerald-400/30 text-emerald-200 text-xs font-bold disabled:opacity-35">Enable verified warm-up</button><button onClick={() => act("pause profile", () => invoke("goLiveControlAdmin", { action:"pause_sending_profile", confirmation:"PAUSE_SENDING_PROFILE", profile_key:item.profile_key }))} disabled={!!busy || item.status === "paused"} className="h-8 px-3 rounded-lg border border-white/10 text-xs font-bold disabled:opacity-35">Pause</button></div></div>)}
      </section>

      <div className="grid lg:grid-cols-3 gap-4">
        <Link to="/admin/inbox" className="rounded-2xl border border-white/10 bg-card/70 p-5 hover:border-cyan-400/30 transition-colors"><ShieldAlert size={18} className="text-cyan-300" /><h3 className="font-black mt-3">Approve and reject</h3><p className="text-xs text-muted-foreground mt-1">Canonical Founder Inbox · {founder?.approvals?.length || goLive?.runtime?.pending_approvals?.length || 0} pending</p></Link>
        <button onClick={() => act("founder control verification", () => invoke("goLiveControlAdmin", { action: "verify_founder_control", final_sha: finalSha }))} disabled={!!busy || !finalSha} className="text-left rounded-2xl border border-white/10 bg-card/70 p-5 hover:border-cyan-400/30 disabled:opacity-40"><CheckCircle2 size={18} className="text-emerald-400" /><h3 className="font-black mt-3">Verify founder drill</h3><p className="text-xs text-muted-foreground mt-1">Checks blockers, limits, stop/resume, approvals and canary controls.</p></button>
        <div className="rounded-2xl border border-white/10 bg-card/70 p-5"><ShieldAlert size={18} className="text-amber-300" /><h3 className="font-black mt-3">Critical exceptions</h3><p className="text-xs text-muted-foreground mt-1">{goLive?.runtime?.open_incidents?.length || founder?.critical_exceptions?.length || 0} open incidents · never hidden by a composite score</p></div>
      </div>
    </div>
  );
}
