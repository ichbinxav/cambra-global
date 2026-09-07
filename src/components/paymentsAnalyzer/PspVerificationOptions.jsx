// PspVerificationOptions — Chunk "Fallback universal de facturas" (FASE B).
//
// Renders the per-PSP verification path UNDER the provider selector in the
// analyzer. The rule (operator condition #2):
//
//   • Selected PSP has a LIVE verified path today  → "Connect {PSP}" card.
//   • Any other PSP                                → "Upload your last 3
//                                                     {PSP} statements" card.
//
// Source of truth for "live verified path" (operator: read the real catalog,
// don't hard-code): IntegrationCatalog.status === "live". Today that is ONLY
// Stripe (seedIntegrationCatalog:13 — every other payments provider is
// coming_soon / planned). We deliberately key off catalog `status`, NOT
// `auth_type`: the catalog lists paypal/mollie/etc. as auth_type "oauth" but
// none of them have a working OAuth Connect flow (KNOWN_DEBT: "Stripe Connect:
// Missing app registration, Client ID/Secret, and real OAuth"). `status:
// "live"` is the honest signal for "this actually works right now".
//
// HONEST COPY (operator condition #1): the Upload card's copy depends on
// whether the extractor is actually live (getUploadCapability.extraction_live):
//   • live  → independently checked extraction (upload runs the extractor).
//   • off   → "Coming soon — get notified"          (upload would be a no-op).
// NOTHING here promises an immediate verified gap from statements — the
// multi-invoice assembly engine does not exist yet (deferred to a future
// chunk, operator condition #3). The upload feeds the EXISTING
// processUploadedFile as a first step only.
//
// SCOPE LOCK: presentational + one read-only capability probe. No engine, no
// computeStripeVerifiedGap, no estimated path touched.

import { Zap, ArrowRight, ShieldCheck, FileUp } from "lucide-react";
import { useTranslation } from "@/lib/i18n.jsx";

// The one provider whose verified path is live today. Kept as a set so a
// future chunk that lights up a second provider only edits this line.
const LIVE_VERIFIED_PROVIDERS = new Set(["stripe"]);

export default function PspVerificationOptions({ providerSlug, providerLabel, onConnect, onUpload }) {
  const { t } = useTranslation();

  // Nothing selected yet — don't show a verification path (the provider grid
  // above is still the active question).
  if (!providerSlug) return null;

  const label = providerLabel || providerSlug.replace(/_/g, " ");
  const isLiveVerified = LIVE_VERIFIED_PROVIDERS.has(providerSlug);
  const uploadAction = (
    <button
      type="button"
      onClick={() => onUpload?.()}
      className="w-full rounded-2xl border border-[#DFE2EB] bg-white p-4 text-left transition-all hover:border-[#8B7BFF] hover:bg-[#FAF9FF] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5B4CF5]/40"
    >
      <span className="flex items-start gap-3">
        <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#F0EEFF] text-[#5B4CF5]"><FileUp size={16} /></span>
        <span className="min-w-0 flex-1">
          <strong className="block text-[14px] text-[#11182D]">{t("psp_upload_title", { provider: label })}</strong>
          <span className="mt-1 block text-[12px] leading-relaxed text-[#69718A]">{t("az_entry_upload_body")}</span>
          <span className="mt-2 inline-flex items-center gap-1 text-[11px] font-bold text-[#4D3DF1]">{t("az_entry_upload_cta")} <ArrowRight size={11} /></span>
        </span>
      </span>
    </button>
  );

  return (
    <div className="mt-4">
      <p className="text-[10px] uppercase tracking-[0.22em] font-bold mb-2.5" style={{ color: "var(--gris-1)" }}>
        {t("psp_verify_prompt")}
      </p>

      {isLiveVerified ? (
        // ── Stripe: BOTH paths. Connect (fastest, real data) is the primary
        //    option; uploading statements is offered as an alternative for
        //    merchants who'd rather not connect their account.
        <div className="space-y-2.5">
          <button
            type="button"
            onClick={() => onConnect?.()}
            className="w-full text-left rounded-2xl p-4 transition-all duration-150 hover:scale-[1.005] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5B4CF5]/40"
            style={{
              background: "rgba(91,76,245,0.05)",
              border: "1px solid rgba(91,76,245,0.28)",
            }}
          >
            <div className="flex items-start gap-3">
              <div
                className="inline-flex items-center justify-center h-9 w-9 rounded-lg shrink-0"
                style={{ background: "rgba(12,12,22,0.03)", border: "1px solid var(--linea)", color: "var(--voltio)" }}
              >
                <Zap size={16} strokeWidth={1.8} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h4 className="text-[14px] font-bold leading-tight" style={{ color: "var(--ink)", fontFamily: "'Space Grotesk', 'Inter', sans-serif" }}>
                    {t("psp_connect_title", { provider: label })}
                  </h4>
                  <span
                    className="text-[9px] uppercase tracking-[0.14em] font-bold px-1.5 py-0.5 rounded-full inline-flex items-center gap-1"
                    style={{ background: "rgba(91,76,245,0.10)", color: "var(--voltio)", border: "1px solid rgba(91,76,245,0.28)" }}
                  >
                    <ShieldCheck size={8} /> {t("badge_verified")}
                  </span>
                </div>
                <p className="text-[12px] leading-relaxed" style={{ color: "var(--gris-1)" }}>
                  {t("psp_connect_body")}
                </p>
                <span className="mt-2 inline-flex items-center gap-1 text-[11px] font-bold" style={{ color: "var(--voltio)" }}>
                  {t("psp_connect_cta", { provider: label })} <ArrowRight size={11} />
                </span>
              </div>
            </div>
          </button>

          {/* Alternative — upload statements instead of connecting. Same
              extraction-gated copy as every other PSP. */}
          {uploadAction}
        </div>
      ) : (
        // ── UPLOAD path — every other PSP. Copy gated by extraction_live.
        uploadAction
      )}
    </div>
  );
}
