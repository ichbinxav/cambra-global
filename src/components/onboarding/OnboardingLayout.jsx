import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { Building2, CreditCard, Truck, Package, Zap } from 'lucide-react';

export default function OnboardingLayout({ children, activeTab, onTabChange, statuses }){
  const total = ['payments','logistics','saas'];
  const done = total.filter(v => (statuses?.[v]?.completeness||0) >= 70).length;
  const overall = Math.round((done/total.length)*100);

  const tabs = [
    { value: 'general', label: 'General', icon: Building2, color: 'text-muted-foreground' },
    { value: 'payments', label: 'Payments', icon: CreditCard, color: 'text-chart-1' },
    { value: 'logistics', label: 'Logistics', icon: Truck, color: 'text-chart-2' },
    { value: 'saas', label: 'Commerce SaaS', icon: Package, color: 'text-chart-3' },
  ];

  return (
    <div className="max-w-[1400px] mx-auto px-5 py-6 space-y-5">
      <div className="relative overflow-hidden rounded-2xl border border-border/60 bg-card p-6 sm:p-8">
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <div className="inline-flex items-center gap-2 mb-3 px-2.5 py-1.5 rounded-full border border-border/60 bg-card">
              <Zap className="h-3 w-3 text-foreground" />
              <span className="text-[10px] font-bold tracking-[0.22em] uppercase text-muted-foreground">Infrastructure profile · 3 pillars</span>
            </div>
            <h1 className="font-display text-[clamp(2rem,4.5vw,3rem)] font-black tracking-[-0.04em] leading-[0.95] text-foreground">
              Map your operating stack.
            </h1>
            <p className="text-sm text-muted-foreground mt-2 max-w-xl">Each pillar you complete sharpens benchmarks and unlocks deeper margin intelligence across Payments, Logistics & Commerce SaaS.</p>
          </div>
          <div className="w-full sm:w-56 shrink-0">
            <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-1.5">
              <span className="font-semibold">Overall coverage</span>
              <span className="font-bold tabular-nums">{overall}%</span>
            </div>
            <Progress value={overall} />
          </div>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={onTabChange}>
        <TabsList className="flex flex-wrap h-auto gap-1 p-1">
          {tabs.map(tab => (
            <TabsTrigger key={tab.value} value={tab.value} className="h-8">
              <span className="inline-flex items-center gap-1.5">
                <tab.icon className={`h-3.5 w-3.5 ${tab.color}`} />
                <span>{tab.label}</span>
                {statuses?.[tab.value] && <span className="ml-1 text-[10px] opacity-70">{statuses[tab.value].completeness}%</span>}
              </span>
            </TabsTrigger>
          ))}
        </TabsList>
        {children}
      </Tabs>
    </div>
  );
}