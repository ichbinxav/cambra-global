import { useEffect, useMemo, useState } from "react";
import { Inbox, RefreshCw, ShieldAlert, MessageCircleQuestion } from "lucide-react";
import { base44 } from "@/api/base44Client";
import AgentQuestionCard from "@/components/admin/inbox/AgentQuestionCard";
import ApprovalCard from "@/components/admin/approvals/ApprovalCard";

function risk(approval) {
  // higher risk_level → more urgent
  return -1 * (approval.risk_level || 0);
}
function approvalAge(a) { return new Date(a.created_date || 0).getTime(); }
function questionAge(q) { return new Date(q.created_date || 0).getTime(); }

export default function AdminInbox() {
  const [approvals, setApprovals] = useState([]);
  const [questions, setQuestions] = useState([]);
  const [tasksById, setTasksById] = useState({});
  const [me, setMe] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState(null);

  const load = async () => {
    setRefreshing(true);
    try {
      const [user, ap, qs] = await Promise.all([
        base44.auth.me().catch(() => null),
        base44.entities.Approval.filter({ status: "pending" }, "-created_date", 200),
        base44.entities.AgentQuestion.filter({ status: "pending" }, "-created_date", 200),
      ]);
      setMe(user);
      setApprovals(Array.isArray(ap) ? ap : []);
      setQuestions(Array.isArray(qs) ? qs : []);

      const taskIds = Array.from(new Set((ap || []).map(a => a.agent_task_id).filter(Boolean)));
      if (taskIds.length) {
        const tasks = await base44.entities.AgentTask.filter({ id: { $in: taskIds } }, "-created_date", taskIds.length).catch(() => []);
        const map = {};
        for (const t of tasks) map[t.id] = t;
        setTasksById(map);
      } else {
        setTasksById({});
      }
      setError(null);
    } catch (e) {
      setError(e?.message || "Could not load inbox.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { load(); }, []);

  const resolveThroughFounderOS = async (approval, decision, reason = "") => {
    const previewRes = await base44.functions.invoke("founderOSCommand", {
      action: "resolve_approval", approval_id: approval.id, decision, reason, confirmed: false,
    });
    const preview = previewRes?.data || previewRes || {};
    if (preview.ok === false || !preview.command_key) throw new Error(preview.error || "Approval preview failed.");
    const confirmRes = await base44.functions.invoke("founderOSCommand", {
      action: "resolve_approval", approval_id: approval.id, decision, reason,
      confirmed: true, command_key: preview.command_key,
      confirmation_nonce: preview.confirmation_nonce,
    });
    const result = confirmRes?.data || confirmRes || {};
    if (result.ok === false) throw new Error(result.error || "Founder approval command failed.");
    return result;
  };

  const handleApprove = async (approval) => {
    setBusyId(approval.id);
    try {
      await resolveThroughFounderOS(approval, "approve");
      await load();
    } catch (e) {
      setError(e?.message || "Could not approve.");
    } finally {
      setBusyId(null);
    }
  };

  const handleReject = async (approval, reason) => {
    setBusyId(approval.id);
    try {
      await resolveThroughFounderOS(approval, "reject", reason || "");
      await load();
    } catch (e) {
      setError(e?.message || "Could not reject.");
    } finally {
      setBusyId(null);
    }
  };

  // Mixed urgency-sorted feed (approvals + questions)
  const items = useMemo(() => {
    const a = approvals.map(x => ({ kind: "approval", id: x.id, urgency: risk(x), at: approvalAge(x), data: x }));
    const q = questions.map(x => ({ kind: "question", id: x.id, urgency: 0, at: questionAge(x), data: x }));
    return [...a, ...q].sort((x, y) => x.urgency - y.urgency || y.at - x.at);
  }, [approvals, questions]);

  const agentNameFor = (approval) => tasksById[approval.agent_task_id]?.agent_name || null;

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-black tracking-tight flex items-center gap-2">
            <Inbox size={18} /> Inbox
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            Todo lo que requiere tu atención, mezclado y ordenado por urgencia.
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={refreshing}
          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-border/60 bg-card text-xs font-semibold text-foreground hover:bg-secondary transition-colors disabled:opacity-50"
        >
          <RefreshCw size={11} className={refreshing ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-rose-200 bg-rose-50/40 p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <ShieldAlert size={11} className="text-rose-700" />
            <p className="text-[10px] uppercase tracking-wider font-bold text-rose-700">Approvals</p>
          </div>
          <p className="text-2xl font-black tabular-nums text-rose-700">{approvals.length}</p>
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50/40 p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <MessageCircleQuestion size={11} className="text-amber-700" />
            <p className="text-[10px] uppercase tracking-wider font-bold text-amber-700">Questions</p>
          </div>
          <p className="text-2xl font-black tabular-nums text-amber-700">{questions.length}</p>
        </div>
      </div>

      {error && <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">{error}</div>}

      {loading ? (
        <div className="rounded-2xl border border-border/60 bg-card p-10 text-center text-sm text-muted-foreground">Loading inbox…</div>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border/60 bg-secondary/20 p-10 text-center">
          <p className="text-sm font-bold mb-1">Inbox zero</p>
          <p className="text-xs text-muted-foreground max-w-md mx-auto">
            No hay aprobaciones ni preguntas pendientes. Los agentes te avisarán aquí cuando necesiten algo de ti.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map(item =>
            item.kind === "approval" ? (
              <ApprovalCard
                key={`a_${item.id}`}
                approval={item.data}
                agentName={agentNameFor(item.data)}
                onApprove={handleApprove}
                onReject={handleReject}
                busy={busyId === item.id}
              />
            ) : (
              <AgentQuestionCard key={`q_${item.id}`} question={item.data} onAnswered={() => load()} />
            )
          )}
        </div>
      )}
    </div>
  );
}
