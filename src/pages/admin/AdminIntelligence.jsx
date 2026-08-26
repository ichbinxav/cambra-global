import { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useTranslation } from "@/lib/i18n.jsx";
import {
  AlertTriangle,
  BrainCircuit,
  Database,
  RefreshCw,
  ShieldCheck,
  Target,
  TrendingUp,
} from "lucide-react";

export const INTELLIGENCE_COPY = {
  en: {
    title: "Intelligence",
    subtitle: "Read-only view of returned, scope-valid intelligence records. Stored labels do not prove runtime completeness, model calibration or execution readiness.",
    refresh: "Refresh",
    loadError: "Could not load the intelligence snapshot",
    boundaryTitle: "Evidence boundary · advisory only",
    boundaryBody: "Counts and rows below reflect only this command snapshot. An empty or missing value remains UNKNOWN when source-read completeness is not evidenced. This surface grants no send, spend, contract, migration, billing or scoring authority.",
    generated: "Snapshot generated",
    runtimeStatus: "Runtime / model status",
    runtimeUnknown: "UNKNOWN — no live, trained or calibrated model is asserted here",
    modelBoundary: "No model promotion, training-dataset eligibility or production serving state is shown by this view.",
    sourceHealthTitle: "Source-read health",
    sourceHealthComplete: "All displayed sources were read completely for this snapshot.",
    sourceHealthDegraded: "One or more sources are unavailable or capped. Affected counts remain UNKNOWN and returned rows are partial evidence only.",
    providers: "Providers in returned pricing rows",
    pricingRecords: "Returned pricing rows",
    officialRows: "Rows labelled verified_official",
    highValueGaps: "Returned open gaps with IV ≥ 35",
    evidence: "Scope-valid evidence rows",
    claims: "Scope-valid claim rows",
    conflicts: "Returned unresolved conflicts",
    outcomes: "Scope-valid outcome rows",
    excluded: "Quarantined / ambiguous rows excluded",
    unknown: "UNKNOWN",
    pricingTitle: "Provider pricing · returned temporal rows",
    pricingHelp: "Most recently observed rows returned by the command. Multiple versions may coexist; truth labels are stored labels, not independent verification by this screen.",
    provider: "Provider",
    market: "Market / channel",
    rate: "Variable rate",
    truth: "Stored truth label",
    state: "Knowledge state",
    observed: "Observed at",
    noPricing: "No pricing row was returned. State remains UNKNOWN; this does not prove that no pricing records exist.",
    conflictsTitle: "Returned unresolved conflicts",
    conflictsHelp: "Conflicting records are shown when returned; this view never resolves or overwrites them.",
    conflictFallback: "Conflict requires review",
    noConflicts: "No unresolved conflict row was returned. Absence is not proven because source-read health is not exposed by this snapshot.",
    indexTitle: "Strategic evidence index · advisory",
    indexHelp: "Stored heuristic inputs describe evidence coverage. They are not calibrated probabilities, model performance or authority to act.",
    sample: "sample",
    freshness: "stored freshness",
    confidence: "uncalibrated input",
    index: "stored index",
    noIndex: "No strategic evidence-index row was returned.",
    gapsTitle: "Knowledge gaps · advisory priorities",
    gapsHelp: "Stored information-value rankings are review aids only; they do not authorize research, enrichment, outreach or spend.",
    informationValue: "stored IV",
    recommendationOnly: "Recommendation only",
    noRecommendation: "No recommendation returned",
    noGaps: "No open knowledge-gap row was returned.",
    outcomeTitle: "Outcome observations · not a training dataset",
    outcomeHelp: "Scope-valid observations returned by the command. This view does not prove causal attribution, model eligibility, calibration or training use. Missing amounts remain UNKNOWN.",
    operation: "Operation",
    expected: "Expected",
    realized: "Realized",
    variance: "Variance",
    result: "Stored result flag",
    negative: "negative observation",
    success: "success flag",
    nonSuccess: "non-success flag",
    noOutcomes: "No scope-valid outcome observation was returned.",
  },
  fr: {
    title: "Intelligence",
    subtitle: "Vue en lecture seule des enregistrements d’intelligence renvoyés et valides dans leur périmètre. Les libellés stockés ne prouvent ni l’exhaustivité du runtime, ni la calibration d’un modèle, ni la capacité d’exécution.",
    refresh: "Actualiser",
    loadError: "Impossible de charger le snapshot d’intelligence",
    boundaryTitle: "Limite de preuve · consultatif uniquement",
    boundaryBody: "Les compteurs et lignes ci-dessous reflètent uniquement ce snapshot de commande. Une valeur vide ou absente reste INCONNUE lorsque l’exhaustivité de lecture n’est pas prouvée. Cette surface ne donne aucune autorité d’envoi, de dépense, de contrat, de migration, de facturation ou de scoring.",
    generated: "Snapshot généré",
    runtimeStatus: "État runtime / modèle",
    runtimeUnknown: "INCONNU — aucun modèle live, entraîné ou calibré n’est déclaré ici",
    modelBoundary: "Cette vue ne présente ni promotion de modèle, ni éligibilité à un dataset d’entraînement, ni état de serving en production.",
    sourceHealthTitle: "Santé de lecture des sources",
    sourceHealthComplete: "Toutes les sources affichées ont été lues entièrement pour ce snapshot.",
    sourceHealthDegraded: "Une ou plusieurs sources sont indisponibles ou plafonnées. Les compteurs affectés restent INCONNUS et les lignes renvoyées ne sont que des preuves partielles.",
    providers: "Prestataires dans les lignes de pricing renvoyées",
    pricingRecords: "Lignes de pricing renvoyées",
    officialRows: "Lignes libellées verified_official",
    highValueGaps: "Gaps ouverts renvoyés avec IV ≥ 35",
    evidence: "Lignes de preuve valides dans leur périmètre",
    claims: "Claims valides dans leur périmètre",
    conflicts: "Conflits non résolus renvoyés",
    outcomes: "Outcomes valides dans leur périmètre",
    excluded: "Lignes en quarantaine / ambiguës exclues",
    unknown: "INCONNU",
    pricingTitle: "Pricing prestataire · lignes temporelles renvoyées",
    pricingHelp: "Lignes les plus récemment observées renvoyées par la commande. Plusieurs versions peuvent coexister ; les niveaux de vérité sont des libellés stockés, pas une vérification indépendante de cet écran.",
    provider: "Prestataire",
    market: "Marché / canal",
    rate: "Taux variable",
    truth: "Niveau de vérité stocké",
    state: "État de connaissance",
    observed: "Observé le",
    noPricing: "Aucune ligne de pricing n’a été renvoyée. L’état reste INCONNU ; cela ne prouve pas l’absence de pricing.",
    conflictsTitle: "Conflits non résolus renvoyés",
    conflictsHelp: "Les enregistrements contradictoires sont affichés lorsqu’ils sont renvoyés ; cette vue ne les résout ni ne les remplace.",
    conflictFallback: "Conflit à revoir",
    noConflicts: "Aucune ligne de conflit non résolu n’a été renvoyée. L’absence n’est pas prouvée car ce snapshot n’expose pas la santé de lecture des sources.",
    indexTitle: "Indice stratégique de preuve · consultatif",
    indexHelp: "Les entrées heuristiques stockées décrivent la couverture de preuve. Ce ne sont ni des probabilités calibrées, ni une performance de modèle, ni une autorité d’action.",
    sample: "échantillon",
    freshness: "fraîcheur stockée",
    confidence: "entrée non calibrée",
    index: "indice stocké",
    noIndex: "Aucune ligne d’indice stratégique de preuve n’a été renvoyée.",
    gapsTitle: "Priorités des gaps de connaissance · consultatif",
    gapsHelp: "Les classements de valeur d’information stockés sont uniquement des aides à la revue ; ils n’autorisent ni recherche, ni enrichissement, ni outreach, ni dépense.",
    informationValue: "IV stockée",
    recommendationOnly: "Recommandation uniquement",
    noRecommendation: "Aucune recommandation renvoyée",
    noGaps: "Aucune ligne de gap de connaissance ouvert n’a été renvoyée.",
    outcomeTitle: "Observations d’outcomes · pas un dataset d’entraînement",
    outcomeHelp: "Observations valides dans leur périmètre renvoyées par la commande. Cette vue ne prouve ni attribution causale, ni éligibilité modèle, ni calibration, ni usage pour l’entraînement. Les montants absents restent INCONNUS.",
    operation: "Opération",
    expected: "Attendu",
    realized: "Réalisé",
    variance: "Écart",
    result: "Indicateur stocké",
    negative: "observation négative",
    success: "indicateur de succès",
    nonSuccess: "indicateur de non-succès",
    noOutcomes: "Aucune observation d’outcome valide dans son périmètre n’a été renvoyée.",
  },
  es: {
    title: "Inteligencia",
    subtitle: "Vista de solo lectura de registros de inteligencia devueltos y válidos para su ámbito. Las etiquetas guardadas no prueban la completitud del runtime, la calibración de un modelo ni la preparación para ejecutar.",
    refresh: "Actualizar",
    loadError: "No se pudo cargar el snapshot de inteligencia",
    boundaryTitle: "Límite de evidencia · solo consultivo",
    boundaryBody: "Los contadores y filas siguientes reflejan únicamente este snapshot del comando. Un valor vacío o ausente sigue siendo DESCONOCIDO cuando no existe evidencia de completitud de lectura. Esta superficie no concede autoridad para enviar, gastar, contratar, migrar, facturar o puntuar.",
    generated: "Snapshot generado",
    runtimeStatus: "Estado del runtime / modelo",
    runtimeUnknown: "DESCONOCIDO — aquí no se declara ningún modelo live, entrenado o calibrado",
    modelBoundary: "Esta vista no muestra promoción de modelos, elegibilidad para datasets de entrenamiento ni serving en producción.",
    sourceHealthTitle: "Salud de lectura de fuentes",
    sourceHealthComplete: "Todas las fuentes mostradas se leyeron por completo para este snapshot.",
    sourceHealthDegraded: "Una o varias fuentes no están disponibles o alcanzaron su límite. Los contadores afectados siguen DESCONOCIDOS y las filas devueltas son solo evidencia parcial.",
    providers: "Proveedores en las filas de pricing devueltas",
    pricingRecords: "Filas de pricing devueltas",
    officialRows: "Filas etiquetadas verified_official",
    highValueGaps: "Gaps abiertos devueltos con IV ≥ 35",
    evidence: "Filas de evidencia válidas para su ámbito",
    claims: "Claims válidos para su ámbito",
    conflicts: "Conflictos sin resolver devueltos",
    outcomes: "Outcomes válidos para su ámbito",
    excluded: "Filas en cuarentena / ambiguas excluidas",
    unknown: "DESCONOCIDO",
    pricingTitle: "Pricing de proveedores · filas temporales devueltas",
    pricingHelp: "Filas observadas más recientemente que devuelve el comando. Pueden coexistir varias versiones; los niveles de verdad son etiquetas guardadas, no una verificación independiente de esta pantalla.",
    provider: "Proveedor",
    market: "Mercado / canal",
    rate: "Tasa variable",
    truth: "Etiqueta de verdad guardada",
    state: "Estado de conocimiento",
    observed: "Observado el",
    noPricing: "No se devolvió ninguna fila de pricing. El estado sigue DESCONOCIDO; esto no prueba que no existan registros.",
    conflictsTitle: "Conflictos sin resolver devueltos",
    conflictsHelp: "Los registros contradictorios se muestran cuando son devueltos; esta vista nunca los resuelve ni sobrescribe.",
    conflictFallback: "El conflicto requiere revisión",
    noConflicts: "No se devolvió ninguna fila de conflicto sin resolver. Su ausencia no está probada porque este snapshot no expone la salud de lectura de las fuentes.",
    indexTitle: "Índice estratégico de evidencia · consultivo",
    indexHelp: "Las entradas heurísticas guardadas describen cobertura de evidencia. No son probabilidades calibradas, rendimiento de un modelo ni autoridad para actuar.",
    sample: "muestra",
    freshness: "frescura guardada",
    confidence: "entrada no calibrada",
    index: "índice guardado",
    noIndex: "No se devolvió ninguna fila del índice estratégico de evidencia.",
    gapsTitle: "Prioridades de gaps de conocimiento · consultivo",
    gapsHelp: "Los rankings guardados de valor de información son solo ayudas de revisión; no autorizan investigación, enriquecimiento, outreach ni gasto.",
    informationValue: "IV guardado",
    recommendationOnly: "Solo recomendación",
    noRecommendation: "No se devolvió ninguna recomendación",
    noGaps: "No se devolvió ninguna fila de gap de conocimiento abierto.",
    outcomeTitle: "Observaciones de outcomes · no es un dataset de entrenamiento",
    outcomeHelp: "Observaciones válidas para su ámbito devueltas por el comando. Esta vista no prueba atribución causal, elegibilidad de modelos, calibración ni uso para entrenamiento. Los importes ausentes siguen DESCONOCIDOS.",
    operation: "Operación",
    expected: "Esperado",
    realized: "Realizado",
    variance: "Variación",
    result: "Indicador guardado",
    negative: "observación negativa",
    success: "indicador de éxito",
    nonSuccess: "indicador de no éxito",
    noOutcomes: "No se devolvió ninguna observación de outcome válida para su ámbito.",
  },
};

function localeNumber(value, locale, unknown, options = {}) {
  if (value === null || value === undefined || value === "" || !Number.isFinite(Number(value))) return unknown;
  return new Intl.NumberFormat(locale, options).format(Number(value));
}

function percent(value, locale, unknown) {
  const formatted = localeNumber(value, locale, unknown, { maximumFractionDigits: 0 });
  return formatted === unknown ? unknown : `${formatted}%`;
}

function fractionPercent(value, locale, unknown) {
  if (value === null || value === undefined || value === "" || !Number.isFinite(Number(value))) return unknown;
  return percent(Number(value) * 100, locale, unknown);
}

function dateTime(value, locale, unknown) {
  if (!value) return unknown;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return unknown;
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(parsed);
}

function amount(value, currency, locale, unknown) {
  const formatted = localeNumber(value, locale, unknown, { maximumFractionDigits: 2 });
  return formatted === unknown ? unknown : `${formatted}${currency ? ` ${currency}` : ""}`;
}

function stored(value, unknown) {
  return value === null || value === undefined || value === "" ? unknown : String(value);
}

function Card({ label, value, icon: Icon }) {
  return <div className="rounded-2xl border bg-card p-4"><div className="flex items-center gap-2 text-muted-foreground"><Icon size={13}/><p className="text-[10px] uppercase tracking-[.16em]">{label}</p></div><p className="mt-2 text-3xl font-black">{value}</p></div>;
}

function EmptyState({ children }) {
  return <p className="mt-3 rounded-xl border border-dashed p-3 text-xs text-muted-foreground">{children}</p>;
}

export default function AdminIntelligence({ embedded = false }) {
  const { lang: rawLang, locale: rawLocale } = useTranslation();
  const lang = ["en", "fr", "es"].includes(rawLang) ? rawLang : "en";
  const locale = rawLocale || ({ en: "en-GB", fr: "fr-FR", es: "es-ES" }[lang]);
  const c = INTELLIGENCE_COPY[lang];
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await base44.functions.invoke("getIntelligenceCommandCenter", {});
      const next = response?.data || response;
      if (next?.ok === false) throw new Error(next.error || "load_failed");
      setData(next);
    } catch (caught) {
      setError(caught?.message || c.loadError);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const metrics = data?.metrics || {};
  const sourceHealth = Object.entries(data?.source_health || {});
  const officialPercent = Number(metrics.pricing_records) > 0
    ? percent(metrics.official_verified_pct, locale, c.unknown)
    : c.unknown;
  const cards = [
    [c.providers, localeNumber(metrics.providers_tracked, locale, c.unknown), Database],
    [c.pricingRecords, localeNumber(metrics.pricing_records, locale, c.unknown), TrendingUp],
    [c.officialRows, officialPercent, ShieldCheck],
    [c.highValueGaps, localeNumber(metrics.high_value_gaps, locale, c.unknown), Target],
    [c.evidence, localeNumber(metrics.evidence, locale, c.unknown), Database],
    [c.claims, localeNumber(metrics.knowledge_claims, locale, c.unknown), BrainCircuit],
    [c.conflicts, localeNumber(metrics.open_conflicts, locale, c.unknown), AlertTriangle],
    [c.outcomes, localeNumber(metrics.outcomes, locale, c.unknown), TrendingUp],
  ];

  return <div className="space-y-6">
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        {!embedded && <>
        <div className="flex items-center gap-2"><BrainCircuit size={19}/><h1 className="text-2xl font-black tracking-tight">{c.title}</h1></div>
        </>}
        <p className={`${embedded ? "max-w-4xl" : "mt-1 max-w-3xl"} text-xs text-muted-foreground`}>{c.subtitle}</p>
      </div>
      <button onClick={load} disabled={loading} className="inline-flex h-8 items-center gap-2 rounded-lg border px-3 text-xs font-bold"><RefreshCw size={12} className={loading ? "animate-spin" : ""}/>{c.refresh}</button>
    </div>

    {error && <div className="rounded-xl border border-rose-300 bg-rose-50 p-3 text-xs text-rose-700">{error}</div>}

    {!data ? (
      <div data-testid="intelligence-snapshot-loading" className="rounded-2xl border border-border/60 bg-card px-5 py-16 text-center">
        {loading ? (
          <div className="inline-flex items-center gap-2 text-xs font-bold text-muted-foreground"><RefreshCw size={14} className="animate-spin" />{c.refresh}…</div>
        ) : (
          <p className="text-xs text-muted-foreground">{c.loadError}</p>
        )}
      </div>
    ) : <>
    <section className="rounded-2xl border border-amber-500/30 bg-amber-500/[.04] p-4" aria-label={c.boundaryTitle}>
      <div className="flex items-center gap-2"><ShieldCheck size={15}/><h2 className="text-sm font-black">{c.boundaryTitle}</h2></div>
      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{c.boundaryBody}</p>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <div className="rounded-xl border bg-background/70 p-3"><p className="text-[9px] font-black uppercase text-muted-foreground">{c.generated}</p><p className="mt-1 text-xs font-bold">{dateTime(data?.generated_at, locale, c.unknown)}</p></div>
        <div className="rounded-xl border bg-background/70 p-3"><p className="text-[9px] font-black uppercase text-muted-foreground">{c.runtimeStatus}</p><p className="mt-1 text-xs font-bold">{c.runtimeUnknown}</p><p className="mt-1 text-[10px] text-muted-foreground">{c.modelBoundary}</p></div>
      </div>
      {sourceHealth.length > 0 && <div className={`mt-3 rounded-xl border p-3 ${data?.degraded ? "border-amber-500/30 bg-amber-500/[.05]" : "border-emerald-500/25 bg-emerald-500/[.04]"}`}>
        <div className="flex items-center gap-2"><AlertTriangle size={12}/><p className="text-[9px] font-black uppercase tracking-wide">{c.sourceHealthTitle}</p></div>
        <p className="mt-1 text-[10px] text-muted-foreground">{data?.degraded ? c.sourceHealthDegraded : c.sourceHealthComplete}</p>
        <div className="mt-2 flex flex-wrap gap-1.5">{sourceHealth.map(([name, source]) => <span key={name} className="rounded-full border bg-background px-2 py-1 text-[9px] font-bold">{name} · {stored(source?.status, c.unknown)} · {source?.returned_rows ?? c.unknown}/{source?.complete === true ? "complete" : "partial"}</span>)}</div>
      </div>}
      {metrics.quarantined_or_scope_ambiguous !== undefined && <p className="mt-3 text-[10px] text-muted-foreground">{c.excluded}: <b>{localeNumber(metrics.quarantined_or_scope_ambiguous, locale, c.unknown)}</b></p>}
    </section>

    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{cards.map(([label, value, icon]) => <Card key={label} label={label} value={value} icon={icon}/>)}</div>

    <div className="grid gap-4 xl:grid-cols-2">
      <section className="rounded-2xl border bg-card p-4">
        <h2 className="text-sm font-black">{c.pricingTitle}</h2><p className="mt-1 text-[11px] text-muted-foreground">{c.pricingHelp}</p>
        {(data?.pricing || []).length ? <div className="mt-3 overflow-auto"><table className="w-full text-xs"><thead><tr className="border-b text-left text-muted-foreground"><th className="py-2">{c.provider}</th><th>{c.market}</th><th>{c.rate}</th><th>{c.truth}</th><th>{c.state}</th><th>{c.observed}</th></tr></thead><tbody>{data.pricing.slice(0, 20).map((row, index) => <tr key={row.id || `${row.provider_slug || "unknown"}-${index}`} className="border-b last:border-0"><td className="py-2 font-bold">{stored(row.provider_slug, c.unknown)}</td><td>{stored(row.country || row.region, c.unknown)} · {stored(row.channel, c.unknown)}</td><td>{row.variable_rate_bps === null || row.variable_rate_bps === undefined ? c.unknown : `${localeNumber(row.variable_rate_bps, locale, c.unknown)} bps`}</td><td>{stored(row.truth_level, c.unknown)}</td><td>{stored(row.knowledge_state, c.unknown)}</td><td>{dateTime(row.observed_at, locale, c.unknown)}</td></tr>)}</tbody></table></div> : <EmptyState>{c.noPricing}</EmptyState>}
      </section>

      <section className="rounded-2xl border bg-card p-4">
        <h2 className="text-sm font-black">{c.conflictsTitle}</h2><p className="mt-1 text-[11px] text-muted-foreground">{c.conflictsHelp}</p>
        {(data?.conflicts || []).length ? <div className="mt-3 space-y-2">{data.conflicts.slice(0, 15).map((conflict, index) => <div key={conflict.id || `${conflict.semantic_key || "conflict"}-${index}`} className="rounded-xl border p-3"><div className="flex items-center justify-between"><p className="text-xs font-bold">{stored(conflict.provider_slug || conflict.semantic_key, c.unknown)}</p><span className="text-[10px] font-bold uppercase">{stored(conflict.status, c.unknown)}</span></div><p className="mt-1 text-[11px] text-muted-foreground">{conflict.reason || c.conflictFallback}</p></div>)}</div> : <EmptyState>{c.noConflicts}</EmptyState>}
      </section>
    </div>

    <div className="grid gap-4 xl:grid-cols-2">
      <section className="rounded-2xl border bg-card p-4">
        <h2 className="text-sm font-black">{c.indexTitle}</h2><p className="mt-1 text-[11px] text-muted-foreground">{c.indexHelp}</p>
        {(data?.moat || []).length ? <div className="mt-3 space-y-2">{data.moat.slice(0, 15).map((row, index) => <div key={row.id || `${row.provider_slug || "index"}-${index}`} className="flex items-center justify-between rounded-xl border p-3"><div><p className="text-xs font-bold">{stored(row.provider_slug, c.unknown)} · {stored(row.country, c.unknown)}</p><p className="text-[10px] text-muted-foreground">{c.sample}={localeNumber(row.sample_size, locale, c.unknown)} · {c.freshness} {fractionPercent(row.freshness, locale, c.unknown)} · {c.confidence} {fractionPercent(row.confidence, locale, c.unknown)}</p></div><div className="text-right"><p className="text-[9px] font-bold uppercase text-muted-foreground">{c.index}</p><p className="text-xl font-black">{localeNumber(row.moat_score, locale, c.unknown, { maximumFractionDigits: 0 })}</p></div></div>)}</div> : <EmptyState>{c.noIndex}</EmptyState>}
      </section>

      <section className="rounded-2xl border bg-card p-4">
        <h2 className="text-sm font-black">{c.gapsTitle}</h2><p className="mt-1 text-[11px] text-muted-foreground">{c.gapsHelp}</p>
        {(data?.gaps || []).length ? <div className="mt-3 space-y-2">{data.gaps.slice(0, 15).map((row, index) => <div key={row.id || `${row.provider_slug || "gap"}-${index}`} className="rounded-xl border p-3"><div className="flex justify-between gap-4"><p className="text-xs font-bold">{stored(row.provider_slug, c.unknown)} · {stored(row.country, c.unknown)}</p><span className="text-xs font-black">{c.informationValue} {localeNumber(row.information_value, locale, c.unknown)}</span></div><p className="mt-1 text-[9px] font-black uppercase text-muted-foreground">{c.recommendationOnly}</p><p className="mt-1 text-[11px] text-muted-foreground">{row.recommended_action || c.noRecommendation}</p></div>)}</div> : <EmptyState>{c.noGaps}</EmptyState>}
      </section>
    </div>

    <section className="rounded-2xl border bg-card p-4">
      <h2 className="text-sm font-black">{c.outcomeTitle}</h2><p className="mt-1 text-[11px] text-muted-foreground">{c.outcomeHelp}</p>
      {(data?.recent_outcomes || []).length ? <div className="mt-3 overflow-auto"><table className="w-full text-xs"><thead><tr className="border-b text-left text-muted-foreground"><th className="py-2">{c.operation}</th><th>{c.expected}</th><th>{c.realized}</th><th>{c.variance}</th><th>{c.result}</th></tr></thead><tbody>{data.recent_outcomes.slice(0, 20).map((outcome, index) => <tr key={outcome.id || `${outcome.operation_type || "outcome"}-${index}`} className="border-b last:border-0"><td className="py-2 font-bold">{stored(outcome.operation_type, c.unknown)}</td><td>{amount(outcome.expected_savings, outcome.currency, locale, c.unknown)}</td><td>{amount(outcome.realized_savings, outcome.currency, locale, c.unknown)}</td><td>{amount(outcome.variance, outcome.currency, locale, c.unknown)}</td><td>{outcome.negative_knowledge === true ? c.negative : outcome.success === true ? c.success : outcome.success === false ? c.nonSuccess : c.unknown}</td></tr>)}</tbody></table></div> : <EmptyState>{c.noOutcomes}</EmptyState>}
    </section>
    </>}
  </div>;
}
