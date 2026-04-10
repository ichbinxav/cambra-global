import React from 'react';

export default function EconomicsStrip({ identified = 0, activated = 0, realized = 0 }) {
  const items = [
    { label: 'Identified', value: identified, color: 'text-blue-600', bg: 'bg-blue-500/[0.05] border-blue-500/15' },
    { label: 'Activated', value: activated, color: 'text-purple-600', bg: 'bg-purple-500/[0.05] border-purple-500/15' },
    { label: 'Realized', value: realized, color: 'text-green-600', bg: 'bg-green-500/[0.05] border-green-500/15' },
  ];
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-3">
      {items.map((i) => (
        <div key={i.label} className={`p-4 rounded-xl border ${i.bg}`}>
          <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground/40 mb-1">{i.label} savings</p>
          <p className={`text-xl font-black tabular-nums ${i.color}`}>€{Math.round(i.value).toLocaleString()}/yr</p>
        </div>
      ))}
    </div>
  );
}