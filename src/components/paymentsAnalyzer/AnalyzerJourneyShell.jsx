import { Link } from "react-router-dom";
import { ArrowLeft, Check, LockKeyhole } from "lucide-react";
import { useTranslation } from "@/lib/i18n.jsx";
import { getPaymentsJourneyCopy } from "@/lib/paymentsJourneyCopy";
import Navbar from "@/components/landing/Navbar";

export default function AnalyzerJourneyShell({ activeStep, onStepChange, children }) {
  const { lang, t } = useTranslation();
  const copy = getPaymentsJourneyCopy(lang);

  return (
    <div className="payment-journey min-h-screen">
      <Navbar />

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

      <div className="payment-journey__backbar">
        {activeStep > 1 ? (
          <button type="button" onClick={() => onStepChange?.(activeStep - 1)}>
            <ArrowLeft size={14} /> {t("az_back")}
          </button>
        ) : (
          <Link to="/"><ArrowLeft size={14} /> {t("az_back")}</Link>
        )}
      </div>

      <main className="payment-journey__main">{children}</main>
      <footer className="payment-journey__footer">
        <LockKeyhole size={13} /> {t("login_gate_trust_1")} · {t("az_privacy_note")}
      </footer>
    </div>
  );
}
