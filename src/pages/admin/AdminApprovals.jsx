import { useEffect, useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { ShieldCheck, RefreshCw, ChevronDown, ChevronRight } from "lucide-react";
import ApprovalCard from "@/components/admin/approvals/ApprovalCard";
import ApprovalHistoryRow from "@/components/admin/approvals/ApprovalHistoryRow";

const HISTORY_LIMIT = 50;

export default function AdminApprovals() {
  const [pending, setPending] = useState([]);
  const [history, setHistory] = useState([]);
  const [tasksById, setTasksById] = useState({});
  const [me, setMe] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState(null);
  const [historyOpen, setHistoryOpen] = useState(false);

  const load = async () => {
    setRefreshing(true);
    try {
      const [user, pendingRows, historyRows] = await Promise.all([
        base44.auth.me().catch(() => null),
        base44.entities.Approval.filter({ status: "pending" }, "created_date", 200),
        base44.entities.Approval
          .filter({ status: { $in: ["approved", "rejected", "expired", "cancelled"] } }, "-updated_date", HISTORY_LIMIT)
          .catch(() => []),
      ]);
      setMe(user);
      setPending(Array.isArray(pendingRows) ? pendingRows : []);
      setHistory(Array.isArray(historyRows) ? historyRows : []);

      // Resolve agent names for all referenced tasks
      const taskIds = Array.from(new Set(
        [...(pendingRows || []), ...(historyRows || [])]
          .map(a => a.agent_task_id).filter(Boolean)
      ));
      if (taskIds.length) {
        const tasks = await base44.entities.AgentTask
          .filter({ id: { $in: taskIds } }, "-created_date", taskIds.length)
          .catch(() => []);
        const map = {};
        for (const t of tasks) map[t.id] = t;
        setTasksById(map);
      } else {
        setTasksById({});
      }
      setError(null);
    } catch (e) {
      setError(e?.message || "Could not load approvals.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleApprove = async (approval) => {
    setBusyId(approval.id);
    try {
      const commercial = ["final_provider_deal", "commercial_reply_exception", "provider_negotiation_review", "contract_mismatch", "contract_exception"].includes(approval.action_type);
      if (commercial) {
        const res = await base44.functions.invoke("resolveCommercialApproval", { approval_id: approval.id, decision: "approve" });
        const data = res?.data || res || {};
        if (data.ok === false) throw new Error(data.error || "Commercial approval failed.");
      } else {
        await base44.entities.Approval.update(approval.id, {
          status: "approved",
          approved_by: me?.email || null,
          approved_at: new Date().toISOString(),
        });
      }
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
      const commercial = ["final_provider_deal", "commercial_reply_exception", "provider_negotiation_review", "contract_mismatch", "contract_exception"].includes(approval.action_type);
      if (commercial) {
        const res = await base44.functions.invoke("resolveCommercialApproval", { approval_id: approval.id, decision: "reject", reason: reason || null });
        const data = res?.data || res || {};
        if (data.ok === false) throw new Error(data.error || "Commercial rejection failed.");
      } else {
        await base44.entities.Approval.update(approval.id, {
          status: "rejected",
          approved_by: me?.email || null,
          approved_at: new Date().toISOString(),
          rejected_reason: reason || null,
        });
      }
      await load();
    } catch (e) {
      setError(e?.message || "Could not reject.");
    } finally {
      setBusyId(null);
    }
  };

  const pendingCount = pending.length;

  const buckets = useMemo(() => {
    const out = { l4: [], l3: [], l2: [] };
    for (const a of pending) {
      if (a.risk_level === 4) out.l4.push(a);
      else if (a.risk_level === 3) out.l3.push(a);
      else out.l2.push(a);
    }
    return out;
  }, [pending]);

  const agentNameFor = (approval) => {
    const t = tasksById[approval.agent_task_id];
    return t?.agent_name || null;
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-black tracking-tight flex items-center gap-2">
            <ShieldCheck size={18} className="text-foreground" /> Approval Center
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            Every external or client-visible agent action waits here for your review before it goes out.
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

      {/* Counters */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "L4 · financial / legal", count: buckets.l4.length, cls: "border-rose-500/30 bg-rose-500/5 text-rose-700" },
          { label: "L3 · external action",    count: buckets.l3.length, cls: "border-orange-500/30 bg-orange-500/5 text-orange-700" },
          { label: "L2 · client-visible",     count: buckets.l2.length, cls: "border-amber-500/30 bg-amber-500/5 text-amber-700" },
        ].map(b => (
          <div key={b.label} className={`rounded-xl border p-3 ${b.cls}`}>
            <p className="text-[10px] uppercase tracking-wider font-bold opacity-80">{b.label}</p>
            <p className="text-2xl font-black tabular-nums mt-0.5">{b.count}</p>
          </div>
        ))}
      </div>

      {error && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/5 p-3 text-xs text-rose-700">
          {error}
        </div>
      )}

      {/* Pending list */}
      <section className="space-y-3">
        <h2 className="text-sm font-black tracking-tight">
          Pending <span className="text-muted-foreground font-semibold">({pendingCount})</span>
        </h2>

        {loading ? (
          <div className="rounded-2xl border border-border/60 bg-card p-10 text-center text-sm text-muted-foreground">
            Loading approvals…
          </div>
        ) : pendingCount === 0 ? (
          <div className="rounded-2xl border border-dashed border-border/60 bg-secondary/20 p-10 text-center">
            <p className="text-sm font-bold text-foreground mb-1">No actions waiting for approval</p>
            <p className="text-xs text-muted-foreground max-w-md mx-auto">
              When agents draft emails, posts or external contacts, they'll appear here for you to
              review before anything is sent.
            </p>
          </div>
        ) : (
          // Render L4 first (most urgent), then L3, then L2 — already sorted by created_date asc within each
          [...buckets.l4, ...buckets.l3, ...buckets.l2].map(a => (
            <ApprovalCard
              key={a.id}
              approval={a}
              agentName={agentNameFor(a)}
              onApprove={handleApprove}
              onReject={handleReject}
              busy={busyId === a.id}
            />
          ))
        )}
      </section>

      {/* History */}
      <section className="rounded-2xl border border-border/60 bg-card overflow-hidden">
        <button
          type="button"
          onClick={() => setHistoryOpen(o => !o)}
          className="w-full px-4 py-3 flex items-center gap-2 hover:bg-secondary/40 transition-colors text-left"
        >
          {historyOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          <span className="text-sm font-bold text-foreground">History</span>
          <span className="text-[11px] text-muted-foreground">last {HISTORY_LIMIT} resolved</span>
          <span className="ml-auto text-[11px] text-muted-foreground tabular-nums">{history.length}</span>
        </button>
        {historyOpen && (
          history.length === 0 ? (
            <div className="px-4 py-6 border-t border-border/40 text-center text-xs text-muted-foreground">
              No resolved approvals yet.
            </div>
          ) : (
            <div className="border-t border-border/40">
              {history.map(a => <ApprovalHistoryRow key={a.id} approval={a} />)}
            </div>
          )
        )}
      </section>
    </div>
  );
}