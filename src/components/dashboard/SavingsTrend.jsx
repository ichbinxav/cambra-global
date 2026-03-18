import { Link } from "react-router-dom";
import { ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AreaChart, Area, ResponsiveContainer, Tooltip } from "recharts";

export default function SavingsTrend({ chartData }) {
  return (
    <div className="p-6 rounded-2xl border border-border/50 bg-card">
      <div className="flex items-center justify-between mb-4">
        <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground/50">Savings trend</p>
        <Link to="/Reports">
          <Button variant="ghost" size="sm" className="h-6 text-[11px] text-muted-foreground p-0 gap-1 hover:text-foreground">
            All reports <ArrowUpRight size={10} />
          </Button>
        </Link>
      </div>
      <ResponsiveContainer width="100%" height={80}>
        <AreaChart data={chartData}>
          <defs>
            <linearGradient id="sg" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="hsl(215,100%,50%)" stopOpacity={0.15} />
              <stop offset="100%" stopColor="hsl(215,100%,50%)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid hsl(var(--border))", fontSize: 11, background: "hsl(var(--card))" }}
            formatter={v => [`€${v?.toLocaleString()}/yr`, ""]} />
          <Area type="monotone" dataKey="value" stroke="hsl(215,100%,50%)" strokeWidth={2} fill="url(#sg)" dot={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}