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
import "@/styles/landing-centered.css";

// ForLifestyleSection removed — replaced by brand-aligned sections

export default function Landing() {
  return (
    <div className="min-h-screen bg-background font-inter">

      <Navbar />
      <main className="landing-centered flex flex-col items-center text-center">
      <main className="landing-centered flex flex-col items-center text-center">
        <HeroSection />
        <div id="how"><HowCombinedSection /></div>
        <ThreeLayersSection />
        <ProblemSection />
        <AnalyzerCTA />
        <IntegrationsSection />
        <BenefitsSection />
        <TestimonialsSection />
        <PricingSection />
        <FooterSection />
      </main>
      </main>
    </div>
  );
}