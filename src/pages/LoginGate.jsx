import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, ArrowRight, Check, LockKeyhole, Search, ShieldCheck } from "lucide-react";
import { base44 } from "@/api/base44Client";
import HeaderBrand from "@/components/shared/HeaderBrand";
import SectionLabel from "@/components/shared/SectionLabel";
import {
  REFERRAL_CODE_PATTERN,
  REFERRAL_STORAGE_KEY,
} from "@/components/referrals/ReferralAttributionCapture";
import { useTranslation } from "@/lib/i18n.jsx";
import { safeReturnUrl } from "@/lib/safeRedirect";
import { SEO_ORIGIN } from "@/lib/seoConfig";
import { BASE_FEE_PCT, ENTRY_FEE_PCT, STEP_POINTS } from "@/lib/referralProgram";

function readStoredCode() {
  try { return sessionStorage.getItem(REFERRAL_STORAGE_KEY)?.trim() || ""; }
  catch { return ""; }
}

export default function LoginGate() {
  const { t } = useTranslation();

  const baseReturnUrl = useMemo(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const fromQuery = params.get("next");
      if (fromQuery) return safeReturnUrl(fromQuery, window.location.origin);
      const stored = sessionStorage.getItem("cambra_redirect_after_login");
      if (stored) return safeReturnUrl(stored, window.location.origin);
    } catch {}
    return `${window.location.origin}/Dashboard`;
  }, []);

  const initialCode = useMemo(() => {
    try {
      const pageParams = new URLSearchParams(window.location.search);
      const direct = pageParams.get("ref")?.trim();
      const nested = new URL(baseReturnUrl).searchParams.get("ref")?.trim();
      return direct || nested || readStoredCode();
    } catch {
      return readStoredCode();
    }
  }, [baseReturnUrl]);

  const [referralCode, setReferralCode] = useState(initialCode);
  const [showCodeError, setShowCodeError] = useState(false);
  const [codeStatus, setCodeStatus] = useState(() => {
    if (!initialCode) return "empty";
    return REFERRAL_CODE_PATTERN.test(initialCode) ? "checking" : "invalid";
  });
  const [continuing, setContinuing] = useState(false);
  const normalizedCode = referralCode.trim();
  const codeFormatValid = !normalizedCode || REFERRAL_CODE_PATTERN.test(normalizedCode);
  const hasReferral = Boolean(normalizedCode && codeStatus === "valid");

  const verifyCode = useCallback(async (code) => {
    if (!REFERRAL_CODE_PATTERN.test(code)) return false;
    try {
      const response = await base44.functions.invoke("getMyReferralStatus", { action: "validate_code", code });
      const body = response?.data || response;
      return body?.ok === true && body?.eligible === true;
    } catch {
      return false;
    }
  }, []);

  useEffect(() => {
    if (!normalizedCode) {
      setCodeStatus("empty");
      setShowCodeError(false);
      return undefined;
    }
    if (!REFERRAL_CODE_PATTERN.test(normalizedCode)) {
      setCodeStatus("invalid");
      return undefined;
    }

    let cancelled = false;
    setCodeStatus("checking");
    const timer = window.setTimeout(async () => {
      const eligible = await verifyCode(normalizedCode);
      if (cancelled) return;
      setCodeStatus(eligible ? "valid" : "invalid");
      setShowCodeError(!eligible);
    }, 260);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [normalizedCode, verifyCode]);

  const returnUrl = useMemo(() => {
    try {
      const url = new URL(baseReturnUrl);
      if (hasReferral) url.searchParams.set("ref", normalizedCode);
      return safeReturnUrl(url.toString(), window.location.origin);
    } catch {
      return baseReturnUrl;
    }
  }, [baseReturnUrl, hasReferral, normalizedCode]);

  const intent = useMemo(() => {
    try { return new URL(returnUrl).pathname; }
    catch { return ""; }
  }, [returnUrl]);
  const isConnectIntent = /\/ConnectTools|\/ConnectIntegrations|\/ConnectStripe|\/UploadStatement/i.test(returnUrl);
  const isReferralManagementIntent = /^\/Referrals\/?$/i.test(intent);
  const headline = isReferralManagementIntent
    ? t("ref_title")
    : isConnectIntent
      ? t("login_gate_connect_headline")
      : t("login_gate_headline");
  const sub = isReferralManagementIntent
    ? t("ref_sub")
    : isConnectIntent
      ? t("login_gate_connect_sub")
      : t("login_gate_sub");

  const handleContinue = useCallback(async () => {
    if (continuing) return;
    if (!codeFormatValid) {
      setShowCodeError(true);
      return;
    }
    setContinuing(true);
    let approvedCode = "";
    if (normalizedCode) {
      const eligible = codeStatus === "valid" || await verifyCode(normalizedCode);
      if (!eligible) {
        setCodeStatus("invalid");
        setShowCodeError(true);
        setContinuing(false);
        return;
      }
      approvedCode = normalizedCode;
    }
    try {
      const destination = new URL(baseReturnUrl);
      if (approvedCode) {
        destination.searchParams.set("ref", approvedCode);
        sessionStorage.setItem(REFERRAL_STORAGE_KEY, approvedCode);
      }
      const approvedReturnUrl = safeReturnUrl(destination.toString(), window.location.origin);
      if (/^(localhost|127\.0\.0\.1)$/i.test(window.location.hostname)) {
        const parsed = new URL(approvedReturnUrl);
        const productionReturnUrl = `${SEO_ORIGIN}${parsed.pathname}${parsed.search}${parsed.hash}`;
        window.location.href = `${SEO_ORIGIN}/login?from_url=${encodeURIComponent(productionReturnUrl)}`;
        return;
      }
      base44.auth.redirectToLogin(approvedReturnUrl);
    } catch {
      window.location.href = baseReturnUrl;
      return;
    }
    setContinuing(false);
  }, [baseReturnUrl, codeFormatValid, codeStatus, continuing, normalizedCode, verifyCode]);

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === "Enter") handleContinue();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleContinue]);

  return (
    <div className="cambra-auth-page min-h-screen">
      <header className="cambra-auth-header">
        <HeaderBrand to="/" tone="dark" />
        <Link to={hasReferral ? `/Invite?ref=${encodeURIComponent(normalizedCode)}` : "/"} className="inline-flex min-h-10 items-center gap-2 text-[13px] font-semibold text-white/70 hover:text-white">
          <ArrowLeft size={14} /> {t("bp_back")}
        </Link>
      </header>

      <main className="cambra-auth-main">
        <section className="max-w-[680px]">
          {hasReferral && (
            <div className="mb-7 inline-flex items-center gap-2 rounded-lg border border-[#CFC9FF] bg-[#F2F0FF] px-3 py-2 text-[11px] font-bold uppercase tracking-[.13em] text-[#4231E6]">
              <Check size={14} /> {ENTRY_FEE_PCT}% · {t("ref_land_t3_label")}
            </div>
          )}
          <SectionLabel>{isReferralManagementIntent ? t("ref_land_eyebrow") : t("login_gate_eyebrow")}</SectionLabel>
          <h1 className="mt-6 max-w-[680px] text-[clamp(42px,5.2vw,70px)] font-bold leading-[.99] tracking-[-.058em] text-[#091126]">
            {hasReferral ? `${BASE_FEE_PCT}% → ${ENTRY_FEE_PCT}%` : headline}
          </h1>
          <p className="mt-6 max-w-[620px] text-[clamp(15px,1.35vw,18px)] leading-[1.65] text-[#626B86]">
            {hasReferral ? t("ref_land_t3_note", { base: `${BASE_FEE_PCT}%` }) : sub}
          </p>

          <div className="cambra-paper-card mt-9 max-w-[610px] p-5 sm:p-6">
            <label htmlFor="registration-referral-code" className="text-[12px] font-bold text-[#1A2340]">
              {t("ref_code_label")}
            </label>
            <div className="relative mt-2">
              <input
                id="registration-referral-code"
                value={referralCode}
                onChange={(event) => {
                  setReferralCode(event.target.value);
                  setShowCodeError(false);
                  setCodeStatus(event.target.value.trim() ? "checking" : "empty");
                }}
                onBlur={() => setShowCodeError(Boolean(normalizedCode && codeStatus === "invalid"))}
                inputMode="text"
                autoComplete="off"
                aria-invalid={showCodeError && codeStatus === "invalid" ? "true" : "false"}
                aria-describedby="registration-referral-help"
                placeholder={t("ref_code_placeholder")}
                className="h-12 w-full rounded-xl border border-[#D8DCE8] bg-white px-4 pr-12 font-mono text-[13px] font-semibold tracking-[.06em] text-[#11182D] outline-none transition focus:border-[#7567F8] focus:ring-4 focus:ring-[#7567F8]/10"
              />
              <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-[#6C5CF5]">
                {hasReferral ? <Check size={17} /> : <Search size={17} className={codeStatus === "checking" ? "animate-pulse" : ""} />}
              </span>
            </div>
            <p id="registration-referral-help" className={`mt-2 text-[11px] leading-relaxed ${showCodeError && codeStatus === "invalid" ? "font-semibold text-[#B62D48]" : "text-[#7B8399]"}`}>
              {showCodeError && codeStatus === "invalid" ? t("ref_code_invalid") : t("ref_code_help")}
            </p>

            <button
              type="button"
              onClick={handleContinue}
              disabled={continuing}
              className="mt-5 inline-flex min-h-[52px] w-full items-center justify-center gap-2 rounded-xl bg-[var(--g-voltio)] px-6 text-[14px] font-bold text-white shadow-[0_18px_36px_-22px_rgba(91,76,245,.9)] transition hover:-translate-y-0.5 disabled:cursor-wait disabled:opacity-60"
            >
              {continuing ? t("ref_loading") : t("login_gate_continue")} <ArrowRight size={16} />
            </button>
            <p className="mt-3 text-center text-[11px] text-[#858CA0]">{t("login_gate_continue_sub")}</p>
          </div>

          <p className="mt-5 max-w-[610px] text-center text-[10.5px] leading-relaxed text-[#8A91A4]">
            {t("login_gate_terms")} <Link to="/Terms" className="underline">{t("login_gate_terms_link")}</Link> {t("login_gate_and")} <Link to="/Privacy" className="underline">{t("login_gate_privacy_link")}</Link>.
          </p>
        </section>

        <aside className="cambra-dark-panel cambra-auth-proof">
          <div>
            <SectionLabel tone="dark">{hasReferral ? t("ref_land_eyebrow") : t("login_gate_benefits_title")}</SectionLabel>
            <h2 className="mt-6 text-[clamp(27px,3vw,42px)] font-bold leading-[1.05] tracking-[-.045em] text-white">
              {hasReferral ? t("ref_land_t3_label") : t("login_gate_benefits_title")}
            </h2>
            {hasReferral && (
              <div className="mt-9 flex items-end justify-between gap-5 border-b border-white/12 pb-8">
                <div><span className="text-[12px] text-white/55">{BASE_FEE_PCT}%</span><strong className="block text-[58px] font-bold leading-none tracking-[-.06em] text-white">{BASE_FEE_PCT}%</strong></div>
                <div className="pb-2 text-center"><span className="text-[12px] font-semibold text-white/70">−{STEP_POINTS} pts</span><ArrowRight className="mt-2 text-white/40" size={34} /></div>
                <div className="text-right"><span className="text-[12px] text-[#B8AEFF]">{ENTRY_FEE_PCT}%</span><strong className="block bg-gradient-to-br from-[#C2B7FF] to-[#6C5CF5] bg-clip-text text-[58px] font-bold leading-none tracking-[-.06em] text-transparent">{ENTRY_FEE_PCT}%</strong></div>
              </div>
            )}
            <ul className="mt-8 space-y-5">
              {[
                { icon: Search, text: t("login_gate_b1") },
                { icon: LockKeyhole, text: t("login_gate_b2") },
                { icon: ShieldCheck, text: t("login_gate_b3") },
              ].map(({ icon: Icon, text }) => (
                <li key={text} className="flex items-center gap-4 border-b border-white/[.09] pb-5 text-[14px] font-semibold text-white/82 last:border-0">
                  <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#8B7BFF]/25 bg-[#8B7BFF]/10 text-[#B8AEFF]"><Icon size={17} /></span>
                  {text}
                </li>
              ))}
            </ul>
            <p className="mt-7 text-[11px] leading-relaxed text-white/48">{t("login_gate_footnote")}</p>
          </div>
        </aside>
      </main>
    </div>
  );
}
