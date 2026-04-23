import { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";

export default function DataIntegrityWidget() {
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [summary, setSummary] = useState({ anomalies: [], counts: { total: 0 } });
  const [error, setError] = useState("");

  const load = async () => {
    try {
      setLoading(true);
      const res = await base44.functions.invoke("integritySummary", {});
      if (res.data?.error) throw new Error(res.data.error);
      setSummary(res.data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const runCleanup = async () => {
    try {
      setRunning(true);
      const res = await base44.functions.invoke("phase2CleanupLegacyFields", {});
      if (res.data?.error) throw new Error(res.data.error);
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setRunning(false);
    }
  };

  const countsByType = summary.anomalies?.reduce((m, a) => { m[a.type] = (m[a.type]||0)+1; return m; }, {}) || {};
  const top = Object.entries(countsByType).sort((a,b)=>b[1]-a[1]).slice(0,4);

  return (
    <div className="rounded-2xl bg-card/50 border border-border/40 p-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold">Data Integrity</h3>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading || running}>Refresh</Button>
          <Button size="sm" onClick={runCleanup} disabled={loading || running}>{running ? "Cleaning…" : "Run Cleanup"}</Button>
        </div>
      </div>
      {error && <p className="text-xs text-red-600 mb-2">{error}</p>}
      {loading ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : (
        <div className="text-sm">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs text-muted-foreground">Anomalies</span>
            <span className="px-2 py-0.5 rounded-full border text-xs">{summary.counts?.total || 0}</span>
          </div>
          {top.length === 0 ? (
            <p className="text-xs text-muted-foreground">No anomalies detected</p>
          ) : (
            <ul className="text-xs space-y-1">
              {top.map(([type, n]) => (
                <li key={type} className="flex items-center justify-between border rounded-md px-2 py-1">
                  <span>{type.replaceAll('_',' ')}</span>
                  <span className="px-1.5 py-0.5 rounded-full bg-secondary text-secondary-foreground text-[11px]">{n}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}