import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Globe2, Loader2, RefreshCw, ShieldCheck } from "lucide-react";
import { base44 } from "@/api/base44Client";

const number = (value) => new Intl.NumberFormat("es-ES").format(Number(value || 0));
const human = (value) => String(value || "DESCONOCIDO").replaceAll("_", " ");

function PolicyLayer({ code, title, detail, current, expected, tone = "neutral", footnote = null }) {
  const complete = Number(expected) > 0 && Number(current) === Number(expected);
  const style = complete
    ? "border-emerald-500/25 bg-emerald-500/[.04]"
    : tone === "warning"
      ? "border-amber-500/30 bg-amber-500/[.05]"
      : "border-border/60 bg-card";
  return (
    <section className={`rounded-2xl border p-4 ${style}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[.18em] text-muted-foreground">{code}</p>
          <h2 className="mt-1 text-sm font-black">{title}</h2>
        </div>
        <span className="text-xl font-black tabular-nums">{number(current)}/{number(expected)}</span>
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">{detail}</p>
      {footnote && <p className="mt-2 text-[10px] font-bold text-amber-800">{footnote}</p>}
    </section>
  );
}

export default function AdminMarkets() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await base44.functions.invoke("getEuropeMarketsCommandCenter", {});
      const next = response?.data || response;
      if (next?.ok === false) throw new Error(next.error || "markets_unavailable");
      setData(next);
    } catch (caught) {
      setError(caught?.message || "No se pudieron cargar los mercados.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const markets = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return data?.markets || [];
    return (data?.markets || []).filter((market) =>
      `${market.iso2} ${market.canonical_name} ${market.primary_currency}`.toLowerCase().includes(needle));
  }, [data, query]);

  const metrics = data?.metrics || {};
  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2"><Globe2 size={20}/><h1 className="text-xl font-black">Europa · Mercados</h1></div>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">Registro de 33 mercados, localización y tres capas de control independientes. Tener datos de mercado nunca equivale a autorización legal.</p>
        </div>
        <button type="button" onClick={load} disabled={loading} className="inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-xs font-bold disabled:opacity-50"><RefreshCw size={12} className={loading ? "animate-spin" : ""}/>Actualizar</button>
      </header>

      {error && <div role="alert" className="rounded-xl border border-rose-300 bg-rose-50 p-3 text-xs text-rose-700">{error}</div>}
      {!data && loading && <div className="flex items-center justify-center gap-2 rounded-2xl border py-20 text-xs text-muted-foreground"><Loader2 size={14} className="animate-spin"/>Leyendo las tres capas de política…</div>}

      {data && <>
        <div className="grid gap-3 lg:grid-cols-3">
          <PolicyLayer code="P1" title="Capacidades jurisdiccionales" current={metrics.p1_matrix_policy_rows} expected={metrics.p1_expected_policy_rows} detail={`Matriz operativa de mercado × capacidad. Es la capa que contiene las ${number(metrics.p1_matrix_policy_rows)} políticas canónicas seguras.`} footnote={metrics.p1_legacy_policy_rows ? `${metrics.p1_legacy_policy_rows} políticas históricas quedan preservadas fuera de la matriz canónica.` : null}/>
          <PolicyLayer code="P10" title="Conclusiones regulatorias" current={metrics.p10_policy_rows} expected={metrics.p10_expected_policy_rows} tone="warning" detail="Evidencia primaria por mercado × actividad regulada. La ausencia de filas mantiene la actividad en revisión; no borra ni contradice P1."/>
          <PolicyLayer code="P11" title="Autoridad de ejecución legal" current={metrics.p11_policy_rows} expected={metrics.p11_expected_policy_rows} tone="warning" detail="Permiso de ejecución por mercado × acción. Una celda ausente concede cero autoridad y permanece bloqueada por diseño."/>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {[
            ["Mercados", metrics.markets], ["Monedas", metrics.currencies], ["Contextos resueltos", metrics.contexts],
            ["Conflictos", metrics.conflicting_contexts], ["Kill switches", metrics.active_kill_switches], ["Registros activos", metrics.active_registrations],
          ].map(([label, value]) => <div key={label} className="rounded-xl border p-4"><p className="text-[10px] uppercase text-muted-foreground">{label}</p><p className="mt-1 text-xl font-black">{number(value)}</p></div>)}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h2 className="text-sm font-black">Estado por mercado</h2><p className="text-[11px] text-muted-foreground">P1 muestra capacidades operativas; P10 y P11 siguen siendo gates independientes.</p></div>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar país, código o moneda" aria-label="Buscar mercado" className="h-9 w-full rounded-lg border bg-background px-3 text-xs sm:w-64"/>
        </div>

        <div className="overflow-x-auto rounded-2xl border">
          <table className="min-w-[1120px] w-full text-xs">
            <thead><tr className="border-b text-left text-muted-foreground"><th className="p-3">Mercado</th><th>Moneda</th><th>Localización</th><th>Inteligencia</th><th>Lanzamiento</th><th>P1 capacidades</th><th>P10 regulatorio</th><th>P11 ejecución</th><th>Proveedores / tarifas</th></tr></thead>
            <tbody>{markets.map((market) => <tr key={market.iso2} className="border-b last:border-0 align-top">
              <td className="p-3"><b>{market.iso2}</b> · {market.canonical_name}<div className="text-[10px] text-muted-foreground">UE {market.eu_member ? "sí" : "no"} · EEE {market.eea_member ? "sí" : "no"}</div></td>
              <td className="font-bold">{market.primary_currency}</td>
              <td>{human(market.localization_readiness?.translation_readiness)}</td>
              <td>{human(market.intelligence_status)}</td>
              <td>{human(market.launch_status)}</td>
              <td><b>{market.p1_policy_status?.covered || 0}/{market.p1_policy_status?.expected || 0}</b><div className="text-[10px] text-muted-foreground">E {market.capabilities?.enabled || 0} · L {market.capabilities?.limited || 0} · R {market.capabilities?.review_required || 0} · B {market.capabilities?.blocked || 0}</div></td>
              <td><b>{human(market.regulatory_status?.gate || "REVIEW")}</b><div className="text-[10px] text-muted-foreground">{market.regulatory_status?.covered || 0}/{market.regulatory_status?.expected || 0} · {human(market.regulatory_status?.status)}</div></td>
              <td><b>{market.legal_execution_status?.covered || 0}/{market.legal_execution_status?.expected || 0}</b><div className="text-[10px] text-muted-foreground">Permisos: {market.legal_execution_status?.allow || 0} · bloqueadas/revisión: {market.legal_execution_status?.blocked || 0}</div></td>
              <td>{human(market.provider_readiness)}<div className="text-[10px] text-muted-foreground">{human(market.rate_readiness)}</div></td>
            </tr>)}</tbody>
          </table>
          {!markets.length && <p className="p-8 text-center text-xs text-muted-foreground">No hay mercados que coincidan con la búsqueda.</p>}
        </div>

        <section className="rounded-2xl border p-5">
          <div className="flex items-center gap-2"><ShieldCheck size={16}/><h2 className="font-black">Límite de verdad</h2></div>
          <div className="mt-3 grid gap-3 text-xs text-muted-foreground md:grid-cols-2 xl:grid-cols-4">{Object.entries(data.truth_boundary || {}).map(([key, value]) => <div key={key}><b className="text-foreground">{human(key)}</b><br/>{value}</div>)}</div>
        </section>

        {(metrics.p10_policy_rows === 0 || metrics.p11_policy_rows === 0) && <div className="flex gap-3 rounded-2xl border border-amber-500/25 bg-amber-500/[.05] p-4 text-xs"><AlertTriangle size={16} className="mt-0.5 shrink-0"/><p><b>Estado seguro, no permiso.</b> Las matrices P10/P11 no están pobladas en este entorno; toda acción que dependa de ellas debe seguir fallando cerrada. Esta pantalla no las rellena ni inventa procedencia.</p></div>}
      </>}
    </div>
  );
}
