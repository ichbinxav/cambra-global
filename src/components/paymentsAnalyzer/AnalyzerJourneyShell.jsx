import { Link } from "react-router-dom";
import { Check, LockKeyhole } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import { useTranslation } from "@/lib/i18n.jsx";
import LanguageSwitcher from "@/components/shared/LanguageSwitcher";
import MarketSwitcher from "@/components/shared/MarketSwitcher";
import { getPaymentsJourneyCopy } from "@/lib/paymentsJourneyCopy";
import HeaderBrand from "@/components/shared/HeaderBrand";

export default function AnalyzerJourneyShell({ activeStep, onStepChange, children }) {
  const { isAuthenticated } = useAuth();
  const { lang, t } = useTranslation();
  const copy = getPaymentsJourneyCopy(lang);

  return (
    <div className="payment-journey min-h-screen">
      <header className="payment-journey__header">
        <HeaderBrand to={isAuthenticated ? "/Dashboard" : "/"} tone="dark" ariaLabel="CAMBRA" />
        <div className="payment-journey__tools">
          <MarketSwitcher variant="dark" />
          <LanguageSwitcher variant="dark" />
          <Link className="payment-journey__account" to={isAuthenticated ? "/Dashboard" : "/LoginGate?next=%2FAnalyzer"}>
            {t(isAuthenticated ? "nav_dashboard" : "nav_sign_in")}
          </Link>
        </div>
      </header>

      <nav className="payment-journey__stepper" aria-label={t("az_progress", { done: Math.min(activeStep, 6), total: 6 })}>
        <ol>
          {copy.steps.map((label, index) => {
            const step = index + 1;
            const complete = step < activeStep;
            const current = step === activeStep;
            const reachable = step <= activeStep;
            return (
              <li key={label} className={current ? "is-current" : complete ? "is-complete" : ""}>
                <button
                  type="button"
                  onClick={() => reachable && onStepChange?.(step)}
                  disabled={!reachable}
                  aria-current={current ? "step" : undefined}
                >
                  <span className="payment-journey__step-number">{complete ? <Check size={13} strokeWidth={3} /> : step}</span>
                  <span className="payment-journey__step-label">{label}</span>
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      <main className="payment-journey__main">{children}</main>
      <footer className="payment-journey__footer">
        <LockKeyhole size={13} /> {t("login_gate_trust_1")} · {t("az_privacy_note")}
      </footer>
    </div>
  );
}
