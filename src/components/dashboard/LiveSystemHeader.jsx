import { useState, useEffect } from 'react';
import { TrendingDown, AlertCircle, Activity } from 'lucide-react';

const TICKERS = [
  { label: 'PSP effective rate', value: '1.48%', metric: 'vs peer 1.42%', delta: '+0.06pp', icon: TrendingDown },
  { label: 'Shipping / order', value: '€0.94', metric: 'vs peer €0.82', delta: '+€0.12', icon: Activity },
  { label: 'SaaS overlap', value: '2 tools', metric: 'duplicated', delta: '€400/mo', icon: AlertCircle },
];

export default function LiveSystemHeader() {
  const [activeIdx, setActiveIdx] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setActiveIdx(i => (i + 1) % TICKERS.length);
    }, 4000);
    return () => clearInterval(timer);
  }, []);

  const t = TICKERS[activeIdx];
  const Icon = t.icon;

  return (
    <div className="border-b border-border/40 bg-card/50 backdrop-blur-sm sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between">
        {/* Logo / Brand */}
        <span className="text-xs font-mono font-bold text-muted-foreground/60 tracking-wider">INFRASTRUCTURE LIVE</span>

        {/* Ticker */}
        <div className="flex-1 mx-8 flex items-center gap-3 min-h-8">
          <div className="w-1.5 h-1.5 rounded-full bg-chart-1 animate-pulse" />
          <div className="min-w-0">
            <div className="text-xs font-semibold text-foreground/80 truncate">{t.label}</div>
            <div className="text-[11px] text-muted-foreground/50 flex items-center gap-2">
              <span className="font-mono font-bold text-foreground/70">{t.value}</span>
              <span>·</span>
              <span>{t.metric}</span>
            </div>
          </div>
        </div>

        {/* Indicator dots */}
        <div className="flex items-center gap-1.5">
          {TICKERS.map((_, i) => (
            <button
              key={i}
              onClick={() => setActiveIdx(i)}
              className={`h-1 rounded-full transition-all ${
                i === activeIdx ? 'w-6 bg-foreground' : 'w-1 bg-border/60'
              }`}
              aria-label={`View metric ${i + 1}`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}