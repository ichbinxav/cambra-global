import { useState, useEffect } from "react";
import { Loader2, Play, KeyRound, X } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { CLUSTERS, ORCHESTRATORS, levelBadge } from "@/lib/agentRegistry";

// ─── Run modal — collects input (URL and/or brand) before invoking ───────
function RunModal({ open, target, onClose, onRun }) {
  const [url, setUrl] = useState("");
  const [brandId, setBrandId] = useState("");
  const [brands, setBrands] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setUrl(""); setBrandId("");
    if (target?.requiresInput === "brand" || target?.requiresInput === "url") {
      base44.entities.Brand.list("-created_date", 50)
        .then(b => setBrands(b || []))
        .catch(() => setBrands([]));
    }
  }, [open, target]);

  if (!open || !target) return null;

  const needsUrl = target.requiresInput === "url";
  const needsBrand = target.requiresInput === "url" || target.requiresInput === "brand";
  const canRun = (!needsUrl || url.trim().length > 3) && (!needsBrand || !!brandId);

  const handleRun = async () => {
    setLoading(true);
    const payload = {};
    if (needsUrl) payload.website_url = url.trim();
    if (needsBrand) payload.brand_id = brandId;
    await onRun(target.fn, payload);
    setLoading(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[200] bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-2xl bg-card border border-border/60 shadow-xl p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <p className="text-sm font-black tracking-tight">{target.name}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">{target.desc}</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground p-1">
            <X size={14} />
          </button>
        </div>
        <div className="space-y-3">
          {needsBrand && (
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Brand</label>
              <select
                value={brandId}
                onChange={(e) => setBrandId(e.target.value)}
                className="w-full h-9 px-3 rounded-lg border border-border/60 bg-card text-xs"
              >
                <option value="">Select a brand…</option>
                {brands.map(b => (
                  <option key={b.id} value={b.id}>{b.name || b.brand_name || b.id}</option>
                ))}
              </select>
            </div>
          )}
          {needsUrl && (
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Website URL</label>
              <input
                type="text"
                placeholder="example.com"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className="w-full h-9 px-3 rounded-lg border border-border/60 bg-card text-xs"
              />
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={handleRun}
          disabled={!canRun || loading}
          className="mt-4 w-full inline-flex items-center justify-center gap-1.5 h-9 rounded-full bg-foreground text-background text-xs font-bold hover:opacity-90 disabled:opacity-40"
        >
          {loading ? <Loader2 size={11} className="animate-spin" /> : <Play size={11} />}
          Run
        </button>
      </div>
    </div>
  );
}

function AgentTile({ agent, lastTask, secretConfigured, onRun }) {
  const lvl = levelBadge(agent.level);
  const active = !agent.secret || secretConfigured;
  // Brain agents are special: deterministic part works without key.
  const deterministicOk = agent.tool && (agent.tool.includes("scoreEngine") || agent.tool.includes("Deterministic"));
  return (
    <div className="rounded-xl border border-border/60 bg-card p-3 space-y-2 hover:border-foreground/30 transition-colors">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold truncate">{agent.name}</p>
          <p className="text-[10px] text-muted-foreground line-clamp-2">{agent.desc}</p>
        </div>
        <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full border text-[9px] font-bold ${lvl.cls} shrink-0`}>{lvl.label}</span>
      </div>
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="text-[9px] uppercase tracking-wider font-bold text-muted-foreground">{agent.tool}</span>
        {active ? (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-emerald-50 text-emerald-700">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Ready
          </span>
        ) : deterministicOk ? (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-amber-50 text-amber-700">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500" /> Deterministic only
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-rose-50 text-rose-700">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-500" /> Needs key
          </span>
        )}
      </div>
      {lastTask && (
        <p className="text-[10px] text-muted-foreground truncate">
          Last: <span className="font-semibold text-foreground">{lastTask.status}</span> · {lastTask.output_summary || lastTask.input_summary || "—"}
        </p>
      )}
      <button
        type="button"
        onClick={() => onRun?.(agent)}
        disabled={!active && !deterministicOk}
        className="w-full inline-flex items-center justify-center gap-1.5 h-7 rounded-full bg-foreground text-background text-[11px] font-bold hover:opacity-90 disabled:opacity-40"
      >
        {(active || deterministicOk) ? <><Play size={9} /> Run</> : <><KeyRound size={9} /> Configure key</>}
      </button>
    </div>
  );
}

export default function AgentGrid({ activeSecrets = [], lastTaskByAgent = {} }) {
  const [running, setRunning] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [modalTarget, setModalTarget] = useState(null);

  const isSecretConfigured = (secret) => !secret || activeSecrets.includes(secret);

  const invoke = async (fnName, payload = {}) => {
    setRunning(fnName); setError(null); setResult(null);
    try {
      const res = await base44.functions.invoke(fnName, payload);
      const data = res?.data || res;
      setResult({ fn: fnName, ok: data?.ok !== false, summary: data?.task_id ? `Task ${data.task_id.slice(-6)} started` : "Done" });
    } catch (e) {
      setError(`${fnName}: ${e?.message || "failed"}`);
    } finally {
      setRunning(null);
    }
  };

  const handleAgentRun = (target) => {
    if (target.requiresInput) {
      setModalTarget(target);
    } else {
      invoke(target.fn, {});
    }
  };

  return (
    <div className="space-y-5">
      {/* Orchestrators row */}
      <div>
        <h3 className="text-xs font-black uppercase tracking-[0.18em] text-muted-foreground mb-2.5">Chains</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {ORCHESTRATORS.map(o => (
            <div key={o.fn} className="rounded-xl border border-border/60 bg-gradient-to-br from-blue-50/40 to-white p-3 space-y-2">
              <p className="text-xs font-bold">{o.name}</p>
              <p className="text-[10px] text-muted-foreground line-clamp-2">{o.desc}</p>
              <button
                type="button"
                onClick={() => handleAgentRun(o)}
                disabled={running === o.fn}
                className="w-full inline-flex items-center justify-center gap-1.5 h-7 rounded-full bg-foreground text-background text-[11px] font-bold hover:opacity-90 disabled:opacity-50"
              >
                {running === o.fn ? <Loader2 size={9} className="animate-spin" /> : <Play size={9} />}
                Run chain
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Clusters */}
      {CLUSTERS.map(cluster => (
        <div key={cluster.key}>
          <div className="mb-2.5">
            <h3 className="text-xs font-black uppercase tracking-[0.18em] text-muted-foreground">{cluster.label}</h3>
            <p className="text-[10px] text-muted-foreground/70 mt-0.5">{cluster.description}</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {cluster.agents.map(agent => (
              <AgentTile
                key={agent.fn}
                agent={agent}
                lastTask={lastTaskByAgent[agent.fn] || null}
                secretConfigured={isSecretConfigured(agent.secret)}
                onRun={handleAgentRun}
              />
            ))}
          </div>
        </div>
      ))}

      <RunModal
        open={!!modalTarget}
        target={modalTarget}
        onClose={() => setModalTarget(null)}
        onRun={invoke}
      />

      {result && (
        <div className="fixed bottom-4 right-4 z-50 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-semibold text-emerald-800 shadow-lg">
          ✅ {result.fn} → {result.summary}
        </div>
      )}
      {error && (
        <div className="fixed bottom-4 right-4 z-50 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-semibold text-rose-800 shadow-lg">
          ❌ {error}
        </div>
      )}
    </div>
  );
}