import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { CheckCircle2, CircleDot, Ban, Play, RotateCcw } from 'lucide-react';
import { useTranslation } from '@/lib/i18n.jsx';

const COPY = {
  en: { title:'P9 · Payments migration operations', sub:'CAMBRA owns fulfilment. Advance tasks only with operational evidence; go-live and verification are gated.', start:'Start orchestration', ready:'Migration orchestration ready', none:'No P9 migration plan yet.', owner:'owner', provider:'provider input', merchant:'merchant input', blocked:'Blocked', startTask:'Start', retry:'Retry', complete:'Complete', completeOk:'Complete with evidence note', completeNeed:'Add an evidence note before completing', note:'Internal operational note / evidence', block:'Block', merchantRequired:'Merchant action genuinely required', merchantCopy:'Merchant-facing message — all three languages are required', genericError:'The operation could not be completed. Review the state and try again.', en:'English', fr:'Français', es:'Español' },
  fr: { title:'P9 · Opérations de migration des paiements', sub:'CAMBRA prend en charge l’exécution. N’avancez une tâche qu’avec une preuve opérationnelle ; la mise en ligne et la vérification sont verrouillées.', start:'Démarrer l’orchestration', ready:'Orchestration de migration prête', none:'Aucun plan de migration P9 pour le moment.', owner:'responsable', provider:'action prestataire', merchant:'action commerçant', blocked:'Bloqué', startTask:'Démarrer', retry:'Réessayer', complete:'Terminer', completeOk:'Terminer avec une note de preuve', completeNeed:'Ajoutez une note de preuve avant de terminer', note:'Note opérationnelle interne / preuve', block:'Bloquer', merchantRequired:'Action du commerçant réellement indispensable', merchantCopy:'Message destiné au commerçant — les trois langues sont obligatoires', genericError:'L’opération n’a pas pu être effectuée. Vérifiez l’état puis réessayez.', en:'English', fr:'Français', es:'Español' },
  es: { title:'P9 · Operaciones de migración de pagos', sub:'CAMBRA se encarga de la ejecución. Avanza tareas solo con evidencia operativa; el go-live y la verificación están protegidos.', start:'Iniciar orquestación', ready:'Orquestación de migración preparada', none:'Todavía no hay un plan de migración P9.', owner:'responsable', provider:'acción del proveedor', merchant:'acción del comercio', blocked:'Bloqueado', startTask:'Iniciar', retry:'Reintentar', complete:'Completar', completeOk:'Completar con nota de evidencia', completeNeed:'Añade una nota de evidencia antes de completar', note:'Nota operativa interna / evidencia', block:'Bloquear', merchantRequired:'La acción del comercio es realmente imprescindible', merchantCopy:'Mensaje visible para el comercio — los tres idiomas son obligatorios', genericError:'No se pudo completar la operación. Revisa el estado e inténtalo de nuevo.', en:'English', fr:'Français', es:'Español' },
};

export default function PaymentsMigrationOperations({ activation, tasks = [], onChanged }){
  const { lang } = useTranslation();
  const c = COPY[lang] || COPY.en;
  const [busy,setBusy] = useState('');
  const [note,setNote] = useState({});
  const [merchantRequired,setMerchantRequired] = useState({});
  const [merchantCopy,setMerchantCopy] = useState({});
  const p9 = tasks.filter(t => t?.metadata_json?.plan_version === 'payments-recover-p9-v1');
  const rows = [...p9].sort((a,b)=>(a.order||0)-(b.order||0));
  const allMerchantLocales = task => ['en','fr','es'].every(l => (merchantCopy?.[task.id]?.[l] || '').trim().length >= 3);
  const showError = code => toast.error(code === 'merchant_blocker_requires_en_fr_es' ? c.merchantCopy : c.genericError);

  async function start(){
    setBusy('start');
    const r=await base44.functions.invoke('startPaymentsMigration',{deal_activation_id:activation.id}).catch(()=>({data:{error:'request_failed'}}));
    if(r?.data?.error) showError(r.data.error); else toast.success(c.ready);
    setBusy(''); await onChanged?.();
  }
  async function move(task,status){
    setBusy(task.id+status);
    const requiresMerchant = merchantRequired[task.id] === true;
    const r=await base44.functions.invoke('updatePaymentsMigrationTask',{
      task_id:task.id,
      status,
      note:note[task.id]||'',
      merchant_required:requiresMerchant,
      merchant_message_i18n: requiresMerchant ? merchantCopy[task.id] : undefined,
    }).catch(()=>({data:{error:'request_failed'}}));
    if(r?.data?.error) showError(r.data.error); else toast.success(`${task.step_name} → ${status}`);
    setBusy(''); await onChanged?.();
  }
  return <div className="rounded-xl border p-4 bg-card">
    <div className="flex items-start justify-between gap-3 mb-3">
      <div><p className="text-sm font-semibold">{c.title}</p><p className="text-xs text-muted-foreground mt-1">{c.sub}</p></div>
      {!rows.length && <button onClick={start} disabled={!!busy} className="h-8 px-3 rounded-lg bg-foreground text-background text-xs font-bold disabled:opacity-50">{c.start}</button>}
    </div>
    {rows.length ? <div className="space-y-2">{rows.map(t=>{
      const merchantNeeded = merchantRequired[t.id] === true;
      return <div key={t.id} className="rounded-lg border border-border p-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex gap-2 min-w-0">{t.status==='done'?<CheckCircle2 size={15} className="text-emerald-500 shrink-0 mt-0.5"/>:t.status==='blocked'?<Ban size={15} className="text-amber-500 shrink-0 mt-0.5"/>:<CircleDot size={15} className="text-muted-foreground shrink-0 mt-0.5"/>}<div><p className="text-xs font-bold">{t.order}. {t.step_name}</p><p className="text-[11px] text-muted-foreground mt-0.5">{t.description}</p><p className="text-[10px] text-muted-foreground mt-1">{t.status} · {c.owner} {t.owner_type || 'admin'}{t.requires_provider_input?` · ${c.provider}`:''}{t.requires_brand_input?` · ${c.merchant}`:''}{t.due_date?` · SLA ${t.due_date}`:''}</p>{t.blocked_reason&&<p className="text-[11px] text-amber-600 mt-1">{c.blocked}: {t.blocked_reason}</p>}</div></div>
          <div className="flex gap-1 shrink-0">
            {t.status==='pending'&&<button title={c.startTask} onClick={()=>move(t,'in_progress')} disabled={!!busy} className="p-1.5 rounded border disabled:opacity-50"><Play size={12}/></button>}
            {t.status==='blocked'&&<button title={c.retry} onClick={()=>move(t,'in_progress')} disabled={!!busy} className="p-1.5 rounded border disabled:opacity-50"><RotateCcw size={12}/></button>}
            {!['done','canceled'].includes(t.status)&&<button onClick={()=>move(t,'done')} disabled={!!busy||!(note[t.id]||'').trim()} title={(note[t.id]||'').trim()?c.completeOk:c.completeNeed} className="h-7 px-2 rounded bg-foreground text-background text-[10px] font-bold disabled:opacity-50">{c.complete}</button>}
          </div>
        </div>
        {!['done','canceled'].includes(t.status)&&<div className="mt-2 ml-6 space-y-2">
          <div className="flex gap-2"><input value={note[t.id]||''} onChange={e=>setNote({...note,[t.id]:e.target.value})} placeholder={c.note} className="flex-1 min-w-0 h-8 px-2 rounded border bg-background text-[10px]"/><button onClick={()=>move(t,'blocked')} disabled={!!busy||!(note[t.id]||'').trim()||(merchantNeeded&&!allMerchantLocales(t))} className="h-8 px-2 rounded border text-[10px] disabled:opacity-50">{c.block}</button></div>
          <label className="flex items-center gap-1.5 text-[10px] text-muted-foreground"><input type="checkbox" checked={merchantNeeded} onChange={e=>setMerchantRequired({...merchantRequired,[t.id]:e.target.checked})}/> {c.merchantRequired}</label>
          {merchantNeeded && <div className="rounded-lg border border-border/80 p-2 space-y-1.5"><p className="text-[10px] font-semibold text-muted-foreground">{c.merchantCopy}</p>{['en','fr','es'].map(l=><label key={l} className="grid grid-cols-[58px_1fr] items-center gap-2 text-[10px]"><span className="text-muted-foreground">{c[l]}</span><input value={merchantCopy?.[t.id]?.[l]||''} onChange={e=>setMerchantCopy({...merchantCopy,[t.id]:{...(merchantCopy[t.id]||{}),[l]:e.target.value}})} className="h-8 px-2 rounded border bg-background" /></label>)}</div>}
        </div>}
      </div>;
    })}</div>:<p className="text-xs text-muted-foreground">{c.none}</p>}
  </div>;
}
