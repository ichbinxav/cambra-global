import React, { useState } from "react";
import { ArrowRight, Check, Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";

/**
 * JoinWaitlistButton — "Join to recover" CTA.
 *
 * Flow:
 *   - idle → user clicks pill button → expands to email input
 *   - submitting → posts to submitWaitlistSignup (saves Lead + emails admin)
 *   - done → confirmation state
 *
 * Props:
 *   - variant: "primary" (default) | "ghost"
 *   - label: button text
 *   - fullWidth: full-width layout
 *   - source: where the signup came from (for lead attribution)
 *   - context: optional { brand_name, total_savings, session_id } — used
 *     by the teaser to enrich the admin notification email.
 */
export default function JoinWaitlistButton({
  variant = "primary",
  label = "Join to recover",
  fullWidth = false,
  source = "landing_waitlist",
  context = null,
}) {
  const [state, setState] = useState("idle"); // idle | form | submitting | done
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");

  const isValidEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!isValidEmail(email)) {
      setError("Enter a valid email");
      return;
    }
    setError("");
    setState("submitting");
    try {
      const res = await base44.functions.invoke("submitWaitlistSignup", {
        email: email.trim(),
        source,
        context: context || {},
      });
      const payload = res?.data || res;
      if (payload?.ok) {
        setState("done");
      } else {
        setError(payload?.error === "invalid_email" ? "Enter a valid email" : "Something went wrong, try again");
        setState("form");
      }
    } catch {
      setError("Something went wrong, try again");
      setState("form");
    }
  };

  if (state === "done") {
    return (
      <div
        className="inline-flex items-center gap-2 rounded-full px-5 py-3 text-[14px] font-bold"
        style={{
          border: "1px solid rgba(34,211,238,0.35)",
          background: "rgba(34,211,238,0.08)",
          color: "#7BD9F0",
        }}
        role="status"
        aria-live="polite"
      >
        <Check size={14} className="text-cyan-300" />
        You're on the list — we'll be in touch.
      </div>
    );
  }

  if (state === "form" || state === "submitting") {
    const submitting = state === "submitting";
    return (
      <form
        onSubmit={handleSubmit}
        className="flex flex-col sm:flex-row items-stretch gap-2 max-w-md"
      >
        <input
          type="email"
          autoFocus
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="your@brand.com"
          disabled={submitting}
          className="flex-1 rounded-full px-5 py-3 text-[14px] text-white placeholder:text-white/40 outline-none disabled:opacity-60"
          style={{
            background: "rgba(255,255,255,0.04)",
            border: `1px solid ${error ? "rgba(239,68,68,0.45)" : "rgba(255,255,255,0.14)"}`,
          }}
          aria-label="Email address"
          aria-invalid={error ? "true" : "false"}
        />
        <button
          type="submit"
          disabled={submitting}
          className="inline-flex items-center justify-center gap-2 rounded-full px-5 py-3 text-[14px] font-bold text-white hover:opacity-90 disabled:opacity-70"
          style={{
            background: "var(--g-voltio)",
            boxShadow: "0 12px 32px -12px rgba(91,76,245,0.55)",
          }}
        >
          {submitting ? <><Loader2 size={14} className="animate-spin" /> Joining…</> : <>Join <ArrowRight size={14} /></>}
        </button>
        {error && (
          <span className="text-[12px] text-red-300 sm:hidden">{error}</span>
        )}
      </form>
    );
  }

  // idle
  const commonStyle =
    variant === "primary"
      ? {
          background: "var(--g-voltio)",
          color: "#ffffff",
          padding: fullWidth ? "18px 28px" : undefined,
          boxShadow:
            "0 12px 32px -12px rgba(91,76,245,0.55), 0 0 28px rgba(91,76,245,0.22)",
        }
      : {
          background: "transparent",
          color: "rgba(255,255,255,0.95)",
          border: "1px solid rgba(255,255,255,0.20)",
          padding: fullWidth ? "18px 28px" : undefined,
        };

  return (
    <button
      type="button"
      onClick={() => setState("form")}
      className={`${fullWidth ? "flex w-full" : "inline-flex"} items-center justify-center gap-2 rounded-full text-[15px] font-bold transition-transform hover:scale-[1.02] ${fullWidth ? "" : "px-6 py-3 text-[14px]"}`}
      style={commonStyle}
    >
      {label}
      <ArrowRight size={16} />
    </button>
  );
}