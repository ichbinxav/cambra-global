import React, { useMemo } from "react";
import { ResponsiveContainer, BarChart, Bar, XAxis, Tooltip, YAxis, Cell } from "recharts";

function percentile(values, p) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

const compact = new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 });

const DefaultTooltip = ({ active, payload, label }) => {
  if (!active || !payload || !payload.length) return null;
  const original = payload[0]?.payload?.__original_value ?? 0;
  return (
    <div className="rounded-md border border-border bg-card px-2.5 py-1.5 text-xs shadow-sm">
      <div className="font-semibold">{label}</div>
      <div className="text-muted-foreground">€{compact.format(Number(original))}</div>
    </div>
  );
};

// Premium-feel normalized bar chart: caps extreme outliers, hides overflow, safe labels
export default function NormalizedBarChart({
  data = [],
  className = "h-24 sm:h-28 md:h-36",
  labelInside = true,
  hideLabels = false,
  outlierFactor = 1.5, // if max > p90 * factor → compress to p90 * 1.2
}) {
  const processed = useMemo(() => {
    const vals = data.map((d) => Number(d.value) || 0);
    const max = Math.max(0, ...vals);
    const p90 = percentile(vals, 0.9);
    const scaleMax = max > p90 * outlierFactor ? Math.max(p90 * 1.2, p90 || 1) : Math.max(max, 1);

    return data.map((d) => {
      const v = Number(d.value) || 0;
      const scaled = Math.max(0, Math.min(100, (v / scaleMax) * 100));
      return { ...d, scaled, __original_value: v };
    });
  }, [data, outlierFactor]);

  // Custom label renderer (keeps text inside bar when possible)
  const renderLabel = (props) => {
    if (hideLabels) return null;
    const { x = 0, y = 0, width = 0, height = 0, payload } = props;
    const txt = `€${compact.format(Number(payload?.__original_value || 0))}`;
    const inside = height >= 18 && labelInside;

    return (
      <text
        x={inside ? x + width - 6 : x + width / 2}
        y={inside ? y + 14 : Math.max(y + 12, y + 4)}
        textAnchor={inside ? "end" : "middle"}
        className={inside ? "fill-white" : "fill-foreground"}
        fontSize={11}
        style={{ pointerEvents: "none" }}
      >
        {txt}
      </text>
    );
  };

  return (
    <div className={`w-full overflow-hidden ${className}`}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={processed} barSize={28} barGap={10} margin={{ top: 8, right: 8, left: 8, bottom: 6 }}>
          <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))", opacity: 0.6 }} />
          <YAxis hide domain={[0, 100]} />
          <Tooltip content={<DefaultTooltip />} cursor={{ fill: "hsl(var(--secondary))", radius: 6 }} wrapperStyle={{ outline: "none" }} />
          <Bar dataKey="scaled" radius={[6, 6, 0, 0]} label={renderLabel}>
            {processed.map((entry, i) => (
              <Cell key={`cell-${i}`} fill={entry.fill || "#3b82f6"} fillOpacity={0.9} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}