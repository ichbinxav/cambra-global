import { useEffect, useState } from 'react';
import { TabsContent } from '@/components/ui/tabs';
import OnboardingLayout from '@/components/onboarding/OnboardingLayout';
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
        <div className="space-y-4">
          <div className="mb-2">
            <h1 className="text-2xl font-black tracking-[-0.03em]">Bienvenido</h1>
            <p className="text-sm text-muted-foreground">Completa estos 3 pasos para empezar a ahorrar.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="p-4 rounded-xl border border-border/50 bg-card">
              <div className="flex items-center gap-2 mb-2">
                <TrendingDown size={14} className="text-chart-1" />
                <p className="text-sm font-semibold">Ejecuta el Analizador</p>
              </div>
              <p className="text-xs text-muted-foreground mb-3">Obtén tu potencial de ahorro en 2 minutos.</p>
              <Link to="/Analyzer">
                <Button className="h-8 text-xs rounded-full gap-1.5">
                  Ir al Analizador <ArrowRight size={12} />
                </Button>
              </Link>
            </div>

            <div className="p-4 rounded-xl border border-border/50 bg-card">
              <div className="flex items-center gap-2 mb-2">
                <Zap size={14} className="text-chart-2" />
                <p className="text-sm font-semibold">Conecta tus datos</p>
              </div>
              <p className="text-xs text-muted-foreground mb-3">Precisión y verificación automática.</p>
              <Link to="/ConnectTools">
                <Button variant="outline" className="h-8 text-xs rounded-full gap-1.5">
                  Conectar herramientas <ArrowRight size={12} />
                </Button>
              </Link>
            </div>

            <div className="p-4 rounded-xl border border-border/50 bg-card">
              <div className="flex items-center gap-2 mb-2">
                <Building2 size={14} className="text-chart-3" />
                <p className="text-sm font-semibold">Perfil de marca</p>
              </div>
              <p className="text-xs text-muted-foreground mb-3">Cuéntanos lo básico de tu negocio.</p>
              <Button onClick={handleScrollToProfile} variant="ghost" className="h-8 text-xs rounded-full gap-1.5">
                Completar perfil <ArrowRight size={12} />
              </Button>
            </div>
          </div>

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