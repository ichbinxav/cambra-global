import React from "react";

export default function RevenueBilling({ data }) {
  const { realizedSavings, monetizedPaid, monetizedInvoiced, overdueInvoices, toInvoiceCount, monthSeries } = data;
  return (
    <div className="rounded-xl border border-border/50 bg-card p-5">
      <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground/50 mb-4">Revenue & Billing</p>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
        {[{l:'Realized savings',v:`€${Math.round(realizedSavings).toLocaleString()}`,c:'text-green-600'},
          {l:'Paid',v:`€${Math.round(monetizedPaid).toLocaleString()}`,c:'text-green-600'},
          {l:'Invoiced',v:`€${Math.round(monetizedInvoiced).toLocaleString()}`,c:'text-amber-600'},
          {l:'Overdue',v:overdueInvoices,c:'text-red-600'},
          {l:'To invoice',v:toInvoiceCount,c:'text-orange-600'}].map((k,i)=> (
          <div key={i} className="p-3 rounded-xl border border-border/40 bg-card/80">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground/50 mb-1">{k.l}</p>
            <p className={`text-lg font-black ${k.c}`}>{k.v}</p>
          </div>
        ))}
      </div>
      <div className="flex items-end gap-1 h-16">
        {monthSeries.map((m,i)=> (
          <div key={i} className="flex-1 flex flex-col items-center gap-1">
            <div className="w-full relative" style={{ height: "56px" }}>
              <div className="absolute bottom-0 w-full rounded-t-sm bg-amber-500" style={{ height: `${Math.max(6, m.paid>0? (m.paid/Math.max(1, monthSeries.reduce((mx,x)=>Math.max(mx,x.paid),0)))*100 : 6)}%` }} />
            </div>
            <p className="text-[9px] text-muted-foreground/40 text-center leading-tight">{m.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}