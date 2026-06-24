import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import { TrendingUp, Sliders } from "lucide-react";

/**
 * SavingsAdjustSlider — Lets the user adjust their estimated monthly volume
 * to see how recoverable savings scale. Display-only, doesn't mutate stored data.
 */
export default function SavingsAdjustSlider({ baseSavings = 0, baseRevenue = 0 }) {
  const [multiplier, setMultiplier] = useState(100); // percent of base

  const adjustedRevenue = useMemo(
    () => Math.round((baseRevenue * multiplier) / 100),
    [baseRevenue, multiplier]
  );
  const adjustedSavings = useMemo(
    () => Math.round((baseSavings * multiplier) / 100),
    [baseSavings, multiplier]
  );

  if (!baseSavings || !baseRevenue) return null;

  return (
    <div className="p-5 sm:p-6 rounded-2xl border border-border/50 bg-card">
      <div className="flex items-center gap-2 mb-4">
        <div className="h-7 w-7 rounded-lg flex items-center justify-center bg-cambra-blue/10 border border-cambra-blue/20">
          <Sliders className="h-3.5 w-3.5 text-cambra-blue" strokeWidth={2} />
        </div>
        <div>
          <p className="text-[10px] font-bold tracking-[0.22em] uppercase text-muted-foreground/60">
            Recalibrate
          </p>
          <p className="text-sm font-semibold">Adjust your volume estimate</p>
        </div>
      </div>

      <p className="text-[11px] text-muted-foreground/60 mb-4">
        Think your numbers are conservative or off? Drag to see how recoverable margin scales with your real volume.
      </p>

      <input
        type="range"
        min={50}
        max={200}
        step={5}
        value={multiplier}
        onChange={(e) => setMultiplier(Number(e.target.value))}
        className="w-full accent-cambra-blue mb-2"
      />
      <div className="flex justify-between text-[9px] font-mono text-muted-foreground/40 uppercase tracking-wider mb-5">
        <span>−50%</span>
        <span>Your input</span>
        <span>+100%</span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="p-3 rounded-xl bg-secondary/40 border border-border/40">
          <p className="text-[9px] font-mono tracking-wider uppercase text-muted-foreground/50 mb-1">
            Adjusted revenue
          </p>
          <p className="text-base font-black tabular-nums">
            €{adjustedRevenue.toLocaleString()}<span className="text-[10px] text-muted-foreground/40 font-normal">/mo</span>
          </p>
        </div>
        <motion.div
          key={adjustedSavings}
          initial={{ scale: 0.96 }}
          animate={{ scale: 1 }}
          transition={{ duration: 0.25 }}
          className="p-3 rounded-xl border border-cambra-cyan/30 bg-cambra-cyan/[0.06]"
        >
          <p className="text-[9px] font-mono tracking-wider uppercase text-cambra-cyan/80 mb-1 flex items-center gap-1">
            <TrendingUp className="h-2.5 w-2.5" /> Recoverable
          </p>
          <p className="text-base font-black tabular-nums text-cambra-cyan">
            €{adjustedSavings.toLocaleString()}<span className="text-[10px] text-cambra-cyan/50 font-normal">/yr</span>
          </p>
        </motion.div>
      </div>
    </div>
  );
}