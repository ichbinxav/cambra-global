import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { format } from "date-fns";
import { Plus, Check, Trash2, Circle } from "lucide-react";

const PRIORITY_STYLE = {
  high: "text-red-600 bg-red-500/10 border-red-500/20",
  medium: "text-amber-600 bg-amber-500/10 border-amber-500/20",
  low: "text-muted-foreground bg-secondary border-border/40",
};

export default function AdminTasks() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("open");
  const [form, setForm] = useState({ title: "", priority: "medium", due_date: "", linked_name: "", linked_type: "other", notes: "" });
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);

  const reload = () => base44.entities.Task.list("-created_date", 200).then(setTasks);
  useEffect(() => { reload().then(() => setLoading(false)); }, []);

  const create = async () => {
    if (!form.title.trim()) return;
    setSaving(true);
    await base44.entities.Task.create({ ...form, status: "open" });
    setForm({ title: "", priority: "medium", due_date: "", linked_name: "", linked_type: "other", notes: "" });
    setShowForm(false);
    setSaving(false);
    reload();
  };

  const toggle = async (t) => {
    await base44.entities.Task.update(t.id, { status: t.status === "open" ? "done" : "open" });
    reload();
  };

  const remove = async (id) => {
    await base44.entities.Task.delete(id);
    reload();
  };

  const filtered = tasks.filter(t => filter === "all" || t.status === filter);
  const now = new Date();

  if (loading) return <div className="flex items-center justify-center py-40"><div className="w-6 h-6 rounded-full border-2 border-border border-t-foreground animate-spin" /></div>;

  return (
    <div className="space-y-5 max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black tracking-[-0.03em]">Tasks</h1>
          <p className="text-xs text-muted-foreground/50 mt-0.5">{tasks.filter(t => t.status === "open").length} open</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="h-8 px-4 rounded-lg bg-foreground text-background text-xs font-semibold flex items-center gap-1.5"
        >
          <Plus size={11} /> New Task
        </button>
      </div>

      {showForm && (
        <div className="p-5 rounded-xl border border-border/50 bg-card space-y-3">
          <input
            placeholder="Task title..."
            value={form.title}
            onChange={e => setForm({ ...form, title: e.target.value })}
            className="w-full h-9 px-3 text-sm bg-secondary/60 border border-border/50 rounded-lg focus:outline-none focus:border-foreground/20"
          />
          <div className="grid grid-cols-3 gap-3">
            <select value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value })}
              className="h-9 px-3 text-xs bg-secondary/60 border border-border/50 rounded-lg focus:outline-none">
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
            <input type="date" value={form.due_date} onChange={e => setForm({ ...form, due_date: e.target.value })}
              className="h-9 px-3 text-xs bg-secondary/60 border border-border/50 rounded-lg focus:outline-none" />
            <input placeholder="Linked to..." value={form.linked_name} onChange={e => setForm({ ...form, linked_name: e.target.value })}
              className="h-9 px-3 text-xs bg-secondary/60 border border-border/50 rounded-lg focus:outline-none" />
          </div>
          <textarea placeholder="Notes (optional)" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })}
            className="w-full h-16 px-3 py-2 text-xs bg-secondary/60 border border-border/50 rounded-lg focus:outline-none resize-none" />
          <div className="flex gap-2">
            <button onClick={create} disabled={saving || !form.title.trim()}
              className="h-8 px-4 rounded-lg bg-foreground text-background text-xs font-semibold disabled:opacity-40">
              {saving ? "Saving..." : "Create Task"}
            </button>
            <button onClick={() => setShowForm(false)} className="h-8 px-4 rounded-lg border border-border/50 text-xs text-muted-foreground hover:text-foreground">
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="flex gap-1 p-1 rounded-xl bg-secondary/40 w-fit">
        {[["open", "Open"], ["done", "Done"], ["all", "All"]].map(([v, l]) => (
          <button key={v} onClick={() => setFilter(v)}
            className={`px-4 h-7 rounded-lg text-xs font-semibold transition-all ${filter === v ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
            {l}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        {filtered.length === 0 && <p className="text-sm text-muted-foreground/40 py-8 text-center">No tasks</p>}
        {filtered.map(t => {
          const overdue = t.due_date && t.status === "open" && new Date(t.due_date) < now;
          return (
            <div key={t.id} className={`flex items-center gap-4 p-4 rounded-xl border transition-all ${t.status === "done" ? "opacity-40 bg-secondary/20 border-border/20" : "bg-card border-border/40 hover:border-border/60"}`}>
              <button onClick={() => toggle(t)} className="shrink-0">
                {t.status === "done"
                  ? <Check size={15} className="text-green-600" />
                  : <Circle size={15} className="text-muted-foreground/30" />}
              </button>
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-medium ${t.status === "done" ? "line-through" : ""}`}>{t.title}</p>
                {t.linked_name && <p className="text-[10px] text-muted-foreground/40 mt-0.5">→ {t.linked_name}</p>}
                {t.notes && <p className="text-[10px] text-muted-foreground/40 mt-0.5">{t.notes}</p>}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {t.priority && (
                  <span className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded-full border ${PRIORITY_STYLE[t.priority]}`}>
                    {t.priority}
                  </span>
                )}
                {t.due_date && (
                  <span className={`text-[10px] tabular-nums ${overdue ? "text-red-600 font-bold" : "text-muted-foreground/40"}`}>
                    {overdue ? "Overdue · " : ""}{format(new Date(t.due_date), "dd MMM")}
                  </span>
                )}
                <button onClick={() => remove(t.id)} className="text-muted-foreground/20 hover:text-red-500 transition-colors">
                  <Trash2 size={12} />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}