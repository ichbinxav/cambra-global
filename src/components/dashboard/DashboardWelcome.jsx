import { Link } from "react-router-dom";
import {
  ArrowRight,
  BarChart3,
  Check,
  FileText,
  FolderOpen,
  Plug,
  ShieldCheck,
  TrendingDown,
} from "lucide-react";
import { useTranslation } from "@/lib/i18n.jsx";

const STAGE_META = [
  { key: "analyze", labelKey: "nav_analyzer", detailKey: "state_a_title", icon: BarChart3 },
  { key: "verify", labelKey: "ac_verify_title", detailKey: "ct_page_sub", icon: ShieldCheck },
  { key: "recover", labelKey: "dh_start_recovery", detailKey: "ac_recover_why_coll", icon: TrendingDown },
];

function StageCard({ stage, state, index, onRecover }) {
  const { t } = useTranslation();
  const Icon = stage.icon;
  const isCurrent = state === "current";
  const isComplete = state === "complete";
  const sharedProps = {
    className: "group relative min-w-0 rounded-[20px] p-4 text-left transition-all duration-300 sm:p-5",
    style: {
      background: isCurrent
        ? "linear-gradient(145deg,#14112E 0%,#0D1730 100%)"
        : "rgba(255,255,255,.84)",
      border: isCurrent ? "1px solid rgba(91,76,245,.42)" : "1px solid rgba(20,18,50,.09)",
      boxShadow: isCurrent
        ? "0 22px 50px -34px rgba(39,31,132,.75)"
        : "0 18px 45px -40px rgba(20,18,50,.45)",
    },
  };

  const content = (
    <>
      <div className="flex items-start justify-between gap-3">
        <span
          className="inline-flex h-10 w-10 items-center justify-center rounded-[13px]"
          style={{
            color: isCurrent ? "#FFFFFF" : isComplete ? "#138A65" : "#5B4CF5",
            background: isCurrent ? "linear-gradient(135deg,#6E5BFF,#39C6F0)" : isComplete ? "#E9F8F2" : "#F0EEFF",
            border: isCurrent ? "1px solid rgba(255,255,255,.18)" : "1px solid rgba(91,76,245,.12)",
          }}
        >
          {isComplete ? <Check size={18} strokeWidth={2.5} /> : <Icon size={17} strokeWidth={1.9} />}
        </span>
        <span
          className="text-[10px] font-bold tracking-[.18em]"
          style={{ color: isCurrent ? "rgba(255,255,255,.58)" : "rgba(32,29,67,.44)" }}
        >
          {String(index + 1).padStart(2, "0")}
        </span>
      </div>
      <h3 className="mt-4 text-[15px] font-bold leading-tight" style={{ color: isCurrent ? "#FFFFFF" : "#151329" }}>
        {t(stage.labelKey)}
      </h3>
      <p className="mt-1.5 text-[11.5px] leading-relaxed" style={{ color: isCurrent ? "rgba(255,255,255,.62)" : "#69677A" }}>
        {t(stage.detailKey)}
      </p>
      {(isCurrent || isComplete) && (
        <span className="mt-3 inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-[.13em]" style={{ color: isCurrent ? "#7BD9F0" : "#138A65" }}>
          {isCurrent ? t("ac_eyebrow") : t("status_completed")}
          <ArrowRight size={10} className="transition-transform group-hover:translate-x-0.5" />
        </span>
      )}
    </>
  );

  if (stage.key === "analyze") return <Link to="/Analyzer" aria-current={isCurrent ? "step" : undefined} {...sharedProps}>{content}</Link>;
  if (stage.key === "verify") return <Link to="/ConnectStripe" aria-current={isCurrent ? "step" : undefined} {...sharedProps}>{content}</Link>;
  if (isCurrent && onRecover) return <button type="button" onClick={onRecover} aria-current="step" {...sharedProps}>{content}</button>;
  if (isComplete) return <Link to="/Reports" {...sharedProps}>{content}</Link>;
  return <div {...sharedProps} aria-disabled="true">{content}</div>;
}

export default function DashboardWelcome({
  firstName,
  hasAnalysis = false,
  verificationStatus = "estimated",
  hasLiveDeal = false,
  statusLabel,
  onStartRecovery = null,
}) {
  const { t } = useTranslation();
  const verified = verificationStatus === "verified";
  const stages = {
    analyze: hasAnalysis ? "complete" : "current",
    verify: verified ? "complete" : hasAnalysis ? "current" : "waiting",
    recover: hasLiveDeal ? "complete" : verified ? "current" : "waiting",
  };

  const shortcuts = [
    { to: "/Reports", label: t("rpt_title"), icon: FileText },
    { to: "/Vault", label: t("sidebar_documents"), icon: FolderOpen },
    { to: "/ConnectStripe", label: t("nav_connect"), icon: Plug },
  ];

  return (
    <section
      data-testid="dashboard-welcome"
      className="relative overflow-hidden rounded-[30px] border p-5 sm:p-7 lg:p-8"
      style={{
        background: "linear-gradient(145deg,rgba(255,255,255,.98),rgba(248,249,255,.94))",
        borderColor: "rgba(91,76,245,.13)",
        boxShadow: "0 34px 90px -62px rgba(20,18,50,.55), inset 0 1px 0 rgba(255,255,255,.95)",
      }}
    >
      <div aria-hidden className="pointer-events-none absolute -right-24 -top-32 h-[360px] w-[440px] rounded-full" style={{ background: "radial-gradient(circle,rgba(91,76,245,.15),rgba(57,198,240,.05) 48%,transparent 72%)", filter: "blur(22px)" }} />
      <div className="relative z-10 flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-3xl">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-[.2em]" style={{ color: "#5B4CF5" }}>
              <span className="h-px w-5 bg-[#8B7BFF]" />
              {t("dash_home_eyebrow")}
            </span>
            {statusLabel && (
              <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[9px] font-bold uppercase tracking-[.14em]" style={{ color: "#4A4665", background: "rgba(91,76,245,.07)", border: "1px solid rgba(91,76,245,.13)" }}>
                <span className="h-1.5 w-1.5 rounded-full bg-[#39C6F0]" />
                {statusLabel}
              </span>
            )}
          </div>
          <h1 className="mt-4 text-[clamp(34px,5vw,58px)] font-black leading-[.98] tracking-[-.045em]" style={{ color: "#0C0C16" }}>
            {t("dash_home_title", { name: firstName })}
          </h1>
          <p className="mt-4 max-w-2xl text-[14px] leading-relaxed sm:text-[15px]" style={{ color: "#666478" }}>
            {t("dash_home_sub")}
          </p>
        </div>
        <Link
          to="/Analyzer"
          className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-full px-5 text-sm font-bold text-white transition-transform hover:-translate-y-0.5"
          style={{ background: "linear-gradient(135deg,#5B4CF5,#318FE8)", boxShadow: "0 16px 32px -18px rgba(55,62,216,.72)" }}
        >
          {t("nav_analyzer")} <ArrowRight size={15} />
        </Link>
      </div>

      <div className="relative z-10 mt-8 border-t pt-6" style={{ borderColor: "rgba(20,18,50,.08)" }}>
        <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-[18px] font-bold tracking-[-.025em]" style={{ color: "#151329" }}>{t("dash_journey_title")}</h2>
            <p className="mt-1 text-[11.5px]" style={{ color: "#777489" }}>{t("dash_journey_sub")}</p>
          </div>
          <div className="mt-3 flex flex-wrap gap-2 sm:mt-0">
            {shortcuts.map(({ to, label, icon: Icon }) => (
              <Link key={to} to={to} className="inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 text-[11px] font-semibold transition-colors hover:bg-white" style={{ color: "#343145", background: "rgba(255,255,255,.62)", border: "1px solid rgba(20,18,50,.09)" }}>
                <Icon size={12} /> {label}
              </Link>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {STAGE_META.map((stage, index) => (
            <StageCard key={stage.key} stage={stage} state={stages[stage.key]} index={index} onRecover={onStartRecovery} />
          ))}
        </div>
      </div>
    </section>
  );
}
