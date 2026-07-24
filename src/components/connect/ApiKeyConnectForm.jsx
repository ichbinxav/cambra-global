import { useState } from "react";
import { Loader2, KeyRound, ExternalLink, Check, X } from "lucide-react";

/**
 * ApiKeyConnectForm — inline form for api_key providers.
 *
 * Pure presentational: takes a help_url / help_text from the registry mirror,
 * accepts the pasted key locally, and bubbles it up via onSave(key). The
 * parent calls oauthConnector(mode: "connect_api_key") with that key — we
 * never persist it on the client.
 *
 * Security:
 *   - <input type="password"> so the browser does not echo it.
 *   - Local state lives only as long as the form is mounted.
 *   - On submit the parent fires the network call and we clear the field on
 *     success. We never log the value.
 */
export default function ApiKeyConnectForm({ helpUrl, helpText, busy, onCancel, onSave }) {
  const [key, setKey] = useState("");
  const [showHelp, setShowHelp] = useState(false);

  const canSave = key.trim().length >= 4 && !busy;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!canSave) return;
    const trimmed = key.trim();
    await onSave(trimmed);
    // Clear local state regardless — the parent owns the success toast.
    setKey("");
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-3 rounded-xl border border-border/60 bg-secondary/30 p-3 space-y-2"
    >
      <label className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.18em] font-bold text-muted-foreground">
        <KeyRound size={11} />
        Paste your API key
      </label>
      <div className="flex flex-col sm:flex-row gap-2">
        <input
          type="password"
          autoComplete="off"
          spellCheck={false}
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder="sk_live_…"
          className="flex-1 h-10 px-3 rounded-md text-sm bg-background border border-border/60 font-mono"
          aria-label="API key"
        />
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={!canSave}
            className="inline-flex items-center gap-1 h-10 px-4 rounded-full bg-foreground text-background text-xs font-bold disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {busy ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
            Save
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

      <p className="text-[10px] text-muted-foreground/70 leading-snug pt-1">
        Your key is encrypted before being saved and never sent back to your browser.
      </p>
    </form>
  );
}