import { useState } from "react";
import { Sparkles, RefreshCw, Loader2 } from "lucide-react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";

function eventBadge(eventType) {
  if (eventType?.startsWith("chain.halted.")) return { label: "Chain halted", cls: "bg-rose-50 text-rose-700 border-rose-200" };
  if (eventType === "legal.flag.raised")     return { label: "Legal flag",   cls: "bg-amber-50 text-amber-700 border-amber-200" };
  if (eventType === "engineering.report.ready") return { label: "Eng report", cls: "bg-blue-50 text-blue-700 border-blue-200" };
  if (eventType === "engineering.fix.validated") return { label: "Fix validated", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" };
  if (eventType === "research.bundle.completed") return { label: "Research bundle", cls: "bg-violet-50 text-violet-700 border-violet-200" };
  if (eventType === "agent.question.raised")   return { label: "Question raised", cls: "bg-amber-50 text-amber-700 border-amber-200" };
  return { label: eventType, cls: "bg-secondary text-muted-foreground border-border/60" };
}

function timeAgo(iso) {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

export default function CopilotBrief({ events, lastBrief }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [generated, setGenerated] = useState(null);

  const generate = async () => {
    setBusy(true); setError(null);
    try {
      const res = await base44.functions.invoke("founderCopilotAgent", {});
      const data = res?.data || res;
      if (data?.ok || data?.task_id) {
        setGenerated(data);
      } else if (data?.error) {
        setError(data.error);
      }
    } catch (e) {
      setError(e?.message || "Could not generate brief.");
    } finally {
      setBusy(false);
    }
  };

  const brief = generated || lastBrief;
  const briefPayload = brief?.output_payload_json || generated?.output_payload_json;

  return (
    <div className="rounded-2xl border border-border/60 bg-gradient-to-br from-blue-50 via-white to-violet-50 p-5">
      <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-card border border-border/60 flex items-center justify-center">
            <Sparkles size={13} className="text-foreground" />
          </div>
          <div>
            <h2 className="text-sm font-black tracking-tight">Founder Copilot · Brief</h2>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              {brief?.completed_at ? `Last generated ${timeAgo(brief.completed_at)} ago` : "No recent brief yet."}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Link to="/admin/command" className="inline-flex items-center h-8 px-3 rounded-full border border-border/60 bg-card text-xs font-semibold text-foreground hover:bg-secondary">
            Open full
          </Link>
          <button
            type="button"
            onClick={generate}
            disabled={busy}
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full bg-foreground text-background text-xs font-bold hover:opacity-90 disabled:opacity-50"
          >
            {busy ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />}
            Generate now
          </button>
        </div>
      </div>

      {error && <p className="text-[11px] text-rose-700 mb-2">{error}</p>}

      {brief ? (
        <div className="space-y-2">
          {brief.output_summary && (
            <p className="text-xs text-foreground whitespace-pre-wrap">{brief.output_summary}</p>
          )}
          {briefPayload?.sections && Array.isArray(briefPayload.sections) && (
            <div className="space-y-1.5 mt-2">
              {briefPayload.sections.slice(0, 4).map((s, i) => (
                <div key={i} className="text-xs">
                  <span className="font-bold text-foreground">{s.title}</span>
                  {s.body && <span className="text-muted-foreground"> — {s.body}</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">Click "Generate now" to ask the Founder Copilot for a fresh brief.</p>
      )}

      {/* Recent significant events */}
      {Array.isArray(events) && events.length > 0 && (
        <div className="mt-4 pt-3 border-t border-border/40">
          <p className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground mb-2">Relevant events</p>
          <div className="space-y-1.5">
            {events.slice(0, 6).map(e => {
              const b = eventBadge(e.event_type);
              return (
                <div key={e.id} className="flex items-center gap-2 text-xs">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] font-bold ${b.cls}`}>{b.label}</span>
                  <span className="text-muted-foreground truncate flex-1 min-w-0">
                    {e.payload_json?.summary || e.payload_json?.question_text || e.source}
                  </span>
                  <span className="text-[10px] text-muted-foreground/70 shrink-0">{timeAgo(e.created_date)}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}