import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Plug, Upload, Pencil, ArrowRight, CheckCircle2, X, Loader2, Sparkles, ShieldCheck,
} from "lucide-react";
import { base44 } from "@/api/base44Client";
import StripeConnectCard from "@/components/connect/StripeConnectCard";
import UpgradeToVerified from "@/components/shared/UpgradeToVerified";

/**
 * Step3DataSource — Step 3 of the Analyzer.
 *
 * Lets the founder choose ONE of three ways to verify / refine the audit:
 *   1) Connect — Stripe inline + link to /ConnectTools for the full hub.
 *   2) Upload  — drop an invoice/CSV/PDF; AI extracts rates/volumes and
 *                writes them back into `manual` via `onPrefillManual`.
 *   3) Manual  — keep current manual inputs and run.
 *
 * All three flows stay INSIDE the Analyzer — Connect renders Stripe inline
 * and surfaces a "Connect more tools" link to /ConnectTools.
 *
 * Props:
 *   - stripeConnected: boolean
 *   - persistResumeState: () => void  (called before Stripe OAuth redirect)
 *   - onPrefillManual: (partial) => void  (merged into the analyzer's manual{})
 *   - onSkipAndRun: () => void  (called when user picks "Manual → Run")
 */

const MODES = [
  {
    id: "connect",
    icon: Plug,
    title: "Connect your tools",
    sub: "Most accurate",
    desc: "Pull real rates and volumes directly from Stripe and 50+ providers. Read-only.",
    dotColor: "#10b981",
  },
  {
    id: "upload",
    icon: Upload,
    title: "Upload a document",
    sub: "Flexible",
    desc: "Drop an invoice, statement or CSV. AI extracts your rates automatically.",
    dotColor: "#3b82f6",
  },
  {
    id: "manual",
    icon: Pencil,
    title: "Use my manual inputs",
    sub: "Always available",
    desc: "We'll estimate from what you've already entered. Refine later anytime.",
    dotColor: "#f59e0b",
  },
];

export default function Step3DataSource({
  stripeConnected,
  persistResumeState,
  onPrefillManual,
  onSkipAndRun,
}) {
  const navigate = useNavigate();
  const fileRef = useRef(null);
  const [mode, setMode] = useState(stripeConnected ? "connect" : "connect");
  const [uploadedFile, setUploadedFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [extracted, setExtracted] = useState(null);
  const [extractError, setExtractError] = useState("");

  // ── Upload + AI extract → prefill manual ──
  const handleUpload = async (file) => {
    if (!file) return;
    setUploadedFile(file);
    setUploading(true);
    setExtractError("");
    setExtracted(null);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      setUploading(false);
      setExtracting(true);

      const schema = {
        type: "object",
        properties: {
          payment_fee_pct: { type: "number", description: "Effective payment processing fee % (e.g. 2.9)" },
          monthly_shipments: { type: "number", description: "Number of monthly shipments" },
          monthly_shipping_cost: { type: "number", description: "Monthly shipping cost in EUR" },
          total_saas_spend: { type: "number", description: "Total monthly SaaS spend in EUR" },
          banking_monthly_fees: { type: "number", description: "Monthly banking fees in EUR" },
        },
      };

      const res = await base44.integrations.Core.ExtractDataFromUploadedFile({
        file_url,
        json_schema: schema,
      });

      if (res?.status === "success" && res.output) {
        const out = Array.isArray(res.output) ? (res.output[0] || {}) : res.output;
        const cleaned = Object.fromEntries(
          Object.entries(out).filter(([_, v]) => typeof v === "number" && v > 0)
        );
        setExtracted(cleaned);
        if (Object.keys(cleaned).length > 0) {
          onPrefillManual?.(cleaned);
        }
      } else {
        setExtractError(res?.details || "We couldn't extract data from this file. Your manual inputs will be used.");
      }
    } catch (e) {
      setExtractError(e?.message || "Upload failed. Please try again.");
    } finally {
      setUploading(false);
      setExtracting(false);
    }
  };

  const clearFile = () => {
    setUploadedFile(null);
    setExtracted(null);
    setExtractError("");
  };

  return (
    <div className="space-y-5">
      {/* Mode selector — 3 cards */}
      <div className="grid grid-cols-3 gap-2">
        {MODES.map(m => {
          const active = mode === m.id;
          const Icon = m.icon;
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => setMode(m.id)}
              aria-pressed={active}
              className="relative p-3.5 rounded-2xl text-left transition-all min-h-[110px]"
              style={
                active
                  ? {
                      background: "rgba(255,255,255,0.06)",
                      border: "1px solid rgba(255,255,255,0.85)",
                      boxShadow: "0 0 0 1px rgba(255,255,255,0.12) inset, 0 8px 24px -12px rgba(34,211,238,0.35)",
                    }
                  : {
                      background: "rgba(255,255,255,0.025)",
                      border: "1px solid rgba(255,255,255,0.10)",
                    }
              }
            >
              <div className="flex items-center gap-1.5 mb-2">
                <Icon size={13} className={active ? "text-white" : "text-white/45"} />
                <span
                  className="w-1.5 h-1.5 rounded-full"
                  style={{ background: m.dotColor }}
                  aria-hidden="true"
                />
              </div>
              <p className={`text-[12px] font-bold leading-tight mb-1 ${active ? "text-white" : "text-white/85"}`}>
                {m.title}
              </p>
              <p className="text-[10px] text-white/45">{m.sub}</p>
            </button>
          );
        })}
      </div>

      {/* Mode description */}
      <p className="text-[13px] text-white/55 px-1">
        {MODES.find(m => m.id === mode)?.desc}
      </p>

      {/* ─── Mode: Connect ─── */}
      {mode === "connect" && (
        <div className="space-y-4">
          {stripeConnected ? (
            <div
              className="rounded-2xl p-6 text-center"
              style={{
                background: "rgba(34,211,238,0.06)",
                border: "1px solid rgba(34,211,238,0.25)",
                boxShadow: "0 0 32px rgba(34,211,238,0.15)",
              }}
            >
              <ShieldCheck size={28} className="mx-auto mb-2 text-cyan-300" />
              <p className="text-sm font-black text-white">Stripe connected — payments verified</p>
            </div>
          ) : (
            <StripeConnectCard redirectAfter="/Analyzer?resume=true" />
          )}

          {/* Link to full integration hub */}
          <button
            type="button"
            onClick={() => { persistResumeState?.(); navigate("/ConnectTools"); }}
            className="w-full flex items-center justify-between px-4 py-3.5 rounded-xl text-left hover:bg-white/5 transition-colors"
            style={{
              background: "rgba(255,255,255,0.025)",
              border: "1px solid rgba(255,255,255,0.10)",
            }}
          >
            <div>
              <p className="text-[13px] font-bold text-white">Connect more tools</p>
              <p className="text-[11px] text-white/50">Shopify, DHL, Xero, Klaviyo, and 50+ more in the hub</p>
            </div>
            <ArrowRight size={14} className="text-white/40 shrink-0" />
          </button>
        </div>
      )}

      {/* ─── Mode: Upload ─── */}
      {mode === "upload" && (
        <div className="space-y-3">
          {!uploadedFile ? (
            <div
              role="button"
              tabIndex={0}
              onClick={() => fileRef.current?.click()}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") fileRef.current?.click(); }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const f = e.dataTransfer.files?.[0];
                if (f) handleUpload(f);
              }}
              className="rounded-2xl p-8 text-center cursor-pointer transition-colors hover:bg-white/[0.03]"
              style={{
                background: "rgba(255,255,255,0.02)",
                border: "1.5px dashed rgba(255,255,255,0.18)",
              }}
            >
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-3"
                style={{ background: "rgba(255,255,255,0.05)" }}
              >
                <Upload size={20} className="text-white/55" />
              </div>
              <p className="text-sm font-semibold text-white mb-1">Drop your file, or click to upload</p>
              <p className="text-[11px] text-white/45">PDF, Excel, CSV, or image · Max 20MB</p>
              <div className="flex flex-wrap justify-center gap-1.5 mt-4">
                {["Stripe statement", "Carrier invoice", "SaaS billing", "Bank statement"].map(t => (
                  <span
                    key={t}
                    className="text-[10px] px-2.5 py-1 rounded-full text-white/45"
                    style={{ background: "rgba(255,255,255,0.04)" }}
                  >
                    {t}
                  </span>
                ))}
              </div>
              <input
                ref={fileRef}
                type="file"
                className="hidden"
                accept=".pdf,.xls,.xlsx,.csv,.png,.jpg,.jpeg"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f); }}
              />
            </div>
          ) : (
            <div
              className="rounded-2xl p-4"
              style={{
                background: "rgba(34,211,238,0.06)",
                border: "1px solid rgba(34,211,238,0.22)",
              }}
            >
              <div className="flex items-center gap-3">
                {uploading || extracting ? (
                  <Loader2 size={16} className="animate-spin text-cyan-300 shrink-0" />
                ) : (
                  <CheckCircle2 size={16} className="text-cyan-300 shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white truncate">{uploadedFile.name}</p>
                  <p className="text-[11px] text-white/55">
                    {uploading
                      ? "Uploading…"
                      : extracting
                      ? "AI reading your document…"
                      : extracted
                      ? `Extracted ${Object.keys(extracted).length} field${Object.keys(extracted).length === 1 ? "" : "s"} · used to refine your analysis`
                      : "Saved · will run with current inputs"}
                  </p>
                </div>
                {!uploading && !extracting && (
                  <button
                    type="button"
                    onClick={clearFile}
                    aria-label="Remove file"
                    className="text-white/45 hover:text-white shrink-0 p-1"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>

              {extracted && Object.keys(extracted).length > 0 && (
                <div className="mt-3 pt-3" style={{ borderTop: "1px solid rgba(34,211,238,0.2)" }}>
                  <p className="text-[10px] uppercase tracking-[0.18em] font-bold text-cyan-200 mb-2 flex items-center gap-1.5">
                    <Sparkles size={10} /> Auto-filled from your file
                  </p>
                  <div className="grid grid-cols-2 gap-1.5">
                    {Object.entries(extracted).map(([k, v]) => (
                      <div key={k} className="text-[11px] text-white/70">
                        <span className="text-white/45">{prettyKey(k)}: </span>
                        <span className="font-bold text-white tabular-nums">{formatValue(k, v)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {extractError && (
                <p className="mt-3 text-[11px] text-amber-300">{extractError}</p>
              )}
            </div>
          )}

          <p className="text-center text-[10px] text-white/35">
            🔒 Encrypted · 👁 Read-only · 🚫 Never shared
          </p>
        </div>
      )}

      {/* ─── Mode: Manual ─── */}
      {mode === "manual" && (
        <div className="space-y-3">
          <div
            className="rounded-2xl p-5 space-y-2"
            style={{
              background: "rgba(255,255,255,0.025)",
              border: "1px solid rgba(255,255,255,0.10)",
            }}
          >
            <p className="text-[13px] font-bold text-white mb-2">We'll estimate based on:</p>
            {[
              "Your revenue range and category",
              "Country & tier benchmarks",
              "Tools you selected in Step 2",
              "Any rates & volumes you entered manually",
            ].map(item => (
              <div key={item} className="flex items-center gap-2 text-[12px] text-white/60">
                <CheckCircle2 size={11} className="text-white/35 shrink-0" />
                {item}
              </div>
            ))}
          </div>
          <p className="text-center text-[11px] text-white/45">
            Results will be marked as estimated. You can refine anytime by connecting tools or uploading documents.
          </p>
          <button
            type="button"
            onClick={() => onSkipAndRun?.()}
            className="w-full h-11 rounded-full text-sm font-bold bg-white text-black hover:bg-white/90 inline-flex items-center justify-center gap-2"
          >
            Run analysis with manual inputs <ArrowRight size={14} />
          </button>
        </div>
      )}
    </div>
  );
}

function prettyKey(k) {
  return k
    .replace(/_/g, " ")
    .replace(/pct/gi, "%")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatValue(k, v) {
  if (k.includes("pct")) return `${Number(v).toFixed(2)}%`;
  if (k.includes("cost") || k.includes("spend") || k.includes("fee")) return `€${Number(v).toLocaleString()}`;
  return Number(v).toLocaleString();
}