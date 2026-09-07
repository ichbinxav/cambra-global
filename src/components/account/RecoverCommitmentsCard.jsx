import { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useTranslation } from '@/lib/i18n.jsx';
import { ShieldCheck, AlertTriangle } from 'lucide-react';
const COPY={
 en:{title:'CAMBRA service & active Recoveries',active:'Service active',cancelled:'Service cancelled',sub:'Cancelling the general service stops new Recoveries. An already activated Recover keeps its own economic term until the date shown, only on positive Verified Savings.',term:'Recovery Term ends',fee:'Current CAMBRA fee',verify:'Verification access',cancel:'Cancel CAMBRA service',confirm:'I understand that cancelling CAMBRA does not by itself end an already activated Recovery Term.',reason:'Reason (optional)',go:'Confirm service cancellation',warning:'This is not a cancellation fee. Any surviving Recover fee remains based only on positive savings that CAMBRA can verify.',none:'No active Recover commitments.',error:'We could not load or record service cancellation safely.'},
 fr:{title:'Service CAMBRA et Recover actifs',active:'Service actif',cancelled:'Service résilié',sub:'La résiliation du service général bloque les nouveaux Recover. Un Recover déjà activé conserve sa propre durée économique jusqu’à la date indiquée, uniquement sur les économies vérifiées positives.',term:'Fin de la période Recover',fee:'Commission CAMBRA actuelle',verify:'Accès de vérification',cancel:'Résilier le service CAMBRA',confirm:'Je comprends que la résiliation de CAMBRA ne met pas, à elle seule, fin à une période Recover déjà activée.',reason:'Motif (facultatif)',go:'Confirmer la résiliation du service',warning:'Il ne s’agit pas de frais de résiliation. Toute commission Recover survivante reste calculée uniquement sur les économies positives que CAMBRA peut vérifier.',none:'Aucun engagement Recover actif.',error:'Impossible de charger ou enregistrer la résiliation de manière sûre.'},
 es:{title:'Servicio CAMBRA y Recoveries activos',active:'Servicio activo',cancelled:'Servicio cancelado',sub:'Cancelar el servicio general impide nuevos Recoveries. Un Recover ya activado mantiene su propio término económico hasta la fecha indicada, únicamente sobre ahorro positivo verificado.',term:'Fin del Recovery Term',fee:'Comisión CAMBRA actual',verify:'Acceso de verificación',cancel:'Cancelar servicio CAMBRA',confirm:'Entiendo que cancelar CAMBRA no extingue por sí solo un Recovery Term ya activado.',reason:'Motivo (opcional)',go:'Confirmar cancelación del servicio',warning:'No es una penalización por cancelación. Cualquier comisión Recover que sobreviva sigue calculándose solo sobre ahorro positivo que CAMBRA pueda verificar.',none:'No hay compromisos Recover activos.',error:'No hemos podido cargar o registrar la cancelación de forma segura.'}
};
// AUDIT I18N-01 (2026-08-17, founder-authorised): other 20 UI locales fall through to EN.
for (const code of ['de','it','pl','pt','el','sv','da','fi','cs','ro','hu','bg','hr','et','lv','lt','sk','sl','nb','is']) {
  COPY[code] = COPY.en;
}
export default function RecoverCommitmentsCard() {
  const { lang } = useTranslation();
  const c = COPY[lang] || COPY.en;
  const [state, setState] = useState(null);
  const [ack, setAck] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [manageOpen, setManageOpen] = useState(false);

  const load = () => base44.functions
    .invoke('getMyRecoveryCommitments', {})
    .then((response) => setState(response?.data || null))
    .catch(() => setError(c.error));

  useEffect(() => { load(); }, []);
  if (!state?.exists) return null;

  const cancel = async () => {
    if (!ack || busy) return;
    setBusy(true);
    setError('');
    try {
      const response = await base44.functions.invoke('cancelCambraService', {
        confirm: true,
        recovery_terms_acknowledged: true,
        reason,
      });
      if (response?.data?.error) throw new Error('service_cancellation_failed');
      await load();
      setManageOpen(false);
    } catch {
      setError(c.error);
    } finally {
      setBusy(false);
    }
  };

  const cancelled = state.brand?.service_status === 'cancelled';
  const recoveries = state.recoveries || [];

  return (
    <section className="cambra-paper-card p-6 sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-5">
        <div className="max-w-2xl">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[#EFEDFF] text-[#4D3DF1]"><ShieldCheck size={18} /></span>
            <div>
              <p className="text-[17px] font-bold tracking-[-.025em] text-[#11182D]">{c.title}</p>
              <span className={`mt-1 inline-flex rounded-full px-2.5 py-1 text-[9px] font-bold uppercase tracking-[.1em] ${cancelled ? 'bg-[#F3F4F7] text-[#6D7588]' : 'bg-[#E5F8EE] text-[#168552]'}`}>{cancelled ? c.cancelled : c.active}</span>
            </div>
          </div>
          <p className="mt-5 text-[12px] leading-relaxed text-[#68718A]">{c.sub}</p>
        </div>
        {!cancelled && (
          <button type="button" onClick={() => setManageOpen(true)} className="inline-flex min-h-10 items-center rounded-xl border border-[#D8DCE8] bg-white px-4 text-[11px] font-bold text-[#26304A]">{c.cancel}</button>
        )}
      </div>

      <div className="mt-6 grid gap-3">
        {recoveries.length ? recoveries.map((recovery) => (
          <article key={recovery.id} className="rounded-2xl border border-[#E2E5ED] bg-[#FAFAFC] p-4">
            <div className="flex justify-between gap-3">
              <div><p className="text-xs font-bold text-[#131B33]">{recovery.name}</p><p className="mt-1 text-[10px] text-[#7B8397]">{recovery.economic_right_status || recovery.status}</p></div>
              {recovery.current_fee_pct != null && <p className="text-sm font-black text-[#4D3DF1]">{recovery.current_fee_pct}%</p>}
            </div>
            {recovery.recovery_term_end_date && <p className="mt-2 text-[11px] text-[#566079]">{c.term}: <b>{recovery.recovery_term_end_date}</b></p>}
            <p className="mt-1 text-[11px] text-[#7B8397]">{c.verify}: {recovery.verification_access_status || '—'}</p>
          </article>
        )) : <p className="rounded-xl border border-[#E4E6ED] bg-[#F9F9FC] px-4 py-4 text-xs text-[#68718A]">{c.none}</p>}
      </div>

      {error && <p role="alert" className="mt-3 text-xs font-semibold text-red-600">{error}</p>}

      {manageOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-[#071022]/55 p-5 backdrop-blur-sm" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setManageOpen(false); }}>
          <div role="dialog" aria-modal="true" aria-labelledby="manage-cambra-service-title" className="w-full max-w-xl rounded-[24px] border border-[#E0E3EB] bg-white p-6 shadow-[0_32px_100px_-40px_rgba(7,16,34,.8)] sm:p-8">
            <div className="flex items-start gap-3">
              <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#FFF2E7] text-[#C56A1A]"><AlertTriangle size={18} /></span>
              <div><h2 id="manage-cambra-service-title" className="text-[20px] font-bold tracking-[-.03em] text-[#11182D]">{c.cancel}</h2><p className="mt-2 text-[12px] leading-relaxed text-[#68718A]">{c.warning}</p></div>
            </div>
            <label className="mt-6 flex items-start gap-3 rounded-xl border border-[#E3E5ED] bg-[#FAFAFC] p-4 text-[11.5px] leading-relaxed text-[#4E5870]"><input type="checkbox" checked={ack} onChange={(event) => setAck(event.target.checked)} className="mt-0.5" /><span>{c.confirm}</span></label>
            <label className="mt-5 block text-[11px] font-bold text-[#303A55]">{c.reason}<input value={reason} onChange={(event) => setReason(event.target.value)} className="mt-2 h-11 w-full rounded-xl border border-[#DCE0EA] bg-white px-3 text-xs text-[#11182D] outline-none focus:border-[#7567F8]" /></label>
            <div className="mt-6 flex flex-wrap justify-end gap-3">
              <button type="button" onClick={() => setManageOpen(false)} className="min-h-11 rounded-xl px-5 text-[11px] font-bold text-[#5F6880]">×</button>
              <button type="button" onClick={cancel} disabled={!ack || busy} className="min-h-11 rounded-xl bg-[#10182E] px-5 text-[11px] font-bold text-white disabled:opacity-40">{busy ? '…' : c.go}</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
