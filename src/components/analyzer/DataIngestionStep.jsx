import { useState } from "react";
import { Link } from "react-router-dom";
import { Upload, Plug, Pencil, CheckCircle2, X, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

const MODES = [
  {
    id: "connect",
    icon: Plug,
    title: "Connect your tools",
    sub: "Most accurate",
    desc: "Pull real rates and volumes directly from Stripe, Shopify, accounting platforms, and more.",
    tagColor: "text-green-600",
    accent: true,
  },
  {
    id: "upload",
    icon: Upload,
    title: "Upload your files",
    sub: "Flexible",
    desc: "Drop invoices, CSV exports, or carrier statements. AI extracts rates and costs automatically.",
    tagColor: "text-blue-600",
  },
  {
    id: "skip",
    icon: Pencil,
    title: "Use my manual inputs",
    sub: "Always available",
    desc: "We'll generate an accurate estimate from the data you've already entered in previous steps.",
    tagColor: "text-orange-500",
  },
];

export default function DataIngestionStep({ uploadedFile, setUploadedFile, uploading, uploadProgress, fileRef, handleUpload }) {
  const [mode, setMode] = useState("upload");

  return (
    <div className="space-y-5">
      {/* Mode selector */}
      <div className="grid grid-cols-3 gap-2">
        {MODES.map(m => (
          <button
            key={m.id}
            onClick={() => setMode(m.id)}
            className={`p-3.5 rounded-xl border text-left transition-all ${mode === m.id ? "border-foreground bg-foreground text-background" : "border-border/50 hover:border-foreground/30 bg-card"}`}
          >
            <m.icon size={14} className={`mb-2 ${mode === m.id ? "text-background/50" : "text-muted-foreground/40"}`} />
            <p className={`text-[11px] font-bold leading-tight mb-0.5 ${mode === m.id ? "text-background" : ""}`}>{m.title}</p>
            <p className={`text-[10px] ${mode === m.id ? "text-background/40" : m.tagColor}`}>{m.sub}</p>
          </button>
        ))}
      </div>

      {/* Mode: Connect */}
      {mode === "connect" && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 p-3.5 rounded-xl bg-green-500/[0.05] border border-green-500/15 text-xs text-muted-foreground">
            <CheckCircle2 size={12} className="text-green-500 shrink-0" />
            Connect your tools for a more accurate analysis — we pull real rates automatically.
          </div>
          <Link to="/ConnectTools" className="block">
            <div className="group p-5 rounded-2xl border border-border/50 bg-card hover:border-foreground/30 transition-all flex items-center justify-between">
              <div>
                <p className="font-bold text-sm mb-1">Open integrations hub</p>
                <p className="text-xs text-muted-foreground">Connect Stripe, Shopify, DHL, Xero, and more — or upload files</p>
              </div>
              <ArrowRight size={16} className="text-muted-foreground/30 group-hover:text-foreground group-hover:translate-x-1 transition-all shrink-0 ml-4" />
            </div>
          </Link>
          <div className="flex flex-wrap gap-1.5">
            {["Stripe", "Shopify", "Adyen", "QuickBooks", "Xero", "DHL", "Klaviyo", "+ more"].map(t => (
              <span key={t} className="text-[10px] px-2.5 py-1 rounded-full bg-secondary text-muted-foreground/50">{t}</span>
            ))}
          </div>
        </div>
      )}

      {/* Mode: Upload */}
      {mode === "upload" && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 p-3.5 rounded-xl bg-blue-500/[0.05] border border-blue-500/15 text-xs text-muted-foreground">
            <Upload size={12} className="text-blue-500 shrink-0" />
            Upload your files if your provider is not yet supported. AI extracts the key data automatically.
          </div>

          {!uploadedFile ? (
            <div
              className="border-2 border-dashed border-border/50 rounded-2xl p-8 text-center hover:border-foreground/20 transition-colors cursor-pointer"
              onClick={() => fileRef.current?.click()}
              onDragOver={e => e.preventDefault()}
              onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleUpload(f); }}
            >
              {uploading ? (
                <div className="space-y-3">
                  <div className="w-8 h-8 rounded-full border-2 border-foreground/20 border-t-foreground animate-spin mx-auto" />
                  <p className="text-sm text-muted-foreground">Uploading...</p>
                  <div className="h-1.5 rounded-full bg-secondary overflow-hidden max-w-[200px] mx-auto">
                    <div className="h-full bg-foreground transition-all duration-200 rounded-full" style={{ width: `${uploadProgress}%` }} />
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="w-12 h-12 rounded-xl bg-secondary flex items-center justify-center mx-auto">
                    <Upload size={20} className="text-muted-foreground/50" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold mb-1">Drop your file here, or click to upload</p>
                    <p className="text-[11px] text-muted-foreground/50">PDF, Excel, CSV, or images · Max 20MB</p>
                  </div>
                  <div className="flex flex-wrap justify-center gap-1.5 mt-1">
                    {["Stripe statement", "Shopify export", "Carrier invoice", "SaaS billing"].map(t => (
                      <span key={t} className="text-[10px] px-2.5 py-1 rounded-full bg-secondary text-muted-foreground/40">{t}</span>
                    ))}
                  </div>
                </div>
              )}
              <input ref={fileRef} type="file" className="hidden" accept=".pdf,.xls,.xlsx,.csv,.png,.jpg,.jpeg" onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(f); }} />
            </div>
          ) : (
            <div className="flex items-center gap-4 p-4 rounded-xl border border-green-500/25 bg-green-500/[0.04]">
              <CheckCircle2 size={16} className="text-green-500 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate">{uploadedFile.name}</p>
                <p className="text-[11px] text-muted-foreground/50">Uploaded · AI analysis included in your results</p>
              </div>
              <button onClick={() => setUploadedFile(null)} className="text-muted-foreground/40 hover:text-muted-foreground transition-colors shrink-0 p-1">
                <X size={14} />
              </button>
            </div>
          )}
          <p className="text-[11px] text-muted-foreground/30 text-center">Your data is encrypted and never shared without consent.</p>
        </div>
      )}

      {/* Mode: Skip / manual */}
      {mode === "skip" && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 p-3.5 rounded-xl bg-orange-500/[0.05] border border-orange-500/15 text-xs text-muted-foreground">
            <Pencil size={12} className="text-orange-500 shrink-0" />
            Enter your details manually if needed — we'll generate accurate estimates from your inputs.
          </div>
          <div className="p-5 rounded-2xl border border-border/50 bg-secondary/30 space-y-2">
            <p className="text-sm font-semibold">We'll estimate based on:</p>
            {[
              "Monthly revenue & transaction volume",
              "Channel mix (DTC, marketplace, wholesale)",
              "Payment provider & current rate",
              "Shipping provider & monthly spend",
              "Total SaaS spend",
            ].map(item => (
              <div key={item} className="flex items-center gap-2 text-xs text-muted-foreground/60">
                <CheckCircle2 size={11} className="text-muted-foreground/30 shrink-0" />
                {item}
              </div>
            ))}
          </div>
          <p className="text-center text-[11px] text-muted-foreground/40">
            Hit "Run Analysis" below to see your results using manual inputs.
          </p>
        </div>
      )}
    </div>
  );
}