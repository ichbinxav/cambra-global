import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, ArrowRight, BadgeCheck, Gift, LockKeyhole, ShieldCheck, UserRound } from "lucide-react";
import { base44 } from "@/api/base44Client";
import HeaderBrand from "@/components/shared/HeaderBrand";
import SectionLabel from "@/components/shared/SectionLabel";
import HeadlineText from "@/components/shared/HeadlineText";
import {
  REFERRAL_CODE_PATTERN,
  REFERRAL_STORAGE_KEY,
} from "@/components/referrals/ReferralAttributionCapture";
import { useTranslation } from "@/lib/i18n.jsx";
import { BASE_FEE_PCT, ENTRY_FEE_PCT, STEP_POINTS } from "@/lib/referralProgram";

export default function ReferralInvite() {
  const { t } = useTranslation();
  const code = useMemo(() => {
    try { return new URLSearchParams(window.location.search).get("ref")?.trim() || ""; }
    catch { return ""; }
  }, []);
  const formatValid = REFERRAL_CODE_PATTERN.test(code);
  const [status, setStatus] = useState(formatValid ? "checking" : "invalid");

  useEffect(() => {
    if (!formatValid) return undefined;
    let cancelled = false;
    base44.functions.invoke("getMyReferralStatus", { action: "validate_code", code })
      .then((response) => {
        if (cancelled) return;
        const body = response?.data || response;
        if (!body?.ok || !body?.eligible) {
          setStatus("invalid");
          try { sessionStorage.removeItem(REFERRAL_STORAGE_KEY); } catch {}
          return;
        }
        try { sessionStorage.setItem(REFERRAL_STORAGE_KEY, code); } catch {}
        setStatus("ready");
      })
      .catch(() => { if (!cancelled) setStatus("error"); });
    return () => { cancelled = true; };
  }, [code, formatValid]);

  const analyzerTarget = `/Analyzer?ref=${encodeURIComponent(code)}`;
  const loginTarget = `/LoginGate?next=${encodeURIComponent(analyzerTarget)}&ref=${encodeURIComponent(code)}`;

  if (status === "invalid" || status === "error") {
    return (
      <div className="cambra-auth-page min-h-screen">
        <header className="cambra-auth-header">
          <HeaderBrand to="/" tone="dark" />
          <Link to="/ReferralProgramme" className="inline-flex min-h-10 items-center gap-2 text-[13px] font-semibold text-white/70 hover:text-white"><ArrowLeft size={14} /> {t("bp_back")}</Link>
        </header>
        <main className="relative mx-auto flex min-h-[calc(100vh-72px)] w-[min(720px,calc(100%-36px))] flex-col items-center justify-center py-16 text-center">
          <span className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-[#EFEDFF] text-[#4D3DF1]"><Gift size={24} /></span>
          <SectionLabel className="mt-8">{t("ref_land_eyebrow")}</SectionLabel>
          <h1 className="mt-5 text-[clamp(38px,6vw,60px)] font-bold leading-[1] tracking-[-.055em] text-[#091126]"><HeadlineText>{t("res_invalid_title")}</HeadlineText></h1>
          <p className="mt-5 max-w-lg text-[15px] leading-relaxed text-[#626B86]">{status === "error" ? t("res_err_msg") : t("ref_code_rejected_body")}</p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link to="/Analyzer" className="btn-primary inline-flex min-h-[50px] items-center gap-2 rounded-xl px-6 text-[13px] font-bold text-white">{t("res_rerun_cta")} <ArrowRight size={15} /></Link>
            <Link to="/ReferralProgramme" className="inline-flex min-h-[50px] items-center px-5 text-[13px] font-bold text-[#4D3DF1]">{t("ref_land_how")}</Link>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="cambra-auth-page min-h-screen">
      <header className="cambra-auth-header">
        <HeaderBrand to="/" tone="dark" />
        <Link to="/ReferralProgramme" className="inline-flex min-h-10 items-center gap-2 text-[13px] font-semibold text-white/70 hover:text-white"><ArrowLeft size={14} /> {t("bp_back")}</Link>
      </header>

      <main className="cambra-auth-main">
        <section className="max-w-[690px]">
          <div className="mb-7 inline-flex items-center gap-2 rounded-lg border border-[#CFC9FF] bg-[#F2F0FF] px-3 py-2 text-[11px] font-bold uppercase tracking-[.13em] text-[#4231E6]">
            <BadgeCheck size={14} /> {status === "checking" ? t("ref_loading") : t("ref_code_verified")}
          </div>
          <SectionLabel>{t("ref_land_eyebrow")}</SectionLabel>
          <h1 className="mt-6 text-[clamp(48px,6vw,78px)] font-bold leading-[.98] tracking-[-.06em] text-[#091126]">
            {ENTRY_FEE_PCT}%.<br />
            <span className="kw">{t("ref_land_h2_kw")}</span>
          </h1>
          <p className="mt-7 max-w-[640px] text-[clamp(16px,1.45vw,19px)] leading-[1.65] text-[#626B86]">
            {t("ref_land_t3_note", { base: `${BASE_FEE_PCT}%` })} {t("ref_land_trigger")}
          </p>
          <div className="mt-9 flex flex-wrap items-center gap-4">
            <Link
              to={status === "ready" ? loginTarget : "#"}
              aria-disabled={status !== "ready"}
              className={`inline-flex min-h-[54px] items-center justify-center gap-2 rounded-xl px-7 text-[14px] font-bold text-white ${status === "ready" ? "btn-primary" : "cursor-wait bg-[#ACA6D5]"}`}
            >
              {status === "checking" ? t("ref_loading") : t("ref_land_cta")} <ArrowRight size={16} />
            </Link>
            <Link to="/how-it-works" className="inline-flex min-h-[54px] items-center px-2 text-[14px] font-bold text-[#4D3DF1]">{t("nav_how")} <ArrowRight className="ml-2" size={15} /></Link>
          </div>
          <p className="mt-5 text-[11px] text-[#858CA0]">{t("login_gate_continue_sub")}</p>
        </section>

        <aside className="cambra-dark-panel cambra-auth-proof">
          <div className="w-full">
            <div className="flex items-center justify-between gap-4">
              <SectionLabel tone="dark">{t("ref_land_t3_label")}</SectionLabel>
              <span className="rounded-lg border border-cyan-300/40 bg-cyan-300/[.06] px-3 py-1.5 text-[10px] font-bold uppercase tracking-[.16em] text-cyan-200">{t("ref_code_verified")}</span>
            </div>
            <div className="mt-10 grid grid-cols-[1fr_auto_1fr] items-end gap-4 border-b border-white/12 pb-9">
              <div><span className="text-[12px] text-white/55">{t("ref_fee_label")}</span><strong className="mt-2 block text-[64px] font-bold leading-none tracking-[-.065em] text-white">{BASE_FEE_PCT}%</strong></div>
              <div className="pb-2 text-center"><span className="text-[12px] font-semibold text-white/74">−{STEP_POINTS} pts</span><ArrowRight className="mt-3 text-white/40" size={35} /></div>
              <div className="text-right"><span className="text-[12px] text-[#B8AEFF]">{t("ref_land_t3_label")}</span><strong className="mt-2 block text-[64px] font-bold leading-none tracking-[-.065em] text-[#B8AEFF]">{ENTRY_FEE_PCT}%</strong></div>
            </div>
            <ul className="mt-8 space-y-5">
              {[
                { icon: Gift, text: t("ref_land_cta") },
                { icon: LockKeyhole, text: t("login_gate_trust_1") },
                { icon: ShieldCheck, text: t("login_gate_b3") },
              ].map(({ icon: Icon, text }) => (
                <li key={text} className="flex items-center gap-4 text-[14px] font-semibold text-white/80">
                  <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#8B7BFF]/25 bg-[#8B7BFF]/10 text-[#B8AEFF]"><Icon size={17} /></span>{text}
                </li>
              ))}
            </ul>
            <div className="mt-9 flex items-center gap-3 rounded-2xl border border-white/12 bg-white/[.055] p-4 text-[12px] leading-relaxed text-white/64">
              <UserRound className="shrink-0 text-[#B8AEFF]" size={20} /> {t("ref_code_account_lock")}
            </div>
          </div>
        </aside>
      </main>
    </div>
  );
}
