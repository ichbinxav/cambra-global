import React, { useEffect, useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { CheckCircle2, Clock } from 'lucide-react';
import { toast } from 'sonner';

export default function MigrationHub() {
  const dealId = window.location.pathname.split('/').pop();
  const [deal, setDeal] = useState(null);
  const [tasks, setTasks] = useState([]);

  useEffect(() => {
    (async () => {
      const d = await base44.entities.DealActivation.filter({ id: dealId });
      setDeal(d[0] || null);
      // Canonical first, legacy fallback
      let t = await base44.entities.MigrationTask.filter({ deal_activation_id: dealId });
      if (!t?.length) t = await base44.entities.MigrationTask.filter({ deal_id: dealId });
      setTasks(t.sort((a,b) => (a.order||0)-(b.order||0)));
    })();
  }, [dealId]);

  const progress = useMemo(() => {
    if (!tasks.length) return 0;
    const done = tasks.filter(t => t.status === 'done').length;
    return Math.round((done / tasks.length) * 100);
  }, [tasks]);

  const [blockOpen, setBlockOpen] = useState(false);
  const [blockTask, setBlockTask] = useState(null);
  const [blockReason, setBlockReason] = useState('');
  const toggle = async (task, next) => {
    if (next === 'blocked') { setBlockTask(task); setBlockOpen(true); return; }
    const resp = await base44.functions.invoke('updateMigrationTaskStatus', { taskId: task.id, nextStatus: next });
    if (resp?.data?.error) { toast.error(resp.data.error); return; }
    const updated = resp?.data?.task;
    if (updated) setTasks(prev => prev.map(t => t.id === task.id ? updated : t));
  };
  const submitBlock = async () => {
    if (!blockTask) return;
    const resp = await base44.functions.invoke('updateMigrationTaskStatus', { taskId: blockTask.id, nextStatus: 'blocked', blocked_reason: blockReason || undefined });
    setBlockOpen(false); setBlockTask(null); setBlockReason('');
    if (resp?.data?.error) { toast.error(resp.data.error); return; }
    const updated = resp?.data?.task;
    if (updated) setTasks(prev => prev.map(t => t.id === updated.id ? updated : t));
  };

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-4">
      <h1 className="text-2xl font-black">Migration Hub</h1>
      {deal && (
        <div className="rounded-xl border p-4 bg-card text-sm flex items-center justify-between">
          <div>
            <p className="font-semibold">Deal — {deal.vertical}</p>
            <p className="text-muted-foreground/60">Status: {deal.status}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Progress</p>
            <p className="font-black">{progress}%</p>
          </div>
        </div>
      )}
      <div className="rounded-xl border p-4 bg-card">
        <ul className="space-y-2">
          {tasks.map(t => (
            <li key={t.id} className="flex items-center justify-between border rounded-lg px-3 py-2">
              <div className="flex items-center gap-2">
                {t.status === 'done' ? <CheckCircle2 className="text-green-600 w-4 h-4"/> : <Clock className="text-muted-foreground w-4 h-4"/>}
                <span className="text-sm font-medium">{t.step_name.replaceAll('_',' ')}{t.requires_provider_input ? ' · provider' : ''}{t.requires_brand_input ? ' · brand' : ''}{t.requires_admin_review ? ' · admin review' : ''}</span>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <button onClick={() => toggle(t, 'pending')} className={`px-2 py-1 rounded border ${t.status==='pending'?'bg-secondary':''}`}>Pending</button>
                <button onClick={() => toggle(t, 'in_progress')} className={`px-2 py-1 rounded border ${t.status==='in_progress'?'bg-secondary':''}`}>In progress</button>
                <button onClick={() => toggle(t, 'blocked')} className={`px-2 py-1 rounded border ${t.status==='blocked'?'bg-orange-500/10 text-orange-700':''}`}>Blocked</button>
                <button onClick={() => toggle(t, 'canceled')} className={`px-2 py-1 rounded border ${t.status==='canceled'?'bg-muted':''}`}>Canceled</button>
                <button onClick={() => toggle(t, 'done')} className={`px-2 py-1 rounded border ${t.status==='done'?'bg-green-500/10 text-green-700':''}`}>Done</button>
              </div>
            </li>
          ))}
        </ul>
      </div>
      {/* Block modal */}
      {blockOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-background/75 backdrop-blur" onClick={()=>setBlockOpen(false)} />
          <div className="relative w-full max-w-md rounded-2xl border border-border bg-card p-5 space-y-3">
            <p className="text-sm font-bold">Set blocked reason</p>
            <textarea value={blockReason} onChange={e=>setBlockReason(e.target.value)} rows={4}
              className="w-full text-sm bg-background border border-border rounded-lg p-2" placeholder="Optional reason" />
            <div className="flex justify-end gap-2">
              <button onClick={()=>setBlockOpen(false)} className="h-8 px-3 rounded-md border border-border text-xs">Cancel</button>
              <button onClick={submitBlock} className="h-8 px-3 rounded-md bg-foreground text-background text-xs font-bold">Confirm</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}