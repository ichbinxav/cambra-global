import { useEffect, useState } from "react";
import { AlertTriangle, FlaskConical, Loader2, RefreshCw, Route, ShieldCheck } from "lucide-react";
import { base44 } from "@/api/base44Client";

const fmt = (value) => new Intl.NumberFormat("es-ES").format(Number(value || 0));
const human = (value) => String(value || "DESCONOCIDO").replaceAll("_", " ");

export default function AdminRoutingIntelligence() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [brandId, setBrandId] = useState("");
  const [providers, setProviders] = useState("");
  const [simulation, setSimulation] = useState(null);
  const [simulating, setSimulating] = useState(false);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await base44.functions.invoke("getRoutingIntelligenceCommandCenter", {});
      const next = response?.data || response;
      if (next?.ok === false) throw new Error(next.error || "routing_intelligence_unavailable");
      setData(next);
    } catch (caught) {
      setError(caught?.message || "No se pudo cargar Routing Intelligence.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const runSimulation = async () => {
    if (!brandId) return;
    setSimulating(true);
    setError("");
    setSimulation(null);
    try {
      const response = await base44.functions.invoke("routingSimulator", {
        brand_id:brandId,
        mode:"cost_only",
        allowed_provider_slugs:providers.split(",").map((value) => value.trim()).filter(Boolean),
      });
      const next = response?.data || response;
      if (next?.ok === false) throw new Error(next.error || "routing_simulation_failed");
      setSimulation(next?.simulation || null);
    } catch (caught) {
      setError(caught?.message || "La simulación no pudo completarse.");
    } finally {
      setSimulating(false);
    }
  };

  if (loading && !data) return <div className="flex items-center justify-center gap-2 rounded-2xl border py-20 text-xs text-muted-foreground"><Loader2 size={14} className="animate-spin"/>Cargando inteligencia de enrutamiento…</div>;
  const metrics = data?.metrics || {};

  return <div className="space-y-6">
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div><div className="flex flex-wrap items-center gap-2"><Route size={20}/><h1 className="text-xl font-black">Inteligencia de enrutamiento</h1><span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[10px] font-black text-amber-800">SOLO SHADOW</span></div><p className="mt-2 max-w-3xl text-sm text-muted-foreground">Observa y simula de forma retrospectiva. No activa rutas, no captura ni reintenta pagos y no modifica el checkout.</p></div>
      <button type="button" onClick={load} disabled={loading} className="inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-xs font-bold disabled:opacity-50"><RefreshCw size={12} className={loading ? "animate-spin" : ""}/>Actualizar</button>
    </header>

    {error && <div role="alert" className="rounded-xl border border-rose-300 bg-rose-50 p-3 text-xs text-rose-700">{error}</div>}

    <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">{[
      ["Observaciones", metrics.observations], ["Transacciones", metrics.transaction_level], ["Ventanas históricas", metrics.aggregate_windows],
      ["Decisiones shadow", metrics.shadow_decisions], ["Oportunidades", metrics.opportunities], ["Cohortes ≥50", metrics.approval_segments],
    ].map(([label, value]) => <div key={label} className="rounded-xl border p-4"><p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p><p className="mt-1 text-2xl font-black">{fmt(value)}</p></div>)}</div>

    <section className="rounded-2xl border p-5">
      <div className="flex items-center gap-2"><FlaskConical size={16}/><h2 className="font-black">Simulador retrospectivo</h2></div>
      <p className="mt-1 text-[11px] text-muted-foreground">Compara costes sobre observaciones ya almacenadas. El resultado es contrafactual, nunca ahorro realizado.</p>
      <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_auto]">
        <select value={brandId} onChange={(event) => setBrandId(event.target.value)} className="h-10 min-w-0 rounded-lg border bg-background px-3 text-sm" aria-label="Marca para simular"><option value="">Selecciona una marca…</option>{(data?.brands || []).map((brand) => <option key={brand.id} value={brand.id}>{brand.name}</option>)}</select>
        <input value={providers} onChange={(event) => setProviders(event.target.value)} placeholder="Slugs de proveedores permitidos, separados por comas (vacío = todos)" className="h-10 min-w-0 rounded-lg border bg-background px-3 text-sm"/>
        <button type="button" onClick={runSimulation} disabled={!brandId || simulating} className="h-10 rounded-lg bg-foreground px-4 text-sm font-bold text-background disabled:opacity-40">{simulating ? "Simulando…" : "Simular"}</button>
      </div>
      {simulation && <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[
        ["Modo", human(simulation.mode)], ["Cobertura", simulation.coverage ?? "—"], ["Delta estimado", simulation.estimated_cost_delta_minor ?? "—"], ["Confianza", simulation.confidence ?? "—"],
      ].map(([label, value]) => <div key={label} className="rounded-xl border bg-secondary/20 p-3"><p className="text-[9px] font-black uppercase text-muted-foreground">{label}</p><p className="mt-1 text-sm font-black">{value}</p></div>)}</div>}
    </section>

    <div className="grid gap-4 lg:grid-cols-2">
      <section className="rounded-2xl border p-5"><h2 className="font-black">Preparación por marca</h2><p className="mt-1 text-[11px] text-muted-foreground">Evaluaciones más recientes; las marcas demo se señalan explícitamente.</p><div className="mt-3 space-y-2">{(data?.readiness || []).slice(0, 20).map((row) => <div key={row.id} className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm"><span className="min-w-0 truncate font-bold">{row.brand_name || "Marca no disponible"}{row.brand_is_demo ? " · DEMO" : ""}</span><span className="shrink-0 text-xs font-black">{human(row.level)}</span></div>)}{!(data?.readiness || []).length && <p className="py-8 text-center text-sm text-muted-foreground">Todavía no se ha ejecutado ninguna evaluación. Esto no autoriza enrutamiento real.</p>}</div></section>
      <section className="rounded-2xl border p-5"><div className="flex items-center gap-2"><ShieldCheck size={16}/><h2 className="font-black">Límite duro</h2></div><ul className="mt-3 space-y-2 text-sm text-muted-foreground"><li>Enrutamiento real permitido: <b className="text-foreground">no</b></li><li>PAN/CVV sin procesar: <b className="text-foreground">prohibido</b></li><li>Aprobación contrafactual sin muestra: <b className="text-foreground">suprimida</b></li><li>Fuente de precios: <b className="text-foreground">Provider Intelligence gobernada</b></li></ul></section>
    </div>

    <div className="flex gap-3 rounded-2xl border border-amber-500/20 bg-amber-500/[.05] p-4 text-sm"><AlertTriangle size={18} className="mt-0.5 shrink-0"/><div><b>La activación real sigue deliberadamente inaccesible.</b><p className="mt-1 text-muted-foreground">PCI, PSD2/SCA, contratos, SLA/SLO, reconciliación, kill switch, respuesta a incidentes y responsabilidad legal deben quedar demostrados antes de cualquier activación.</p></div></div>
  </div>;
}
