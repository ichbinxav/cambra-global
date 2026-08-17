// ContractDocumentCard — RECOVER-3 (2026-08-03).
//
// The merchant's view of their agreement copy. Three honest states, and none of
// them ever says the acceptance failed:
//   · being prepared  → the document is still generating (Recover Margin carries on)
//   · available       → download, plus where the copy was emailed
//   · email failed    → the document is downloadable; delivery is being retried
//
// Copy lives here, in three languages, rather than in the global locale files:
// these five strings belong to this card and nothing else reads them.

import { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { FileText, Download, Loader2 } from "lucide-react";
import { useLanguage } from "@/lib/i18n.jsx";

const COPY = {
  en: {
    eyebrow: "Agreement copy",
    pending: "Agreement copy being prepared. Recover Margin continues without waiting for it.",
    available: "Agreement available",
    download: "Download PDF",
    emailSent: (e) => `A copy was sent to ${e}.`,
    emailRetry: "Your agreement is available for secure download. We're retrying email delivery.",
    pdfFailed: "Your acceptance is recorded. We're still preparing the downloadable copy.",
    revoked: "This agreement is revoked. The copy is kept as a record of what was agreed.",
    superseded: "This agreement was replaced by a newer one. The copy is kept as a record.",
  },
  fr: {
    eyebrow: "Copie de l'accord",
    pending: "Préparation de la copie de votre accord. Recover Margin continue sans attendre.",
    available: "Accord disponible",
    download: "Télécharger le PDF",
    emailSent: (e) => `Une copie a été envoyée à ${e}.`,
    emailRetry: "Votre accord est disponible en téléchargement sécurisé. Nous réessayons l'envoi de l'e-mail.",
    pdfFailed: "Votre acceptation est enregistrée. Nous préparons encore la copie téléchargeable.",
    revoked: "Cet accord est révoqué. La copie est conservée comme preuve de ce qui a été convenu.",
    superseded: "Cet accord a été remplacé par un nouveau. La copie est conservée comme preuve.",
  },
  es: {
    eyebrow: "Copia del acuerdo",
    pending: "Preparando la copia de tu acuerdo. Recover Margin continúa sin esperar.",
    available: "Acuerdo disponible",
    download: "Descargar PDF",
    emailSent: (e) => `Hemos enviado una copia a ${e}.`,
    emailRetry: "Tu acuerdo está disponible para descarga segura. Estamos reintentando el envío del email.",
    pdfFailed: "Tu aceptación está registrada. Seguimos preparando la copia descargable.",
    revoked: "Este acuerdo está revocado. La copia se conserva como registro de lo acordado.",
    superseded: "Este acuerdo fue sustituido por uno nuevo. La copia se conserva como registro.",
  },
};
// AUDIT I18N-01 (2026-08-17, founder-authorised): other 20 UI locales fall through to EN.
// This is agreement-adjacent UI copy; the legal record itself lives in recoveryEconomicsCopy
// (which carries PENDING_LEGAL_REVIEW markers). Overridable per locale by translators.
for (const code of ['de','it','pl','pt','el','sv','da','fi','cs','ro','hu','bg','hr','et','lv','lt','sk','sl','nb','is']) {
  COPY[code] = COPY.en;
}

export default function ContractDocumentCard({ dealActivationId }) {
  const { lang } = useLanguage();
  const c = COPY[lang] || COPY.en;
  const [state, setState] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    base44.functions
      .invoke("getRecoverContractStatus", { deal_activation_id: dealActivationId })
      .then((r) => { if (alive && r?.data?.exists) setState(r.data); })
      .catch(() => null);
    return () => { alive = false; };
  }, [dealActivationId]);

  if (!state) return null;

  const download = async () => {
    setBusy(true);
    try {
      const r = await base44.functions.invoke("downloadRecoverContract", { deal_activation_id: dealActivationId });
      if (r?.data?.download_url) {
        window.open(r.data.download_url, "_blank", "noopener");
      }
    } finally {
      setBusy(false);
    }
  };

  const ready = state.download_available;
  const failedPdf = state.status === "failed_permanent";

  return (
    <div className="mt-5 rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <div className="flex items-start gap-2.5">
        <FileText size={16} className="shrink-0 mt-0.5 text-white/60" />
        <div className="min-w-0 flex-1">
          <p className="cc-eyebrow mb-1">{c.eyebrow}</p>
          <p className="text-[12.5px] text-white/70 leading-relaxed">
            {ready ? c.available : failedPdf ? c.pdfFailed : c.pending}
          </p>

          {state.mandate_status === "revoked" && (
            <p className="mt-1.5 text-[11.5px] text-white/50">{c.revoked}</p>
          )}
          {state.mandate_status === "superseded" && (
            <p className="mt-1.5 text-[11.5px] text-white/50">{c.superseded}</p>
          )}

          {ready && (
            <>
              <Button
                onClick={download}
                disabled={busy}
                className="mt-3 rounded-full h-9 px-4 text-[13px] font-bold bg-white text-[#06080F] hover:bg-white/90 gap-2"
              >
                {busy ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />} {c.download}
              </Button>
              <p className="mt-2 text-[11.5px] text-white/50">
                {state.email_status === "sent"
                  ? c.emailSent(state.email_recipient_masked || "")
                  : ["failed_retryable", "pending", "sending"].includes(state.email_status)
                  ? c.emailRetry
                  : null}
              </p>
            </>
          )}
          <p className="mt-2 text-[11px] text-white/35 font-mono">{state.reference}</p>
        </div>
      </div>
    </div>
  );
}
