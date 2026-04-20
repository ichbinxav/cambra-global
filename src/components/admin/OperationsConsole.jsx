import React from "react";
import ActionQueue from "@/components/admin/ActionQueue";
import ConversionBottlenecks from "@/components/admin/ConversionBottlenecks";

export default function OperationsConsole({ actions = [], convData }) {
  return (
    <div className="rounded-2xl bg-foreground/[0.02] border border-border/40 p-4 sm:p-5">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-sm font-semibold tracking-[-0.01em]">Operations Console</h3>
          <p className="text-[11px] text-muted-foreground/60">Bottlenecks and next actions</p>
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-7">
          <ActionQueue items={actions} />
        </div>
        <div className="lg:col-span-5">
          <ConversionBottlenecks data={convData} />
        </div>
      </div>
    </div>
  );
}