import { Link } from "react-router-dom";
import { ArrowRight, Users } from "lucide-react";
import { useTranslation } from "@/lib/i18n.jsx";

// REFERRAL-1 T4 — discreet Dashboard entry point to /Referrals. An available
// option, not a campaign: no modal, no dismiss state, no urgency copy.
export default function ReferralTeaser() {
  const { t } = useTranslation();
  return (
    <Link to="/Referrals" className="block">
      <div
        className="flex items-center gap-4 rounded-[22px] p-5 transition-transform hover:-translate-y-0.5"
        style={{ background: "linear-gradient(135deg,#15122F,#091629)", border: "1px solid rgba(139,123,255,.24)", boxShadow: "0 24px 60px -46px rgba(10,12,34,.92)" }}
      >
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: "rgba(91,76,245,0.16)", border: "1px solid rgba(139,123,255,0.28)" }}
        >
          <Users size={15} style={{ color: "#8B7BFF" }} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-white mb-0.5">{t("dash_ref_title")}</p>
          <p className="text-xs text-white/55 leading-relaxed">{t("dash_ref_sub")}</p>
        </div>
        <ArrowRight size={15} className="text-white/40 shrink-0" />
      </div>
    </Link>
  );
}
