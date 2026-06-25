import React from "react";
import { Check } from "lucide-react";

/**
 * StepIndicator — 3 dots with check marks for completed steps.
 * Used in the Analyzer top bar to show progress at a glance.
 */
export default function StepIndicator({ current = 1, total = 3 }) {
  const steps = Array.from({ length: total }, (_, i) => i + 1);
  return (
    <div className="flex items-center gap-1.5" aria-label={`Step ${current} of ${total}`}>
      {steps.map((n) => {
        const done = n < current;
        const active = n === current;
        return (
          <span
            key={n}
            className="flex items-center justify-center transition-all"
            style={{
              width: 18,
              height: 18,
              borderRadius: 9999,
              background: done
                ? "rgba(34,211,238,0.15)"
                : active
                ? "rgba(255,255,255,0.10)"
                : "rgba(255,255,255,0.03)",
              border: done
                ? "1px solid rgba(34,211,238,0.45)"
                : active
                ? "1px solid rgba(255,255,255,0.45)"
                : "1px solid rgba(255,255,255,0.10)",
              color: done ? "#22d3ee" : active ? "#fff" : "rgba(255,255,255,0.45)",
              fontSize: 9,
              fontWeight: 800,
              lineHeight: 1,
            }}
          >
            {done ? <Check size={10} strokeWidth={3} /> : n}
          </span>
        );
      })}
    </div>
  );
}