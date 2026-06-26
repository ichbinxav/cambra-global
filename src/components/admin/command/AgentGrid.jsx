import { useState } from "react";
import { Loader2, Play, KeyRound } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { CLUSTERS, ORCHESTRATORS, levelBadge } from "@/lib/agentRegistry";

function AgentTile({ agent, lastTask, secretConfigured, onRun }) {
  const lvl = levelBadge(agent.level);
  const active = !agent.secret || secretConfigured;
  return (
    <div className="rounded-xl border border-border/60 bg-white p-3 space-y-2 hover:border-foreground/30 transition-colors">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold truncate">{agent.name}</p>
          <p className="text-[10px] text-muted-foreground line-clamp-2">{agent.desc}</p>
        </div>
        <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full border text-[9px] font-bold ${lvl.cls} shrink-0`}>{lvl.label}</span>
      </div>
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="text-[9px] uppercase tracking-wider font-bold text-muted-foreground">{agent.tool}</span>
        <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold ${active ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${active ? "bg-emerald-500" : "bg-rose-500"}`} />
          {active ? "Ready" : "Needs key"}
        </span>
      </div>
      {lastTask && (
        <p className="text-[10px] text-muted-foreground truncate">
          Last: <span className="font-semibold text-foreground">{lastTask.status}</span> · {lastTask.output_summary || lastTask.input_summary || "—"}
        </p>
      )}
      <button
        type="button"
        onClick={() => onRun?.(agent)}
        disabled={!active}
        className="w-full inline-flex items-center justify-center gap-1.5 h-7 rounded-full bg-foreground text-background text-[11px] font-bold hover:opacity-90 disabled:opacity-40"
      >
        {active ? <><Play size={9} /> Run</> : <><KeyRound size={9} /> Configure key</>}
      </button>
    </div>
  );
}

export default function AgentGrid({ activeSecrets = [], lastTaskByAgent = {} }) {
  const [running, setRunning] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const isSecretConfigured = (secret) => !secret || activeSecrets.includes(secret);

  const runAgent = async (fnName) => {
    setRunning(fnName); setError(null); setResult(null);
    try {
      const res = await base44.functions.invoke(fnName, {});
      const data = res?.data || res;
      setResult({ fn: fnName, ok: data?.ok !== false, summary: data?.task_id ? `Task ${data.task_id.slice(-6)} started` : "Done" });
    } catch (e) {
      setError(`${fnName}: ${e?.message || "failed"}`);
    } finally {
      setRunning(null);
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
                onClick={() => runAgent(o.fn)}
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
                onRun={(a) => runAgent(a.fn)}
              />
            ))}
          </div>
        </div>
      ))}

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