import { Search } from "lucide-react";

const STATUSES = [
  "all",
  "queued",
  "running",
  "waiting_approval",
  "completed",
  "failed",
  "retrying",
  "cancelled",
];

export default function ActivityFilters({
  status, onStatusChange,
  agent, onAgentChange,
  brandQuery, onBrandQueryChange,
  agentOptions = [],
  totalCount = 0,
}) {
  return (
    <div className="rounded-2xl border border-border/60 bg-white p-4">
      <div className="flex flex-wrap items-center gap-3">
        {/* Status pills */}
        <div className="flex flex-wrap gap-1.5">
          {STATUSES.map(s => (
            <button
              key={s}
              type="button"
              onClick={() => onStatusChange(s)}
              className={`px-2.5 py-1 rounded-full text-[11px] font-bold border transition-colors ${
                status === s
                  ? "bg-foreground text-background border-foreground"
                  : "bg-white text-muted-foreground border-border/60 hover:text-foreground"
              }`}
            >
              {s.replace("_", " ")}
            </button>
          ))}
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          {/* Agent dropdown */}
          <select
            value={agent}
            onChange={(e) => onAgentChange(e.target.value)}
            className="h-8 px-2.5 rounded-lg border border-border/60 bg-white text-xs font-semibold text-foreground"
          >
            <option value="all">All agents</option>
            {agentOptions.map(a => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>

          {/* Brand search */}
          <div className="relative">
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={brandQuery}
              onChange={(e) => onBrandQueryChange(e.target.value)}
              placeholder="Filter by brand id…"
              className="h-8 pl-7 pr-3 rounded-lg border border-border/60 bg-white text-xs font-semibold text-foreground w-52"
            />
          </div>

          <span className="text-[11px] text-muted-foreground tabular-nums">
            {totalCount} task{totalCount === 1 ? "" : "s"}
          </span>
        </div>
      </div>
    </div>
  );
}