import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Database, Loader2, RefreshCw, ShieldCheck } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { getBenchmarks } from "@/lib/scoreEngine.js";

const TIERS = ["micro", "small", "mid", "large"];
const MONTHLY_REVENUE = { micro: 15000, small: 50000, mid: 200000, large: 600000 };
const TIER_LABELS = { micro: "Micro (<€30K/mes)", small: "Small (€30–100K/mes)", mid: "Mid (€100–500K/mes)", large: "Large (>€500K/mes)" };
const fmt = (value, digits = 2) => value === null || value === undefined || !Number.isFinite(Number(value))
  ? "—"
  : new Intl.NumberFormat("es-ES", { maximumFractionDigits: digits }).format(Number(value));

function Stat({ label, value, detail = null }) {
  return <div className="rounded-xl border border-border/60 bg-card p-4"><p className="text-[10px] font-black uppercase tracking-[.14em] text-muted-foreground">{label}</p><p className="mt-1 text-2xl font-black tabular-nums">{value}</p>{detail && <p className="mt-1 text-[10px] text-muted-foreground">{detail}</p>}</div>;
}

export default function AdminBenchmarks() {
  // DASHBOARD-C11 correction: this workspace is read-only; the slider only previews static fallback values.
  const [cohorts, setCohorts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [origin, setOrigin] = useState("all");
  const [status, setStatus] = useState("all");
  const [query, setQuery] = useState("");
  const [region, setRegion] = useState("EU");
  const [sampleRevenue, setSampleRevenue] = useState(50000);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const rows = await base44.entities.BenchmarkCohort.list("-derived_at", 500);
      setCohorts(Array.isArray(rows) ? rows : []);
    } catch (caught) {
      setError(caught?.message || "No se pudieron leer las cohortes gobernadas.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const summary = useMemo(() => ({
    total: cohorts.length,
    observed: cohorts.filter((row) => row.data_origin === "observed_contributions").length,
    synthetic: cohorts.filter((row) => row.data_origin === "synthetic_seed").length,
    abstain: cohorts.filter((row) => row.publication_status === "ABSTAIN").length,
    indicative: cohorts.filter((row) => row.publication_status === "INDICATIVE").length,
    publishable: cohorts.filter((row) => row.data_origin === "observed_contributions" && row.publication_status === "PUBLISHABLE" && row.is_public === true).length,
  }), [cohorts]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return cohorts.filter((row) => {
      if (origin !== "all" && row.data_origin !== origin) return false;
      if (status !== "all" && row.publication_status !== status) return false;
      if (!needle) return true;
      return `${row.cohort_key} ${row.country} ${row.vertical} ${row.metric_key} ${row.revenue_tier}`.toLowerCase().includes(needle);
    });
  }, [cohorts, origin, query, status]);

  const reference = getBenchmarks(sampleRevenue, region === "EU" ? "France" : "United States");
  const referenceRows = TIERS.map((tier) => ({ tier, ...getBenchmarks(MONTHLY_REVENUE[tier], region === "EU" ? "France" : "United States") }));

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2"><Database size={19}/><h1 className="text-2xl font-black tracking-[-0.03em]">Benchmarks</h1></div>
          <p className="mt-1 max-w-3xl text-xs text-muted-foreground">Cohortes gobernadas que existen en Base44 y, por separado, la tabla estática de referencia usada como fallback. Esta pantalla es de solo lectura.</p>
        </div>
        <button type="button" onClick={load} disabled={loading} className="inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-xs font-bold disabled:opacity-50"><RefreshCw size={12} className={loading ? "animate-spin" : ""}/>Actualizar cohortes</button>
      </header>

      <section className="rounded-2xl border border-sky-500/20 bg-sky-500/[.04] p-4">
        <div className="flex gap-3"><ShieldCheck size={17} className="mt-0.5 shrink-0"/><div><h2 className="text-sm font-black">Privacidad y publicación</h2><p className="mt-1 text-xs leading-relaxed text-muted-foreground">Una cohorte sintética nunca es un benchmark observado. `ABSTAIN` no publica estadísticas; `INDICATIVE` es solo interno; únicamente una cohorte observada con `PUBLISHABLE` e `is_public=true` puede ser elegible para exposición pública. Aquí no se muestran contribuciones individuales.</p></div></div>
      </section>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Stat label="Cohortes live" value={summary.total}/>
        <Stat label="Observadas" value={summary.observed}/>
        <Stat label="Sintéticas privadas" value={summary.synthetic} detail="Nunca publicables"/>
        <Stat label="ABSTAIN" value={summary.abstain} detail="Sin publicación"/>
        <Stat label="Indicativas" value={summary.indicative} detail="Solo internas"/>
        <Stat label="Publicables" value={summary.publishable} detail="Observadas + gate completo"/>
      </div>

      {error && <div role="alert" className="rounded-xl border border-rose-300 bg-rose-50 p-3 text-xs text-rose-700">{error}</div>}
      {loading ? <div className="flex items-center justify-center gap-2 rounded-2xl border py-20 text-xs text-muted-foreground"><Loader2 size={14} className="animate-spin"/>Leyendo cohortes de Base44…</div> : <>
        <div className="flex flex-wrap gap-2">
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar país, vertical, métrica o tier" aria-label="Buscar cohortes" className="h-9 min-w-0 flex-1 rounded-lg border bg-background px-3 text-xs sm:min-w-64"/>
          <select value={origin} onChange={(event) => setOrigin(event.target.value)} className="h-9 rounded-lg border bg-background px-3 text-xs" aria-label="Filtrar origen"><option value="all">Todos los orígenes</option><option value="observed_contributions">Observadas</option><option value="synthetic_seed">Sintéticas privadas</option></select>
          <select value={status} onChange={(event) => setStatus(event.target.value)} className="h-9 rounded-lg border bg-background px-3 text-xs" aria-label="Filtrar publicación"><option value="all">Todos los estados</option><option value="ABSTAIN">ABSTAIN</option><option value="INDICATIVE">INDICATIVE</option><option value="PUBLISHABLE">PUBLISHABLE</option></select>
        </div>

        <div className="overflow-x-auto rounded-2xl border">
          <table className="min-w-[1050px] w-full text-xs">
            <thead className="bg-secondary/30"><tr className="border-b text-left text-muted-foreground"><th className="p-3">Cohorte</th><th>Origen</th><th>Publicación</th><th>n</th><th>Mediana</th><th>P25–P75</th><th>Confianza</th><th>Derivada</th></tr></thead>
            <tbody>{visible.map((row) => {
              const abstains = row.publication_status === "ABSTAIN";
              const publicEligible = row.data_origin === "observed_contributions" && row.publication_status === "PUBLISHABLE" && row.is_public === true;
              return <tr key={row.id || row.cohort_key} className="border-b last:border-0 align-top"><td className="p-3"><p className="font-bold">{row.country || "—"} · {row.vertical || "—"}</p><p className="mt-0.5 text-[10px] text-muted-foreground">{row.metric_key || "—"} · {row.revenue_tier || "—"} · {row.month || "—"}</p></td><td><span className={`rounded-full border px-2 py-1 text-[9px] font-bold ${row.data_origin === "synthetic_seed" ? "border-amber-300 bg-amber-50 text-amber-800" : "border-sky-300 bg-sky-50 text-sky-800"}`}>{row.data_origin === "synthetic_seed" ? "SINTÉTICA" : "OBSERVADA"}</span></td><td><p className="font-black">{row.publication_status || "DESCONOCIDO"}</p><p className="text-[10px] text-muted-foreground">{publicEligible ? "pública elegible" : "privada"}</p></td><td>{fmt(row.n, 0)}</td><td>{abstains ? "—" : fmt(row.median)}</td><td>{abstains ? "—" : `${fmt(row.p25)}–${fmt(row.p75)}`}</td><td>{row.confidence || "—"}</td><td>{row.derived_at ? new Date(row.derived_at).toLocaleString() : "—"}</td></tr>;
            })}</tbody>
          </table>
          {!visible.length && <p className="p-8 text-center text-xs text-muted-foreground">No hay cohortes para este filtro.</p>}
        </div>
      </>}

      <section className="space-y-4 rounded-2xl border border-border/60 bg-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-[.18em] text-muted-foreground">Fallback estático</p><h2 className="mt-1 text-sm font-black">Modelo de referencia del score engine</h2><p className="mt-1 text-[11px] text-muted-foreground">No son cohortes live y mover el control no modifica ningún benchmark.</p></div><button type="button" onClick={() => setRegion((value) => value === "EU" ? "Global" : "EU")} className="inline-flex h-8 items-center gap-2 rounded-lg border px-3 text-xs font-bold"><RefreshCw size={11}/>{region}</button></div>
        <label className="block text-xs text-muted-foreground" htmlFor="benchmark-sample-revenue">Ingresos mensuales de ejemplo: <b className="text-foreground">€{sampleRevenue.toLocaleString("es-ES")}</b></label>
        <input id="benchmark-sample-revenue" data-testid="benchmark-sample-revenue" type="range" min={5000} max={600000} step={5000} value={sampleRevenue} onChange={(event) => setSampleRevenue(Number(event.target.value))} className="w-full accent-foreground"/>
        <div className="grid gap-3 sm:grid-cols-3">{[
          ["Pagos", `${reference.payment.rate}%`, `${reference.payment.range[0]}–${reference.payment.range[1]}%`],
          ["Envíos", `€${reference.shipping.perUnit}/envío`, `€${reference.shipping.range[0]}–€${reference.shipping.range[1]}`],
          ["SaaS", `${(reference.saas.pct * 100).toFixed(1)}% ingresos`, `${(reference.saas.range[0] * 100).toFixed(1)}–${(reference.saas.range[1] * 100).toFixed(1)}%`],
        ].map(([label, value, range]) => <div key={label} className="rounded-xl border bg-secondary/30 p-4"><p className="text-[10px] font-black uppercase text-muted-foreground">{label}</p><p className="mt-1 text-xl font-black">{value}</p><p className="text-[10px] text-muted-foreground">Rango {range} · tier {reference.tier}</p></div>)}</div>
        <details className="rounded-xl border"><summary className="cursor-pointer px-4 py-3 text-xs font-black">Ver tabla completa de referencia · {region}</summary><div className="overflow-x-auto border-t"><table className="min-w-[780px] w-full text-xs"><thead><tr className="text-left text-muted-foreground"><th className="p-3">Tier</th><th>Pagos</th><th>Rango pagos</th><th>Envío</th><th>Rango envío</th><th>SaaS</th></tr></thead><tbody>{referenceRows.map((row) => <tr key={row.tier} className="border-t"><td className="p-3"><b>{row.tier}</b><div className="text-[10px] text-muted-foreground">{TIER_LABELS[row.tier]}</div></td><td>{row.payment.rate}%</td><td>{row.payment.range[0]}–{row.payment.range[1]}%</td><td>€{row.shipping.perUnit}</td><td>€{row.shipping.range[0]}–€{row.shipping.range[1]}</td><td>{(row.saas.pct * 100).toFixed(1)}%</td></tr>)}</tbody></table></div></details>
      </section>

      {summary.synthetic > 0 && <div className="flex gap-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900"><AlertTriangle size={15} className="mt-0.5 shrink-0"/><p>Las {summary.synthetic} cohortes sintéticas siguen privadas. Esta vista de administración no cambia `publication_status`, `is_public` ni la procedencia.</p></div>}
    </div>
  );
}
