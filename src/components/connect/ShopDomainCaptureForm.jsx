import { useState } from "react";
import { Loader2, Store, ExternalLink, Check, X, AlertCircle } from "lucide-react";

/**
 * ShopDomainCaptureForm — inline form for providers with requires_shop_domain.
 *
 * Sister component to ApiKeyConnectForm. Captures the per-tenant identifier
 * the customer must paste before OAuth (or before sending the api_key /
 * basic_auth payload). The value the customer types is provider-specific:
 *
 *   shopify       → shop handle           ("mitienda" of mitienda.myshopify.com)
 *   woocommerce   → site domain           ("mitienda.com")
 *   bigcommerce   → store hash            ("abc12345xyz")
 *   quickbooks    → realmId / company id  ("9341452991318123")
 *   odoo          → instance domain       ("miempresa.odoo.com")
 *   freshbooks    → accountId             (alphanumeric, from /users/me)
 *
 * Validation strategy (matches the backend contract verified in this turn):
 *   - Frontend check is a softer "looks reasonable" gate: non-empty, trimmed,
 *     length 3..120, no spaces. We deliberately do NOT replicate the strict
 *     SHOP_DOMAIN_REGEX from oauthConnector — that regex rejects dots (`.`),
 *     which is correct for OAuth handles (Shopify) but wrong for full domains
 *     (Odoo, WooCommerce). The backend already enforces the right rule per
 *     auth_method path, so we keep the frontend permissive and surface the
 *     backend's error verbatim on submit.
 *   - The backend is the source of truth. If a paste fails server-side, we
 *     show the exact server message in red — never a generic "invalid".
 *
 * Pure presentational: the parent owns the network call (oauthConnector
 * mode:"start" | "connect_api_key" | "connect_basic_auth"). We never touch
 * brand_id here, so the value cannot leak across tenants.
 */
export default function ShopDomainCaptureForm({
  fieldLabel,
  placeholder,
  helpUrl,
  helpText,
  busy,
  serverError,
  onCancel,
  onSave,
}) {
  const [value, setValue] = useState("");
  const [showHelp, setShowHelp] = useState(false);

  const trimmed = value.trim();
  // Soft frontend check — see component docblock for the rationale.
  const looksReasonable =
    trimmed.length >= 3 && trimmed.length <= 120 && !/\s/.test(trimmed);
  const canSave = looksReasonable && !busy;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!canSave) return;
    await onSave(trimmed);
    // Parent owns the success toast + form close. We clear the field so a
    // re-open does not show stale input.
    setValue("");
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-3 rounded-xl border border-border/60 bg-secondary/30 p-3 space-y-2"
    >
      <label className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.18em] font-bold text-muted-foreground">
        <Store size={11} />
        {fieldLabel || "Shop identifier"}
      </label>
      <div className="flex flex-col sm:flex-row gap-2">
        <input
          type="text"
          autoComplete="off"
          spellCheck={false}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={placeholder || "your-shop"}
          className="flex-1 h-10 px-3 rounded-md text-sm bg-background border border-border/60 font-mono"
          aria-label={fieldLabel || "Shop identifier"}
          aria-invalid={!!serverError}
        />
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={!canSave}
            className="inline-flex items-center gap-1 h-10 px-4 rounded-full bg-foreground text-background text-xs font-bold disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {busy ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
            Continue
          </button>
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              disabled={busy}
              className="inline-flex items-center gap-1 h-10 px-3 rounded-full border border-border/60 text-xs font-bold text-muted-foreground hover:text-foreground"
            >
              <X size={11} />
            </button>
          )}
        </div>
      </div>

      {serverError && (
        <div
          role="alert"
          className="flex items-start gap-1.5 rounded-md bg-red-500/10 border border-red-500/25 px-2.5 py-1.5"
        >
          <AlertCircle size={11} className="text-red-600 mt-0.5 shrink-0" />
          <p className="text-[11px] text-red-700 leading-snug">{serverError}</p>
        </div>
      )}

      {(helpUrl || helpText) && (
        <div className="pt-1">
          <button
            type="button"
            onClick={() => setShowHelp((v) => !v)}
            className="text-[11px] font-semibold text-cyan-700 hover:underline"
          >
            {showHelp ? "Hide" : "Where do I find this?"}
          </button>
          {showHelp && (
            <div className="mt-1.5 text-[11px] text-muted-foreground leading-relaxed">
              {helpText && <p>{helpText}</p>}
              {helpUrl && (
                <a
                  href={helpUrl}
                  target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 mt-1 text-cyan-700 hover:underline"
                >
                  Open provider docs <ExternalLink size={9} />
                </a>
              )}
            </div>
          )}
        </div>
      )}
    </form>
  );
}