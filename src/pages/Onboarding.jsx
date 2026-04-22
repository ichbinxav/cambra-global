import { useEffect, useState } from 'react';
import { TabsContent } from '@/components/ui/tabs';
import OnboardingLayout from '@/components/onboarding/OnboardingLayout';
import CompanyBlock from '@/components/onboarding/CompanyBlock';
import PaymentsModule from '@/components/onboarding/PaymentsModule';
import ShippingModule from '@/components/onboarding/ShippingModule';
import SaasModule from '@/components/onboarding/SaasModule';
import { base44 } from '@/api/base44Client';

export default function Onboarding(){
  const [tab, setTab] = useState('general');
  const [statuses, setStatuses] = useState(null);

  const load = async () => {
    const res = await base44.functions.invoke('getOnboardingStatus', {});
    setStatuses(res.data?.statuses || {});
  };

  useEffect(()=>{ load(); },[]);

  return (
    <OnboardingLayout activeTab={tab} onTabChange={(v)=>{ setTab(v); if(v!=='general') load(); }} statuses={statuses}>
      <TabsContent value="general">
        <CompanyBlock />
      </TabsContent>
      <TabsContent value="payments">
        <PaymentsModule />
      </TabsContent>
      <TabsContent value="shipping">
        <ShippingModule />
      </TabsContent>
      <TabsContent value="saas">
        <SaasModule />
      </TabsContent>
    </OnboardingLayout>
  );
}