import React from "react";
import { Slider } from "@/components/ui/slider";

export default function MoneySlider({ value, onChange, min = 0, max = 100, step = 1, format = v => v, highlight = true }) {
  const pct = ((value - min) / Math.max(max - min, 1)) * 100;
  return (
    <div className="relative">
      <div className="h-2 rounded-full bg-border/50 overflow-hidden">
        <div
          className={`h-full ${highlight ? "bg-foreground" : "bg-muted-foreground/50"}`}
          style={{ width: `${pct}%`, transition: "width 150ms ease" }}
        />
      </div>
      <div className="mt-2">
        <Slider value={[value]} onValueChange={v => onChange(v[0])} min={min} max={max} step={step} />
      </div>
      <div className="absolute -top-7 left-0 translate-x-[-8px]" style={{ left: `calc(${pct}% )` }}>
        <div className="px-2 py-0.5 rounded-md bg-foreground text-background text-[10px] font-bold tabular-nums shadow-sm">
          {format(value)}
        </div>
      </div>
    </div>
  );
}