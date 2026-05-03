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
import InsuranceSection from "@/components/landing/InsuranceSection.jsx";

export default function Landing() {
  return (
    <div className="min-h-screen bg-background font-inter relative">
      {/* Header estático y público (sin Navbar ni auth) */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-xl border-b border-border/40">
        <div className="max-w-6xl mx-auto px-5 h-14 flex items-center justify-between">
          <a href="/" aria-label="CAMBRA" className="text-sm font-black tracking-[0.14em]">CAMBRA</a>
          <nav className="hidden md:flex items-center gap-6 text-sm">
            <a href="#how" className="text-muted-foreground hover:text-foreground transition-colors">How it works</a>
            <a href="/Analyzer" className="text-muted-foreground hover:text-foreground transition-colors">Analyzer</a>
            <a href="/Onboarding" className="text-muted-foreground hover:text-foreground transition-colors">Join</a>
          </nav>
        </div>
      </header>

      <main className="sm:text-center md:text-center lg:text-left">
        <HeroSection_Public />
        <CredibilitySection />
        <ValuePropositionSection />
        <FeatureDuoSection />
        <div id="how"><HowCombinedSection /></div>
        <ThreeLayersSection />
        <ProblemSection_Public />
        <AnalyzerCTA_Public />
        <InsuranceSection />
        <PricingSection />
        <IntegrationsSection />
        <BenefitsSection />
        <TestimonialsSection />
      </main>

      <FooterSection />
    </div>
  );
}