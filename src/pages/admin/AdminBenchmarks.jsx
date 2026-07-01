import { useState } from "react";
import { getBenchmarks } from "@/lib/scoreEngine.js";
import { RefreshCw } from "lucide-react";

const TIERS = ["micro", "small", "mid", "large"];
const TIER_LABELS = { micro: "Micro (<€30K/mo)", small: "Small (€30–100K/mo)", mid: "Mid (€100–500K/mo)", large: "Large (>€500K/mo)" };

export default function AdminBenchmarks() {
  const [region, setRegion] = useState("EU");
  const [sampleRev, setSampleRev] = useState(50000);

  // Show current benchmark values per tier
  const benchmarksByTier = TIERS.map(tier => {
    const monthlyRevByTier = { micro: 15000, small: 50000, mid: 200000, large: 600000 };
    const b = getBenchmarks(monthlyRevByTier[tier], region === "EU" ? "France" : "United States");
    return { tier, ...b };
  });

  // Live preview
  const preview = getBenchmarks(sampleRev, region === "EU" ? "France" : "United States");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black tracking-[-0.03em]">Benchmark Engine</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Control the ranges used to calculate savings and infrastructure scores</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setRegion(r => r === "EU" ? "Global" : "EU")}
            className="h-9 px-4 rounded-xl border border-border/50 text-xs font-medium flex items-center gap-2 hover:border-foreground/20 transition-colors">
            <RefreshCw size={12} /> {region}
          </button>
        </div>
      </div>

      {/* Live preview */}
      <div className="p-5 rounded-xl border border-border/50 bg-card">
        <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground/50 mb-4">Live Preview</p>
        <div className="flex items-center gap-4 mb-4">
          <div className="flex-1">
            <label className="text-xs text-muted-foreground/60 block mb-1.5">Monthly Revenue (€)</label>
            <input type="range" min={5000} max={600000} step={5000} value={sampleRev}
              onChange={e => setSampleRev(Number(e.target.value))}
              className="w-full accent-foreground" />
            <div className="flex justify-between mt-1">
              <span className="text-[10px] text-muted-foreground/40">€5K</span>
              <span className="text-xs font-bold">€{sampleRev.toLocaleString()}/mo</span>
              <span className="text-[10px] text-muted-foreground/40">€600K</span>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: "Payment Benchmark", val: `${preview.payment.rate}%`, range: `${preview.payment.range[0]}–${preview.payment.range[1]}%`, color: "text-blue-600" },
            { label: "Shipping Benchmark", val: `€${preview.shipping.perUnit}/shipment`, range: `€${preview.shipping.range[0]}–€${preview.shipping.range[1]}`, color: "text-green-600" },
            { label: "SaaS Benchmark", val: `${(preview.saas.pct * 100).toFixed(1)}% of rev`, range: `${(preview.saas.range[0] * 100).toFixed(1)}–${(preview.saas.range[1] * 100).toFixed(1)}%`, color: "text-orange-500" },
          ].map((b, i) => (
            <div key={i} className="p-4 rounded-xl bg-secondary/40 border border-border/30">
              <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground/40 mb-1">{b.label}</p>
              <p className={`text-xl font-black ${b.color}`}>{b.val}</p>
              <p className="text-[10px] text-muted-foreground/40 mt-0.5">Range: {b.range}</p>
              <p className="text-[10px] text-muted-foreground/30 mt-1">Tier: {preview.tier} · {region}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Full benchmark table */}
      <div className="rounded-xl border border-border/50 overflow-hidden">
        <div className="px-5 py-3.5 border-b border-border/40 bg-secondary/30 flex items-center justify-between">
          <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground/50">Benchmark Table · {region}</p>
          <div className="flex gap-1">
            {["EU", "Global"].map(r => (
              <button key={r} onClick={() => setRegion(r)}
                className={`px-3 h-6 rounded-full text-[10px] font-bold transition-all ${region === r ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"}`}>
                {r}
              </button>
            ))}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border/30">
                <th className="px-5 py-3 text-left text-[10px] uppercase tracking-[0.15em] text-muted-foreground/40 font-medium">Tier</th>
                <th className="px-5 py-3 text-left text-[10px] uppercase tracking-[0.15em] text-muted-foreground/40 font-medium">Payment Rate</th>
                <th className="px-5 py-3 text-left text-[10px] uppercase tracking-[0.15em] text-muted-foreground/40 font-medium">Pay Range</th>
                <th className="px-5 py-3 text-left text-[10px] uppercase tracking-[0.15em] text-muted-foreground/40 font-medium">Shipping/unit</th>
                <th className="px-5 py-3 text-left text-[10px] uppercase tracking-[0.15em] text-muted-foreground/40 font-medium">Ship Range</th>
                <th className="px-5 py-3 text-left text-[10px] uppercase tracking-[0.15em] text-muted-foreground/40 font-medium">SaaS % rev</th>
                <th className="px-5 py-3 text-left text-[10px] uppercase tracking-[0.15em] text-muted-foreground/40 font-medium">SaaS Range</th>
              </tr>
            </thead>
            <tbody>
              {benchmarksByTier.map((b, i) => (
                <tr key={b.tier} className={`border-b border-border/20 last:border-0 ${i % 2 === 0 ? "" : "bg-secondary/20"}`}>
                  <td className="px-5 py-3.5">
                    <p className="text-xs font-semibold">{b.tier}</p>
                    <p className="text-[10px] text-muted-foreground/40">{TIER_LABELS[b.tier]}</p>
                  </td>
                  <td className="px-5 py-3.5 text-sm font-bold text-blue-600">{b.payment.rate}%</td>
                  <td className="px-5 py-3.5 text-xs text-muted-foreground/60">{b.payment.range[0]}–{b.payment.range[1]}%</td>
                  <td className="px-5 py-3.5 text-sm font-bold text-green-600">€{b.shipping.perUnit}</td>
                  <td className="px-5 py-3.5 text-xs text-muted-foreground/60">€{b.shipping.range[0]}–€{b.shipping.range[1]}</td>
                  <td className="px-5 py-3.5 text-sm font-bold text-orange-500">{(b.saas.pct * 100).toFixed(1)}%</td>
                  <td className="px-5 py-3.5 text-xs text-muted-foreground/60">{(b.saas.range[0] * 100).toFixed(1)}–{(b.saas.range[1] * 100).toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Score engine info */}
      <div className="p-5 rounded-xl border border-border/40 bg-secondary/20">
        <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground/40 mb-3">Score Engine Weights</p>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[
            { dim: "Cost Efficiency", weight: "40%", color: "text-blue-600" },
            { dim: "Stack Optimization", weight: "20%", color: "text-green-600" },
            { dim: "Provider Quality", weight: "15%", color: "text-orange-500" },
            { dim: "Structural Fit", weight: "10%", color: "text-purple-500" },
            { dim: "Data Quality", weight: "15%", color: "text-amber-600" },
          ].map((d, i) => (
            <div key={i} className="p-3 rounded-xl bg-background border border-border/40 text-center">
              <p className={`text-xl font-black ${d.color}`}>{d.weight}</p>
              <p className="text-[10px] text-muted-foreground/50 mt-1">{d.dim}</p>
            </div>
          ))}
        </div>
        <p className="text-[11px] text-muted-foreground/40 mt-4">
          Benchmarks are computed dynamically based on revenue tier and geography. To update logic, edit <code className="bg-secondary px-1 rounded text-[10px]">lib/scoreEngine.js</code>.
        </p>
      </div>
    </div>
  );
}