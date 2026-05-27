import { Link } from "react-router-dom";
import { ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AreaChart, Area, ResponsiveContainer, Tooltip } from "recharts";

export default function SavingsTrend({ chartData }) {
  return (
    <div className="group relative p-6 rounded-2xl border border-border/60 bg-card/95 backdrop-blur-sm overflow-hidden transition-all hover:-translate-y-0.5 hover:shadow-[0_18px_40px_-16px_rgba(0,0,0,0.12)]">
      <div className="pointer-events-none absolute -top-20 -right-20 w-52 h-52 rounded-full blur-3xl opacity-40 group-hover:opacity-70 transition-opacity"
           style={{ background: "radial-gradient(closest-side, rgba(31,78,216,0.30), transparent)" }} />
      <div className="relative">
        <div className="flex items-center justify-between mb-4">
          <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground/70 font-semibold">Savings trend</p>
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
                <stop offset="0%" stopColor="#1F4ED8" stopOpacity={0.35} />
                <stop offset="100%" stopColor="#2CA7C1" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="sgStroke" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#1F4ED8" />
                <stop offset="100%" stopColor="#2CA7C1" />
              </linearGradient>
            </defs>
            <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid hsl(var(--border))", fontSize: 11, background: "hsl(var(--card))" }}
              formatter={v => [`€${v?.toLocaleString()}/yr`, ""]} />
            <Area type="monotone" dataKey="value" stroke="url(#sgStroke)" strokeWidth={2.5} fill="url(#sg)" dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}