import { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { RefreshCw, Activity, Sparkles } from "lucide-react";
import { useTranslation } from "@/lib/i18n.jsx";

/**
 * M7 — Last scan indicator + Re-scan trigger.
 * Mounted on Dashboard above the Infrastructure Graph panel.
 */
function timeAgo(iso, t) {
  if (!iso) return t("never_label");
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return t("just_now");
  const m = Math.floor(ms / 60_000);
  if (m < 60) return t("minutes_ago", { n: m });
  const h = Math.floor(m / 60);
  if (h < 24) return t("hours_ago", { n: h });
  const d = Math.floor(h / 24);
  return t("days_ago", { n: d });
}

export default function LastScanBar() {
  const { t } = useTranslation();
  const [run, setRun] = useState(null);
  const [brandId, setBrandId] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [justFinished, setJustFinished] = useState(null);

  const loadLatest = async () => {
    try {
      const me = await base44.auth.me();
      const brands = await base44.entities.Brand
        .filter({ created_by_id: me.id }, "-created_date", 1);
      if (!brands.length) return;
      setBrandId(brands[0].id);
      const runs = await base44.entities.ContinuousDiscoveryRun
        .filter({ brand_id: brands[0].id }, "-started_at", 1).catch(() => []);
      setRun(runs[0] || null);
    } catch { /* silent */ }
  };

  useEffect(() => { loadLatest(); }, []);

  const onRescan = async () => {
    if (!brandId || scanning) return;
    setScanning(true);
    setJustFinished(null);
    try {
      const res = await base44.functions.invoke("runContinuousDiscovery", {
        brand_id: brandId,
        trigger: "manual",
      });
      const payload = res?.data || res;
      if (payload?.ok) {
        setJustFinished({
          changes: Number(payload.changes_detected || 0),
          nodes:   Number(payload.nodes_updated || 0),
        });
      }
      await loadLatest();
    } catch { /* silent */ } finally {
      setScanning(false);
    }
  };

  const lastWhen = run?.completed_at || run?.started_at;
  const changes = justFinished?.changes ?? run?.changes_detected ?? 0;

  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 px-4 py-3 rounded-2xl border border-border/50 bg-card">
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-8 h-8 rounded-lg bg-secondary border border-border/60 flex items-center justify-center shrink-0">
          <Activity size={13} className="text-muted-foreground" />
        </div>
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground/60 font-semibold">{t("continuous_discovery")}</p>
          <p className="text-sm font-semibold tracking-tight truncate">
            {scanning ? t("scanning") : t("last_scan_ago", { time: timeAgo(lastWhen, t) })}
            {!scanning && changes > 0 && (
              <span className="ml-2 inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700">
                <Sparkles size={10} /> {t("changes_detected_n", { n: changes, plural: changes === 1 ? "" : "s" })}
              </span>
            )}
          </p>
        </div>
      </div>
      <button
        onClick={onRescan}
        disabled={scanning || !brandId}
        className="inline-flex items-center gap-1.5 h-8 px-4 rounded-full bg-foreground text-background text-xs font-bold disabled:opacity-50 transition-opacity"
      >
        <RefreshCw size={11} className={scanning ? "animate-spin" : ""} />
        {scanning ? t("scanning") : t("rescan")}
      </button>
    </div>
  );
}