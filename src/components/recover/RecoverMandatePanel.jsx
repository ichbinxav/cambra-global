// Recover merchant entry point — server-resolved, tenant-scoped and trilingual.
import { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { ShieldCheck, CheckCircle2 } from "lucide-react";
import { useLanguage } from "@/lib/i18n.jsx";
import RecoverMandateModal from "./RecoverMandateModal";
import PaymentMethodSetupCard from "./PaymentMethodSetupCard";
import ContractDocumentCard from "./ContractDocumentCard";
import { recoverUiCopy } from "./recoverUiCopy";

export default function RecoverMandatePanel() {
  const { lang } = useLanguage();
  const c = recoverUiCopy(lang).panel;
  const [ctx, setCtx] = useState(null);
  const [open, setOpen] = useState(false);
  const [accepted, setAccepted] = useState(false);

  useEffect(() => {
    let alive = true;
    // P10: do not read DealActivation rows in the browser just to discover the
    // Recover case. Authenticated identity is resolved server-side.
    base44.functions.invoke("getRecoverAcceptanceContext", {})
      .then((r) => {
        if (!alive) return;
        if (r?.data?.ok && r.data.exists !== false) setCtx(r.data);
      })
      .catch(() => null);
    return () => { alive = false; };
  }, []);

  if (!ctx) return null;

  const isAccepted = accepted || !!ctx.active_mandate_id;
  const blocker = (ctx.blockers || []).map((b) => c.blockers[b]).find(Boolean);

  return (
    <div className="cambra-card p-7 mb-6">
      <div className="relative">
        <p className="cc-eyebrow mb-1">{c.eyebrow}</p>
        <p className="text-sm font-semibold text-white mb-4">{isAccepted ? c.authorized : c.authorize}</p>

        {isAccepted ? (
          <div className="flex items-start gap-2.5 text-[12.5px] text-white/70 leading-relaxed">
            <CheckCircle2 size={16} className="shrink-0 mt-0.5" style={{ color: "#2FE0A8" }} />
            <span>{c.accepted(ctx.fee_pct)}</span>
          </div>
        ) : blocker ? (
          <p className="text-[12.5px] text-white/60 leading-relaxed">{blocker}</p>
        ) : ctx.eligible ? (
          <>
            <p className="text-[12.5px] text-white/60 leading-relaxed mb-5">{c.pitch(ctx.fee_pct)}</p>
            <button type="button" onClick={() => setOpen(true)} className="rounded-full h-10 px-5 text-sm font-bold bg-white text-[#06080F] hover:bg-white/90 inline-flex items-center justify-center gap-2">
              <ShieldCheck size={14} /> {c.review}
            </button>
          </>
        ) : (
          <p className="text-[12.5px] text-white/60 leading-relaxed">{c.notReady}</p>
        )}

        {isAccepted && (
          <ContractDocumentCard dealActivationId={ctx.deal_activation_id} />
        )}
        {isAccepted && (
          <PaymentMethodSetupCard dealActivationId={ctx.deal_activation_id} initialStatus={ctx.payment_method_status} />
        )}
      </div>

      {open && (
        <RecoverMandateModal
          context={ctx}
          onClose={() => setOpen(false)}
          onAccepted={() => { setAccepted(true); setOpen(false); }}
        />
      )}
    </div>
  );
}
