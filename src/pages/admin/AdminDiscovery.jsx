import { useState } from "react";
import { Sparkles, Loader2, Globe, AlertTriangle, CheckCircle2, ExternalLink } from "lucide-react";
import { base44 } from "@/api/base44Client";

const CONFIDENCE_COLORS = {
  high:   { bg: "bg-emerald-50",  text: "text-emerald-700",  border: "border-emerald-200" },
  medium: { bg: "bg-blue-50",     text: "text-blue-700",     border: "border-blue-200" },
  low:    { bg: "bg-amber-50",    text: "text-amber-700",    border: "border-amber-200" },
};

function confidenceBand(score) {
  if (score >= 0.85) return "high";
  if (score >= 0.65) return "medium";
  return "low";
}

const VERTICAL_LABEL = {
  payments:        "Payments",
  shipping:        "Shipping",
  saas_commerce:   "Commerce platform",
  saas_marketing:  "Marketing",
  saas_analytics:  "Analytics",
  saas_support:    "Support",
  saas_finance:    "Finance",
  saas_hr:         "HR",
  other:           "Other",
};

export default function AdminDiscovery() {
  const [website, setWebsite] = useState("");
  const [brandId, setBrandId] = useState("");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  const handleRun = async (e) => {
    e?.preventDefault();
    setError(null);
    setResult(null);
    if (!website.trim()) { setError("Enter a website URL"); return; }

    setRunning(true);
    try {
      // If no brand_id given, find / pick a brand for the current admin so the
      // agent can run without forcing the user to know an internal id.
      let bid = brandId.trim();
      if (!bid) {
        const brands = await base44.entities.Brand.list("-created_date", 1).catch(() => []);
        if (brands[0]) bid = brands[0].id;
      }
      if (!bid) {
        setError("No brand_id provided and no Brand found. Create a Brand first or paste an id.");
        setRunning(false);
        return;
      }

      const res = await base44.functions.invoke("discoveryTechStackAgent", {
        website_url: website.trim(),
        brand_id: bid,
      });
      const payload = res?.data || res;
      if (!payload?.ok) {
        setError(payload?.error || "Discovery failed");
      } else {
        setResult(payload);
      }
    } catch (e) {
      setError(e?.message || "Unexpected error");
    } finally {
      setRunning(false);
    }
  };

  const findings = result?.findings || [];
  const byVertical = findings.reduce((acc, f) => {
    const v = f.vertical || "other";
    if (!acc[v]) acc[v] = [];
    acc[v].push(f);
    return acc;
  }, {});
  const orderedVerticals = Object.keys(VERTICAL_LABEL).filter(v => byVertical[v]?.length);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-black tracking-tight flex items-center gap-2">
          <Sparkles size={18} /> Discovery · Tech Stack Agent
        </h1>
        <p className="text-xs text-muted-foreground mt-1">
          Brain B1 · Deterministic detection first, AI interprets after. Never invents tools.
        </p>
      </div>

      {/* Run form */}
      <form
        onSubmit={handleRun}
        className="rounded-2xl border border-border/60 bg-white p-5 space-y-3"
      >
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_240px_auto] gap-3 items-end">
          <div>
            <label className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground block mb-1">
              Website URL
            </label>
            <div className="relative">
              <Globe size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                value={website}
                onChange={e => setWebsite(e.target.value)}
                placeholder="e.g. allbirds.com or https://www.gymshark.com"
                disabled={running}
                className="w-full h-10 pl-9 pr-3 rounded-lg border border-border/60 bg-white text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-foreground/40"
              />
            </div>
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground block mb-1">
              Brand ID (optional)
            </label>
            <input
              type="text"
              value={brandId}
              onChange={e => setBrandId(e.target.value)}
              placeholder="auto-pick if empty"
              disabled={running}
              className="w-full h-10 px-3 rounded-lg border border-border/60 bg-white text-xs font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-foreground/40"
            />
          </div>
          <button
            type="submit"
            disabled={running || !website.trim()}
            className="h-10 px-5 rounded-lg bg-foreground text-background text-xs font-bold inline-flex items-center justify-center gap-1.5 hover:opacity-90 disabled:opacity-50"
          >
            {running ? <><Loader2 size={12} className="animate-spin" /> Scanning…</> : <>Run discovery</>}
          </button>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Tip: try a well-known store (e.g. <code className="font-mono">allbirds.com</code>, <code className="font-mono">gymshark.com</code>) to see lots of signals.
        </p>
      </form>

      {/* Error */}
      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 flex items-start gap-2">
          <AlertTriangle size={13} className="text-rose-700 mt-0.5 shrink-0" />
          <p className="text-xs text-rose-700">{error}</p>
        </div>
      )}

      {/* Result */}
      {result && (
        <div className="space-y-4">
          {/* Status strip */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="rounded-xl border border-border/60 bg-white p-3">
              <p className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">Tools detected</p>
              <p className="text-2xl font-black tabular-nums mt-0.5">{findings.length}</p>
            </div>
            <div className="rounded-xl border border-border/60 bg-white p-3">
              <p className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">Verticals covered</p>
              <p className="text-2xl font-black tabular-nums mt-0.5">{orderedVerticals.length}</p>
            </div>
            <div className="rounded-xl border border-border/60 bg-white p-3">
              <p className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">AI interpretation</p>
              <p className="text-sm font-bold mt-1 flex items-center gap-1.5">
                {result.interpretation_status === "ok" ? (
                  <><CheckCircle2 size={13} className="text-emerald-600" /> active</>
                ) : result.interpretation_status === "skipped_no_key" ? (
                  <><AlertTriangle size={13} className="text-amber-600" /> ANTHROPIC_API_KEY not set</>
                ) : (
                  <><AlertTriangle size={13} className="text-amber-600" /> {result.interpretation_status}</>
                )}
              </p>
            </div>
          </div>

          {/* AI summary */}
          {result.summary && result.interpretation_status === "ok" && (
            <div className="rounded-2xl border border-blue-200 bg-blue-50/40 p-4">
              <p className="text-[10px] uppercase tracking-wider font-bold text-blue-700 mb-1">
                AI summary
              </p>
              <p className="text-sm text-foreground leading-relaxed">{result.summary}</p>
            </div>
          )}

          {/* Findings grouped by vertical */}
          {orderedVerticals.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border/60 bg-secondary/20 p-10 text-center">
              <p className="text-sm font-bold mb-1">No signals detected</p>
              <p className="text-xs text-muted-foreground">
                Either the site doesn't expose tools the scanner knows, or fetch was blocked.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {orderedVerticals.map(v => (
                <div key={v} className="rounded-2xl border border-border/60 bg-white overflow-hidden">
                  <div className="px-4 py-2.5 border-b border-border/40 bg-secondary/30 flex items-center justify-between">
                    <span className="text-[11px] uppercase tracking-wider font-bold text-foreground">
                      {VERTICAL_LABEL[v]}
                    </span>
                    <span className="text-[10px] text-muted-foreground">({byVertical[v].length})</span>
                  </div>
                  <div className="divide-y divide-border/30">
                    {byVertical[v].map((f, idx) => {
                      const band = f.ai_confidence || confidenceBand(f.confidence);
                      const cc = CONFIDENCE_COLORS[band] || CONFIDENCE_COLORS.low;
                      return (
                        <div key={`${f.tool}_${idx}`} className="px-4 py-3 space-y-2">
                          <div className="flex items-center gap-3 flex-wrap">
                            <p className="text-sm font-bold text-foreground">{f.tool}</p>
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] font-bold ${cc.bg} ${cc.text} ${cc.border}`}>
                              {band} confidence
                            </span>
                            {f.matched_catalog_id && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-emerald-200 bg-emerald-50 text-emerald-700 text-[10px] font-bold">
                                <CheckCircle2 size={10} />
                                in catalog: {f.matched_catalog_name}
                              </span>
                            )}
                            <span className="text-[10px] text-muted-foreground tabular-nums">
                              scanner score {Number(f.confidence || 0).toFixed(2)}
                            </span>
                          </div>
                          {f.evidence_type && f.evidence_value && (
                            <p className="text-[11px] text-muted-foreground">
                              <span className="font-bold">Evidence ({f.evidence_type}):</span>{" "}
                              <code className="font-mono bg-secondary/60 px-1.5 py-0.5 rounded">{f.evidence_value}</code>
                            </p>
                          )}
                          {f.ai_reasoning && (
                            <p className="text-[11px] text-foreground/80 italic">
                              <span className="font-bold not-italic">AI:</span> {f.ai_reasoning}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Footer: task link */}
          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span>
              AgentTask <code className="font-mono">{result.task_id}</code> · Job <code className="font-mono">{result.job_id || "—"}</code>
            </span>
            <a
              href="/admin/activity"
              className="inline-flex items-center gap-1 hover:text-foreground"
            >
              View in Activity Log <ExternalLink size={10} />
            </a>
          </div>
        </div>
      )}
    </div>
  );
}