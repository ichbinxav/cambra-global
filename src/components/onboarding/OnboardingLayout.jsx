import { useEffect, useState } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { base44 } from '@/api/base44Client';
import { Building2, CreditCard, Truck, Package } from 'lucide-react';

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

      <div className="p-3 rounded-xl border border-border/60 bg-secondary/40">
        <p className="text-xs text-muted-foreground mb-2">
          Para completar el onboarding, navega por las 4 pestañas y rellena la información en cada una.
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {[
            { key: 'general', label: 'General', icon: Building2 },
            { key: 'payments', label: 'Payments', icon: CreditCard },
            { key: 'shipping', label: 'Shipping', icon: Truck },
            { key: 'saas', label: 'SaaS', icon: Package },
          ].map(s => {
            const percent = s.key === 'general' ? (statuses?.general?.completeness ?? 0) : (statuses?.[s.key]?.completeness ?? 0);
            const done = percent >= 70;
            const Icon = s.icon;
            return (
              <button
                key={s.key}
                type="button"
                onClick={() => onTabChange(s.key)}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg border transition-colors text-xs ${activeTab===s.key ? 'border-foreground text-foreground bg-background' : 'border-border/60 text-muted-foreground hover:border-foreground/30 hover:text-foreground'}`}
              >
                <span className="inline-flex items-center gap-2">
                  <Icon className="h-3.5 w-3.5" />
                  <span>{s.label}</span>
                </span>
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border ${done ? 'bg-green-500/10 border-green-500/30 text-green-600' : 'bg-secondary/60 border-border/60 text-muted-foreground'}`}>
                  {percent || 0}%
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={onTabChange}>
        <TabsList>
          <TabsTrigger value="general"><span className="inline-flex items-center gap-1.5"><Building2 className="h-3.5 w-3.5" /><span>General</span></span></TabsTrigger>
          <TabsTrigger value="payments"><span className="inline-flex items-center gap-1.5"><CreditCard className="h-3.5 w-3.5" /><span>Payments</span>{statuses?.payments && <span className="ml-1 text-[10px] opacity-70">{statuses.payments.completeness}%</span>}</span></TabsTrigger>
          <TabsTrigger value="shipping"><span className="inline-flex items-center gap-1.5"><Truck className="h-3.5 w-3.5" /><span>Shipping</span>{statuses?.shipping && <span className="ml-1 text-[10px] opacity-70">{statuses.shipping.completeness}%</span>}</span></TabsTrigger>
          <TabsTrigger value="saas"><span className="inline-flex items-center gap-1.5"><Package className="h-3.5 w-3.5" /><span>SaaS</span>{statuses?.saas && <span className="ml-1 text-[10px] opacity-70">{statuses.saas.completeness}%</span>}</span></TabsTrigger>
        </TabsList>
        {children}
      </Tabs>
    </div>
  );
}