import { useCallback, useEffect, useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Check, Circle, Loader2, ShieldCheck, AlertCircle } from 'lucide-react';
import { useTranslation } from '@/lib/i18n.jsx';

const COPY = {
  en: {
    eyebrow:'Payments migration', title:'Your migration, step by step.',
    sub:'CAMBRA coordinates the provider, configuration, go-live and verification. You will see each step here as it happens, and we will tell you before we contact any provider on your behalf.',
    savings:'Expected annual savings', needs:'We need something from you', needsSub:'This is required before the migration can move to the next step. We will keep you updated on everything else.',
    stages:{ preparing:'Preparing', provider_coordination:'Provider coordination', scheduled:'Migration scheduled', going_live:'Going live', verifying:'Verifying savings', completed:'Completed' },
    complete:'Your migration is complete. CAMBRA has verified the first realized savings against your baseline and will keep measuring them for billing.',
    blockerTitles:{ takeover:'Migration setup', provider_coordination:'Provider coordination', provider_ready:'Provider setup', technical_configuration:'Payment configuration', migration_testing:'Migration testing', cutover_ready:'Go-live preparation', go_live:'Going live', verify_savings:'Savings verification' },
  },
  es: {
    eyebrow:'Migración de pagos', title:'Tu migración, paso a paso.',
    sub:'CAMBRA coordina el proveedor, la configuración, el go-live y la verificación. Verás aquí cada paso según ocurra, y te avisaremos antes de contactar con ningún proveedor en tu nombre.',
    savings:'Ahorro anual esperado', needs:'Necesitamos algo de ti', needsSub:'Es imprescindible para pasar al siguiente paso. Te mantendremos informado de todo lo demás.',
    stages:{ preparing:'Preparando', provider_coordination:'Coordinando proveedor', scheduled:'Migración programada', going_live:'Activando', verifying:'Verificando ahorro', completed:'Completado' },
    complete:'La migración está completada. CAMBRA ya ha verificado el primer ahorro real frente a tu baseline y seguirá midiéndolo para la facturación.',
    blockerTitles:{ takeover:'Preparación de la migración', provider_coordination:'Coordinación con el proveedor', provider_ready:'Alta con el proveedor', technical_configuration:'Configuración de pagos', migration_testing:'Pruebas de migración', cutover_ready:'Preparación del go-live', go_live:'Activación', verify_savings:'Verificación del ahorro' },
  },
  fr: {
    eyebrow:'Migration des paiements', title:'Votre migration, étape par étape.',
    sub:"CAMBRA coordonne le prestataire, la configuration, la mise en ligne et la vérification. Vous verrez ici chaque étape au fur et à mesure, et nous vous préviendrons avant de contacter tout prestataire en votre nom.",
    savings:'Économies annuelles attendues', needs:'Nous avons besoin de vous', needsSub:'Cette action est indispensable pour passer à l’étape suivante. Nous vous tiendrons informé de tout le reste.',
    stages:{ preparing:'Préparation', provider_coordination:'Coordination prestataire', scheduled:'Migration planifiée', going_live:'Mise en ligne', verifying:'Vérification des économies', completed:'Terminé' },
    complete:'La migration est terminée. CAMBRA a vérifié les premières économies réelles par rapport à votre référence et continuera à les mesurer pour la facturation.',
    blockerTitles:{ takeover:'Préparation de la migration', provider_coordination:'Coordination prestataire', provider_ready:'Configuration prestataire', technical_configuration:'Configuration des paiements', migration_testing:'Tests de migration', cutover_ready:'Préparation de la mise en ligne', go_live:'Mise en ligne', verify_savings:'Vérification des économies' },
  },
};
// AUDIT I18N-01 (2026-08-17, founder-authorised): the other 20 UI locales fall through
// to English by design (UI copy, not a legal record). Translators override per locale.
for (const code of ['de','it','pl','pt','el','sv','da','fi','cs','ro','hu','bg','hr','et','lv','lt','sk','sl','nb','is']) {
  COPY[code] = COPY.en;
}
const ORDER = ['preparing','provider_coordination','scheduled','going_live','verifying','completed'];

export default function PaymentsMigrationCard(){
  const { lang } = useTranslation();
  const c = COPY[lang] || COPY.en;
  const [migration,setMigration] = useState(null);
  const [loading,setLoading] = useState(true);

  const load = useCallback(async()=>{
    const r = await base44.functions.invoke('getMyPaymentsMigration', {}).catch(()=>null);
    setMigration(r?.data?.migration || null); setLoading(false);
  },[]);
  useEffect(()=>{ load(); },[load]);
  const current = Math.max(0, ORDER.indexOf(migration?.stage || 'preparing'));
  const money = useMemo(()=>new Intl.NumberFormat(lang === 'fr' ? 'fr-FR' : lang === 'es' ? 'es-ES' : 'en-GB',{style:'currency',currency:'EUR',maximumFractionDigits:0}),[lang]);
  if (loading || !migration) return null;

  return <section className="cambra-card p-7 mb-6 overflow-hidden relative">
    <div className="absolute inset-0 pointer-events-none" style={{background:'radial-gradient(70% 120% at 100% 0%, rgba(57,198,240,.10), transparent 60%)'}} />
    <div className="relative">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-5 mb-7">
        <div className="max-w-2xl">
          <p className="cc-eyebrow mb-1">{c.eyebrow}</p>
          <h3 className="text-xl sm:text-2xl font-black tracking-tight text-white">{c.title}</h3>
          <p className="text-[12.5px] text-white/55 leading-relaxed mt-2 max-w-xl">{c.sub}</p>
        </div>
        {migration.projected_savings_annual > 0 && <div className="shrink-0 rounded-xl border border-white/10 bg-white/[.035] px-4 py-3">
          <p className="text-[9px] uppercase tracking-[.16em] font-bold text-white/40">{c.savings}</p>
          <p className="text-lg font-black text-white mt-0.5">{money.format(migration.projected_savings_annual)}</p>
        </div>}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-6 gap-2 mb-6">
        {ORDER.map((s,i)=>{
          const done = i < current || migration.stage === 'completed'; const active = i === current && migration.stage !== 'completed';
          return <div key={s} className={`rounded-xl border px-3 py-3 min-h-[82px] ${active?'border-cambra-cyan/40 bg-cambra-cyan/[.07]':'border-white/[.08] bg-white/[.025]'}`}>
            <div className="mb-2">{done?<Check size={14} className="text-emerald-400"/>:active?<Loader2 size={14} className="text-cambra-cyan animate-spin"/>:<Circle size={12} className="text-white/20"/>}</div>
            <p className={`text-[10.5px] leading-tight font-bold ${active?'text-white':'text-white/55'}`}>{c.stages[s]}</p>
          </div>;
        })}
      </div>

      {migration.needs_you ? <div className="rounded-xl border border-amber-400/25 bg-amber-400/[.07] p-4 flex gap-3">
        <AlertCircle size={17} className="text-amber-300 shrink-0 mt-0.5" />
        <div><p className="text-xs font-bold text-white">{c.needs}</p><p className="text-[11px] text-white/55 mt-0.5">{c.needsSub}</p>
          {migration.merchant_blockers.map(b=>{ const reason=b?.reason_i18n?.[lang] || b?.reason_i18n?.en || ''; const title=c.blockerTitles[b.step_key] || c.needs; return <p key={b.id} className="text-[11px] text-white/75 mt-2">• {title}{reason ? ` — ${reason}` : ''}</p>; })}
        </div>
      </div> : migration.stage === 'completed' ? <div className="flex gap-2.5 items-start text-[12px] text-white/65"><ShieldCheck size={16} className="text-emerald-400 shrink-0"/><span>{c.complete}</span></div> : null}
    </div>
  </section>;
}
