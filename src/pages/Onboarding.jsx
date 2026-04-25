import { useEffect, useState } from 'react';
import { TabsContent } from '@/components/ui/tabs';
import OnboardingLayout from '@/components/onboarding/OnboardingLayout';
import OnboardingHero from '@/components/onboarding/OnboardingHero.jsx';
import StepGrid from '@/components/onboarding/StepGrid.jsx';
import PaymentsModule from '@/components/onboarding/PaymentsModule';
import ShippingModule from '@/components/onboarding/ShippingModule';
import SaasModule from '@/components/onboarding/SaasModule';
import { base44 } from '@/api/base44Client';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { TrendingDown, Zap, Building2, ArrowRight } from 'lucide-react';
import Navbar from '@/components/landing/Navbar';

export default function Onboarding(){
  const [tab, setTab] = useState('general');
  const [statuses, setStatuses] = useState(null);

  const load = async () => {
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
              <OnboardingHero />
              <StepGrid />
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
        </OnboardingLayout>
      </div>
    </>
  );
}