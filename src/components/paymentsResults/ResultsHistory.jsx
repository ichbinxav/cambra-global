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
import { ArrowRight, CalendarDays, Loader2, History, Plus, Sparkles } from "lucide-react";
import { useTranslation } from "@/lib/i18n.jsx";

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
  const statusLabel = item.kind === "verified" ? copy.verified : hasDetail ? copy.estimate : copy.legacy;
  const Card = hasDetail ? "button" : "div";
  return (
    <Card
      {...(hasDetail ? { type: "button", onClick: () => onOpen(item) } : {})}
      className={`cambra-paper-card w-full p-5 text-left transition-all ${hasDetail ? "group hover:-translate-y-0.5 hover:border-[#BDB7FB]" : "cursor-default"}`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="truncate text-[15px] font-bold text-[#11182D]">{providerLabel(item.provider_slug, copy.otherProvider)}</span>
            <span
              className="text-[9px] uppercase tracking-[0.14em] font-bold px-1.5 py-0.5 rounded-full shrink-0"
              style={{ background: "#F0EEFF", color: "#4D3DF1", border: "1px solid #D9D5FF" }}
            >
              {statusLabel}
            </span>
          </div>
          <p className="text-[11px] text-[#7A8296]">
            {fmtDate(item.created_date, locale)}{item.country ? ` · ${item.country}` : ""}
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className="mb-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-[#7A8296]">{copy.annualGap}</p>
          <p
            className="text-[20px] font-black tabular-nums leading-none"
            style={{
              background: "linear-gradient(135deg, #2719DB 0%, #6454F5 48%, #2DAFDF 100%)",
              WebkitBackgroundClip: "text", backgroundClip: "text", WebkitTextFillColor: "transparent",
            }}
          >
            {money(point)}
          </p>
          {range && (range.lo !== range.hi) && (
            <p className="mt-0.5 tabular-nums text-[10px] text-[#8A91A4]">
              {money(range.lo)}–{money(range.hi)}
            </p>
          )}
        </div>
      </div>
      {hasDetail && (
        <div className="mt-3 flex items-center gap-1 text-[11px] font-semibold text-[#5B4CF5] transition-colors group-hover:text-[#2DAFDF]">
          {copy.openReport} <ArrowRight size={11} />
        </div>
      )}
    </Card>
  );
}

function FeaturedAnalysis({ item, onOpen, onNew, copy, locale, formatCurrency }) {
  const range = item.savings_range;
  const point = range?.point ?? item.total_savings;
  const currency = item.currency || "EUR";
  const amount = typeof point === "number" && isFinite(point)
    ? formatCurrency(Math.round(point), currency)
    : "—";
  const hasDetail = item.detail_available === true;
  const statusLabel = item.kind === "verified" ? copy.verified : hasDetail ? copy.estimate : copy.legacy;
  const date = fmtDate(item.created_date, locale);

  return (
    <section className="cambra-paper-card mt-9 grid overflow-hidden lg:grid-cols-[minmax(0,1fr)_minmax(420px,.86fr)]">
      <div className="p-7 sm:p-9">
        <p className="text-[10px] font-bold uppercase tracking-[.16em] text-[#5B4CF5]">{copy.latest} · {statusLabel}</p>
        <p className="mt-7 text-[11px] font-bold uppercase tracking-[.13em] text-[#717A91]">{copy.annualGap}</p>
        <div className="mt-2 flex flex-wrap items-end gap-x-3 gap-y-1">
          <strong className="text-[clamp(50px,7vw,82px)] font-bold leading-none tracking-[-.065em] text-[#091126]">{amount}</strong>
          <span className="pb-2 text-[15px] font-semibold text-[#6A738A]">{copy.perYear}</span>
        </div>
        <p className="mt-5 max-w-xl text-[13px] leading-relaxed text-[#68718A]">{providerLabel(item.provider_slug, copy.otherProvider)} · {date}{item.country ? ` · ${item.country}` : ""}</p>
        <div className="mt-7 flex flex-wrap items-center gap-4">
          {hasDetail && (
            <button type="button" onClick={() => onOpen(item)} className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-[var(--g-voltio)] px-6 text-[12px] font-bold text-white">
              {copy.openReport} <ArrowRight size={14} />
            </button>
          )}
          <button type="button" onClick={onNew} className="inline-flex min-h-12 items-center gap-2 px-2 text-[12px] font-bold text-[#4D3DF1]">{copy.newAnalysis} <Plus size={13} /></button>
        </div>
      </div>

      <div className="cambra-dark-panel m-3 flex min-h-[330px] flex-col justify-between p-7 sm:p-9">
        <div>
          <p className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[.15em] text-[#B7ACFF]"><Sparkles size={13} /> {copy.timelineTitle}</p>
          <div className="mt-12 flex items-center">
            <span className="h-7 w-7 shrink-0 rounded-full border-[6px] border-[#6B5AF6] bg-white shadow-[0_0_0_7px_rgba(107,90,246,.18),0_0_28px_rgba(107,90,246,.8)]" />
            <span className="h-px flex-1 border-t border-dashed border-white/35" />
            <span className="h-7 w-7 shrink-0 rounded-full border-2 border-dashed border-white/55" />
          </div>
          <p className="mt-4 flex items-center gap-2 text-[11px] font-semibold text-white/62"><CalendarDays size={13} /> {date}</p>
        </div>
        <p className="mt-8 text-[13px] leading-relaxed text-white/66">{copy.timelineBody}</p>
      </div>
    </section>
  );
}

export default function ResultsHistory() {
  const navigate = useNavigate();
  const { t, locale, formatCurrency } = useTranslation();
  const copy = {
    estimate: t("rpt_vs_estimated"),
    verified: t("dh_badge_verified"),
    annualGap: t("rpt_recovery_potential"),
    openReport: t("results_cta_title"),
    otherProvider: t("cat_other"),
    eyebrow: t("rpt_eyebrow"),
    title: t("rpt_hist_title"),
    newAnalysis: t("rpt_new_scan"),
    loading: t("res_loading"),
    error: t("res_err_msg"),
    emptyTitle: t("rpt_empty_title"),
    emptyMessage: t("rpt_empty_sub"),
    runAnalysis: t("rpt_empty_cta"),
    legacy: t("rpt_hist_eyebrow"),
    latest: t("from_latest_analysis"),
    timelineTitle: t("rpt_hist_title"),
    timelineBody: t("tracking_will_appear"),
    perYear: t("rpt_per_year"),
  };
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
      navigate(item.kind === "verified"
        ? `/Results?verified=${encodeURIComponent(item.id)}`
        : `/Results?result=${encodeURIComponent(item.id)}`);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full px-3 py-1 mb-3"
            style={{ border: "1px solid #D9D5FF", background: "#F0EEFF" }}
          >
            <History size={11} className="text-[#5B4CF5]" />
            <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#5144C9]">{copy.eyebrow}</span>
          </div>
          <h1
            className="text-[#091126]"
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
        <div className="flex items-center justify-center gap-2 py-10 text-sm text-[#707A91]">
          <Loader2 size={16} className="animate-spin text-[#5B4CF5]" /> {copy.loading}
        </div>
      )}

      {status === "error" && (
        <div className="cambra-paper-card p-6 text-center text-[13px] text-[#68718A]">
          {copy.error}
        </div>
      )}

      {status === "ready" && items.length === 0 && (
        <div className="cambra-paper-card p-8 text-center">
          <p className="mb-1.5 text-[16px] font-bold text-[#11182D]">{copy.emptyTitle}</p>
          <p className="mb-5 text-[13px] text-[#68718A]">{copy.emptyMessage}</p>
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
        <>
          <FeaturedAnalysis item={items[0]} onOpen={openReport} onNew={() => navigate("/Analyzer")} copy={copy} locale={locale} formatCurrency={formatCurrency} />
          {items.length > 1 && (
            <section className="mt-10">
              <h2 className="text-[22px] font-bold tracking-[-.035em] text-[#11182D]">{copy.title}</h2>
              <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
                {items.slice(1).map((item) => (
                  <HistoryCard key={item.id} item={item} onOpen={openReport} copy={copy} locale={locale} formatCurrency={formatCurrency} />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
