import { useEffect, useState } from "react";
import { AlertCircle, Check, Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";

const UI = {
  en: { eyebrow:"CAMBRA needs one thing", send:"Continue", unknown:"I don’t know", placeholder:"Enter the information here", done:"Thanks — CAMBRA is continuing automatically.", error:"We couldn’t validate that yet. Check the information and try again." },
  fr: { eyebrow:"CAMBRA a besoin d’un élément", send:"Continuer", unknown:"Je ne sais pas", placeholder:"Saisissez l’information ici", done:"Merci — CAMBRA reprend automatiquement.", error:"Nous n’avons pas encore pu valider cette information. Vérifiez-la puis réessayez." },
  es: { eyebrow:"CAMBRA necesita una cosa", send:"Continuar", unknown:"No lo sé", placeholder:"Introduce la información aquí", done:"Gracias — CAMBRA continúa automáticamente.", error:"Aún no hemos podido validar esa información. Revísala e inténtalo de nuevo." },
};

export default function MerchantInformationTasks({ lang = "en" }) {
  const locale = UI[lang] ? lang : "en", t = UI[locale];
  const [items,setItems]=useState([]),[values,setValues]=useState({}),[busy,setBusy]=useState(null),[notice,setNotice]=useState(null);
  const load=async()=>{try{const r=await base44.functions.invoke("getMyInformationRequests",{});const d=r?.data||r;setItems((d?.requests||[]).filter(x=>["merchant_input_required","validation_required","unresolvable"].includes(x.state)))}catch{setItems([])}};
  useEffect(()=>{load()},[]);
  const answer=async(item,type)=>{setBusy(item.id);setNotice(null);try{const text=String(values[item.id]||"").trim();const r=await base44.functions.invoke("respondMerchantInformationRequest",{request_id:item.id,answer_type:type,answer_text:type==="dont_know"?"":text});const d=r?.data||r;if(d?.ok===false)throw new Error(d.error||"validation_failed");setNotice({id:item.id,ok:true});await load()}catch{setNotice({id:item.id,ok:false})}finally{setBusy(null)}};
  if(!items.length)return null;
  return <div className="space-y-3" data-testid="merchant-information-tasks">{items.map(item=><div key={item.id} className="rounded-2xl p-5" style={{background:"rgba(250,204,21,.045)",border:"1px solid rgba(250,204,21,.20)"}}>
    <div className="flex gap-3 items-start"><div className="h-9 w-9 rounded-xl flex items-center justify-center shrink-0" style={{background:"rgba(250,204,21,.08)",border:"1px solid rgba(250,204,21,.18)"}}><AlertCircle size={16} className="text-yellow-200"/></div><div className="min-w-0 flex-1">
      <p className="text-[10px] uppercase tracking-[.18em] font-bold text-yellow-100/65 mb-1">{t.eyebrow}</p><h3 className="text-white font-bold text-sm">{item.what_needed}</h3><p className="text-xs text-white/60 mt-1 leading-relaxed">{item.why_needed}</p><p className="text-xs text-white/80 mt-3 leading-relaxed">{item.merchant_action}</p><p className="text-[11px] text-white/40 mt-1">{item.estimated_effort} · {item.what_happens_next}</p>
      <div className="flex flex-col sm:flex-row gap-2 mt-4"><input value={values[item.id]||""} onChange={e=>setValues(v=>({...v,[item.id]:e.target.value}))} placeholder={t.placeholder} className="flex-1 h-10 rounded-xl px-3 bg-black/20 border border-white/10 text-sm text-white outline-none focus:border-white/30"/><button onClick={()=>answer(item,item.information_type==="provider_contact"?"email":"text")} disabled={busy===item.id||!String(values[item.id]||"").trim()} className="h-10 px-4 rounded-xl bg-white text-black text-xs font-bold disabled:opacity-40">{busy===item.id?<Loader2 size={14} className="animate-spin"/>:t.send}</button><button onClick={()=>answer(item,"dont_know")} disabled={busy===item.id} className="h-10 px-4 rounded-xl border border-white/10 text-white/65 text-xs font-semibold hover:text-white">{t.unknown}</button></div>
      {notice?.id===item.id&&<p className={`text-xs mt-3 ${notice.ok?"text-emerald-300":"text-red-300"}`}>{notice.ok?<><Check size={12} className="inline mr-1"/>{t.done}</>:t.error}</p>}
    </div></div>
  </div>)}</div>;
}
