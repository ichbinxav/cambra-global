// ResultsHistory — the authenticated, no-session /Results view: the caller's
// past payments analyses, one card each, deep-linking into the full report.
//
// SECURITY: this component NEVER reads AnalyzerResult from the client. It
// consumes getMyPaymentsHistory (server-side, explicit created_by filter).
// The page is the ONLY caller; all isolation lives in the function.

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { ArrowRight, Loader2, History, Plus } from "lucide-react";
import { useTranslation } from "@/lib/i18n.jsx";

const HISTORY_COPY = {
  en: {
    estimate: "Estimate",
    annualGap: "Annual gap",
    openReport: "Open report",
    otherProvider: "Other provider",
    eyebrow: "Your analyses",
    title: "Payments audit history",
    newAnalysis: "New analysis",
    loading: "Loading your history...",
    error: "We couldn't load your history right now. Please try again in a moment.",
    emptyTitle: "No analyses yet",
    emptyMessage: "Run your first payments audit. It takes about two minutes.",
    runAnalysis: "Run your analysis",
    legacy: "Historical",
    legacyUnavailable: "Historical summary · detailed payments report unavailable",
  },
  fr: {
    estimate: "Estimation",
    annualGap: "Écart annuel",
    openReport: "Ouvrir le rapport",
    otherProvider: "Autre prestataire",
    eyebrow: "Vos analyses",
    title: "Historique des audits de paiement",
    newAnalysis: "Nouvelle analyse",
    loading: "Chargement de votre historique...",
    error: "Impossible de charger votre historique pour le moment. Réessayez dans un instant.",
    emptyTitle: "Aucune analyse pour le moment",
    emptyMessage: "Lancez votre premier audit de paiement. Cela prend environ deux minutes.",
    runAnalysis: "Lancer votre analyse",
    legacy: "Historique",
    legacyUnavailable: "Résumé historique · rapport de paiement détaillé indisponible",
  },
  es: {
    estimate: "Estimación",
    annualGap: "Brecha anual",
    openReport: "Abrir informe",
    otherProvider: "Otro proveedor",
    eyebrow: "Tus análisis",
    title: "Historial de auditorías de pagos",
    newAnalysis: "Nuevo análisis",
    loading: "Cargando tu historial...",
    error: "No hemos podido cargar tu historial ahora. Inténtalo de nuevo en unos instantes.",
    emptyTitle: "Aún no hay análisis",
    emptyMessage: "Ejecuta tu primera auditoría de pagos. Tarda unos dos minutos.",
    runAnalysis: "Ejecutar tu análisis",
    legacy: "Histórico",
    legacyUnavailable: "Resumen histórico · informe detallado de pagos no disponible",
  },
};

function fmtDate(iso, locale) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" });
  } catch {
    return "";
  }
}

// Pretty provider label from slug — small, local map covering the common ones;
// falls back to a title-cased slug.
const PROVIDER_LABELS = {
  stripe: "Stripe", paypal: "PayPal", shopify_payments: "Shopify Payments",
  adyen: "Adyen", mollie: "Mollie", checkout_com: "Checkout.com", sumup: "SumUp",
  payplug: "Payplug", stancer: "Stancer", lyra: "Lyra", zettle: "Zettle",
  stripe_terminal: "Stripe Terminal", smile_and_pay: "Smile & Pay", yavin: "Yavin",
  other: "Other provider",
};
function providerLabel(slug, otherProvider) {
  if (!slug) return "—";
  if (slug === "other") return otherProvider;
  if (PROVIDER_LABELS[slug]) return PROVIDER_LABELS[slug];
  return String(slug).replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function HistoryCard({ item, onOpen, copy, locale, formatCurrency }) {
  const range = item.savings_range;
  const point = range?.point ?? item.total_savings;
  const currency = item.currency || "EUR";
  const money = (value) => typeof value === "number" && isFinite(value)
    ? formatCurrency(Math.round(value), currency)
    : "—";
  const hasDetail = item.detail_available === true;
  const Card = hasDetail ? "button" : "div";
  return (
    <Card
      {...(hasDetail ? { type: "button", onClick: () => onOpen(item) } : {})}
      className={`w-full text-left rounded-2xl p-5 transition-all ${hasDetail ? "hover:border-cyan-400/40 hover:bg-white/[0.05] group" : "cursor-default"}`}
      style={{ border: "1px solid rgba(255,255,255,0.10)", background: "rgba(255,255,255,0.03)" }}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-[15px] font-bold text-white truncate">{providerLabel(item.provider_slug, copy.otherProvider)}</span>
            <span
              className="text-[9px] uppercase tracking-[0.14em] font-bold px-1.5 py-0.5 rounded-full shrink-0"
              style={{ background: "rgba(34,211,238,0.12)", color: "rgba(34,211,238,0.95)", border: "1px solid rgba(34,211,238,0.25)" }}
            >
              {hasDetail ? copy.estimate : copy.legacy}
            </span>
          </div>
          <p className="text-[11px] text-white/40">
            {fmtDate(item.created_date, locale)}{item.country ? ` · ${item.country}` : ""}
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-[10px] uppercase tracking-[0.14em] font-bold text-white/40 mb-0.5">{copy.annualGap}</p>
          <p
            className="text-[20px] font-black tabular-nums leading-none"
            style={{
              background: "linear-gradient(135deg, #ffffff 0%, #B8D8E0 45%, #39C6F0 100%)",
              WebkitBackgroundClip: "text", backgroundClip: "text", WebkitTextFillColor: "transparent",
            }}
          >
            {money(point)}
          </p>
          {range && (range.lo !== range.hi) && (
            <p className="text-[10px] text-white/35 tabular-nums mt-0.5">
              {money(range.lo)}–{money(range.hi)}
            </p>
          )}
        </div>
      </div>
      <div className={`mt-3 flex items-center gap-1 text-[11px] transition-colors ${hasDetail ? "text-cyan-300/70 group-hover:text-cyan-300" : "text-white/40"}`}>
        {hasDetail ? <>{copy.openReport} <ArrowRight size={11} /></> : copy.legacyUnavailable}
      </div>
    </Card>
  );
}

export default function ResultsHistory() {
  const navigate = useNavigate();
  const { lang, locale, formatCurrency } = useTranslation();
  const copy = HISTORY_COPY[lang] || HISTORY_COPY.en;
  const [status, setStatus] = useState("loading"); // loading | ready | error
  const [items, setItems] = useState([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const resp = await base44.functions.invoke("getMyPaymentsHistory", {});
        if (cancelled) return;
        const body = resp?.data || resp;
        if (!body?.ok) { setStatus("error"); return; }
        setItems(Array.isArray(body.items) ? body.items : []);
        setStatus("ready");
      } catch {
        if (!cancelled) setStatus("error");
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const openReport = (item) => {
    if (item.id && item.detail_available === true) {
      navigate(`/Results?result=${encodeURIComponent(item.id)}`);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full px-3 py-1 mb-3"
            style={{ border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.03)" }}
          >
            <History size={11} className="text-cyan-300" />
            <span className="text-[10px] uppercase tracking-[0.22em] font-bold text-white/60">{copy.eyebrow}</span>
          </div>
          <h1
            className="text-white"
            style={{ fontFamily: "'Space Grotesk', 'Inter', sans-serif", fontSize: "clamp(26px, 4vw, 38px)", fontWeight: 900, letterSpacing: "-0.03em" }}
          >
            {copy.title}
          </h1>
        </div>
        <Button
          onClick={() => navigate("/Analyzer")}
          className="h-10 rounded-full px-5 text-sm font-bold gap-2 text-white hover:opacity-90 shrink-0"
          style={{ background: "linear-gradient(135deg, var(--voltio) 0%, #39C6F0 100%)", boxShadow: "0 0 24px rgba(34,211,238,0.3)" }}
        >
          <Plus className="h-4 w-4" /> {copy.newAnalysis}
        </Button>
      </div>

      {status === "loading" && (
        <div className="flex items-center gap-2 text-white/50 text-sm py-10 justify-center">
          <Loader2 size={16} className="animate-spin text-cyan-300" /> {copy.loading}
        </div>
      )}

      {status === "error" && (
        <div className="rounded-2xl p-6 text-center text-[13px] text-white/55"
          style={{ border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.02)" }}
        >
          {copy.error}
        </div>
      )}

      {status === "ready" && items.length === 0 && (
        <div className="rounded-2xl p-8 text-center"
          style={{ border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.02)" }}
        >
          <p className="text-white font-bold text-[16px] mb-1.5">{copy.emptyTitle}</p>
          <p className="text-[13px] text-white/55 mb-5">{copy.emptyMessage}</p>
          <Button
            onClick={() => navigate("/Analyzer")}
            className="h-11 rounded-full px-6 text-sm font-bold gap-2 text-white hover:opacity-90"
            style={{ background: "linear-gradient(135deg, var(--voltio) 0%, #39C6F0 100%)" }}
          >
            {copy.runAnalysis} <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      )}

      {status === "ready" && items.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {items.map((item) => (
            <HistoryCard
              key={item.id}
              item={item}
              onOpen={openReport}
              copy={copy}
              locale={locale}
              formatCurrency={formatCurrency}
            />
          ))}
        </div>
      )}
    </div>
  );
}
