import { useEffect, useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { RefreshCw, Activity } from "lucide-react";
import ActivityFilters from "@/components/admin/activity/ActivityFilters";
import AgentTaskRow from "@/components/admin/activity/AgentTaskRow";

const PAGE_SIZE = 100;

export default function AdminActivity() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const [status, setStatus] = useState("all");
  const [agent, setAgent] = useState("all");
  const [brandQuery, setBrandQuery] = useState("");

  const load = async () => {
    setRefreshing(true);
    try {
      const rows = await base44.entities.AgentTask.list("-created_date", PAGE_SIZE);
      setTasks(Array.isArray(rows) ? rows : []);
      setError(null);
    } catch (e) {
      setError(e?.message || "Could not load activity.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { load(); }, []);

  const agentOptions = useMemo(() => {
    const set = new Set();
    for (const t of tasks) if (t.agent_name) set.add(t.agent_name);
    return Array.from(set).sort();
  }, [tasks]);

  const filtered = useMemo(() => {
    return tasks.filter(t => {
      if (status !== "all" && t.status !== status) return false;
      if (agent !== "all" && t.agent_name !== agent) return false;
      if (brandQuery && !(t.brand_id || "").toLowerCase().includes(brandQuery.toLowerCase())) return false;
      return true;
    });
  }, [tasks, status, agent, brandQuery]);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-black tracking-tight flex items-center gap-2">
            <Activity size={18} className="text-foreground" /> Activity Log
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            Every agent task across all brands. Read-only. Showing last {PAGE_SIZE} tasks.
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={refreshing}
          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-border/60 bg-white text-xs font-semibold text-foreground hover:bg-secondary transition-colors disabled:opacity-50"
        >
          <RefreshCw size={11} className={refreshing ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>

      <ActivityFilters
        status={status} onStatusChange={setStatus}
        agent={agent} onAgentChange={setAgent}
        brandQuery={brandQuery} onBrandQueryChange={setBrandQuery}
        agentOptions={agentOptions}
        totalCount={filtered.length}
      />

      {/* List */}
      <div className="rounded-2xl border border-border/60 bg-white overflow-hidden">
        {loading ? (
          <div className="p-10 text-center text-sm text-muted-foreground">Loading activity…</div>
        ) : error ? (
          <div className="p-10 text-center text-sm text-rose-700">{error}</div>
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center">
            <p className="text-sm font-bold text-foreground mb-1">No agent tasks yet</p>
            <p className="text-xs text-muted-foreground">
              {tasks.length === 0
                ? "Once an agent runs, every task will appear here with full input, output, status and errors."
                : "No tasks match the current filters."}
            </p>
          </div>
        ) : (
          <div>
            {filtered.map(t => <AgentTaskRow key={t.id} task={t} />)}
          </div>
        )}
      </div>
    </div>
  );
}