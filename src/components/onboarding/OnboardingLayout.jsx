import { useEffect, useState } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { base44 } from '@/api/base44Client';
import { Building2, CreditCard, Truck, Package, ArrowRight, Zap } from 'lucide-react';

export default function OnboardingLayout({ children, activeTab, onTabChange, statuses }){
  const total = ['payments','shipping','saas'];
  const done = total.filter(v => (statuses?.[v]?.completeness||0) >= 70).length;
  const overall = Math.round((done/total.length)*100);

  return (
    <div className="p-5 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-black tracking-tight">Onboarding</h1>
          <p className="text-xs text-muted-foreground">Complete the key blocks to improve the analysis and recommendations.</p>
        </div>
        <div className="w-56">
          <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-1"><span>Overall progress</span><span>{overall}%</span></div>
          <Progress value={overall} />
        </div>
      </div>

      <div className="relative overflow-hidden rounded-2xl border border-border/60 bg-gradient-to-r from-chart-1/15 via-secondary/40 to-chart-2/15 p-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-chart-1" />
            <p className="text-sm font-semibold">Complete your onboarding</p>
          </div>
          <p className="text-xs text-muted-foreground">Visit each tab and add your info to get precise benchmarks.</p>
        </div>

      </div>

      <Tabs value={activeTab} onValueChange={onTabChange}>
        <TabsList>
          <TabsTrigger value="general"><span className="inline-flex items-center gap-1.5"><Building2 className="h-3.5 w-3.5 text-muted-foreground" /><span>General</span></span></TabsTrigger>
          <TabsTrigger value="payments"><span className="inline-flex items-center gap-1.5"><CreditCard className="h-3.5 w-3.5 text-chart-1" /><span>Payments</span>{statuses?.payments && <span className="ml-1 text-[10px] opacity-70">{statuses.payments.completeness}%</span>}</span></TabsTrigger>
          <TabsTrigger value="shipping"><span className="inline-flex items-center gap-1.5"><Truck className="h-3.5 w-3.5 text-chart-2" /><span>Shipping</span>{statuses?.shipping && <span className="ml-1 text-[10px] opacity-70">{statuses.shipping.completeness}%</span>}</span></TabsTrigger>
          <TabsTrigger value="saas"><span className="inline-flex items-center gap-1.5"><Package className="h-3.5 w-3.5 text-chart-3" /><span>SaaS</span>{statuses?.saas && <span className="ml-1 text-[10px] opacity-70">{statuses.saas.completeness}%</span>}</span></TabsTrigger>
        </TabsList>
        {children}
      </Tabs>
    </div>
  );
}