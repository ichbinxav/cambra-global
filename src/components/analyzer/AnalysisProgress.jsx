import React, { useEffect, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import BrandGlyph from "@/components/shared/BrandGlyph";

/**
 * AnalysisProgress — full-screen animated progress shown after Step 3.
 * Pure visual; the parent decides when to navigate away.
 */
const STEP_DELAY_MS = 600;

export default function AnalysisProgress({ country = "your region", tier = "your tier", done = false }) {
  const steps = [
    "Mapping your infrastructure…",
    `Loading benchmarks for ${country} ${tier}…`,
    "Calculating payment savings…",
    "Calculating shipping savings…",
    "Calculating SaaS savings…",
    "Building your recommendations…",
    "Your report is ready ✓",
  ];

  const [current, setCurrent] = useState(0);

  useEffect(() => {
    if (done) {
      setCurrent(steps.length);
      return;
    }
    if (current >= steps.length - 1) return;
    const t = setTimeout(() => setCurrent(c => c + 1), STEP_DELAY_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, done]);

  return (
    <div className="fixed inset-0 z-50 bg-background flex items-center justify-center px-5">
      <div className="max-w-sm w-full">
        <div className="text-center mb-8">
          <div className="h-10 w-10 mx-auto mb-4" style={{ animation: "spin 4s linear infinite" }}>
            <BrandGlyph className="h-10 w-10" />
          </div>
          <h2 className="text-xl font-black tracking-[-0.03em] text-foreground">
            Analyzing your infrastructure
          </h2>
        </div>

        <ol className="space-y-2.5">
          {steps.map((s, i) => {
            const isDone = i < current || done;
            const isActive = i === current && !done;
            return (
              <li
                key={i}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-colors ${
                  isDone
                    ? "border-emerald-500/25 bg-emerald-50/40"
                    : isActive
                    ? "border-border bg-card"
                    : "border-border/30 bg-background opacity-50"
                }`}
              >
                <div
                  className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${
                    isDone ? "bg-emerald-500/15" : isActive ? "bg-secondary" : "bg-secondary/40"
                  }`}
                >
                  {isDone ? (
                    <CheckCircle2 size={13} className="text-emerald-600" />
                  ) : isActive ? (
                    <div className="w-3 h-3 rounded-full border-2 border-muted-foreground/20 border-t-foreground animate-spin" />
                  ) : (
                    <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground/30" />
                  )}
                </div>
                <span
                  className={`text-sm font-medium ${
                    isDone || isActive ? "text-foreground" : "text-muted-foreground/50"
                  }`}
                >
                  {s}
                </span>
              </li>
            );
          })}
        </ol>
      </div>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}