import HeroSection_Public from "@/components/landing/HeroSection_Public.jsx";
import ThreeLayersSection from "@/components/landing/ThreeLayersSection";
import ProblemSection_Public from "@/components/landing/ProblemSection_Public.jsx";
import HowCombinedSection from "@/components/landing/HowCombinedSection.jsx";
import IntegrationsSection from "@/components/landing/IntegrationsSection";
import BenefitsSection from "@/components/landing/BenefitsSection";
import TestimonialsSection from "@/components/landing/TestimonialsSection";
import PricingSection from "@/components/landing/PricingSection";
import CredibilitySection from "@/components/landing/CredibilitySection";
import ValuePropositionSection from "@/components/landing/ValuePropositionSection";
import FeatureDuoSection from "@/components/landing/FeatureDuoSection";
import FooterSection from "@/components/landing/FooterSection";
import AnalyzerCTA_Public from "@/components/landing/AnalyzerCTA_Public.jsx";
import Navbar from "@/components/landing/Navbar";

export default function Landing() {
  return (
    <div className="min-h-screen bg-background font-inter relative">
      <Navbar />

      <main>
        <HeroSection_Public />
        <CredibilitySection />
        <ValuePropositionSection />
        <FeatureDuoSection />
        <div id="how-it-works">
          <HowCombinedSection />
        </div>
        <div id="how">
          <ThreeLayersSection />
        </div>
        <ProblemSection_Public />
        <AnalyzerCTA_Public />
        <div id="pricing">
          <PricingSection />
        </div>
        <IntegrationsSection />
        <BenefitsSection />
        <TestimonialsSection />
      </main>

      <FooterSection />
    </div>
  );
}