import { useEffect, useState } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { base44 } from '@/api/base44Client';

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

      <Tabs value={activeTab} onValueChange={onTabChange}>
        <TabsList>
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="payments">Payments {statuses?.payments && <span className="ml-1 text-[10px] opacity-70">{statuses.payments.completeness}%</span>}</TabsTrigger>
          <TabsTrigger value="shipping">Shipping {statuses?.shipping && <span className="ml-1 text-[10px] opacity-70">{statuses.shipping.completeness}%</span>}</TabsTrigger>
          <TabsTrigger value="saas">SaaS {statuses?.saas && <span className="ml-1 text-[10px] opacity-70">{statuses.saas.completeness}%</span>}</TabsTrigger>
        </TabsList>
        {children}
      </Tabs>
    </div>
  );
}