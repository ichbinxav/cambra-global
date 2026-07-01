import { useState } from "react";
import { DEALS, PHASE_CONFIG } from "@/lib/deals.js";
import { CheckCircle2, Edit2, X } from "lucide-react";

const PHASE_LABELS = { live: "Live", soon: "Coming soon", planned: "Planned" };

export default function AdminDeals() {
  const [selected, setSelected] = useState(null);
  const [editMode, setEditMode] = useState(false);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-black tracking-[-0.03em]">Deals Management</h1>
        <p className="text-xs text-muted-foreground mt-0.5">{DEALS.length} deals configured · Edit deal metadata and status</p>
      </div>

      <div className="flex gap-4">
        {/* Deal list */}
        <div className={`${selected ? "w-1/2" : "w-full"} rounded-xl border border-border/50 overflow-hidden transition-all`}>
          <div className="grid grid-cols-[2fr_1fr_1fr_1fr_auto] px-5 py-3 bg-secondary/40 border-b border-border/40 text-[10px] uppercase tracking-[0.15em] text-muted-foreground/50 gap-3">
            <span>Deal</span>
            <span>Category</span>
            <span>Mode</span>
            <span>Phase</span>
            <span></span>
          </div>
          {DEALS.map(deal => {
            const phase = PHASE_CONFIG[deal.phase];
            return (
              <div key={deal.id}
                onClick={() => setSelected(selected?.id === deal.id ? null : deal)}
                className={`grid grid-cols-[2fr_1fr_1fr_1fr_auto] px-5 py-4 border-b border-border/20 last:border-0 items-center gap-3 cursor-pointer transition-colors ${selected?.id === deal.id ? "bg-secondary/40" : "hover:bg-secondary/20"}`}>
                <div>
                  <p className="text-sm font-semibold">{deal.title}</p>
                  <p className="text-[11px] text-muted-foreground/40">{deal.provider}</p>
                </div>
                <span className="text-xs text-muted-foreground/60 capitalize">{deal.category}</span>
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border w-fit ${deal.mode === "instant" ? "bg-purple-500/10 text-purple-600 border-purple-500/20" : "bg-secondary text-muted-foreground border-border/40"}`}>
                  {deal.mode}
                </span>
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border w-fit ${phase.badge}`}>
                  {phase.label}
                </span>
                <Edit2 size={12} className="text-muted-foreground/30" />
              </div>
            );
          })}
        </div>

        {/* Deal detail */}
        {selected && (
          <div className="w-1/2 rounded-xl border border-border/50 bg-card overflow-hidden sticky top-20">
            <div className="px-5 py-4 border-b border-border/40 flex items-center justify-between">
              <p className="text-sm font-bold">{selected.title}</p>
              <button onClick={() => setSelected(null)} className="text-muted-foreground/40 hover:text-foreground">
                <X size={14} />
              </button>
            </div>
            <div className="p-5 space-y-4 overflow-y-auto max-h-[calc(100vh-200px)]">
              {/* Provider info */}
              <div className="space-y-2">
                <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground/40">Provider</p>
                {[
                  { label: "Provider", val: selected.provider },
                  { label: "Category", val: selected.category },
                  { label: "Mode", val: selected.mode },
                  { label: "Phase", val: selected.phase },
                  { label: "Regions", val: selected.region?.join(", ") },
                ].map((row, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <p className="text-xs text-muted-foreground/50">{row.label}</p>
                    <p className="text-xs font-semibold capitalize">{row.val}</p>
                  </div>
                ))}
              </div>

              {/* Rates */}
              <div className="space-y-2">
                <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground/40">Rate Conditions</p>
                <div className="p-3 rounded-lg bg-secondary/40 space-y-2">
                  <div className="flex justify-between">
                    <p className="text-xs text-muted-foreground/50">Standard</p>
                    <p className="text-xs font-semibold line-through text-muted-foreground/40">{selected.normal_rate}</p>
                  </div>
                  <div className="flex justify-between">
                    <p className="text-xs text-muted-foreground/50">Via CAMBRA</p>
                    <p className="text-xs font-bold">{selected.network_rate}</p>
                  </div>
                  <div className="flex justify-between pt-2 border-t border-border/30">
                    <p className="text-xs text-muted-foreground/50">Est. savings</p>
                    <p className="text-xs font-black text-green-600">€{selected.estimated_savings?.toLocaleString()}/yr</p>
                  </div>
                  <p className="text-[10px] text-muted-foreground/30">{selected.saving_note}</p>
                </div>
              </div>

              {/* Description */}
              <div>
                <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground/40 mb-2">Description</p>
                <p className="text-xs text-muted-foreground/70 leading-relaxed">{selected.desc}</p>
              </div>

              {/* Acceptance items */}
              {selected.acceptance_items?.length > 0 && (
                <div>
                  <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground/40 mb-2">Acceptance Items</p>
                  <div className="space-y-1.5">
                    {selected.acceptance_items.map((item, i) => (
                      <div key={i} className="flex items-start gap-2 p-2.5 rounded-lg bg-secondary/40">
                        <CheckCircle2 size={11} className="text-green-500 shrink-0 mt-0.5" />
                        <p className="text-xs text-muted-foreground/70">{item}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Action */}
              <div className="space-y-2">
                <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground/40">Action Config</p>
                <div className="p-3 rounded-lg bg-secondary/40 space-y-1.5">
                  <p className="text-xs"><span className="text-muted-foreground/40">Label: </span>{selected.action_label}</p>
                  <p className="text-xs text-muted-foreground/50 text-[11px]">{selected.action_note}</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}