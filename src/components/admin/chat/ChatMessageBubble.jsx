import { Link } from "react-router-dom";
import { CheckCircle2, ShieldAlert, Lock, AlertTriangle, Send } from "lucide-react";

function gateBadge(blocked_by_gate) {
  if (!blocked_by_gate) return null;
  const map = {
    risk_l3_l4_forced_draft: { label: "Forced draft — review in Inbox", icon: Lock, cls: "bg-amber-50 text-amber-700 border-amber-200" },
    bulk_needs_confirmation: { label: "Confirmation needed", icon: AlertTriangle, cls: "bg-orange-50 text-orange-700 border-orange-200" },
    tool_not_allowed:        { label: "Tool refused", icon: ShieldAlert, cls: "bg-rose-50 text-rose-700 border-rose-200" },
    unknown_intent:          { label: "Asking for clarification", icon: AlertTriangle, cls: "bg-blue-50 text-blue-700 border-blue-200" },
  };
  const g = map[blocked_by_gate];
  if (!g) return null;
  const Icon = g.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-bold ${g.cls}`}>
      <Icon size={9} /> {g.label}
    </span>
  );
}

export default function ChatMessageBubble({ message, onConfirm }) {
  const isUser = message.role === "user";
  const calls = Array.isArray(message.tool_calls_json) ? message.tool_calls_json : [];
  const pendingConfirm = calls.find(c => c.status === "requires_confirmation");

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[80%] rounded-2xl px-4 py-3 ${
        isUser
          ? "bg-foreground text-background"
          : "bg-white border border-border/60 text-foreground"
      }`}>
        {message.content && <p className="text-sm whitespace-pre-wrap">{message.content}</p>}

        {gateBadge(message.blocked_by_gate) && (
          <div className="mt-2">{gateBadge(message.blocked_by_gate)}</div>
        )}

        {/* Inline tool calls (executed / drafted / refused) */}
        {!isUser && calls.length > 0 && (
          <div className="mt-2 space-y-1">
            {calls.filter(c => c.status !== "requires_confirmation").map((c, i) => (
              <div key={i} className="text-[11px] flex items-center gap-1.5 flex-wrap">
                {c.status === "drafted" && <Lock size={10} className="text-amber-700" />}
                {c.status === "executed" && <CheckCircle2 size={10} className="text-emerald-700" />}
                {c.status === "refused" && <ShieldAlert size={10} className="text-rose-700" />}
                <span className="font-bold text-foreground">{c.name}</span>
                <span className="text-muted-foreground">· {c.status}{c.forced_draft ? " (L≥2 → forced draft)" : ""}</span>
                {c.task_id && (
                  <Link to="/admin/activity" className="text-foreground underline">task</Link>
                )}
                {c.approval_id && (
                  <Link to="/admin/inbox" className="text-amber-700 font-bold underline">Review in Inbox →</Link>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Confirmation prompt */}
        {!isUser && pendingConfirm && onConfirm && (
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={() => onConfirm(pendingConfirm)}
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full bg-foreground text-background text-xs font-bold hover:opacity-90"
            >
              <Send size={10} /> Confirm — proceed with {pendingConfirm.count} items
            </button>
            <span className="text-[11px] text-muted-foreground">All output will still go to the Inbox.</span>
          </div>
        )}
      </div>
    </div>
  );
}