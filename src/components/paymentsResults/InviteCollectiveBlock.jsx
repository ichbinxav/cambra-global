// InviteCollectiveBlock — GROWTH-1 T2 (2026-08-01). Collective-framing invite
// block shown under the result, after the primary CTA.
//
// The frame IS the incentive in this chunk (no reward mechanics by design):
// "the more businesses join, the better we negotiate". Signed-in merchants
// get their unique opaque invite link (getMyReferralLink); anonymous readers
// are routed to signup first (a ReferralLink needs an owner).

import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useTranslation } from "@/lib/i18n.jsx";
import { Users, Link2, Check, Loader2 } from "lucide-react";

export default function InviteCollectiveBlock({ isAuthenticated, onUnlock }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    if (!isAuthenticated) { onUnlock?.(); return; }
    if (loading) return;
    setLoading(true);
    try {
      const resp = await base44.functions.invoke("getMyReferralLink", {});
      const code = resp?.data?.code;
      if (code) {
        const url = `${window.location.origin}/Analyzer?ref=${encodeURIComponent(code)}`;
        await navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 3000);
      }
    } catch { /* clipboard/network hiccup — button simply stays actionable */ }
    setLoading(false);
  };

  return (
    <div
      className="rounded-2xl p-5 md:p-6 flex flex-col md:flex-row md:items-center gap-4"
      style={{
        background:
          "radial-gradient(120% 100% at 0% 0%, rgba(91,76,245,0.12) 0%, transparent 60%), rgba(255,255,255,0.03)",
        border: "1px solid rgba(255,255,255,0.10)",
      }}
    >
      <div
        className="inline-flex items-center justify-center h-10 w-10 rounded-xl shrink-0"
        style={{ background: "rgba(91,76,245,0.18)", border: "1px solid rgba(139,123,255,0.3)" }}
      >
        <Users size={17} style={{ color: "#8B7BFF" }} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-white font-bold text-[15px] leading-tight mb-1">{t("invite_title")}</p>
        <p className="text-[13px] text-white/65 leading-relaxed">{t("invite_frame")}</p>
      </div>
      <button
        type="button"
        onClick={handleClick}
        disabled={loading}
        className="inline-flex items-center justify-center gap-2 h-10 px-5 rounded-full text-[12.5px] font-bold text-white shrink-0 disabled:opacity-60 transition-opacity"
        style={{
          border: "1px solid rgba(139,123,255,0.4)",
          background: "rgba(91,76,245,0.16)",
        }}
      >
        {loading ? <Loader2 size={13} className="animate-spin" /> : copied ? <Check size={13} className="text-emerald-300" /> : <Link2 size={13} />}
        {copied ? t("invite_copied") : isAuthenticated ? t("invite_copy_link") : t("invite_get_link_anon")}
      </button>
    </div>
  );
}