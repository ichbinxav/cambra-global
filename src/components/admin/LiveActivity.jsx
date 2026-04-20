import React from "react";

function FeedItem({ app, brand }) {
  const name = brand?.name || app.company_name || app.user_email?.split('@')[0];
  const timeAgo = (() => {
    const diff = Date.now() - new Date(app.created_date).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  })();
  return (
    <div className="flex items-center gap-3 py-3 border-b border-border/20 last:border-0">
      <div className="w-7 h-7 rounded-full bg-secondary flex items-center justify-center shrink-0">
        <span className="text-[10px] font-black text-muted-foreground">{name?.charAt(0)?.toUpperCase()}</span>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-bold truncate">{name}</p>
        <p className="text-[11px] text-muted-foreground/50 truncate">{app.deal_name} · {app.status}</p>
      </div>
      <div className="text-right shrink-0">
        {app.estimated_savings > 0 && <p className="text-xs font-black text-green-600">€{app.estimated_savings.toLocaleString()}</p>}
        <p className="text-[10px] text-muted-foreground/30">{timeAgo}</p>
      </div>
    </div>
  );
}

export default function LiveActivity({ apps = [], brands = [] }) {
  const items = apps.slice(0, 20);
  return (
    <div className="rounded-xl border border-border/50 bg-card p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
          <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground/50">Live Activity</p>
        </div>
      </div>
      <div className="max-h-[300px] overflow-y-auto divide-y divide-border/20">
        {items.length === 0 ? (
          <p className="text-xs text-muted-foreground/40 text-center py-8">No activity yet</p>
        ) : (
          items.map(app => <FeedItem key={app.id} app={app} brand={brands.find(b => b.created_by === app.user_email)} />)
        )}
      </div>
    </div>
  );
}