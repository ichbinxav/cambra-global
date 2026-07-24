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

function fmtEUR(n) {
  if (typeof n !== "number" || !isFinite(n)) return "—";
  return `€${Math.round(n).toLocaleString("en-US")}`;
}

function fmtDate(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
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
function providerLabel(slug) {
  if (!slug) return "—";
  if (PROVIDER_LABELS[slug]) return PROVIDER_LABELS[slug];
  return String(slug).replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function HistoryCard({ item, onOpen }) {
  const range = item.savings_range;
  const point = range?.point ?? item.total_savings;
  return (
    <button
      onClick={() => onOpen(item)}
      className="w-full text-left rounded-2xl p-5 transition-all hover:border-cyan-400/40 hover:bg-white/[0.05] group"
      style={{ border: "1px solid rgba(255,255,255,0.10)", background: "rgba(255,255,255,0.03)" }}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-[15px] font-bold text-white truncate">{providerLabel(item.provider_slug)}</span>
            <span
              className="text-[9px] uppercase tracking-[0.14em] font-bold px-1.5 py-0.5 rounded-full shrink-0"
              style={{ background: "rgba(34,211,238,0.12)", color: "rgba(34,211,238,0.95)", border: "1px solid rgba(34,211,238,0.25)" }}
            >
              Estimate
            </span>
          </div>
          <p className="text-[11px] text-white/40">
            {fmtDate(item.created_date)}{item.country ? ` · ${item.country}` : ""}
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-[10px] uppercase tracking-[0.14em] font-bold text-white/40 mb-0.5">Annual gap</p>
          <p
            className="text-[20px] font-black tabular-nums leading-none"
            style={{
              background: "linear-gradient(135deg, #ffffff 0%, #B8D8E0 45%, #39C6F0 100%)",
              WebkitBackgroundClip: "text", backgroundClip: "text", WebkitTextFillColor: "transparent",
            }}
          >
            {fmtEUR(point)}
          </p>
          {range && (range.lo !== range.hi) && (
            <p className="text-[10px] text-white/35 tabular-nums mt-0.5">
              {fmtEUR(range.lo)}–{fmtEUR(range.hi)}
            </p>
          )}
        </div>
      </div>
      <div className="mt-3 flex items-center gap-1 text-[11px] text-cyan-300/70 group-hover:text-cyan-300 transition-colors">
        Open report <ArrowRight size={11} />
      </div>
    </button>
  );
}

export default function ResultsHistory() {
  const navigate = useNavigate();
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
    if (item.anon_session_id) {
      navigate(`/Results?session=${encodeURIComponent(item.anon_session_id)}`);
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
            <span className="text-[10px] uppercase tracking-[0.22em] font-bold text-white/60">Your analyses</span>
          </div>
          <h1
            className="text-white"
            style={{ fontFamily: "'Space Grotesk', 'Inter', sans-serif", fontSize: "clamp(26px, 4vw, 38px)", fontWeight: 900, letterSpacing: "-0.03em" }}
          >
            Payments audit history
          </h1>
        </div>
        <Button
          onClick={() => navigate("/Analyzer")}
          className="h-10 rounded-full px-5 text-sm font-bold gap-2 text-white hover:opacity-90 shrink-0"
          style={{ background: "linear-gradient(135deg, var(--voltio) 0%, #39C6F0 100%)", boxShadow: "0 0 24px rgba(34,211,238,0.3)" }}
        >
          <Plus className="h-4 w-4" /> New analysis
        </Button>
      </div>

      {status === "loading" && (
        <div className="flex items-center gap-2 text-white/50 text-sm py-10 justify-center">
          <Loader2 size={16} className="animate-spin text-cyan-300" /> Loading your history…
        </div>
      )}

      {status === "error" && (
        <div className="rounded-2xl p-6 text-center text-[13px] text-white/55"
          style={{ border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.02)" }}
        >
          We couldn't load your history right now. Please try again in a moment.
        </div>
      )}

      {status === "ready" && items.length === 0 && (
        <div className="rounded-2xl p-8 text-center"
          style={{ border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.02)" }}
        >
          <p className="text-white font-bold text-[16px] mb-1.5">No analyses yet</p>
          <p className="text-[13px] text-white/55 mb-5">Run your first payments audit — it takes about two minutes.</p>
          <Button
            onClick={() => navigate("/Analyzer")}
            className="h-11 rounded-full px-6 text-sm font-bold gap-2 text-white hover:opacity-90"
            style={{ background: "linear-gradient(135deg, var(--voltio) 0%, #39C6F0 100%)" }}
          >
            Run your analysis <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      )}

      {status === "ready" && items.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {items.map((item) => (
            <HistoryCard key={item.id} item={item} onOpen={openReport} />
          ))}
        </div>
      )}
    </div>
  );
}