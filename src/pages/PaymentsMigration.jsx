import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { ArrowLeft, Check, Circle, Clock3, ShieldCheck, TriangleAlert } from "lucide-react";
import PageHero from "@/components/shared/PageHero";
import { useTranslation } from "@/lib/i18n.jsx";

const STAGES = [
  { key: "plan", labelKey: "mig_stage_plan" },
  { key: "prepare", labelKey: "mig_stage_prepare" },
  { key: "test", labelKey: "mig_stage_test" },
  { key: "approve", labelKey: "mig_stage_approve" },
  { key: "live", labelKey: "mig_stage_live" },
  { key: "verify", labelKey: "mig_stage_verify" },
];

const TASK_LABELS = {
  plan_ready: "mig_task_plan_ready",
  provider_setup: "mig_task_provider_setup",
  technical_setup: "mig_task_technical_setup",
  sandbox_testing: "mig_task_sandbox_testing",
  merchant_approval: "mig_task_merchant_approval",
  go_live: "mig_task_go_live",
  verify_savings: "mig_task_verify_savings",
};

function money(n) {
  return Number(n || 0).toLocaleString(undefined, { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
}

function StatusIcon({ status }) {
  if (status === "done") return <Check size={14} />;
  if (status === "blocked") return <TriangleAlert size={14} />;
  if (status === "in_progress") return <Clock3 size={14} />;
  return <Circle size={12} />;
}

export default function PaymentsMigration() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [migration, setMigration] = useState(null);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const r = await base44.functions.invoke("getMyPaymentsMigration", {});
      const d = r?.data || r;
      if (d?.error) throw new Error(d.error);
      setMigration(d?.migration || null);
    } catch (e) {
      setError(e?.message || "Unable to load migration");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const currentIndex = useMemo(() => {
    if (!migration) return -1;
    if (migration.current_stage === "complete") return STAGES.length;
    return STAGES.findIndex(s => s.key === migration.current_stage);
  }, [migration]);

  if (loading) {
    return <div className="py-24 text-center text-sm text-white/55">{t("mig_loading")}</div>;
  }

  if (error) {
    return (
      <div className="cambra-card p-8 text-center">
        <p className="text-white font-bold mb-2">{t("mig_error_title")}</p>
        <p className="text-sm text-white/55 mb-5">{error}</p>
        <button onClick={load} className="h-10 px-5 rounded-full bg-white text-[#06080F] text-sm font-bold">{t("mig_retry")}</button>
      </div>
    );
  }

  if (!migration) {
    return (
      <div>
        <PageHero eyebrow={t("mig_eyebrow")} title={t("mig_title")} subtitle={t("mig_empty_subtitle")} icon={ShieldCheck} />
        <div className="cambra-card p-8 text-center">
          <p className="text-sm text-white/60 mb-5">{t("mig_empty_body")}</p>
          <Link to="/Reports" className="inline-flex h-10 items-center px-5 rounded-full bg-white text-[#06080F] text-sm font-bold">{t("mig_back_reports")}</Link>
        </div>
      </div>
    );
  }

  const providerLabel = migration.provider_from && migration.provider_to
    ? `${migration.provider_from} → ${migration.provider_to}`
    : migration.provider_to || t("mig_rate_change");

  return (
    <div>
      <PageHero
        eyebrow={t("mig_eyebrow")}
        title={t("mig_title")}
        subtitle={t("mig_subtitle")}
        icon={ShieldCheck}
        actions={<Link to="/Reports" className="inline-flex items-center gap-2 text-sm font-semibold text-white/60 hover:text-white"><ArrowLeft size={15} />{t("mig_back_reports")}</Link>}
      />

      <div className="cambra-card p-6 sm:p-8 mb-6 overflow-hidden">
        <div className="grid sm:grid-cols-3 gap-5">
          <div>
            <p className="cc-eyebrow mb-1">{t("mig_move")}</p>
            <p className="text-xl font-black text-white tracking-tight">{providerLabel}</p>
          </div>
          <div>
            <p className="cc-eyebrow mb-1">{t("mig_savings")}</p>
            <p className="text-xl font-black text-white tracking-tight">{money(migration.projected_savings_annual)}<span className="text-sm text-white/45 font-semibold">/yr</span></p>
          </div>
          <div>
            <p className="cc-eyebrow mb-1">{t("mig_progress")}</p>
            <p className="text-xl font-black text-white tracking-tight">{migration.progress_pct}%</p>
          </div>
        </div>
        <div className="h-1.5 rounded-full bg-white/[0.07] mt-6 overflow-hidden"><div className="h-full rounded-full bg-white transition-all" style={{ width: `${migration.progress_pct}%` }} /></div>
      </div>

      <div className="cambra-card p-6 sm:p-8 mb-6">
        <p className="cc-eyebrow mb-2">{t("mig_now")}</p>
        <h2 className="text-lg font-black text-white mb-1">{migration.current_stage === "complete" ? t("mig_complete") : t(STAGES[Math.max(0, currentIndex)]?.labelKey || "mig_stage_plan")}</h2>
        <p className="text-sm text-white/55 leading-relaxed max-w-2xl">
          {migration.blocked_count > 0 ? t("mig_blocked_copy") : t(`mig_stage_${migration.current_stage}_copy`)}
        </p>
      </div>

      <div className="grid lg:grid-cols-[220px_1fr] gap-6">
        <div className="cambra-card p-4 h-fit">
          <p className="text-[10px] font-bold tracking-[0.18em] uppercase text-white/40 px-2 mb-2">{t("mig_journey")}</p>
          <div className="space-y-1">
            {STAGES.map((stage, index) => {
              const complete = currentIndex > index || migration.current_stage === "complete";
              const active = currentIndex === index;
              return (
                <div key={stage.key} className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2.5 text-sm ${active ? "bg-white/[0.07] text-white" : "text-white/50"}`}>
                  <span className={`h-5 w-5 rounded-full border flex items-center justify-center ${complete ? "bg-white text-[#06080F] border-white" : active ? "border-white/60" : "border-white/15"}`}>{complete ? <Check size={12} /> : <span className="text-[9px]">{index + 1}</span>}</span>
                  <span className="font-semibold">{t(stage.labelKey)}</span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="cambra-card p-6 sm:p-8">
          <div className="flex items-start justify-between gap-4 mb-5">
            <div>
              <p className="cc-eyebrow mb-1">{t("mig_plan")}</p>
              <h2 className="text-lg font-black text-white">{t("mig_plan_title")}</h2>
            </div>
            <span className="text-[10px] uppercase tracking-[0.16em] font-bold text-white/45 border border-white/[0.10] rounded-full px-2.5 py-1">{t("mig_managed")}</span>
          </div>

          <div className="space-y-2">
            {migration.tasks.map((task) => (
              <div key={task.id} className="flex items-start gap-3 rounded-xl border border-white/[0.08] bg-white/[0.025] px-4 py-3.5">
                <div className={`mt-0.5 h-6 w-6 rounded-full flex items-center justify-center border ${task.status === "done" ? "bg-white text-[#06080F] border-white" : task.status === "blocked" ? "border-amber-400/35 text-amber-300" : task.status === "in_progress" ? "border-cyan-300/35 text-cyan-300" : "border-white/15 text-white/35"}`}>
                  <StatusIcon status={task.status} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-white">{t(TASK_LABELS[task.step_name] || "mig_task_generic")}</p>
                  {task.blocked_reason && <p className="text-xs text-amber-300/80 mt-1">{task.blocked_reason}</p>}
                  {task.requires_brand_input && task.status !== "done" && <p className="text-[11px] text-white/40 mt-1">{t("mig_we_will_ask")}</p>}
                </div>
                <span className="text-[10px] uppercase tracking-[0.12em] font-bold text-white/35 pt-1">{t(`mig_status_${task.status}`)}</span>
              </div>
            ))}
          </div>

          <div className="mt-6 pt-5 border-t border-white/[0.08] flex items-start gap-3">
            <ShieldCheck size={16} className="text-cyan-300 mt-0.5 shrink-0" />
            <p className="text-xs text-white/50 leading-relaxed">{t("mig_safety")}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
