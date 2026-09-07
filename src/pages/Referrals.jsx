// Authenticated referral workspace. Only aggregate counters and the caller's
// own opaque code are returned; referred-business identities stay private.
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, ArrowRight, Check, Copy, FileText, Link2, Loader2, RefreshCw, ShieldCheck } from "lucide-react";
import { base44 } from "@/api/base44Client";
import ReferralFeeStatus from "@/components/referrals/ReferralFeeStatus";
import SectionLabel from "@/components/shared/SectionLabel";
import { useTranslation } from "@/lib/i18n.jsx";

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
      const body = response?.data || response;
      if (!body?.ok || !body?.code) throw new Error("referral_status_unavailable");
      setState(body);
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

  const copyValue = async (value, target) => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(target);
      window.setTimeout(() => setCopied(""), 2200);
    } catch {
      // Values remain visible and selectable when Clipboard is unavailable.
    }
  };

  return (
    <div className="workspace-light-page pb-12">
      <Link to="/Dashboard" className="workspace-back-link"><ArrowLeft size={14} /> {t("bp_back")} · {t("nav_dashboard")}</Link>

      <header className="mt-8 max-w-[860px]">
        <SectionLabel>{t("ref_land_eyebrow")}</SectionLabel>
        <h1 className="workspace-page-title mt-5">{t("ref_title")}</h1>
        <p className="workspace-page-lead mt-4">{t("ref_sub")}</p>
      </header>

      {loading && (
        <div className="cambra-paper-card mt-10 flex min-h-44 items-center justify-center gap-3 p-7 text-[13px] text-[#677089]">
          <Loader2 size={17} className="animate-spin text-[#5B4CF5]" /> {t("ref_loading")}
        </div>
      )}

      {!loading && error && (
        <div className="cambra-paper-card mt-10 p-7">
          <p className="font-bold text-[#10172D]">{t("res_err_title")}</p>
          <p className="mt-2 text-[13px] leading-relaxed text-[#677089]">{t("res_err_msg")}</p>
          <button type="button" onClick={load} className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#0B1530] px-5 text-[12px] font-bold text-white"><RefreshCw size={13} /> {t("res_retry")}</button>
        </div>
      )}

      {!loading && state?.code && (
        <>
          <section className="mt-10 grid items-stretch gap-6 xl:grid-cols-[minmax(0,.92fr)_minmax(520px,1.08fr)]">
            <div className="cambra-paper-card flex flex-col justify-between p-7 sm:p-9">
              <div>
                <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-[#EFEDFF] text-[#4D3DF1]"><Link2 size={21} /></span>
                <h2 className="mt-7 text-[clamp(27px,3.2vw,42px)] font-bold leading-[1.04] tracking-[-.045em] text-[#0B1228]">{t("ref_your_link")}</h2>
                <p className="mt-4 max-w-xl text-[14px] leading-relaxed text-[#677089]">{t("ref_how_1")}</p>
              </div>
              <div className="mt-8">
                <label htmlFor="my-referral-link" className="text-[10px] font-bold uppercase tracking-[.16em] text-[#68718A]">{t("ref_your_link")}</label>
                <div className="mt-2 flex flex-col gap-3 sm:flex-row">
                  <input id="my-referral-link" readOnly value={inviteUrl} onFocus={(event) => event.target.select()} className="h-12 min-w-0 flex-1 rounded-xl border border-[#DCE0EA] bg-white px-4 font-mono text-[11px] font-semibold text-[#25304A] outline-none focus:border-[#7567F8]" />
                  <button type="button" onClick={() => copyValue(inviteUrl, "link")} className="inline-flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-xl bg-[var(--g-voltio)] px-5 text-[12px] font-bold text-white">
                    {copied === "link" ? <Check size={14} /> : <Copy size={14} />}{copied === "link" ? t("ref_copied") : t("ref_copy")}
                  </button>
                </div>
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#E2E4ED] bg-[#F8F8FC] px-4 py-3">
                  <span className="font-mono text-[12px] font-bold tracking-[.12em] text-[#11182D]">{state.code}</span>
                  <button type="button" onClick={() => copyValue(state.code, "code")} className="inline-flex items-center gap-2 text-[11px] font-bold text-[#4D3DF1]">{copied === "code" ? <Check size={13} /> : <Copy size={13} />}{copied === "code" ? t("ref_copied") : t("share_copy_text")}</button>
                </div>
              </div>
            </div>

            <ReferralFeeStatus
              activatedCount={state.activated_count || 0}
              registeredCount={state.registered_count || 0}
              timesUsed={state.times_used || 0}
              economicsVersion={state.recovery_economics_version || "legacy-v1"}
              entryDiscountPoints={state.entry_discount_points || 0}
            />
          </section>

          <section className="mt-6 grid gap-4 sm:grid-cols-3">
            {[
              { label: t("ref_registered_label"), value: state.registered_count || 0 },
              { label: t("ref_activated_label"), value: state.activated_count || 0 },
              { label: t("ref_used_label"), value: state.times_used || 0 },
            ].map((metric) => (
              <div key={metric.label} className="cambra-paper-card flex min-h-28 items-center justify-between gap-5 px-6 py-5">
                <span className="max-w-[170px] text-[11px] font-bold uppercase leading-relaxed tracking-[.14em] text-[#727A91]">{metric.label}</span>
                <strong className="text-[34px] font-bold tracking-[-.04em] text-[#11182D]">{metric.value}</strong>
              </div>
            ))}
          </section>
        </>
      )}

      <section className="mt-12">
        <div className="text-center">
          <SectionLabel>{t("ref_how_title")}</SectionLabel>
          <h2 className="mt-5 text-[clamp(30px,4vw,48px)] font-bold tracking-[-.045em] text-[#0B1228]">{t("ref_land_h2_l1")} {t("ref_land_h2_kw")}</h2>
        </div>
        <ol className="mt-8 grid gap-4 md:grid-cols-3">
          {["ref_how_1", "ref_how_2", "ref_how_3"].map((key, index) => (
            <li key={key} className="cambra-paper-card p-6">
              <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-[#EFEDFF] text-[20px] font-bold text-[#4D3DF1]">{index + 1}</span>
              <p className="mt-6 text-[13px] font-semibold leading-relaxed text-[#3D4762]">{t(key)}</p>
            </li>
          ))}
        </ol>
        <div className="mt-6 flex flex-wrap items-center justify-between gap-5 rounded-2xl border border-[#DDE1EB] bg-white/70 px-6 py-5">
          <p className="flex items-center gap-2 text-[12px] font-semibold text-[#556079]"><ShieldCheck size={16} className="text-[#5B4CF5]" /> {t("ref_land_trigger")}</p>
          <Link to="/Terms" className="inline-flex items-center gap-2 text-[12px] font-bold text-[#4D3DF1]"><FileText size={13} /> {t("ref_terms_link")} <ArrowRight size={13} /></Link>
        </div>
      </section>
    </div>
  );
}
