import Navbar from "@/components/landing/Navbar";
import HeroSection from "@/components/landing/HeroSection";
import ThreeLayersSection from "@/components/landing/ThreeLayersSection";
import ProblemSection from "@/components/landing/ProblemSection";
import AnalyzerCTA from "@/components/landing/AnalyzerCTA";
import HowCombinedSection from "@/components/landing/HowCombinedSection.jsx";
import IntegrationsSection from "@/components/landing/IntegrationsSection";
import BenefitsSection from "@/components/landing/BenefitsSection";
import TestimonialsSection from "@/components/landing/TestimonialsSection";
import PricingSection from "@/components/landing/PricingSection";
import FooterSection from "@/components/landing/FooterSection";
import { useI18n, setPageMeta } from "@/lib/i18n.jsx";

// ForLifestyleSection removed — replaced by brand-aligned sections

export default function Landing() {
  const { t } = useI18n();
  // localized metadata
  setPageMeta(t('landing.seo_title', { default: 'THE NoDE — Infrastructure leverage' }), t('landing.seo_desc', { default: 'Unlock structural rates on payments, shipping, and SaaS.' }));
  return (
    <div className="min-h-screen bg-background font-inter">
      <Navbar />
      <main className="sm:text-center md:text-center lg:text-left">
        <HeroSection />
        <div id="how"><HowCombinedSection /></div>
        <ThreeLayersSection />
        <ProblemSection />
        <AnalyzerCTA />
        <IntegrationsSection />
        <BenefitsSection />
        <TestimonialsSection />
        <PricingSection />
      </main>
      <FooterSection />
    </div>
  );
}