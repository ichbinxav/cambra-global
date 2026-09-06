import { BRAND_ASSETS } from "@/lib/brandAssets";
import { useTranslation } from "@/lib/i18n.jsx";

/**
 * AnalyzingOverlay — shown while the payments audit runs (submitting=true).
 *
 * The bar is deliberately indeterminate. Only the backend response can finish
 * this state, so the interface never invents a percentage or completed stage.
 *
 * Pure presentation. No business logic, no data.
 */
/* I18N-GAP — step copy lives in the i18n dictionary; keys are resolved inside
   the component via t() so labels react to a language switch mid-session. */
const STEP_KEYS = ["overlay_step_1", "overlay_step_2", "overlay_step_3", "overlay_step_4"];

export default function AnalyzingOverlay() {
  const { t } = useTranslation();

  return (
    <div className="analysis-progress" role="status" aria-live="polite">
      <div className="analysis-progress__plane analysis-progress__plane--one" aria-hidden="true" />
      <div className="analysis-progress__plane analysis-progress__plane--two" aria-hidden="true" />
      <div className="analysis-progress__plane analysis-progress__plane--three" aria-hidden="true" />

      <div className="analysis-progress__content">
        <div className="analysis-progress__brand" aria-label="CAMBRA">
          <img src={BRAND_ASSETS.cMarkVoltioPng} alt="" width={38} height={38} draggable={false} />
          <strong>CAMBRA</strong>
        </div>
        <h2>{t("overlay_title")}</h2>

        <div className="analysis-progress__panel">
          <div className="analysis-progress__status"><span />{t("az_running")}</div>
          <div className="analysis-progress__track" aria-hidden="true"><span /></div>
          <ol>
            {STEP_KEYS.map((key, index) => (
              <li key={key}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <strong>{t(key)}</strong>
              </li>
            ))}
          </ol>
        </div>

        <p className="analysis-progress__privacy">{t("az_privacy_note")}</p>
      </div>
    </div>
  );
}
