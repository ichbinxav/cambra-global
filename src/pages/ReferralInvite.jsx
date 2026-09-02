import { useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, ArrowRight, Check, LockKeyhole, Sparkles } from "lucide-react";
import { useTranslation } from "@/lib/i18n.jsx";
import { BASE_FEE_PCT, ENTRY_FEE_PCT, STEP_POINTS } from "@/lib/referralProgram";
import SectionLabel from "@/components/shared/SectionLabel";

const REFERRAL_CODE = /^[A-Za-z0-9_-]{4,24}$/;

export default function ReferralInvite() {
  const { t } = useTranslation();
  const code = useMemo(() => {
    try { return new URLSearchParams(window.location.search).get("ref")?.trim() || ""; }
    catch { return ""; }
  }, []);
  const valid = REFERRAL_CODE.test(code);

  useEffect(() => {
    if (!valid) return;
    try { sessionStorage.setItem("cambra_ref_code", code); }
    catch { /* The query string still carries attribution when storage is blocked. */ }
  }, [code, valid]);

  const analyzerTarget = valid ? `/Analyzer?ref=${encodeURIComponent(code)}` : "/Analyzer";
  const loginTarget = `/LoginGate?next=${encodeURIComponent(analyzerTarget)}`;

  if (!valid) {
    return (
      <main className="min-h-screen bg-[#F8F8FC] px-6 py-10 text-[#0C0C16]">
        <div className="mx-auto flex min-h-[75vh] max-w-lg flex-col items-center justify-center text-center">
          <Link to="/" className="mb-10 text-[18px] font-black tracking-[-.04em]">CAMBRA</Link>
          <p className="text-[11px] font-bold uppercase tracking-[.18em] text-[#5B4CF5]">{t("ref_land_eyebrow")}</p>
          <h1 className="mt-5 text-[36px] font-black tracking-[-.045em]">{t("res_invalid_title")}</h1>
          <p className="mt-4 max-w-md text-[14px] leading-relaxed text-[#616170]">{t("res_stale_msg")}</p>
          <Link to="/Analyzer" className="btn-primary mt-8 inline-flex items-center gap-2">
            {t("res_rerun_cta")} <ArrowRight size={15} />
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main
      className="relative min-h-screen overflow-hidden px-5 py-6 text-[#0C0C16] sm:px-8 sm:py-8"
      style={{ background: "radial-gradient(circle at 80% 5%,rgba(91,76,245,.10),transparent 34%),radial-gradient(circle at 8% 92%,rgba(57,198,240,.08),transparent 34%),#F9F9FC" }}
    >
      <div aria-hidden className="absolute inset-0 opacity-45" style={{ backgroundImage: "radial-gradient(rgba(91,76,245,.17) .8px,transparent .8px)", backgroundSize: "28px 28px" }} />

      <div className="relative mx-auto max-w-6xl">
        <header className="flex items-center justify-between py-2">
          <Link to="/" className="text-[20px] font-black tracking-[-.045em]" aria-label="CAMBRA">CAMBRA</Link>
          <Link to="/" className="inline-flex min-h-10 items-center gap-2 rounded-full border border-[#DEDEE8] bg-white/80 px-4 text-[12px] font-semibold text-[#616170] hover:text-[#0C0C16]">
            <ArrowLeft size={13} /> {t("bp_back")}
          </Link>
        </header>

        <section className="grid min-h-[calc(100vh-100px)] items-center gap-8 py-8 lg:grid-cols-[.9fr_1.1fr] lg:gap-12">
          <div className="max-w-xl">
            <SectionLabel>{t("ref_land_eyebrow")}</SectionLabel>
            <h1 className="mt-6 text-[clamp(42px,6vw,76px)] font-black leading-[.96] tracking-[-.055em]">
              {BASE_FEE_PCT}% <span className="text-[#A5A5B0]">→</span>{" "}
              <span className="kw">{ENTRY_FEE_PCT}%</span>
            </h1>
            <p className="mt-6 max-w-lg text-[16px] leading-relaxed text-[#555563]">
              {t("ref_land_t3_note").replace("{base}", `${BASE_FEE_PCT}%`)}
            </p>
            <p className="mt-3 max-w-lg text-[13px] leading-relaxed text-[#787886]">{t("ref_land_trigger")}</p>

            <Link
              to={loginTarget}
              className="mt-8 inline-flex min-h-[52px] items-center justify-center gap-2 rounded-full px-7 py-4 text-[14px] font-bold text-white"
              style={{ background: "linear-gradient(135deg,#4938F5,#297CF5)", boxShadow: "0 18px 38px -18px rgba(73,56,245,.75)" }}
            >
              {t("login_gate_continue")} <ArrowRight size={16} />
            </Link>
            <p className="mt-3 text-[11.5px] text-[#858592]">{t("login_gate_continue_sub")}</p>
          </div>

          <div
            className="relative overflow-hidden rounded-[32px] border border-[#302A66] p-6 text-white sm:p-9"
            style={{ background: "linear-gradient(145deg,#080817 0%,#17133B 52%,#07202A 100%)", boxShadow: "0 36px 90px -44px rgba(26,25,70,.65)" }}
          >
            <div aria-hidden className="absolute -right-28 -top-28 h-72 w-72 rounded-full bg-[#5B4CF5]/25 blur-[80px]" />
            <div aria-hidden className="absolute -bottom-24 -left-24 h-64 w-64 rounded-full bg-cyan-300/15 blur-[80px]" />

            <div className="relative flex items-center justify-between gap-5 border-b border-white/10 pb-7">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[.2em] text-white/45">CAMBRA</p>
                <p className="mt-2 font-mono text-[13px] font-bold tracking-[.08em] text-white/75">{code}</p>
              </div>
              <span className="inline-flex h-14 w-14 items-center justify-center rounded-2xl border border-cyan-200/20 bg-cyan-200/[.07] text-cyan-200">
                <Sparkles size={21} />
              </span>
            </div>

            <div className="relative grid gap-3 py-7 sm:grid-cols-3">
              <div className="rounded-2xl border border-white/10 bg-white/[.04] p-4">
                <p className="text-[34px] font-black leading-none text-white">−{STEP_POINTS}</p>
                <p className="mt-2 text-[10px] font-bold uppercase tracking-[.16em] text-cyan-200">pts</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[.04] p-4">
                <Check size={17} className="text-cyan-200" />
                <p className="mt-3 text-[12px] font-semibold leading-snug text-white/75">{t("ref_land_t3_note").replace("{base}", `${BASE_FEE_PCT}%`)}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[.04] p-4">
                <LockKeyhole size={17} className="text-cyan-200" />
                <p className="mt-3 text-[12px] font-semibold leading-snug text-white/75">{t("login_gate_trust_1")}</p>
              </div>
            </div>

            <div className="relative flex items-center gap-2 border-t border-white/10 pt-6 text-[11px] leading-relaxed text-white/50">
              <Check size={13} className="shrink-0 text-cyan-200" />
              {t("login_gate_footnote")}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
