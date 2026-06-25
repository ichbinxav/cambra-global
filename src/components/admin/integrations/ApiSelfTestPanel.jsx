import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Play, CheckCircle2, XCircle, Loader2, ShieldCheck } from "lucide-react";

export default function ApiSelfTestPanel() {
  const [running, setRunning] = useState(false);
  const [report, setReport] = useState(null);
  const [error, setError] = useState(null);

  const run = async () => {
    setRunning(true);
    setError(null);
    try {
      const { data } = await base44.functions.invoke("runApiSelfTests", {});
      setReport(data);
    } catch (e) {
      setError(e.message || "Self-test runner failed");
    }
    setRunning(false);
  };

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-bold flex items-center gap-2"><ShieldCheck className="h-4 w-4" /> API Self-Tests</h3>
          <p className="text-xs text-muted-foreground mt-1 max-w-xl">
            Infrastructure smoke tests: SHA-256 hashing, API key hash lookup &amp; revocation, scope schema sync,
            tenant binding, OAuth tables, idempotency / rate-limit / DLQ entities, audit log writes, HMAC SHA-256
            availability, and per-organization usage tracking.
          </p>
        </div>
        <Button onClick={run} disabled={running} size="sm" className="gap-1.5 shrink-0">
          {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
          {running ? "Running…" : "Run self-tests"}
        </Button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-4 text-xs text-red-700">{error}</div>
      )}

      {report && (
        <>
          <div className="grid grid-cols-4 gap-3">
            <div className="rounded-lg border border-border/60 p-3">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Total</div>
              <div className="text-2xl font-black tabular-nums">{report.summary.total}</div>
            </div>
            <div className="rounded-lg border border-green-500/30 bg-green-500/5 p-3">
              <div className="text-[10px] uppercase tracking-wider text-green-700">Passed</div>
              <div className="text-2xl font-black tabular-nums text-green-700">{report.summary.passed}</div>
            </div>
            <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-3">
              <div className="text-[10px] uppercase tracking-wider text-red-700">Failed</div>
              <div className="text-2xl font-black tabular-nums text-red-700">{report.summary.failed}</div>
            </div>
            <div className="rounded-lg border border-border/60 p-3">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Pass rate</div>
              <div className="text-2xl font-black tabular-nums">{report.summary.pass_rate}%</div>
            </div>
          </div>

          <div className="rounded-xl border border-border/60 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-secondary/40">
                <tr className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  <th className="text-left py-2 px-3 font-bold">Test</th>
                  <th className="text-left py-2 px-3 font-bold">Status</th>
                  <th className="text-left py-2 px-3 font-bold">Details</th>
                </tr>
              </thead>
              <tbody>
                {report.results.map((r) => (
                  <tr key={r.name} className="border-t border-border/40">
                    <td className="py-2 px-3 font-mono text-xs">{r.name}</td>
                    <td className="py-2 px-3">
                      {r.status === "pass" ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-green-700">
                          <CheckCircle2 className="h-3.5 w-3.5" /> pass
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-red-700">
                          <XCircle className="h-3.5 w-3.5" /> fail
                        </span>
                      )}
                    </td>
                    <td className="py-2 px-3 text-[11px] text-muted-foreground font-mono truncate max-w-[400px]">
                      {r.details ? (typeof r.details === "string" ? r.details : JSON.stringify(r.details)) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {report.note && (
            <p className="text-[11px] text-muted-foreground italic">{report.note}</p>
          )}
          <p className="text-[10px] text-muted-foreground font-mono">Run at {new Date(report.run_at).toLocaleString()}</p>
        </>
      )}
    </div>
  );
}