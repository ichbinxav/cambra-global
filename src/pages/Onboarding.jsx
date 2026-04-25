import { useEffect, useState } from 'react';
import { TabsContent } from '@/components/ui/tabs';
import OnboardingLayout from '@/components/onboarding/OnboardingLayout';
import OnboardingHero from '@/components/onboarding/OnboardingHero.jsx';
import StepGrid from '@/components/onboarding/StepGrid.jsx';
import CompanyBlock from '@/components/onboarding/CompanyBlock';
import PaymentsModule from '@/components/onboarding/PaymentsModule';
import ShippingModule from '@/components/onboarding/ShippingModule';
import SaasModule from '@/components/onboarding/SaasModule';
import { base44 } from '@/api/base44Client';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { TrendingDown, Zap, Building2, ArrowRight } from 'lucide-react';

export default function Onboarding(){
  const [tab, setTab] = useState('general');
  const [statuses, setStatuses] = useState(null);

  const load = async () => {
    const res = await base44.functions.invoke('getOnboardingStatus', {});
    setStatuses(res.data?.statuses || {});
  };

  const handleScrollToProfile = () => {
    setTab('general');
    setTimeout(() => {
      const el = document.getElementById('brand-profile');
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 0);
  };

  useEffect(()=>{ load(); },[]);

  return (
    <OnboardingLayout activeTab={tab} onTabChange={(v)=>{ setTab(v); if(v!=='general') load(); }} statuses={statuses}>
      <TabsContent value="general">
        <div className="space-y-6">
          <OnboardingHero />
          <StepGrid onScrollToProfile={handleScrollToProfile} />
          <div id="brand-profile">
            <CompanyBlock />
          </div>
        </div>
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