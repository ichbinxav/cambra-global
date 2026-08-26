import { useEffect, useState } from "react";
import { Activity, AlertTriangle, Loader2, RefreshCw, ShieldCheck, Workflow } from "lucide-react";
import { base44 } from "@/api/base44Client";

const stateClass = (state) => state === "healthy"
  ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-700"
  : state === "failed"
    ? "border-rose-500/20 bg-rose-500/10 text-rose-700"
    : "border-amber-500/20 bg-amber-500/10 text-amber-800";
const human = (value) => String(value || "unknown").replaceAll("_", " ");
const when = (value) => value ? new Date(value).toLocaleString() : "Sin prueba";

function ProofRow({ icon:Icon, label, status, at, age, detail }) {
  return <div className="rounded-xl border border-border/50 bg-secondary/20 p-3"><div className="flex items-center justify-between gap-3"><span className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-wide text-muted-foreground"><Icon size={12}/>{label}</span><span className={`rounded-full border px-2 py-0.5 text-[9px] font-black uppercase ${stateClass(status)}`}>{human(status)}</span></div><p className="mt-2 text-xs font-bold">{when(at)}</p><p className="mt-1 text-[10px] text-muted-foreground">{age === null || age === undefined ? "Antigüedad desconocida" : `${age} min de antigüedad`}</p>{detail && <p className="mt-1 text-[10px] text-rose-700">{detail}</p>}</div>;
}

export default function AdminAutomations() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await base44.functions.invoke("getAdminOperationsCockpit", {});
      const next = response?.data || response;
      if (next?.ok === false) throw new Error(next.error || "operations_cockpit_unavailable");
      setData(next);
    } catch (caught) {
      setError(caught?.message || "No se pudieron leer las automatizaciones.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const splitProof = (data?.workers || []).some((worker) => worker.activity_status === "healthy" && worker.status !== "healthy");
  return <div className="space-y-6">
    <header className="flex flex-wrap items-start justify-between gap-4"><div><div className="flex items-center gap-2"><Workflow size={18}/><h1 className="text-2xl font-black">Automations</h1></div><p className="mt-1 max-w-3xl text-xs text-muted-foreground">Dos pruebas distintas por worker: su actividad persistida en AgentTask y el recibo protegido de SchedulerRun. Una no sustituye a la otra.</p></div><button type="button" onClick={load} disabled={loading} className="inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-xs font-bold disabled:opacity-50"><RefreshCw size={12} className={loading ? "animate-spin" : ""}/>Actualizar</button></header>

    {error && <div role="alert" className="rounded-xl border border-rose-300 bg-rose-50 p-3 text-xs text-rose-700">{error}</div>}
    {splitProof && <div className="flex gap-3 rounded-2xl border border-amber-500/25 bg-amber-500/[.05] p-4 text-xs"><AlertTriangle size={16} className="mt-0.5 shrink-0"/><p><b>Actividad fresca con prueba de scheduler antigua.</b> El worker ha dejado actividad reciente, pero el recibo del guard programado está stale o ausente. No se oculta ninguna de las dos señales.</p></div>}

    {loading && !data ? <div className="flex items-center justify-center gap-2 rounded-2xl border py-20 text-xs text-muted-foreground"><Loader2 size={14} className="animate-spin"/>Leyendo actividad y recibos de scheduler…</div> : <div className="grid gap-4 lg:grid-cols-2">{(data?.workers || []).map((worker) => <section key={worker.id} className="rounded-2xl border bg-card p-4"><div><h2 className="text-sm font-black">{worker.label}</h2><p className="mt-1 text-[11px] text-muted-foreground">Cada {worker.cadence} · {worker.agent}</p></div><div className="mt-4 grid gap-3 sm:grid-cols-2"><ProofRow icon={Activity} label="Actividad del worker" status={worker.activity_status} at={worker.activity_last_run_at} age={worker.activity_age_minutes} detail={worker.activity_error}/><ProofRow icon={ShieldCheck} label="Prueba del scheduler" status={worker.status} at={worker.last_run_at} age={worker.age_minutes} detail={worker.error}/></div></section>)}</div>}
  </div>;
}
