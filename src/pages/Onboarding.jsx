import { useEffect, useState } from 'react';
import { TabsContent } from '@/components/ui/tabs';
import OnboardingLayout from '@/components/onboarding/OnboardingLayout';
import StepGrid from '@/components/onboarding/StepGrid.jsx';
import PaymentsModule from '@/components/onboarding/PaymentsModule';
// FASE 1.3 — ShippingModule + SaasModule deprecated (payments-only phase).
import { base44 } from '@/api/base44Client';
import Navbar from '@/components/landing/Navbar';

export default function Onboarding(){
  const [tab, setTab] = useState('general');
  const [statuses, setStatuses] = useState(null);

  const load = async () => {
    const authed = await base44.auth.isAuthenticated();
    if (!authed) {
      setStatuses({});
      return;
    }
    const res = await base44.functions.invoke('getOnboardingStatus', {});
    setStatuses(res.data?.statuses || {});
  };


  useEffect(()=>{ load(); },[]);

  return (
    <>
      <Navbar />
      <div className="relative pt-16 min-h-screen overflow-hidden">
        {/* Ambient backdrop */}
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute inset-0 dot-grid opacity-40" />
          <div className="absolute -top-32 right-1/4 w-[36rem] h-[36rem] rounded-full blur-3xl bg-ambient-lilac opacity-[0.15]" />
          <div className="absolute top-1/3 -left-32 w-[30rem] h-[30rem] rounded-full blur-3xl bg-ambient-mint opacity-[0.12]" />
        </div>
        <div className="relative">
        <OnboardingLayout activeTab={tab} onTabChange={(v)=>{ setTab(v); if(v!=='general') load(); }} statuses={statuses}>
          <TabsContent value="general">
            <div className="space-y-5">
              <StepGrid statuses={statuses} />
            </div>
          </TabsContent>
          <TabsContent value="payments">
            <div className="space-y-6">
              <PaymentsModule />
            </div>
          </TabsContent>
        </OnboardingLayout>
        </div>
      </div>
    </>
  );
}