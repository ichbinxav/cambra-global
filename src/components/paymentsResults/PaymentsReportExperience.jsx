import { useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  Database,
  FileSearch,
  Lightbulb,
  Loader2,
  Lock,
  LogOut,
  ShieldCheck,
  Sparkles,
  Target,
  Users,
} from "lucide-react";
import { useTranslation } from "@/lib/i18n.jsx";
import { getPaymentsJourneyCopy } from "@/lib/paymentsJourneyCopy";
import { getPaymentsReportCopy } from "@/lib/paymentsReportCopy";
import DownloadAuditButton from "@/components/paymentsResults/DownloadAuditButton";
import ShareResultButton from "@/components/paymentsResults/ShareResultButton";
import FeeBreakdownCard from "@/components/paymentsResults/FeeBreakdownCard";
import PeerBenchmark from "@/components/paymentsResults/PeerBenchmark";
import PaymentsDataInsights from "@/components/paymentsResults/PaymentsDataInsights";
import PaymentsInStoreInsights from "@/components/paymentsResults/PaymentsInStoreInsights";
import AssumptionsFootnote from "@/components/paymentsResults/AssumptionsFootnote";

function CambraMark() {
  return (
    <span className="payment-report__brand" aria-label="CAMBRA">
      <svg viewBox="0 0 40 40" aria-hidden="true"><path d="M20 4 34 12v7l-14 8-7-4v-6l7 4 8-4v-2l-8-5-8 5v10l8 5 9-5 5 3-14 8L6 28V12Z" /></svg>
      <strong>CAMBRA</strong>
    </span>
  );
}

function finite(value) {
  return Number.isFinite(Number(value));
}

function pctFromBps(value, locale) {
  if (!finite(value)) return "—";
  return `${new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value) / 100)}%`;
}

function weightedChannelRate(engine, field) {
  if (!engine?.combined || !Array.isArray(engine.channels)) return Number(engine?.[field]);
  const totals = engine.channels.reduce((acc, channel) => {
    const gmv = Number(channel?.input_snapshot?.monthly_gmv_eur);
    const rate = Number(channel?.engine_result?.[field]);
    if (!Number.isFinite(gmv) || gmv <= 0 || !Number.isFinite(rate)) return acc;
    return { weighted: acc.weighted + gmv * rate, gmv: acc.gmv + gmv };
  }, { weighted: 0, gmv: 0 });
  return totals.gmv > 0 ? totals.weighted / totals.gmv : NaN;
}

function ReportSectionHeading({ eyebrow, title, body }) {
  return (
    <header className="payment-report__section-heading">
      <span>{eyebrow}</span>
      <h1>{title}</h1>
      <p>{body}</p>
    </header>
  );
}

function LockedPreview({ label }) {
  return (
    <div className="payment-report__locked-preview" aria-label={label}>
      <Lock size={18} />
      <div><span /><span /><span /></div>
    </div>
  );
}

function UnlockPanel({ copy, isAuthenticated, status, onCreateAccount, onUnlock }) {
  return (
    <section className="payment-report__unlock-card" aria-labelledby="payment-report-unlock-title">
      <div className="payment-report__unlock-copy">
        <span className="payment-report__eyebrow"><Sparkles size={14} /> {copy.hero[0]}</span>
        <h2 id="payment-report-unlock-title">{copy.unlock[0]}</h2>
        <p>{copy.unlock[1]}</p>
        <ul>
          <li><Lock size={17} />{copy.unlock[2]}</li>
          <li><ShieldCheck size={17} />{copy.unlock[3]}</li>
          <li><CheckCircle2 size={17} />{copy.unlock[4]}</li>
        </ul>
      </div>
      <div className="payment-report__unlock-action">
        <button type="button" onClick={isAuthenticated ? onUnlock : onCreateAccount} disabled={status === "working"}>
          {status === "working" ? <><Loader2 size={17} className="animate-spin" />{copy.unlock[7]}</> : <>{isAuthenticated ? copy.unlock[6] : copy.unlock[5]}<ArrowRight size={17} /></>}
        </button>
        {isAuthenticated && (
          <p>
            {copy.unlock[9]}{" "}
            <Link to="/CollectiveTerms">{copy.unlock[10]}</Link>,{" "}
            <Link to="/Terms">{copy.unlock[11]}</Link> {" & "}
            <Link to="/Privacy">{copy.unlock[12]}</Link>.
          </p>
        )}
        {status === "error" && <div className="payment-report__unlock-error" role="alert">{copy.unlock[8]}</div>}
      </div>
    </section>
  );
}

export default function PaymentsReportExperience({
  payload,
  isAuthenticated,
  isVerifiedMode,
  isOwnedResultPath,
  reportAccess,
  unlockStatus,
  leaveStatus,
  rateTable,
  onBack,
  onCreateAccount,
  onUnlock,
  onLeave,
  onViewStatus,
  onBookReview,
}) {
  const { t, lang, locale, formatCurrency } = useTranslation();
  const copy = getPaymentsReportCopy(lang);
  const journey = getPaymentsJourneyCopy(lang);
  const [activeTab, setActiveTab] = useState(0);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const engine = payload?.engine_result || {};
  const input = payload?.input_snapshot || {};
  const annual = engine?.annual_savings_eur || {};
  const monthly = engine?.monthly_savings_eur || {};
  const current = weightedChannelRate(engine, "current_effective_bps");
  const target = weightedChannelRate(engine, "achievable_effective_bps");
  const gap = finite(current) && finite(target) ? current - target : null;
  const fullUnlocked = Boolean(isVerifiedMode || isOwnedResultPath || reportAccess?.unlocked);
  const poolActive = reportAccess?.membership_status === "ACTIVE";
  const poolRevoked = reportAccess?.membership_status === "REVOKED";
  const reportName = input.provider_slug || t("brand_fallback");
  const evidenceLabel = isVerifiedMode
    ? t("badge_verified")
    : engine?.cohort?.verified === true ? t("badge_public_pricing") : copy.hero[11];
  const sectionIndex = activeTab * 2;
  const sectionTitle = copy.sections[sectionIndex];
  const sectionBody = copy.sections[sectionIndex + 1];
  const safeInputKeys = [
    "country",
    "currency",
    "channel",
    "provider_slug",
    "monthly_gmv_eur",
    "avg_ticket_eur",
    "international_pct",
    "debit_pct",
    "credit_pct",
  ];
  const safeInputLabels = {
    country: "az_country_label",
    currency: "az_currency_label",
    channel: "az_channel_aria",
    provider_slug: "az_provider_label",
    monthly_gmv_eur: "az_lbl_gmv",
    avg_ticket_eur: "az_lbl_ticket",
    international_pct: "az_intl_title",
    debit_pct: "az_lbl_debit",
    credit_pct: "ins_cardmix_credit",
  };
  const safeInputs = safeInputKeys
    .filter((key) => ["string", "number"].includes(typeof input[key]))
    .map((key) => [key, t(safeInputLabels[key]), input[key]]);
  const assumptionLabels = Array.isArray(engine.assumptions)
    ? engine.assumptions
        .map((item) => {
          if (typeof item === "string") return item;
          if (!item || typeof item !== "object") return null;
          return item.message || item.label || item.code || null;
        })
        .filter(Boolean)
    : [];
  const inputInternational = Array.isArray(input.channels)
    ? input.channels.some((channel) => Number(channel?.international_pct) > 0)
    : Number(input.international_pct) > 0;
  const fixedFeeSignal = assumptionLabels.some((item) => /fixed fee|monthly fee|terminal fee/i.test(item));
  const actionItems = [
    copy.actions[0],
    ...(inputInternational ? [copy.actions[1]] : []),
    ...(fixedFeeSignal ? [copy.actions[2]] : []),
  ];

  const selectTab = (index) => {
    if (index > 0 && !fullUnlocked) return;
    setActiveTab(index);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const steps = journey.steps;
  const resultStep = fullUnlocked ? 6 : 5;

  const poolCard = (poolActive || poolRevoked) && (
    <section className={`payment-report__pool-state ${poolRevoked ? "is-revoked" : ""}`}>
      <div><Users size={19} /><div><strong>{poolActive ? copy.pool[0] : copy.pool[2]}</strong><p>{poolActive ? copy.pool[1] : copy.pool[3]}</p></div></div>
      {poolActive && !confirmLeave && <button type="button" onClick={() => setConfirmLeave(true)}><LogOut size={15} />{copy.pool[4]}</button>}
      {poolActive && confirmLeave && <div className="payment-report__leave-actions"><button type="button" onClick={() => setConfirmLeave(false)}>{copy.pool[6]}</button><button type="button" disabled={leaveStatus === "working"} onClick={onLeave}>{leaveStatus === "working" ? <Loader2 size={15} className="animate-spin" /> : null}{copy.pool[5]}</button></div>}
    </section>
  );

  return (
    <div className="payment-report">
      <header className="payment-report__topbar">
        <CambraMark />
        <div className="payment-report__study"><strong>{reportName}</strong><span>{copy.hero[0]}</span></div>
        <div className="payment-report__tools">
          <ShareResultButton engineResult={engine} inputSnapshot={input} isAuthenticated={isAuthenticated} />
          <DownloadAuditButton engineResult={engine} inputSnapshot={input} rateTable={rateTable} brandName={reportName} />
        </div>
      </header>

      <nav className="payment-report__journey" aria-label={`${resultStep} / 6`}>
        {steps.map((label, index) => {
          const n = index + 1;
          const complete = n < resultStep || (n === 6 && fullUnlocked);
          const active = n === resultStep && !complete;
          return <div key={label} className={`${complete ? "is-complete" : ""} ${active ? "is-active" : ""}`}><span>{complete ? <Check size={13} /> : n}</span><small>{label}</small></div>;
        })}
      </nav>

      <nav className="payment-report__tabs" aria-label={copy.hero[0]}>
        {copy.tabs.map((label, index) => (
          <button key={label} type="button" className={activeTab === index ? "is-active" : ""} aria-current={activeTab === index ? "page" : undefined} aria-disabled={index > 0 && !fullUnlocked} onClick={() => selectTab(index)}>
            {index > 0 && !fullUnlocked && <Lock size={12} />}{label}
          </button>
        ))}
      </nav>

      <main className="payment-report__main">
        {activeTab === 0 && (
          <>
            <ReportSectionHeading eyebrow={`${copy.tabs[0]} · 01`} title={copy.sections[0]} body={copy.sections[1]} />
            <div className="payment-report__hero-grid">
              <section className="payment-report__opportunity">
                <span>{copy.hero[3]}</span>
                <strong>{finite(annual.point) ? formatCurrency(Math.round(Number(annual.point)), "EUR") : "—"}</strong>
                <small>{copy.hero[4]}</small>
                <div><span>{copy.hero[5]}</span><b>{finite(annual.lo) && finite(annual.hi) ? `${formatCurrency(Math.round(Number(annual.lo)), "EUR")} – ${formatCurrency(Math.round(Number(annual.hi)), "EUR")}` : "—"}</b></div>
              </section>
              <section className="payment-report__meaning">
                <span>{copy.sections[6]}</span>
                <div><CircleDollarSign size={22} /><p>{copy.hero[6]}<strong>{pctFromBps(current, locale)}</strong></p></div>
                <div><Target size={22} /><p>{copy.hero[7]}<strong>{fullUnlocked ? pctFromBps(target, locale) : copy.hero[8]}</strong></p></div>
                <div><Database size={22} /><p>{copy.hero[10]}<strong>{evidenceLabel}</strong></p></div>
              </section>
            </div>
            {!fullUnlocked ? (
              <>
                <UnlockPanel copy={copy} isAuthenticated={isAuthenticated} status={unlockStatus} onCreateAccount={onCreateAccount} onUnlock={onUnlock} />
                <div className="payment-report__preview-grid"><LockedPreview label={copy.tabs[1]} /><LockedPreview label={copy.tabs[2]} /><LockedPreview label={copy.tabs[4]} /></div>
              </>
            ) : (
              <>
                <div className="payment-report__kpis">
                  <article><Clock3 size={18} /><span>{copy.hero[9]}</span><strong>{finite(monthly.point) ? formatCurrency(Math.round(Number(monthly.point)), "EUR") : "—"}</strong></article>
                  <article><BarChart3 size={18} /><span>{copy.hero[6]}</span><strong>{pctFromBps(current, locale)}</strong></article>
                  <article><Target size={18} /><span>{copy.hero[7]}</span><strong>{pctFromBps(target, locale)}</strong></article>
                  <article><ShieldCheck size={18} /><span>{copy.hero[10]}</span><strong>{evidenceLabel}</strong></article>
                </div>
                {poolCard}
              </>
            )}
          </>
        )}

        {activeTab === 1 && fullUnlocked && (
          <>
            <ReportSectionHeading eyebrow={`${copy.tabs[1]} · 02`} title={sectionTitle} body={sectionBody} />
            <div className="payment-report__cost-grid">
              <section className="payment-report__cost-list">
                <div><span>{copy.hero[6]}</span><strong>{pctFromBps(current, locale)}</strong></div>
                <div><span>{copy.hero[7]}</span><strong>{pctFromBps(target, locale)}</strong></div>
                <div><span>{copy.hero[5]}</span><strong>{finite(gap) ? pctFromBps(gap, locale) : "—"}</strong></div>
              </section>
              <div className="payment-report__breakdown-stack">
                {engine?.combined && Array.isArray(engine.channels)
                  ? engine.channels.map((channel) => (
                      <div key={channel.channel} className="payment-report__channel-breakdown">
                        <span>{channel.channel === "in_store" ? t("analyzer_channel_in_store") : t("analyzer_channel_online")}</span>
                        <FeeBreakdownCard engineResult={channel.engine_result} locked={false} />
                      </div>
                    ))
                  : <FeeBreakdownCard engineResult={engine} locked={false} />}
              </div>
            </div>
          </>
        )}

        {activeTab === 2 && fullUnlocked && (
          <>
            <ReportSectionHeading eyebrow={`${copy.tabs[2]} · 03`} title={sectionTitle} body={sectionBody} />
            <div className="payment-report__benchmark-stack">
              {engine?.combined && Array.isArray(engine.channels)
                ? engine.channels.map((channel) => (
                    <div key={channel.channel} className="payment-report__channel-benchmark">
                      <span>{channel.channel === "in_store" ? t("analyzer_channel_in_store") : t("analyzer_channel_online")}</span>
                      <PeerBenchmark engineResult={channel.engine_result} country={input.country} rateTable={rateTable} />
                    </div>
                  ))
                : <PeerBenchmark engineResult={engine} country={input.country} rateTable={rateTable} />}
            </div>
          </>
        )}

        {activeTab === 3 && fullUnlocked && (
          <>
            <ReportSectionHeading eyebrow={`${copy.tabs[3]} · 04`} title={sectionTitle} body={sectionBody} />
            {engine?.combined && Array.isArray(engine.channels) && (
              <div className="payment-report__channel-grid">
                {engine.channels.map((channel) => <article key={channel.channel}><span>{channel.channel === "in_store" ? t("analyzer_channel_in_store") : t("analyzer_channel_online")}</span><strong>{pctFromBps(channel.engine_result?.current_effective_bps, locale)}</strong><small>{finite(channel.engine_result?.annual_savings_eur?.point) ? formatCurrency(Math.round(Number(channel.engine_result.annual_savings_eur.point)), "EUR") : "—"} {copy.hero[4]}</small></article>)}
              </div>
            )}
            <div className="payment-report__legacy-panels">
              <PaymentsDataInsights engineResult={engine} inputSnapshot={input} />
              <PaymentsInStoreInsights engineResult={engine} inputSnapshot={input} />
            </div>
          </>
        )}

        {activeTab === 4 && fullUnlocked && (
          <>
            <ReportSectionHeading eyebrow={`${copy.tabs[4]} · 05`} title={sectionTitle} body={sectionBody} />
            <div className="payment-report__action-grid">
              <ol>
                {actionItems.map((action, index) => <li key={action}><span>0{index + 1}</span><div><strong>{action}</strong><small>{index === 0 ? copy.hero[6] : index === 1 ? copy.hero[10] : copy.hero[5]}</small></div><ChevronRight size={18} /></li>)}
              </ol>
              <aside>
                <span>{copy.tabs[4]}</span>
                <h2>{copy.actions[0]}.</h2>
                <p>{copy.sections[9]}</p>
                <button type="button" onClick={onViewStatus}>{copy.actions[3]}<ArrowRight size={16} /></button>
                <button type="button" onClick={onBookReview}>{copy.actions[4]}</button>
                <small><ShieldCheck size={15} />{copy.unlock[3]}</small>
              </aside>
            </div>
            {poolCard}
          </>
        )}

        {activeTab === 5 && fullUnlocked && (
          <>
            <ReportSectionHeading eyebrow={`${copy.tabs[5]} · 06`} title={sectionTitle} body={sectionBody} />
            <div className="payment-report__method-grid">
              <section><FileSearch size={20} /><h2>{copy.sections[10]}</h2><dl>{safeInputs.map(([key, label, value]) => <div key={key}><dt>{label}</dt><dd>{String(value)}</dd></div>)}</dl></section>
              <section><Lightbulb size={20} /><h2>{copy.sections[11]}</h2><ol>{assumptionLabels.length ? assumptionLabels.map((item, index) => <li key={`${index}-${item}`}>{item}</li>) : <li>{copy.sections[11]}</li>}</ol><div className="payment-report__engine"><span>{t("pdf_engine_version")}</span><strong>{payload?.engine_version || engine.engine_version || "—"}</strong></div></section>
            </div>
            <AssumptionsFootnote engineResult={engine} engineVersion={payload?.engine_version} providerSlug={input.provider_slug || null} />
          </>
        )}

        <footer className="payment-report__footer"><button type="button" onClick={onBack}><ArrowLeft size={15} />{t("results_rerun")}</button><span><ShieldCheck size={14} />{copy.sections[11]}</span></footer>
      </main>
    </div>
  );
}
