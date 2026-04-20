import React from "react";
import { Search } from "lucide-react";

export default function AdminFiltersBar({
  timeRange, setTimeRange,
  search, setSearch,
  vertical, setVertical,
  providerId, setProviderId,
  country, setCountry,
  stage, setStage,
  status, setStatus,
  providers = [], countries = [], stages = [], statuses = [],
  onQuickAction
}) {
  return (
    <div className="flex flex-col gap-3 md:gap-4 md:flex-row md:items-center md:justify-between">
      <div className="flex items-center gap-2">
        {['7d','30d','90d','YTD'].map(r => (
          <button key={r} onClick={() => setTimeRange(r)}
            className={`h-8 px-3 rounded-md text-xs font-semibold ${timeRange===r? 'bg-foreground text-background' : 'bg-secondary/60 text-muted-foreground hover:text-foreground'}`}>{r}</button>
        ))}
        <div className="relative ml-2">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/40" />
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search..."
            className="h-8 pl-8 pr-3 text-xs bg-secondary/60 border border-border/50 rounded-md focus:outline-none focus:border-foreground/20 w-44" />
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <select value={vertical} onChange={e=>setVertical(e.target.value)} className="h-8 px-2 text-xs rounded-md border border-border/50 bg-background">
          {['all','payments','shipping','saas'].map(v => <option key={v} value={v}>{v==='all'?'All verticals':v}</option>)}
        </select>
        <select value={providerId} onChange={e=>setProviderId(e.target.value)} className="h-8 px-2 text-xs rounded-md border border-border/50 bg-background">
          <option value="all">All providers</option>
          {providers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select value={country} onChange={e=>setCountry(e.target.value)} className="h-8 px-2 text-xs rounded-md border border-border/50 bg-background">
          <option value="all">All countries</option>
          {countries.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={stage} onChange={e=>setStage(e.target.value)} className="h-8 px-2 text-xs rounded-md border border-border/50 bg-background">
          <option value="all">All stages</option>
          {stages.map(s => <option key={s} value={s}>{s.replace('_',' ')}</option>)}
        </select>
        <select value={status} onChange={e=>setStatus(e.target.value)} className="h-8 px-2 text-xs rounded-md border border-border/50 bg-background">
          <option value="all">All status</option>
          {statuses.map(s => <option key={s} value={s}>{s.replace('_',' ')}</option>)}
        </select>

        <div className="hidden md:flex items-center gap-2 ml-2">
          {[{key:'applications',label:'Review Applications'},{key:'deal',label:'Create Deal'},{key:'followup',label:'Send Follow-up'},{key:'invoice',label:'Generate Invoice'},{key:'pipeline',label:'View Full Pipeline'}].map(a=> (
            <button key={a.key} onClick={()=>onQuickAction?.(a.key)} className="h-8 px-3 rounded-md text-xs bg-secondary/60 hover:bg-secondary border border-border/50">{a.label}</button>
          ))}
        </div>
      </div>
    </div>
  );
}