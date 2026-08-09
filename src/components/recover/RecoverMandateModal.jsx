// Recover acceptance shell. Contractual wording still comes from the backend
// (same copy used by the PDF); only interface copy lives in recoverUiCopy.
import { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { X, ShieldCheck, Loader2, AlertTriangle } from "lucide-react";
import { useLanguage } from "@/lib/i18n.jsx";
import MandateTermsSummary from "./MandateTermsSummary";
import MandateLimitsBlock from "./MandateLimitsBlock";
import { recoverUiCopy } from "./recoverUiCopy";

export default function RecoverMandateModal({ context, onClose, onAccepted }) {
  const { lang } = useLanguage();
  const c = recoverUiCopy(lang).modal;
  const [mandateId, setMandateId] = useState(null);
  const [startedSnapshot, setStartedSnapshot] = useState(null);
  const [evidencePreview, setEvidencePreview] = useState(null);
  const [starting, setStarting] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [evidenceAgreed, setEvidenceAgreed] = useState(false);
  const [agreed, setAgreed] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await base44.functions.invoke("startRecoverAcceptance", { deal_activation_id: context.deal_activation_id });
        if (!alive) return;
        if (r?.data?.error || !r?.data?.mandate_id) {
          setError(c.genericError);
          return;
        }
        setMandateId(r.data.mandate_id);
        setStartedSnapshot(r.data.acceptance_snapshot || null);
        setEvidencePreview(r.data.evidence_preview || null);
      } catch {
        if (alive) setError(c.genericError);
      } finally {
        if (alive) setStarting(false);
      }
    })();
    return () => { alive = false; };
  }, [context.deal_activation_id, c.genericError]);

  const submit = async () => {
    if (!mandateId || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const r = await base44.functions.invoke("acceptRecoverMandate", {
        mandate_id: mandateId,
        signed_by_name: name.trim(),
        signed_by_role: role.trim(),
        evidence_attestation_accepted: true,
        accepted: true,
      });
      const code = r?.data?.error;
      if (code) {
        setError(code === "terms_changed" ? c.changed : c.genericError);
        return;
      }
      onAccepted(r?.data);
    } catch (e) {
      const code = e?.response?.data?.error;
      setError(code === "terms_changed" ? c.changed : c.genericError);
    } finally {
      setSubmitting(false);
    }
  };

  const canSubmit = !!mandateId && evidenceAgreed && agreed && name.trim().length >= 2 && !submitting;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="recover-title">
      <div className="cambra-card w-full max-w-lg max-h-[90vh] overflow-y-auto p-7">
        <div className="relative">
          <button onClick={onClose} className="absolute right-0 top-0 text-white/50 hover:text-white transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white" aria-label={c.close}>
            <X size={18} />
          </button>

          <p className="cc-eyebrow mb-1">{c.eyebrow}</p>
          <h3 id="recover-title" className="text-xl font-black text-white tracking-tight mb-1">{c.title}</h3>
          <p className="text-[12.5px] text-white/60 mb-5">{c.intro}</p>

          {starting ? (
            <div className="flex items-center gap-2 py-10 justify-center text-white/60 text-sm" role="status">
              <Loader2 size={16} className="animate-spin" /> {c.preparing}
            </div>
          ) : (
            <>
              <MandateTermsSummary snapshot={startedSnapshot || context.snapshot} baseline={context.baseline} copy={context.mandate_copy?.summary} />

              {evidencePreview?.current_rate_pct != null && (
                <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.04] p-4">
                  <p className="text-xs text-white/55 mb-1.5">{c.evidence}</p>
                  <p className="text-base font-black text-white tabular-nums">{Number(evidencePreview.current_rate_pct).toFixed(2)}%</p>
                  {(evidencePreview.period_start || evidencePreview.period_end) && (
                    <p className="text-[11px] text-white/45 font-mono mt-1">{evidencePreview.period_start || "—"} → {evidencePreview.period_end || "—"}</p>
                  )}
                </div>
              )}

              <MandateLimitsBlock copy={context.mandate_copy} />

              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="text-xs text-white/55">{c.name}</span>
                  <input value={name} onChange={(e) => setName(e.target.value)} placeholder={c.namePlaceholder} autoComplete="name" className="mt-1.5 w-full rounded-lg border border-white/12 bg-white/[0.05] px-3 py-2 text-sm text-white placeholder:text-white/30 outline-none focus:border-white/25 focus-visible:ring-2 focus-visible:ring-white/25" />
                </label>
                <label className="block">
                  <span className="text-xs text-white/55">{c.role}</span>
                  <input value={role} onChange={(e) => setRole(e.target.value)} placeholder={c.rolePlaceholder} className="mt-1.5 w-full rounded-lg border border-white/12 bg-white/[0.05] px-3 py-2 text-sm text-white placeholder:text-white/30 outline-none focus:border-white/25 focus-visible:ring-2 focus-visible:ring-white/25" />
                </label>
              </div>

              <label className="mt-4 flex items-start gap-2.5 cursor-pointer">
                <input type="checkbox" checked={evidenceAgreed} onChange={(e) => setEvidenceAgreed(e.target.checked)} className="mt-0.5" />
                <span className="text-[12.5px] text-white/70 leading-relaxed">{context.evidence_attestation?.text || c.evidenceFallback}</span>
              </label>

              <label className="mt-3 flex items-start gap-2.5 cursor-pointer">
                <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-0.5" />
                <span className="text-[12.5px] text-white/70 leading-relaxed">{context.mandate_copy?.checkbox || c.legalFallback(context.legal_entity_name)}</span>
              </label>

              {error && (
                <div className="mt-4 flex items-start gap-2 rounded-lg border border-[#F45B69]/30 bg-[#F45B69]/10 p-3 text-[12.5px] text-white/85" role="alert">
                  <AlertTriangle size={15} className="shrink-0 mt-0.5" /> {error}
                </div>
              )}

              <button type="button" onClick={submit} disabled={!canSubmit} className="mt-5 w-full rounded-full h-11 text-sm font-bold bg-white text-[#06080F] hover:bg-white/90 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
                {submitting ? <Loader2 size={15} className="animate-spin" /> : <ShieldCheck size={15} />}
                {submitting ? c.recording : c.accept}
              </button>
              <p className="mt-2.5 text-[11px] text-white/40 text-center font-mono">{c.signedAs(context.owner_email_display, context.document_version)}</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
