import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { Building2, CreditCard, Truck, Package, Zap, Banknote, ShieldCheck, Wifi, Calculator, Users } from 'lucide-react';

export default function OnboardingLayout({ children, activeTab, onTabChange, statuses }){
  const total = ['payments','shipping','saas','banking','insurance','telecom','finance','hr'];
  const done = total.filter(v => (statuses?.[v]?.completeness||0) >= 70).length;
  const overall = Math.round((done/total.length)*100);

  const tabs = [
    { value: 'general', label: 'General', icon: Building2, color: 'text-muted-foreground' },
    { value: 'payments', label: 'Payments', icon: CreditCard, color: 'text-chart-1' },
    { value: 'shipping', label: 'Shipping', icon: Truck, color: 'text-chart-2' },
    { value: 'saas', label: 'SaaS', icon: Package, color: 'text-chart-3' },
    { value: 'banking', label: 'Banking', icon: Banknote, color: 'text-amber-500' },
    { value: 'insurance', label: 'Insurance', icon: ShieldCheck, color: 'text-green-600' },
    { value: 'telecom', label: 'Telecom', icon: Wifi, color: 'text-cyan-500' },
    { value: 'finance', label: 'Finance Ops', icon: Calculator, color: 'text-yellow-500' },
    { value: 'hr', label: 'HR Infra', icon: Users, color: 'text-pink-500' },
  ];

  return (
    <div className="p-5 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-black tracking-tight">Infrastructure Profile</h1>
          <p className="text-xs text-muted-foreground">Map your full operational stack across all 8 verticals for precise intelligence.</p>
        </div>
        <div className="w-56">
          <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-1"><span>Overall coverage</span><span>{overall}%</span></div>
          <Progress value={overall} />
        </div>
      </div>

      <div className="relative overflow-hidden rounded-2xl border border-border/60 bg-gradient-to-r from-chart-1/15 via-secondary/40 to-chart-2/15 p-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-chart-1" />
            <p className="text-sm font-semibold">Profile your full infrastructure</p>
          </div>
          <p className="text-xs text-muted-foreground">Each vertical you complete unlocks deeper intelligence and benchmarks.</p>
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