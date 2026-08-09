// Referrals — REFERRAL-1 (2026-08-03). Authenticated page (rendered inside
// DashboardLayout) where a merchant gets their invite link and sees their own
// fee state.
//
// DELIBERATELY ABSENT: any list of referred businesses (names are third-party
// data) and any savings figure belonging to another merchant. Only the
// caller's aggregate counts and the caller's own fee are shown.

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useTranslation } from "@/lib/i18n.jsx";
import { Link2, Check, Loader2, FileText } from "lucide-react";
import ReferralFeeStatus from "@/components/referrals/ReferralFeeStatus";

export default function Referrals() {
  const { t } = useTranslation();
  const [state, setState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    base44.functions.invoke("getMyReferralStatus", {})
      .then((r) => setState(r?.data || null))
      .catch(() => setState(null))
      .finally(() => setLoading(false));
  }, []);

  const url = state?.code
    ? `${window.location.origin}/Analyzer?ref=${encodeURIComponent(state.code)}`
    : "";

  const handleCopy = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch { /* clipboard unavailable — the link stays visible and selectable */ }
  };

  return (
    <div className="space-y-6 pb-10 max-w-3xl">
      <div>
        <h1
          className="text-white"
          style={{
            fontFamily: "'Space Grotesk', 'Inter', sans-serif",
            fontSize: "clamp(28px, 4.5vw, 40px)",
            fontWeight: 900,
            letterSpacing: "-0.04em",
            lineHeight: 1,
          }}
        >
          {t("ref_title")}
        </h1>
        <p className="text-[14px] text-white/60 mt-2 leading-relaxed">{t("ref_sub")}</p>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-[13px] text-white/55">
          <Loader2 size={14} className="animate-spin" /> {t("ref_loading")}
        </div>
      ) : (
        <>
          {/* Invite link */}
          <div
            className="rounded-2xl p-5 sm:p-6"
            style={{
              background: "radial-gradient(120% 100% at 0% 0%, rgba(91,76,245,0.14) 0%, transparent 60%), rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.10)",
            }}
          >
            <p className="text-[10px] uppercase tracking-[0.2em] font-bold text-white/50 mb-3">
              {t("ref_your_link")}
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <input
                readOnly
                value={url}
                onFocus={(e) => e.target.select()}
                className="flex-1 h-11 px-3 rounded-md text-[13px] text-white/90 focus:outline-none"
                style={{ background: "rgba(30,26,60,0.9)", border: "1px solid rgba(255,255,255,0.14)" }}
              />
              <button
                type="button"
                onClick={handleCopy}
                className="inline-flex items-center justify-center gap-2 h-11 px-5 rounded-full text-[12.5px] font-bold text-white shrink-0"
                style={{ background: "var(--g-voltio)", boxShadow: "0 8px 24px -10px rgba(91,76,245,0.6)" }}
              >
                {copied ? <Check size={14} /> : <Link2 size={14} />}
                {copied ? t("ref_copied") : t("ref_copy")}
              </button>
            </div>
          </div>

          <ReferralFeeStatus
            activatedCount={state?.activated_count || 0}
            timesUsed={state?.times_used || 0}
            economicsVersion={state?.recovery_economics_version || "legacy-v1"}
          />
        </>
      )}

      {/* How it works — merchant language, no funnel vocabulary */}
      <div
        className="rounded-2xl p-5 sm:p-6"
        style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}
      >
        <p className="text-white font-bold text-[15px] mb-3">{t("ref_how_title")}</p>
        <ul className="space-y-2.5">
          {["ref_how_1", "ref_how_2", "ref_how_3"].map((k) => (
            <li key={k} className="flex gap-2.5 text-[13px] text-white/65 leading-relaxed">
              <span className="mt-[7px] h-1.5 w-1.5 rounded-full shrink-0" style={{ background: "#8B7BFF" }} />
              {t(k)}
            </li>
          ))}
        </ul>
        <Link
          to="/Terms"
          className="mt-4 inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-white/70 hover:text-white transition-colors"
        >
          <FileText size={13} /> {t("ref_terms_link")}
        </Link>
      </div>
    </div>
  );
}