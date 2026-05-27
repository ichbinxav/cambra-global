import React from "react";
import ActionQueue from "@/components/admin/ActionQueue";
import CompactConversion from "@/components/admin/CompactConversion";

export default function OperationsConsole({ actions = [], convData }) {
  return (
    <div className="relative rounded-2xl bg-card/95 backdrop-blur-sm border border-border/60 p-5 overflow-hidden shadow-[0_8px_24px_-12px_rgba(0,0,0,0.08)]">
      <div className="pointer-events-none absolute -top-24 -left-24 w-64 h-64 rounded-full blur-3xl opacity-50" style={{ background: "radial-gradient(closest-side, rgba(239,68,68,0.15), transparent)" }} />
      <div className="pointer-events-none absolute -bottom-24 -right-24 w-64 h-64 rounded-full blur-3xl opacity-40" style={{ background: "radial-gradient(closest-side, rgba(31,78,216,0.15), transparent)" }} />
      <div className="relative">
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="inline-flex items-center gap-2 mb-2 px-2 py-1 rounded-full border border-border/60 bg-background/80 backdrop-blur-sm">
              <span className="h-1.5 w-1.5 rounded-full bg-cambra-mint" />
              <span className="text-[9px] font-semibold tracking-[0.2em] uppercase text-muted-foreground">Console</span>
            </div>
            <h3 className="text-base font-bold tracking-tight">Operations Console</h3>
            <p className="text-[11px] text-muted-foreground/65">Bottlenecks and next actions</p>
          </div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <div className="lg:col-span-7">
            <ActionQueue items={actions} />
          </div>
          <div className="lg:col-span-5">
            <CompactConversion
              funnel={convData?.funnel}
              convAnalysis={convData?.convAnalysis}
              convActivation={convData?.convActivation}
              stuckCount={convData?.stuckCount}
              offerReady={convData?.offerReady}
            />
          </div>
        </div>
      </div>
    </div>
  );
}