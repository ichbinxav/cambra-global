import { Activity, ShieldAlert, MessageCircleQuestion, Scale, Sparkles } from "lucide-react";

function Cell({ icon: Icon, label, value, sub, accent = "default" }) {
  const colors = {
    default: { bg: "bg-white", text: "text-foreground", subText: "text-muted-foreground" },
    rose:    { bg: "bg-rose-50 border-rose-200", text: "text-rose-700", subText: "text-rose-600" },
    amber:   { bg: "bg-amber-50 border-amber-200", text: "text-amber-700", subText: "text-amber-600" },
    blue:    { bg: "bg-blue-50 border-blue-200", text: "text-blue-700", subText: "text-blue-600" },
    emerald: { bg: "bg-emerald-50 border-emerald-200", text: "text-emerald-700", subText: "text-emerald-600" },
  };
  const c = colors[accent] || colors.default;
  return (
    <div className={`rounded-xl border border-border/60 p-3 ${c.bg}`}>
      <div className="flex items-center gap-1.5 mb-1">
        <Icon size={11} className={c.subText} />
        <p className={`text-[10px] uppercase tracking-wider font-bold ${c.subText}`}>{label}</p>
      </div>
      <p className={`text-2xl font-black tabular-nums ${c.text}`}>{value}</p>
      {sub && <p className={`text-[10px] mt-0.5 ${c.subText}`}>{sub}</p>}
    </div>
  );
}

export default function PulseBar({ pulse, activeAgents, totalAgents }) {
  const t = pulse?.tasks_24h || {};
  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
      <Cell
        icon={Sparkles}
        label="Agents"
        value={`${activeAgents}/${totalAgents}`}
        sub={`${totalAgents - activeAgents} waiting on a key`}
        accent={activeAgents === totalAgents ? "emerald" : "default"}
      />
      <Cell
        icon={Activity}
        label="Tasks · 24h"
        value={t.total ?? 0}
        sub={`${t.completed ?? 0} ok · ${t.failed ?? 0} failed`}
      />
      <Cell
        icon={ShieldAlert}
        label="Approvals pending"
        value={pulse?.pending_approvals ?? 0}
        sub="L2 · L3 · L4"
        accent={(pulse?.pending_approvals || 0) > 0 ? "rose" : "default"}
      />
      <Cell
        icon={MessageCircleQuestion}
        label="Questions pending"
        value={pulse?.pending_questions ?? 0}
        sub="From agents waiting for input"
        accent={(pulse?.pending_questions || 0) > 0 ? "amber" : "default"}
      />
      <Cell
        icon={Scale}
        label="Legal flags open"
        value={pulse?.legal_flags_open ?? 0}
        sub="GDPR · compliance · contracts"
        accent={(pulse?.legal_flags_open || 0) > 0 ? "amber" : "emerald"}
      />
    </div>
  );
}