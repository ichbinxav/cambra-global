import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Loader2, RefreshCw, Sparkles } from "lucide-react";
import { base44 } from "@/api/base44Client";

const TYPES = ["all", "vertical_priority", "deal_suggestion", "missing_data", "next_action", "opportunity_ranking"];
const human = (value) => String(value || "—").replaceAll("_", " ");
const isStale = (value) => value && Date.now() - Date.parse(value) > 30 * 86400000;

export default function AdminRecommendations() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [type, setType] = useState("all");
  const [showDemo, setShowDemo] = useState(false);
  const [busy, setBusy] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await base44.functions.invoke("getAdminRecommendationQueue", {});
      const next = response?.data || response;
      if (next?.ok === false || next?.error) throw new Error(next.error || "recommendation_queue_unavailable");
      setItems(Array.isArray(next?.items) ? next.items : []);
    } catch (caught) {
      setError(caught?.message || "No se pudieron cargar las recomendaciones.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return items.filter((row) => {
      if (!showDemo && row.brand_is_demo === true) return false;
      if (type !== "all" && row.type !== type) return false;
      if (!needle) return true;
      return `${row.brand_name} ${row.brand_email} ${row.title} ${row.description} ${row.action_required}`.toLowerCase().includes(needle);
    });
  }, [items, query, showDemo, type]);

  const regenerate = async (row) => {
    if (!window.confirm(`¿Recalcular las recomendaciones de ${row.brand_name || "esta marca"}?`)) return;
    setBusy(row.id);
    setError("");
    try {
      const response = await base44.functions.invoke("regenerateRecommendationsForBrand", { brandId:row.brand_id });
      const next = response?.data || response;
      if (next?.ok === false || next?.error) throw new Error(next.error || "recommendation_recalculation_failed");
      await load();
    } catch (caught) {
      setError(caught?.message || "No se pudo recalcular la recomendación.");
    } finally {
      setBusy("");
    }
  };

  return <div className="min-w-0 space-y-5">
    <header className="flex flex-wrap items-start justify-between gap-4"><div><div className="flex items-center gap-2"><Sparkles size={18}/><h1 className="text-xl font-black">Recomendaciones</h1></div><p className="mt-1 text-xs text-muted-foreground">Cola consultiva por marca. Recalcular actualiza recomendaciones, pero no envía mensajes, no compra servicios y no ejecuta cambios.</p></div><button type="button" onClick={load} disabled={loading} className="inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-xs font-bold disabled:opacity-50"><RefreshCw size={12} className={loading ? "animate-spin" : ""}/>Actualizar</button></header>

    {error && <div role="alert" className="rounded-xl border border-rose-300 bg-rose-50 p-3 text-xs text-rose-700">{error}</div>}

    <div className="flex flex-wrap gap-2">
      <input className="h-9 min-w-0 flex-1 rounded-lg border bg-background px-3 text-xs sm:min-w-64" placeholder="Buscar marca, título o acción" value={query} onChange={(event) => setQuery(event.target.value)}/>
      <select className="h-9 rounded-lg border bg-background px-3 text-xs" value={type} onChange={(event) => setType(event.target.value)}>{TYPES.map((value) => <option key={value} value={value}>{value === "all" ? "Todos los tipos" : human(value)}</option>)}</select>
      <label className="inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-xs"><input type="checkbox" checked={showDemo} onChange={(event) => setShowDemo(event.target.checked)}/>Mostrar marcas demo</label>
    </div>

    {loading ? <div className="flex items-center justify-center gap-2 rounded-2xl border py-20 text-xs text-muted-foreground"><Loader2 size={14} className="animate-spin"/>Cargando recomendaciones…</div> : <div className="overflow-x-auto rounded-2xl border">
      <table className="min-w-[1050px] w-full text-xs">
        <thead className="bg-secondary/30"><tr className="border-b text-left text-muted-foreground"><th className="p-3">Marca</th><th>Recomendación</th><th>Prioridad</th><th>Esfuerzo</th><th>Datos pendientes</th><th>Beneficio / acción</th><th>Generada</th><th></th></tr></thead>
        <tbody>{visible.map((row) => {
          const score = Number(row.score_json?.total);
          const priority = Number.isFinite(score) ? (score >= 75 ? "Alta" : score >= 50 ? "Media" : "Baja") : "—";
          const stale = isStale(row.generated_at);
          return <tr key={row.id} className="border-b last:border-0 align-top"><td className="p-3"><p className="font-black">{row.brand_name || "Marca no disponible"}{row.brand_is_demo ? " · DEMO" : ""}</p><p className="text-[10px] text-muted-foreground">{row.brand_email || "Sin email de contacto"}</p></td><td><span className="rounded-full border px-2 py-1 text-[9px] font-bold">{human(row.type)}</span><p className="mt-2 max-w-xs font-bold">{row.title || "Sin título"}</p></td><td><b>{priority}</b><p className="text-[10px] text-muted-foreground">score {Number.isFinite(score) ? Math.round(score * 100) / 100 : "—"}</p></td><td>{human(row.effort_level)}</td><td>{Array.isArray(row.missing_data) ? row.missing_data.length : 0}</td><td><p className="max-w-xs">{row.expected_benefit || "—"}</p><p className="mt-1 max-w-xs text-[10px] text-muted-foreground">{human(row.action_required)}</p></td><td>{row.generated_at ? new Date(row.generated_at).toLocaleString() : "—"}{stale && <span className="mt-1 flex items-center gap-1 text-[10px] font-bold text-amber-800"><AlertTriangle size={10}/>Más de 30 días</span>}</td><td><button type="button" onClick={() => regenerate(row)} disabled={Boolean(busy)} className="rounded-lg border px-3 py-2 text-[10px] font-bold disabled:opacity-40">{busy === row.id ? "Recalculando…" : "Recalcular"}</button></td></tr>;
        })}</tbody>
      </table>
      {!visible.length && <p className="p-8 text-center text-xs text-muted-foreground">No hay recomendaciones para este filtro.</p>}
    </div>}
  </div>;
}
