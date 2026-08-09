import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { CheckCircle2, CircleDot, Ban, Play, RotateCcw } from 'lucide-react';

export default function PaymentsMigrationOperations({ activation, tasks = [], onChanged }){
  const [busy,setBusy] = useState('');
  const [note,setNote] = useState({});
  const rows = [...tasks].sort((a,b)=>(a.order||0)-(b.order||0));
  async function start(){
    setBusy('start');
    const r=await base44.functions.invoke('startPaymentsMigration',{deal_activation_id:activation.id}).catch(e=>({data:{error:e.message}}));
    if(r?.data?.error) toast.error(r.data.error); else toast.success('Migration orchestration ready');
    setBusy(''); await onChanged?.();
  }
  async function move(task,status){
    setBusy(task.id+status);
    const r=await base44.functions.invoke('updatePaymentsMigrationTask',{task_id:task.id,status,note:note[task.id]||''}).catch(e=>({data:{error:e.message}}));
    if(r?.data?.error) toast.error(r.data.error); else toast.success(`${task.step_name} → ${status}`);
    setBusy(''); await onChanged?.();
  }
  return <div className="rounded-xl border p-4 bg-card">
    <div className="flex items-start justify-between gap-3 mb-3">
      <div><p className="text-sm font-semibold">P9 · Payments migration operations</p><p className="text-xs text-muted-foreground mt-1">CAMBRA owns fulfilment. Advance tasks only with operational evidence; go-live and verification are gated.</p></div>
      {!rows.length && <button onClick={start} disabled={!!busy} className="h-8 px-3 rounded-lg bg-foreground text-background text-xs font-bold">Start orchestration</button>}
    </div>
    {rows.length ? <div className="space-y-2">{rows.map(t=><div key={t.id} className="rounded-lg border border-border p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex gap-2 min-w-0">{t.status==='done'?<CheckCircle2 size={15} className="text-emerald-500 shrink-0 mt-0.5"/>:t.status==='blocked'?<Ban size={15} className="text-amber-500 shrink-0 mt-0.5"/>:<CircleDot size={15} className="text-muted-foreground shrink-0 mt-0.5"/>}<div><p className="text-xs font-bold">{t.order}. {t.step_name}</p><p className="text-[11px] text-muted-foreground mt-0.5">{t.description}</p><p className="text-[10px] text-muted-foreground mt-1">{t.status} · owner {t.owner_type || 'admin'}{t.requires_provider_input?' · provider input':''}{t.requires_brand_input?' · merchant input':''}</p>{t.blocked_reason&&<p className="text-[11px] text-amber-600 mt-1">Blocked: {t.blocked_reason}</p>}</div></div>
        <div className="flex gap-1 shrink-0">
          {t.status==='pending'&&<button title="Start" onClick={()=>move(t,'in_progress')} disabled={!!busy} className="p-1.5 rounded border"><Play size={12}/></button>}
          {t.status==='blocked'&&<button title="Retry" onClick={()=>move(t,'in_progress')} disabled={!!busy} className="p-1.5 rounded border"><RotateCcw size={12}/></button>}
          {!['done','canceled'].includes(t.status)&&<button onClick={()=>move(t,'done')} disabled={!!busy} className="h-7 px-2 rounded bg-foreground text-background text-[10px] font-bold">Complete</button>}
        </div>
      </div>
      {!['done','canceled'].includes(t.status)&&<div className="flex gap-2 mt-2 ml-6"><input value={note[t.id]||''} onChange={e=>setNote({...note,[t.id]:e.target.value})} placeholder="Operational note / blocker evidence" className="flex-1 min-w-0 h-7 px-2 rounded border bg-background text-[10px]"/><button onClick={()=>move(t,'blocked')} disabled={!!busy||!(note[t.id]||'').trim()} className="h-7 px-2 rounded border text-[10px]">Block</button></div>}
    </div>)}</div>:<p className="text-xs text-muted-foreground">No P9 migration plan yet.</p>}
  </div>;
}
