// RecoverMandateModal — RECOVER-1 (2026-08-03).
//
// The acceptance popup. Two server calls, in this order:
//   1. startRecoverAcceptance on open  → creates the Mandate in 'acceptance_started'
//      and returns the terms hash the signature will be checked against.
//   2. acceptRecoverMandate on submit  → records the signature and authorizes.
//
// If the fee or the baseline moved while this modal was open, the server refuses
// with `terms_changed` (409). We do NOT retry silently: the merchant is told the
// terms changed and the popup reloads them, because re-signing stale terms is
// exactly the bug the hash exists to prevent.
//
// Copy is English-only for now — the mandate text is legal wording and is on the
// open legal-review list (see Decision_Log_RECOVER1.md), so it is deliberately
// NOT machine-translated into FR/ES yet.

import { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { X, ShieldCheck, Loader2, AlertTriangle } from "lucide-react";
import MandateTermsSummary from "./MandateTermsSummary";

const errText = (e) => e?.response?.data?.error || e?.message || "Something went wrong";

export default function RecoverMandateModal({ context, onClose, onAccepted }) {
  const [mandateId, setMandateId] = useState(null);
  const [starting, setStarting] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [agreed, setAgreed] = useState(false);

  useEffect(() => {
    let alive = true;
    base44.functions
      .invoke("startRecoverAcceptance", { deal_activation_id: context.deal_activation_id })
      .then((r) => { if (alive) setMandateId(r?.data?.mandate_id || null); })
      .catch((e) => { if (alive) setError(errText(e)); })
      .finally(() => { if (alive) setStarting(false); });
    return () => { alive = false; };
  }, [context.deal_activation_id]);

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const r = await base44.functions.invoke("acceptRecoverMandate", {
        mandate_id: mandateId,
        signed_by_name: name.trim(),
        signed_by_role: role.trim(),
        accepted: true,
      });
      onAccepted(r?.data);
    } catch (e) {
      const msg = errText(e);
      setError(
        msg === "terms_changed"
          ? "The terms changed while this window was open, so we did not record your acceptance. Close and reopen it to review the updated terms."
          : msg
      );
    } finally {
      setSubmitting(false);
    }
  };

  const canSubmit = !!mandateId && agreed && name.trim().length >= 2 && !submitting;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="cambra-card w-full max-w-lg max-h-[90vh] overflow-y-auto p-7">
        <div className="relative">
          <button onClick={onClose} className="absolute right-0 top-0 text-white/50 hover:text-white transition-colors" aria-label="Close">
            <X size={18} />
          </button>

          <p className="cc-eyebrow mb-1">Recover margin</p>
          <h3 className="text-xl font-black text-white tracking-tight mb-1">Authorize CAMBRA to recover your margin</h3>
          <p className="text-[12.5px] text-white/60 mb-5">
            You are authorizing us to negotiate with your provider, or to move you to a better rate, on your behalf.
          </p>

          {starting ? (
            <div className="flex items-center gap-2 py-10 justify-center text-white/60 text-sm">
              <Loader2 size={16} className="animate-spin" /> Preparing your terms…
            </div>
          ) : (
            <>
              <MandateTermsSummary snapshot={context.snapshot} baseline={context.baseline} />

              <div className="mt-5 rounded-xl border border-white/10 bg-white/[0.03] p-4 text-[12.5px] text-white/65 leading-relaxed">
                We charge {context.snapshot?.fee_pct}% of the savings we actually recover, verified against your own
                provider statements, for 24 months. If nothing is recovered, you owe nothing. You can revoke this
                authorization at any time; revoking does not cancel fees already earned on savings already verified.
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="text-xs text-white/55">Your full name</span>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Jane Doe"
                    className="mt-1.5 w-full rounded-lg border border-white/12 bg-white/[0.05] px-3 py-2 text-sm text-white placeholder:text-white/30 outline-none focus:border-white/25"
                  />
                </label>
                <label className="block">
                  <span className="text-xs text-white/55">Your role (optional)</span>
                  <input
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                    placeholder="Founder"
                    className="mt-1.5 w-full rounded-lg border border-white/12 bg-white/[0.05] px-3 py-2 text-sm text-white placeholder:text-white/30 outline-none focus:border-white/25"
                  />
                </label>
              </div>

              <label className="mt-4 flex items-start gap-2.5 cursor-pointer">
                <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-0.5" />
                <span className="text-[12.5px] text-white/70 leading-relaxed">
                  {/* RECOVER-3-FIX — the exact server-provided contractual checkbox text
                      (same string the PDF prints), with the legacy EN fallback. */}
                  {context.mandate_copy?.checkbox ||
                    `I confirm I can legally bind ${context.legal_entity_name || "my business"} and I accept these terms.`}
                </span>
              </label>

              {error && (
                <div className="mt-4 flex items-start gap-2 rounded-lg border border-[#F45B69]/30 bg-[#F45B69]/10 p-3 text-[12.5px] text-white/85">
                  <AlertTriangle size={15} className="shrink-0 mt-0.5" /> {error}
                </div>
              )}

              <Button
                onClick={submit}
                disabled={!canSubmit}
                className="mt-5 w-full rounded-full h-11 text-sm font-bold bg-white text-[#06080F] hover:bg-white/90 gap-2"
              >
                {submitting ? <Loader2 size={15} className="animate-spin" /> : <ShieldCheck size={15} />}
                {submitting ? "Recording your acceptance…" : "Accept and authorize"}
              </Button>
              <p className="mt-2.5 text-[11px] text-white/40 text-center font-mono">
                Signed as {context.owner_email_display || "your account"} · {context.document_version}
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}