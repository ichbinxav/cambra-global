import React, { useMemo, useState, useEffect } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { motion } from "framer-motion";

function clamp(n, min, max) { return Math.min(max, Math.max(min, n)); }

function formatShortNumber(value, { prefix = "", suffix = "", decimals = 0 } = {}) {
  if (value == null || isNaN(value)) return "";
  const abs = Math.abs(value);
  let num = value;
  let unit = "";
  if (abs >= 1_000_000_000) { num = value / 1_000_000_000; unit = "B"; }
  else if (abs >= 1_000_000) { num = value / 1_000_000; unit = "M"; }
  else if (abs >= 1_000) { num = value / 1_000; unit = "k"; }
  const d = unit ? Math.min(decimals || 1, 2) : decimals;
  const str = num.toFixed(d).replace(/\.0+$|(?<=\..*)0+$/g, "");
  return `${prefix}${str}${unit}${suffix}`;
}

function parseShortNumber(str) {
  if (typeof str !== "string") return NaN;
  const s = str.trim().toLowerCase().replace(/[,\s]/g, "");
  if (!s) return NaN;
  const m = s.match(/^(-?\d+(?:\.\d+)?)([kmb])?$/i);
  if (!m) return Number(s);
  const n = parseFloat(m[1]);
  const u = m[2];
  if (u === "k") return n * 1_000;
  if (u === "m") return n * 1_000_000;
  if (u === "b") return n * 1_000_000_000;
  return n;
}

export default function SmartNumberField({
  label,
  value,
  onChange,
  min = 0,
  max = 100,
  scale = "linear", // 'linear' | 'log'
  prefix = "",
  suffix = "",
  decimals = 0,
}) {
  const safeMin = scale === "log" ? (min <= 0 ? 1 : min) : min;
  const [internal, setInternal] = useState(String(value ?? ""));

  useEffect(() => {
    setInternal(String(value ?? ""));
  }, [value]);

  const toPos = useMemo(() => {
    if (scale === "log") {
      const lnMin = Math.log(safeMin);
      const lnMax = Math.log(max);
      return (v) => {
        const vv = clamp(v, safeMin, max);
        const t = (Math.log(vv) - lnMin) / (lnMax - lnMin);
        return clamp(Math.round(t * 100), 0, 100);
      };
    }
    return (v) => clamp(Math.round(((v - min) / (max - min)) * 100), 0, 100);
  }, [scale, min, max, safeMin]);

  const fromPos = useMemo(() => {
    if (scale === "log") {
      const lnMin = Math.log(safeMin);
      const lnMax = Math.log(max);
      return (p) => {
        const t = clamp(p / 100, 0, 1);
        const v = Math.exp(lnMin + t * (lnMax - lnMin));
        return v;
      };
    }
    return (p) => min + (clamp(p, 0, 100) / 100) * (max - min);
  }, [scale, min, max, safeMin]);

  const pos = toPos(Number(value ?? 0));

  const handleSlide = (arr) => {
    const p = Array.isArray(arr) ? arr[0] : arr;
    const v = fromPos(p);
    const rounded = decimals > 0 ? Number(v.toFixed(decimals)) : Math.round(v);
    onChange(clamp(rounded, min, max));
  };

  const handleInput = (e) => {
    const raw = e.target.value;
    setInternal(raw);
    const parsed = parseShortNumber(raw);
    if (!isNaN(parsed)) {
      const cl = clamp(parsed, min, max);
      onChange(decimals > 0 ? Number(cl.toFixed(decimals)) : Math.round(cl));
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium text-foreground">{label}</Label>
        <span className="text-lg font-black tabular-nums">
          {formatShortNumber(Number(value ?? 0), { prefix, suffix, decimals })}
        </span>
      </div>

      <div className="relative">
        <Slider
          value={[pos]}
          onValueChange={handleSlide}
          min={0}
          max={100}
          step={1}
          className="py-3"
        />
        <motion.div
          className="absolute -top-6 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-foreground text-background select-none"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: "spring", stiffness: 300, damping: 25 }}
          style={{ left: `calc(${pos}% - 20px)` }}
        >
          {formatShortNumber(Number(value ?? 0), { prefix, suffix, decimals })}
        </motion.div>
      </div>

      <div className="flex items-center gap-2">
        <Input
          value={internal}
          onChange={handleInput}
          className="h-10 text-sm border-border/60"
          placeholder={formatShortNumber(min, { prefix, suffix }) + " … " + formatShortNumber(max, { prefix, suffix })}
        />
      </div>

      <div className="flex justify-between text-[11px] text-muted-foreground/40">
        <span>{formatShortNumber(min, { prefix, suffix, decimals })}</span>
        <span>{formatShortNumber(max, { prefix, suffix, decimals })}</span>
      </div>
    </div>
  );
}