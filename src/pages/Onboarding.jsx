import { useEffect, useState } from 'react';
import { TabsContent } from '@/components/ui/tabs';
import OnboardingLayout from '@/components/onboarding/OnboardingLayout';
import OnboardingHero from '@/components/onboarding/OnboardingHero.jsx';
import StepGrid from '@/components/onboarding/StepGrid.jsx';
import PaymentsModule from '@/components/onboarding/PaymentsModule';
import ShippingModule from '@/components/onboarding/ShippingModule';
import SaasModule from '@/components/onboarding/SaasModule';
import BankingModule from '@/components/onboarding/BankingModule';
import InsuranceModule from '@/components/onboarding/InsuranceModule';
import TelecomModule from '@/components/onboarding/TelecomModule';
import FinanceOpsModule from '@/components/onboarding/FinanceOpsModule';
import HRInfraModule from '@/components/onboarding/HRInfraModule';
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
      <div className="pt-16">
        <OnboardingLayout activeTab={tab} onTabChange={(v)=>{ setTab(v); if(v!=='general') load(); }} statuses={statuses}>
          <TabsContent value="general">
            <div className="space-y-6">
              <OnboardingHero statuses={statuses} />
              <StepGrid statuses={statuses} />
            </div>
          </TabsContent>
          <TabsContent value="payments">
            <div className="space-y-6">
              <PaymentsModule />
            </div>
          </TabsContent>
          <TabsContent value="shipping">
            <div className="space-y-6">
              <ShippingModule />
            </div>
          </TabsContent>
          <TabsContent value="saas">
            <div className="space-y-6">
              <SaasModule />
            </div>
          </TabsContent>
          <TabsContent value="banking">
            <div className="space-y-6">
              <BankingModule />
            </div>
          </TabsContent>
          <TabsContent value="insurance">
            <div className="space-y-6">
              <InsuranceModule />
            </div>
          </TabsContent>
          <TabsContent value="telecom">
            <div className="space-y-6">
              <TelecomModule />
            </div>
          </TabsContent>
          <TabsContent value="finance">
            <div className="space-y-6">
              <FinanceOpsModule />
            </div>
          </TabsContent>
          <TabsContent value="hr">
            <div className="space-y-6">
              <HRInfraModule />
            </div>
          </TabsContent>
        </OnboardingLayout>
      </div>
    </>
  );
}