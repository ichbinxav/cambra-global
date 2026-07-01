import { useState } from "react";
import { MessageCircleQuestion, Lock, ListChecks, KeyRound, ArrowRight, Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Link } from "react-router-dom";

const TYPE_META = {
  choice: { icon: ListChecks, label: "Choice", cls: "bg-blue-50 text-blue-700 border-blue-200" },
  text:   { icon: MessageCircleQuestion, label: "Reply", cls: "bg-violet-50 text-violet-700 border-violet-200" },
  access: { icon: KeyRound, label: "Access needed", cls: "bg-amber-50 text-amber-700 border-amber-200" },
};

function timeAgo(iso) {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export default function AgentQuestionCard({ question, onAnswered }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const meta = TYPE_META[question.question_type] || TYPE_META.text;
  const Icon = meta.icon;

  const submit = async (answer) => {
    if (!answer || !answer.trim()) { setError("Answer required."); return; }
    setBusy(true); setError(null);
    try {
      const res = await base44.functions.invoke("answerAgentQuestion", {
        question_id: question.id,
        answer_text: answer.trim(),
      });
      const data = res?.data || res;
      if (data?.ok) {
        onAnswered?.(question.id, data);
      } else {
        setError(data?.error || "Could not save answer.");
      }
    } catch (e) {
      setError(e?.message || "Could not save answer.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-2xl border border-border/60 bg-card p-4 space-y-3">
      <div className="flex items-start gap-3 flex-wrap">
        <div className="w-9 h-9 rounded-xl bg-secondary border border-border/60 flex items-center justify-center shrink-0">
          <Icon size={14} className="text-foreground" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">
              {question.agent_name}
            </span>
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] font-bold ${meta.cls}`}>
              {meta.label}
            </span>
            <span className="text-[10px] text-muted-foreground">· {timeAgo(question.created_date)}</span>
          </div>
          {question.context_summary && (
            <p className="text-[11px] text-muted-foreground mt-1">{question.context_summary}</p>
          )}
          <p className="text-sm font-semibold text-foreground mt-1.5">{question.question_text}</p>
        </div>
      </div>

      {/* Choice */}
      {question.question_type === "choice" && Array.isArray(question.options) && question.options.length > 0 && (
        <div className="flex flex-wrap gap-2 pt-1">
          {question.options.map(opt => (
            <button
              key={opt}
              type="button"
              disabled={busy}
              onClick={() => submit(opt)}
              className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-full border border-border/60 bg-card text-xs font-semibold text-foreground hover:bg-secondary disabled:opacity-50 transition-colors"
            >
              {opt}
            </button>
          ))}
        </div>
      )}

      {/* Text */}
      {question.question_type === "text" && (
        <div className="flex gap-2 pt-1">
          <input
            type="text"
            value={text}
            onChange={e => setText(e.target.value)}
            disabled={busy}
            placeholder="Reply in 1–2 lines…"
            className="flex-1 h-9 px-3 rounded-lg border border-border/60 bg-card text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-foreground/40"
            onKeyDown={e => { if (e.key === "Enter") submit(text); }}
          />
          <button
            type="button"
            disabled={busy || !text.trim()}
            onClick={() => submit(text)}
            className="inline-flex items-center gap-1.5 h-9 px-4 rounded-full bg-foreground text-background text-xs font-bold hover:opacity-90 disabled:opacity-50"
          >
            {busy ? <Loader2 size={12} className="animate-spin" /> : <ArrowRight size={11} />}
            Send
          </button>
        </div>
      )}

      {/* Access */}
      {question.question_type === "access" && (
        <div className="flex flex-wrap items-center gap-2 pt-1">
          {question.access_link ? (
            <Link
              to={question.access_link}
              className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-full bg-foreground text-background text-xs font-bold hover:opacity-90"
            >
              <Lock size={11} /> Grant access
            </Link>
          ) : (
            <span className="text-[11px] text-muted-foreground">No access link provided — grant the secret in settings.</span>
          )}
          <button
            type="button"
            disabled={busy}
            onClick={() => submit("granted")}
            className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-full border border-border/60 bg-card text-xs font-semibold text-foreground hover:bg-secondary disabled:opacity-50"
          >
            I've granted it
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => submit("declined")}
            className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-full border border-border/60 bg-card text-xs font-semibold text-muted-foreground hover:bg-secondary disabled:opacity-50"
          >
            Decline
          </button>
        </div>
      )}

      {error && <p className="text-[11px] text-rose-600">{error}</p>}
    </div>
  );
}