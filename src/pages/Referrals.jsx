// Authenticated referral workspace. It exposes only the caller's opaque code,
// aggregate counters and own fee state; referred-business identities stay private.

import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useTranslation } from "@/lib/i18n.jsx";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Copy,
  FileText,
  Link2,
  Loader2,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import ReferralFeeStatus from "@/components/referrals/ReferralFeeStatus";
import { BASE_FEE_PCT, ENTRY_FEE_PCT, STEP_POINTS } from "@/lib/referralProgram";

export default function Referrals() {
  const { t } = useTranslation();
  const [state, setState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [copied, setCopied] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const response = await base44.functions.invoke("getMyReferralStatus", {});
      if (!response?.data?.code) throw new Error("referral_status_unavailable");
      setState(response.data);
    } catch {
      setState(null);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const inviteUrl = state?.code
    ? `${window.location.origin}/Invite?ref=${encodeURIComponent(state.code)}`
    : "";

  const copy = async (value, target) => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(target);
      window.setTimeout(() => setCopied(""), 2200);
    } catch {
      // Both values remain visible and selectable when Clipboard is unavailable.
    }
  };

  return (
    <div className="max-w-5xl space-y-6 pb-10">
      <Link
        to="/Dashboard"
        className="inline-flex min-h-10 items-center gap-2 rounded-full border border-white/10 bg-white/[.035] px-4 text-[12px] font-semibold text-white/65 transition-colors hover:border-white/20 hover:text-white"
      >
        <ArrowLeft size={14} aria-hidden="true" />
        {t("bp_back")} · {t("nav_dashboard")}
      </Link>

      <header className="max-w-3xl">
        <p className="cc-eyebrow mb-3">{t("ref_land_eyebrow")}</p>
        <h1
          className="text-white"
          style={{
            fontFamily: "'Space Grotesk', 'Inter', sans-serif",
            fontSize: "clamp(32px, 5vw, 48px)",
            fontWeight: 900,
            letterSpacing: "-0.045em",
            lineHeight: 1.02,
          }}
        >
          {t("ref_title")}
        </h1>
        <p className="mt-3 max-w-2xl text-[14px] leading-relaxed text-white/60">{t("ref_sub")}</p>
      </header>

      {loading && (
        <div className="cambra-card flex min-h-36 items-center justify-center gap-2 p-6 text-[13px] text-white/60">
          <Loader2 size={16} className="animate-spin text-cambra-cyan" /> {t("ref_loading")}
        </div>
      )}

      {!loading && error && (
        <div className="cambra-card p-6 sm:p-7">
          <p className="font-bold text-white">{t("res_err_title")}</p>
          <p className="mt-2 text-[13px] leading-relaxed text-white/55">{t("res_err_msg")}</p>
          <button
            type="button"
            onClick={load}
            className="mt-5 inline-flex min-h-10 items-center gap-2 rounded-full bg-white px-5 text-[12px] font-bold text-[#080A12]"
          >
            <RefreshCw size={13} /> {t("res_retry")}
          </button>
        </div>
      )}

      {!loading && state?.code && (
        <>
          <section className="cambra-card overflow-hidden">
            <div className="grid lg:grid-cols-[250px_1fr]">
              <div
                className="relative flex min-h-52 flex-col justify-between overflow-hidden border-b border-white/10 p-6 lg:border-b-0 lg:border-r"
                style={{ background: "linear-gradient(145deg,#11132B 0%,#182F59 55%,#0B5361 100%)" }}
              >
                <div aria-hidden className="absolute -right-16 -top-16 h-44 w-44 rounded-full bg-cyan-300/15 blur-3xl" />
                <div className="relative">
                  <p className="text-[10px] font-bold uppercase tracking-[.2em] text-cyan-100/65">CAMBRA</p>
                  <p className="mt-4 break-all font-mono text-[25px] font-black tracking-[.08em] text-white">{state.code}</p>
                </div>
                <button
                  type="button"
                  onClick={() => copy(state.code, "code")}
                  className="relative mt-5 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 text-[12px] font-bold text-white transition-colors hover:bg-white/15"
                >
                  {copied === "code" ? <Check size={14} /> : <Copy size={14} />}
                  {copied === "code" ? t("ref_copied") : t("share_copy_text")}
                </button>
              </div>

              <div className="p-6 sm:p-7">
                <div className="flex items-start gap-3">
                  <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-cyan-300/20 bg-cyan-300/[.07] text-cambra-cyan">
                    <Link2 size={17} />
                  </span>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[.18em] text-white/45">{t("ref_your_link")}</p>
                    <p className="mt-1 text-[13px] leading-relaxed text-white/60">{t("ref_how_1")}</p>
                  </div>
                </div>

                <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                  <input
                    readOnly
                    value={inviteUrl}
                    onFocus={(event) => event.target.select()}
                    className="h-11 min-w-0 flex-1 rounded-xl border border-white/10 bg-[#080B16] px-3 text-[12px] text-white/80 outline-none focus:border-cyan-300/35"
                  />
                  <button
                    type="button"
                    onClick={() => copy(inviteUrl, "link")}
                    className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-full bg-white px-5 text-[12px] font-bold text-[#080A12] transition-opacity hover:opacity-90"
                  >
                    {copied === "link" ? <Check size={14} /> : <Link2 size={14} />}
                    {copied === "link" ? t("ref_copied") : t("ref_copy")}
                  </button>
                </div>

                <Link
                  to={`/Invite?ref=${encodeURIComponent(state.code)}`}
                  className="mt-4 inline-flex items-center gap-2 text-[12px] font-semibold text-cambra-cyan hover:text-cyan-200"
                >
                  {t("ref_land_t3_label")} {ENTRY_FEE_PCT}%
                  <ArrowRight size={13} />
                </Link>
              </div>
            </div>

            <div className="grid border-t border-white/[.08] sm:grid-cols-[1fr_auto_1fr]">
              <div className="p-5 text-center">
                <p className="text-[10px] font-bold uppercase tracking-[.17em] text-white/40">{t("ref_land_t3_note").replace("{base}", `${BASE_FEE_PCT}%`)}</p>
                <p className="mt-2 text-3xl font-black tabular-nums text-white">{BASE_FEE_PCT}%</p>
              </div>
              <div className="hidden items-center px-4 text-cambra-cyan sm:flex"><ArrowRight size={20} /></div>
              <div className="border-t border-white/[.08] p-5 text-center sm:border-l sm:border-t-0">
                <p className="text-[10px] font-bold uppercase tracking-[.17em] text-cambra-cyan">−{STEP_POINTS} pts</p>
                <p className="mt-2 text-3xl font-black tabular-nums text-white">{ENTRY_FEE_PCT}%</p>
              </div>
            </div>
          </section>

          <ReferralFeeStatus
            activatedCount={state.activated_count || 0}
            timesUsed={state.times_used || 0}
            economicsVersion={state.recovery_economics_version || "legacy-v1"}
            entryDiscountPoints={state.entry_discount_points || 0}
          />
        </>
      )}

      <section className="cambra-card p-5 sm:p-6">
        <div className="flex items-center gap-2.5">
          <Sparkles size={15} className="text-cambra-cyan" />
          <p className="font-bold text-white">{t("ref_how_title")}</p>
        </div>
        <ol className="mt-5 grid gap-3 md:grid-cols-3">
          {["ref_how_1", "ref_how_2", "ref_how_3"].map((key, index) => (
            <li key={key} className="rounded-xl border border-white/[.07] bg-white/[.025] p-4 text-[12.5px] leading-relaxed text-white/60">
              <span className="mb-3 inline-flex h-7 w-7 items-center justify-center rounded-full border border-cyan-300/20 bg-cyan-300/[.07] text-[10px] font-black text-cambra-cyan">0{index + 1}</span>
              <span className="block">{t(key)}</span>
            </li>
          ))}
        </ol>
        <Link to="/Terms" className="mt-5 inline-flex items-center gap-1.5 text-[12px] font-semibold text-white/55 transition-colors hover:text-white">
          <FileText size={13} /> {t("ref_terms_link")}
        </Link>
      </section>
    </div>
  );
}
