// RecoverContractAdminPanel — RECOVER-3 (2026-08-03).
//
// Operational view of ONE mandate's contract document, for the activation detail
// page. Deliberately NOT a second contracts list: AdminContracts.jsx tracks the
// legacy Contract entity (a different kind of agreement, unrelated to Mandate),
// and duplicating it would create two sources of truth for the same document.
//
// Shows the masked recipient and an error CODE, never the storage key, never a
// signed URL, never the full IP. The retry actions are idempotent by construction
// on the server: they cannot overwrite a document that is already generated, and a
// resend is recorded as its own event.

import { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";

export default function RecoverContractAdminPanel({ mandateId }) {
  const [state, setState] = useState(null);
  const [busy, setBusy] = useState("");

  const load = async () => {
    const r = await base44.functions
      .invoke("getRecoverContractStatus", { mandate_id: mandateId })
      .catch(() => null);
    setState(r?.data?.exists ? r.data : null);
  };

  useEffect(() => { if (mandateId) load(); }, [mandateId]);

  if (!mandateId) return null;
  if (!state) return null;

  const a = state.admin || {};

  const run = async (fn, payload, label) => {
    setBusy(label);
    try {
      const r = await base44.functions.invoke(fn, { mandate_id: mandateId, ...payload });
      if (r?.data?.error) toast.error(r.data.error);
      else toast.success(label);
      await load();
    } catch (e) {
      toast.error(e?.response?.data?.error || e.message);
    } finally {
      setBusy("");
    }
  };

  const download = async () => {
    const r = await base44.functions.invoke("downloadRecoverContract", { mandate_id: mandateId }).catch(() => null);
    if (r?.data?.download_url) window.open(r.data.download_url, "_blank", "noopener");
    else toast.error(r?.data?.error || "not available");
  };

  return (
    <div className="rounded-xl border p-4 bg-card">
      <p className="text-sm font-semibold mb-2">Recover contract document</p>
      <div className="text-sm space-y-1">
        <div>Mandate: <b>{state.mandate_status}</b> · Reference: <b>{state.reference}</b></div>
        <div>
          PDF: <b>{state.status}</b> · attempts <b>{a.pdf_attempt_count ?? 0}</b>
          {state.generated_at ? ` · generated ${state.generated_at}` : ""}
          {a.pdf_next_retry_at ? ` · next retry ${a.pdf_next_retry_at}` : ""}
        </div>
        <div className="text-xs text-muted-foreground break-all">
          {a.pdf_sha256 ? `sha256 ${a.pdf_sha256}` : "no hash yet"}
          {a.pdf_size_bytes ? ` · ${a.pdf_size_bytes} bytes` : ""}
          {a.pdf_template_version ? ` · ${a.pdf_template_version}` : ""}
          {state.language ? ` · ${String(state.language).toUpperCase()}` : ""}
        </div>
        {a.pdf_last_error_code && <div className="text-xs text-red-600">PDF error: {a.pdf_last_error_code}</div>}
        <div>
          Email: <b>{state.email_status}</b> · attempts <b>{a.email_attempt_count ?? 0}</b>
          {state.email_recipient_masked ? ` · ${state.email_recipient_masked}` : ""}
          {state.email_sent_at ? ` · sent ${state.email_sent_at}` : ""}
        </div>
        {a.email_last_error_code && <div className="text-xs text-red-600">Email error: {a.email_last_error_code}</div>}
      </div>

      <div className="flex flex-wrap items-center gap-3 mt-3">
        {state.download_available && (
          <button onClick={download} className="text-xs underline">Download PDF</button>
        )}
        {!state.download_available && (
          <button
            disabled={!!busy}
            onClick={() => run("generateRecoverContractPdf", {}, "Generation requested")}
            className="text-xs underline"
          >
            Retry generation
          </button>
        )}
        {state.download_available && (
          <button
            disabled={!!busy}
            onClick={() => run("sendRecoverContractEmail", { resend: true }, "Email resent")}
            className="text-xs underline"
          >
            Resend email
          </button>
        )}
      </div>
    </div>
  );
}